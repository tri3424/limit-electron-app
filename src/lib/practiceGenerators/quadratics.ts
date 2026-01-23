import { Fraction, fractionToLatex, normalizeFraction } from '@/lib/fraction';
import type { KatexExplanationBlock, PracticeDifficulty } from '@/lib/practiceEngine';
import { generateQuadraticByFactorisation } from '@/lib/practiceGenerators/quadraticFactorization';

export type QuadraticsVariantId =
  | 'factorisation'
  | 'complete_square_pqr'
  | 'complete_square_abc'
  | 'solve_complete_square_surd';

type Rng = {
  next: () => number; // [0,1)
  int: (min: number, max: number) => number; // inclusive
  pick: <T>(values: readonly T[]) => T;
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
  const pick = <T,>(values: readonly T[]) => values[int(0, values.length - 1)];
  return { next, int, pick };
}

function frac(n: number, d: number): Fraction {
  return normalizeFraction({ n, d });
}

function sign(n: number): '+' | '-' {
  return n < 0 ? '-' : '+';
}

function abs(n: number): number {
  return Math.abs(n);
}

function formatCoeff(coef: number, isFirst: boolean): string {
  if (coef === 0) return '';
  const s = sign(coef);
  const a = abs(coef);
  if (isFirst) {
    return coef < 0 ? '-' : '';
  }
  return ` ${s} `;
}

function formatAx2(a: number): string {
  const prefix = formatCoeff(a, true);
  const mag = abs(a);
  const coef = mag === 1 ? '' : String(mag);
  return `${prefix}${coef}x^2`;
}

function formatBx(b: number): string {
  const prefix = formatCoeff(b, false);
  const mag = abs(b);
  const coef = mag === 1 ? '' : String(mag);
  return `${prefix}${coef}x`;
}

function formatC(c: number): string {
  const prefix = formatCoeff(c, false);
  return `${prefix}${abs(c)}`;
}

function formatQuadratic(a: number, b: number, c: number): string {
  const ax2 = formatAx2(a);
  const bx = b === 0 ? '' : formatBx(b);
  const cc = c === 0 ? '' : formatC(c);
  return `${ax2}${bx}${cc}`;
}

export type QuadraticsQuestionBase = {
  id: string;
  katexQuestion: string;
  promptBlocks?: KatexExplanationBlock[];
  katexExplanation: KatexExplanationBlock[];
  metadata: {
    topic: 'quadratics';
    method: QuadraticsVariantId;
    difficulty: PracticeDifficulty;
    seed: number;
  };
};

export type QuadraticsFactorisationQuestion = {
  solutions: Fraction[];
  solutionsLatex: string[];
} & QuadraticsQuestionBase;

export type QuadraticsCompleteSquarePqrQuestion = {
  expected: { p: Fraction; q: Fraction; r: Fraction };
  expectedLatex: { p: string; q: string; r: string };
} & QuadraticsQuestionBase;

export type QuadraticsCompleteSquareAbcQuestion = {
  expected: { a: Fraction; b: Fraction; c: Fraction };
  expectedLatex: { a: string; b: string; c: string };
} & QuadraticsQuestionBase;

export type QuadraticsSolveSurdQuestion = {
  expectedRoots: [number, number];
  expectedRootsLatex: [string, string];
  requireDecimal4sf: true;
  calculatorAllowed: true;
} & QuadraticsQuestionBase;

export type QuadraticsQuestion =
  | QuadraticsFactorisationQuestion
  | QuadraticsCompleteSquarePqrQuestion
  | QuadraticsCompleteSquareAbcQuestion
  | QuadraticsSolveSurdQuestion;

function weightedPickKey(rng: Rng, weights: Record<string, number> | undefined, keys: string[], fallback: string): string {
  const w = weights ?? {};
  const hasAny = keys.some((k) => Number.isFinite(Number((w as any)[k])));
  if (!hasAny) return fallback;
  const nums = keys.map((k) => Math.max(0, Number((w as any)[k] ?? 0)));
  const total = nums.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return fallback;
  let r = rng.next() * total;
  for (let i = 0; i < keys.length; i++) {
    r -= nums[i] ?? 0;
    if (r <= 0) return keys[i] ?? fallback;
  }
  return keys[keys.length - 1] ?? fallback;
}

