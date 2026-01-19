import { db } from './db';
import { extractPlainText, stableHashString } from './semanticUtils';
import { embedTextHybrid } from './hybridEmbedder';
import { getHybridPg, type HybridDocType, type HybridSearchRow } from './hybridPglite';

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
}

export async function hybridSearch(queryRaw: string, opts?: { limit?: number }): Promise<HybridSearchResult[]> {
	const q = (queryRaw || '').trim();
	if (!q) return [];
	const limit = opts?.limit ?? 30;

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
	const pg = await getHybridPg();
	await pg.exec(`CREATE TABLE IF NOT EXISTS hybrid_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
	const existingRaw = await (pg as any).query(`SELECT value FROM hybrid_meta WHERE key = 'indexed_v1'`, []);
	const existing = existingRaw as { rows: Array<{ value: string }> };
	if (existing.rows[0]?.value === '1') return;
	await hybridIndexAll();
	await pg.exec(`INSERT INTO hybrid_meta(key, value) VALUES ('indexed_v1', '1') ON CONFLICT (key) DO UPDATE SET value = excluded.value;`);
}
