import { Fraction, fractionToLatex, normalizeFraction } from '@/lib/fraction';
import { generateGraphQuadraticLineMcq } from '@/lib/practiceGraph/generateGraphQuadraticLine';
import { generateGraphStraightLineMcq } from '@/lib/practiceGraph/generateGraphStraightLine';
import { generateGraphTrigonometryMcq } from '@/lib/practiceGraph/generateGraphTrigonometry';
import { generateGraphUnitCircleMcq } from '@/lib/practiceGraph/generateGraphUnitCircle';
import { generateDifferentiationQuestion } from '@/lib/practiceGenerators/differentiation';
import { generateIntegrationQuestion } from '@/lib/practiceGenerators/integration';
import { generateCircularMeasureProblem } from '@/lib/practiceGenerators/circularMeasure';
import { generateWordProblemQuestion, WordProblemQuestion, WordProblemVariantId } from '@/lib/practiceGenerators/wordProblems';
import { generatePolynomialsQuestion } from '@/lib/practiceGenerators/polynomials';
import { generatePermutationCombinationQuestion, PermutationCombinationQuestion, PermutationCombinationVariantId } from '@/lib/practiceGenerators/permutationCombination';

export type PracticeDifficulty = 'easy' | 'medium' | 'hard';

export type PracticeGraphSpec = {
  width: number;
  height: number;
  window: { xMin: number; xMax: number; yMin: number; yMax: number };
  equalAspect?: boolean;
  axisLabelX?: string;
  axisLabelY?: string;
  caption?: string;
  plot: Array<
    | { kind: 'polyline'; points: Array<{ x: number; y: number }>; stroke: string; strokeWidth: number }
    | { kind: 'polygon'; points: Array<{ x: number; y: number }>; fill: string; fillOpacity: number; stroke?: string; strokeWidth?: number }
    | { kind: 'label'; at: { x: number; y: number }; text: string; fill?: string; fontSize?: number; anchor?: 'start' | 'middle' | 'end' }
    | { kind: 'point'; at: { x: number; y: number }; r?: number; fill: string; stroke?: string; strokeWidth?: number; fillOpacity?: number }
    | { kind: 'function'; fn: (x: number) => number; stroke: string; strokeWidth: number; yClip?: number }
  >;
};

export type KatexExplanationBlock =
  | { kind: 'text'; content: string }
  | { kind: 'math'; content: string; displayMode?: boolean }
  | {
    kind: 'long_division';
    divisorLatex: string;
    dividendLatex: string;
    quotientLatex: string;
    steps: Array<{ subLatex: string; remainderLatex: string }>;
  }
  | { kind: 'graph'; graphSpec: PracticeGraphSpec; altText: string };

export type PracticeTopicId =
  | 'quadratics'
  | 'linear_equations'
  | 'algebraic_factorisation'
  | 'fractions'
  | 'indices'
  | 'permutation_combination'
  | 'polynomials'
  | 'simultaneous_equations'
  | 'graph_quadratic_line'
  | 'graph_straight_line'
  | 'graph_trigonometry'
  | 'graph_unit_circle'
  | 'word_problems'
  | 'differentiation'
  | 'integration';

export type PracticeQuestionBase = {
  id: string;
  topicId: PracticeTopicId;
  difficulty: PracticeDifficulty;
  seed: number;
  katexQuestion: string;
  katexExplanation: KatexExplanationBlock[];
};

export type PermutationCombinationPracticeQuestion = PermutationCombinationQuestion & PracticeQuestionBase;

export type QuadraticQuestion = {
  kind: 'quadratic';
  solutions: Fraction[]; // length 2, repeated-root duplicated
  solutionsLatex: string[];
} & PracticeQuestionBase;

export type LinearQuestion = {
  kind: 'linear';
  solution: Fraction;
  solutionLatex: string;
} & PracticeQuestionBase;

export type FractionsQuestion = {
  kind: 'fractions';
  variantId: FractionsVariantId;
  solution: Fraction;
  solutionLatex: string;
} & PracticeQuestionBase;

export type FractionsVariantId =
  | 'simplify_fraction'
  | 'add_sub_fractions'
  | 'fraction_of_number'
  | 'mixed_to_improper';

export type SimultaneousQuestion = {
  kind: 'simultaneous';
  solutionX: Fraction;
  solutionY: Fraction;
  solutionZ?: Fraction;
  solutionLatexX: string;
  solutionLatexY: string;
  solutionLatexZ?: string;
  variableCount?: 2 | 3;
} & PracticeQuestionBase;

export type IndicesQuestion = {
  kind: 'indices';
  // We ask for the resulting exponent only (numeric)
  base: string;
  exponent: number;
} & PracticeQuestionBase;

export type FactorisationQuestion = {
  kind: 'factorisation';
  // simple pattern: ax + ay
  a: number;
  xTerm: string;
  yTerm: string;
  expectedNormalized: string[];
  expectedFactors?: string[];
} & PracticeQuestionBase;

export type PolynomialsQuestion = {
  kind: 'polynomial';
  promptBlocks?: KatexExplanationBlock[];
  expectedNumber: number;
} & PracticeQuestionBase;

export type CalculusPracticeQuestion = {
  kind: 'calculus';
  // For now we treat calculus answers like factorisation-style normalized strings.
  expectedNormalized: string[];
} & PracticeQuestionBase;

export type GraphPracticeQuestion = {
  kind: 'graph';
  generatorParams: Record<string, any>;
  promptText: string;
  promptKatex?: string;
  katexOptions?: string[];
  correctIndex?: number;
  inputFields?: Array<{ id: string; label: string; kind: 'text' | 'number' }>;
  graphSpec?: {
    width: number;
    height: number;
    window: { xMin: number; xMax: number; yMin: number; yMax: number };
    equalAspect?: boolean;
    axisLabelX?: string;
    axisLabelY?: string;
    caption?: string;
    plot: Array<
      | { kind: 'polyline'; points: Array<{ x: number; y: number }>; stroke: string; strokeWidth: number }
      | { kind: 'polygon'; points: Array<{ x: number; y: number }>; fill: string; fillOpacity: number; stroke?: string; strokeWidth?: number }
      | { kind: 'label'; at: { x: number; y: number }; text: string; fill?: string; fontSize?: number; anchor?: 'start' | 'middle' | 'end' }
      | { kind: 'point'; at: { x: number; y: number }; r?: number; fill: string; stroke?: string; strokeWidth?: number; fillOpacity?: number }
      | { kind: 'function'; fn: (x: number) => number; stroke: string; strokeWidth: number; yClip?: number }
    >;
  };
  secondaryGraphSpec?: PracticeGraphSpec;
  svgDataUrl: string;
  svgAltText: string;
  katexExplanation: {
    steps: Array<{ katex: string; text: string }>;
    summary: string;
    commonMistake?: { katex: string; text: string };
  };
  hints?: Array<{ katex: string; text: string }>;
} & Omit<PracticeQuestionBase, 'katexExplanation'>;

export type PracticeQuestion =
  | QuadraticQuestion
  | LinearQuestion
  | FractionsQuestion
  | SimultaneousQuestion
  | IndicesQuestion
  | PermutationCombinationPracticeQuestion
  | PolynomialsQuestion
  | FactorisationQuestion
  | CalculusPracticeQuestion
  | WordProblemQuestion
  | GraphPracticeQuestion;

type Rng = {
  next: () => number;
  int: (min: number, max: number) => number;
};

function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  const next = () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return lo + Math.floor(next() * (hi - lo + 1));
  };
  return { next, int };
}

function frac(n: number, d: number): Fraction {
  return normalizeFraction({ n, d });
}

