import { db } from './db';
import { extractPlainText, stableHashString } from './semanticUtils';
import type { HybridDocType, HybridSearchRow } from './hybridPglite';

export type HybridSearchResult = {
	type: HybridDocType;
	id: string;
	title: string;
	subtitle: string;
	preview: string;
	score: number;
};

function firstWords(text: string, maxWords: number): string {
	const s = String(text || '').trim();
	if (!s) return '';
	const tokens = s.split(/\s+/).filter(Boolean);
	return tokens.slice(0, Math.max(0, maxWords)).join(' ');
}

function rrfMerge(params: {
	fts: Array<{ key: string; rank: number }>;
	vec: Array<{ key: string; rank: number }>;
	k?: number;
	wFts?: number;
	wVec?: number;
}): Map<string, number> {
	const k = params.k ?? 60;
	const wFts = params.wFts ?? 1;
	const wVec = params.wVec ?? 1;
	const out = new Map<string, number>();
	for (const { key, rank } of params.fts) {
		out.set(key, (out.get(key) || 0) + wFts * (1 / (k + rank)));
	}
	for (const { key, rank } of params.vec) {
		out.set(key, (out.get(key) || 0) + wVec * (1 / (k + rank)));
	}
	return out;
}

function docKey(t: string, id: string): string {
	return `${t}::${id}`;
}

async function upsertDoc(params: {
	type: HybridDocType;
	id: string;
	title: string;
	subtitle: string;
	content: string;
	updatedAt: number;
}): Promise<void> {
	const { getHybridPg } = await import('./hybridPglite');
	const { embedTextHybrid } = await import('./hybridEmbedder');
	const pg = await getHybridPg();
	const q = (pg as any).query.bind(pg) as <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[] }>;
	const title = params.title || '';
	const subtitle = params.subtitle || '';
	const content = params.content || '';
	const combined = `${title}\n${subtitle}\n\n${content}`.trim();
	const contentHash = await stableHashString(combined);

	const existing = await q<{ content_hash: string }>(
		`SELECT content_hash FROM hybrid_docs WHERE doc_type = $1 AND doc_id = $2`,
		[params.type, params.id],
	);
	const prevHash = existing.rows[0]?.content_hash;
	if (prevHash && prevHash === contentHash) {
		await q(
			`UPDATE hybrid_docs SET title = $3, subtitle = $4, content = $5, updated_at = $6 WHERE doc_type = $1 AND doc_id = $2`,
			[params.type, params.id, title, subtitle, content, params.updatedAt],
		);
		await q(
			`INSERT INTO hybrid_fts(doc_type, doc_id, title, subtitle, content)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (doc_type, doc_id)
			 DO UPDATE SET title = excluded.title, subtitle = excluded.subtitle, content = excluded.content`,
			[params.type, params.id, title, subtitle, content],
		);
		return;
	}

	const emb = await embedTextHybrid(combined);

	await q(
		`INSERT INTO hybrid_docs(doc_type, doc_id, title, subtitle, content, updated_at, content_hash, embed_model_id, embed_dims, embed)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 ON CONFLICT (doc_type, doc_id)
		 DO UPDATE SET
		   title = excluded.title,
		   subtitle = excluded.subtitle,
		   content = excluded.content,
		   updated_at = excluded.updated_at,
		   content_hash = excluded.content_hash,
		   embed_model_id = excluded.embed_model_id,
		   embed_dims = excluded.embed_dims,
		   embed = excluded.embed`,
		[params.type, params.id, title, subtitle, content, params.updatedAt, contentHash, emb.modelId, emb.dims, emb.vector],
	);

	await q(
		`INSERT INTO hybrid_fts(doc_type, doc_id, title, subtitle, content)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (doc_type, doc_id)
		 DO UPDATE SET title = excluded.title, subtitle = excluded.subtitle, content = excluded.content`,
		[params.type, params.id, title, subtitle, content],
	);
}

