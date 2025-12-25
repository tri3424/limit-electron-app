export type DifficultyBand = 'easy' | 'medium' | 'hard';

export type AdaptivePracticeConfig = {
  userId: string | null | undefined;
  moduleId: string;
};

type TagStats = {
  attempts: number;
  correct: number;
  avgTimeMs: number;
  lastAttemptAt?: number;
};

type CardSchedule = {
  ease: number; // 1.3–2.7
  intervalDays: number;
  dueAt: number;
  lastReviewedAt?: number;
  lastQuality?: number;
};

export type AdaptivePracticeModelV1 = {
  version: 1;
  updatedAt: number;
  tags: Record<string, TagStats>;
  cards: Record<string, CardSchedule>; // questionId -> schedule
};

export type AttemptSignal = {
  questionId: string;
  tags: string[];
  isCorrect: boolean;
  timeTakenMs: number;
  difficultyLevel?: number;
  difficulty?: DifficultyBand;
  timestamp: number;
};

export type SkillBreakdownRow = {
  tag: string;
  attempts: number;
  accuracy: number; // 0..1
  avgTimeMs: number;
  score: number; // 0..1 combined
};

const STORAGE_PREFIX = 'tk-adaptive-practice-model-v1';

function storageKey(cfg: AdaptivePracticeConfig): string {
  const userPart = cfg.userId && String(cfg.userId).trim().length > 0 ? String(cfg.userId) : 'anon';
  return `${STORAGE_PREFIX}::${userPart}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadAdaptivePracticeModel(cfg: AdaptivePracticeConfig): AdaptivePracticeModelV1 {
  if (typeof localStorage === 'undefined') {
    return { version: 1, updatedAt: Date.now(), tags: {}, cards: {} };
  }
  const parsed = safeJsonParse<AdaptivePracticeModelV1>(localStorage.getItem(storageKey(cfg)));
  if (!parsed || parsed.version !== 1) {
    return { version: 1, updatedAt: Date.now(), tags: {}, cards: {} };
  }
  return {
    version: 1,
    updatedAt: parsed.updatedAt || Date.now(),
    tags: parsed.tags || {},
    cards: parsed.cards || {},
  };
}

export function storeAdaptivePracticeModel(cfg: AdaptivePracticeConfig, model: AdaptivePracticeModelV1): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(cfg), JSON.stringify(model));
  } catch {
    // ignore
  }
}

function difficultyToLevel(difficulty?: DifficultyBand, difficultyLevel?: number): number {
  if (typeof difficultyLevel === 'number' && Number.isFinite(difficultyLevel)) return difficultyLevel;
  if (difficulty === 'easy') return 3;
  if (difficulty === 'medium') return 6;
  if (difficulty === 'hard') return 9;
  return 6;
}

function expectedTimeMsForLevel(level: number): number {
  // coarse heuristic; just enough for adaptive direction
  if (level <= 4) return 30_000;
  if (level <= 8) return 60_000;
  return 90_000;
}

function signalQuality(isCorrect: boolean, timeTakenMs: number, expectedTimeMs: number): number {
  if (!isCorrect) return 1;
  const ratio = expectedTimeMs > 0 ? timeTakenMs / expectedTimeMs : 1;
  if (ratio <= 0.6) return 5;
  if (ratio <= 1.0) return 4;
  if (ratio <= 1.6) return 3;
  return 2;
}

function updateEma(prev: number | undefined, next: number, alpha: number): number {
  if (typeof prev !== 'number' || !Number.isFinite(prev)) return next;
  return prev * (1 - alpha) + next * alpha;
}

function ensureCard(now: number, existing?: CardSchedule): CardSchedule {
  if (existing) return existing;
  return {
    ease: 2.3,
    intervalDays: 0,
    dueAt: now,
  };
}

function applySm2Like(card: CardSchedule, quality: number, now: number): CardSchedule {
  const q = clamp(Math.round(quality), 0, 5);
  let ease = card.ease;
  let intervalDays = card.intervalDays;

  if (q < 3) {
    intervalDays = 0;
  } else {
    if (intervalDays === 0) intervalDays = 1;
    else if (intervalDays === 1) intervalDays = 3;
    else intervalDays = intervalDays * ease;
  }

  // SM-2 ease update
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ease = clamp(ease, 1.3, 2.7);

  const dueAt = now + Math.round(intervalDays * 24 * 60 * 60 * 1000);

  return {
    ease,
    intervalDays,
    dueAt,
    lastReviewedAt: now,
    lastQuality: q,
  };
}

export function applyAttemptToAdaptiveModel(
  cfg: AdaptivePracticeConfig,
  attempt: AttemptSignal,
): AdaptivePracticeModelV1 {
  const model = loadAdaptivePracticeModel(cfg);
  const now = attempt.timestamp || Date.now();

  const level = difficultyToLevel(attempt.difficulty, attempt.difficultyLevel);
  const expected = expectedTimeMsForLevel(level);
  const quality = signalQuality(attempt.isCorrect, attempt.timeTakenMs, expected);

  for (const rawTag of attempt.tags || []) {
    const tag = String(rawTag || '').trim();
    if (!tag) continue;
    const prev = model.tags[tag] || { attempts: 0, correct: 0, avgTimeMs: 0 };
    const attempts = prev.attempts + 1;
    const correct = prev.correct + (attempt.isCorrect ? 1 : 0);
    const avgTimeMs = updateEma(prev.avgTimeMs, attempt.timeTakenMs, 0.25);
    model.tags[tag] = {
      attempts,
      correct,
      avgTimeMs,
      lastAttemptAt: now,
    };
  }

  const existingCard = model.cards[attempt.questionId];
  const card = ensureCard(now, existingCard);
  model.cards[attempt.questionId] = applySm2Like(card, quality, now);

  model.updatedAt = now;
  storeAdaptivePracticeModel(cfg, model);
  return model;
}

export function computeSkillBreakdown(model: AdaptivePracticeModelV1): SkillBreakdownRow[] {
  const rows: SkillBreakdownRow[] = [];
  for (const [tag, s] of Object.entries(model.tags || {})) {
    const attempts = s.attempts || 0;
    if (attempts <= 0) continue;
    const accuracy = clamp((s.correct || 0) / attempts, 0, 1);

    // Normalize time: 30s is great, 90s is poor (clamped)
    const avg = s.avgTimeMs || 0;
    const timeScore = 1 - clamp((avg - 30_000) / 60_000, 0, 1);

    const score = clamp(0.7 * accuracy + 0.3 * timeScore, 0, 1);
    rows.push({ tag, attempts, accuracy, avgTimeMs: avg, score });
  }
  return rows.sort((a, b) => a.score - b.score);
}

function recentPerformanceTargetLevel(recent: AttemptSignal[]): number {
  if (!recent.length) return 6;
  const slice = recent.slice(-6);
  const acc = slice.filter((x) => x.isCorrect).length / slice.length;
  const avgRatio =
    slice.reduce((sum, x) => {
      const level = difficultyToLevel(x.difficulty, x.difficultyLevel);
      const exp = expectedTimeMsForLevel(level);
      return sum + (exp > 0 ? x.timeTakenMs / exp : 1);
    }, 0) / slice.length;

  let target = 6;
  if (acc >= 0.85 && avgRatio <= 1.0) target += 2;
  else if (acc >= 0.70 && avgRatio <= 1.2) target += 1;
  else if (acc <= 0.45) target -= 2;
  else if (acc <= 0.60 || avgRatio >= 1.6) target -= 1;

  return clamp(Math.round(target), 1, 12);
}

export function chooseNextQuestionId(params: {
  cfg: AdaptivePracticeConfig;
  model: AdaptivePracticeModelV1;
  candidates: Array<{ id: string; tags: string[]; difficulty?: DifficultyBand; difficultyLevel?: number }>;
  recent: AttemptSignal[];
  now: number;
}): string | null {
  const { model, candidates, recent, now } = params;
  if (!candidates.length) return null;

  const targetLevel = recentPerformanceTargetLevel(recent);

  const skills = computeSkillBreakdown(model);
  const skillMap = new Map<string, number>();
  for (const row of skills) {
    skillMap.set(row.tag, row.score);
  }

  let bestId: string | null = null;
  let bestScore = -Infinity;

  for (const q of candidates) {
    const level = difficultyToLevel(q.difficulty, q.difficultyLevel);
    const diffMatch = 1 - clamp(Math.abs(level - targetLevel) / 8, 0, 1);

    const tagScores = (q.tags || []).map((t) => skillMap.get(t) ?? 0.5);
    const weakness = tagScores.length
      ? 1 - tagScores.reduce((a, b) => a + b, 0) / tagScores.length
      : 0.2;

    const card = model.cards[q.id];
    const dueBoost = card && card.dueAt <= now ? 1 : 0;

    // Composite: prioritize due reviews, then weakness, then difficulty alignment.
    const score = dueBoost * 3 + weakness * 1.4 + diffMatch * 1.0;

    if (score > bestScore) {
      bestScore = score;
      bestId = q.id;
    }
  }

  return bestId;
}

export function resetAdaptivePracticeModel(cfg: AdaptivePracticeConfig): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(cfg));
  } catch {
    // ignore
  }
}
