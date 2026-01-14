import { db, type Question, type Module, type AppSettings } from './db';

/**
 * Central intelligence engine for:
 * - Deep question analysis (text + explanation + math)
 * - Difficulty estimation on a 1–12 scale
 * - Auto-assigning questions to modules based on type/tags
 * - Learning from feedback (difficulty overrides, module removals)
 *
 * NOTE: This is intentionally lightweight and runs fully on-device.
 */

export type DifficultySource = 'auto' | 'manual';

export interface QuestionDifficulty {
  level: number; // 1–12
  label: string;
  source: DifficultySource;
  updatedAt: number;
}

// --- Internal constants -----------------------------------------------------

const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 12;

const FEEDBACK_STORAGE_KEY = 'tk-ai-difficulty-feedback-v1';
const MODULE_REMOVAL_KEY = 'tk-ai-module-removals-v1';

type DifficultyFeedbackBucket = {
  totalDelta: number;
  count: number;
};

type DifficultyFeedbackStore = Record<string, DifficultyFeedbackBucket>;

type ModuleRemovalStore = Record<string, true>;

// Public analysis version so callers can store which heuristic model was used
export const ANALYSIS_VERSION = 1;

// Simple concept dictionary re-used for math/type awareness
const MATH_CONCEPTS: Record<string, string[]> = {
  calculus: ['derivative', 'integral', 'limit', 'gradient', 'd/dx', 'dx', 'dy', '∫', '∇'],
  algebra: ['equation', 'variable', 'solve', 'factor', 'polynomial', 'quadratic', 'linear', 'expression'],
  geometry: ['triangle', 'circle', 'radius', 'area', 'perimeter', 'angle', 'polygon'],
  trigonometry: ['sine', 'cosine', 'tangent', 'theta', 'radian', 'degree'],
  probability: ['probability', 'random', 'distribution', 'variance', 'mean', 'median', 'mode'],
  statistics: ['regression', 'correlation', 'dataset', 'sample', 'population', 'standard deviation'],
};

// --- Utilities --------------------------------------------------------------

function clampLevel(level: number): number {
  return Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, Math.round(level)));
}

export function difficultyLabelFromLevel(level: number): string {
  const l = clampLevel(level);
  if (l <= 2) return `L${l} · Very Easy`;
  if (l <= 4) return `L${l} · Easy`;
  if (l <= 6) return `L${l} · Moderate`;
  if (l <= 8) return `L${l} · Hard`;
  if (l <= 10) return `L${l} · Very Hard`;
  return `L${l} · Extreme`;
}

export function summarizeDifficulty(d?: QuestionDifficulty): string | undefined {
  if (!d) return undefined;
  return difficultyLabelFromLevel(d.level);
}

function safeExtractText(html?: string): string {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ');
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

function estimateMathDensity(html?: string): number {
  if (!html) return 0;
  const text = html;
  const tokens =
    text.match(/\\[a-zA-Z]+|\\frac|\\sum|\\int|\\lim|\\sqrt|[=<>±√∞∑∫πθλμσφψΩωΔ∇]/g)?.length || 0;
  const plain = safeExtractText(html);
  const words = plain.split(/\s+/).filter(Boolean).length || 1;
  const density = tokens / words;
  return Math.min(1, density);
}

function detectConcepts(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = new Set<string>();
  for (const [concept, terms] of Object.entries(MATH_CONCEPTS)) {
    if (terms.some((t) => lower.includes(t))) {
      hits.add(concept);
    }
  }
  return Array.from(hits);
}

function loadDifficultyFeedback(): DifficultyFeedbackStore {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DifficultyFeedbackStore;
  } catch {
    return {};
  }
}

function storeDifficultyFeedback(store: DifficultyFeedbackStore) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

function loadModuleRemovalStore(): ModuleRemovalStore {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MODULE_REMOVAL_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ModuleRemovalStore;
  } catch {
    return {};
  }
}

function storeModuleRemovalStore(store: ModuleRemovalStore) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MODULE_REMOVAL_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

// Build a coarse feature key for difficulty learning
function difficultyFeatureKey(q: Question, concepts: string[]): string {
  const typePart = q.type;
  const conceptPart = concepts.slice(0, 3).sort().join('|') || 'none';
  const tagPart = (q.tags || []).slice(0, 3).sort().join('|') || 'no-tags';
  return `${typePart}::${conceptPart}::${tagPart}`;
}