export async function hybridIndexAll(): Promise<void> {
	const questions = await db.questions.toArray();
	const songs = await db.songs.toArray();
	const modules = await db.modules.toArray();
	const courses = await db.storyCourses.toArray();

	for (const q of questions) {
		const plain = extractPlainText(q.text || '').trim();
		const explanation = extractPlainText(q.explanation || '').trim();
		const body = `${plain}${explanation ? `\n\nExplanation: ${explanation}` : ''}`.trim();
		await upsertDoc({
			type: 'question',
			id: q.id,
			title: q.code ? `Question ${q.code}` : 'Question',
			subtitle: (q.tags || []).slice(0, 4).join(', '),
			content: body,
			updatedAt: q.metadata?.updatedAt || q.metadata?.createdAt || Date.now(),
		});
	}

	for (const s of songs) {
		await upsertDoc({
			type: 'song',
			id: s.id,
			title: s.title || '',
			subtitle: `${s.singer || ''}${s.writer ? ` • ${s.writer}` : ''}`.trim(),
			content: (s.lyrics || '').trim(),
			updatedAt: s.updatedAt || s.createdAt || Date.now(),
		});
	}

	for (const m of modules) {
		await upsertDoc({
			type: 'module',
			id: m.id,
			title: m.title || '',
			subtitle: `${m.type || ''}${(m.tags || []).length ? ` • ${(m.tags || []).slice(0, 3).join(', ')}` : ''}`.trim(),
			content: (m.description || '').trim(),
			updatedAt: m.updatedAt || m.createdAt || Date.now(),
		});
	}

	for (const c of courses) {
		await upsertDoc({
			type: 'course',
			id: c.id,
			title: c.title || '',
			subtitle: c.description || '',
			content: (c.description || '').trim(),
			updatedAt: c.updatedAt || c.createdAt || Date.now(),
		});
	}
}

function includesAny(hay: string, needle: string): boolean {
	return (hay || '').toLowerCase().includes((needle || '').toLowerCase());
}

async function fallbackSearch(queryRaw: string, opts?: { limit?: number }): Promise<HybridSearchResult[]> {
	const q = (queryRaw || '').trim();
	if (!q) return [];
	const limit = opts?.limit ?? 30;

	const out: HybridSearchResult[] = [];

	// Songs
	const songs = await db.songs.toArray();
	for (const s of songs) {
		if (out.length >= limit) break;
		const hit = includesAny(s.title, q) || includesAny(s.singer, q) || includesAny(s.writer, q) || includesAny(s.lyrics, q);
		if (!hit) continue;
		out.push({
			type: 'song',
			id: s.id,
			title: s.title || '',
			subtitle: `${s.singer || ''}${s.writer ? ` • ${s.writer}` : ''}`.trim(),
			preview: firstWords((s.lyrics || '').trim(), 5),
			score: 1,
		});
	}

	// Questions
	const questions = await db.questions.toArray();
	for (const qq of questions) {
		if (out.length >= limit) break;
		const plain = extractPlainText(qq.text || '').trim();
		const exp = extractPlainText(qq.explanation || '').trim();
		const code = qq.code ? String(qq.code) : '';
		const tagStr = (qq.tags || []).join(' ');
		const hit = includesAny(plain, q) || includesAny(exp, q) || includesAny(code, q) || includesAny(tagStr, q);
		if (!hit) continue;
		out.push({
			type: 'question',
			id: qq.id,
			title: qq.code ? `Question ${qq.code}` : 'Question',
			subtitle: (qq.tags || []).slice(0, 4).join(', '),
			preview: firstWords(plain || exp, 5),
			score: 1,
		});
	}

	// Modules
	const modules = await db.modules.toArray();
	for (const m of modules) {
		if (out.length >= limit) break;
		const hit = includesAny(m.title, q) || includesAny(m.description || '', q) || includesAny((m.tags || []).join(' '), q);
		if (!hit) continue;
		out.push({
			type: 'module',
			id: m.id,
			title: m.title || '',
			subtitle: `${m.type || ''}${(m.tags || []).length ? ` • ${(m.tags || []).slice(0, 3).join(', ')}` : ''}`.trim(),
			preview: firstWords((m.description || '').trim(), 5),
			score: 1,
		});
	}

	// Courses
	const courses = await db.storyCourses.toArray();
	for (const c of courses) {
		if (out.length >= limit) break;
		const hit = includesAny(c.title || '', q) || includesAny(c.description || '', q);
		if (!hit) continue;
		out.push({
			type: 'course',
			id: c.id,
			title: c.title || '',
			subtitle: c.description || '',
			preview: firstWords((c.description || '').trim(), 5),
			score: 1,
		});
	}

	return out.slice(0, limit);
}

