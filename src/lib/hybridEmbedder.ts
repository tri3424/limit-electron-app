import { stableHashString } from './semanticUtils';

export type HybridEmbedding = {
	modelId: string;
	dims: number;
	vector: number[];
};

const DEFAULT_DIMS = 384;
const DEFAULT_MODEL_ID = 'deterministic-fallback';

function l2Normalize(vec: number[]): number[] {
	let sum = 0;
	for (const v of vec) sum += v * v;
	const denom = Math.sqrt(sum) || 1;
	return vec.map((v) => v / denom);
}

async function deterministicEmbedding384(text: string): Promise<number[]> {
	const h = await stableHashString(text);
	const seed = parseInt(h.slice(0, 8), 16) >>> 0;
	const out = new Array(DEFAULT_DIMS);
	let x = seed;
	for (let i = 0; i < DEFAULT_DIMS; i++) {
		x ^= x << 13;
		x ^= x >>> 17;
		x ^= x << 5;
		out[i] = ((x >>> 0) / 0xffffffff) * 2 - 1;
	}
	return l2Normalize(out);
}

export async function embedTextHybrid(text: string): Promise<HybridEmbedding> {
	const trimmed = (text || '').trim();
	if (!trimmed) {
		return {
			modelId: 'empty',
			dims: DEFAULT_DIMS,
			vector: new Array(DEFAULT_DIMS).fill(0),
		};
	}
	const vec = await deterministicEmbedding384(`${DEFAULT_MODEL_ID}::${trimmed}`);
	return { modelId: DEFAULT_MODEL_ID, dims: DEFAULT_DIMS, vector: vec };
}

export async function hashEmbeddingInput(text: string): Promise<string> {
	return stableHashString(text.trim());
}
