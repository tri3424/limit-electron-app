import { Fraction, fractionToLatex, normalizeFraction } from '@/lib/fraction';

export type PracticeDifficulty = 'easy' | 'medium' | 'hard' | 'ultimate';

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
  | { kind: 'graph'; graphSpec: any; altText: string };

export type QuadraticFactorizationQuestion = {
  id: string;
  katexQuestion: string;
  katexExplanation: KatexExplanationBlock[];
  solutions: Fraction[];
  metadata: {
    topic: 'quadratics';
    method: 'factorisation';
    difficulty: PracticeDifficulty;
    seed: number;
    coefficients: { a: number; b: number; c: number };
    factorForm: { p: number; q: number; r: number; s: number };
    repeatedRoot: boolean;
    solutionsLatex: string[];
  };
};

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

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
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

function formatQuadraticEquation(a: number, b: number, c: number): string {
  const ax2 = formatAx2(a);
  const bx = b === 0 ? '' : formatBx(b);
  const cc = c === 0 ? '' : formatC(c);
  return `${ax2}${bx}${cc} = 0`;
}

function formatSignedTerm(coef: number, term: string): string {
  if (coef === 0) return '';
  const s = sign(coef);
  const mag = abs(coef);
  const coeff = mag === 1 ? '' : String(mag);
  return ` ${s} ${coeff}${term}`;
}

function formatRxPlusS(r: number, s: number): string {
  const xTerm = r === 1 ? 'x' : `${r}x`;
  if (s === 0) return xTerm;
  return `${xTerm} ${sign(s) === '-' ? '-' : '+'} ${abs(s)}`;
}

function formatFactor(p: number, q: number): string {
  // px + q
  const g = gcd(p, q);
  const pp = p / g;
  const qq = q / g;
  const coef = pp === 1 ? '' : pp === -1 ? '-' : String(pp);
  const xTerm = `${coef}x`;
  if (qq === 0) return xTerm;
  const s = sign(qq);
  return `${xTerm} ${s} ${abs(qq)}`;
}

function stableId(seed: number, a: number, b: number, c: number): string {
  return `quad-factor-${seed}-${a}-${b}-${c}`;
}

function frac(n: number, d: number): Fraction {
  return normalizeFraction({ n, d });
}