function stableId(prefix: string, seed: number, suffix: string) {
  return `${prefix}-${seed}-${suffix}`;
}

function nonZeroInt(rng: Rng, min: number, max: number) {
  let v = 0;
  while (v === 0) v = rng.int(min, max);
  return v;
}

function difficultyRange(difficulty: PracticeDifficulty) {
  if (difficulty === 'easy') return 5;
  if (difficulty === 'hard') return 15;
  return 10;
}

export function generatePracticeQuestion(input: {
  topicId: PracticeTopicId;
  difficulty: PracticeDifficulty;
  seed: number;
  avoidVariantId?: string;
  variantWeights?: Record<string, number>;
}): PracticeQuestion {
  switch (input.topicId) {
    case 'linear_equations':
      return generateLinear(input);
    case 'fractions':
      return generateFractions({
        topicId: 'fractions',
        difficulty: input.difficulty,
        seed: input.seed,
        avoidVariantId: input.avoidVariantId as FractionsVariantId | undefined,
        variantWeights: input.variantWeights,
      });
    case 'indices':
      return generateIndices(input);
    case 'permutation_combination': {
      const q = generatePermutationCombinationQuestion({
        seed: input.seed,
        difficulty: input.difficulty,
        avoidVariantId: input.avoidVariantId as PermutationCombinationVariantId | undefined,
        variantWeights: input.variantWeights,
      });
      return {
        ...(q as any),
        // Ensure base shape aligns with PracticeQuestionBase.
        topicId: 'permutation_combination',
        seed: input.seed,
        difficulty: input.difficulty,
        katexQuestion: q.katexQuestion,
        katexExplanation: q.katexExplanation,
      } as any;
    }
    case 'polynomials': {
      const q = generatePolynomialsQuestion({ seed: input.seed, difficulty: input.difficulty });
      return {
        kind: 'polynomial',
        id: q.id,
        topicId: 'polynomials',
        difficulty: input.difficulty,
        seed: input.seed,
        katexQuestion: q.katexQuestion,
        promptBlocks: q.promptBlocks as any,
        katexExplanation: q.katexExplanation,
        expectedNumber: q.expectedNumber,
      };
    }
    case 'simultaneous_equations':
      return generateSimultaneous({
        topicId: 'simultaneous_equations',
        difficulty: input.difficulty,
        seed: input.seed,
        variantWeights: input.variantWeights,
      });
    case 'algebraic_factorisation':
      return generateFactorisation({
        topicId: 'algebraic_factorisation',
        difficulty: input.difficulty,
        seed: input.seed,
        variantWeights: input.variantWeights,
      });
    case 'graph_quadratic_line':
      return generateGraphQuadraticLineMcq(input);
    case 'graph_straight_line':
      return generateGraphStraightLineMcq({
        topicId: 'graph_straight_line',
        difficulty: input.difficulty,
        seed: input.seed,
        variantWeights: input.variantWeights,
      });
    case 'graph_trigonometry': {
      const rng = mulberry32((input.seed ^ 0x9e3779b9) >>> 0);
      const weights = input.variantWeights;
      const unitCircleWeight = typeof weights?.unit_circle === 'number'
        ? Math.max(0, weights.unit_circle)
        : (input.difficulty === 'easy' ? 75 : input.difficulty === 'medium' ? 70 : 65);
      const ratioQuadrantWeight = typeof weights?.ratio_quadrant === 'number' ? Math.max(0, weights.ratio_quadrant) : 10;
      const identitySimplifyWeight = typeof weights?.identity_simplify === 'number'
        ? Math.max(0, weights.identity_simplify)
        : (input.difficulty === 'hard' ? 35 : 0);

      const total = unitCircleWeight + ratioQuadrantWeight + identitySimplifyWeight;
      const pick = total <= 0 ? 0 : rng.next() * total;

      if (pick < unitCircleWeight) {
        return generateGraphUnitCircleMcq({
          topicId: 'graph_trigonometry',
          difficulty: input.difficulty,
          seed: input.seed,
        });
      }

      if (pick < unitCircleWeight + identitySimplifyWeight) {
        return generateGraphTrigonometryMcq({
          topicId: 'graph_trigonometry',
          difficulty: input.difficulty,
          seed: input.seed,
          variantWeights: {
            ratio_quadrant: ratioQuadrantWeight,
            identity_simplify: identitySimplifyWeight,
          },
        });
      }

      return generateGraphTrigonometryMcq({
        topicId: 'graph_trigonometry',
        difficulty: input.difficulty,
        seed: input.seed,
        // Forward internal weights for the non-unit-circle variants.
        variantWeights: {
          ratio_quadrant: ratioQuadrantWeight,
          identity_simplify: identitySimplifyWeight,
        },
      });
    }
    case 'graph_unit_circle':
      return generateCircularMeasureGraphQuestion({
        topicId: 'graph_unit_circle',
        difficulty: input.difficulty,
        seed: input.seed,
        avoidKind: input.avoidVariantId as any,
      });
    case 'word_problems':
      return generateWordProblemQuestion({
        seed: input.seed,
        difficulty: input.difficulty,
        avoidVariantId: input.avoidVariantId as WordProblemVariantId | undefined,
        variantWeights: input.variantWeights,
      });
    case 'differentiation': {
      const q = generateDifferentiationQuestion({ seed: input.seed, difficulty: input.difficulty, variantWeights: input.variantWeights });
      return {
        kind: 'calculus',
        id: q.id,
        topicId: 'differentiation',
        difficulty: input.difficulty,
        seed: input.seed,
        katexQuestion: q.katexQuestion,
        katexExplanation: q.katexExplanation,
        expectedNormalized: q.expectedNormalized,
        expectedNormalizedNote: undefined,
        expectedLatex: q.expectedLatex,
        expectedParts: (q as any).expectedParts,
        normalize: q.normalize,
      } as any;
    }
    case 'integration': {
      const q = generateIntegrationQuestion({ seed: input.seed, difficulty: input.difficulty, variantWeights: input.variantWeights });
      return {
        kind: 'calculus',
        id: q.id,
        topicId: 'integration',
        difficulty: input.difficulty,
        seed: input.seed,
        katexQuestion: q.katexQuestion,
        katexExplanation: q.katexExplanation,
        expectedNormalized: q.expectedNormalized,
      };
    }
    default:
      // Quadratics remain implemented elsewhere; the Practice page currently uses the dedicated quadratic generator.
      // This function is for additional topics.
      return generateLinear({ ...input, topicId: 'linear_equations' });
  }
}

function generateCircularMeasureGraphQuestion(input: {
  topicId: 'graph_unit_circle';
  difficulty: PracticeDifficulty;
  seed: number;
  avoidKind?: string;
}): GraphPracticeQuestion {
  const p = generateCircularMeasureProblem({ seed: input.seed, difficulty: input.difficulty, avoidKind: input.avoidKind as any });
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.svg)}`;
  const expectsNumber = typeof p.answerValue === 'number' && Number.isFinite(p.answerValue);

  const expectedFormat = expectsNumber
    ? (/^-?\d+\.\d{2}$/.test(String(p.answerLatex)) ? 'fixed2' : 'number')
    : 'latex';
  const expectedValue = expectsNumber && expectedFormat === 'fixed2' ? Number((p.answerValue as number).toFixed(2)) : p.answerValue;

  // Circular-measure questions should render as KaTeX-only prompts.
  // We intentionally omit the separate plain-text prompt so the UI shows
  // only promptKatex for this topic.
  const promptText = '';
  const promptKatex = expectedFormat === 'fixed2'
    ? String.raw`${p.promptKatex}