let pgliteDisabled = true;

export async function omniSearch(queryRaw: string, opts?: { limit?: number }): Promise<HybridSearchResult[]> {
	if (pgliteDisabled) return await fallbackSearch(queryRaw, opts);
	try {
		return await hybridSearch(queryRaw, opts);
	} catch {
		// Avoid repeated initialization attempts that can trigger aborted fetch streams.
		pgliteDisabled = true;
		return await fallbackSearch(queryRaw, opts);
	}
}

export async function omniEnsureIndexedOnce(): Promise<void> {
	if (pgliteDisabled) return;
	try {
		await hybridEnsureIndexedOnce();
	} catch {
		pgliteDisabled = true;
		// Ignore: omniSearch will fall back to Dexie search.
	}
}

export async function hybridSearch(queryRaw: string, opts?: { limit?: number }): Promise<HybridSearchResult[]> {
	const q = (queryRaw || '').trim();
	if (!q) return [];
	const limit = opts?.limit ?? 30;

	const { getHybridPg } = await import('./hybridPglite');
	const { embedTextHybrid } = await import('./hybridEmbedder');
	const pg = await getHybridPg();
	const query = (pg as any).query.bind(pg) as <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[] }>;
	const emb = await embedTextHybrid(q);

	const fts = await query<HybridSearchRow>(
		`SELECT doc_type, doc_id, title, subtitle, content, updated_at
		 FROM hybrid_fts
		 WHERE (lower(title) LIKE '%' || lower($1) || '%')
		    OR (lower(subtitle) LIKE '%' || lower($1) || '%')
		    OR (lower(content) LIKE '%' || lower($1) || '%')
		 LIMIT 60`,
		[q],
	);

	const vec = await query<HybridSearchRow & { sim: number }>(
		`SELECT doc_type, doc_id, title, subtitle, content, updated_at,
		        1 - (embed <=> $1) AS sim
		 FROM hybrid_docs
		 WHERE embed IS NOT NULL
		 ORDER BY embed <=> $1 ASC
		 LIMIT 60`,
		[emb.vector],
	);

	const ftsRanks = fts.rows.map((r, i) => ({ key: docKey(r.doc_type, r.doc_id), rank: i + 1 }));
	const vecRanks = vec.rows.map((r, i) => ({ key: docKey(r.doc_type, r.doc_id), rank: i + 1 }));

	const short = q.length <= 3;
	const weights = {
		wFts: short ? 2.0 : 1.2,
		wVec: short ? 0.4 : 1.4,
	};

	const fused = rrfMerge({ fts: ftsRanks, vec: vecRanks, wFts: weights.wFts, wVec: weights.wVec });

	const byKey = new Map<string, HybridSearchRow>();
	for (const r of fts.rows) byKey.set(docKey(r.doc_type, r.doc_id), r);
	for (const r of vec.rows) if (!byKey.has(docKey(r.doc_type, r.doc_id))) byKey.set(docKey(r.doc_type, r.doc_id), r);

	const ordered = Array.from(fused.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit);

	return ordered
		.map(([k, score]) => {
			const [type, id] = k.split('::') as [HybridDocType, string];
			const row = byKey.get(k);
			return {
				type,
				id,
				title: row?.title || '',
				subtitle: row?.subtitle || '',
				preview: firstWords(row?.content || '', 5),
				score,
			};
		})
		.filter((x) => !!x.title);
}

export async function hybridEnsureIndexedOnce(): Promise<void> {
	const { getHybridPg } = await import('./hybridPglite');
	const pg = await getHybridPg();
	await pg.exec(`CREATE TABLE IF NOT EXISTS hybrid_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
	const existingRaw = await (pg as any).query(`SELECT value FROM hybrid_meta WHERE key = 'indexed_v1'`, []);
	const existing = existingRaw as { rows: Array<{ value: string }> };
	if (existing.rows[0]?.value === '1') return;
	await hybridIndexAll();
	await pg.exec(`INSERT INTO hybrid_meta(key, value) VALUES ('indexed_v1', '1') ON CONFLICT (key) DO UPDATE SET value = excluded.value;`);
}