// --- Public: difficulty estimation ------------------------------------------

export interface DifficultyAnalysisInput {
  id?: string;
  type: Question['type'];
  text: string;
  options?: Question['options'];
  explanation?: string;
  tags?: string[];
}

export interface DifficultyAnalysisResult {
  difficulty: QuestionDifficulty;
  concepts: string[];
  mathDensity: number;
  lengthScore: number;
}

// Legacy-style snapshot used by CreateQuestion for richer difficulty UI.
// It is kept intentionally simple and computed synchronously.
export interface QuestionIntelligenceSnapshot {
  level: number;
  perTypeLevels: Record<Question['type'], number>;
  summary: string;
  concepts: string[];
  mathDensity: number;
}

export type DifficultySpectrumSuggestion = {
  recommendedLevel: number;
  minLevel: number;
  maxLevel: number;
  sampleCount: number;
  source: 'corpus' | 'heuristic';
};

const DIFFICULTY_SPECTRUM_VERSION = 1;
const DIFFICULTY_SPECTRUM_CACHE_KEY = 'tk-ai-difficulty-spectrum-v1';

type DifficultySpectrumCache = {
  version: number;
  signature: string;
  payload: Record<Question['type'], { count: number; avgLevel: number; stdLevel: number }>;
};

function classicDifficultyToLevel(value?: 'easy' | 'medium' | 'hard'): number {
  if (value === 'easy') return 3;
  if (value === 'hard') return 10;
  return 6;
}

function safeDifficultyLevel(q: Question): number {
  const stored = q.metadata?.difficultyLevel;
  if (typeof stored === 'number' && Number.isFinite(stored) && stored > 0) {
    return clampLevel(stored);
  }
  return clampLevel(classicDifficultyToLevel(q.metadata?.difficulty));
}

function buildDifficultySpectrumSignature(questions: Question[]): string {
  const latest = questions.reduce((max, q) => Math.max(max, q.metadata?.updatedAt ?? 0), 0);
  return `${DIFFICULTY_SPECTRUM_VERSION}:${questions.length}:${latest}`;
}

function loadDifficultySpectrumCache(signature: string): DifficultySpectrumCache | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DIFFICULTY_SPECTRUM_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DifficultySpectrumCache;
    if (parsed.version !== DIFFICULTY_SPECTRUM_VERSION) return null;
    if (parsed.signature !== signature) return null;
    return parsed;
  } catch {
    return null;
  }
}