\;\text{(Give your answer to 2 decimal places.)}`
    : p.promptKatex;

  return {
    kind: 'graph',
    id: p.id,
    topicId: input.topicId,
    difficulty: input.difficulty,
    seed: input.seed,
    generatorParams: {
      circularMeasure: true,
      expectedLatex: p.answerLatex,
      expectedValue,
      expectedFormat,
      kind: p.kind,
    },
    promptText,
    promptKatex,
    katexQuestion: '',
    inputFields: [{ id: 'ans', label: 'Answer', kind: expectsNumber ? 'number' : 'text' }],
    svgDataUrl,
    svgAltText: p.svgAltText,
    katexExplanation: {
      steps: p.steps,
      summary: 'Use the correct circular-measure formula and rearrange if needed.',
    },
  };
}

function generateLinear(input: { topicId: PracticeTopicId; difficulty: PracticeDifficulty; seed: number }): LinearQuestion {
  const rng = mulberry32(input.seed);
  const R = difficultyRange(input.difficulty);

  // Generate: ax + b = c with integer solution.
  const a = nonZeroInt(rng, 1, input.difficulty === 'hard' ? 9 : 5);
  const x = rng.int(-R, R);
  const b = rng.int(-R, R);
  const c = a * x + b;

  const solution = frac(c - b, a);
  const solutionLatex = fractionToLatex(solution);

  const eq = `${a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${c}`;

  const explanation: KatexExplanationBlock[] = [
    { kind: 'text', content: 'We want to find the value of x.' },
    { kind: 'math', content: eq, displayMode: true },
    { kind: 'text', content: 'First, we move the constant term to the other side by subtracting it from both sides.' },
    { kind: 'math', content: `${a}x = ${c} ${b < 0 ? '+' : '-'} ${Math.abs(b)}`, displayMode: true },
    { kind: 'math', content: `${a}x = ${c - b}`, displayMode: true },
    { kind: 'text', content: `Now we divide both sides by ${a} to get x.` },
    { kind: 'math', content: `x = \\frac{${c - b}}{${a}}`, displayMode: true },
    { kind: 'math', content: `x = ${solutionLatex}`, displayMode: true },
  ];

  return {
    kind: 'linear',
    id: stableId('linear', input.seed, `${a}-${b}-${c}`),
    topicId: 'linear_equations',
    difficulty: input.difficulty,
    seed: input.seed,
    katexQuestion: eq,
    katexExplanation: explanation,
    solution,
    solutionLatex,
  };
}

function generateFractions(input: {
  topicId: PracticeTopicId;
  difficulty: PracticeDifficulty;
  seed: number;
  avoidVariantId?: FractionsVariantId;
  variantWeights?: Record<string, number>;
}): FractionsQuestion {
  const rng = mulberry32(input.seed);

  const pickVariant = (): FractionsVariantId => {
    const all: FractionsVariantId[] = ['simplify_fraction', 'add_sub_fractions', 'fraction_of_number', 'mixed_to_improper'];
    const pool = all.filter((v) => v !== input.avoidVariantId);
    const weights = pool.map((k) => {
      const w = (input.variantWeights as any)?.[k];
      return typeof w === 'number' ? Math.max(0, Number(w)) : 1;
    });
    // difficulty gating
    const allowed = pool.filter((v, idx) => {
      if (input.difficulty === 'easy') return v === 'simplify_fraction' || v === 'fraction_of_number';
      if (input.difficulty === 'medium') return v !== 'mixed_to_improper';
      return true;
    });
    const allowedWeights = allowed.map((v) => weights[pool.indexOf(v)] ?? 1);
    const total = allowedWeights.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return allowed[rng.int(0, allowed.length - 1)]!;
    let r = rng.next() * total;
    for (let i = 0; i < allowed.length; i++) {
      r -= allowedWeights[i]!;
      if (r <= 0) return allowed[i]!;
    }
    return allowed[allowed.length - 1]!;
  };

  const variantId = pickVariant();

  const gcdInt = (x: number, y: number): number => {
    let A = Math.abs(x);
    let B = Math.abs(y);
    while (B !== 0) {
      const t = A % B;
      A = B;
      B = t;
    }
    return A;
  };

  const makeReducibleFraction = () => {
    const factorMax = input.difficulty === 'easy' ? 9 : input.difficulty === 'medium' ? 12 : 18;
    const aMax = input.difficulty === 'easy' ? 12 : input.difficulty === 'medium' ? 18 : 25;
    const bMax = input.difficulty === 'easy' ? 14 : input.difficulty === 'medium' ? 22 : 35;

    let tries = 0;
    while (tries < 200) {
      tries += 1;
      const k = rng.int(2, factorMax);
      const a = rng.int(1, aMax);
      const b = rng.int(2, bMax);
      if (gcdInt(a, b) !== 1) continue;
      const n = a * k;
      const d = b * k;
      if (d === 0) continue;
      if (n === d) continue;
      if (n > d * 3) continue;
      return { n, d };
    }
    return { n: 12, d: 30 };
  };

  const simplifyFractionVariant = () => {
    const f = makeReducibleFraction();
    const hcf = gcdInt(f.n, f.d);
    const sn = f.n / hcf;
    const sd = f.d / hcf;
    const sol = frac(sn, sd);
    const qLatex = String.raw`\text{Write~}\frac{${f.n}}{${f.d}}\text{~in~its~simplest~form.}`;
    const solLatex = fractionToLatex(sol);
    const explanation: KatexExplanationBlock[] = [
      { kind: 'text', content: `Find the highest common factor (HCF) of ${f.n} and ${f.d}.` },
      { kind: 'text', content: `The HCF is ${hcf}.` },
      { kind: 'math', content: String.raw`\frac{${f.n}}{${f.d}} = \frac{${f.n}\div ${hcf}}{${f.d}\div ${hcf}}`, displayMode: true },
      { kind: 'math', content: String.raw`= ${solLatex}`, displayMode: true },
    ];
    return { qLatex, explanation, sol, idSuffix: `simplify-${f.n}-${f.d}` };
  };

  const addSubVariant = () => {
    const maxD = input.difficulty === 'easy' ? 8 : input.difficulty === 'medium' ? 12 : 18;
    const a = rng.int(1, input.difficulty === 'hard' ? 15 : 12);
    const b = rng.int(2, maxD);
    const c = rng.int(1, input.difficulty === 'hard' ? 15 : 12);
    const d = rng.int(2, maxD);
    const op = rng.next() < 0.5 ? '+' : '-';
    const n = op === '+' ? a * d + c * b : a * d - c * b;
    const den = b * d;
    const sol = frac(n, den);
    const qLatex = String.raw`\text{Calculate: }\frac{${a}}{${b}}\;${op}\;\frac{${c}}{${d}}\text{ (give a simplified answer).}`;
    const solLatex = fractionToLatex(sol);
    const explanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'To add/subtract fractions, use a common denominator.' },
      { kind: 'math', content: String.raw`\frac{${a}}{${b}}\;${op}\;\frac{${c}}{${d}}`, displayMode: true },
      { kind: 'text', content: `Common denominator is ${b}\times ${d} = ${den}.` },
      { kind: 'math', content: String.raw`= \frac{${a}\cdot ${d}}{${b}\cdot ${d}}\;${op}\;\frac{${c}\cdot ${b}}{${d}\cdot ${b}}`, displayMode: true },
      { kind: 'math', content: String.raw`= \frac{${a * d} \;${op}\; ${c * b}}{${den}}`, displayMode: true },
      { kind: 'math', content: String.raw`= \frac{${n}}{${den}}`, displayMode: true },
      { kind: 'text', content: 'Finally, simplify the fraction if possible.' },
      { kind: 'math', content: String.raw`= ${solLatex}`, displayMode: true },
    ];
    return { qLatex, explanation, sol, idSuffix: `addsub-${a}-${b}-${c}-${d}-${op}` };
  };

  const fractionOfNumberVariant = () => {
    const denom = rng.int(2, input.difficulty === 'hard' ? 15 : 12);
    const num = rng.int(1, denom - 1);
    const k = rng.int(2, input.difficulty === 'hard' ? 30 : 18);
    const whole = denom * k;
    const ans = (num * whole) / denom;
    const sol = frac(ans, 1);
    const qLatex = String.raw`\text{Find }\frac{${num}}{${denom}}\text{ of }${whole}\text{.}`;
    const explanation: KatexExplanationBlock[] = [
      { kind: 'text', content: '“Fraction of a number” means multiply the number by the fraction.' },
      { kind: 'math', content: String.raw`\frac{${num}}{${denom}}\times ${whole}`, displayMode: true },
      { kind: 'text', content: `First divide ${whole} by ${denom}, then multiply by ${num}.` },
      { kind: 'math', content: String.raw`${whole}\div ${denom} = ${whole / denom}`, displayMode: true },
      { kind: 'math', content: String.raw`${whole / denom}\times ${num} = ${ans}`, displayMode: true },
      { kind: 'math', content: String.raw`\boxed{${ans}}`, displayMode: true },
    ];
    return { qLatex, explanation, sol, idSuffix: `fracof-${num}-${denom}-${whole}` };
  };

  const mixedToImproperVariant = () => {
    const d = rng.int(2, input.difficulty === 'hard' ? 15 : 12);
    const a = rng.int(1, d - 1);
    const w = rng.int(1, input.difficulty === 'hard' ? 9 : 6);
    const n = w * d + a;
    const sol = frac(n, d);
    const qLatex = String.raw`\text{Write }${w}\;\frac{${a}}{${d}}\text{ as an improper fraction in simplest form.}`;
    const solLatex = fractionToLatex(sol);
    const explanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'To convert a mixed number to an improper fraction:' },
      { kind: 'text', content: 'Multiply the whole number by the denominator, then add the numerator.' },
      { kind: 'math', content: String.raw`${w}\;\frac{${a}}{${d}} = \frac{${w}\cdot ${d} + ${a}}{${d}}`, displayMode: true },
      { kind: 'math', content: String.raw`= \frac{${n}}{${d}}`, displayMode: true },
      { kind: 'math', content: String.raw`= ${solLatex}`, displayMode: true },
    ];
    return { qLatex, explanation, sol, idSuffix: `mixed-${w}-${a}-${d}` };
  };

  const chosen = (() => {
    if (variantId === 'simplify_fraction') return simplifyFractionVariant();
    if (variantId === 'add_sub_fractions') return addSubVariant();
    if (variantId === 'fraction_of_number') return fractionOfNumberVariant();
    return mixedToImproperVariant();
  })();

  return {
    kind: 'fractions',
    variantId,
    id: stableId('fractions', input.seed, `${variantId}-${chosen.idSuffix}`),
    topicId: 'fractions',
    difficulty: input.difficulty,
    seed: input.seed,
    katexQuestion: chosen.qLatex,
    katexExplanation: chosen.explanation,
    solution: chosen.sol,
    solutionLatex: fractionToLatex(chosen.sol),
  };
}

function generateIndices(input: { topicId: PracticeTopicId; difficulty: PracticeDifficulty; seed: number }): IndicesQuestion {
  const rng = mulberry32(input.seed);

  const base = rng.next() < 0.45 ? 'a' : rng.next() < 0.5 ? 'x' : 'y';
  const maxPow = input.difficulty === 'easy' ? 6 : input.difficulty === 'medium' ? 9 : 12;

  const allowNeg = input.difficulty !== 'easy';
  const allowDivision = input.difficulty !== 'easy' || rng.next() < 0.35;
  const allowPowerOfPower = input.difficulty === 'hard' || rng.next() < 0.35;

  const pow = () => {
    const v = rng.int(1, maxPow);
    if (!allowNeg) return v;
    return rng.next() < 0.25 ? -v : v;
  };

  const m = pow();
  const n = pow();

  let questionLatex = '';
  let exponent = 0;
  let explanation: KatexExplanationBlock[] = [];

  const pattern = (() => {
    const choices: Array<'mul' | 'div' | 'pow'> = ['mul'];
    if (allowDivision) choices.push('div');
    if (allowPowerOfPower) choices.push('pow');
    return choices[rng.int(0, choices.length - 1)];
  })();

  if (pattern === 'pow') {
    const outer = rng.int(2, input.difficulty === 'hard' ? 6 : 4);
    questionLatex = `(${base}^{${m}})^{${outer}}`;
    exponent = m * outer;
    explanation = [
      { kind: 'text', content: 'We want to simplify the expression using index laws.' },
      { kind: 'math', content: questionLatex, displayMode: true },
      { kind: 'text', content: 'When a power is raised to another power, we multiply the exponents.' },
      { kind: 'math', content: `(${base}^{${m}})^{${outer}} = ${base}^{${m}\\times ${outer}} = ${base}^{${exponent}}`, displayMode: true },
    ];
  } else if (pattern === 'div') {
    questionLatex = `\\frac{${base}^{${m}}}{${base}^{${n}}}`;
    exponent = m - n;
    explanation = [
      { kind: 'text', content: 'We want to simplify the expression using index laws.' },
      { kind: 'math', content: questionLatex, displayMode: true },
      { kind: 'text', content: 'When we divide powers with the same base, we subtract the exponents.' },
      { kind: 'math', content: `\\frac{${base}^{${m}}}{${base}^{${n}}} = ${base}^{${m}-${n}} = ${base}^{${exponent}}`, displayMode: true },
    ];
  } else {
    questionLatex = `${base}^{${m}}\\cdot\\,${base}^{${n}}`;
    exponent = m + n;
    explanation = [
      { kind: 'text', content: 'We want to simplify the expression using index laws.' },
      { kind: 'math', content: questionLatex, displayMode: true },
      { kind: 'text', content: 'When we multiply powers with the same base, we add the exponents.' },
      { kind: 'math', content: `${base}^{${m}}\\cdot\\,${base}^{${n}} = ${base}^{${m + n}}`, displayMode: true },
    ];
  }

  return {
    kind: 'indices',
    id: stableId('indices', input.seed, `${base}-${m}-${n}-${pattern}-${exponent}`),
    topicId: 'indices',
    difficulty: input.difficulty,
    seed: input.seed,
    katexQuestion: questionLatex,
    katexExplanation: explanation,
    base,
    exponent,
  };
}

function generateSimultaneous(input: { topicId: PracticeTopicId; difficulty: PracticeDifficulty; seed: number; variantWeights?: Record<string, number> }): SimultaneousQuestion {
  const rng = mulberry32(input.seed);
  const R = difficultyRange(input.difficulty);

  const variant = (() => {
    if (input.difficulty !== 'hard') return 'two_var' as const;
    const w = input.variantWeights ?? {};
    const w2 = Math.max(0, Number(w.two_var ?? 70));
    const w3 = Math.max(0, Number(w.three_var ?? 30));
    const total = w2 + w3;
    if (!(total > 0)) return (rng.next() < 0.3 ? ('three_var' as const) : ('two_var' as const));
    return (rng.next() * total < w3 ? ('three_var' as const) : ('two_var' as const));
  })();

  const fmtTerm = (coeff: number, name: string, isFirst: boolean) => {
    if (coeff === 0) return '';
    const abs = Math.abs(coeff);
    const coeffStr = abs === 1 ? '' : String(abs);
    if (isFirst) {
      return coeff < 0 ? `-${coeffStr}${name}` : `${coeffStr}${name}`;
    }
    return coeff < 0 ? `- ${coeffStr}${name}` : `+ ${coeffStr}${name}`;
  };

  const buildEq = (a: number, b: number, c: number | null, rhs: number) => {
    const parts: string[] = [];
    const first = (t: string) => {
      if (t) parts.push(t);
    };
    const next = (t: string) => {
      if (t) parts.push(t);
    };
    first(fmtTerm(a, 'x', true));
    next(fmtTerm(b, 'y', parts.length === 0));
    if (typeof c === 'number') next(fmtTerm(c, 'z', parts.length === 0));
    if (!parts.length) parts.push('0');
    return `${parts.join(' ')} = ${rhs}`;
  };

  if (variant === 'three_var') {
    const x = rng.int(-R, R);
    const y = rng.int(-R, R);
    const z = rng.int(-R, R);

    const maxC = 7;
    const pickCoeff = () => nonZeroInt(rng, 1, maxC) * (rng.next() < 0.5 ? 1 : -1);

    // Build a 3x3 system with non-zero determinant.
    for (let attempt = 0; attempt < 30; attempt++) {
      const a1 = pickCoeff();
      const b1 = pickCoeff();
      const c1 = pickCoeff();
      const a2 = pickCoeff();
      const b2 = pickCoeff();
      const c2 = pickCoeff();
      const a3 = pickCoeff();
      const b3 = pickCoeff();
      const c3 = pickCoeff();

      const det =
        a1 * (b2 * c3 - c2 * b3) -
        b1 * (a2 * c3 - c2 * a3) +
        c1 * (a2 * b3 - b2 * a3);
      if (!Number.isFinite(det) || det === 0) continue;

      const d1 = a1 * x + b1 * y + c1 * z;
      const d2 = a2 * x + b2 * y + c2 * z;
      const d3 = a3 * x + b3 * y + c3 * z;

      const eq1 = buildEq(a1, b1, c1, d1);
      const eq2 = buildEq(a2, b2, c2, d2);
      const eq3 = buildEq(a3, b3, c3, d3);

      const solutionX = frac(x, 1);
      const solutionY = frac(y, 1);
      const solutionZ = frac(z, 1);
      const solutionLatexX = fractionToLatex(solutionX);
      const solutionLatexY = fractionToLatex(solutionY);
      const solutionLatexZ = fractionToLatex(solutionZ);

      // Work a concrete elimination so the explanation is fully expanded and reproducible.
      // Eliminate x:
      // (E2') = a1*(Eq2) - a2*(Eq1)
      // (E3') = a1*(Eq3) - a3*(Eq1)
      const y21 = a1 * b2 - a2 * b1;
      const z21 = a1 * c2 - a2 * c1;
      const r21 = a1 * d2 - a2 * d1;
      const y31 = a1 * b3 - a3 * b1;
      const z31 = a1 * c3 - a3 * c1;
      const r31 = a1 * d3 - a3 * d1;

      // Eliminate y from the 2x2 system:
      // (E) = y31*(E2') - y21*(E3') => zCoeff*z = rhs
      const zCoeff = y31 * z21 - y21 * z31;
      const rhsZ = y31 * r21 - y21 * r31;

      const explanation: KatexExplanationBlock[] = [
        { kind: 'text', content: 'We want to find x, y, and z that satisfy all three equations.' },
        { kind: 'math', content: String.raw`\begin{aligned} ${eq1} \\ ${eq2} \\ ${eq3} \end{aligned}`, displayMode: true },
        { kind: 'text', content: 'Because there are three variables, we eliminate one variable at a time (Gaussian elimination approach). A clean first step is to eliminate x using equation (1).' },

        { kind: 'text', content: 'Step 1: Eliminate x between (1) and (2). Multiply (2) by the x-coefficient of (1), and multiply (1) by the x-coefficient of (2), then subtract.' },
        { kind: 'math', content: String.raw`${a1}\times(2)
\; -\; ${a2}\times(1)`, displayMode: true },
        { kind: 'math', content: String.raw`${y21}y ${z21 < 0 ? '-' : '+'} ${Math.abs(z21)}z = ${r21}`, displayMode: true },

        { kind: 'text', content: 'Step 2: Eliminate x between (1) and (3) in the same way.' },
        { kind: 'math', content: String.raw`${a1}\times(3)
\; -\; ${a3}\times(1)`, displayMode: true },
        { kind: 'math', content: String.raw`${y31}y ${z31 < 0 ? '-' : '+'} ${Math.abs(z31)}z = ${r31}`, displayMode: true },

        { kind: 'text', content: 'Now we have two equations in y and z. Next we eliminate y to solve for z.' },
        { kind: 'text', content: 'Step 3: Eliminate y. Multiply the first (y,z) equation by the y-coefficient of the second, and multiply the second by the y-coefficient of the first, then subtract.' },
        { kind: 'math', content: String.raw`${y31}\times(${y21}y ${z21 < 0 ? '-' : '+'} ${Math.abs(z21)}z = ${r21})
\; -\; ${y21}\times(${y31}y ${z31 < 0 ? '-' : '+'} ${Math.abs(z31)}z = ${r31})`, displayMode: true },
        { kind: 'math', content: String.raw`${zCoeff}z = ${rhsZ}`, displayMode: true },
        { kind: 'math', content: String.raw`z = ${solutionLatexZ}`, displayMode: true },

        { kind: 'text', content: 'Step 4: Substitute z back into either of the (y,z) equations to find y.' },
        { kind: 'math', content: String.raw`${y21}y ${z21 < 0 ? '-' : '+'} ${Math.abs(z21)}(${solutionLatexZ}) = ${r21}`, displayMode: true },
        { kind: 'math', content: String.raw`y = ${solutionLatexY}`, displayMode: true },

        { kind: 'text', content: 'Step 5: Substitute y and z into any original equation (e.g. (1)) to find x.' },
        { kind: 'math', content: String.raw`${a1}x ${b1 < 0 ? '-' : '+'} ${Math.abs(b1)}(${solutionLatexY}) ${c1 < 0 ? '-' : '+'} ${Math.abs(c1)}(${solutionLatexZ}) = ${d1}`, displayMode: true },
        { kind: 'math', content: String.raw`x = ${solutionLatexX}`, displayMode: true },

        { kind: 'text', content: 'Final check: these values should satisfy all three original equations when substituted back.' },
        { kind: 'math', content: String.raw`\text{Solution: }x=${solutionLatexX},\; y=${solutionLatexY},\; z=${solutionLatexZ}`, displayMode: true },
      ];

      return {
        kind: 'simultaneous',
        id: stableId('simul3', input.seed, `${a1}-${b1}-${c1}-${d1}-${a2}-${b2}-${c2}-${d2}-${a3}-${b3}-${c3}-${d3}`),
        topicId: 'simultaneous_equations',
        difficulty: input.difficulty,
        seed: input.seed,
        katexQuestion: String.raw`\begin{aligned} ${eq1} \\ ${eq2} \\ ${eq3} \end{aligned}`,
        katexExplanation: explanation,
        solutionX,
        solutionY,
        solutionZ,
        solutionLatexX,
        solutionLatexY,
        solutionLatexZ,
        variableCount: 3,
      };
    }

    return generateSimultaneous({ ...input, seed: input.seed + 1, topicId: 'simultaneous_equations', variantWeights: input.variantWeights });
  }

  // Choose integer solution first.
  const x = rng.int(-R, R);
  const y = rng.int(-R, R);
  // Choose coefficients.
  const a1 = nonZeroInt(rng, 1, input.difficulty === 'hard' ? 9 : 5);
  const b1 = nonZeroInt(rng, 1, input.difficulty === 'hard' ? 9 : 5);
  const a2 = nonZeroInt(rng, 1, input.difficulty === 'hard' ? 9 : 5);
  const b2 = nonZeroInt(rng, 1, input.difficulty === 'hard' ? 9 : 5);

  // Ensure not parallel: a1/b1 != a2/b2
  if (a1 * b2 === a2 * b1) {
    // tweak b2 deterministically
    const b2t = b2 + 1;
    return generateSimultaneous({ ...input, seed: input.seed + 1, topicId: 'simultaneous_equations' });
  }

  const c1 = a1 * x + b1 * y;
  const c2 = a2 * x + b2 * y;

  const eq1 = `${a1}x ${b1 < 0 ? '-' : '+'} ${Math.abs(b1)}y = ${c1}`;
  const eq2 = `${a2}x ${b2 < 0 ? '-' : '+'} ${Math.abs(b2)}y = ${c2}`;

  const solutionX = frac(x, 1);
  const solutionY = frac(y, 1);
  const solutionLatexX = fractionToLatex(solutionX);
  const solutionLatexY = fractionToLatex(solutionY);

  const explanation: KatexExplanationBlock[] = [
    { kind: 'text', content: 'We want to find x and y that satisfy both equations.' },
    { kind: 'math', content: eq1, displayMode: true },
    { kind: 'math', content: eq2, displayMode: true },
    { kind: 'text', content: 'We will use elimination. First, we make the x-coefficients the same.' },
    { kind: 'math', content: `${a2}\\times(${eq1})`, displayMode: true },
    { kind: 'math', content: `${a1}\\times(${eq2})`, displayMode: true },
    { kind: 'math', content: `${a1 * a2}x + ${a2 * b1}y = ${a2 * c1}`, displayMode: true },
    { kind: 'math', content: `${a1 * a2}x + ${a1 * b2}y = ${a1 * c2}`, displayMode: true },
    { kind: 'text', content: 'Now subtract the second equation from the first to eliminate x.' },
    { kind: 'math', content: `(${a2 * b1} - ${a1 * b2})y = ${a2 * c1 - a1 * c2}`, displayMode: true },
    { kind: 'math', content: `y = ${solutionLatexY}`, displayMode: true },
    { kind: 'text', content: 'Now substitute y back into one of the original equations to find x.' },
    { kind: 'math', content: `x = ${solutionLatexX}`, displayMode: true },
  ];

  return {
    kind: 'simultaneous',
    id: stableId('simul', input.seed, `${a1}-${b1}-${c1}-${a2}-${b2}-${c2}`),
    topicId: 'simultaneous_equations',
    difficulty: input.difficulty,
    seed: input.seed,
    katexQuestion: `\\begin{aligned} ${eq1} \\\\ ${eq2} \\end{aligned}`,
    katexExplanation: explanation,
    solutionX,
    solutionY,
    solutionLatexX,
    solutionLatexY,
    variableCount: 2,
  };
}

function generateFactorisation(input: { topicId: PracticeTopicId; difficulty: PracticeDifficulty; seed: number; variantWeights?: Record<string, number> }): FactorisationQuestion {
  const rng = mulberry32(input.seed);
  const maxA = input.difficulty === 'easy' ? 6 : input.difficulty === 'medium' ? 12 : 20;
  const a = nonZeroInt(rng, 2, maxA);

  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

  const factorVariant = (() => {
    const w = input.variantWeights ?? {};
    const pickWeighted = (choices: Array<{ id: 'simple' | 'x2' | 'x3' | 'x3_3term' | 'gcf_binomial' | 'gcf_quadratic'; w: number }>) => {
      let total = 0;
      for (const c of choices) total += Math.max(0, c.w);
      if (!(total > 0)) return null;
      let r = rng.next() * total;
      for (const c of choices) {
        r -= Math.max(0, c.w);
        if (r <= 0) return c.id;
      }
      return choices[choices.length - 1]!.id;
    };

    // Default distribution (fallback if no weights configured).
    if (input.difficulty === 'easy') {
      return (pickWeighted([
        { id: 'simple', w: Number(w.simple ?? 1) },
        { id: 'x2', w: Number(w.x2 ?? 0) },
        { id: 'x3', w: Number(w.x3 ?? 0) },
        { id: 'x3_3term', w: Number(w.x3_3term ?? 0) },
        { id: 'gcf_binomial', w: Number(w.gcf_binomial ?? 0) },
        { id: 'gcf_quadratic', w: Number(w.gcf_quadratic ?? 0) },
      ]) ?? 'simple');
    }

    if (input.difficulty === 'medium') {
      const picked = pickWeighted([
        { id: 'simple', w: Number(w.simple ?? 2) },
        { id: 'x2', w: Number(w.x2 ?? 2) },
        { id: 'x3', w: Number(w.x3 ?? 0) },
        { id: 'x3_3term', w: Number(w.x3_3term ?? 0) },
        { id: 'gcf_binomial', w: Number(w.gcf_binomial ?? 4) },
        { id: 'gcf_quadratic', w: Number(w.gcf_quadratic ?? 2) },
      ]);
      if (picked) return picked;
      const roll = rng.int(0, 9);
      return roll < 2 ? 'simple' : roll < 4 ? 'x2' : roll < 8 ? 'gcf_binomial' : 'gcf_quadratic';
    }

    const picked = pickWeighted([
      { id: 'simple', w: Number(w.simple ?? 1) },
      { id: 'x2', w: Number(w.x2 ?? 1) },
      { id: 'x3', w: Number(w.x3 ?? 1) },
      { id: 'x3_3term', w: Number(w.x3_3term ?? 1) },
      { id: 'gcf_binomial', w: Number(w.gcf_binomial ?? 3) },
      { id: 'gcf_quadratic', w: Number(w.gcf_quadratic ?? 5) },
    ]);
    if (picked) return picked;
    const roll = rng.int(0, 9);
    return roll < 1 ? 'simple' : roll < 2 ? 'x2' : roll < 3 ? 'x3' : roll < 4 ? 'x3_3term' : roll < 7 ? 'gcf_binomial' : 'gcf_quadratic';
  })() as 'simple' | 'x2' | 'x3' | 'x3_3term' | 'gcf_binomial' | 'gcf_quadratic';

  let xTerm = 'x';
  let yTerm = 'y';
  let questionLatex = '';
  let expectedNormalized: string[] = [];
  let explanation: KatexExplanationBlock[] = [];
  let expectedFactors: string[] | undefined = undefined;

  const gcd = (u: number, v: number): number => {
    let a0 = Math.abs(u);
    let b0 = Math.abs(v);
    while (b0 !== 0) {
      const t = a0 % b0;
      a0 = b0;
      b0 = t;
    }
    return a0;
  };

  const fmtSigned = (v: number) => (v < 0 ? `- ${Math.abs(v)}` : `+ ${v}`);
  const fmtSignedVar = (v: number, variable: string) => {
    const abs = Math.abs(v);
    const coeff = abs === 1 ? '' : String(abs);
    return v < 0 ? `- ${coeff}${variable}` : `+ ${coeff}${variable}`;
  };
  const fmtVarPow = (variable: string, pow: number) => {
    if (pow === 0) return '';
    if (pow === 1) return variable;
    return `${variable}^${pow}`;
  };
  const fmtCoeffVarPow = (coeff: number, variable: string, pow: number) => {
    const v = fmtVarPow(variable, pow);
    if (!v) return String(coeff);
    if (coeff === 1) return v;
    if (coeff === -1) return `-${v}`;
    return `${coeff}${v}`;
  };
  const buildExpectedFromFactors = (factors: string[]) => {
    const forms: string[] = [];

    const perms = (arr: string[]) => {
      if (arr.length <= 1) return [arr];
      if (arr.length === 2) return [[arr[0], arr[1]], [arr[1], arr[0]]];
      if (arr.length === 3) {
        const [a0, a1, a2] = arr;
        return [
          [a0, a1, a2],
          [a0, a2, a1],
          [a1, a0, a2],
          [a1, a2, a0],
          [a2, a0, a1],
          [a2, a1, a0],
        ];
      }
      return [arr];
    };

    for (const p of perms(factors)) {
      forms.push(p.join(''));
      forms.push(p.join('*'));
      // optional explicit parentheses around each factor
      forms.push(p.map((f) => `(${f})`).join(''));
      forms.push(p.map((f) => `(${f})`).join('*'));
    }

    return Array.from(new Set(forms.map(norm)));
  };

  const formatLinearFactor = (coeffX: number, constant: number, variable: string) => {
    const cx = coeffX === 1 ? variable : `${coeffX}${variable}`;
    if (constant === 0) return `(${cx})`;
    return `(${cx}${constant < 0 ? '-' : '+'}${Math.abs(constant)})`;
  };

  if (factorVariant === 'simple') {
    const vars = rng.next() < 0.5 ? ['x', 'y'] : ['a', 'b'];
    xTerm = vars[0];
    yTerm = vars[1];

    questionLatex = `${a}${xTerm} + ${a}${yTerm}`;

    expectedNormalized = [
      `${a}(${xTerm}+${yTerm})`,
      `${a}(${yTerm}+${xTerm})`,
      `${a}*(${xTerm}+${yTerm})`,
      `${a}*(${yTerm}+${xTerm})`,
    ].map(norm);

    const factor1 = String(a);
    const factor2 = `${xTerm}+${yTerm}`;
    const factor2b = `${yTerm}+${xTerm}`;
    expectedFactors = [factor1, factor2];
    expectedNormalized = Array.from(new Set(expectedNormalized.concat(buildExpectedFromFactors([factor1, factor2]), buildExpectedFromFactors([factor1, factor2b]))));

    explanation = [
      { kind: 'text', content: 'We want to factorise the expression.' },
      { kind: 'math', content: questionLatex, displayMode: true },
      { kind: 'text', content: `Both terms have a common factor of ${a}.` },
      { kind: 'text', content: 'So we take out the common factor.' },
      { kind: 'math', content: `${a}${xTerm} + ${a}${yTerm} = ${a}(${xTerm} + ${yTerm})`, displayMode: true },
    ];
  } else {
    // x^2 / x^3 common-factor questions.
    // Keep structure simple but more advanced: ax^k + ax^{k+1}.
    if (factorVariant === 'x3_3term') {
      const k = 3;
      const op1 = rng.next() < 0.5 ? '+' : '-';
      const op2 = rng.next() < 0.5 ? '+' : '-';
      const termHigh = `${a}x^${k + 2}`;
      const termMid = `${a}x^${k + 1}`;
      const termLow = `${a}x^${k}`;
      questionLatex = `${termHigh} ${op1} ${termMid} ${op2} ${termLow}`;

      const inside = `x^2 ${op1} x ${op2} 1`;
      expectedNormalized = [
        `${a}x^${k}(${inside})`,
        `${a}x^${k}*(${inside})`,
      ].map(norm);

      expectedFactors = [`${a}x^${k}`, `${inside}`];
      expectedNormalized = Array.from(new Set(expectedNormalized.concat(buildExpectedFromFactors(expectedFactors))));

      explanation = [
        { kind: 'text', content: 'We want to factorise the expression.' },
        { kind: 'math', content: questionLatex, displayMode: true },
        { kind: 'text', content: `All terms have a common factor of ${a}x^${k}.` },
        { kind: 'text', content: 'So we take out the common factor.' },
        {
          kind: 'math',
          content: `${termHigh} ${op1} ${termMid} ${op2} ${termLow} = ${a}x^${k}(${inside})`,
          displayMode: true,
        },
        { kind: 'text', content: 'You can also get the factor in brackets using polynomial long division:' },
        {
          kind: 'long_division',
          divisorLatex: `${a}x^${k}`,
          dividendLatex: `${termHigh} ${op1} ${termMid} ${op2} ${termLow}`,
          quotientLatex: `${inside}`,
          steps: [
            { subLatex: `${a}x^${k}(${inside})`, remainderLatex: '0' },
          ],
        },
      ];
    } else {
      const k = factorVariant === 'x2' ? 2 : 3;
      const op = rng.next() < 0.5 ? '+' : '-';

      // Always display in descending powers of x.
      const termHigh = `${a}x^${k + 1}`;
      const termLow = `${a}x^${k}`;
      questionLatex = `${termHigh} ${op} ${termLow}`;

      const inside = op === '+' ? `x+1` : `x-1`;
      expectedNormalized = [
        `${a}x^${k}(${inside})`,
        `${a}x^${k}*(${inside})`,
      ].map(norm);

      expectedFactors = [`${a}x^${k}`, `(${inside})`];
      expectedNormalized = Array.from(new Set(expectedNormalized.concat(buildExpectedFromFactors(expectedFactors))));

      explanation = [
        { kind: 'text', content: 'We want to factorise the expression.' },
        { kind: 'math', content: questionLatex, displayMode: true },
        { kind: 'text', content: `Both terms have a common factor of ${a}x^${k}.` },
        { kind: 'text', content: 'So we take out the common factor.' },
        {
          kind: 'math',
          content: `${termHigh} ${op} ${termLow} = ${a}x^${k}(${inside})`,
          displayMode: true,
        },
        { kind: 'text', content: 'You can also get the factor in brackets using polynomial long division:' },
        {
          kind: 'long_division',
          divisorLatex: `${a}x^${k}`,
          dividendLatex: `${termHigh} ${op} ${termLow}`,
          quotientLatex: `${inside}`,
          steps: [
            { subLatex: `${a}x^${k}(${inside})`, remainderLatex: '0' },
          ],
        },
      ];
    }
  }

  // Harder GCF-based variants (generated after the legacy ones so we can reuse the return shape).
  if (factorVariant === 'gcf_binomial') {
    const variable = rng.next() < 0.7 ? 'x' : (rng.next() < 0.5 ? 'a' : 'm');
    xTerm = variable;
    yTerm = '';

    const g = nonZeroInt(rng, input.difficulty === 'medium' ? 2 : 3, input.difficulty === 'medium' ? 15 : 24);
    const k = input.difficulty === 'medium' ? rng.int(1, 2) : rng.int(1, 3);
    const m = nonZeroInt(rng, input.difficulty === 'medium' ? 2 : 2, input.difficulty === 'medium' ? 8 : 12);
    const n = nonZeroInt(rng, input.difficulty === 'medium' ? -18 : -30, input.difficulty === 'medium' ? 18 : 30);
    const sign = rng.next() < 0.5 ? 1 : -1;

    // Keep factors in simplest form: use a monomial with a higher power rather than (monomial)^2.
    const squareCommon = input.difficulty === 'hard' && rng.next() < 0.45;

    const commonCoeff = squareCommon ? (g * sign) * (g * sign) : (g * sign);
    const commonPow = squareCommon ? 2 * k : k;
    // Ensure the binomial itself is primitive by pulling out any gcd(m, n) into the common factor.
    const d = gcd(m, n);
    const m2 = Math.trunc(m / (d || 1));
    const n2 = Math.trunc(n / (d || 1));
    const common2 = fmtCoeffVarPow(commonCoeff * (d || 1), variable, commonPow);
    const binom = `${m2}${variable} ${fmtSigned(n2)}`;

    const t1Coeff = (commonCoeff * (d || 1)) * m2;
    const t2Coeff = (commonCoeff * (d || 1)) * n2;
    const term1 = fmtCoeffVarPow(t1Coeff, variable, commonPow + 1);
    const term2 = fmtCoeffVarPow(t2Coeff, variable, commonPow);
    questionLatex = `${term1} ${t2Coeff < 0 ? '- ' : '+ '}${String(term2).replace(/^-/, '')}`;

    const f1 = common2;
    const f2 = binom;
    expectedFactors = [f1, f2];
    expectedNormalized = buildExpectedFromFactors(expectedFactors);

    explanation = [
      { kind: 'text', content: 'We want to factorise the expression completely.' },
      { kind: 'math', content: questionLatex, displayMode: true },
      { kind: 'text', content: `Both terms share a common factor of ${common2}.` },
      { kind: 'text', content: 'Factor out the common factor.' },
      { kind: 'math', content: `${questionLatex} = ${f1}(${f2})`, displayMode: true },
      { kind: 'text', content: 'You can also find the bracket using polynomial long division:' },
      {
        kind: 'long_division',
        divisorLatex: `${f1}`,
        dividendLatex: `${questionLatex}`,
        quotientLatex: `${f2}`,
        steps: [
          { subLatex: `${f1}(${f2})`, remainderLatex: '0' },
        ],
      },
    ];
  }

  if (factorVariant === 'gcf_quadratic') {
    const variable = 'x';
    xTerm = variable;
    yTerm = '';

    const g = nonZeroInt(rng, 2, input.difficulty === 'medium' ? 12 : 24);
    const k = input.difficulty === 'medium' ? rng.int(0, 1) : rng.int(0, 2);
    const sign = rng.next() < 0.55 ? 1 : -1;

    // Pick two binomials with non-trivial integer coefficients.
    const p = nonZeroInt(rng, 2, input.difficulty === 'medium' ? 6 : 9);
    const r = nonZeroInt(rng, 2, input.difficulty === 'medium' ? 6 : 9);
    const q = nonZeroInt(rng, input.difficulty === 'medium' ? -10 : -18, input.difficulty === 'medium' ? 10 : 18);
    const s = nonZeroInt(rng, input.difficulty === 'medium' ? -10 : -18, input.difficulty === 'medium' ? 10 : 18);

    // Make each binomial primitive by pulling out gcd(p,q) and gcd(r,s) into the common factor.
    const d1 = gcd(p, q);
    const d2 = gcd(r, s);
    const p1 = Math.trunc(p / (d1 || 1));
    const q1 = Math.trunc(q / (d1 || 1));
    const r1 = Math.trunc(r / (d2 || 1));
    const s1 = Math.trunc(s / (d2 || 1));

    const A = p1 * r1;
    const B = p1 * s1 + q1 * r1;
    const C = q1 * s1;

    const common = fmtCoeffVarPow(g * sign * (d1 || 1) * (d2 || 1), variable, k);
    // Expand out fully for the question.
    const lead = g * sign * (d1 || 1) * (d2 || 1) * A;
    const mid = g * sign * (d1 || 1) * (d2 || 1) * B;
    const con = g * sign * (d1 || 1) * (d2 || 1) * C;
    const leadTerm = fmtCoeffVarPow(lead, variable, k + 2);
    const midTerm = `${mid < 0 ? '- ' : '+ '}${Math.abs(mid)}${fmtVarPow(variable, k + 1)}`;
    const conTerm = `${con < 0 ? '- ' : '+ '}${Math.abs(con)}${fmtVarPow(variable, k)}`;
    questionLatex = `${leadTerm} ${midTerm} ${conTerm}`;

    const f1 = common;
    const f2 = `${p1}${variable} ${fmtSigned(q1)}`;
    const f3 = `${r1}${variable} ${fmtSigned(s1)}`;
    expectedFactors = [f1, f2, f3];
    expectedNormalized = buildExpectedFromFactors(expectedFactors);

    const innerPoly = `${A}${variable}^2 ${B < 0 ? '- ' : '+ '}${Math.abs(B)}${variable} ${C < 0 ? '- ' : '+ '}${Math.abs(C)}`;
    const divisor = `${p1}${variable} ${fmtSigned(q1)}`;
    const quotient = `${r1}${variable} ${fmtSigned(s1)}`;

    // Long division steps (handwritten-style layout).
    // Because A = p1*r1 and C = q1*s1, the division always terminates with remainder 0.
    const step1SubCoeff = q1 * r1;
    const step2SubConst = q1 * s1;
    const remCoeff = p1 * s1;

    const step1Product = `${A}${variable}^2 ${step1SubCoeff < 0 ? '- ' : '+ '}${Math.abs(step1SubCoeff)}${variable}`;
    const remainder1 = `${remCoeff}${variable} ${C < 0 ? '- ' : '+ '}${Math.abs(C)}`;
    const step2Product = `${remCoeff}${variable} ${step2SubConst < 0 ? '- ' : '+ '}${Math.abs(step2SubConst)}`;

    const longDivisionBlock: KatexExplanationBlock = {
      kind: 'long_division',
      divisorLatex: divisor,
      dividendLatex: innerPoly,
      quotientLatex: quotient,
      steps: [
        { subLatex: step1Product, remainderLatex: remainder1 },
        { subLatex: step2Product, remainderLatex: '0' },
      ],
    };

    explanation = [
      { kind: 'text', content: 'We want to factorise the expression completely.' },
      { kind: 'math', content: questionLatex, displayMode: true },
      { kind: 'text', content: `First factor out the common factor ${common}.` },
      { kind: 'math', content: `${questionLatex} = ${common}(${innerPoly})`, displayMode: true },
      { kind: 'text', content: 'Now factorise the quadratic in brackets.' },
      { kind: 'math', content: `${innerPoly} = (${f2})(${f3})`, displayMode: true },
      { kind: 'text', content: 'Check by expanding:' },
      {
        kind: 'math',
        content: String.raw`\begin{aligned}
(${f2})(${f3}) &= (${p1}x ${fmtSigned(q1)})(${r1}x ${fmtSigned(s1)})\\
&= (${p1}\cdot ${r1})x^2 + (${p1}\cdot ${s1} + ${q1}\cdot ${r1})x + (${q1}\cdot ${s1})\\
&= ${A}x^2 ${B < 0 ? '- ' : '+ '}${Math.abs(B)}x ${C < 0 ? '- ' : '+ '}${Math.abs(C)}
\end{aligned}`,
        displayMode: true,
      },
      { kind: 'text', content: 'Then factorise the remaining quadratic into two binomials.' },
      { kind: 'math', content: `${questionLatex} = ${f1}(${f2})(${f3})`, displayMode: true },
      { kind: 'text', content: 'Finally, multiply the common factor back in to confirm it matches the original expression.' },
      { kind: 'math', content: `${common}(${innerPoly}) = ${questionLatex}`, displayMode: true },
      { kind: 'text', content: `One way to find the second binomial is polynomial long division.` },
      longDivisionBlock,
    ];
  }

  return {
    kind: 'factorisation',
    id: stableId('factor', input.seed, `${factorVariant}-${a}-${xTerm}-${yTerm}`),
    topicId: 'algebraic_factorisation',
    difficulty: input.difficulty,
    seed: input.seed,
    katexQuestion: questionLatex,
    katexExplanation: explanation,
    a,
    xTerm,
    yTerm,
    expectedNormalized,
    expectedFactors,
  };
}
