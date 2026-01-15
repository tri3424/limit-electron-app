import { v4 as uuidv4 } from 'uuid';
import { db, type Question, type QuestionSemanticAnalysis, type QuestionSemanticDifficultyFactors, type QuestionSemanticTagAssignment } from './db';
import { DEFAULT_EMBED_MODEL_ID, SEMANTIC_ANALYSIS_VERSION, getOntologySeedWithTimestamps } from './semanticOntology';
import { clamp01, cosineSimilarity, extractPlainText, softClamp, stableHashString } from './semanticUtils';

function deterministicEmbedding(params: { text: string; modelId: string; dims?: number }): { modelId: string; dims: number; vector: number[] } {
	const dims = params.dims ?? 64;
	const input = `${params.modelId}::${params.text}`;
	// Simple, fully deterministic pseudo-embedding derived from the UTF-16 code units.
	// This keeps the semantic pipeline functional without any external AI/runtime.
	const vec = new Array(dims).fill(0);
	for (let i = 0; i < input.length; i++) {
		const code = input.charCodeAt(i);
		const idx = i % dims;
		// Mix with a tiny LCG-style transform for spread
		vec[idx] = (vec[idx] * 1664525 + code + 1013904223) % 4294967296;
	}
	// Map to [-1, 1] floats
	const out = vec.map((x) => {
		const n = Number(x) / 4294967296;
		return n * 2 - 1;
	});
	return { modelId: params.modelId, dims, vector: out };
}

function deterministicSort<T>(items: T[], key: (t: T) => string): T[] {
  return items.slice().sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });
}

type OntologyNode = {
  id: string;
  name: string;
  description: string;
  kind: string;
  parentId?: string;
  aliases: string[];
};

function averageVectors(vectors: number[][]): number[] {
  const valid = vectors.filter((v) => Array.isArray(v) && v.length > 0);
  if (!valid.length) return [];
  const dims = valid[0].length;
  const out = new Array(dims).fill(0);
  for (const v of valid) {
    for (let i = 0; i < dims; i++) out[i] += Number(v[i] || 0);
  }
  for (let i = 0; i < dims; i++) out[i] /= valid.length;
  return out;
}

function buildOntologyGraph(nodes: OntologyNode[]) {
  const byId = new Map<string, OntologyNode>();
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    byId.set(n.id, n);
  }
  for (const n of nodes) {
    if (!n.parentId) continue;
    const arr = children.get(n.parentId) || [];
    arr.push(n.id);
    children.set(n.parentId, arr);
  }
  for (const [k, v] of children.entries()) {
    v.sort();
    children.set(k, v);
  }

  const depthMemo = new Map<string, number>();
  const depth = (id: string): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    const n = byId.get(id);
    if (!n || !n.parentId) {
      depthMemo.set(id, 0);
      return 0;
    }
    const d = depth(n.parentId) + 1;
    depthMemo.set(id, d);
    return d;
  };

  const roots = nodes
    .filter((n) => !n.parentId)
    .map((n) => n.id)
    .slice()
    .sort();

  let maxDepth = 0;
  for (const n of nodes) {
    maxDepth = Math.max(maxDepth, depth(n.id));
  }

  return { byId, children, depth, roots, maxDepth };
}

function detectHeuristicSignals(text: string) {
  const lower = text.toLowerCase();
  const count = (re: RegExp) => (lower.match(re) || []).length;

  const commandProve = count(/\b(prove|show|justify|deduce|hence|therefore)\b/g);
  const commandCompute = count(/\b(compute|calculate|evaluate|simplify|find|determine|solve)\b/g);
  const commandExplain = count(/\b(explain|describe|reason|why|interpret)\b/g);
  const commandGraph = count(/\b(graph|plot|diagram|figure|draw)\b/g);

  const symbols = (text.match(/[=<>±√∞∑∫πθλμσφψΩωΔ∇^_]/g) || []).length;
  const latex = (text.match(/\\[a-zA-Z]+|\\frac|\\sum|\\int|\\lim|\\sqrt/g) || []).length;
  const variables = (text.match(/\b[a-zA-Z]\b/g) || []).length;
  const symbolDensity = clamp01((symbols + latex + Math.min(variables, 12)) / 40);

  const multiStep = clamp01((count(/\b(then|next|after that|therefore|hence|so that)\b/g) + count(/\b(first|second|third|finally)\b/g)) / 6);
  const justification = clamp01(commandProve / 3);
  const computation = clamp01(commandCompute / 4);
  const explanation = clamp01(commandExplain / 3);
  const diagram = clamp01(commandGraph / 2);

  return {
    symbolDensity,
    computation,
    justification,
    explanation,
    multiStep,
    diagram,
  };
}

