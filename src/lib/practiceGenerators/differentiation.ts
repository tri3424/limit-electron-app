import type { PracticeDifficulty } from '@/lib/practiceEngine';
import type { KatexExplanationBlock } from '@/lib/practiceEngine';
import { fractionToLatex, normalizeFraction, type Fraction } from '@/lib/fraction';

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

function derivativeStepsLatex(terms: Term[]) {
  const steps: Array<{ original: string; derived: string }> = [];
  for (const t of terms) {
    const a = t.a;
    const n = t.n;
    const orig = termLatex(t);
    if (n === 0) {
      steps.push({ original: orig, derived: '0' });
      continue;
    }
    const a2 = a * n;
    const n2 = n - 1;
    if (n2 === 0) steps.push({ original: orig, derived: String(a2) });
    else if (n2 === 1) steps.push({ original: orig, derived: a2 === 1 ? 'x' : a2 === -1 ? '-x' : `${a2}x` });
    else {
      const aPart = a2 === 1 ? '' : a2 === -1 ? '-' : String(a2);
      steps.push({ original: orig, derived: `${aPart}x^{${n2}}` });
    }
  }
  return steps;
}

function stableId(prefix: string, seed: number, suffix: string) {
  return `${prefix}-${seed}-${suffix}`;
}

function fmtSigned(n: number) {
  if (n === 0) return '';
  return n > 0 ? `+ ${n}` : `- ${Math.abs(n)}`;
}

function normalizeExprForCompare(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\\mathit\{c\}/g, 'c')
    .replace(/\\mathrm\{c\}/g, 'c')
    .replace(/\{x\}/g, 'x')
    .replace(/\{(\d+)\}/g, '$1')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/-\\frac\{(\d+)\}\{(\d+)\}/g, '-$1/$2')
    .replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2')
    // Normalize scripts: MathLive may emit x^{6} while users might type x^6
    .replace(/\^\{([^}]+)\}/g, '^$1')
    .replace(/_\{([^}]+)\}/g, '_$1')
    .replace(/-\\frac\{x\^(\d+)\}\{(\d+)\}/g, '-1/$2x^$1')
    .replace(/\\frac\{x\^(\d+)\}\{(\d+)\}/g, '1/$2x^$1')
    .replace(/-\\frac\{x\}\{(\d+)\}/g, '-1/$1x')
    .replace(/\\frac\{x\}\{(\d+)\}/g, '1/$1x')
    // Strip common LaTeX spacing commands MathLive can emit
    .replace(/\\[ ,;!:]/g, '')
    .replace(/\s+/g, '')
    .replace(/\\cdot/g, '')
    .replace(/\*/g, '')
    .replace(/\(\)/g, '');
}

function normalizeStationaryXList(raw: string) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[−–]/g, '-')
    .replace(/\s+/g, '')
    .replace(/^x=/, '')
    .replace(/^x:/, '')
    .replace(/^x\s*=/, '')
    .replace(/\{\}/g, '')
    .replace(/\[|\]/g, '')
    .replace(/\(|\)/g, '')
    .replace(/\bnone\b/g, '');
}

type Term = { a: number; n: number };

function fraction(n: number, d: number): Fraction {
  return normalizeFraction({ n, d });
}

function mulFrac(a: Fraction, b: Fraction): Fraction {
  return normalizeFraction({ n: a.n * b.n, d: a.d * b.d });
}

function subFrac(a: Fraction, b: Fraction): Fraction {
  return normalizeFraction({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
}

function isIntFrac(f: Fraction): boolean {
  const ff = normalizeFraction(f);
  return Number.isFinite(ff.n) && Number.isFinite(ff.d) && ff.d === 1;
}

function fmtFracInput(f: Fraction): string {
  const ff = normalizeFraction(f);
  if (ff.d === 1) return String(ff.n);
  return `${ff.n}/${ff.d}`;
}

function normalizeABPair(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[−–]/g, '-')
    .replace(/\left/g, '')
    .replace(/\right/g, '')
    .replace(/\cdot/g, '')
    .replace(/\times/g, '')
    .replace(/\,/g, '')
    .replace(/\;|\:|\!/g, '')
    .replace(/\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2')
    .replace(/-\\frac\{(\d+)\}\{(\d+)\}/g, '-$1/$2')
    .replace(/\s+/g, '')
    .replace(/\{([^}]*)\}/g, '$1')
    .replace(/\(|\)/g, '')
    .replace(/^a=/, '')
    .replace(/^b=/, '');
}

function termLatex(t: Term) {
  const a = t.a;
  const n = t.n;
  if (n === 0) return String(a);
  if (n === 1) return a === 1 ? 'x' : a === -1 ? '-x' : `${a}x`;
  const aPart = a === 1 ? '' : a === -1 ? '-' : String(a);
  return `${aPart}x^{${n}}`;
}

function simplifyTermList(rawTerms: Term[]): Term[] {
  const byPow = new Map<number, number>();
  for (const t of rawTerms) {
    byPow.set(t.n, (byPow.get(t.n) ?? 0) + t.a);
  }
  const out: Term[] = [];
  for (const [n, a] of byPow.entries()) {
    if (a === 0) continue;
    out.push({ a, n });
  }
  out.sort((t1, t2) => t2.n - t1.n);
  return out;
}

function joinSignedLatex(partsRaw: string[]) {
  const parts: string[] = [];
  for (const s of partsRaw) {
    if (!parts.length) {
      parts.push(s);
      continue;
    }
    if (s.startsWith('-')) parts.push(`- ${s.slice(1)}`);
    else parts.push(`+ ${s}`);
  }
  return parts.join(' ');
}

function derivativeLatex(terms: Term[]) {
  const out: string[] = [];
  for (const t of terms) {
    if (t.n === 0) continue;
    const a2 = t.a * t.n;
    const n2 = t.n - 1;
    if (n2 === 0) out.push(String(a2));
    else if (n2 === 1) out.push(a2 === 1 ? 'x' : a2 === -1 ? '-x' : `${a2}x`);
    else {
      const aPart = a2 === 1 ? '' : a2 === -1 ? '-' : String(a2);
      out.push(`${aPart}x^{${n2}}`);
    }
  }
  if (out.length === 0) return '0';
  // join with explicit signs
  const joined: string[] = [];
  for (const s of out) {
    if (!joined.length) {
      joined.push(s);
      continue;
    }
    if (s.startsWith('-')) joined.push(`- ${s.slice(1)}`);
    else joined.push(`+ ${s}`);
  }
  return joined.join(' ');
}

export type DifferentiationQuestion = {
  kind: 'calculus';
  topicId: 'differentiation';
  variantId:
    | 'basic_polynomial'
    | 'stationary_points'
    | 'sqrt_params_point_gradient'
    | 'power_linear_point_gradient'
    | 'rational_yaxis_gradient'
    | 'linear_minus_rational_xaxis_gradients'
    | 'stationary_points_coords';
  id: string;
  seed: number;
  difficulty: PracticeDifficulty;
  katexQuestion: string;
  promptBlocks?: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string }>;
  katexExplanation: KatexExplanationBlock[];
  expectedNormalized: string[];
  expectedLatex: string;
  expectedParts?: string[];
  normalize: (raw: string) => string;
};

