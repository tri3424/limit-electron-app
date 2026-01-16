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
  | 'addition'
  | 'subtraction'
  | 'multiplication'
  | 'division'
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
  variantId: 'solve_x';
  solution: Fraction;
  solutionLatex: string;
} & PracticeQuestionBase;

export type LinearIntersectionQuestion = {
  kind: 'linear_intersection';
  variantId: 'intersection';
  m1: number;
  c1: number;
  m2: number;
  c2: number;
  solutionX: Fraction;
  solutionY: Fraction;
  solutionLatexX: string;
  solutionLatexY: string;
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

export type ArithmeticQuestion = {
  kind: 'arithmetic';
  a: number;
  b: number;
  operator: '+' | '-' | '\\times' | '\\div';
  expectedNumber: number;
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
  | LinearIntersectionQuestion
  | ArithmeticQuestion
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

function generateArithmetic(input: {
  topicId: PracticeTopicId;
  difficulty: PracticeDifficulty;
  seed: number;
}): ArithmeticQuestion {
  const rng = mulberry32((input.seed ^ 0x243f6a88) >>> 0);
  const range = difficultyRange(input.difficulty);

  const bounds = (() => {
    // More aggressive scaling ("hard" should feel like an ultimate level).
    if (input.difficulty === 'easy') {
      return {
        addSubMax: 99,
        mulA: 12,
        mulB: 12,
        divB: 9,
        divQ: 12,
      };
    }
    if (input.difficulty === 'medium') {
      return {
        addSubMax: 999,
        mulA: 99,
        mulB: 99,
        divB: 12,
        divQ: 99,
      };
    }
    return {
      addSubMax: 9999,
      mulA: 999,
      mulB: 99,
      divB: 25,
      divQ: 999,
    };
  })();

  const place = (n: number) => {
    const abs = Math.abs(n);
    const ones = abs % 10;
    const tens = Math.floor(abs / 10) % 10;
    const hundreds = Math.floor(abs / 100) % 10;
    const thousands = Math.floor(abs / 1000) % 10;
    return { abs, ones, tens, hundreds, thousands, sign: n < 0 ? -1 : 1 };
  };

  const decomposeLatex = (n: number) => {
    const p = place(n);
    const terms: string[] = [];
    if (p.thousands) terms.push(String(p.thousands * 1000));
    if (p.hundreds) terms.push(String(p.hundreds * 100));
    if (p.tens) terms.push(String(p.tens * 10));
    if (p.ones || !terms.length) terms.push(String(p.ones));
    const base = terms.join(' + ');
    return p.sign < 0 ? `-${base}` : base;
  };

  const decomposeParts = (n: number) => {
    const p = place(n);
    const parts: Array<{ label: 'thousands' | 'hundreds' | 'tens' | 'ones'; value: number }> = [];
    if (p.thousands) parts.push({ label: 'thousands', value: p.thousands * 1000 });
    if (p.hundreds) parts.push({ label: 'hundreds', value: p.hundreds * 100 });
    if (p.tens) parts.push({ label: 'tens', value: p.tens * 10 });
    if (p.ones || !parts.length) parts.push({ label: 'ones', value: p.ones });
    return parts;
  };

  const renderColumn = (top: string, bottom: string, op: '+' | '-', result?: string) => {
    const w = Math.max(top.length, bottom.length, result?.length ?? 0);
    const pad = (s: string) => s.padStart(w, ' ');
    const topP = pad(top);
    const bottomP = pad(bottom);
    const resP = result ? pad(result) : '';
    const line = '\\hline';
    const body = result
      ? `${topP}\\\\${op}${bottomP}\\\\${line}\\\\${resP}`
      : `${topP}\\\\${op}${bottomP}\\\\${line}`;
    return String.raw`\begin{array}{r}${body}\end{array}`;
  };

  const longDivisionSteps = (dividend: number, divisor: number) => {
    const digits = String(Math.abs(dividend)).split('').map((d) => Number(d));
    let rem = 0;
    const qDigits: number[] = [];
    const steps: Array<{ subLatex: string; remainderLatex: string }> = [];
    let started = false;

    for (let i = 0; i < digits.length; i++) {
      const d = digits[i] ?? 0;
      const cur = rem * 10 + d;
      const qd = Math.floor(cur / divisor);
      rem = cur - qd * divisor;
      qDigits.push(qd);

      // Skip leading 0-quotient steps until we actually start dividing (unless it's the last digit).
      if (!started && qd === 0 && i < digits.length - 1) {
        continue;
      }
      started = true;

      const sub = qd * divisor;
      const nextDigit = i < digits.length - 1 ? String(digits[i + 1] ?? '') : '';
      const remainderLatex = i < digits.length - 1 ? `${rem}${nextDigit}` : `${rem}`;
      steps.push({ subLatex: String(sub), remainderLatex });
    }

    const qStr = qDigits.join('').replace(/^0+(?=\d)/, '');
    const q = Number(qStr || '0');
    return { q, qStr: qStr || '0', remainder: rem, steps };
  };

  const make = (a: number, b: number, operator: ArithmeticQuestion['operator'], expectedNumber: number, idSuffix: string): ArithmeticQuestion => {
    const opForKatex = operator;
    return {
      kind: 'arithmetic',
      id: stableId('arith', input.seed, idSuffix),
      topicId: input.topicId,
      difficulty: input.difficulty,
      seed: input.seed,
      a,
      b,
      operator,
      expectedNumber,
      katexQuestion: `${a} ${opForKatex} ${b}`,
      katexExplanation: (() => {
        const blocks: KatexExplanationBlock[] = [];

        if (operator === '+') {
          const pa = place(a);
          const pb = place(b);
          blocks.push({ kind: 'text', content: 'Column addition: add ones, then tens, then hundreds, carrying when needed.' });
          blocks.push({ kind: 'math', content: renderColumn(String(a), String(b), '+', String(expectedNumber)), displayMode: true });
          blocks.push({ kind: 'text', content: 'Break each number into hundreds, tens, and ones.' });
          blocks.push({ kind: 'math', content: `${a} = ${decomposeLatex(a)}`, displayMode: true });
          blocks.push({ kind: 'math', content: `${b} = ${decomposeLatex(b)}`, displayMode: true });

          if (pa.thousands || pb.thousands) {
            blocks.push({ kind: 'text', content: 'Because these numbers have thousands, we continue the same process into the thousands place.' });
          }

          blocks.push({ kind: 'text', content: 'Add the ones first.' });
          const onesSum = pa.ones + pb.ones;
          const carry1 = Math.floor(onesSum / 10);
          const onesRes = onesSum % 10;
          blocks.push({ kind: 'math', content: `${pa.ones} + ${pb.ones} = ${onesSum} = ${onesRes}${carry1 ? ` \\text{ with carry }${carry1}` : ''}`, displayMode: true });

          blocks.push({ kind: 'text', content: 'Now add the tens (including any carry from the ones).' });
          const tensA = pa.tens;
          const tensB = pb.tens;
          const tensSum = tensA + tensB + carry1;
          const carry2 = Math.floor(tensSum / 10);
          const tensRes = tensSum % 10;
          blocks.push({ kind: 'math', content: `${tensA} + ${tensB}${carry1 ? ` + ${carry1}` : ''} = ${tensSum} = ${tensRes}${carry2 ? ` \\text{ with carry }${carry2}` : ''}`, displayMode: true });

          blocks.push({ kind: 'text', content: 'Finally add the hundreds (including any carry from the tens).' });
          const hundredsA = pa.hundreds;
          const hundredsB = pb.hundreds;
          const hundredsSum0 = hundredsA + hundredsB + carry2;
          const carry3 = Math.floor(hundredsSum0 / 10);
          const hundredsRes = hundredsSum0 % 10;
          blocks.push({
            kind: 'math',
            content: `${hundredsA} + ${hundredsB}${carry2 ? ` + ${carry2}` : ''} = ${hundredsSum0} = ${hundredsRes}${carry3 ? ` \\text{ with carry }${carry3}` : ''}`,
            displayMode: true,
          });

          if (pa.thousands || pb.thousands || carry3) {
            blocks.push({ kind: 'text', content: 'Now add the thousands (including any carry from the hundreds).' });
            const thousandsA = pa.thousands;
            const thousandsB = pb.thousands;
            const thousandsSum = thousandsA + thousandsB + carry3;
            blocks.push({ kind: 'math', content: `${thousandsA} + ${thousandsB}${carry3 ? ` + ${carry3}` : ''} = ${thousandsSum}`, displayMode: true });
          }

          blocks.push({ kind: 'text', content: 'Combine the hundreds, tens, and ones to get the final answer.' });
          blocks.push({ kind: 'math', content: `${a} + ${b} = ${expectedNumber}`, displayMode: true });
          return blocks;
        }

        if (operator === '-') {
          const pa = place(a);
          const pb = place(b);
          blocks.push({ kind: 'text', content: 'Column subtraction: subtract ones, then tens, then hundreds, borrowing when needed.' });
          blocks.push({ kind: 'math', content: renderColumn(String(a), String(b), '-', String(expectedNumber)), displayMode: true });
          blocks.push({ kind: 'text', content: 'Break each number into hundreds, tens, and ones.' });
          blocks.push({ kind: 'math', content: `${a} = ${decomposeLatex(a)}`, displayMode: true });
          blocks.push({ kind: 'math', content: `${b} = ${decomposeLatex(b)}`, displayMode: true });

          if (pa.thousands || pb.thousands) {
            blocks.push({ kind: 'text', content: 'Because these numbers have thousands, borrowing can also move across hundreds into thousands if needed.' });
          }

          blocks.push({ kind: 'text', content: 'Subtract the ones first. If you cannot, borrow 1 ten (which is 10 ones).' });
          const onesA0 = pa.ones;
          const onesB0 = pb.ones;
          const needBorrow1 = onesA0 < onesB0;
          const onesA = needBorrow1 ? onesA0 + 10 : onesA0;
          const onesDiff = onesA - onesB0;
          blocks.push({
            kind: 'math',
            content: needBorrow1
              ? `${onesA0} - ${onesB0} \\text{ (borrow 1 ten)}: (${onesA0}+10) - ${onesB0} = ${onesDiff}`
              : `${onesA0} - ${onesB0} = ${onesDiff}`,
            displayMode: true,
          });

          blocks.push({ kind: 'text', content: 'Now subtract the tens (remember the borrow decreases the tens by 1).' });
          const tensA0 = pa.tens;
          const tensB0 = pb.tens;
          const tensAAdj0 = tensA0 - (needBorrow1 ? 1 : 0);
          const needBorrow2 = tensAAdj0 < tensB0;
          const tensAAdj = needBorrow2 ? tensAAdj0 + 10 : tensAAdj0;
          const tensDiff = tensAAdj - tensB0;
          blocks.push({
            kind: 'math',
            content: needBorrow2
              ? `${tensAAdj0} - ${tensB0} \\text{ (borrow 1 hundred)}: (${tensAAdj0}+10) - ${tensB0} = ${tensDiff}`
              : `${tensAAdj0} - ${tensB0} = ${tensDiff}`,
            displayMode: true,
          });

          blocks.push({ kind: 'text', content: 'Finally subtract the hundreds (borrowing from hundreds reduces it by 1).' });
          const hundredsA0 = pa.hundreds + pa.thousands * 10;
          const hundredsB0 = pb.hundreds + pb.thousands * 10;
          const hundredsAAdj = hundredsA0 - (needBorrow2 ? 1 : 0);
          const hundredsDiff = hundredsAAdj - hundredsB0;
          blocks.push({ kind: 'math', content: `${hundredsAAdj} - ${hundredsB0} = ${hundredsDiff}`, displayMode: true });

          if (pa.thousands || pb.thousands) {
            blocks.push({ kind: 'text', content: 'Thousands place (if applicable): subtract the thousands after any borrowing.' });
            const thousandsA = pa.thousands;
            const thousandsB = pb.thousands;
            // If we borrowed a hundred from thousands, hundredsA0 already included thousands*10.
            // Keep a simple direct statement for the final result.
            blocks.push({ kind: 'math', content: `${a} - ${b} = ${expectedNumber}`, displayMode: true });
            return blocks;
          }

          blocks.push({ kind: 'text', content: 'Combine the hundreds, tens, and ones to get the final answer.' });
          blocks.push({ kind: 'math', content: `${a} - ${b} = ${expectedNumber}`, displayMode: true });
          return blocks;
        }

        if (operator === '\\times') {
          // Use different explanation styles based on size.
          const small = a <= 12 && b <= 12;

          if (small) {
            const reps = Math.min(a, b);
            const base = Math.max(a, b);
            blocks.push({ kind: 'text', content: 'Use times tables / repeated addition.' });
            blocks.push({ kind: 'math', content: `${a} \\times ${b}`, displayMode: true });
            if (reps <= 0) {
              blocks.push({ kind: 'text', content: 'Because one factor is 0, the product is 0.' });
              blocks.push({ kind: 'math', content: `${a} \\times ${b} = ${expectedNumber}`, displayMode: true });
              return blocks;
            }
            blocks.push({ kind: 'text', content: `This means add ${base} a total of ${reps} times.` });
            const sumExpr = Array.from({ length: reps }, () => String(base)).join(' + ');
            blocks.push({ kind: 'math', content: `${a} \\times ${b} = ${sumExpr}`, displayMode: true });
            blocks.push({ kind: 'math', content: `= ${expectedNumber}`, displayMode: true });
            return blocks;
          }

          // Partial products: multiply by ones/tens/hundreds and add.
          const aParts = decomposeParts(a);
          const bParts = decomposeParts(b);
          blocks.push({ kind: 'text', content: 'Use the distributive law with place values. We will split BOTH numbers and multiply every part.' });
          blocks.push({ kind: 'math', content: `${a} \\times ${b}`, displayMode: true });
          blocks.push({ kind: 'text', content: `Split ${a} into place values:` });
          blocks.push({ kind: 'math', content: `${a} = ${aParts.map((p) => String(p.value)).join(' + ')}`, displayMode: true });
          blocks.push({ kind: 'text', content: `Split ${b} into place values:` });
          blocks.push({ kind: 'math', content: `${b} = ${bParts.map((p) => String(p.value)).join(' + ')}`, displayMode: true });

          blocks.push({ kind: 'text', content: 'Now multiply each part from the first number by each part from the second number.' });
          const termProducts: number[] = [];
          for (const ap of aParts) {
            for (const bp of bParts) {
              const prod = ap.value * bp.value;
              termProducts.push(prod);
              blocks.push({
                kind: 'math',
                content: `${ap.value} \\times ${bp.value} = ${prod}`,
                displayMode: true,
              });
            }
          }

          blocks.push({ kind: 'text', content: 'Add ALL the products together (no steps skipped).' });
          // Sum step-by-step to avoid skipping.
          let running = 0;
          for (let i = 0; i < termProducts.length; i++) {
            const v = termProducts[i] ?? 0;
            if (i === 0) {
              running = v;
              blocks.push({ kind: 'math', content: `${v}`, displayMode: true });
              continue;
            }
            const prev = running;
            running = prev + v;
            blocks.push({ kind: 'math', content: `${prev} + ${v} = ${running}`, displayMode: true });
          }

          blocks.push({ kind: 'text', content: 'So the final answer is:' });
          blocks.push({ kind: 'math', content: `${a} \\times ${b} = ${expectedNumber}`, displayMode: true });
          return blocks;
        }

        // division
        blocks.push({ kind: 'text', content: 'Use long division: divide from left to right, subtract, then bring down the next digit.' });
        const { q, qStr, remainder, steps } = longDivisionSteps(a, b);
        blocks.push({
          kind: 'long_division',
          divisorLatex: String(b),
          dividendLatex: String(a),
          quotientLatex: String(qStr),
          steps,
        });
        blocks.push({ kind: 'text', content: remainder === 0 ? 'The remainder is 0, so the quotient is the final answer.' : 'There is a remainder.' });
        blocks.push({ kind: 'math', content: `${a} \\div ${b} = ${q}`, displayMode: true });
        return blocks;
      })(),
    };
  };

  if (input.topicId === 'addition') {
    const a = rng.int(0, bounds.addSubMax);
    const b = rng.int(0, bounds.addSubMax);
    return make(a, b, '+', a + b, 'add');
  }

  if (input.topicId === 'subtraction') {
    const a = rng.int(0, bounds.addSubMax);
    const b = rng.int(0, bounds.addSubMax);
    if (input.difficulty === 'hard') {
      // Allow negative results at the highest level.
      return make(a, b, '-', a - b, 'sub');
    }
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return make(hi, lo, '-', hi - lo, 'sub');
  }

  if (input.topicId === 'multiplication') {
    const a = rng.int(0, bounds.mulA);
    const b = rng.int(0, bounds.mulB);
    return make(a, b, '\\times', a * b, 'mul');
  }

  // division: always integer results
  const b = rng.int(2, bounds.divB);
  const q = rng.int(0, bounds.divQ);
  const a = b * q;
  return make(a, b, '\\div', q, 'div');
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
      return generateLinear({ topicId: input.topicId, difficulty: input.difficulty, seed: input.seed, variantWeights: input.variantWeights });
    case 'addition':
    case 'subtraction':
    case 'multiplication':
    case 'division':
      return generateArithmetic({ topicId: input.topicId, difficulty: input.difficulty, seed: input.seed });
    case 'fractions':
      return generateFractions({
        topicId: 'fractions',
        difficulty: input.difficulty,
        seed: input.seed,
        avoidVariantId: input.avoidVariantId as FractionsVariantId | undefined,
        variantWeights: input.variantWeights,
      });
    case 'indices':
      return generateIndices({
        topicId: 'indices',
        difficulty: input.difficulty,
        seed: input.seed,
        variantWeights: input.variantWeights,
      });
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
      return generateGraphQuadraticLineMcq({
        topicId: 'graph_quadratic_line',
        difficulty: input.difficulty,
        seed: input.seed,
        variantWeights: input.variantWeights,
      });
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
        variantWeights: input.variantWeights,
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
  variantWeights?: Record<string, number>;
}): GraphPracticeQuestion {
  type CircularMeasureKind = import('@/lib/practiceGenerators/circularMeasure').CircularMeasureProblemKind;
  type CirclesVariantId = CircularMeasureKind | 'diameter_endpoints_equation' | 'diameter_endpoints_center';
  const rng = mulberry32((input.seed ^ 0x1f123bb5) >>> 0);

  const pickVariant = (): CirclesVariantId => {
    const circularMeasureKinds: CircularMeasureKind[] = [
      'arc_length_forward',
      'arc_length_inverse_radius',
      'arc_length_inverse_theta',
      'sector_area_forward',
      'sector_area_inverse_radius',
      'sector_area_inverse_theta',
      'sector_perimeter_forward',
      'chord_length_forward',
      'midpoint_shaded_area_forward',
      'midpoint_shaded_area_inverse_radius',
      'segment_area_forward',
      'segment_area_inverse_radius',
      'segment_area_inverse_theta',
    ];

    const candidates: CirclesVariantId[] = input.difficulty === 'easy'
      ? circularMeasureKinds
      : [...circularMeasureKinds, 'diameter_endpoints_equation', 'diameter_endpoints_center'];
    const pool = input.avoidKind ? candidates.filter((v) => v !== (input.avoidKind as any)) : candidates;
    const list = pool.length ? pool : candidates;
    const w = input.variantWeights ?? {};
    const defaults: Partial<Record<CirclesVariantId, number>> = input.difficulty === 'easy'
      ? {
          arc_length_forward: 10,
          arc_length_inverse_radius: 8,
          arc_length_inverse_theta: 6,
          sector_area_forward: 10,
          sector_area_inverse_radius: 8,
          sector_area_inverse_theta: 6,
          sector_perimeter_forward: 7,
          chord_length_forward: 7,
          midpoint_shaded_area_forward: 6,
          midpoint_shaded_area_inverse_radius: 4,
          segment_area_forward: 6,
          segment_area_inverse_radius: 5,
          segment_area_inverse_theta: 4,
        }
      : {
          arc_length_forward: 10,
          arc_length_inverse_radius: 8,
          arc_length_inverse_theta: 6,
          sector_area_forward: 10,
          sector_area_inverse_radius: 8,
          sector_area_inverse_theta: 6,
          sector_perimeter_forward: 7,
          chord_length_forward: 7,
          midpoint_shaded_area_forward: 6,
          midpoint_shaded_area_inverse_radius: 4,
          segment_area_forward: 6,
          segment_area_inverse_radius: 5,
          segment_area_inverse_theta: 4,
          diameter_endpoints_equation: 8,
          diameter_endpoints_center: 5,
        };
    const weights = list.map((k) => {
      const raw = typeof w[k] === 'number' ? Number(w[k]) : (defaults as any)[k];
      return Math.max(0, raw);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return list[rng.int(0, list.length - 1)]!;
    let r = rng.next() * total;
    for (let i = 0; i < list.length; i++) {
      r -= weights[i] ?? 0;
      if (r <= 0) return list[i]!;
    }
    return list[list.length - 1]!;
  };

  const variantId = pickVariant();

  if (variantId !== 'diameter_endpoints_equation' && variantId !== 'diameter_endpoints_center') {
    const p = generateCircularMeasureProblem({
      seed: input.seed,
      difficulty: input.difficulty,
      avoidKind: input.avoidKind as any,
      variantWeights: { ...(input.variantWeights ?? {}), [variantId]: 1 },
    });
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

  const nonZeroInt = (min: number, max: number) => {
    let v = 0;
    while (v === 0) v = rng.int(min, max);
    return v;
  };

  const coordRange = input.difficulty === 'medium' ? 9 : 13;
  const Ax = nonZeroInt(-coordRange, coordRange);
  const Ay = nonZeroInt(-coordRange, coordRange);
  let Bx = nonZeroInt(-coordRange, coordRange);
  let By = nonZeroInt(-coordRange, coordRange);
  // Ensure A != B.
  if (Ax === Bx && Ay === By) {
    Bx = Ax + (Ax === coordRange ? -1 : 1);
  }

  const cxFrac = normalizeFraction({ n: Ax + Bx, d: 2 });
  const cyFrac = normalizeFraction({ n: Ay + By, d: 2 });
  const dx = Ax - Bx;
  const dy = Ay - By;
  const r2Frac = normalizeFraction({ n: dx * dx + dy * dy, d: 4 });

  const fracLatex = (f: Fraction) => fractionToLatex(f);

  const shiftLatex = (variable: 'x' | 'y', c: Fraction) => {
    if (c.n === 0) return variable;
    const sign = c.n < 0 ? '+' : '-';
    const abs = normalizeFraction({ n: Math.abs(c.n), d: c.d });
    return `${variable} ${sign} ${fracLatex(abs)}`;
  };

  const circleEquationLatex = String.raw`\left(${shiftLatex('x', cxFrac)}\right)^2 + \left(${shiftLatex('y', cyFrac)}\right)^2 = ${fracLatex(r2Frac)}`;

  const centerX = cxFrac.n / cxFrac.d;
  const centerY = cyFrac.n / cyFrac.d;
  const r2 = r2Frac.n / r2Frac.d;
  const r = Math.sqrt(r2);

  const buildCircleGraphSpec = (opts: { showCenter: boolean }): PracticeGraphSpec => {
    const steps = 140;
    const pts = Array.from({ length: steps + 1 }, (_, i) => {
      const t = (i / steps) * 2 * Math.PI;
      return { x: centerX + r * Math.cos(t), y: centerY + r * Math.sin(t) };
    });

    const pad = Math.max(2, Math.ceil(r * 0.35));
    const xMin = Math.floor(centerX - r - pad);
    const xMax = Math.ceil(centerX + r + pad);
    const yMin = Math.floor(centerY - r - pad);
    const yMax = Math.ceil(centerY + r + pad);

    const plot: PracticeGraphSpec['plot'] = [
      { kind: 'polyline', points: pts, stroke: '#111827', strokeWidth: 2 },
      { kind: 'point', at: { x: Ax, y: Ay }, r: 4, fill: '#2563eb' },
      { kind: 'label', at: { x: Ax + 0.35, y: Ay + 0.35 }, text: `A(${Ax},${Ay})`, fill: '#2563eb', fontSize: 12, anchor: 'start' },
      { kind: 'point', at: { x: Bx, y: By }, r: 4, fill: '#2563eb' },
      { kind: 'label', at: { x: Bx + 0.35, y: By + 0.35 }, text: `B(${Bx},${By})`, fill: '#2563eb', fontSize: 12, anchor: 'start' },
    ];

    if (opts.showCenter) {
      plot.push({ kind: 'point', at: { x: centerX, y: centerY }, r: 4, fill: '#dc2626' });
      plot.push({ kind: 'label', at: { x: centerX + 0.35, y: centerY + 0.35 }, text: `C(${Number(centerX.toFixed(3))},${Number(centerY.toFixed(3))})`, fill: '#dc2626', fontSize: 12, anchor: 'start' });
    }

    return {
      width: 520,
      height: 360,
      window: { xMin, xMax, yMin, yMax },
      equalAspect: true,
      axisLabelX: 'x',
      axisLabelY: 'y',
      plot,
    };
  };

  if (variantId === 'diameter_endpoints_equation') {
    const promptText = `Circle from diameter endpoints  The point A(${Ax}, ${Ay}) and the point B(${Bx}, ${By}) are endpoints of a diameter. Find the equation of the circle.`;

    const wrongCenterX = normalizeFraction({ n: Ax - Bx, d: 2 });
    const wrongCenterY = normalizeFraction({ n: Ay - By, d: 2 });
    const wrongR2A = normalizeFraction({ n: dx * dx + dy * dy, d: 2 });
    const wrongR2B = normalizeFraction({ n: dx * dx + dy * dy, d: 8 });

    const wrongEqCenter = String.raw`\left(${shiftLatex('x', wrongCenterX)}\right)^2 + \left(${shiftLatex('y', wrongCenterY)}\right)^2 = ${fracLatex(r2Frac)}`;
    const wrongEqR2A = String.raw`\left(${shiftLatex('x', cxFrac)}\right)^2 + \left(${shiftLatex('y', cyFrac)}\right)^2 = ${fracLatex(wrongR2A)}`;
    const wrongEqR2B = String.raw`\left(${shiftLatex('x', cxFrac)}\right)^2 + \left(${shiftLatex('y', cyFrac)}\right)^2 = ${fracLatex(wrongR2B)}`;

    // MCQ options (shuffle deterministically)
    const options0 = [circleEquationLatex, wrongEqCenter, wrongEqR2A, wrongEqR2B];
    const order = [0, 1, 2, 3];
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    const katexOptions = order.map((idx) => options0[idx]!).slice(0, 4);
    const correctIndex = katexOptions.indexOf(circleEquationLatex);
    return {
      kind: 'graph',
      id: stableId('circles', input.seed, `diameter-eq-${Ax}-${Ay}-${Bx}-${By}`),
      topicId: input.topicId,
      difficulty: input.difficulty,
      seed: input.seed,
      generatorParams: {
        kind: variantId,
        expectedLatex: circleEquationLatex,
        circle: { Ax, Ay, Bx, By, centerX, centerY, r2 },
      },
      promptText,
      promptKatex: undefined,
      katexQuestion: '',
      katexOptions,
      correctIndex,
      inputFields: undefined,
      graphSpec: buildCircleGraphSpec({ showCenter: false }),
      svgDataUrl: '',
      svgAltText: 'Circle with diameter endpoints A and B.',
      katexExplanation: {
        steps: [
          {
            katex: String.raw`A(${Ax},${Ay}),\;B(${Bx},${By})`,
            text: 'Because AB is a diameter, the center of the circle is the midpoint of the segment AB.',
          },
          {
            katex: String.raw`\text{Center }C\left(\frac{x_A+x_B}{2},\frac{y_A+y_B}{2}\right)`,
            text: 'Use the midpoint formula for the center coordinates.',
          },
          {
            katex: String.raw`C\left(\frac{${Ax}+${Bx}}{2},\frac{${Ay}+${By}}{2}\right)=\left(${fracLatex(cxFrac)},\;${fracLatex(cyFrac)}\right)`,
            text: 'Substitute the coordinates of A and B to get the center exactly (sometimes a half-integer).',
          },
          {
            katex: String.raw`r^2 = \left(\frac{AB}{2}\right)^2`,
            text: 'The radius is half of the diameter, so we can compute r² using the distance AB.',
          },
          {
            katex: String.raw`AB^2 = (${Ax}-${Bx})^2 + (${Ay}-${By})^2 = ${dx * dx + dy * dy}`,
            text: 'First compute AB² to avoid square roots.',
          },
          {
            katex: String.raw`r^2 = \frac{AB^2}{4} = \frac{${dx * dx + dy * dy}}{4} = ${fracLatex(r2Frac)}`,
            text: 'Divide by 4 because r = AB/2.',
          },
          {
            katex: String.raw`(x-h)^2+(y-k)^2=r^2`,
            text: 'Use the standard form of a circle with center (h,k).',
          },
          {
            katex: circleEquationLatex,
            text: 'Substitute h, k and r² to get the required equation.',
          },
        ],
        summary: 'If AB is a diameter, the center is the midpoint of A and B, and r² is one-quarter of AB². Then use (x−h)²+(y−k)²=r².',
      },
    };
  }

  // diameter_endpoints_center
  const promptText = `Center from diameter endpoints  The point A(${Ax}, ${Ay}) and the point B(${Bx}, ${By}) are endpoints of a diameter. Find the x and y coordinates of the center.`;
  return {
    kind: 'graph',
    id: stableId('circles', input.seed, `diameter-center-${Ax}-${Ay}-${Bx}-${By}`),
    topicId: input.topicId,
    difficulty: input.difficulty,
    seed: input.seed,
    generatorParams: {
      kind: variantId,
      expectedParts: [centerX, centerY],
      circle: { Ax, Ay, Bx, By, centerX, centerY, r2 },
    },
    promptText,
    promptKatex: undefined,
    katexQuestion: '',
    inputFields: [
      { id: 'x', label: 'Center x-coordinate', kind: 'number' },
      { id: 'y', label: 'Center y-coordinate', kind: 'number' },
    ],
    graphSpec: buildCircleGraphSpec({ showCenter: true }),
    svgDataUrl: '',
    svgAltText: 'Circle with diameter endpoints A and B, and the center marked.',
    katexExplanation: {
      steps: [
        {
          katex: String.raw`A(${Ax},${Ay}),\;B(${Bx},${By})`,
          text: 'The center of a circle is the midpoint of any diameter. Since AB is a diameter, the center is the midpoint of segment AB.',
        },
        {
          katex: String.raw`\text{Midpoint formula: }\left(\frac{x_A+x_B}{2},\frac{y_A+y_B}{2}\right)`,
          text: 'Average the x-coordinates to get the center x-coordinate, and average the y-coordinates to get the center y-coordinate.',
        },
        {
          katex: String.raw`x_C = \frac{${Ax}+${Bx}}{2} = ${fracLatex(cxFrac)}`,
          text: 'Compute the x-coordinate of the center.',
        },
        {
          katex: String.raw`y_C = \frac{${Ay}+${By}}{2} = ${fracLatex(cyFrac)}`,
          text: 'Compute the y-coordinate of the center.',
        },
        {
          katex: String.raw`\text{Center }C\left(${fracLatex(cxFrac)},\;${fracLatex(cyFrac)}\right)`,
          text: 'So the center is the midpoint shown as the red point on the graph.',
        },
      ],
      summary: String.raw`For a diameter AB, the center is the midpoint: \left(\frac{x_A+x_B}{2},\frac{y_A+y_B}{2}\right). Enter x first, then y.`,
    },
  };
}

function generateLinear(input: { topicId: PracticeTopicId; difficulty: PracticeDifficulty; seed: number; variantWeights?: Record<string, number> }): LinearQuestion | LinearIntersectionQuestion {
  const rng = mulberry32(input.seed);
  const R = difficultyRange(input.difficulty);

  const pickVariant = (): 'solve_x' | 'intersection' => {
    if (input.difficulty === 'easy') return 'solve_x';

    const w = input.variantWeights ?? {};
    const wSolve = typeof w.solve_x === 'number' ? Math.max(0, Number(w.solve_x)) : 50;
    const wInter = typeof w.intersection === 'number' ? Math.max(0, Number(w.intersection)) : 50;

    const total = wSolve + wInter;
    if (!(total > 0)) return 'solve_x';
    const r = rng.next() * total;
    return r < wInter ? 'intersection' : 'solve_x';
  };

  const variant = pickVariant();

  // Medium/Hard: sometimes generate intersection-of-two-lines questions.
  if (variant === 'intersection') {
    const slopeMax = input.difficulty === 'hard' ? 10 : 7;
    const interceptMax = input.difficulty === 'hard' ? 18 : 12;

    // Choose an integer intersection point so answers are clean.
    const x0 = rng.int(-R, R);
    const y0 = rng.int(-R * 2, R * 2);

    const pickSlope = (avoid?: number) => {
      let m = 0;
      let tries = 0;
      while (tries < 200) {
        tries += 1;
        m = rng.int(-slopeMax, slopeMax);
        if (m === 0) continue;
        if (typeof avoid === 'number' && m === avoid) continue;
        return m;
      }
      return avoid === 2 ? 3 : 2;
    };

    const m1 = pickSlope();
    const m2 = pickSlope(m1);
    const c1 = y0 - m1 * x0;
    const c2 = y0 - m2 * x0;

    // Keep intercepts in a friendly range; otherwise retry by shifting y0.
    const c1ok = Math.abs(c1) <= interceptMax;
    const c2ok = Math.abs(c2) <= interceptMax;
    if (!(c1ok && c2ok)) {
      // Force within range with a deterministic adjustment.
      const y1 = rng.int(-interceptMax, interceptMax);
      const y2 = rng.int(-interceptMax, interceptMax);
      const adjX0 = x0;
      const adjY0 = rng.next() < 0.5 ? y1 : y2;
      const cc1 = adjY0 - m1 * adjX0;
      const cc2 = adjY0 - m2 * adjX0;
      const solX = frac(adjX0, 1);
      const solY = frac(adjY0, 1);

      const eq1 = `y = ${m1}x ${cc1 < 0 ? '-' : '+'} ${Math.abs(cc1)}`;
      const eq2 = `y = ${m2}x ${cc2 < 0 ? '-' : '+'} ${Math.abs(cc2)}`;
      const systemLatex = String.raw`\begin{aligned}${eq1}\\\\${eq2}\end{aligned}`;

      const xMin = adjX0 - (input.difficulty === 'hard' ? 10 : 7);
      const xMax = adjX0 + (input.difficulty === 'hard' ? 10 : 7);
      const yMin = adjY0 - (input.difficulty === 'hard' ? 10 : 7);
      const yMax = adjY0 + (input.difficulty === 'hard' ? 10 : 7);
      const graphSpec: PracticeGraphSpec = {
        width: 520,
        height: 420,
        window: { xMin, xMax, yMin, yMax },
        equalAspect: false,
        axisLabelX: 'x',
        axisLabelY: 'y',
        plot: [
          { kind: 'function', fn: (x: number) => m1 * x + cc1, stroke: '#2563eb', strokeWidth: 2 },
          { kind: 'function', fn: (x: number) => m2 * x + cc2, stroke: '#16a34a', strokeWidth: 2 },
          { kind: 'point', at: { x: adjX0, y: adjY0 }, r: 4, fill: '#dc2626' },
          { kind: 'label', at: { x: adjX0 + 0.4, y: adjY0 + 0.4 }, text: `(${adjX0}, ${adjY0})`, fill: '#dc2626', fontSize: 14 },
        ],
      };

      const explanation: KatexExplanationBlock[] = [
        { kind: 'text', content: 'We have two lines. The intersection point is where both equations have the same (x, y).' },
        { kind: 'math', content: systemLatex, displayMode: true },
        { kind: 'text', content: 'At the intersection, the y-values are equal, so set the right-hand sides equal.' },
        { kind: 'math', content: `${m1}x ${cc1 < 0 ? '-' : '+'} ${Math.abs(cc1)} = ${m2}x ${cc2 < 0 ? '-' : '+'} ${Math.abs(cc2)}`, displayMode: true },
        { kind: 'text', content: 'Collect x terms on one side and constants on the other.' },
        { kind: 'math', content: `${m1}x - ${m2}x = ${cc2} - ${cc1}`, displayMode: true },
        { kind: 'math', content: `${m1 - m2}x = ${cc2 - cc1}`, displayMode: true },
        { kind: 'text', content: 'Solve for x by dividing both sides.' },
        { kind: 'math', content: String.raw`x = \frac{${cc2 - cc1}}{${m1 - m2}} = ${fractionToLatex(solX)}`, displayMode: true },
        { kind: 'text', content: 'Substitute x back into either equation to find y.' },
        { kind: 'math', content: `y = ${m1}(${fractionToLatex(solX)}) ${cc1 < 0 ? '-' : '+'} ${Math.abs(cc1)} = ${fractionToLatex(solY)}`, displayMode: true },
        { kind: 'text', content: `So the intersection point is (${adjX0}, ${adjY0}). It is marked on the graph below.` },
        { kind: 'graph', graphSpec, altText: `Two straight lines intersecting at (${adjX0}, ${adjY0}).` },
      ];

      return {
        kind: 'linear_intersection',
        variantId: 'intersection',
        id: stableId('linear-intersection', input.seed, `${m1}-${cc1}-${m2}-${cc2}-${adjX0}-${adjY0}`),
        topicId: 'linear_equations',
        difficulty: input.difficulty,
        seed: input.seed,
        katexQuestion: systemLatex,
        katexExplanation: explanation,
        m1,
        c1: cc1,
        m2,
        c2: cc2,
        solutionX: solX,
        solutionY: solY,
        solutionLatexX: fractionToLatex(solX),
        solutionLatexY: fractionToLatex(solY),
      };
    }

    const solX = frac(x0, 1);
    const solY = frac(y0, 1);
    const eq1 = `y = ${m1}x ${c1 < 0 ? '-' : '+'} ${Math.abs(c1)}`;
    const eq2 = `y = ${m2}x ${c2 < 0 ? '-' : '+'} ${Math.abs(c2)}`;
    const systemLatex = String.raw`\begin{aligned}${eq1}\\\\${eq2}\end{aligned}`;

    const xMin = x0 - (input.difficulty === 'hard' ? 10 : 7);
    const xMax = x0 + (input.difficulty === 'hard' ? 10 : 7);
    const yMin = y0 - (input.difficulty === 'hard' ? 10 : 7);
    const yMax = y0 + (input.difficulty === 'hard' ? 10 : 7);
    const graphSpec: PracticeGraphSpec = {
      width: 520,
      height: 420,
      window: { xMin, xMax, yMin, yMax },
      equalAspect: false,
      axisLabelX: 'x',
      axisLabelY: 'y',
      plot: [
        { kind: 'function', fn: (x: number) => m1 * x + c1, stroke: '#2563eb', strokeWidth: 2 },
        { kind: 'function', fn: (x: number) => m2 * x + c2, stroke: '#16a34a', strokeWidth: 2 },
        { kind: 'point', at: { x: x0, y: y0 }, r: 4, fill: '#dc2626' },
        { kind: 'label', at: { x: x0 + 0.4, y: y0 + 0.4 }, text: `(${x0}, ${y0})`, fill: '#dc2626', fontSize: 14 },
      ],
    };

    const explanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'We have two lines. The intersection point is where both equations have the same (x, y).' },
      { kind: 'math', content: systemLatex, displayMode: true },
      { kind: 'text', content: 'At the intersection, the y-values are equal, so set the right-hand sides equal.' },
      { kind: 'math', content: `${m1}x ${c1 < 0 ? '-' : '+'} ${Math.abs(c1)} = ${m2}x ${c2 < 0 ? '-' : '+'} ${Math.abs(c2)}`, displayMode: true },
      { kind: 'text', content: 'Collect x terms on one side and constants on the other.' },
      { kind: 'math', content: `${m1}x - ${m2}x = ${c2} - ${c1}`, displayMode: true },
      { kind: 'math', content: `${m1 - m2}x = ${c2 - c1}`, displayMode: true },
      { kind: 'text', content: 'Solve for x by dividing both sides.' },
      { kind: 'math', content: String.raw`x = \frac{${c2 - c1}}{${m1 - m2}} = ${fractionToLatex(solX)}`, displayMode: true },
      { kind: 'text', content: 'Substitute x back into either equation to find y.' },
      { kind: 'math', content: `y = ${m1}(${fractionToLatex(solX)}) ${c1 < 0 ? '-' : '+'} ${Math.abs(c1)} = ${fractionToLatex(solY)}`, displayMode: true },
      { kind: 'text', content: `So the intersection point is (${x0}, ${y0}). It is marked on the graph below.` },
      { kind: 'graph', graphSpec, altText: `Two straight lines intersecting at (${x0}, ${y0}).` },
    ];

    return {
      kind: 'linear_intersection',
      variantId: 'intersection',
      id: stableId('linear-intersection', input.seed, `${m1}-${c1}-${m2}-${c2}-${x0}-${y0}`),
      topicId: 'linear_equations',
      difficulty: input.difficulty,
      seed: input.seed,
      katexQuestion: systemLatex,
      katexExplanation: explanation,
      m1,
      c1,
      m2,
      c2,
      solutionX: solX,
      solutionY: solY,
      solutionLatexX: fractionToLatex(solX),
      solutionLatexY: fractionToLatex(solY),
    };
  }

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
    variantId: 'solve_x',
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

function generateIndices(input: { topicId: PracticeTopicId; difficulty: PracticeDifficulty; seed: number; variantWeights?: Record<string, number> }): IndicesQuestion {
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
    const w = input.variantWeights ?? {};
    const wMul = Math.max(0, Number(w.mul ?? 1));
    const wDiv = allowDivision ? Math.max(0, Number(w.div ?? 1)) : 0;
    const wPow = allowPowerOfPower ? Math.max(0, Number(w.pow ?? 1)) : 0;
    const total = wMul + wDiv + wPow;
    if (!(total > 0)) {
      const choices: Array<'mul' | 'div' | 'pow'> = ['mul'];
      if (allowDivision) choices.push('div');
      if (allowPowerOfPower) choices.push('pow');
      return choices[rng.int(0, choices.length - 1)];
    }
    const pick = rng.next() * total;
    if (pick < wMul) return 'mul' as const;
    if (pick < wMul + wDiv) return 'div' as const;
    return 'pow' as const;
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
