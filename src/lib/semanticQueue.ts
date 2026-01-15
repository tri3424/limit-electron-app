import { db } from './db';
import { analyzeQuestionSemantics, calibrateSemanticDifficultyDistribution } from './semanticEngine';

function bandToLegacyDifficulty(band: string): 'easy' | 'medium' | 'hard' {
	// Backward-compatible mapping for any UI that still expects easy/medium/hard.
	return band === 'very_easy' || band === 'easy'
		? 'easy'
		: band === 'moderate'
			? 'medium'
			: 'hard';
}

function bandToLevel(band: string): number {
	// Stable discrete level (1..12) used in some older parts of the app.
	// Keep deterministic and monotonic.
	switch (band) {
		case 'very_easy':
			return 2;
		case 'easy':
			return 4;
		case 'moderate':
			return 6;
		case 'hard':
			return 8;
		case 'very_hard':
			return 10;
		case 'olympiad':
			return 12;
		default:
			return 6;
	}
}

async function applySemanticResultsToQuestion(params: { questionId: string; analysisId: string }) {
	const settings = await db.settings.get('1');
	const cfg = (settings as any)?.semanticAutoApply as
		| {
			enabled: boolean;
			applyTags: boolean;
			applyDifficulty: boolean;
			maxTags: number;
			minScore: number;
			preserveExistingQuestionTags: boolean;
			preserveExistingDifficulty: boolean;
		}
		| undefined;

	if (!cfg || cfg.enabled === false) return;

	const analysis = await db.questionSemanticAnalyses.get(params.analysisId);
	if (!analysis || analysis.source !== 'ai') return;

	// If user override exists, never overwrite the user's applied values.
	const override = await db.questionSemanticOverrides
		.where('questionId')
		.equals(params.questionId)
		.last();
	if (override) return;

	const q = await db.questions.get(params.questionId);
	if (!q) return;

	const minScore = Number.isFinite(cfg.minScore) ? cfg.minScore : 0.35;
	const maxTags = Number.isFinite(cfg.maxTags) ? Math.max(1, Math.floor(cfg.maxTags)) : 6;

	const suggestedTags = (analysis.tags || [])
		.filter((t) => Number(t.score) >= minScore)
		.slice(0, maxTags)
		.map((t) => t.tagName);

	const existingTags = Array.isArray(q.tags) ? q.tags : [];
	const mergedTags = cfg.preserveExistingQuestionTags
		? Array.from(new Set([...existingTags, ...suggestedTags]))
		: suggestedTags;

	const wantsTags = cfg.applyTags !== false;
	const wantsDifficulty = cfg.applyDifficulty !== false;

	const hasExistingDifficulty = !!(q.metadata?.difficultyBand || q.metadata?.difficulty || q.metadata?.difficultyLevel);
	const shouldWriteDifficulty = wantsDifficulty && !(cfg.preserveExistingDifficulty && hasExistingDifficulty);

	await db.questions.update(params.questionId, {
		tags: wantsTags ? mergedTags : existingTags,
		metadata: {
			...(q.metadata || ({} as any)),
			...(shouldWriteDifficulty
				? {
					difficultyBand: analysis.difficultyBand,
					difficultyLevel: bandToLevel(analysis.difficultyBand),
					difficulty: bandToLegacyDifficulty(analysis.difficultyBand),
					updatedAt: Date.now(),
				}
				: { updatedAt: Date.now() }),
		},
	});
}

type QueueState = {
  running: boolean;
  pending: string[];
  timer: number | null;
  lastCalibratedAt: number;
};

const state: QueueState = {
  running: false,
  pending: [],
  timer: null,
  lastCalibratedAt: 0,
};

function enqueue(questionIds: string[]) {
  const next = new Set(state.pending);
  for (const id of questionIds) next.add(id);
  state.pending = Array.from(next);
}

async function processNext(batchSize: number) {
  if (state.running) return;
  state.running = true;
  try {
    const slice = state.pending.slice(0, batchSize);
    state.pending = state.pending.slice(batchSize);
    const questions = await db.questions.bulkGet(slice);
    for (const q of questions) {
      if (!q) continue;
      try {
        const analysis = await analyzeQuestionSemantics({ question: q });
        if (analysis) {
          await applySemanticResultsToQuestion({ questionId: q.id, analysisId: analysis.id });
        }
      } catch (e) {
        console.error(e);
      }
    }
  } finally {
    state.running = false;

    // When the queue drains, run a deterministic calibration pass so difficulty
    // adapts to the local corpus (offline) and remains stable between runs.
    if (state.pending.length === 0) {
      const now = Date.now();
      if (now - state.lastCalibratedAt > 30_000) {
        state.lastCalibratedAt = now;
        try {
          await calibrateSemanticDifficultyDistribution();
        } catch (e) {
          console.error(e);
        }
      }
    }
  }
}

export function startSemanticBackgroundQueue(params?: { intervalMs?: number; batchSize?: number }) {
	return;
}

export function enqueueSemanticAnalysis(questionId: string) {
	return;
}

export async function rerunSemanticAnalysisForAll(params?: { purgeExistingAi?: boolean }) {
	return;
}

export function stopSemanticBackgroundQueue() {
  if (state.timer) {
    window.clearInterval(state.timer);
    state.timer = null;
  }
  state.pending = [];
}