function stableId(seed: number, method: string, suffix: string) {
  return `quadratics-${method}-${seed}-${suffix}`;
}

export function generateQuadraticsQuestion(input: {
  seed: number;
  difficulty: PracticeDifficulty;
  variantWeights?: Record<string, number>;
}): QuadraticsQuestion {
  const rng = mulberry32(input.seed);

  const variant = weightedPickKey(
    rng,
    input.variantWeights,
    ['factorisation', 'complete_square_pqr', 'complete_square_abc', 'solve_complete_square_surd'],
    'factorisation'
  ) as QuadraticsVariantId;

  if (variant === 'factorisation') {
    const q = generateQuadraticByFactorisation({
      seed: input.seed,
      difficulty: input.difficulty,
      variantWeights: input.variantWeights,
    }) as any;

    return {
      id: q.id,
      katexQuestion: q.katexQuestion,
      promptBlocks: [
        { kind: 'text', content: 'Solve the equation' },
        { kind: 'math', content: String(q.katexQuestion ?? ''), displayMode: false },
      ],
      katexExplanation: q.katexExplanation,
      solutions: q.solutions,
      solutionsLatex: q.metadata?.solutionsLatex ?? [],
      metadata: {
        topic: 'quadratics',
        method: 'factorisation',
        difficulty: input.difficulty,
        seed: input.seed,
      },
    };
  }

  if (variant === 'complete_square_pqr') {
    const ranges = (() => {
      switch (input.difficulty) {
        case 'easy':
          return { p: [1, 3] as const, q: [-8, 8] as const, r: [-20, 20] as const };
        case 'medium':
          return { p: [1, 5] as const, q: [-10, 10] as const, r: [-40, 40] as const };
        case 'hard':
        case 'ultimate':
        default:
          return { p: [2, 8] as const, q: [-12, 12] as const, r: [-80, 80] as const };
      }
    })();

    const p0 = rng.int(ranges.p[0], ranges.p[1]);
    const q0 = rng.int(ranges.q[0], ranges.q[1]);
    const r0 = rng.int(ranges.r[0], ranges.r[1]);

    const a = p0;
    const b = -2 * p0 * q0;
    const c = p0 * q0 * q0 + r0;

    const lhs = formatQuadratic(a, b, c);
    const prompt = String.raw`\\text{Express }${lhs}\\text{ in the form }p(x-q)^2+r\\text{, where }p,q,r\\text{ are constants to be found.}`;

    const promptBlocks: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Express' },
      { kind: 'math', content: lhs, displayMode: false },
      { kind: 'text', content: 'in the form' },
      { kind: 'math', content: String.raw`p(x-q)^2+r`, displayMode: false },
      { kind: 'text', content: 'where p, q, r are constants to be found.' },
    ];

    const p = frac(p0, 1);
    const q = frac(q0, 1);
    const r = frac(r0, 1);

    const pLatex = fractionToLatex(p);
    const qLatex = fractionToLatex(q);
    const rLatex = fractionToLatex(r);

    const bOverA = frac(b, a);
    const half = frac(b, 2 * a);
    const halfLatex = fractionToLatex(half);
    const halfSqLatex = String.raw`\left(${halfLatex}\right)^2`;
    const aHalfSq = normalizeFraction({ n: a * half.n * half.n, d: half.d * half.d });
    const rFromComplete = normalizeFraction({ n: c * aHalfSq.d - aHalfSq.n, d: aHalfSq.d });

    const explanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Explanation' },
      { kind: 'math_callout', content: String.raw`${lhs}`, callout: 'We want to write the quadratic in completed-square form.', displayMode: true },
      { kind: 'math_callout', content: String.raw`${lhs} = ${a}\left(x^2 + ${fractionToLatex(bOverA)}x\right) + ${c}`, callout: 'Factor out the coefficient of x^2 from the first two terms.', displayMode: true },
      { kind: 'math_callout', content: String.raw`\text{Half of }${fractionToLatex(bOverA)}\text{ is }${halfLatex}`, callout: 'Halve the coefficient of x.', displayMode: true },
      { kind: 'math_callout', content: String.raw`${lhs} = ${a}\left(x^2 + ${fractionToLatex(bOverA)}x + ${halfSqLatex}\right) + ${c} - ${a}${halfSqLatex}`, callout: 'Add and subtract the square of that number.', displayMode: true },
      { kind: 'math_callout', content: String.raw`${lhs} = ${a}\left(x + ${halfLatex}\right)^2 + ${fractionToLatex(rFromComplete)}`, callout: 'Rewrite the bracket as a perfect square and simplify the constant.', displayMode: true },
      { kind: 'math', content: String.raw`${lhs} = ${p0}(x-${q0})^2 ${sign(r0) === '-' ? '-' : '+'} ${abs(r0)}`, displayMode: true },
      { kind: 'text', content: `So p = ${pLatex}, q = ${qLatex}, and r = ${rLatex}.` },
    ];

    return {
      id: stableId(input.seed, 'complete_square_pqr', `${a}-${b}-${c}`),
      katexQuestion: prompt,
      promptBlocks,
      katexExplanation: explanation,
      expected: { p, q, r },
      expectedLatex: { p: pLatex, q: qLatex, r: rLatex },
      metadata: {
        topic: 'quadratics',
        method: 'complete_square_pqr',
        difficulty: input.difficulty,
        seed: input.seed,
      },
    };
  }

  if (variant === 'complete_square_abc') {
    const ranges = (() => {
      switch (input.difficulty) {
        case 'easy':
          return { a: [1, 4] as const, b: [-9, 9] as const, c: [-40, 40] as const };
        case 'medium':
          return { a: [1, 6] as const, b: [-12, 12] as const, c: [-80, 80] as const };
        case 'hard':
        case 'ultimate':
        default:
          return { a: [2, 8] as const, b: [-15, 15] as const, c: [-120, 120] as const };
      }
    })();

    const a0 = rng.int(ranges.a[0], ranges.a[1]);
    const b0 = rng.int(ranges.b[0], ranges.b[1]);
    const c0 = rng.int(ranges.c[0], ranges.c[1]);

    const A = a0 * a0;
    const B = 2 * a0 * b0;
    const C = b0 * b0 + c0;

    const lhs = formatQuadratic(A, B, C);
    const prompt = String.raw`\\text{Express }${lhs}\\text{ in the form }(ax+b)^2+c\\text{, where }a,b,c\\text{ are constants to be found.}`;

    const promptBlocks: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Express' },
      { kind: 'math', content: lhs, displayMode: false },
      { kind: 'text', content: 'in the form' },
      { kind: 'math', content: String.raw`(ax+b)^2+c`, displayMode: false },
      { kind: 'text', content: 'where a, b, c are constants to be found.' },
    ];

    const aF = frac(a0, 1);
    const bF = frac(b0, 1);
    const cF = frac(c0, 1);

    const aLatex = fractionToLatex(aF);
    const bLatex = fractionToLatex(bF);
    const cLatex = fractionToLatex(cF);

    const aPos = a0;
    const twoA = 2 * aPos;
    const bFromMid = frac(B, twoA);
    const bFromMidLatex = fractionToLatex(bFromMid);
    const bSq = normalizeFraction({ n: bFromMid.n * bFromMid.n, d: bFromMid.d * bFromMid.d });
    const cFromComplete = normalizeFraction({ n: C * bSq.d - bSq.n, d: bSq.d });

    const explanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Explanation' },
      { kind: 'math_callout', content: String.raw`${lhs}`, callout: 'We want to write the quadratic as (ax+b)^2 + c.', displayMode: true },
      { kind: 'math_callout', content: String.raw`${A}x^2 = (${aPos}x)^2`, callout: 'First, write the x^2 term as a square.', displayMode: true },
      { kind: 'math_callout', content: String.raw`2(${aPos}x)\,b = ${B}x\;\Rightarrow\; b = ${bFromMidLatex}`, callout: 'Match the middle term to 2(ax)(b).', displayMode: true },
      { kind: 'math_callout', content: String.raw`(${aPos}x + ${bFromMidLatex})^2 = ${A}x^2 + ${B}x + \left(${bFromMidLatex}\right)^2`, callout: 'Write the square using a and b.', displayMode: true },
      { kind: 'math_callout', content: String.raw`${lhs} = (${aPos}x + ${bFromMidLatex})^2 + ${fractionToLatex(cFromComplete)}`, callout: 'Adjust the constant term to match the original expression.', displayMode: true },
      { kind: 'math', content: String.raw`${lhs} = (${a0}x ${b0 < 0 ? '-' : '+'} ${abs(b0)})^2 ${c0 < 0 ? '-' : '+'} ${abs(c0)}`, displayMode: true },
      { kind: 'text', content: `So a = ${aLatex}, b = ${bLatex}, and c = ${cLatex}.` },
    ];

    return {
      id: stableId(input.seed, 'complete_square_abc', `${A}-${B}-${C}`),
      katexQuestion: prompt,
      promptBlocks,
      katexExplanation: explanation,
      expected: { a: aF, b: bF, c: cF },
      expectedLatex: { a: aLatex, b: bLatex, c: cLatex },
      metadata: {
        topic: 'quadratics',
        method: 'complete_square_abc',
        difficulty: input.difficulty,
        seed: input.seed,
      },
    };
  }

  // solve_complete_square_surd
  const h = rng.int(-8, 8);
  const kCandidates = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23];
  const k = rng.pick(kCandidates);
  const a = 1;
  const b = -2 * h;
  const c = h * h - k;

  const equation = String.raw`${formatQuadratic(a, b, c)} = 0`;

  const root1 = h + Math.sqrt(k);
  const root2 = h - Math.sqrt(k);
  const roots = root1 <= root2 ? ([root1, root2] as [number, number]) : ([root2, root1] as [number, number]);

  const rootsLatex: [string, string] = [
    String.raw`${fractionToLatex(frac(2 * h, 2))} + \sqrt{${k}}`,
    String.raw`${fractionToLatex(frac(2 * h, 2))} - \sqrt{${k}}`,
  ];

  const explanation: KatexExplanationBlock[] = [
    { kind: 'text', content: 'Explanation' },
    { kind: 'math_callout', content: equation, callout: 'Expand brackets and collect terms.', displayMode: true },
    { kind: 'math_callout', content: String.raw`x^2 ${b < 0 ? '-' : '+'} ${abs(b)}x ${c < 0 ? '-' : '+'} ${abs(c)} = 0`, callout: 'Complete the square.', displayMode: true },
    { kind: 'math_callout', content: String.raw`x^2 - 2(${h})x = ${k} - ${h * h}`, callout: 'Move the constant term to the other side.', displayMode: true },
    { kind: 'math_callout', content: String.raw`x^2 - 2(${h})x + (${h})^2 = ${k}`, callout: `Add (${h})^2 to both sides.`, displayMode: true },
    { kind: 'math_callout', content: String.raw`(x-${h})^2 = ${k}`, callout: 'Write the left side as a square.', displayMode: true },
    { kind: 'math_callout', content: String.raw`x-${h} = \pm\sqrt{${k}}`, callout: 'Square root both sides.', displayMode: true },
    { kind: 'math', content: String.raw`x = ${h} \pm \sqrt{${k}}`, displayMode: true },
    { kind: 'text', content: 'Use a calculator and give both answers to 4 significant figures.' },
  ];

  return {
    id: stableId(input.seed, 'solve_complete_square_surd', `${a}-${b}-${c}-${k}`),
    katexQuestion: String.raw`\\text{Solve }${equation}\\text{ using completing the square. You may use a calculator. Give your answers to 4 significant figures.}`,
    promptBlocks: [
      { kind: 'text', content: 'Solve' },
      { kind: 'math', content: equation, displayMode: false },
      { kind: 'text', content: 'using completing the square. You may use a calculator. Give your answers to 4 significant figures.' },
    ],
    katexExplanation: explanation,
    expectedRoots: roots,
    expectedRootsLatex: rootsLatex,
    requireDecimal4sf: true,
    calculatorAllowed: true,
    metadata: {
      topic: 'quadratics',
      method: 'solve_complete_square_surd',
      difficulty: input.difficulty,
      seed: input.seed,
    },
  };
}