export function generateQuadraticByFactorisation(input: {
  seed: number;
  difficulty: PracticeDifficulty;
  variantWeights?: Record<string, number>;
}): QuadraticFactorizationQuestion {
  const rng = mulberry32(input.seed);

  const repeatedRoot = (() => {
    const w = input.variantWeights ?? {};
    const wDistinct = typeof w.distinct_root === 'number' ? Math.max(0, Number(w.distinct_root)) : NaN;
    const wRepeated = typeof w.repeated_root === 'number' ? Math.max(0, Number(w.repeated_root)) : NaN;
    const hasWeights = Number.isFinite(wDistinct) || Number.isFinite(wRepeated);
    if (!hasWeights) return rng.next() < 0.25;
    const a = Number.isFinite(wDistinct) ? wDistinct : 0;
    const b = Number.isFinite(wRepeated) ? wRepeated : 0;
    const total = a + b;
    if (!(total > 0)) return rng.next() < 0.25;
    return rng.next() * total < b;
  })();

  const ranges = (() => {
    switch (input.difficulty) {
      case 'easy':
        return {
          p: [1, 1] as const,
          r: [1, 1] as const,
          q: [-9, 9] as const,
          s: [-9, 9] as const,
        };
      case 'medium':
        return {
          p: [1, 1] as const,
          r: [1, 1] as const,
          q: [-12, 12] as const,
          s: [-12, 12] as const,
        };
      case 'hard':
      default:
        return {
          p: [2, 6] as const,
          r: [1, 6] as const,
          q: [-12, 12] as const,
          s: [-12, 12] as const,
        };
    }
  })();

  const nonZeroInt = (min: number, max: number) => {
    let v = 0;
    while (v === 0) v = rng.int(min, max);
    return v;
  };

  const p = rng.int(ranges.p[0], ranges.p[1]);
  const q = nonZeroInt(ranges.q[0], ranges.q[1]);

  let r: number;
  let s: number;

  if (repeatedRoot) {
    r = p;
    s = q;
  } else {
    r = rng.int(ranges.r[0], ranges.r[1]);
    if (input.difficulty === 'hard' && rng.next() < 0.4) {
      r = nonZeroInt(ranges.r[0], ranges.r[1]);
    }
    s = nonZeroInt(ranges.s[0], ranges.s[1]);

    // avoid generating the exact same root twice accidentally in distinct-root mode
    const root1 = -q / p;
    const root2 = -s / r;
    if (Math.abs(root1 - root2) < 1e-9) {
      s = s === 1 ? 2 : s - 1;
    }
  }

  const a = p * r;
  const b = p * s + q * r;
  const c = q * s;

  const equation = formatQuadraticEquation(a, b, c);

  const ac = a * c;

  // split middle term: find m and n such that m*n = ac and m+n = b
  const m = p * s;
  const n = q * r;

  const splitLine = `${formatAx2(a)}${formatSignedTerm(m, 'x')}${formatSignedTerm(n, 'x')}${formatC(c)} = 0`;

  const factor1 = formatFactor(p, q);
  const factor2 = formatFactor(r, s);

  const solutions = (() => {
    const x1 = frac(-q, p);
    const x2 = frac(-s, r);
    if (repeatedRoot) return [x1, x1];
    return [x1, x2];
  })();

  const solutionsLatex = solutions.map((v) => fractionToLatex(v));

  const toNumber = (f: Fraction) => f.n / f.d;
  const x1 = toNumber(solutions[0]);
  const x2 = toNumber(solutions[1]);
  const fn = (x: number) => a * x * x + b * x + c;

  const pad = input.difficulty === 'easy' ? 6 : input.difficulty === 'medium' ? 8 : 10;
  const xMinBase = Math.floor(Math.min(x1, x2, -6) - 2);
  const xMaxBase = Math.ceil(Math.max(x1, x2, 6) + 2);
  const xMin = Math.max(-20, xMinBase);
  const xMax = Math.min(20, xMaxBase);
  const sampleN = 41;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < sampleN; i++) {
    const x = xMin + (i / (sampleN - 1)) * (xMax - xMin);
    const y = fn(x);
    if (!Number.isFinite(y)) continue;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    minY = -10;
    maxY = 10;
  }
  const yMin = Math.floor(minY - pad);
  const yMax = Math.ceil(maxY + pad);

  const rootLabel = (x: number) => {
    if (!Number.isFinite(x)) return '(?, 0)';
    const s = Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(2);
    return `(${s}, 0)`;
  };

  const graphSpec = {
    width: 720,
    height: 420,
    window: { xMin, xMax, yMin, yMax },
    caption: 'Roots are highlighted where the graph crosses the x-axis (y = 0).',
    plot: [
      { kind: 'function' as const, fn, stroke: '#2563eb', strokeWidth: 2 },
      { kind: 'point' as const, at: { x: x1, y: 0 }, r: 6, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1 },
      { kind: 'label' as const, at: { x: x1 + 0.25, y: 0.7 }, text: rootLabel(x1), fill: '#111827', fontSize: 12, anchor: 'start' },
      { kind: 'point' as const, at: { x: x2, y: 0 }, r: 6, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1 },
      { kind: 'label' as const, at: { x: x2 + 0.25, y: -1.2 }, text: rootLabel(x2), fill: '#111827', fontSize: 12, anchor: 'start' },
    ],
  };

  const explanation: KatexExplanationBlock[] = [
    { kind: 'graph', graphSpec, altText: `Graph of y = ${a}x^2 ${b >= 0 ? '+' : '-'} ${Math.abs(b)}x ${c >= 0 ? '+' : '-'} ${Math.abs(c)} with roots highlighted at (${solutionsLatex[0]}, 0) and (${solutionsLatex[1]}, 0).` },
    { kind: 'text', content: 'We want to solve the quadratic equation for x.' },
    { kind: 'math', content: equation, displayMode: true },
    { kind: 'text', content: 'This is already in standard form, so we can factorise it:' },
    { kind: 'math', content: 'ax^2 + bx + c = 0', displayMode: true },
    { kind: 'text', content: `Here, a = ${a}, b = ${b}, and c = ${c}.` },
    { kind: 'text', content: `We now look for two numbers that multiply to give ac and add to give b.` },
    { kind: 'math', content: `ac = ${a} \\cdot ${c} = ${ac}`, displayMode: true },
    { kind: 'text', content: `So we want two numbers that multiply to ${ac} and add to ${b}.` },
    { kind: 'text', content: `One such pair is ${m} and ${n}, because:` },
    { kind: 'math', content: `${m} + ${n} = ${b}`, displayMode: true },
    { kind: 'math', content: `${m} \\cdot ${n} = ${ac}`, displayMode: true },
    { kind: 'text', content: 'We rewrite the middle term using these two numbers.' },
    { kind: 'math', content: splitLine, displayMode: true },
    { kind: 'text', content: 'Now we group the terms in pairs and factorise each pair.' },
    { kind: 'math', content: `(${formatAx2(a)}${formatSignedTerm(m, 'x')}) + (${formatSignedTerm(n, 'x').trimStart()}${formatC(c)}) = 0`, displayMode: true },
    { kind: 'math', content: `${p}x\\,(${formatRxPlusS(r, s)}) ${q < 0 ? '-' : '+'} ${abs(q)}\\,(${formatRxPlusS(r, s)}) = 0`, displayMode: true },
    { kind: 'text', content: 'Both groups have a common factor, so we can factor it out.' },
    { kind: 'math', content: `(${factor1})(${factor2}) = 0`, displayMode: true },
    { kind: 'text', content: 'A product is zero only if at least one factor is zero. So we set each factor equal to 0.' },
    { kind: 'math', content: `${factor1} = 0\\;\\Rightarrow\\; x = ${fractionToLatex(frac(-q, p))}`, displayMode: true },
  ];

  if (repeatedRoot) {
    explanation.push(
      { kind: 'text', content: 'The two factors are the same, so we get the same solution twice (a repeated root).' },
      { kind: 'math', content: `x = ${solutionsLatex[0]}\\quad\\text{(this solution appears twice)}`, displayMode: true }
    );
  } else {
    explanation.push(
      { kind: 'math', content: `${factor2} = 0 \\;\\Rightarrow\\; x = ${fractionToLatex(frac(-s, r))}`, displayMode: true },
      { kind: 'math', content: String.raw`\text{So the solutions are }x = ${solutionsLatex[0]}\text{ and }x = ${solutionsLatex[1]}.`, displayMode: true }
    );
  }

  return {
    id: stableId(input.seed, a, b, c),
    katexQuestion: equation,
    katexExplanation: explanation,
    solutions,
    metadata: {
      topic: 'quadratics',
      method: 'factorisation',
      difficulty: input.difficulty,
      seed: input.seed,
      coefficients: { a, b, c },
      factorForm: { p, q, r, s },
      repeatedRoot,
      solutionsLatex,
    },
  };
}
