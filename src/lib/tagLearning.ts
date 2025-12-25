/**
 * Sophisticated tag learning and suggestion system
 * Learns from existing questions to suggest tags based on question text and type
 */

import { db, Question, Tag } from './db';

export interface TagUsage {
  tagName: string;
  questionCount: number;
  typeAffinity: Record<Question['type'], number>;
  keywords: string[];
  ngrams: string[];
  conceptHints: string[];
  avgMathDensity: number;
  avgTokenLength: number;
  coTags: Record<string, number>;
  avgUpdatedAt: number;
}

type SerializedTagUsage = TagUsage;

const MODEL_STORAGE_KEY = 'tk-tag-learning-model';
const MODEL_VERSION = 3;

type QuestionAnalysis = {
  questionType: Question['type'];
  plainText: string;
  keywords: string[];
  ngrams: string[];
  conceptHints: string[];
  mathDensity: number;
  tokenCount: number;
};

const KEYWORD_LIMIT = 20;
const NGRAM_LIMIT = 15;
const CONCEPT_LIMIT = 15;

const ALL_TYPES: Question['type'][] = ['mcq', 'text', 'fill_blanks', 'matching'];

const STEM_ENDINGS = ['ing', 'ed', 'ly', 'es', 's', 'ment', 'tion', 'ions', 'er', 'ers'];

const CONCEPT_DICTIONARY: Record<string, string[]> = {
  calculus: ['derivative', 'integral', 'limit', 'gradient', 'divergence', 'dx', 'dy', 'dt', 'd/dx', 'd/dy'],
  algebra: ['equation', 'variable', 'solve', 'factor', 'polynomial', 'quadratic', 'linear', 'expression'],
  geometry: ['triangle', 'circle', 'radius', 'area', 'perimeter', 'angle', 'polygon', 'coordinate'],
  trigonometry: ['sine', 'cosine', 'tangent', 'theta', 'radian', 'degree', 'identity'],
  probability: ['probability', 'random', 'distribution', 'variance', 'mean', 'median', 'mode', 'dice', 'coin'],
  statistics: ['regression', 'correlation', 'dataset', 'sample', 'population', 'standard deviation'],
  physics: ['force', 'velocity', 'acceleration', 'momentum', 'energy', 'field', 'charge', 'current'],
  chemistry: ['molecule', 'reaction', 'compound', 'element', 'valence', 'bond', 'stoichiometry'],
  biology: ['cell', 'enzyme', 'genetic', 'organism', 'population', 'ecosystem', 'photosynthesis'],
  grammar: ['grammar', 'sentence', 'verb', 'noun', 'adjective', 'punctuation', 'tense'],
  comprehension: ['passage', 'context', 'excerpt', 'author', 'summary', 'infer'],
  coding: ['algorithm', 'complexity', 'function', 'array', 'loop', 'recursion', 'data structure'],
  finance: ['interest', 'investment', 'loan', 'asset', 'liability', 'equity', 'cashflow'],
  logic: ['implication', 'predicate', 'truth', 'boolean', 'logic', 'proof'],
};

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','should','could','may','might','must','can','this','that','these',
  'those','what','which','who','whom','whose','where','when','why','how','all','each','every','some','any','no','not',
  'only','just','more','most','very','too','so','as','than','it','its','into','from','their','them','they','you','your',
  'we','our','ours','I','me','my','mine','via','per','etc'
]);

function getLatestQuestionUpdate(questions: Question[]): number {
  return questions.reduce((max, q) => Math.max(max, q.metadata?.updatedAt ?? 0), 0);
}

function buildSignature(questions: Question[], tags: Tag[]): string {
  return `${MODEL_VERSION}:${questions.length}:${tags.length}:${getLatestQuestionUpdate(questions)}`;
}

function serializeModel(model: Map<string, TagUsage>): SerializedTagUsage[] {
  return Array.from(model.values());
}