function round6(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

type SemanticTuningParams = {
  enabled: boolean;
  tagThreshold: number;
  siblingLambda: number;
  upBeta: number;
  downGamma: number;
  targetAvgTags: number;
};

const DEFAULT_TUNING: SemanticTuningParams = {
  enabled: true,
  tagThreshold: 0.3,
  siblingLambda: 0.35,
  upBeta: 0.55,
  downGamma: 0.18,
  targetAvgTags: 6,
};

async function getSemanticTuning(): Promise<SemanticTuningParams> {
  try {
    const settings = await db.settings.get('1');
    const t = settings?.semanticTuning as any;
    if (!t || t.enabled === false) return { ...DEFAULT_TUNING, enabled: false };
    return {
      enabled: true,
      tagThreshold: clamp(Number(t.tagThreshold ?? DEFAULT_TUNING.tagThreshold), 0.15, 0.65),
      siblingLambda: clamp(Number(t.siblingLambda ?? DEFAULT_TUNING.siblingLambda), 0.0, 0.75),
      upBeta: clamp(Number(t.upBeta ?? DEFAULT_TUNING.upBeta), 0.15, 0.9),
      downGamma: clamp(Number(t.downGamma ?? DEFAULT_TUNING.downGamma), 0.0, 0.6),
      targetAvgTags: clamp(Number(t.targetAvgTags ?? DEFAULT_TUNING.targetAvgTags), 2, 12),
    };
  } catch {
    return { ...DEFAULT_TUNING };
  }
}

export async function tuneSemanticFromExistingData(params?: { modelId?: string }): Promise<{
  sampleCount: number;
  tuned: SemanticTuningParams;
  derived: {
    avgTagsAtThreshold: number;
    chosenThreshold: number;
    avgUpRatio: number;
    avgDownRatio: number;
  };
}> {
  const modelId = params?.modelId || DEFAULT_EMBED_MODEL_ID;
  const analyses = await db.questionSemanticAnalyses
    .where('modelId')
    .equals(modelId)
    .and((a) => a.source === 'ai' && a.analysisVersion === SEMANTIC_ANALYSIS_VERSION)
    .toArray();

  // We tune only from analyses that have the intermediate artifacts.
  const usable = analyses.filter((a) => Array.isArray(a.rationale?.activatedNodes) && a.rationale.activatedNodes.length > 0);
  const sampleCount = usable.length;
  const base = await getSemanticTuning();
  if (sampleCount < 5) {
    const tuned = { ...base };
    await db.settings.update('1', { semanticTuning: { ...(tuned as any), enabled: tuned.enabled, updatedAt: Date.now() } } as any);
    return {
      sampleCount,
      tuned,
      derived: { avgTagsAtThreshold: 0, chosenThreshold: tuned.tagThreshold, avgUpRatio: 0, avgDownRatio: 0 },
    };
  }

  // Determine a threshold that yields a stable target average tag count.
  const candidates: number[] = [];
  for (let x = 0.2; x <= 0.6; x += 0.01) candidates.push(round6(x));

  const targetAvgTags = base.targetAvgTags;
  let bestThreshold = base.tagThreshold;
  let bestDiff = Number.POSITIVE_INFINITY;
  let bestAvg = 0;

  for (const th of candidates) {
    let total = 0;
    for (const a of usable) {
      const count = (a.rationale.activatedNodes || []).filter((n) => Number(n.finalScore) >= th).length;
      total += count;
    }
    const avg = total / usable.length;
    const diff = Math.abs(avg - targetAvgTags);
    if (diff < bestDiff - 1e-9 || (Math.abs(diff - bestDiff) < 1e-9 && th < bestThreshold)) {
      bestDiff = diff;
      bestThreshold = th;
      bestAvg = avg;
    }
  }

  // Tune propagation magnitudes based on observed ratios of propagated components.
  let upSum = 0;
  let upN = 0;
  let downSum = 0;
  let downN = 0;
  for (const a of usable) {
    for (const n of a.rationale.activatedNodes || []) {
      const finalScore = Number(n.finalScore) || 0;
      if (finalScore <= 0) continue;
      const up = Number(n.propagatedFromChildren) || 0;
      const down = Number(n.propagatedToChildren) || 0;
      upSum += clamp01(up / Math.max(finalScore, 1e-6));
      downSum += clamp01(down / Math.max(finalScore, 1e-6));
      upN++;
      downN++;
    }
  }
  const avgUpRatio = upN ? upSum / upN : 0;
  const avgDownRatio = downN ? downSum / downN : 0;

  // Map ratios into stable parameters. These are intentionally conservative.
  const tunedUpBeta = round6(clamp(0.35 + 0.7 * avgUpRatio, 0.2, 0.75));
  const tunedDownGamma = round6(clamp(0.08 + 0.35 * avgDownRatio, 0.05, 0.35));
  const tunedSiblingLambda = round6(clamp(0.25 + 0.25 * (1 - avgUpRatio), 0.15, 0.55));

  const tuned: SemanticTuningParams = {
    enabled: true,
    tagThreshold: round6(bestThreshold),
    siblingLambda: tunedSiblingLambda,
    upBeta: tunedUpBeta,
    downGamma: tunedDownGamma,
    targetAvgTags,
  };

  await db.settings.update('1', {
    semanticTuning: {
      ...(tuned as any),
      updatedAt: Date.now(),
    },
  } as any);

  return {
    sampleCount,
    tuned,
    derived: {
      avgTagsAtThreshold: round6(bestAvg),
      chosenThreshold: tuned.tagThreshold,
      avgUpRatio: round6(avgUpRatio),
      avgDownRatio: round6(avgDownRatio),
    },
  };
}

export function mapScoreToBand(score: number): QuestionSemanticAnalysis['difficultyBand'] {
  const s = clamp01(score);
  return s < 0.18
    ? 'very_easy'
    : s < 0.33
      ? 'easy'
      : s < 0.52
        ? 'moderate'
        : s < 0.70
          ? 'hard'
          : s < 0.84
            ? 'very_hard'
            : 'olympiad';
}

export async function seedOntologyIfNeeded(): Promise<void> {
	const now = Date.now();
	const seed = getOntologySeedWithTimestamps(now);
	await db.transaction('rw', db.semanticOntologyTags, async () => {
		for (const t of seed) {
			const existing = await db.semanticOntologyTags.get(t.id);
			if (!existing) {
				await db.semanticOntologyTags.put(t);
				continue;
			}
			const nextAliases = Array.isArray((t as any).aliases) ? ((t as any).aliases as string[]) : undefined;
			const curAliases = Array.isArray((existing as any).aliases) ? ((existing as any).aliases as string[]) : undefined;
			const aliasesChanged = JSON.stringify(curAliases || []) !== JSON.stringify(nextAliases || []);
			const parentChanged = (existing as any).parentId !== (t as any).parentId;
			const kindChanged = (existing as any).kind !== (t as any).kind;
			const nameChanged = existing.name !== t.name;
			const descChanged = existing.description !== t.description;
			if (!aliasesChanged && !parentChanged && !kindChanged && !nameChanged && !descChanged) continue;
			await db.semanticOntologyTags.update(t.id, {
				name: t.name,
				description: t.description,
				updatedAt: now,
				...(kindChanged ? { kind: (t as any).kind } : {}),
				...(parentChanged ? { parentId: (t as any).parentId } : {}),
				...(aliasesChanged ? { aliases: nextAliases } : {}),
			} as any);
		}
	});
}

async function getOrCreateOntologyEmbeddings(modelId: string): Promise<Array<{ tagId: string; tagName: string; vector: number[]; description: string }>> {
  const tags = await db.semanticOntologyTags.toArray();
  const orderedTags = deterministicSort(tags, (t) => t.id);

  const existingTagEmbeddings = await db.semanticEmbeddings
    .where('scope')
    .equals('ontology_tag')
    .and((e) => e.modelId === modelId)
    .toArray();
  const existingAliasEmbeddings = await db.semanticEmbeddings
    .where('scope')
    .equals('ontology_alias')
    .and((e) => e.modelId === modelId)
    .toArray();

  const byTagId = new Map(existingTagEmbeddings.map((e) => [e.scopeId, e]));
  const byAliasKey = new Map(existingAliasEmbeddings.map((e) => [e.scopeId, e]));

  const now = Date.now();
  const results: Array<{ tagId: string; tagName: string; vector: number[]; description: string }> = [];

  for (const t of orderedTags) {
    const descriptor = `${t.name}. ${t.description}`;
    const tagHash = await stableHashString(descriptor);
    let tagVector: number[] | null = null;
    const existing = byTagId.get(t.id);
    if (existing && existing.textHash === tagHash && existing.vector?.length) {
      tagVector = existing.vector;
    } else {
      const embed = deterministicEmbedding({ text: descriptor, modelId });
      await db.semanticEmbeddings.put({
        id: uuidv4(),
        scope: 'ontology_tag',
        scopeId: t.id,
        modelId,
        dims: embed.dims,
        vector: embed.vector,
        textHash: tagHash,
        createdAt: now,
      });
      tagVector = embed.vector;
    }

    const aliases = Array.isArray((t as any).aliases) ? ((t as any).aliases as string[]) : [];
    const aliasVectors: number[][] = [];
    for (const alias of aliases.slice().map((x) => String(x)).filter(Boolean).sort()) {
      const aliasText = `${alias}. Alias of ${t.name}. ${t.description}`;
      const aliasHash = await stableHashString(aliasText);
      const aliasKey = `${t.id}::${aliasHash}`;
      const aliasExisting = byAliasKey.get(aliasKey);
      if (aliasExisting && aliasExisting.textHash === aliasHash && aliasExisting.vector?.length) {
        aliasVectors.push(aliasExisting.vector);
        continue;
      }
      const embedAlias = deterministicEmbedding({ text: aliasText, modelId });
      await db.semanticEmbeddings.put({
        id: uuidv4(),
        scope: 'ontology_alias',
        scopeId: aliasKey,
        modelId,
        dims: embedAlias.dims,
        vector: embedAlias.vector,
        textHash: aliasHash,
        createdAt: now,
      });
      aliasVectors.push(embedAlias.vector);
    }

    const combined = averageVectors([tagVector, ...aliasVectors.filter((v) => v.length === tagVector.length)]);
    results.push({ tagId: t.id, tagName: t.name, vector: combined.length ? combined : tagVector, description: t.description });
  }

  return results;
}

async function getOrCreateQuestionEmbedding(params: { questionId: string; text: string; modelId: string }): Promise<{ vector: number[]; textHash: string; dims: number }> {
  const textHash = await stableHashString(params.text);
  const existing = await db.semanticEmbeddings.where('scope').equals('question').and((e) => e.scopeId === params.questionId && e.modelId === params.modelId).last();
  if (existing && existing.textHash === textHash && existing.vector?.length) {
    return { vector: existing.vector, textHash, dims: existing.dims };
  }
  const embed = deterministicEmbedding({ text: params.text, modelId: params.modelId });
  await db.semanticEmbeddings.put({
    id: uuidv4(),
    scope: 'question',
    scopeId: params.questionId,
    modelId: params.modelId,
    dims: embed.dims,
    vector: embed.vector,
    textHash,
    createdAt: Date.now(),
  });
  return { vector: embed.vector, textHash, dims: embed.dims };
}

function estimateSymbolDensity(source: string): number {
  if (!source) return 0;
  const mathTokens = source.match(/\\[a-zA-Z]+|\\frac|\\sum|\\int|\\lim|\\sqrt|[=<>±√∞∑∫πθλμσφψΩωΔ∇^_]/g)?.length || 0;
  const vars = source.match(/\b[a-zA-Z]\b/g)?.length || 0;
  const plain = source.replace(/\s+/g, ' ').trim();
  const chars = Math.max(plain.length, 1);
  return clamp01((mathTokens + Math.min(vars, 12)) / Math.max(10, chars / 12));
}

function estimateReasoningSteps(plain: string): number {
  const normalized = plain.toLowerCase();
  const connectors = normalized.match(/\b(then|therefore|hence|so|thus|because|if|implies|assume|given|show|prove|deduce|find|determine)\b/g)?.length || 0;
  const sentenceCount = Math.max(1, normalized.split(/[.!?]/).filter((s) => s.trim().length > 0).length);
  return softClamp((connectors * 0.6 + sentenceCount * 0.4) / 6, 0, 1);
}

function computeDifficultyFromSignals(params: {
  tagMatches: Array<{ tagId: string; tagName: string; sim: number }>;
  plain: string;
  symbolDensity: number;
}): { score: number; band: QuestionSemanticAnalysis['difficultyBand']; factors: QuestionSemanticDifficultyFactors; topSignals: Array<{ label: string; weight: number; detail?: string }> } {
  const top = params.tagMatches.slice(0, 6);
  const avgTopSim = top.length ? top.reduce((s, x) => s + x.sim, 0) / top.length : 0;

  const foundationalIds = new Set<string>(['topic.arithmetic', 'subtopic.fractions', 'subtopic.percent', 'subtopic.ratio', 'subtopic.linear']);
  const foundationSim = top.length ? Math.max(...top.filter((x) => foundationalIds.has(x.tagId)).map((x) => x.sim), 0) : 0;
  const semanticComplexity = clamp01(1 - foundationSim);

  const abstractionHints = params.plain.toLowerCase().match(/\b(abstract|general|parameter|for all|exists|prove|justify|show that|function|mapping|space|vector)\b/g)?.length || 0;
  const abstractionLevel = clamp01(abstractionHints / 6);

  const reasoningSteps = estimateReasoningSteps(params.plain);
  const symbolDensity = params.symbolDensity;

  const advancedIds = new Set<string>(['topic.calculus', 'topic.probability', 'topic.statistics', 'topic.trigonometry']);
  const prereqSim = top.length ? Math.max(...top.filter((x) => advancedIds.has(x.tagId)).map((x) => x.sim), 0) : 0;
  const prerequisiteLoad = clamp01(prereqSim * 0.9 + semanticComplexity * 0.3);

  const conceptualDepth = clamp01((abstractionLevel * 0.5 + reasoningSteps * 0.4 + semanticComplexity * 0.4) / 1.2);

  const score = clamp01(
    0.18 * semanticComplexity +
      0.22 * conceptualDepth +
      0.20 * reasoningSteps +
      0.15 * abstractionLevel +
      0.15 * symbolDensity +
      0.10 * prerequisiteLoad,
  );

  const band: QuestionSemanticAnalysis['difficultyBand'] = mapScoreToBand(score);

  const factors: QuestionSemanticDifficultyFactors = {
    semanticComplexity,
    conceptualDepth,
    reasoningSteps,
    abstractionLevel,
    symbolDensity,
    prerequisiteLoad,
  };

  const topSignals = [
    { label: 'Semantic proximity', weight: clamp01(avgTopSim), detail: 'Higher similarity to specific concepts reduces uncertainty.' },
    { label: 'Foundational distance', weight: semanticComplexity, detail: 'Greater distance from foundational topics increases difficulty.' },
    { label: 'Reasoning steps', weight: reasoningSteps, detail: 'More implied steps increases difficulty.' },
    { label: 'Symbol density', weight: symbolDensity, detail: 'More symbolic content increases procedural load.' },
    { label: 'Prerequisite load', weight: prerequisiteLoad, detail: 'More advanced prerequisites increase difficulty.' },
  ].sort((a, b) => b.weight - a.weight);

  return { score, band, factors, topSignals };
}

export async function analyzeQuestionSemantics(params: {
  question: Question;
  modelId?: string;
  topK?: number;
}): Promise<QuestionSemanticAnalysis | null> {
  const modelId = params.modelId || DEFAULT_EMBED_MODEL_ID;
  const topK = params.topK ?? 8;

  const tuning = await getSemanticTuning();

  await seedOntologyIfNeeded();

  const q = params.question;
  const plain = extractPlainText(q.text || '').trim();
  const explanation = extractPlainText(q.explanation || '').trim();
  const combined = `${plain}${explanation ? `\n\nExplanation: ${explanation}` : ''}`.trim();
  if (!combined) return null;

  const inputHash = await stableHashString(`${SEMANTIC_ANALYSIS_VERSION}::${modelId}::${q.type}::${combined}`);

  const existing = await db.questionSemanticAnalyses
    .where('questionId')
    .equals(q.id)
    .and((a) => a.analysisVersion === SEMANTIC_ANALYSIS_VERSION && a.modelId === modelId && a.inputHash === inputHash && a.source === 'ai')
    .last();

  if (existing) return existing;

  const ontologyRecords = await db.semanticOntologyTags.toArray();
  const nodes: OntologyNode[] = deterministicSort(
    ontologyRecords.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      kind: (t as any).kind,
      parentId: (t as any).parentId,
      aliases: Array.isArray((t as any).aliases) ? ((t as any).aliases as string[]) : [],
    })),
    (n) => n.id,
  );
  const graph = buildOntologyGraph(nodes);

  const ontologyEmbeddings = await getOrCreateOntologyEmbeddings(modelId);
  const qEmbed = await getOrCreateQuestionEmbedding({ questionId: q.id, text: combined, modelId });

  const baseSimilarity = new Map<string, number>();
  const descriptionById = new Map<string, string>();
  const nameById = new Map<string, string>();
  for (const rec of ontologyEmbeddings) {
    descriptionById.set(rec.tagId, rec.description);
    nameById.set(rec.tagId, rec.tagName);
    baseSimilarity.set(rec.tagId, clamp01(cosineSimilarity(qEmbed.vector, rec.vector)));
  }

  // Deterministic heuristic signals
  const heur = detectHeuristicSignals(`${combined}\n${q.text || ''}`);
  const heuristicBoost = new Map<string, number>();
  const heuristicArtifacts: Array<{ key: string; score: number; contributedTo: Array<{ tagId: string; weight: number }> }> = [];

  const boost = (tagId: string, weight: number) => {
    heuristicBoost.set(tagId, round6((heuristicBoost.get(tagId) ?? 0) + weight));
  };

  // Operations
  boost('operation.compute', 0.25 * heur.computation);
  boost('operation.solve', 0.18 * heur.computation);
  boost('operation.simplify', 0.22 * heur.computation);
  boost('operation.prove', 0.40 * heur.justification);

  // Skills
  boost('skill.symbolic-manipulation', 0.35 * heur.symbolDensity);
  boost('skill.conceptual-reasoning', 0.35 * heur.explanation + 0.20 * heur.justification);
  boost('skill.multi-step-reasoning', 0.45 * heur.multiStep);
  boost('skill.procedural-execution', 0.25 * heur.computation + 0.25 * heur.symbolDensity);

  heuristicArtifacts.push({
    key: 'heur.symbol_density',
    score: round6(heur.symbolDensity),
    contributedTo: [
      { tagId: 'skill.symbolic-manipulation', weight: round6(0.35 * heur.symbolDensity) },
      { tagId: 'skill.procedural-execution', weight: round6(0.25 * heur.symbolDensity) },
    ],
  });
  heuristicArtifacts.push({
    key: 'heur.command_verbs',
    score: round6(Math.max(heur.computation, heur.justification, heur.explanation)),
    contributedTo: [
      { tagId: 'operation.prove', weight: round6(0.40 * heur.justification) },
      { tagId: 'operation.compute', weight: round6(0.25 * heur.computation) },
      { tagId: 'skill.conceptual-reasoning', weight: round6(0.35 * heur.explanation) },
    ],
  });
  heuristicArtifacts.push({
    key: 'heur.multi_step',
    score: round6(heur.multiStep),
    contributedTo: [{ tagId: 'skill.multi-step-reasoning', weight: round6(0.45 * heur.multiStep) }],
  });

  // Hierarchical inference: start with base similarity + heuristic boost
  const initial = new Map<string, number>();
  for (const n of nodes) {
    const base = baseSimilarity.get(n.id) ?? 0;
    const h = heuristicBoost.get(n.id) ?? 0;
    initial.set(n.id, clamp01(base + h));
  }

  // Sibling suppression: for each parent, suppress siblings when one child dominates.
  const suppressed = new Map<string, number>(initial);
  let siblingSuppressionApplied = false;
  const siblingLambda = tuning.siblingLambda;
  for (const [parentId, kids] of graph.children.entries()) {
    if (kids.length < 2) continue;
    const scores = kids.map((k) => suppressed.get(k) ?? 0);
    const maxScore = Math.max(...scores);
    if (maxScore < 0.35) continue;
    siblingSuppressionApplied = true;
    for (const k of kids) {
      const s = suppressed.get(k) ?? 0;
      if (s === maxScore) continue;
      suppressed.set(k, round6(clamp01(s * (1 - siblingLambda * maxScore))));
    }
  }

  // Upward propagation: child -> parent
  const propagatedUp = new Map<string, number>();
  const upBeta = tuning.upBeta;
  for (const n of nodes.slice().sort((a, b) => graph.depth(b.id) - graph.depth(a.id) || a.id.localeCompare(b.id))) {
    const s = suppressed.get(n.id) ?? 0;
    if (!n.parentId) continue;
    if (s <= 0) continue;
    propagatedUp.set(n.parentId, round6((propagatedUp.get(n.parentId) ?? 0) + upBeta * s));
  }

  const withUp = new Map<string, number>();
  for (const n of nodes) {
    const s = suppressed.get(n.id) ?? 0;
    const up = propagatedUp.get(n.id) ?? 0;
    withUp.set(n.id, round6(clamp01(s + up)));
  }

  // Downward propagation: parent -> child (small reinforcement)
  const downGamma = tuning.downGamma;
  const propagatedDown = new Map<string, number>();
  for (const n of nodes.slice().sort((a, b) => graph.depth(a.id) - graph.depth(b.id) || a.id.localeCompare(b.id))) {
    const parentScore = withUp.get(n.id) ?? 0;
    const kids = graph.children.get(n.id) || [];
    if (!kids.length) continue;
    for (const kid of kids) {
      const childScore = withUp.get(kid) ?? 0;
      const delta = downGamma * parentScore * (1 - childScore);
      propagatedDown.set(kid, round6((propagatedDown.get(kid) ?? 0) + delta));
    }
  }

  const finalScores = new Map<string, number>();
  for (const n of nodes) {
    const s = withUp.get(n.id) ?? 0;
    const d = propagatedDown.get(n.id) ?? 0;
    finalScores.set(n.id, round6(clamp01(s + d)));
  }

  const activated = nodes
    .map((n) => ({
      tagId: n.id,
      tagName: n.name,
      finalScore: finalScores.get(n.id) ?? 0,
      baseSimilarity: baseSimilarity.get(n.id) ?? 0,
      heuristicBoost: heuristicBoost.get(n.id) ?? 0,
      propagatedFromChildren: propagatedUp.get(n.id) ?? 0,
      propagatedToChildren: propagatedDown.get(n.id) ?? 0,
      depth: graph.depth(n.id),
      description: n.description,
    }))
    .sort((a, b) => b.finalScore - a.finalScore || a.tagId.localeCompare(b.tagId));

  const picked = activated.filter((x) => x.finalScore >= tuning.tagThreshold).slice(0, topK);
  const tags: QuestionSemanticTagAssignment[] = picked.map((p, idx) => ({
    tagId: p.tagId,
    tagName: p.tagName,
    score: round6(p.finalScore),
    rank: idx + 1,
    explanation: p.description,
  }));

  // Multi-axis difficulty model
  const foundationalRoots = new Set<string>([
    'topic.arithmetic',
    'subtopic.fractions',
    'subtopic.percent',
    'subtopic.ratio',
    'subtopic.linear',
  ]);

  const foundationSim = activated.length
    ? Math.max(...activated.filter((x) => foundationalRoots.has(x.tagId)).map((x) => x.finalScore), 0)
    : 0;
  const foundationalDistance = clamp01(1 - foundationSim);

  const maxDepth = Math.max(graph.maxDepth, 1);
  const topForDepth = activated.filter((x) => x.finalScore >= 0.35).slice(0, 10);
  const abstractionDepth = clamp01(
    topForDepth.length
      ? topForDepth.reduce((s, x) => s + (x.depth / maxDepth) * x.finalScore, 0) / topForDepth.reduce((s, x) => s + x.finalScore, 0)
      : 0,
  );

  const reasoningChain = clamp01(0.55 * estimateReasoningSteps(combined) + 0.45 * heur.multiStep);

  // breadth: count distinct strong nodes across different branches
  const branchOf = (id: string): string => {
    let cur = id;
    let prev = id;
    for (let i = 0; i < 6; i++) {
      const node = graph.byId.get(cur);
      if (!node || !node.parentId) return prev;
      prev = cur;
      cur = node.parentId;
    }
    return prev;
  };
  const strong = activated.filter((x) => x.finalScore >= 0.40).slice(0, 18);
  const branches = new Set(strong.map((x) => branchOf(x.tagId)));
  const prerequisiteBreadth = clamp01(branches.size / 6);

  const symbolDensity = estimateSymbolDensity(q.text || '');
  const semanticComplexity = foundationalDistance;
  const conceptualDepth = clamp01((abstractionDepth + foundationalDistance + prerequisiteBreadth) / 3);

  // combine fixed weights
  let difficultyRaw = clamp01(
    0.28 * foundationalDistance +
      0.22 * abstractionDepth +
      0.25 * reasoningChain +
      0.15 * prerequisiteBreadth +
      0.10 * symbolDensity,
  );

  const consistency: Array<{ rule: string; delta: number; detail?: string }> = [];
  const hasTag = (id: string) => (finalScores.get(id) ?? 0) >= 0.45;
  const hasCompute = hasTag('operation.compute') || hasTag('operation.solve') || hasTag('operation.simplify');
  const hasProve = hasTag('operation.prove');
  const hasMulti = hasTag('skill.multi-step-reasoning');
  const isArithmeticHeavy = (finalScores.get('topic.arithmetic') ?? 0) >= 0.55;

  // Floors
  if ((hasProve && hasMulti) || (hasProve && reasoningChain >= 0.55)) {
    const floor = 0.62;
    if (difficultyRaw < floor) {
      const delta = round6(floor - difficultyRaw);
      difficultyRaw = floor;
      consistency.push({ rule: 'floor.prove_multi_step', delta, detail: 'Proof + multi-step reasoning implies a minimum difficulty.' });
    }
  }
  if (hasMulti && difficultyRaw < 0.52) {
    const delta = round6(0.52 - difficultyRaw);
    difficultyRaw = 0.52;
    consistency.push({ rule: 'floor.multi_step', delta, detail: 'Multi-step reasoning implies a moderate difficulty floor.' });
  }

  // Caps
  if (isArithmeticHeavy && hasCompute && !hasProve && abstractionDepth < 0.25) {
    const cap = 0.48;
    if (difficultyRaw > cap) {
      const delta = round6(cap - difficultyRaw);
      difficultyRaw = cap;
      consistency.push({ rule: 'cap.arithmetic_compute', delta, detail: 'Pure arithmetic compute tasks are capped unless other signals dominate.' });
    }
  }

  const roundedScore = round6(difficultyRaw);
  const roundedBand = mapScoreToBand(roundedScore);

  const difficultyFactors: QuestionSemanticDifficultyFactors = {
    semanticComplexity,
    conceptualDepth,
    reasoningSteps: reasoningChain,
    abstractionLevel: abstractionDepth,
    symbolDensity,
    prerequisiteLoad: prerequisiteBreadth,
  };

  const topSignals = [
    { label: 'Foundational distance', weight: foundationalDistance, detail: 'Distance from foundational concepts raises difficulty.' },
    { label: 'Abstraction depth', weight: abstractionDepth, detail: 'Deeper activated nodes imply more abstraction.' },
    { label: 'Reasoning chain', weight: reasoningChain, detail: 'Multi-step / justificatory framing increases difficulty.' },
    { label: 'Prerequisite breadth', weight: prerequisiteBreadth, detail: 'More distinct activated branches imply broader prerequisites.' },
    { label: 'Symbol density', weight: symbolDensity, detail: 'Symbolic content increases cognitive load.' },
  ].sort((a, b) => b.weight - a.weight);

  const now = Date.now();
  const analysis: QuestionSemanticAnalysis = {
    id: uuidv4(),
    questionId: q.id,
    inputHash,
    modelId,
    analysisVersion: SEMANTIC_ANALYSIS_VERSION,
    source: 'ai',
    createdAt: now,
    tags,
    difficultyScore: roundedScore,
    difficultyBand: roundedBand,
    difficultyFactors,
    rationale: {
      topSignals,
      activatedNodes: activated.slice(0, 24).map((x) => ({
        tagId: x.tagId,
        tagName: x.tagName,
        finalScore: round6(x.finalScore),
        baseSimilarity: round6(x.baseSimilarity),
        heuristicBoost: round6(x.heuristicBoost),
        propagatedFromChildren: round6(x.propagatedFromChildren),
        propagatedToChildren: round6(x.propagatedToChildren),
        depth: x.depth,
      })),
      hierarchy: {
        rootsActivated: graph.roots
          .map((id) => ({ tagId: id, tagName: nameById.get(id) || id, score: round6(finalScores.get(id) ?? 0) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score || a.tagId.localeCompare(b.tagId))
          .slice(0, 8),
        siblingSuppressionApplied,
      },
      heuristics: heuristicArtifacts,
      difficultyComponents: {
        foundationalDistance: round6(foundationalDistance),
        abstractionDepth: round6(abstractionDepth),
        reasoningChain: round6(reasoningChain),
        prerequisiteBreadth: round6(prerequisiteBreadth),
        consistencyAdjustment: round6(consistency.reduce((s, r) => s + r.delta, 0)),
      },
      consistency,
    },
  };

  await db.questionSemanticAnalyses.put(analysis);
  return analysis;
}

export async function calibrateSemanticDifficultyDistribution(params?: { modelId?: string }): Promise<void> {
  const modelId = params?.modelId || DEFAULT_EMBED_MODEL_ID;
  // NOTE: questionSemanticAnalyses is not indexed by modelId alone.
  // Query on an indexed field first, then filter in-memory.
  const analyses = (await db.questionSemanticAnalyses
    .where('source')
    .equals('ai')
    .toArray()).filter((a) => a.modelId === modelId && a.analysisVersion === SEMANTIC_ANALYSIS_VERSION);
  if (analyses.length < 3) return;

  const ordered = analyses
    .slice()
    .sort((a, b) => {
      if (a.difficultyScore !== b.difficultyScore) return a.difficultyScore - b.difficultyScore;
      if (a.questionId < b.questionId) return -1;
      if (a.questionId > b.questionId) return 1;
      return 0;
    });

  const n = ordered.length;
  await db.transaction('rw', db.questionSemanticAnalyses, async () => {
    for (let i = 0; i < n; i++) {
      const percentile = n === 1 ? 0.5 : i / (n - 1);
      const calibrated = round6(clamp01(percentile));
      const band = mapScoreToBand(calibrated);
      const a = ordered[i];
      if (a.difficultyScore === calibrated && a.difficultyBand === band) continue;
      await db.questionSemanticAnalyses.update(a.id, {
        difficultyScore: calibrated,
        difficultyBand: band,
      });
    }
  });
}