export function generateDifferentiationQuestion(input: { seed: number; difficulty: PracticeDifficulty; variantWeights?: Record<string, number> }): DifferentiationQuestion {
  const rng = mulberry32(input.seed);

  const variant = (() => {
    // Add a "double derivation" stationary-points style question.
    // Keep weighting stable by difficulty.
    const w = input.variantWeights ?? {};
    const wStationary = typeof w.stationary_points === 'number'
      ? Math.max(0, w.stationary_points)
      : (input.difficulty === 'easy' ? 20 : input.difficulty === 'medium' ? 30 : 40);
    const wBasic = typeof w.basic_polynomial === 'number'
      ? Math.max(0, w.basic_polynomial)
      : Math.max(0, 100 - wStationary);
    const wSqrtParams = typeof (w as any).sqrt_params_point_gradient === 'number'
      ? Math.max(0, Number((w as any).sqrt_params_point_gradient))
      : 0;

    const wPowerLinearPoint = typeof (w as any).power_linear_point_gradient === 'number'
      ? Math.max(0, Number((w as any).power_linear_point_gradient))
      : 0;
    const wRationalYAxis = typeof (w as any).rational_yaxis_gradient === 'number'
      ? Math.max(0, Number((w as any).rational_yaxis_gradient))
      : 0;
    const wLinearMinusRationalXIntercepts = typeof (w as any).linear_minus_rational_xaxis_gradients === 'number'
      ? Math.max(0, Number((w as any).linear_minus_rational_xaxis_gradients))
      : 0;
    const wStationaryCoords = typeof (w as any).stationary_points_coords === 'number'
      ? Math.max(0, Number((w as any).stationary_points_coords))
      : 0;

    const total = wStationary + wBasic + wSqrtParams + wPowerLinearPoint + wRationalYAxis + wLinearMinusRationalXIntercepts + wStationaryCoords;
    const pick = total <= 0 ? 0 : rng.next() * total;
    if (pick < wStationary) return ('stationary_points' as const);
    if (pick < wStationary + wBasic) return ('basic_polynomial' as const);
    if (pick < wStationary + wBasic + wSqrtParams) return ('sqrt_params_point_gradient' as const);
    if (pick < wStationary + wBasic + wSqrtParams + wPowerLinearPoint) return ('power_linear_point_gradient' as const);
    if (pick < wStationary + wBasic + wSqrtParams + wPowerLinearPoint + wRationalYAxis) return ('rational_yaxis_gradient' as const);
    if (pick < wStationary + wBasic + wSqrtParams + wPowerLinearPoint + wRationalYAxis + wLinearMinusRationalXIntercepts) return ('linear_minus_rational_xaxis_gradients' as const);
    return ('stationary_points_coords' as const);
  })();

  if (variant === 'power_linear_point_gradient') {
    // Template: y = (a x + b)^n, find gradient at a point (x0, y0) on the curve.
    // y' = n(a x + b)^(n-1) * a

    // Sometimes generate a polynomial (quadratic/binomial/trinomial) instead of a power-of-linear.
    // This keeps the variant diverse while reusing the same answer/UI shape (single gradient).
    const usePolynomial = input.difficulty === 'easy' ? rng.next() < 0.45 : rng.next() < 0.25;
    if (usePolynomial) {
      // y = ax^2 + bx + c (some coefficients may be 0 for binomial / simpler cases).
      const yLimit = 2000;
      const x0 = rng.int(input.difficulty === 'easy' ? -4 : -6, input.difficulty === 'easy' ? 4 : 6);

      const aChoices = input.difficulty === 'easy' ? [1, 2, 3] : input.difficulty === 'medium' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
      const a = aChoices[rng.int(0, aChoices.length - 1)] ?? 2;
      let b = rng.int(input.difficulty === 'easy' ? -12 : -18, input.difficulty === 'easy' ? 12 : 18);
      let c = rng.int(input.difficulty === 'easy' ? -25 : -45, input.difficulty === 'easy' ? 25 : 45);

      // Encourage binomial/trinomial variety by sometimes dropping a term.
      if (rng.next() < 0.25) b = 0;
      if (rng.next() < 0.25) c = 0;
      if (b === 0 && c === 0) c = rng.int(2, 12);

      const y0 = a * x0 * x0 + b * x0 + c;
      if (!Number.isFinite(y0) || Math.abs(y0) > yLimit) {
        return generateDifferentiationQuestion({ ...input, seed: input.seed + 1 });
      }

      const gradAtX0 = 2 * a * x0 + b;
      const expectedGrad = normalizeFraction({ n: gradAtX0, d: 1 });

      const funcLatex = String.raw`${a === 1 ? '' : a}\,x^{2} ${b === 0 ? '' : b > 0 ? `+ ${b}x` : `- ${Math.abs(b)}x`} ${c === 0 ? '' : c > 0 ? `+ ${c}` : `- ${Math.abs(c)}`}`.replace(/\s+/g, ' ').trim();
      const dyLatex = String.raw`\frac{dy}{dx} = ${2 * a}x ${b === 0 ? '' : b > 0 ? `+ ${b}` : `- ${Math.abs(b)}`}`.replace(/\s+/g, ' ').trim();

      const promptBlocks: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string }> = [
        { kind: 'text', content: 'Find the gradient of the curve ' },
        { kind: 'math', content: `y = ${funcLatex}` },
        { kind: 'text', content: ' at the point ' },
        { kind: 'math', content: `(${x0}, ${y0})` },
        { kind: 'text', content: '.' },
      ];

      const explanation: KatexExplanationBlock[] = [
        { kind: 'text', content: 'We want the gradient at a point, so we must:' },
        { kind: 'text', content: '1) Differentiate to get dy/dx.' },
        { kind: 'text', content: '2) Substitute the x-coordinate of the point into dy/dx.' },
        { kind: 'math_callout', content: String.raw`y = ${funcLatex}`, callout: 'Start with the given curve.', displayMode: true },
        { kind: 'text', content: 'Differentiate term-by-term:' },
        { kind: 'math_callout', content: dyLatex, callout: 'Differentiate ax^2 + bx + c.', displayMode: true },
        { kind: 'text', content: `Now substitute x = ${x0}:` },
        { kind: 'math_callout', content: String.raw`\left.\frac{dy}{dx}\right|_{x=${x0}} = ${2 * a}\cdot(${x0}) ${b === 0 ? '' : b > 0 ? `+ ${b}` : `- ${Math.abs(b)}`} = ${gradAtX0}`.replace(/\s+/g, ' ').trim(), callout: 'Evaluate the derivative at the given x-value.', displayMode: true },
        { kind: 'math_callout', content: String.raw`${gradAtX0}`, callout: 'Final answer.', displayMode: true },
      ];

      return {
        kind: 'calculus',
        topicId: 'differentiation',
        variantId: 'power_linear_point_gradient',
        id: stableId('diff_poly_point_grad', input.seed, `${a}-${b}-${c}-${x0}`),
        seed: input.seed,
        difficulty: input.difficulty,
        katexQuestion: String.raw`\text{Find the gradient of the curve } y = ${funcLatex} \text{ at the point } (${x0}, ${y0}).`,
        promptBlocks,
        katexExplanation: explanation,
        expectedNormalized: [String(gradAtX0)],
        expectedLatex: String(gradAtX0),
        expectedParts: [fmtFracInput(expectedGrad)],
        normalize: (raw: string) => normalizeExprForCompare(raw),
      };
    }

    const n = input.difficulty === 'easy' ? rng.int(2, 4) : input.difficulty === 'medium' ? rng.int(2, 6) : rng.int(2, 7);
    const aChoices = input.difficulty === 'easy' ? [1, 2, 3] : [1, 2, 3, 4, 5];
    const xChoices = input.difficulty === 'easy' ? [-2, -1, 0, 1, 2] : [-3, -2, -1, 0, 1, 2, 3];
    const bLimit = input.difficulty === 'easy' ? 6 : input.difficulty === 'medium' ? 8 : 10;
    // Cap y-coordinate for the given point across all difficulties.
    const yLimit = 2000;
    const uAbsLimit = input.difficulty === 'easy' ? 8 : input.difficulty === 'medium' ? 9 : 10;

    let a = 2;
    let b = 0;
    let x0 = 1;
    let u0 = 0;
    let y0 = 0;
    let derivAtX0 = 0;
    for (let attempt = 0; attempt < 60; attempt++) {
      a = aChoices[rng.int(0, aChoices.length - 1)] ?? 2;
      b = rng.int(-bLimit, bLimit);
      x0 = xChoices[rng.int(0, xChoices.length - 1)] ?? 1;
      u0 = a * x0 + b;
      if (u0 === 0) continue;
      if (Math.abs(u0) > uAbsLimit) continue;
      y0 = Math.pow(u0, n);
      derivAtX0 = n * a * Math.pow(u0, n - 1);
      if (!Number.isFinite(y0) || !Number.isFinite(derivAtX0)) continue;
      if (Math.abs(y0) <= yLimit) break;
    }

    if (!Number.isFinite(y0) || Math.abs(y0) > yLimit) {
      return generateDifferentiationQuestion({ ...input, seed: input.seed + 1 });
    }

    const expectedGrad = normalizeFraction({ n: derivAtX0, d: 1 });

    const uLatex = `${a === 1 ? '' : a === -1 ? '-' : String(a)}x${b === 0 ? '' : b > 0 ? `+${b}` : `${b}`}`;
    const baseLatex = `(${uLatex})^{${n}}`;
    const duDxLatex = String(a);
    const dyDuLatex = `${n}(${uLatex})^{${n - 1}}`;
    const dyDxLatex = String.raw`${n === 1 ? '' : String(n)}\cdot ${duDxLatex}(${uLatex})^{${n - 1}}`;

    const shouldUseExpansion = input.difficulty === 'easy' && n <= 4 && rng.next() < 0.45;

    const binom = (nn: number, kk: number) => {
      let out = 1;
      for (let i = 1; i <= kk; i++) out = (out * (nn - (kk - i))) / i;
      return Math.round(out);
    };

    const buildExpanded = () => {
      const coeffs: number[] = [];
      for (let k = 0; k <= n; k++) {
        const coeff = binom(n, k) * Math.pow(a, k) * Math.pow(b, n - k);
        coeffs.push(coeff);
      }

      const termLatex = (coeff: number, pow: number) => {
        if (coeff === 0) return '';
        const s = coeff < 0 ? '-' : '+';
        const cAbs = Math.abs(coeff);
        const coeffLatex = pow === 0 ? String(cAbs) : (cAbs === 1 ? '' : String(cAbs));
        const xLatex = pow === 0 ? '' : (pow === 1 ? 'x' : `x^{${pow}}`);
        return `${s}${coeffLatex}${xLatex}`;
      };

      const pieces: string[] = [];
      for (let k = n; k >= 0; k--) {
        pieces.push(termLatex(coeffs[k] ?? 0, k));
      }
      let poly = pieces.filter(Boolean).join('');
      poly = poly.replace(/^\+/, '');
      poly = poly.replace(/\+\-/g, '-');

      const dCoeffs: number[] = [];
      for (let k = 1; k <= n; k++) dCoeffs[k - 1] = k * (coeffs[k] ?? 0);

      const dPieces: string[] = [];
      for (let p = n - 1; p >= 0; p--) {
        const c = dCoeffs[p] ?? 0;
        if (!c) continue;
        const s = c < 0 ? '-' : '+';
        const cAbs = Math.abs(c);
        const coeffLatex = p === 0 ? String(cAbs) : (cAbs === 1 ? '' : String(cAbs));
        const xLatex = p === 0 ? '' : (p === 1 ? 'x' : `x^{${p}}`);
        dPieces.push(`${s}${coeffLatex}${xLatex}`);
      }
      let dPoly = dPieces.join('');
      dPoly = dPoly.replace(/^\+/, '');
      dPoly = dPoly.replace(/\+\-/g, '-');

      return { poly, dPoly };
    };

    const promptBlocks: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string }> = [
      { kind: 'text', content: 'Find the gradient of the curve ' },
      { kind: 'math', content: `y = ${baseLatex}` },
      { kind: 'text', content: ' at the point ' },
      { kind: 'math', content: `(${x0}, ${y0})` },
      { kind: 'text', content: '.' },
    ];

    const explanation: KatexExplanationBlock[] = (() => {
      if (shouldUseExpansion) {
        const { poly, dPoly } = buildExpanded();
        return [
          { kind: 'text', content: 'We want the gradient at a point, so we must:' },
          { kind: 'text', content: '1) Differentiate to get dy/dx.' },
          { kind: 'text', content: '2) Substitute the x-coordinate of the point into dy/dx.' },
          { kind: 'text', content: 'In this question we can expand first, then differentiate term-by-term.' },
          { kind: 'math_callout', content: String.raw`y = (${uLatex})^{${n}}`, callout: 'Start with the given curve.', displayMode: true },
          { kind: 'math_callout', content: String.raw`y = ${poly}`, callout: 'Expand using the binomial theorem.', displayMode: true },
          { kind: 'math_callout', content: String.raw`\frac{dy}{dx} = ${dPoly}`, callout: 'Differentiate term-by-term.', displayMode: true },
          { kind: 'text', content: `Now substitute x = ${x0}.` },
          { kind: 'math_callout', content: String.raw`\left.\frac{dy}{dx}\right|_{x=${x0}} = ${dPoly.replace(/x/g, `(${x0})`)} = ${derivAtX0}`, callout: 'Substitute x into dy/dx and simplify.', displayMode: true },
          { kind: 'text', content: `So the gradient at (${x0}, ${y0}) is ${derivAtX0}.` },
        ];
      }

      return [
        { kind: 'text', content: 'We want the gradient at a point, so we must:' },
        { kind: 'text', content: '1) Differentiate to get dy/dx.' },
        { kind: 'text', content: '2) Substitute the x-coordinate of the point into dy/dx.' },
        { kind: 'math_callout', content: String.raw`y = (${uLatex})^{${n}}`, callout: 'Write the function in a form ready for the chain rule.', displayMode: true },
        { kind: 'text', content: 'This is a composite function (something in brackets) raised to a power, so we use the chain rule.' },
        { kind: 'text', content: 'Let u = ax + b.' },
        { kind: 'math_callout', content: String.raw`u = ${uLatex}`, callout: 'Define the inner function.', displayMode: true },
        { kind: 'text', content: 'Then' },
        { kind: 'math', content: String.raw`y = u^{n}` },
        { kind: 'text', content: 'so' },
        { kind: 'math', content: String.raw`\frac{dy}{du} = n u^{n-1}` },
        { kind: 'math_callout', content: String.raw`\frac{dy}{du} = ${dyDuLatex}`, callout: 'Differentiate with respect to u.', displayMode: true },
        { kind: 'text', content: 'Also du/dx = a.' },
        { kind: 'math_callout', content: String.raw`\frac{du}{dx} = ${duDxLatex}`, callout: 'Differentiate u with respect to x.', displayMode: true },
        { kind: 'text', content: 'Chain rule: dy/dx = (dy/du)(du/dx).' },
        { kind: 'math_callout', content: String.raw`\frac{dy}{dx} = \frac{dy}{du}\cdot\frac{du}{dx} = ${dyDxLatex}`, callout: 'Multiply the two derivatives to get dy/dx.', displayMode: true },
        { kind: 'text', content: 'So the derivative (gradient function) is:' },
        { kind: 'math_callout', content: String.raw`\frac{dy}{dx} = ${dyDxLatex}`, callout: 'This is the expression we substitute into.', displayMode: true },
        { kind: 'text', content: `Now substitute x = ${x0}. First compute u = ax + b.` },
        { kind: 'math_callout', content: String.raw`u = ${a}\cdot(${x0}) ${b === 0 ? '' : b > 0 ? `+ ${b}` : `- ${Math.abs(b)}`} = ${u0}`, callout: 'Evaluate the inner bracket at the given x-value.', displayMode: true },
        { kind: 'text', content: 'Now substitute x into dy/dx.' },
        { kind: 'math_callout', content: String.raw`\left.\frac{dy}{dx}\right|_{x=${x0}} = \left(${dyDxLatex}\right)\Big|_{x=${x0}} = ${n}\cdot ${a}\cdot (${u0})^{${n - 1}} = ${derivAtX0}`, callout: 'Replace dy/dx with its formula, then evaluate at x.', displayMode: true },
        { kind: 'text', content: `So the gradient at (${x0}, ${y0}) is ${derivAtX0}.` },
      ];
    })();

    return {
      kind: 'calculus',
      topicId: 'differentiation',
      variantId: 'power_linear_point_gradient',
      id: stableId('diff_power_linear_point', input.seed, `${a}-${b}-${n}-${x0}`),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion: String.raw`\text{Find the gradient of the curve } y = ${baseLatex} \text{ at the point } (${x0}, ${y0}).`,
      promptBlocks,
      katexExplanation: explanation,
      expectedNormalized: [String(derivAtX0)],
      expectedLatex: String(derivAtX0),
      expectedParts: [fmtFracInput(expectedGrad)],
      normalize: (raw: string) => normalizeExprForCompare(raw),
    };
  }

  if (variant === 'rational_yaxis_gradient') {
    const usePolynomial = input.difficulty === 'easy' || rng.next() < 0.35;

    if (usePolynomial) {
      const useLinear = input.difficulty === 'easy' && rng.next() < 0.45;
      if (useLinear) {
        const m = rng.int(-12, 12) || 3;
        const c = rng.int(-20, 20);
        const funcLatex = String.raw`${m}x ${c === 0 ? '' : c > 0 ? `+ ${c}` : `- ${Math.abs(c)}`}`.replace(/\s+/g, ' ').trim();
        const promptBlocks: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string }> = [
          { kind: 'text', content: 'Find the gradient of the curve ' },
          { kind: 'math', content: `y = ${funcLatex}` },
          { kind: 'text', content: ' at the point where the curve crosses the y-axis.' },
        ];

        const explanation: KatexExplanationBlock[] = [
          { kind: 'text', content: 'Crossing the y-axis means x = 0.' },
          { kind: 'text', content: 'A straight line has constant gradient.' },
          { kind: 'math_callout', content: String.raw`y = ${m}x ${c === 0 ? '' : c > 0 ? `+ ${c}` : `- ${Math.abs(c)}`}`.replace(/\s+/g, ' ').trim(), callout: 'The coefficient of x is the gradient of a straight line.', displayMode: true },
          { kind: 'math_callout', content: String.raw`\frac{dy}{dx} = ${m}`, callout: 'So the gradient is constant everywhere, including at x=0.', displayMode: true },
        ];

        return {
          kind: 'calculus',
          topicId: 'differentiation',
          variantId: 'rational_yaxis_gradient',
          id: stableId('diff_yaxis_grad_linear', input.seed, `${m}-${c}`),
          seed: input.seed,
          difficulty: input.difficulty,
          katexQuestion: String.raw`\text{Find the gradient of the curve } y = ${funcLatex} \text{ at the point where the curve crosses the y-axis.}`,
          promptBlocks,
          katexExplanation: explanation,
          expectedNormalized: [String(m)],
          expectedLatex: String(m),
          expectedParts: [String(m)],
          normalize: (raw: string) => normalizeExprForCompare(raw),
        };
      }

      const a = rng.int(1, input.difficulty === 'easy' ? 4 : 7);
      const b = rng.int(-18, 18);
      const c = rng.int(-25, 25);
      const gradAt0 = b;
      const funcLatex = String.raw`${a === 1 ? '' : a}\,x^{2} ${b === 0 ? '' : b > 0 ? `+ ${b}x` : `- ${Math.abs(b)}x`} ${c === 0 ? '' : c > 0 ? `+ ${c}` : `- ${Math.abs(c)}`}`.replace(/\s+/g, ' ').trim();

      const promptBlocks: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string }> = [
        { kind: 'text', content: 'Find the gradient of the curve ' },
        { kind: 'math', content: `y = ${funcLatex}` },
        { kind: 'text', content: ' at the point where the curve crosses the y-axis.' },
      ];

      const explanation: KatexExplanationBlock[] = [
        { kind: 'text', content: 'Crossing the y-axis means x = 0.' },
        { kind: 'text', content: 'Step 1: Differentiate to find dy/dx.' },
        { kind: 'math_callout', content: String.raw`y = ${funcLatex}`, callout: 'Start with the given curve.', displayMode: true },
        { kind: 'math_callout', content: String.raw`\frac{dy}{dx} = ${2 * a}x ${b === 0 ? '' : b > 0 ? `+ ${b}` : `- ${Math.abs(b)}`}`.replace(/\s+/g, ' ').trim(), callout: 'Differentiate term-by-term.', displayMode: true },
        { kind: 'text', content: 'Step 2: Substitute x = 0.' },
        { kind: 'math_callout', content: String.raw`\left.\frac{dy}{dx}\right|_{x=0} = ${2 * a}\cdot 0 ${b === 0 ? '' : b > 0 ? `+ ${b}` : `- ${Math.abs(b)}`} = ${gradAt0}`.replace(/\s+/g, ' ').trim(), callout: 'Evaluate the derivative at the y-axis.', displayMode: true },
        { kind: 'math_callout', content: String.raw`${gradAt0}`, callout: 'Final answer.', displayMode: true },
      ];

      return {
        kind: 'calculus',
        topicId: 'differentiation',
        variantId: 'rational_yaxis_gradient',
        id: stableId('diff_yaxis_grad_quad', input.seed, `${a}-${b}-${c}`),
        seed: input.seed,
        difficulty: input.difficulty,
        katexQuestion: String.raw`\text{Find the gradient of the curve } y = ${funcLatex} \text{ at the point where the curve crosses the y-axis.}`,
        promptBlocks,
        katexExplanation: explanation,
        expectedNormalized: [String(gradAt0)],
        expectedLatex: String(gradAt0),
        expectedParts: [String(gradAt0)],
        normalize: (raw: string) => normalizeExprForCompare(raw),
      };
    }

    const k = rng.int(2, input.difficulty === 'easy' ? 10 : 14);
    const a = rng.int(-3, 4);
    if (a === 0) {
      return generateDifferentiationQuestion({ ...input, seed: input.seed + 1 });
    }

    const x0 = 0;
    const denomPow3 = Math.pow(x0 - a, 3);
    const grad = fraction(-2 * k, denomPow3);
    const yAt0 = fraction(k, (x0 - a) * (x0 - a));

    const kLatex = String(k);
    const denomLatex = `(x ${a < 0 ? `+ ${Math.abs(a)}` : a > 0 ? `- ${a}` : ''})^{2}`;
    const funcLatex = String.raw`\frac{${kLatex}}{${denomLatex}}`;

    const promptBlocks: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string }> = [
      { kind: 'text', content: 'Find the gradient of the curve ' },
      { kind: 'math', content: `y = ${funcLatex}` },
      { kind: 'text', content: ' at the point where the curve crosses the y-axis.' },
    ];

    const explanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Crossing the y-axis means x = 0.' },
      { kind: 'text', content: 'Step 1: Differentiate to find dy/dx.' },
      { kind: 'math_callout', content: String.raw`y = \frac{${kLatex}}{${denomLatex}} = ${kLatex}(x ${a < 0 ? `+ ${Math.abs(a)}` : a > 0 ? `- ${a}` : ''})^{-2}`, callout: 'Rewrite as a power so we can differentiate using the power rule.', displayMode: true },
      { kind: 'text', content: 'Use the power rule with the chain rule:' },
      { kind: 'math_callout', content: String.raw`\frac{dy}{dx} = ${kLatex}\cdot(-2)(x ${a < 0 ? `+ ${Math.abs(a)}` : a > 0 ? `- ${a}` : ''})^{-3}\cdot 1`, callout: 'Differentiate the outer power and multiply by the derivative of the inner bracket.', displayMode: true },
      { kind: 'math_callout', content: String.raw`\frac{dy}{dx} = -2\cdot ${kLatex}(x ${a < 0 ? `+ ${Math.abs(a)}` : a > 0 ? `- ${a}` : ''})^{-3}`, callout: 'Simplify dy/dx.', displayMode: true },
      { kind: 'text', content: 'Step 2: Substitute x = 0.' },
      { kind: 'math_callout', content: String.raw`\left.\frac{dy}{dx}\right|_{x=0} = -2\cdot ${kLatex}(0 ${a < 0 ? `+ ${Math.abs(a)}` : a > 0 ? `- ${a}` : ''})^{-3}`, callout: 'Crossing the y-axis means x=0.', displayMode: true },
      { kind: 'text', content: 'Compute the bracket exactly, then simplify as a fraction in simplest form.' },
      { kind: 'math_callout', content: String.raw`0 ${a < 0 ? `+ ${Math.abs(a)}` : a > 0 ? `- ${a}` : ''} = ${x0 - a}`, callout: 'Evaluate the inner bracket at x=0.', displayMode: true },
      { kind: 'math_callout', content: String.raw`\left.\frac{dy}{dx}\right|_{x=0} = ${fractionToLatex(grad)}`, callout: 'Write the gradient in simplest form.', displayMode: true },
      { kind: 'text', content: 'So the gradient at the y-axis intercept is:' },
      { kind: 'math_callout', content: String.raw`${fractionToLatex(grad)}`, callout: 'Final answer.', displayMode: true },
      { kind: 'text', content: 'For reference, the point on the y-axis is obtained by substituting x=0 into y:' },
      { kind: 'math_callout', content: String.raw`y(0) = ${fractionToLatex(yAt0)}`, callout: 'This is the y-coordinate at x=0 (not required unless asked, but it confirms the point).', displayMode: true },
    ];

    return {
      kind: 'calculus',
      topicId: 'differentiation',
      variantId: 'rational_yaxis_gradient',
      id: stableId('diff_rational_yaxis', input.seed, `${k}-${a}`),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion: String.raw`\text{Find the gradient of the curve } y = ${funcLatex} \text{ at the point where the curve crosses the y-axis.}`,
      promptBlocks,
      katexExplanation: explanation,
      expectedNormalized: [fmtFracInput(grad)],
      expectedLatex: fractionToLatex(grad),
      expectedParts: [fmtFracInput(grad)],
      normalize: (raw: string) => normalizeExprForCompare(raw),
    };
  }

  if (variant === 'linear_minus_rational_xaxis_gradients') {
    // Either:
    // (A) Quadratic/trinomial with two x-intercepts (non-fractional), OR
    // (B) Template: y = x - p/(x+q).

    // (S) Surd roots case: quadratic with irrational x-intercepts; gradients at intercepts are ±sqrt(D).
    const useSurdRoots = input.difficulty !== 'easy' && rng.next() < (input.difficulty === 'medium' ? 0.22 : 0.35);
    if (useSurdRoots) {
      const a = 1;
      const dChoices = [12, 20, 28, 44, 52, 60, 68, 76, 92, 108, 116, 124];
      const D = dChoices[rng.int(0, dChoices.length - 1)] ?? 20;
      const b = 2 * rng.int(-10, 10);
      const c = (b * b - D) / 4;
      if (!Number.isFinite(c) || !Number.isInteger(c)) {
        return generateDifferentiationQuestion({ ...input, seed: input.seed + 1 });
      }

      const sqrtD = Math.sqrt(D);
      if (!Number.isFinite(sqrtD) || Number.isInteger(sqrtD)) {
        return generateDifferentiationQuestion({ ...input, seed: input.seed + 1 });
      }

      const gradPos = sqrtD;
      const gradNeg = -sqrtD;

      const to3sfString = (x: number) => {
        if (!Number.isFinite(x)) return String(x);
        return Number(x.toPrecision(3)).toString();
      };

      const g1s = to3sfString(gradPos);
      const g2s = to3sfString(gradNeg);

      const funcLatex = String.raw`x^{2} ${b === 0 ? '' : b > 0 ? `+ ${b}x` : `- ${Math.abs(b)}x`} ${c === 0 ? '' : c > 0 ? `+ ${c}` : `- ${Math.abs(c)}`}`.replace(/\s+/g, ' ').trim();
      const dyLatex = String.raw`\frac{dy}{dx} = 2x ${b === 0 ? '' : b > 0 ? `+ ${b}` : `- ${Math.abs(b)}`}`.replace(/\s+/g, ' ').trim();

      const promptBlocks: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string }> = [
        { kind: 'text', content: 'Find the gradient of the curve ' },
        { kind: 'math', content: `y = ${funcLatex}` },
        { kind: 'text', content: ' at the points where the curve crosses the x-axis. Give your answers to 3 s.f.' },
      ];

      const explanation: KatexExplanationBlock[] = [
        { kind: 'text', content: 'Crossing the x-axis means y = 0.' },
        { kind: 'text', content: 'Step 1: Find the x-intercepts by solving y = 0.' },
        { kind: 'math_callout', content: String.raw`0 = ${funcLatex}`, callout: 'Set y=0.', displayMode: true },
        { kind: 'text', content: 'This quadratic does not factorise nicely, so we use the quadratic formula.' },
        { kind: 'math_callout', content: String.raw`x = \frac{-b \pm \sqrt{b^{2} - 4ac}}{2a}`, callout: 'Quadratic formula.', displayMode: true },
        { kind: 'math_callout', content: String.raw`b^{2} - 4ac = ${D}`, callout: 'Compute the discriminant.', displayMode: true },
        { kind: 'math_callout', content: String.raw`x = \frac{-(${b}) \pm \sqrt{${D}}}{2}`, callout: 'Substitute into the quadratic formula.', displayMode: true },
        { kind: 'text', content: 'Step 2: Differentiate to get dy/dx.' },
        { kind: 'math_callout', content: dyLatex, callout: 'Differentiate term-by-term.', displayMode: true },
        { kind: 'text', content: 'Step 3: Substitute each x-intercept into dy/dx. A useful shortcut happens here:' },
        { kind: 'math_callout', content: String.raw`\left.\frac{dy}{dx}\right|_{x=\frac{-b\pm\sqrt{D}}{2}} = 2\left(\frac{-b\pm\sqrt{D}}{2}\right)+b = \pm\sqrt{D}`, callout: 'At the roots of ax^2+bx+c, the gradients simplify to ±√D for a=1.', displayMode: true },
        { kind: 'text', content: 'So the exact gradients are surds. Use a calculator only to convert these surds to decimals (3 s.f.).' },
        { kind: 'math_callout', content: String.raw`\sqrt{${D}} \approx ${g1s},\quad -\sqrt{${D}} \approx ${g2s}`, callout: 'Final answers to 3 s.f.', displayMode: true },
      ];

      return {
        kind: 'calculus',
        topicId: 'differentiation',
        variantId: 'linear_minus_rational_xaxis_gradients',
        id: stableId('diff_xaxis_grads_surd', input.seed, `${b}-${c}-${D}`),
        seed: input.seed,
        difficulty: input.difficulty,
        katexQuestion: String.raw`\text{Find the gradient of the curve } y = ${funcLatex} \text{ at the points where the curve crosses the x-axis. Give your answers to 3 s.f.}`,
        promptBlocks,
        katexExplanation: explanation,
        expectedNormalized: [g1s, g2s],
        expectedLatex: String.raw`\sqrt{${D}},\; -\sqrt{${D}}`,
        expectedParts: [g1s, g2s],
        normalize: (raw: string) => normalizeExprForCompare(raw),
        // Extra metadata for UI/grading
        answerFormat: 'decimal_3sf',
        calculatorHint: 'If the exact answer is a surd, use a calculator only to convert the surd to a decimal (3 s.f.).',
      } as any;
    }

    const useQuadratic = input.difficulty === 'easy' || rng.next() < 0.35;
    if (useQuadratic) {
      // y = a(x-r1)(x-r2) expanded to a quadratic/trinomial.
      const aChoices = input.difficulty === 'easy' ? [1, 2] : input.difficulty === 'medium' ? [1, 2, 3] : [1, 2, 3, 4];
      const a = aChoices[rng.int(0, aChoices.length - 1)] ?? 1;
      const r1 = rng.int(input.difficulty === 'easy' ? -6 : -10, -1);
      let r2 = rng.int(1, input.difficulty === 'easy' ? 7 : 12);
      if (r2 === r1) r2 += 1;

      const b = -a * (r1 + r2);
      const c = a * r1 * r2;

      const grad1 = 2 * a * r1 + b;
      const grad2 = 2 * a * r2 + b;

      const funcLatex = String.raw`${a === 1 ? '' : a}\,x^{2} ${b === 0 ? '' : b > 0 ? `+ ${b}x` : `- ${Math.abs(b)}x`} ${c === 0 ? '' : c > 0 ? `+ ${c}` : `- ${Math.abs(c)}`}`.replace(/\s+/g, ' ').trim();
      const dyLatex = String.raw`\frac{dy}{dx} = ${2 * a}x ${b === 0 ? '' : b > 0 ? `+ ${b}` : `- ${Math.abs(b)}`}`.replace(/\s+/g, ' ').trim();

      const promptBlocks: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string }> = [
        { kind: 'text', content: 'Find the gradient of the curve ' },
        { kind: 'math', content: `y = ${funcLatex}` },
        { kind: 'text', content: ' at the points where the curve crosses the x-axis.' },
      ];

      const explanation: KatexExplanationBlock[] = [
        { kind: 'text', content: 'Crossing the x-axis means y = 0.' },
        { kind: 'text', content: 'Step 1: Find the x-intercepts by solving y = 0.' },
        { kind: 'math_callout', content: String.raw`0 = ${funcLatex}`, callout: 'Set y=0.', displayMode: true },
        { kind: 'math_callout', content: String.raw`0 = ${a}(x - (${r1}))(x - (${r2}))`, callout: 'This quadratic factorises nicely, revealing the roots.', displayMode: true },
        { kind: 'math_callout', content: String.raw`x = ${r1} \text{ or } x = ${r2}`, callout: 'These are the x-coordinates where the curve crosses the x-axis.', displayMode: true },
        { kind: 'text', content: 'Step 2: Differentiate to get dy/dx.' },
        { kind: 'math_callout', content: dyLatex, callout: 'Differentiate term-by-term.', displayMode: true },
        { kind: 'text', content: 'Step 3: Substitute each x-intercept into dy/dx.' },
        { kind: 'math_callout', content: String.raw`\left.\frac{dy}{dx}\right|_{x=${r1}} = ${grad1}`, callout: 'Gradient at the first intercept.', displayMode: true },
        { kind: 'math_callout', content: String.raw`\left.\frac{dy}{dx}\right|_{x=${r2}} = ${grad2}`, callout: 'Gradient at the second intercept.', displayMode: true },
        { kind: 'math_callout', content: String.raw`${grad1} \text{ and } ${grad2}`, callout: 'Final answers.', displayMode: true },
      ];

      return {
        kind: 'calculus',
        topicId: 'differentiation',
        variantId: 'linear_minus_rational_xaxis_gradients',
        id: stableId('diff_quad_xaxis_grads', input.seed, `${a}-${r1}-${r2}`),
        seed: input.seed,
        difficulty: input.difficulty,
        katexQuestion: String.raw`\text{Find the gradient of the curve } y = ${funcLatex} \text{ at the points where the curve crosses the x-axis.}`,
        promptBlocks,
        katexExplanation: explanation,
        expectedNormalized: [String(grad1), String(grad2)],
        expectedLatex: String.raw`${grad1},\;${grad2}`,
        expectedParts: [String(grad1), String(grad2)],
        normalize: (raw: string) => normalizeExprForCompare(raw),
      };
    }

    // Template: y = x - p/(x+q). Find gradient at x-intercepts.
    // x-intercepts satisfy x - p/(x+q) = 0 => x(x+q) - p = 0 => x^2 + qx - p = 0.
    // If roots are r1,r2 then q = r1 + r2 and -p = r1 r2 => p = -r1 r2.

    const q = rng.int(1, input.difficulty === 'easy' ? 6 : 10);
    const r1 = rng.int(-q + 1, -1);
    const r2 = -q - r1;
    const p = -r1 * r2;
    if (p === 0) {
      return generateDifferentiationQuestion({ ...input, seed: input.seed + 1 });
    }

    // Derivative: y' = 1 + p/(x+q)^2
    const grad1 = fraction((r1 + q) * (r1 + q) + p, (r1 + q) * (r1 + q));
    const grad2 = fraction((r2 + q) * (r2 + q) + p, (r2 + q) * (r2 + q));

    const funcLatex = String.raw`x - \frac{${p}}{x + ${q}}`;

    const promptBlocks: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string }> = [
      { kind: 'text', content: 'Find the gradient of the curve ' },
      { kind: 'math', content: `y = ${funcLatex}` },
      { kind: 'text', content: ' at the points where the curve crosses the x-axis.' },
    ];

    const explanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Crossing the x-axis means y = 0.' },
      { kind: 'text', content: 'Step 1: Find the x-intercepts by solving y = 0.' },
      { kind: 'math_callout', content: String.raw`0 = x - \frac{${p}}{x + ${q}}`, callout: 'Set y=0 to find where the curve crosses the x-axis.', displayMode: true },
      { kind: 'text', content: 'Multiply both sides by (x + q) to clear the fraction.' },
      { kind: 'math_callout', content: String.raw`0 = x(x + ${q}) - ${p}`, callout: 'Clear the fraction by multiplying by (x+q).', displayMode: true },
      { kind: 'math_callout', content: String.raw`0 = x^{2} + ${q}x - ${p}`, callout: 'Expand and collect terms to form a quadratic.', displayMode: true },
      { kind: 'text', content: 'Factorise the quadratic to find the roots (x-intercepts).' },
      { kind: 'math_callout', content: String.raw`x^{2} + ${q}x - ${p} = (x - (${r1}))(x - (${r2}))`, callout: 'Factorise to identify the roots.', displayMode: true },
      { kind: 'math_callout', content: String.raw`x = ${r1} \text{ or } x = ${r2}`, callout: 'These are the x-coordinates of the intercepts.', displayMode: true },
      { kind: 'text', content: 'So the curve crosses the x-axis at two points, and we need the gradient at each of these x-values.' },
      { kind: 'text', content: 'Step 2: Differentiate to get dy/dx.' },
      { kind: 'math_callout', content: String.raw`y = x - ${p}(x + ${q})^{-1}`, callout: 'Rewrite the fraction using a negative power.', displayMode: true },
      { kind: 'math_callout', content: String.raw`\frac{dy}{dx} = 1 - ${p}\cdot(-1)(x + ${q})^{-2}`, callout: 'Differentiate term-by-term using the chain rule.', displayMode: true },
      { kind: 'math_callout', content: String.raw`\frac{dy}{dx} = 1 + \frac{${p}}{(x + ${q})^{2}}`, callout: 'Simplify dy/dx.', displayMode: true },
      { kind: 'text', content: `Step 3: Substitute x = ${r1} and x = ${r2}, simplifying each answer to simplest fractional form.` },
      { kind: 'math_callout', content: String.raw`\left.\frac{dy}{dx}\right|_{x=${r1}} = 1 + \frac{${p}}{(${r1} + ${q})^{2}} = \frac{${grad1.n}}{${grad1.d}}`, callout: 'Substitute the first intercept and simplify.', displayMode: true },
      { kind: 'math_callout', content: String.raw`\left.\frac{dy}{dx}\right|_{x=${r2}} = 1 + \frac{${p}}{(${r2} + ${q})^{2}} = \frac{${grad2.n}}{${grad2.d}}`, callout: 'Substitute the second intercept and simplify.', displayMode: true },
      { kind: 'text', content: 'Therefore the two gradients (one at each x-intercept) are:' },
      { kind: 'math_callout', content: String.raw`\frac{${grad1.n}}{${grad1.d}} \text{ and } \frac{${grad2.n}}{${grad2.d}}`, callout: 'Final answers (in simplest form).', displayMode: true },
    ];

    return {
      kind: 'calculus',
      topicId: 'differentiation',
      variantId: 'linear_minus_rational_xaxis_gradients',
      id: stableId('diff_linear_minus_rational_xaxis', input.seed, `${p}-${q}`),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion: String.raw`\text{Find the gradient of the curve } y = ${funcLatex} \text{ at the points where the curve crosses the x-axis.}`,
      promptBlocks,
      katexExplanation: explanation,
      expectedNormalized: [fmtFracInput(grad1), fmtFracInput(grad2)],
      expectedLatex: String.raw`${fractionToLatex(grad1)},\;${fractionToLatex(grad2)}`,
      expectedParts: [fmtFracInput(grad1), fmtFracInput(grad2)],
      normalize: (raw: string) => normalizeExprForCompare(raw),
    };
  }

  if (variant === 'stationary_points_coords') {
    // Find coordinates of point(s) on a curve where the gradient equals a given value m.
    // When m = 0, these are stationary points. For non-zero m, they are points where the tangent has gradient m.
    // We construct curves so that x- and y-coordinates are integers, and we scale the size/complexity by difficulty.

    const pickFrom = <T,>(arr: T[]): T => arr[rng.int(0, arr.length - 1)] as T;
    const abs = (n: number) => Math.abs(n);

    const size = input.difficulty === 'easy' ? 4 : input.difficulty === 'medium' ? 7 : 11;
    const yLimit = input.difficulty === 'easy' ? 3000 : input.difficulty === 'medium' ? 25000 : 120000;
    const m = (() => {
      // m must be an integer, and we want a wide spread of positive/negative values.
      // Still allow m=0 sometimes for true stationary-point questions.
      const allowZero = rng.next() < (input.difficulty === 'easy' ? 0.35 : 0.2);
      if (allowZero) return 0;
      const maxMag = input.difficulty === 'easy' ? 8 : input.difficulty === 'medium' ? 15 : 25;
      const mag = rng.int(1, maxMag);
      return rng.next() < 0.5 ? -mag : mag;
    })();

    // Easy: quadratic gives exactly one solution to dy/dx = m.
    // Medium/Hard: cubic gives two solutions (since dy/dx = m is a quadratic equation).
    const useCubic = input.difficulty !== 'easy' && rng.next() < (input.difficulty === 'medium' ? 0.7 : 0.85);

    if (!useCubic) {
      // y = a x^2 + b x + c
      // dy/dx = 2ax + b
      // dy/dx = m => x = (m - b)/(2a)
      // Choose a,b so that x is an integer.

      const aChoices = input.difficulty === 'easy' ? [1, 2, 3] : [1, 2, 3, 4, 5];
      const a = pickFrom(aChoices);
      const x0 = rng.int(-size, size);
      const b = m - 2 * a * x0;
      const c = rng.int(-size * 3, size * 3);
      const y0 = a * x0 * x0 + b * x0 + c;
      if (!Number.isFinite(y0) || Math.abs(y0) > yLimit) {
        return generateDifferentiationQuestion({ ...input, seed: input.seed + 1 });
      }

      const funcLatex = String.raw`${a === 1 ? '' : a === -1 ? '-' : a}\,x^{2} ${b === 0 ? '' : b > 0 ? `+ ${b}x` : `- ${abs(b)}x`} ${c === 0 ? '' : c > 0 ? `+ ${c}` : `- ${abs(c)}`}`.replace(/\s+/g, ' ').trim();
      const pointLatex = String.raw`\left(${x0},\;${y0}\right)`;

      const promptBlocks: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string }> = [
        { kind: 'text', content: 'Find the coordinates of the point on the curve ' },
        { kind: 'math', content: `y = ${funcLatex}` },
        { kind: 'text', content: ' where the gradient is ' },
        { kind: 'math', content: String(m) },
        { kind: 'text', content: '.' },
      ];

      const explanation: KatexExplanationBlock[] = [
        { kind: 'text', content: `We want the point(s) where the gradient (dy/dx) is ${m}.` },
        { kind: 'math_callout', content: String.raw`y = ${funcLatex}`, callout: 'Start with the given curve.', displayMode: true },
        { kind: 'text', content: 'Differentiate y with respect to x.' },
        { kind: 'math_callout', content: String.raw`\frac{dy}{dx} = ${2 * a}x ${b === 0 ? '' : b > 0 ? `+ ${b}` : `- ${abs(b)}`}`.replace(/\s+/g, ' ').trim(), callout: 'Differentiate term-by-term.', displayMode: true },
        { kind: 'text', content: `Set this equal to ${m} and solve for x.` },
        { kind: 'math_callout', content: String.raw`${2 * a}x ${b === 0 ? '' : b > 0 ? `+ ${b}` : `- ${abs(b)}`} = ${m}`.replace(/\s+/g, ' ').trim(), callout: 'Set dy/dx to the required gradient.', displayMode: true },
        { kind: 'math_callout', content: String.raw`${2 * a}x = ${m - b}`, callout: 'Rearrange to isolate the x-term.', displayMode: true },
        { kind: 'math_callout', content: String.raw`x = ${x0}`, callout: 'Solve for x.', displayMode: true },
        { kind: 'text', content: 'Substitute this x-value back into the original curve to find y.' },
        { kind: 'math_callout', content: String.raw`y = ${a}\cdot(${x0})^{2} ${b === 0 ? '' : b > 0 ? `+ ${b}\\cdot(${x0})` : `- ${abs(b)}\\cdot(${x0})`} ${c === 0 ? '' : c > 0 ? `+ ${c}` : `- ${abs(c)}`}`.replace(/\s+/g, ' ').trim(), callout: 'Substitute x into y.', displayMode: true },
        { kind: 'math_callout', content: String.raw`y = ${y0}`, callout: 'Evaluate to get the y-coordinate.', displayMode: true },
        { kind: 'text', content: 'Therefore the required coordinate is:' },
        { kind: 'math_callout', content: pointLatex, callout: 'Final answer.', displayMode: true },
      ];

      return {
        kind: 'calculus',
        topicId: 'differentiation',
        variantId: 'stationary_points_coords',
        id: stableId('diff_coords_grad_m_quad', input.seed, `${a}-${b}-${c}-${m}`),
        seed: input.seed,
        difficulty: input.difficulty,
        katexQuestion: String.raw`\text{Find the coordinates of the point on the curve } y = ${funcLatex} \text{ where the gradient is } ${m}.`,
        promptBlocks,
        katexExplanation: explanation,
        expectedNormalized: [normalizeExprForCompare(pointLatex)],
        expectedLatex: pointLatex,
        expectedParts: [String(x0), String(y0)],
        normalize: (raw: string) => normalizeExprForCompare(raw),
      };
    }

    // Cubic: y = a x^3 + b x^2 + c x + d
    // Choose integer roots r1,r2 for dy/dx = m by forcing:
    // dy/dx - m = 3a(x-r1)(x-r2)
    // => 3a x^2 + 2b x + (c - m) has roots r1,r2.
    const aChoices = input.difficulty === 'medium' ? [2, 4] : [2, 4, 6];
    const a = pickFrom(aChoices);
    const r1 = rng.int(-size, size);
    let r2 = rng.int(-size, size);
    if (r2 === r1) r2 += r2 >= 0 ? 1 : -1;

    const b = (-3 * a * (r1 + r2)) / 2;
    if (!Number.isInteger(b)) {
      return generateDifferentiationQuestion({ ...input, seed: input.seed + 1 });
    }
    const c = m + 3 * a * r1 * r2;
    const d = rng.int(-size * 6, size * 6);

    const yAt = (x: number) => a * x * x * x + b * x * x + c * x + d;
    const y1 = yAt(r1);
    const y2 = yAt(r2);
    if (!Number.isFinite(y1) || !Number.isFinite(y2) || Math.abs(y1) > yLimit || Math.abs(y2) > yLimit) {
      return generateDifferentiationQuestion({ ...input, seed: input.seed + 1 });
    }

    const funcLatex = String.raw`${a === 1 ? '' : a}\,x^{3} ${b === 0 ? '' : b > 0 ? `+ ${b}x^{2}` : `- ${abs(b)}x^{2}`} ${c === 0 ? '' : c > 0 ? `+ ${c}x` : `- ${abs(c)}x`} ${d === 0 ? '' : d > 0 ? `+ ${d}` : `- ${abs(d)}`}`.replace(/\s+/g, ' ').trim();
    const pointsLatex = [
      String.raw`\left(${r1},\;${y1}\right)`,
      String.raw`\left(${r2},\;${y2}\right)`,
    ];
    const pointsLatexJoined = String.raw`${pointsLatex[0]},\;${pointsLatex[1]}`;

    const promptBlocks: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string }> = [
      { kind: 'text', content: 'Find the coordinates of the point(s) on the curve ' },
      { kind: 'math', content: `y = ${funcLatex}` },
      { kind: 'text', content: ' where the gradient is ' },
      { kind: 'math', content: String(m) },
      { kind: 'text', content: '.' },
    ];

    const dy = String.raw`\frac{dy}{dx} = ${3 * a}x^{2} ${2 * b === 0 ? '' : 2 * b > 0 ? `+ ${2 * b}x` : `- ${abs(2 * b)}x`} ${c === 0 ? '' : c > 0 ? `+ ${c}` : `- ${abs(c)}`}`.replace(/\s+/g, ' ').trim();
    const quadEq = String.raw`${3 * a}x^{2} ${2 * b === 0 ? '' : 2 * b > 0 ? `+ ${2 * b}x` : `- ${abs(2 * b)}x`} ${c - m === 0 ? '' : c - m > 0 ? `+ ${c - m}` : `- ${abs(c - m)}`} = 0`.replace(/\s+/g, ' ').trim();
    const factored = String.raw`${3 * a}(x - (${r1}))(x - (${r2})) = 0`;

    const explanation: KatexExplanationBlock[] = [
      { kind: 'text', content: `We want the point(s) where the gradient (dy/dx) is ${m}.` },
      { kind: 'math_callout', content: String.raw`y = ${funcLatex}`, callout: 'Start with the given curve.', displayMode: true },
      { kind: 'text', content: 'Step 1: Differentiate.' },
      { kind: 'math_callout', content: dy, callout: 'Differentiate term-by-term using the power rule.', displayMode: true },
      { kind: 'text', content: `Step 2: Set dy/dx = ${m} and rearrange into a quadratic equation.` },
      { kind: 'math_callout', content: String.raw`\frac{dy}{dx} = ${m}`, callout: 'Apply the condition “gradient = m”.', displayMode: true },
      { kind: 'math_callout', content: quadEq, callout: 'Move all terms to one side to get a quadratic in x.', displayMode: true },
      { kind: 'text', content: 'Step 3: Solve the quadratic to find the x-value(s).' },
      { kind: 'math_callout', content: factored, callout: 'Factorise the quadratic (here it factorises nicely).', displayMode: true },
      { kind: 'math_callout', content: String.raw`x = ${r1} \text{ or } x = ${r2}`, callout: 'Set each bracket to 0.', displayMode: true },
      { kind: 'text', content: 'Step 4: Substitute each x-value into the original curve to find the corresponding y-values.' },
      { kind: 'math_callout', content: String.raw`y(${r1}) = ${y1}`, callout: 'Substitute x = first solution.', displayMode: true },
      { kind: 'math_callout', content: String.raw`y(${r2}) = ${y2}`, callout: 'Substitute x = second solution.', displayMode: true },
      { kind: 'text', content: 'Therefore the required coordinate(s) are:' },
      { kind: 'math_callout', content: pointsLatexJoined, callout: 'Final answers.', displayMode: true },
    ];

    return {
      kind: 'calculus',
      topicId: 'differentiation',
      variantId: 'stationary_points_coords',
      id: stableId('diff_coords_grad_m_cubic', input.seed, `${a}-${b}-${c}-${d}-${m}`),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion: String.raw`\text{Find the coordinates of the point(s) on the curve } y = ${funcLatex} \text{ where the gradient is } ${m}.`,
      promptBlocks,
      katexExplanation: explanation,
      expectedNormalized: pointsLatex.map((p) => normalizeExprForCompare(p)),
      expectedLatex: pointsLatexJoined,
      expectedParts: [String(r1), String(y1), String(r2), String(y2)],
      normalize: (raw: string) => normalizeExprForCompare(raw),
    };
  }

  if (variant === 'sqrt_params_point_gradient') {
    // Template: y = sqrt(ax + b) passes through (x0,y0) and has gradient g at this point.
    // y0 = sqrt(a x0 + b) => a x0 + b = y0^2
    // dy/dx = a / (2 sqrt(ax+b)) so at point: g = a / (2 y0) => a = 2 y0 g
    // then b = y0^2 - a x0

    // Build a point with small integers and rational gradient.
    const y0 = rng.int(2, input.difficulty === 'easy' ? 6 : 8);
    const x0 = rng.int(1, input.difficulty === 'easy' ? 12 : 15);

    // Choose g as a rational with small denominator; allow negatives for variety.
    const sign = rng.next() < 0.25 ? -1 : 1;
    const denChoices = input.difficulty === 'easy' ? [2, 4] : [2, 3, 4, 5, 6];
    const den = denChoices[rng.int(0, denChoices.length - 1)] ?? 4;
    const num = rng.int(1, Math.min(6, den));
    const g = fraction(sign * num, den);

    const aFrac = mulFrac(fraction(2 * y0, 1), g);
    const bFrac = subFrac(fraction(y0 * y0, 1), mulFrac(aFrac, fraction(x0, 1)));

    const aLatex = fractionToLatex(aFrac);
    const bLatex = fractionToLatex(bFrac);
    const gLatex = fractionToLatex(g);

    const mustUseFractions = !isIntFrac(aFrac) || !isIntFrac(bFrac) || !isIntFrac(g);
    const fractionInstruction = mustUseFractions
      ? String.raw`\textbf{If your answer is a fraction, give it in simplest form.}`
      : '';

    const yLatex = String.raw`y = \sqrt{ax + b}`;

    const eq1 = String.raw`${y0} = \sqrt{${x0}a + b}`;
    const eq1sq = String.raw`${y0 * y0} = ${x0}a + b`;
    const uDef = String.raw`u = ax + b`;
    const yAsU = String.raw`y = u^{\tfrac{1}{2}}`;
    const dydu = String.raw`\frac{dy}{du} = \frac{1}{2}u^{-\tfrac{1}{2}}`;
    const dudx = String.raw`\frac{du}{dx} = a`;
    const dydxChain = String.raw`\frac{dy}{dx} = \frac{dy}{du}\cdot\frac{du}{dx} = \frac{1}{2}u^{-\tfrac{1}{2}}\cdot a`;
    const dydxSub = String.raw`\frac{dy}{dx} = \frac{a}{2\sqrt{ax+b}}`;
    const dydxAtPoint = String.raw`${gLatex} = \frac{a}{2\cdot ${y0}}`;
    const aSolve = String.raw`a = 2\cdot ${y0}\cdot ${gLatex} = ${aLatex}`;
    const bSolve = String.raw`b = ${y0 * y0} - ${x0}\cdot a = ${y0 * y0} - ${x0}\cdot ${aLatex} = ${bLatex}`;

    const explanation: KatexExplanationBlock[] = [
      { kind: 'math_callout', content: yLatex, callout: `Substitute x = ${x0} and y = ${y0}.`, displayMode: true },
      { kind: 'math', content: eq1, displayMode: true },
      { kind: 'math', content: eq1sq, displayMode: true },
      { kind: 'math_callout', content: yAsU, callout: 'Write the square root as a power.', displayMode: true },
      { kind: 'math', content: uDef, displayMode: true },
      { kind: 'math_callout', content: dydu, callout: 'Differentiate with respect to u.', displayMode: true },
      { kind: 'math', content: dudx, displayMode: true },
      { kind: 'math_callout', content: dydxChain, callout: 'Use the chain rule.', displayMode: true },
      { kind: 'math', content: dydxSub, displayMode: true },
      { kind: 'math_callout', content: dydxAtPoint, callout: String.raw`Substitute x = ${x0} and dy/dx = ${gLatex}.`, displayMode: true },
      { kind: 'math', content: aSolve, displayMode: true },
      { kind: 'math', content: bSolve, displayMode: true },
      { kind: 'text', content: 'Answer' },
      { kind: 'math', content: String.raw`a = ${aLatex},\quad b = ${bLatex}.`, displayMode: true },
    ];

    if (fractionInstruction) {
      explanation.splice(0, 0, { kind: 'text', content: 'Give your answer in simplest fractional form if needed.' });
    }

    const expectedParts = [fmtFracInput(aFrac), fmtFracInput(bFrac)];
    const expectedLatex = String.raw`a=${aLatex},\;b=${bLatex}`;
    const expectedNormalized = [
      normalizeABPair(`${expectedParts[0]},${expectedParts[1]}`),
      normalizeABPair(`a=${expectedParts[0]},b=${expectedParts[1]}`),
      normalizeABPair(`b=${expectedParts[1]},a=${expectedParts[0]}`),
      normalizeABPair(`b=${expectedParts[1]}`),
    ].filter(Boolean);

    return {
      kind: 'calculus',
      topicId: 'differentiation',
      variantId: 'sqrt_params_point_gradient',
      id: stableId('diff_sqrt_params', input.seed, `${x0}-${y0}-${g.n}-${g.d}`),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion: String.raw`${yLatex}`,
      promptBlocks: [
        { kind: 'text', content: 'The curve' },
        { kind: 'math', content: yLatex },
        { kind: 'text', content: `passes through the point (${x0}, ${y0}) and has gradient` },
        { kind: 'math', content: gLatex },
        { kind: 'text', content: 'at this point. Find the value of a and the value of b.' },
        ...(fractionInstruction ? [{ kind: 'text' as const, content: 'If your answer is a fraction, give it in simplest form.' }] : []),
      ],
      katexExplanation: explanation,
      expectedNormalized,
      expectedLatex,
      expectedParts,
      normalize: normalizeABPair,
    };
  }

  if (variant === 'stationary_points') {
    // Template: y = k (m - n x) (x + p)^2
    // y' factors nicely: y' = k (x + p)( (2m - np) - 3n x )
    // stationary points: x = -p and x = (2m - np)/(3n)
    // Variant: square the first factor instead: y = k (m - n x)^2 (x + p)
    // y' factors nicely: y' = k (m - n x)( (m - 2np) - 3n x )
    // stationary points: x = m/n and x = (m - 2np)/(3n)
    const kNum = input.difficulty === 'easy' ? 1 : rng.int(1, 3);
    const kDen = input.difficulty === 'hard' && rng.next() < 0.35 ? 2 : 1;
    const kLatex = kDen === 1 ? String(kNum) : String.raw`\frac{${kNum}}{${kDen}}`;
    const n = rng.int(1, input.difficulty === 'easy' ? 2 : 3);
    const p = rng.int(1, 4);

    const squareFirst = input.difficulty !== 'easy' && rng.next() < 0.5;

    // Choose m so that the second stationary x-value becomes a nice rational.
    // For square-first: ensure (m - 2np) divisible by 3n.
    // For square-second: ensure (2m - np) divisible by 3n.
    const targetMultiple = rng.int(-2, 3); // can be negative too
    const m = (() => {
      if (squareFirst) {
        const A = 3 * n * targetMultiple; // A = m - 2np
        return A + 2 * n * p;
      }
      const A = 3 * n * targetMultiple; // A = 2m - np
      return Math.floor((A + n * p) / 2);
    })();

    // Ensure m isn't too small / weird; adjust if needed while preserving divisibility.
    const mSafe = (() => {
      let mm = m;
      if (mm === 0) mm = n; // avoid trivial
      // keep 2m - np divisible by 3n by adding 3n to A => add (3n)/2 to m; do in steps of 3n*2
      // easiest: if mm is 0, shift by 3n so A changes but divisibility preserved.
      if (mm === 0) mm += 3 * n;
      return mm;
    })();

    const x2Num = squareFirst ? (mSafe - 2 * n * p) : (2 * mSafe - n * p);
    const x2Den = 3 * n;
    // Reduce fraction if possible
    const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
    const g = gcd(x2Num, x2Den);
    const rrNum = x2Num / g;
    const rrDen = x2Den / g;
    const x2Latex = rrDen === 1 ? String(rrNum) : (rrNum < 0 ? `-\\frac{${Math.abs(rrNum)}}{${rrDen}}` : `\\frac{${rrNum}}{${rrDen}}`);

    const yLatex = squareFirst
      ? String.raw`y = ${kLatex}\left(${mSafe} - ${n}x\right)^2\left(x + ${p}\right)`
      : String.raw`y = ${kLatex}\left(${mSafe} - ${n}x\right)\left(x + ${p}\right)^2`;

    const u = String.raw`u = \left(${mSafe} - ${n}x\right)`;
    const v = squareFirst
      ? String.raw`v = \left(x + ${p}\right)`
      : String.raw`v = \left(x + ${p}\right)^2`;
    const uPrime = String.raw`u' = \frac{d}{dx}\left(${mSafe} - ${n}x\right) = -${n}`;
    const vPrime = squareFirst
      ? String.raw`v' = \frac{d}{dx}\left(x + ${p}\right) = 1`
      : String.raw`v' = \frac{d}{dx}\left(x + ${p}\right)^2 = 2\left(x + ${p}\right)`;

    const yPrimeUnfactored = squareFirst
      ? String.raw`\frac{dy}{dx} = ${kLatex}\left[(u^2)'v + u^2v'\right] = ${kLatex}\left[2u\,u'\,v + u^2\cdot 1\right]`
      : String.raw`\frac{dy}{dx} = ${kLatex}\left[u'v + uv'\right] = ${kLatex}\left[-${n}\left(x + ${p}\right)^2 + \left(${mSafe} - ${n}x\right)\cdot 2\left(x + ${p}\right)\right]`;

    const yPrimeFactored = squareFirst
      ? String.raw`\frac{dy}{dx} = ${kLatex}\left(${mSafe} - ${n}x\right)\left[ -2${n}\left(x + ${p}\right) + \left(${mSafe} - ${n}x\right)\right]`
      : String.raw`\frac{dy}{dx} = ${kLatex}\left(x + ${p}\right)\left[ -${n}\left(x + ${p}\right) + 2\left(${mSafe} - ${n}x\right)\right]`;

    const bracketSimplified = squareFirst
      ? String.raw`${mSafe} - ${n}x - 2${n}x - 2${n * p} = ${mSafe - 2 * n * p} - ${3 * n}x`
      : String.raw`-${n}x - ${n * p} + 2${mSafe} - 2${n}x = ${2 * mSafe - n * p} - ${3 * n}x`;

    const yPrimeFinal = squareFirst
      ? String.raw`\frac{dy}{dx} = ${kLatex}\left(${mSafe} - ${n}x\right)\left(${mSafe - 2 * n * p} - ${3 * n}x\right)`
      : String.raw`\frac{dy}{dx} = ${kLatex}\left(x + ${p}\right)\left(${2 * mSafe - n * p} - ${3 * n}x\right)`;

    // Second derivative from the factored form.
    const ySecondStart = squareFirst
      ? String.raw`\frac{d^2y}{dx^2} = \frac{d}{dx}\left[ ${kLatex}\left(${mSafe} - ${n}x\right)\left(${mSafe - 2 * n * p} - ${3 * n}x\right) \right]`
      : String.raw`\frac{d^2y}{dx^2} = \frac{d}{dx}\left[ ${kLatex}\left(x + ${p}\right)\left(${2 * mSafe - n * p} - ${3 * n}x\right) \right]`;
    const ySecondUseProd = squareFirst
      ? String.raw`= ${kLatex}\left[ (-${n})\cdot\left(${mSafe - 2 * n * p} - ${3 * n}x\right) + \left(${mSafe} - ${n}x\right)\cdot\left(-${3 * n}\right) \right]`
      : String.raw`= ${kLatex}\left[ 1\cdot\left(${2 * mSafe - n * p} - ${3 * n}x\right) + \left(x + ${p}\right)\cdot\left(-${3 * n}\right) \right]`;
    const ySecondSimplified = squareFirst
      ? String.raw`= ${kLatex}\left[ -${n}(${mSafe - 2 * n * p} - ${3 * n}x) - ${3 * n}(${mSafe} - ${n}x) \right]`
      : String.raw`= ${kLatex}\left[ ${2 * mSafe - n * p} - ${3 * n}x - ${3 * n}x - ${3 * n * p} \right]`;
    const ySecondFinal = squareFirst
      ? String.raw`\frac{d^2y}{dx^2} = ${kLatex}\left(-${4 * n * mSafe - 2 * n * n * p} + ${6 * n * n}x\right)`
      : String.raw`\frac{d^2y}{dx^2} = ${kLatex}\left(${2 * mSafe - 4 * n * p} - ${6 * n}x\right)`;

    const x1Latex = squareFirst
      ? (Number.isFinite(mSafe / n) && mSafe % n === 0 ? String.raw`${mSafe / n}` : String.raw`\frac{${mSafe}}{${n}}`)
      : String.raw`-${p}`;

    const answerListLatex = rrDen === 1
      ? String.raw`${x1Latex},\;${x2Latex}`
      : String.raw`${x1Latex},\;${x2Latex}`;

    const firstRaw = squareFirst ? (mSafe % n === 0 ? String(mSafe / n) : `${mSafe}/${n}`) : String(-p);
    const secondRaw = rrDen === 1 ? String(rrNum) : `${rrNum}/${rrDen}`;
    const expectedRawList = `${firstRaw},${secondRaw}`;
    const expectedNormalized = [
      normalizeStationaryXList(expectedRawList),
      normalizeStationaryXList(`x=${expectedRawList}`),
      // Also allow reversed order.
      normalizeStationaryXList(`${secondRaw},${firstRaw}`),
      normalizeStationaryXList(`x=${secondRaw},${firstRaw}`),
    ].filter(Boolean);

    const explanation: KatexExplanationBlock[] = [
      { kind: 'text' as const, content: 'Stationary points occur where the gradient is zero. For a curve y = f(x), this means f\'(x) = 0. We will find dy/dx first, then (as requested) differentiate again to obtain d²y/dx².' },
      { kind: 'math' as const, content: yLatex, displayMode: true },
      { kind: 'text' as const, content: 'Step 1: Identify a product structure. The constant factor does not change the stationary points, but we keep it throughout for correctness.' },
      { kind: 'math' as const, content: String.raw`y = ${kLatex}\,u\,v`, displayMode: true },
      { kind: 'math' as const, content: u, displayMode: true },
      { kind: 'math' as const, content: v, displayMode: true },
      { kind: 'text' as const, content: 'Step 2: Differentiate u and v. For v we use the power rule + chain rule:' },
      { kind: 'math' as const, content: String.raw`\frac{d}{dx}\left[(x+p)^2\right] = 2(x+p)\cdot\frac{d}{dx}(x+p) = 2(x+p)`, displayMode: true },
      { kind: 'math' as const, content: uPrime, displayMode: true },
      { kind: 'math' as const, content: vPrime, displayMode: true },
      { kind: 'text' as const, content: 'Step 3: Apply the product rule (for uv): (uv)\' = u\'v + uv\'.' },
      { kind: 'math' as const, content: yPrimeUnfactored, displayMode: true },
      { kind: 'text' as const, content: squareFirst ? `Step 4: Factor out the common term (${mSafe} - ${n}x). This makes solving dy/dx = 0 much easier.` : 'Step 4: Factor out the common term (x + p). This makes solving dy/dx = 0 much easier.' },
      { kind: 'math' as const, content: yPrimeFactored, displayMode: true },
      { kind: 'text' as const, content: 'Step 5: Simplify the bracket carefully by collecting like terms.' },
      { kind: 'math' as const, content: squareFirst ? String.raw`-2${n}\left(x + ${p}\right) + \left(${mSafe} - ${n}x\right)` : String.raw`- ${n}\left(x + ${p}\right) + 2\left(${mSafe} - ${n}x\right)`, displayMode: true },
      { kind: 'math' as const, content: String.raw`= ${bracketSimplified}`, displayMode: true },
      { kind: 'math' as const, content: yPrimeFinal, displayMode: true },
      { kind: 'text' as const, content: 'Step 6: Stationary points: set dy/dx = 0. A product is zero when at least one factor is zero.' },
      { kind: 'math' as const, content: squareFirst ? String.raw`${kLatex}\left(${mSafe} - ${n}x\right)\left(${mSafe - 2 * n * p} - ${3 * n}x\right) = 0` : String.raw`${kLatex}\left(x + ${p}\right)\left(${2 * mSafe - n * p} - ${3 * n}x\right) = 0`, displayMode: true },
      { kind: 'text' as const, content: squareFirst ? `First factor: ${mSafe} - ${n}x = 0 gives x = ${firstRaw}.` : `First factor: x + ${p} = 0 gives x = ${-p}.` },
      { kind: 'math' as const, content: String.raw`x = ${x1Latex}`, displayMode: true },
      { kind: 'text' as const, content: 'Second factor: solve the linear equation.' },
      { kind: 'math' as const, content: squareFirst ? String.raw`${mSafe - 2 * n * p} - ${3 * n}x = 0` : String.raw`${2 * mSafe - n * p} - ${3 * n}x = 0`, displayMode: true },
      { kind: 'math' as const, content: squareFirst ? String.raw`${3 * n}x = ${mSafe - 2 * n * p}` : String.raw`${3 * n}x = ${2 * mSafe - n * p}`, displayMode: true },
      { kind: 'math' as const, content: String.raw`x = ${x2Latex}`, displayMode: true },
      { kind: 'text' as const, content: 'So the x-coordinates of the stationary points are:' },
      { kind: 'math' as const, content: String.raw`x = ${answerListLatex}`, displayMode: true },
      { kind: 'text' as const, content: 'Step 7 (double derivation): Differentiate again to find d²y/dx². We start from the simplified factored form of dy/dx because it reduces algebra mistakes.' },
      { kind: 'math' as const, content: ySecondStart, displayMode: true },
      { kind: 'text' as const, content: squareFirst ? 'This is again a product of two brackets. Apply the product rule, noting that constants stay constant.' : 'This is again a product of two brackets. Apply the product rule to (x+p)(A-3nx), noting that A is constant.' },
      { kind: 'math' as const, content: ySecondUseProd, displayMode: true },
      { kind: 'math' as const, content: ySecondSimplified, displayMode: true },
      { kind: 'math' as const, content: ySecondFinal, displayMode: true },
      { kind: 'text' as const, content: 'You can now substitute the stationary-point x-values into the second derivative to classify each point:' },
      { kind: 'math' as const, content: String.raw`\text{positive}\;\rightarrow\;\text{minimum},\qquad\text{negative}\;\rightarrow\;\text{maximum}`, displayMode: true },
      { kind: 'text' as const, content: 'This classification is not required here, but the second derivative is shown in full as requested.' },
      { kind: 'text' as const, content: 'Common errors to avoid:' },
      { kind: 'text' as const, content: '1) Forgetting the chain rule when differentiating:' },
      { kind: 'math' as const, content: String.raw`(x+p)^2`, displayMode: true },
      { kind: 'text' as const, content: '2) Missing a negative sign from d/dx(m - nx) = -n.' },
      { kind: 'text' as const, content: '3) When solving dy/dx = 0, forgetting that each factor can be zero.' },
      { kind: 'text' as const, content: '4) In the second derivative, differentiating a constant term as if it contained x.' },
    ];

    return {
      kind: 'calculus',
      topicId: 'differentiation',
      variantId: 'stationary_points',
      id: stableId('diff2', input.seed, `${kNum}-${kDen}-${mSafe}-${n}-${p}`),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion: String.raw`\textbf{Find the x-coordinates of the stationary points on the curve }\; ${yLatex}.`,
      katexExplanation: explanation,
      expectedNormalized,
      expectedLatex: expectedRawList,
      expectedParts: [firstRaw, secondRaw],
      normalize: normalizeStationaryXList,
    };
  }

  const maxPow = input.difficulty === 'easy' ? 5 : input.difficulty === 'medium' ? 6 : 7;
  const termCount = input.difficulty === 'easy' ? 2 : input.difficulty === 'medium' ? 3 : 3;

  const rawTerms: Term[] = [];
  for (let i = 0; i < termCount; i++) {
    const n = rng.int(0, maxPow);
    const a = rng.int(-7, 7) || 1;
    rawTerms.push({ a, n });
  }

  // ensure at least one non-constant term
  if (rawTerms.every((t) => t.n === 0)) rawTerms[0] = { ...rawTerms[0], n: 2 };

  const terms = simplifyTermList(rawTerms);
  const fLatex = joinSignedLatex(terms.map(termLatex));
  const dLatex = derivativeLatex(terms);
  const stepPairs = derivativeStepsLatex(terms);

  const expectedNormalized = [normalizeExprForCompare(dLatex)];

  const explanation: KatexExplanationBlock[] = [
    {
      kind: 'text' as const,
      content:
        'We differentiate a polynomial term-by-term. This works because differentiation is linear: the derivative of a sum is the sum of the derivatives.',
    },
    { kind: 'math' as const, content: String.raw`y = ${fLatex}`, displayMode: true },
    { kind: 'text' as const, content: 'Power rule (and constant rule):' },
    {
      kind: 'math' as const,
      content: String.raw`\frac{d}{dx}\left(ax^n\right)=anx^{n-1}\quad\text{and}\quad\frac{d}{dx}(c)=0`,
      displayMode: true,
    },
    { kind: 'text' as const, content: 'Now apply the rule to each term, showing the coefficient and exponent clearly.' },
  ];

  for (const t of terms) {
    const original = termLatex(t);
    explanation.push({ kind: 'text' as const, content: `Consider the term with coefficient ${t.a} and power ${t.n}:` });
    explanation.push({ kind: 'math' as const, content: String.raw`${original}`, displayMode: true });

    if (t.n === 0) {
      explanation.push({ kind: 'text' as const, content: 'This is a constant term. The derivative of any constant is 0.' });
      explanation.push({ kind: 'math' as const, content: String.raw`\frac{d}{dx}\left(${original}\right)=0`, displayMode: true });
      continue;
    }

    const a2 = t.a * t.n;
    const n2 = t.n - 1;
    explanation.push({
      kind: 'text' as const,
      content: `Multiply the coefficient by the exponent: ${t.a}\times ${t.n} = ${a2}. Then reduce the exponent by 1: ${t.n} - 1 = ${n2}.`,
    });
    explanation.push({
      kind: 'math' as const,
      content: String.raw`\frac{d}{dx}\left(${original}\right) = ${a2}x^{${n2}}`,
      displayMode: true,
    });
    if (n2 === 1) {
      explanation.push({ kind: 'text' as const, content: 'Since the new exponent is 1, we write x to the power 1 simply as x.' });
      explanation.push({
        kind: 'math' as const,
        content: String.raw`= ${a2 === 1 ? 'x' : a2 === -1 ? '-x' : `${a2}x`}`,
        displayMode: true,
      });
    }
    if (n2 === 0) {
      explanation.push({ kind: 'text' as const, content: 'Since the new exponent is 0, x to the power 0 equals 1, so the term becomes a constant.' });
      explanation.push({ kind: 'math' as const, content: String.raw`= ${a2}`, displayMode: true });
    }
  }

  explanation.push({ kind: 'text' as const, content: 'Now combine the derivative terms to form the final simplified derivative:' });
  explanation.push({ kind: 'math' as const, content: String.raw`\frac{dy}{dx} = ${dLatex}`, displayMode: true });

  explanation.push({ kind: 'text' as const, content: 'Common errors:' });
  explanation.push({
    kind: 'text' as const,
    content: '1) Forgetting to multiply by the power (e.g. differentiating x^5 as x^4 instead of 5x^4).',
  });
  explanation.push({ kind: 'text' as const, content: '2) Subtracting 1 from the coefficient instead of from the exponent.' });
  explanation.push({ kind: 'text' as const, content: '3) Dropping negative signs when differentiating a negative term.' });

  return {
    kind: 'calculus',
    topicId: 'differentiation',
    variantId: 'basic_polynomial',
    id: stableId('diff', input.seed, `${termCount}-${maxPow}`),
    seed: input.seed,
    difficulty: input.difficulty,
    katexQuestion: String.raw`\textbf{Differentiate: }\; y = ${fLatex}.\;\textbf{Find }\;\frac{dy}{dx}.`,
    katexExplanation: explanation,
    expectedNormalized,
    expectedLatex: dLatex,
    normalize: normalizeExprForCompare,
  };
}