function storeDifficultySpectrumCache(cache: DifficultySpectrumCache) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DIFFICULTY_SPECTRUM_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function computeMeanAndStd(values: number[], weights?: number[]): { mean: number; std: number } {
  if (!values.length) return { mean: 6, std: 2 };
  if (!weights || weights.length !== values.length) {
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return { mean, std: Math.sqrt(variance) };
  }
  const wSum = weights.reduce((s, w) => s + w, 0) || 1;
  const mean = values.reduce((s, v, i) => s + v * weights[i], 0) / wSum;
  const variance = values.reduce((s, v, i) => s + weights[i] * (v - mean) ** 2, 0) / wSum;
  return { mean, std: Math.sqrt(variance) };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

async function getDifficultySpectrumCorpusStats(): Promise<Record<Question['type'], { count: number; avgLevel: number; stdLevel: number }>> {
  const questions = await db.questions.toArray();
  const signature = buildDifficultySpectrumSignature(questions);
  const cached = loadDifficultySpectrumCache(signature);
  if (cached) return cached.payload;

  const payload: DifficultySpectrumCache['payload'] = {
    mcq: { count: 0, avgLevel: 6, stdLevel: 2 },
    text: { count: 0, avgLevel: 6, stdLevel: 2 },
    fill_blanks: { count: 0, avgLevel: 6, stdLevel: 2 },
    matching: { count: 0, avgLevel: 6, stdLevel: 2 },
  };

  for (const type of Object.keys(payload) as Question['type'][]) {
    const levels = questions.filter((q) => q.type === type).map(safeDifficultyLevel);
    const { mean, std } = computeMeanAndStd(levels);
    payload[type] = {
      count: levels.length,
      avgLevel: mean,
      stdLevel: std,
    };
  }

  storeDifficultySpectrumCache({
    version: DIFFICULTY_SPECTRUM_VERSION,
    signature,
    payload,
  });

  return payload;
}

/**
 * Suggest a dynamic slider band (min/max) and a recommended level.
 *
 * Algorithm:
 * - Start from the draft heuristic level.
 * - Blend with a weighted mean of existing questions of the same type.
 *   Weight comes primarily from tag overlap (Jaccard), with a small floor.
 * - Band width is driven by corpus stddev (and widened when little data).
 */
export async function suggestDifficultySpectrum(input: {
  type: Question['type'];
  draftLevel: number;
  selectedTags?: string[];
}): Promise<DifficultySpectrumSuggestion> {
  const corpus = await db.questions.toArray();
  const typeCorpus = corpus.filter((q) => q.type === input.type);
  const normalizedSelected = new Set(
    (input.selectedTags || []).map((t) => (t || '').trim().toLowerCase()).filter(Boolean)
  );

  if (typeCorpus.length === 0) {
    const recommended = clampLevel(input.draftLevel);
    const minLevel = clampLevel(recommended - 3);
    const maxLevel = clampLevel(recommended + 3);
    return {
      recommendedLevel: recommended,
      minLevel,
      maxLevel,
      sampleCount: 0,
      source: 'heuristic',
    };
  }

  const levels: number[] = [];
  const weights: number[] = [];
  for (const q of typeCorpus) {
    const qTags = new Set((q.tags || []).map((t) => (t || '').trim().toLowerCase()).filter(Boolean));
    const overlap = normalizedSelected.size ? jaccard(normalizedSelected, qTags) : 0;
    const weight = 0.2 + overlap * 0.8;
    levels.push(safeDifficultyLevel(q));
    weights.push(weight);
  }

  const { mean, std } = computeMeanAndStd(levels, weights);
  const stats = await getDifficultySpectrumCorpusStats();
  const baseStd = stats[input.type]?.stdLevel ?? std;
  const usedStd = Math.max(1.5, Math.min(4, Number.isFinite(baseStd) ? baseStd : 2));

  const blended = 0.6 * clampLevel(input.draftLevel) + 0.4 * mean;
  const recommended = clampLevel(blended);

  const scarcityWiden = typeCorpus.length < 10 ? 1.5 : typeCorpus.length < 30 ? 1 : 0;
  const halfWidth = Math.round(Math.max(2, usedStd + scarcityWiden));

  return {
    recommendedLevel: recommended,
    minLevel: clampLevel(recommended - halfWidth),
    maxLevel: clampLevel(recommended + halfWidth),
    sampleCount: typeCorpus.length,
    source: 'corpus',
  };
}

/**
 * Estimate difficulty (1–12) for a question draft or saved question.
 */
export async function analyzeDifficulty(
  input: DifficultyAnalysisInput | Question,
): Promise<DifficultyAnalysisResult> {
  const base: DifficultyAnalysisInput = {
    id: (input as Question).id,
    type: input.type,
    text: input.text,
    options: (input as Question).options,
    explanation: input.explanation,
    tags: (input as Question).tags || [],
  };

  const plainText = safeExtractText(base.text);
  const explanationText = safeExtractText(base.explanation);

  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const explWordCount = explanationText.split(/\s+/).filter(Boolean).length;
  const totalWords = wordCount + explWordCount * 0.5;

  const mathDensity = estimateMathDensity(base.text + ' ' + (base.explanation || ''));
  const concepts = detectConcepts(plainText + ' ' + explanationText);

  // Base level from length
  let lengthLevel = 1;
  if (totalWords > 200) lengthLevel = 8;
  else if (totalWords > 120) lengthLevel = 6;
  else if (totalWords > 60) lengthLevel = 4;
  else if (totalWords > 25) lengthLevel = 3;
  else lengthLevel = 2;

  // Math and concept influence
  let mathLevel = 1;
  if (mathDensity > 0.6) mathLevel = 10;
  else if (mathDensity > 0.3) mathLevel = 7;
  else if (mathDensity > 0.1) mathLevel = 5;
  else if (mathDensity > 0.03) mathLevel = 3;

  if (concepts.includes('calculus') || concepts.includes('statistics')) {
    mathLevel = Math.max(mathLevel, 8);
  }

  // Type-specific difficulty bias
  let typeBias = 0;
  if (base.type === 'fill_blanks' || base.type === 'matching') typeBias += 1.5;
  if (base.type === 'text') typeBias += 0.5;

  // Options complexity: more options, more multi-correct -> harder
  let optionsLevel = 0;
  const options = base.options || [];
  if (options.length >= 5) optionsLevel += 1;
  if (options.length >= 7) optionsLevel += 1;
  // For non-MCQ types, approximate "answer structure" complexity using blanks/pairs
  if ((input as Question).type === 'fill_blanks') {
    const blanksCount = (input as Question).fillBlanks?.blanks?.length ?? 0;
    if (blanksCount >= 3) optionsLevel += 0.5;
    if (blanksCount >= 6) optionsLevel += 0.5;
  }
  if ((input as Question).type === 'matching') {
    const pairCount = (input as Question).matching?.pairs?.length ?? 0;
    if (pairCount >= 4) optionsLevel += 0.5;
    if (pairCount >= 8) optionsLevel += 0.5;
  }

  // Tag-based bias: look at semantic hints in tags (e.g. "easy", "advanced", "calculus")
  let tagBias = 0;
  const tagText = (base.tags || []).join(' ').toLowerCase();
  if (tagText) {
    if (/\b(easy|basic|foundation|intro|beginner)\b/.test(tagText)) {
      tagBias -= 1.5;
    }
    if (/\b(medium|standard)\b/.test(tagText)) {
      tagBias += 0;
    }
    if (/\b(hard|advanced|challenging|olympiad|iit|jee|competition|contest)\b/.test(tagText)) {
      tagBias += 2;
    }
    // If tags explicitly name difficult math domains, nudge upward
    if (/\b(calculus|analysis|statistics|probability|linear algebra)\b/.test(tagText)) {
      tagBias += 1.5;
    }
  }

  // Aggregate raw level
  let rawLevel = (lengthLevel * 0.30) + (mathLevel * 0.40) + (optionsLevel * 0.1) + typeBias + tagBias;

  // Apply learned feedback adjustments, if any
  try {
    if ((input as Question).id) {
      const store = loadDifficultyFeedback();
      const key = difficultyFeatureKey(
        input as Question,
        concepts,
      );
      const bucket = store[key];
      if (bucket && bucket.count > 0) {
        const avgDelta = bucket.totalDelta / bucket.count;
        rawLevel += avgDelta;
      }
    }
  } catch {
    // ignore feedback errors
  }

  const level = clampLevel(rawLevel);
  const label = difficultyLabelFromLevel(level);
  const now = Date.now();

  return {
    difficulty: {
      level,
      label,
      source: 'auto',
      updatedAt: now,
    },
    concepts,
    mathDensity,
    lengthScore: totalWords,
  };
}

/**
 * Backwards-compatible, synchronous draft analysis used by the question editor.
 * It mirrors the core difficulty heuristics without touching IndexedDB.
 */
export function analyzeQuestionDraft(input: {
  id?: string | undefined;
  text: string;
  explanation: string;
  type: Question['type'];
  options?: Question['options'];
  tags?: string[];
  fillBlanksCount?: number;
  matchingPairs?: number;
}): QuestionIntelligenceSnapshot {
  const plainText = safeExtractText(input.text);
  const explanationText = safeExtractText(input.explanation);
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const explWordCount = explanationText.split(/\s+/).filter(Boolean).length;
  const totalWords = wordCount + explWordCount * 0.5;

  const mathDensity = estimateMathDensity(input.text + ' ' + (input.explanation || ''));
  const concepts = detectConcepts(plainText + ' ' + explanationText);

  let lengthLevel = 1;
  if (totalWords > 200) lengthLevel = 8;
  else if (totalWords > 120) lengthLevel = 6;
  else if (totalWords > 60) lengthLevel = 4;
  else if (totalWords > 25) lengthLevel = 3;
  else lengthLevel = 2;

  let mathLevel = 1;
  if (mathDensity > 0.6) mathLevel = 10;
  else if (mathDensity > 0.3) mathLevel = 7;
  else if (mathDensity > 0.1) mathLevel = 5;
  else if (mathDensity > 0.03) mathLevel = 3;
  if (concepts.includes('calculus') || concepts.includes('statistics')) {
    mathLevel = Math.max(mathLevel, 8);
  }

  let typeBias = 0;
  if (input.type === 'fill_blanks' || input.type === 'matching') typeBias += 1.5;
  if (input.type === 'text') typeBias += 0.5;

  let optionsLevel = 0;
  const options = input.options || [];
  if (options.length >= 5) optionsLevel += 1;
  if (options.length >= 7) optionsLevel += 1;
  // Treat blanks/pairs as structural "answer" complexity for non-MCQ types
  if (input.type === 'fill_blanks' && (input.fillBlanksCount ?? 0) > 0) {
    if ((input.fillBlanksCount ?? 0) >= 3) optionsLevel += 0.5;
    if ((input.fillBlanksCount ?? 0) >= 6) optionsLevel += 0.5;
  }
  if (input.type === 'matching' && (input.matchingPairs ?? 0) > 0) {
    if ((input.matchingPairs ?? 0) >= 4) optionsLevel += 0.5;
    if ((input.matchingPairs ?? 0) >= 8) optionsLevel += 0.5;
  }

  let tagBias = 0;
  const tagText = (input.tags || []).join(' ').toLowerCase();
  if (tagText) {
    if (/\b(easy|basic|foundation|intro|beginner)\b/.test(tagText)) {
      tagBias -= 1.5;
    }
    if (/\b(hard|advanced|challenging|olympiad|iit|jee|competition|contest)\b/.test(tagText)) {
      tagBias += 2;
    }
    if (/\b(calculus|analysis|statistics|probability|linear algebra)\b/.test(tagText)) {
      tagBias += 1.5;
    }
  }

  let baseLevel =
    lengthLevel * 0.3 +
    mathLevel * 0.4 +
    optionsLevel * 0.1 +
    typeBias +
    tagBias;

  const level = clampLevel(baseLevel);

  // Per-type levels: bias the current type, but provide defaults for others
  const perTypeLevels: Record<Question['type'], number> = {
    mcq: level,
    text: level,
    fill_blanks: level,
    matching: level,
  };
  // Slightly penalize matching/fill blanks when they are not the active type
  if (input.type === 'mcq') {
    perTypeLevels.fill_blanks = clampLevel(level + 1);
    perTypeLevels.matching = clampLevel(level + 1);
  }

  const summary = difficultyLabelFromLevel(level);

  return {
    level,
    perTypeLevels,
    summary,
    concepts,
    mathDensity,
  };
}

/**
 * Record that the user changed an automatically suggested difficulty.
 * This updates a small feedback store so future estimates can be nudged.
 */
export async function recordDifficultyOverride(
  question: Question,
  previous: QuestionDifficulty | undefined,
  next: QuestionDifficulty,
): Promise<void> {
  if (!previous || previous.source !== 'auto') return;
  try {
    const plainText = safeExtractText(question.text) + ' ' + safeExtractText(question.explanation);
    const concepts = detectConcepts(plainText);
    const key = difficultyFeatureKey(question, concepts);
    const store = loadDifficultyFeedback();
    const existing = store[key] || { totalDelta: 0, count: 0 };
    const delta = next.level - previous.level;
    store[key] = {
      totalDelta: existing.totalDelta + delta,
      count: existing.count + 1,
    };
    storeDifficultyFeedback(store);
  } catch {
    // ignore
  }
}

// --- Legacy helpers used by CreateQuestion difficulty UI --------------------

export function mapLevelToSelectOptions(): Array<{ level: number; label: string }> {
  return Array.from({ length: DIFFICULTY_MAX - DIFFICULTY_MIN + 1 }, (_, idx) => {
    const level = DIFFICULTY_MIN + idx;
    return { level, label: difficultyLabelFromLevel(level) };
  });
}

export function mapLevelToClassicDifficulty(
  level: number,
): 'easy' | 'medium' | 'hard' {
  const clamped = clampLevel(level);
  if (clamped <= 4) return 'easy';
  if (clamped >= 9) return 'hard';
  return 'medium';
}

export async function persistDifficultySignal(_params: {
  questionId: string;
  snapshot: QuestionIntelligenceSnapshot;
  source: 'auto' | 'override';
  questionType: Question['type'];
  previousLevel?: number;
  nextLevel: number;
}): Promise<void> {
  // For now this is a lightweight no-op hook; in future we could log analytics here.
  return;
}

export async function upsertQuestionIntelligenceMetadata(): Promise<void> {
  // Backwards-compatible stub – metadata is already written as part of question save.
  return;
}

// --- Public: module auto-assignment -----------------------------------------

interface AiSettings {
  difficultyEnabled: boolean;
  autoDifficultyOnCreate: boolean;
  autoModuleAssignmentEnabled: boolean;
}

async function getAiSettings(): Promise<AiSettings> {
  const settings = await db.settings.get('1');
  const ai = (settings as AppSettings & { ai?: any })?.ai || {};
  return {
    difficultyEnabled: ai.difficulty?.enabled ?? true,
    autoDifficultyOnCreate: ai.difficulty?.autoAssignOnCreate ?? true,
    autoModuleAssignmentEnabled: ai.autoModuleAssignment?.enabled ?? false,
  };
}

function scoreModuleForQuestion(mod: Module, q: Question): number {
  let score = 0;
  const tags = new Set(mod.tags || []);
  const sharedTags = (q.tags || []).filter((t) => tags.has(t)).length;
  score += sharedTags * 2;
  if (mod.type === 'exam' && (q.metadata?.difficulty as any)?.level >= 7) {
    score += 2;
  }
  if (mod.type === 'practice' && (q.metadata?.difficulty as any)?.level <= 6) {
    score += 1;
  }
  // Prefer modules of the same type distribution as existing questions
  if ((mod.questionIds || []).length === 0) {
    score += 0.5;
  }
  return score;
}

/**
 * Auto-assign a single question to one or more modules when the feature is enabled.
 * Uses tags + basic difficulty awareness. User can still manually adjust modules later.
 */
export async function maybeAutoAssignQuestionToModules(questionId: string): Promise<void> {
  const ai = await getAiSettings();
  if (!ai.autoModuleAssignmentEnabled) return;

  const question = await db.questions.get(questionId);
  if (!question) return;

  const modules = await db.modules.toArray();
  if (!modules.length) return;

  const currentModuleIds = new Set(question.modules || []);

  // Score all modules and pick top candidates
  const scored = modules
    .map((m) => ({ module: m, score: scoreModuleForQuestion(m, question) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // at most 3 modules per question automatically

  if (!scored.length) return;

  const removalStore = loadModuleRemovalStore();

  const targetModules = scored
    .map((x) => x.module)
    .filter((m) => !currentModuleIds.has(m.id))
    .filter((m) => !removalStore[`${m.id}::${question.id}`]);

  if (!targetModules.length) return;

  await db.transaction('rw', [db.modules, db.questions], async () => {
    const updatedModuleIds = new Set(currentModuleIds);
    for (const mod of targetModules) {
      const qIds = Array.isArray(mod.questionIds) ? mod.questionIds.slice() : [];
      if (!qIds.includes(question.id)) {
        qIds.push(question.id);
        await db.modules.update(mod.id, { questionIds: qIds });
      }
      updatedModuleIds.add(mod.id);
    }
    await db.questions.update(question.id, { modules: Array.from(updatedModuleIds) });
  });
}

/**
 * Backfill: try to automatically add all unassigned questions to suitable modules.
 * Intended to be triggered from Settings.
 */
export async function autoAssignUnassignedQuestions(): Promise<number> {
  const ai = await getAiSettings();
  if (!ai.autoModuleAssignmentEnabled) return 0;
  const questions = await db.questions.toArray();
  let assignedCount = 0;
  for (const q of questions) {
    if (!q.modules || q.modules.length === 0) {
      await maybeAutoAssignQuestionToModules(q.id);
      assignedCount += 1;
    }
  }
  return assignedCount;
}

/**
 * Learn from questions removed from modules by user edits.
 * We simply remember question-module pairs that the user removed so we never auto-add them again.
 */
export async function recordModuleRemovalFeedback(
  moduleId: string,
  removedQuestionIds: string[],
): Promise<void> {
  if (!removedQuestionIds.length) return;
  try {
    const store = loadModuleRemovalStore();
    for (const qid of removedQuestionIds) {
      store[`${moduleId}::${qid}`] = true;
    }
    storeModuleRemovalStore(store);
  } catch {
    // ignore
  }
}

export async function autoAssignQuestionToModules(
  questionId: string,
): Promise<{ assigned: string[]; skipped: string[] }> {
  const before = await db.questions.get(questionId);
  const existingModules = new Set(before?.modules || []);
  await maybeAutoAssignQuestionToModules(questionId);
  const after = await db.questions.get(questionId);
  const nextModules = new Set(after?.modules || []);
  const assigned: string[] = [];
  const skipped: string[] = [];
  nextModules.forEach((id) => {
    if (!existingModules.has(id)) {
      assigned.push(id);
    } else {
      skipped.push(id);
    }
  });
  return { assigned, skipped };
}


