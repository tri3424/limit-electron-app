import { db } from './db';

const CLEANUP_KEY = 'limit:disable-auto-features:cleanup:v1';

function normalizeTagName(value: string): string {
	return (value || '').trim().toLowerCase();
}

export async function runDisableAutoFeaturesCleanup(): Promise<void> {
	if (typeof localStorage !== 'undefined') {
		try {
			if (localStorage.getItem(CLEANUP_KEY) === '1') return;
		} catch {
			return;
		}
	}

	const manualTags = await db.tags.toArray();
	const canonicalByNorm = new Map<string, string>();
	for (const t of manualTags) {
		const n = normalizeTagName(t.name);
		if (!n) continue;
		canonicalByNorm.set(n, t.name);
	}

	await db.transaction('rw', db.questions, db.questionSemanticAnalyses, db.semanticEmbeddings, async () => {
		const questions = await db.questions.toArray();
		for (const q of questions) {
			const existing = Array.isArray(q.tags) ? q.tags : [];
			const nextTags: string[] = [];
			for (const tag of existing) {
				const norm = normalizeTagName(tag);
				const canon = canonicalByNorm.get(norm);
				if (canon) nextTags.push(canon);
			}
			const dedup = Array.from(new Set(nextTags));

			const meta: any = { ...(q.metadata || {}) };
			if ('difficultyBand' in meta) delete meta.difficultyBand;
			if ('aiInsightsVersion' in meta) delete meta.aiInsightsVersion;
			if ('typeDifficulty' in meta) delete meta.typeDifficulty;
			if ('difficultyLevel' in meta) delete meta.difficultyLevel;

			await db.questions.update(q.id, {
				tags: dedup,
				metadata: { ...meta, updatedAt: Date.now() },
			});
		}

		await db.questionSemanticAnalyses.clear();
		await db.semanticEmbeddings.clear();
	});

	if (typeof localStorage !== 'undefined') {
		try {
			localStorage.setItem(CLEANUP_KEY, '1');
		} catch {
			return;
		}
	}
}
