import { db } from './db';
import { analyzeQuestionSemantics, calibrateSemanticDifficultyDistribution } from './semanticEngine';

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
        await analyzeQuestionSemantics({ question: q });
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
  const intervalMs = params?.intervalMs ?? 900;
  const batchSize = params?.batchSize ?? 2;

  if (state.timer) return;

  state.timer = window.setInterval(() => {
    if (!state.pending.length) return;
    void processNext(batchSize);
  }, intervalMs);

  void (async () => {
    const all = await db.questions.toArray();
    enqueue(all.map((q) => q.id));
  })();
}

export function enqueueSemanticAnalysis(questionId: string) {
  enqueue([questionId]);
}

export async function rerunSemanticAnalysisForAll(params?: { purgeExistingAi?: boolean }) {
  const purgeExistingAi = params?.purgeExistingAi ?? false;

  if (purgeExistingAi) {
    await db.transaction('rw', db.questionSemanticAnalyses, db.semanticEmbeddings, async () => {
      // Only purge AI outputs/embeddings; keep user overrides intact.
      await db.questionSemanticAnalyses.where('source').equals('ai').delete();
      await db.semanticEmbeddings.clear();
    });
  }

  const all = await db.questions.toArray();
  enqueue(all.map((q) => q.id));
}

export function stopSemanticBackgroundQueue() {
  if (state.timer) {
    window.clearInterval(state.timer);
    state.timer = null;
  }
  state.pending = [];
}