function deserializeModel(data: SerializedTagUsage[]): Map<string, TagUsage> {
  return new Map(
    data.map((entry) => [
      entry.tagName.toLowerCase(),
      {
        ...entry,
        typeAffinity: ensureTypeAffinity(entry.typeAffinity),
        keywords: entry.keywords || [],
        ngrams: entry.ngrams || [],
        conceptHints: entry.conceptHints || [],
        avgMathDensity: entry.avgMathDensity ?? 0,
        avgTokenLength: entry.avgTokenLength ?? 0,
        coTags: entry.coTags || {},
        avgUpdatedAt: entry.avgUpdatedAt ?? 0,
      },
    ])
  );
}

function loadCachedModel(signature: string): Map<string, TagUsage> | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(MODEL_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version: number; signature: string; data: SerializedTagUsage[] };
    if (parsed.version !== MODEL_VERSION || parsed.signature !== signature) return null;
    return deserializeModel(parsed.data);
  } catch {
    return null;
  }
}

function storeModel(signature: string, model: Map<string, TagUsage>) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      MODEL_STORAGE_KEY,
      JSON.stringify({
        version: MODEL_VERSION,
        signature,
        data: serializeModel(model),
      })
    );
  } catch {
    // ignore storage errors
  }
}

export function invalidateTagModelCache() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(MODEL_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function stem(word: string): string {
  for (const ending of STEM_ENDINGS) {
    if (word.endsWith(ending) && word.length > ending.length + 2) {
      return word.slice(0, word.length - ending.length);
    }
  }
  return word;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(stem)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function extractKeywords(text: string): string[] {
  const tokens = tokenize(text);
  const freq = new Map<string, number>();
  tokens.forEach(token => freq.set(token, (freq.get(token) || 0) + 1));

  return Array.from(freq.entries())
    .filter(([, count]) => count >= 2 || (count === 1 && tokens.length <= 30))
    .sort((a, b) => b[1] - a[1])
    .slice(0, KEYWORD_LIMIT)
    .map(([token]) => token);
}

function extractNGramsFromTokens(tokens: string[]): string[] {
  const grams = new Map<string, number>();
  for (let size = 2; size <= 3; size++) {
    for (let i = 0; i <= tokens.length - size; i++) {
      const gram = tokens.slice(i, i + size).join(' ');
      grams.set(gram, (grams.get(gram) || 0) + 1);
    }
  }
  return Array.from(grams.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, NGRAM_LIMIT)
    .map(([gram]) => gram);
}

function extractConceptHints(text: string, questionType: Question['type']): string[] {
  const hints = new Set<string>();
  Object.entries(CONCEPT_DICTIONARY).forEach(([concept, terms]) => {
    if (terms.some(term => text.includes(term))) {
      hints.add(concept);
    }
  });

  if (questionType === 'matching') {
    hints.add('associations');
  } else if (questionType === 'fill_blanks') {
    hints.add('contextual-cloze');
  } else if (questionType === 'text') {
    hints.add('constructed-response');
  }

  if (text.includes('katex') || text.includes('\\frac') || text.includes('=') || text.includes('∫')) {
    hints.add('mathematics');
  }

  return Array.from(hints).slice(0, CONCEPT_LIMIT);
}

function estimateMathDensity(source: string): number {
  if (!source) return 0;
  const mathTokens =
    source.match(/\\[a-zA-Z]+|\\frac|\\sum|\\int|[=<>±√∞∑∫πθλμσφψΩωΔ∇]/g)?.length || 0;
  const plainText = extractTextFromHtml(source);
  const tokenCount = tokenize(plainText).length || 1;
  const density = mathTokens / tokenCount;
  return Math.min(density, 1);
}

function analyzeQuestionText(questionText: string, questionType: Question['type']): QuestionAnalysis {
  const plainText = extractTextFromHtml(questionText).toLowerCase();
  const keywords = extractKeywords(plainText);
  const tokens = tokenize(plainText);
  const fullTokens = plainText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return {
    questionType,
    plainText,
    keywords,
    ngrams: extractNGramsFromTokens(fullTokens),
    conceptHints: extractConceptHints(plainText, questionType),
    mathDensity: estimateMathDensity(questionText),
    tokenCount: tokens.length,
  };
}

function mergeRankedTerms(
  existing: string[],
  incoming: string[],
  limit: number,
  boost = 1
): string[] {
  if (!incoming.length) return existing.slice(0, limit);
  const weights = new Map<string, number>();
  existing.forEach((term, idx) => {
    weights.set(term, (weights.get(term) || 0) + (limit - idx));
  });
  incoming.forEach((term, idx) => {
    weights.set(term, (weights.get(term) || 0) + (limit - idx) * boost);
  });
  return Array.from(weights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

function ensureTypeAffinity(
  affinity?: Record<Question['type'], number>
): Record<Question['type'], number> {
  const base: Record<Question['type'], number> = {
    mcq: 0,
    text: 0,
    fill_blanks: 0,
    matching: 0,
  };
  if (!affinity) return base;
  return {
    mcq: affinity.mcq ?? 0,
    text: affinity.text ?? 0,
    fill_blanks: affinity.fill_blanks ?? 0,
    matching: affinity.matching ?? 0,
  };
}

function termScore(source: string[], target: string[]): number {
  if (!source.length || !target.length) return 0;
  const exact = new Set(target);
  let score = 0;
  for (const term of source) {
    if (exact.has(term)) {
      score += 1;
    } else if (target.some(t => t.includes(term) || term.includes(t))) {
      score += 0.5;
    }
  }
  return Math.min(score / source.length, 1);
}

function heuristicTagScore(analysis: QuestionAnalysis, tagName: string): number {
  const lower = tagName.toLowerCase();
  let score = 0;
  if (analysis.plainText.includes(lower)) {
    score += 0.4;
  }
  if (analysis.keywords.some(keyword => lower.includes(keyword) || keyword.includes(lower))) {
    score += 0.3;
  }
  if (analysis.conceptHints.some(hint => lower.includes(hint))) {
    score += 0.2;
  }
  return Math.min(score, 0.6);
}

/**
 * Builds a learning model from existing questions
 */
export async function buildTagModel(forceRefresh = false): Promise<Map<string, TagUsage>> {
  const questions = await db.questions.toArray();
  const tags = await db.tags.toArray();
  const signature = buildSignature(questions, tags);

  if (!forceRefresh) {
    const cached = loadCachedModel(signature);
    if (cached) {
      return cached;
    }
  }

  const tagMap = new Map(tags.map(t => [t.name.toLowerCase(), t.name]));

  const model = new Map<string, TagUsage>();

  // Process each question
  for (const question of questions) {
    if (!question.tags || question.tags.length === 0) continue;

    const analysis = analyzeQuestionText(question.text || '', question.type);

    const normalizedTags = Array.from(
      new Set(question.tags.map((t) => (t || '').trim()).filter(Boolean))
    );

    // For each tag on this question, update the model
    for (const tagName of normalizedTags) {
      const key = tagName.toLowerCase();
      const existing = model.get(key) || {
        tagName,
        questionCount: 0,
        typeAffinity: ensureTypeAffinity(),
        keywords: [],
        ngrams: [],
        conceptHints: [],
        avgMathDensity: 0,
        avgTokenLength: 0,
        coTags: {},
        avgUpdatedAt: 0,
      };

      const affinity = ensureTypeAffinity(existing.typeAffinity);
      affinity[question.type] = (affinity[question.type] || 0) + 1;

      const prevCount = existing.questionCount;
      const nextCount = prevCount + 1;

      const questionUpdatedAt = question.metadata?.updatedAt ?? 0;
      const updatedAt =
        (existing.avgUpdatedAt * prevCount + questionUpdatedAt) / nextCount;

      const coTags = { ...(existing.coTags || {}) };
      for (const other of normalizedTags) {
        if (!other) continue;
        const otherKey = other.toLowerCase();
        if (otherKey === key) continue;
        coTags[otherKey] = (coTags[otherKey] || 0) + 1;
      }

      const updated: TagUsage = {
        tagName,
        questionCount: nextCount,
        typeAffinity: affinity,
        keywords: mergeRankedTerms(existing.keywords, analysis.keywords, KEYWORD_LIMIT),
        ngrams: mergeRankedTerms(existing.ngrams, analysis.ngrams, NGRAM_LIMIT),
        conceptHints: mergeRankedTerms(existing.conceptHints, analysis.conceptHints, CONCEPT_LIMIT, 1.5),
        avgMathDensity: (existing.avgMathDensity * prevCount + analysis.mathDensity) / nextCount,
        avgTokenLength: (existing.avgTokenLength * prevCount + analysis.tokenCount) / nextCount,
        coTags,
        avgUpdatedAt: updatedAt,
      };

      model.set(key, updated);
    }
  }

  storeModel(signature, model);
  return model;
}

/**
 * Extracts plain text from HTML
 */
function extractTextFromHtml(html: string): string {
  if (typeof window === 'undefined') return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

/**
 * Calculates relevance score between question text and a tag model
 */
function calculateRelevance(
  analysis: QuestionAnalysis,
  tagUsage: TagUsage,
  selectedTags?: string[]
): number {
  const affinity = ensureTypeAffinity(tagUsage.typeAffinity);
  const totalAffinity = ALL_TYPES.reduce((sum, type) => sum + (affinity[type] || 0), 0) || 1;
  const typeAlignment = (affinity[analysis.questionType] || 0) / totalAffinity;

  let score = typeAlignment * 0.35;
  score += termScore(analysis.keywords, tagUsage.keywords) * 0.3;
  score += termScore(analysis.ngrams, tagUsage.ngrams) * 0.15;
  score += termScore(analysis.conceptHints, tagUsage.conceptHints) * 0.25;

  const mathCloseness = 1 - Math.min(Math.abs(tagUsage.avgMathDensity - analysis.mathDensity), 1);
  score += mathCloseness * 0.1;

  const lengthDelta = Math.min(
    Math.abs((tagUsage.avgTokenLength || 1) - analysis.tokenCount) /
      Math.max(tagUsage.avgTokenLength || 1, 1),
    1
  );
  score += (1 - lengthDelta) * 0.05;

  if (selectedTags && selectedTags.length > 0) {
    const normalizedSelected = selectedTags
      .map((t) => (t || '').trim().toLowerCase())
      .filter(Boolean);
    if (normalizedSelected.length > 0) {
      const co = tagUsage.coTags || {};
      let coScore = 0;
      for (const st of normalizedSelected) {
        coScore += (co[st] || 0) / Math.max(1, tagUsage.questionCount);
      }
      coScore = coScore / normalizedSelected.length;
      score += Math.min(coScore, 1) * 0.25;
    }
  }

  if (tagUsage.avgUpdatedAt) {
    const now = Date.now();
    const ageDays = Math.max(0, (now - tagUsage.avgUpdatedAt) / (1000 * 60 * 60 * 24));
    const recencyBoost = Math.max(0, 1 - ageDays / 365);
    score += recencyBoost * 0.05;
  }

  // Reliability boost for tags backed by more data
  const reliabilityBoost = Math.min(tagUsage.questionCount / 20, 0.1);
  score += reliabilityBoost;

  return Math.min(score, 1);
}

/**
 * Suggests tags based on learned model
 */
export async function suggestTagsAdvanced(
  questionText: string,
  questionType: Question['type'],
  availableTags: Tag[],
  maxSuggestions: number = 5,
  context?: {
    selectedTags?: string[];
  }
): Promise<string[]> {
  if (!questionText.trim() || !availableTags || availableTags.length === 0) {
    return [];
  }

  const model = await buildTagModel();
  const tagMap = new Map(availableTags.map(t => [t.name.toLowerCase(), t.name]));
  const analysis = analyzeQuestionText(questionText, questionType);

  // Score each available tag
  const scoredTags: Array<{ tagName: string; score: number }> = [];

  for (const [tagKey, tagName] of tagMap.entries()) {
    const tagUsage = model.get(tagKey);
    if (tagUsage) {
      const score = calculateRelevance(analysis, tagUsage, context?.selectedTags);
      if (score >= 0.25) {
        scoredTags.push({ tagName, score });
      }
    } else {
      const heuristicScore = heuristicTagScore(analysis, tagName);
      if (heuristicScore >= 0.3) {
        scoredTags.push({ tagName, score: heuristicScore });
      }
    }
  }

  // Sort by score and return top suggestions
  return scoredTags
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions)
    .map(item => item.tagName);
}

