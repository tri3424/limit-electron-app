import { Fraction, fractionToLatex, normalizeFraction } from '@/lib/fraction';
import { generateGraphQuadraticLineMcq } from '@/lib/practiceGraph/generateGraphQuadraticLine';
import { generateGraphStraightLineMcq } from '@/lib/practiceGraph/generateGraphStraightLine';
import { generateGraphTrigonometryMcq } from '@/lib/practiceGraph/generateGraphTrigonometry';
import { generateGraphUnitCircleMcq } from '@/lib/practiceGraph/generateGraphUnitCircle';
import { generateDifferentiationQuestion } from '@/lib/practiceGenerators/differentiation';
import { generateIntegrationQuestion } from '@/lib/practiceGenerators/integration';
import { generateCircularMeasureProblem } from '@/lib/practiceGenerators/circularMeasure';
import { generateWordProblemQuestion, WordProblemQuestion, WordProblemVariantId } from '@/lib/practiceGenerators/wordProblems';

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
  | { kind: 'graph'; graphSpec: PracticeGraphSpec; altText: string };

export type PracticeTopicId =
  | 'quadratics'
  | 'linear_equations'
  | 'algebraic_factorisation'
  | 'fractions'
  | 'indices'
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
  solution: Fraction;
  solutionLatex: string;
} & PracticeQuestionBase;

export type SimultaneousQuestion = {
  kind: 'simultaneous';
  solutionX: Fraction;
  solutionY: Fraction;
  solutionLatexX: string;
  solutionLatexY: string;
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
}): PracticeQuestion {
  switch (input.topicId) {
    case 'linear_equations':
      return generateLinear(input);
    case 'fractions':
      return generateFractions(input);
    case 'indices':
      return generateIndices(input);
    case 'simultaneous_equations':
      return generateSimultaneous(input);
    case 'algebraic_factorisation':
      return generateFactorisation(input);
    case 'graph_quadratic_line':
      return generateGraphQuadraticLineMcq(input);
    case 'graph_straight_line':
      return generateGraphStraightLineMcq(input);
    case 'graph_trigonometry': {
      // Trigonometry: unit-circle exact-value questions.
      return generateGraphUnitCircleMcq({
        topicId: 'graph_trigonometry',
        difficulty: input.difficulty,
        seed: input.seed,
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
      });
    case 'differentiation': {
      const q = generateDifferentiationQuestion({ seed: input.seed, difficulty: input.difficulty });
      return {
        kind: 'calculus',
        id: q.id,
        topicId: 'differentiation',
        difficulty: input.difficulty,
        seed: input.seed,
        katexQuestion: q.katexQuestion,
        katexExplanation: q.katexExplanation,
        expectedNormalized: q.expectedNormalized,
      };
    }
    case 'integration': {
      const q = generateIntegrationQuestion({ seed: input.seed, difficulty: input.difficulty });
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

  const promptText = expectedFormat === 'fixed2'
    ? `${p.promptText} Give your answer to 2 decimal places.`
    : p.promptText;
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

function generateFractions(input: { topicId: PracticeTopicId; difficulty: PracticeDifficulty; seed: number }): FractionsQuestion {
  const rng = mulberry32(input.seed);

  const maxD = input.difficulty === 'easy' ? 9 : input.difficulty === 'medium' ? 12 : 20;
  const a = rng.int(1, maxD);
  const b = rng.int(1, maxD);
  const c = rng.int(1, maxD);
  const d = rng.int(1, maxD);

  const op = rng.next() < 0.5 ? '+' : '-';

  // a/b ± c/d
  const n = op === '+' ? a * d + c * b : a * d - c * b;
  const den = b * d;
  const sol = frac(n, den);

  const qLatex = `\\frac{${a}}{${b}} ${op} \\frac{${c}}{${d}}`;
  const solLatex = fractionToLatex(sol);

  const explanation: KatexExplanationBlock[] = [
    { kind: 'text', content: 'We want to calculate the result and write it as a simplified fraction.' },
    { kind: 'math', content: qLatex, displayMode: true },
    { kind: 'text', content: 'First, we make the denominators the same.' },
    { kind: 'math', content: `\\frac{${a}}{${b}} = \\frac{${a}\\cdot${d}}{${b}\\cdot${d}} = \\frac{${a * d}}{${b * d}}`, displayMode: true },
    { kind: 'math', content: `\\frac{${c}}{${d}} = \\frac{${c}\\cdot${b}}{${d}\\cdot${b}} = \\frac{${c * b}}{${d * b}}`, displayMode: true },
    { kind: 'text', content: `Now we ${op === '+' ? 'add' : 'subtract'} the numerators and keep the common denominator.` },
    { kind: 'math', content: `= \\frac{${a * d} ${op} ${c * b}}{${b * d}}`, displayMode: true },
    { kind: 'math', content: `= \\frac{${n}}{${den}}`, displayMode: true },
    { kind: 'text', content: 'Finally, we simplify the fraction if possible.' },
    { kind: 'math', content: `= ${solLatex}`, displayMode: true },
  ];

  return {
    kind: 'fractions',
    id: stableId('fractions', input.seed, `${a}-${b}-${c}-${d}-${op}`),
    topicId: 'fractions',
    difficulty: input.difficulty,
    seed: input.seed,
    katexQuestion: qLatex,
    katexExplanation: explanation,
    solution: sol,
    solutionLatex: solLatex,
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

function generateSimultaneous(input: { topicId: PracticeTopicId; difficulty: PracticeDifficulty; seed: number }): SimultaneousQuestion {
  const rng = mulberry32(input.seed);
  const R = difficultyRange(input.difficulty);

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
  };
}

function generateFactorisation(input: { topicId: PracticeTopicId; difficulty: PracticeDifficulty; seed: number }): FactorisationQuestion {
  const rng = mulberry32(input.seed);
  const maxA = input.difficulty === 'easy' ? 6 : input.difficulty === 'medium' ? 10 : 15;
  const a = nonZeroInt(rng, 2, maxA);

  const vars = rng.next() < 0.5 ? ['x', 'y'] : ['a', 'b'];
  const xTerm = vars[0];
  const yTerm = vars[1];

  const questionLatex = `${a}${xTerm} + ${a}${yTerm}`;

  // Accept some common equivalent strings.
  const expectedNormalized = [
    `${a}(${xTerm}+${yTerm})`,
    `${a}(${yTerm}+${xTerm})`,
    `${a}(${xTerm} + ${yTerm})`.replace(/\s+/g, ''),
  ].map((s) => s.replace(/\s+/g, '').toLowerCase());

  const explanation: KatexExplanationBlock[] = [
    { kind: 'text', content: 'We want to factorise the expression.' },
    { kind: 'math', content: questionLatex, displayMode: true },
    { kind: 'text', content: `Both terms have a common factor of ${a}.` },
    { kind: 'text', content: 'So we take out the common factor.' },
    { kind: 'math', content: `${a}${xTerm} + ${a}${yTerm} = ${a}(${xTerm} + ${yTerm})`, displayMode: true },
  ];

  return {
    kind: 'factorisation',
    id: stableId('factor', input.seed, `${a}-${xTerm}-${yTerm}`),
    topicId: 'algebraic_factorisation',
    difficulty: input.difficulty,
    seed: input.seed,
    katexQuestion: questionLatex,
    katexExplanation: explanation,
    a,
    xTerm,
    yTerm,
    expectedNormalized,
  };
}
