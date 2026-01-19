import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';

export type HybridDocType = 'song' | 'question' | 'module' | 'course';

export type HybridSearchRow = {
	doc_type: HybridDocType;
	doc_id: string;
	title: string;
	subtitle: string;
	content: string;
	updated_at: number;
};

let pgPromise: Promise<PGlite> | null = null;

export async function getHybridPg(): Promise<PGlite> {
	if (pgPromise) return pgPromise;
	pgPromise = (async () => {
		try {
			const pg = await PGlite.create({
				dataDir: 'idb://limit-hybrid-search',
				extensions: {
					vector,
				},
			});

			await pg.exec(`CREATE EXTENSION IF NOT EXISTS vector;`);

			await pg.exec(`
				CREATE TABLE IF NOT EXISTS hybrid_docs (
					doc_type TEXT NOT NULL,
					doc_id TEXT NOT NULL,
					title TEXT NOT NULL,
					subtitle TEXT NOT NULL,
					content TEXT NOT NULL,
					updated_at BIGINT NOT NULL,
					content_hash TEXT NOT NULL,
					embed_model_id TEXT NOT NULL,
					embed_dims INT NOT NULL,
					embed VECTOR(384),
					PRIMARY KEY (doc_type, doc_id)
				);
			`);

			await pg.exec(`CREATE INDEX IF NOT EXISTS hybrid_docs_updated_at_idx ON hybrid_docs(updated_at);`);
			await pg.exec(`CREATE INDEX IF NOT EXISTS hybrid_docs_title_idx ON hybrid_docs(title);`);

			await pg.exec(`
				CREATE TABLE IF NOT EXISTS hybrid_fts (
					doc_type TEXT NOT NULL,
					doc_id TEXT NOT NULL,
					title TEXT NOT NULL,
					subtitle TEXT NOT NULL,
					content TEXT NOT NULL,
					PRIMARY KEY (doc_type, doc_id)
				);
			`);

			return pg;
		} catch (e) {
			pgPromise = null;
			throw e;
		}
	})();
	return pgPromise;
}
