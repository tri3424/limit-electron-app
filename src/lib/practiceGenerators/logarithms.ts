import { Fraction, fractionToLatex, normalizeFraction } from '@/lib/fraction';
import type { KatexExplanationBlock, PracticeDifficulty } from '@/lib/practiceEngine';

type Rng = {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(arr: T[]) => T;
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
    const a = Math.min(min, max);
    const b = Math.max(min, max);
    return a + Math.floor(next() * (b - a + 1));
  };
  const pick = <T,>(arr: T[]) => arr[Math.floor(next() * arr.length)]!;
  return { next, int, pick };
}

export type LogarithmsVariantId =
  | 'exp_to_log'
  | 'exp_to_log_const'
  | 'exp_to_log_two_vars'
  | 'exp_to_log_ab_c'
  | 'single_log_sum'
  | 'single_log_diff'
  | 'single_log_power'
  | 'single_log_coeff_sum'
  | 'single_log_coeff_diff'
  | 'single_log_const_plus'
  | 'single_log_const_minus'
  | 'single_log_then_simplify'
  | 'solve_log_equation'
  | 'solve_nested_log'
  | 'exp_inequality_log10'
  | 'solve_exp_sub_u_ax'
  | 'evaluate_ln_3sf'
  | 'solve_ln_3sf'
  | 'solve_abs_exp_unique'
  | 'evaluate_e_3sf'
  | 'solve_exp_ln_exact'
  | 'exp_inequality_ln'
  | 'log_to_exp_basic'
  | 'log_to_exp_frac'
  | 'log_to_exp_zero'
  | 'log_to_exp_var_rhs'
  | 'solve_log_basic'
  | 'solve_log_linear'
  | 'solve_log_zero'
  | 'evaluate_decimal'
  | 'evaluate_root'
  | 'simplify_log_power'
  | 'solve_exp_3sf'
  | 'log_to_exp'
  | 'evaluate_integer'
  | 'evaluate_fraction';

export type LogarithmsAnswerKind = 'integer' | 'rational' | 'decimal_3sf' | 'decimal_4sf' | 'text';

export type LogarithmsQuestion = {
  kind: 'logarithms';
  topicId: 'logarithms';
  variantId: LogarithmsVariantId;
  answerKind: LogarithmsAnswerKind;
  id: string;
  seed: number;
  difficulty: PracticeDifficulty;
  promptBlocks?: Array<{ kind: 'text' | 'math'; content: string }>;
  katexQuestion: string;
  katexExplanation: KatexExplanationBlock[];
  // Numeric answer shapes
  expectedNumber?: number;
  expectedFraction?: Fraction;
  // Text/structured answer shapes
  expectedParts?: string[];
  expectedLatex?: string;
};

function to3sf(x: number): number {
  if (!Number.isFinite(x)) return x;
  const ax = Math.abs(x);
  if (ax === 0) return 0;
  const p = Math.floor(Math.log10(ax));
  const scale = Math.pow(10, 2 - p);
  return Math.round(x * scale) / scale;
}

function to4sf(x: number): number {
  if (!Number.isFinite(x)) return x;
  const ax = Math.abs(x);
  if (ax === 0) return 0;
  const p = Math.floor(Math.log10(ax));
  const scale = Math.pow(10, 3 - p);
  return Math.round(x * scale) / scale;
}

function to4sfString(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  return x.toPrecision(4);
}

function nonOneBase(rng: Rng): number {
  const candidates = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  return rng.pick(candidates);
}

function pickReasonablePowInput(input: { base: number; difficulty: PracticeDifficulty; rng: Rng }) {
  const { base, difficulty, rng } = input;
  const maxArg = difficulty === 'easy' ? 400 : difficulty === 'medium' ? 5000 : 20000;

  const expCandidates: number[] = [];
  const minExp = difficulty === 'easy' ? 0 : -4;
  const maxExp = difficulty === 'easy' ? 4 : difficulty === 'medium' ? 6 : 8;
  for (let e = minExp; e <= maxExp; e++) {
    const arg = e >= 0 ? Math.pow(base, e) : 1 / Math.pow(base, -e);
    if (Number.isFinite(arg) && arg <= maxArg) expCandidates.push(e);
  }
  const exp = rng.pick(expCandidates.length ? expCandidates : [0, 1, 2, 3]);
  const argLatex = exp >= 0
    ? String.raw`${Math.pow(base, exp)}`
    : String.raw`\frac{1}{${Math.pow(base, -exp)}}`;
  return { exp, argLatex };
}

function buildId(seed: number, variantId: string) {
  return `logarithms:${variantId}:${seed}`;
}

export function generateLogarithmsQuestion(input: {
  seed: number;
  difficulty: PracticeDifficulty;
  variantWeights?: Record<string, number>;
  answerKindByVariant?: Partial<Record<LogarithmsVariantId, LogarithmsAnswerKind>>;
}): LogarithmsQuestion {
  const rng = mulberry32((input.seed ^ 0x7f4a7c15) >>> 0);

  const variant = (() => {
    const w = input.variantWeights ?? {};
    const w1 = typeof w.exp_to_log === 'number' ? Math.max(0, w.exp_to_log) : 25;
    const w1b = typeof w.exp_to_log_const === 'number' ? Math.max(0, w.exp_to_log_const) : 15;
    const w1c = typeof w.exp_to_log_two_vars === 'number' ? Math.max(0, w.exp_to_log_two_vars) : 12;
    const w1d = typeof w.exp_to_log_ab_c === 'number' ? Math.max(0, w.exp_to_log_ab_c) : 8;
    const w6a = typeof w.single_log_sum === 'number' ? Math.max(0, w.single_log_sum) : 14;
    const w6b = typeof w.single_log_diff === 'number' ? Math.max(0, w.single_log_diff) : 14;
    const w6c = typeof w.single_log_power === 'number' ? Math.max(0, w.single_log_power) : 12;
    const w6d = typeof w.single_log_coeff_sum === 'number' ? Math.max(0, w.single_log_coeff_sum) : 10;
    const w6e = typeof w.single_log_coeff_diff === 'number' ? Math.max(0, w.single_log_coeff_diff) : 10;
    const w6f = typeof w.single_log_const_plus === 'number' ? Math.max(0, w.single_log_const_plus) : 8;
    const w6g = typeof w.single_log_const_minus === 'number' ? Math.max(0, w.single_log_const_minus) : 8;
    const w6h = typeof w.single_log_then_simplify === 'number' ? Math.max(0, w.single_log_then_simplify) : 10;
    const wSolveEq = typeof w.solve_log_equation === 'number' ? Math.max(0, w.solve_log_equation) : 12;
    const w7 = typeof w.solve_nested_log === 'number' ? Math.max(0, w.solve_nested_log) : 10;
    const wSub = typeof w.solve_exp_sub_u_ax === 'number' ? Math.max(0, w.solve_exp_sub_u_ax) : 10;
    const wLnEval = typeof w.evaluate_ln_3sf === 'number' ? Math.max(0, w.evaluate_ln_3sf) : 10;
    const wLnSolve = typeof w.solve_ln_3sf === 'number' ? Math.max(0, w.solve_ln_3sf) : 10;
    const wAbs = typeof w.solve_abs_exp_unique === 'number' ? Math.max(0, w.solve_abs_exp_unique) : 10;
    const wEEval = typeof w.evaluate_e_3sf === 'number' ? Math.max(0, w.evaluate_e_3sf) : 10;
    const wESolve = typeof w.solve_exp_ln_exact === 'number' ? Math.max(0, w.solve_exp_ln_exact) : 10;
    const wELneq = typeof w.exp_inequality_ln === 'number' ? Math.max(0, w.exp_inequality_ln) : 10;
    const w8a = typeof w.log_to_exp_basic === 'number' ? Math.max(0, w.log_to_exp_basic) : 16;
    const w8b = typeof w.log_to_exp_frac === 'number' ? Math.max(0, w.log_to_exp_frac) : 10;
    const w8c = typeof w.log_to_exp_zero === 'number' ? Math.max(0, w.log_to_exp_zero) : 8;
    const w8d = typeof w.log_to_exp_var_rhs === 'number' ? Math.max(0, w.log_to_exp_var_rhs) : 8;
    const w9a = typeof w.solve_log_basic === 'number' ? Math.max(0, w.solve_log_basic) : 16;
    const w9b = typeof w.solve_log_linear === 'number' ? Math.max(0, w.solve_log_linear) : 14;
    const w9c = typeof w.solve_log_zero === 'number' ? Math.max(0, w.solve_log_zero) : 10;
    const w10a = typeof w.evaluate_decimal === 'number' ? Math.max(0, w.evaluate_decimal) : 10;
    const w10b = typeof w.evaluate_root === 'number' ? Math.max(0, w.evaluate_root) : 10;
    const w11 = typeof w.simplify_log_power === 'number' ? Math.max(0, w.simplify_log_power) : 14;
    const w2 = typeof w.solve_exp_3sf === 'number' ? Math.max(0, w.solve_exp_3sf) : 20;
    const wIneq = typeof w.exp_inequality_log10 === 'number' ? Math.max(0, w.exp_inequality_log10) : 10;
    const w3 = typeof w.log_to_exp === 'number' ? Math.max(0, w.log_to_exp) : 20;
    const w4 = typeof w.evaluate_integer === 'number' ? Math.max(0, w.evaluate_integer) : 25;
    const w5 = typeof w.evaluate_fraction === 'number' ? Math.max(0, w.evaluate_fraction) : 10;
    const total = w1 + w1b + w1c + w1d + w6a + w6b + w6c + w6d + w6e + w6f + w6g + w6h + wSolveEq + w7 + wSub + wLnEval + wLnSolve + wAbs + wEEval + wESolve + wELneq + w8a + w8b + w8c + w8d + w9a + w9b + w9c + w10a + w10b + w11 + w2 + wIneq + w3 + w4 + w5;
    const pick = total <= 0 ? 0 : rng.next() * total;
    if (pick < w1) return 'exp_to_log' as const;
    if (pick < w1 + w1b) return 'exp_to_log_const' as const;
    if (pick < w1 + w1b + w1c) return 'exp_to_log_two_vars' as const;
    if (pick < w1 + w1b + w1c + w1d) return 'exp_to_log_ab_c' as const;
    const o1 = w1 + w1b + w1c + w1d;
    const o2 = o1 + w6a;
    const o3 = o2 + w6b;
    const o4 = o3 + w6c;
    const o4b = o4 + w6d;
    const o4c = o4b + w6e;
    const o4d = o4c + w6f;
    const o4e = o4d + w6g;
    const o4f = o4e + w6h;
    const o4g = o4f + wSolveEq;
    const o5 = o4g + w7;
    const o5b = o5 + wSub;
    const o5c = o5b + wLnEval;
    const o5d = o5c + wLnSolve;
    const o5e = o5d + wAbs;
    const o5f = o5e + wEEval;
    const o5g = o5f + wESolve;
    const o5h = o5g + wELneq;
    const o6 = o5h;
    const o7 = o6 + w8a;
    const o8 = o7 + w8b;
    const o9 = o8 + w8c;
    const o10 = o9 + w8d;
    const o11 = o10 + w9a;
    const o12 = o11 + w9b;
    const o13 = o12 + w9c;
    const o14 = o13 + w10a;
    const o15 = o14 + w10b;
    const o16 = o15 + w11;
    const o17 = o16 + w2;
    const o18 = o17 + wIneq;
    const o19 = o18 + w3;
    const o20 = o19 + w4;
    if (pick < o2) return 'single_log_sum' as const;
    if (pick < o3) return 'single_log_diff' as const;
    if (pick < o4) return 'single_log_power' as const;
    if (pick < o4b) return 'single_log_coeff_sum' as const;
    if (pick < o4c) return 'single_log_coeff_diff' as const;
    if (pick < o4d) return 'single_log_const_plus' as const;
    if (pick < o4e) return 'single_log_const_minus' as const;
    if (pick < o4f) return 'single_log_then_simplify' as const;
    if (pick < o4g) return 'solve_log_equation' as const;
    if (pick < o5) return 'solve_nested_log' as const;
    if (pick < o5b) return 'solve_exp_sub_u_ax' as const;
    if (pick < o5c) return 'evaluate_ln_3sf' as const;
    if (pick < o5d) return 'solve_ln_3sf' as const;
    if (pick < o5e) return 'solve_abs_exp_unique' as const;
    if (pick < o5f) return 'evaluate_e_3sf' as const;
    if (pick < o5g) return 'solve_exp_ln_exact' as const;
    if (pick < o5h) return 'exp_inequality_ln' as const;
    if (pick < o7) return 'log_to_exp_basic' as const;
    if (pick < o8) return 'log_to_exp_frac' as const;
    if (pick < o9) return 'log_to_exp_zero' as const;
    if (pick < o10) return 'log_to_exp_var_rhs' as const;
    if (pick < o11) return 'solve_log_basic' as const;
    if (pick < o12) return 'solve_log_linear' as const;
    if (pick < o13) return 'solve_log_zero' as const;
    if (pick < o14) return 'evaluate_decimal' as const;
    if (pick < o15) return 'evaluate_root' as const;
    if (pick < o16) return 'simplify_log_power' as const;
    if (pick < o17) return 'solve_exp_3sf' as const;
    if (pick < o18) return 'exp_inequality_log10' as const;
    if (pick < o19) return 'log_to_exp' as const;
    if (pick < o20) return 'evaluate_integer' as const;
    return 'evaluate_fraction' as const;
  })();

  const answerKind = ((): LogarithmsAnswerKind => {
    const override = input.answerKindByVariant?.[variant];
    if (override) return override;
    if (variant === 'solve_exp_3sf') return 'decimal_4sf';
    if (variant === 'evaluate_ln_3sf' || variant === 'solve_ln_3sf') return 'decimal_4sf';
    if (variant === 'solve_abs_exp_unique') return 'integer';
    if (variant === 'evaluate_e_3sf') return 'decimal_4sf';
    if (variant === 'solve_exp_ln_exact') return 'text';
    if (variant === 'exp_inequality_ln') return 'decimal_4sf';
    if (variant === 'exp_to_log' || variant === 'exp_to_log_const' || variant === 'exp_to_log_two_vars' || variant === 'exp_to_log_ab_c') return 'text';
    if (variant === 'single_log_sum' || variant === 'single_log_diff' || variant === 'single_log_power') return 'text';
    if (variant === 'single_log_coeff_sum' || variant === 'single_log_coeff_diff' || variant === 'single_log_const_plus' || variant === 'single_log_const_minus') return 'text';
    if (variant === 'solve_log_equation' || variant === 'solve_nested_log') return 'text';
    if (variant === 'exp_inequality_log10') return 'text';
    if (variant === 'log_to_exp_basic' || variant === 'log_to_exp_frac' || variant === 'log_to_exp_zero' || variant === 'log_to_exp_var_rhs') return 'text';
    if (variant === 'simplify_log_power') return 'text';
    if (variant === 'solve_log_basic' || variant === 'solve_log_linear' || variant === 'solve_log_zero') return 'integer';
    if (variant === 'evaluate_decimal' || variant === 'evaluate_root') return 'integer';
    if (variant === 'evaluate_fraction') return 'integer';
    return 'integer';
  })();

  const pickLogBase = () => {
    if (input.difficulty === 'easy') return rng.pick([2, 3, 4, 5, 10]);
    if (input.difficulty === 'medium') return rng.pick([2, 3, 4, 5, 6, 8, 9, 10]);
    return rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  };

  if (variant === 'solve_exp_3sf') {
    const base = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Choose a non-integer solution so a calculator is actually needed.
    const x = (() => {
      const raw = input.difficulty === 'easy'
        ? (rng.int(12, 28) / 10)
        : input.difficulty === 'medium'
          ? (rng.int(14, 42) / 10)
          : (rng.int(16, 60) / 10);
      return Number(raw.toFixed(2));
    })();
    // Display RHS rounded to 4 s.f. to avoid long decimals in the prompt.
    const bShown = to4sf(Math.pow(base, x));
    // Solve based on the displayed value so the equation is consistent.
    const xFromShown = Math.log(bShown) / Math.log(base);
    const expected = to4sf(xFromShown);
    const expectedStr = to4sfString(expected);

    const katexQuestion = String.raw`\text{Usage of calculator is allowed. Solve and give }x\text{ correct to 4 significant figures: }\;${base}^{x}=${bShown}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Take logs of both sides.' },
      { kind: 'math', content: String.raw`${base}^{x}=${bShown}`, displayMode: true },
      { kind: 'math', content: String.raw`x\log_{10}(${base})=\log_{10}(${bShown})`, displayMode: true },
      { kind: 'math', content: String.raw`x=\frac{\log_{10}(${bShown})}{\log_{10}(${base})}`, displayMode: true },
      { kind: 'text', content: `So x \approx ${expectedStr} (4 s.f.).` },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'solve_exp_3sf',
      answerKind: 'decimal_4sf',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: expected,
      expectedLatex: String.raw`${expectedStr}`,
    };
  }

  if (variant === 'evaluate_e_3sf') {
    const exp = input.difficulty === 'easy'
      ? rng.pick([0.8, 1, 1.2, 1.5, 2])
      : input.difficulty === 'medium'
        ? rng.pick([0.6, 0.8, 1.3, 1.7, 2.2, 2.7])
        : rng.pick([0.4, 0.7, 1.1, 1.8, 2.5, 3.1]);
    const value = to4sf(Math.exp(exp));
    const valueStr = to4sfString(value);
    const katexQuestion = String.raw`\text{Usage of calculator is allowed. Evaluate correct to 4 significant figures: }\;e^{${exp}}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Use a calculator to evaluate and round to 4 significant figures.' },
      { kind: 'math', content: String.raw`e^{${exp}}\approx ${valueStr}`, displayMode: true },
    ];
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'evaluate_e_3sf',
      answerKind: 'decimal_4sf',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: value,
      expectedLatex: String.raw`${valueStr}`,
    };
  }

  if (variant === 'solve_exp_ln_exact') {
    const a = rng.pick([1, 2, 3]);
    const b = rng.pick([-3, -2, -1, 0, 1, 2, 3]);
    const c = rng.pick([2, 3, 5, 7, 10, 12, 15, 20]);
    const katexQuestion = String.raw`\text{Usage of calculator is not allowed. Solve, giving your answer in terms of natural logarithms: }\;e^{${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}}=${c}`;
    const expectedLatex = b === 0
      ? String.raw`x=\frac{\ln(${c})}{${a}}`
      : String.raw`x=\frac{\ln(${c}) ${b >= 0 ? '-' : '+'} ${Math.abs(b)}}{${a}}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Take natural logs of both sides.' },
      { kind: 'math', content: String.raw`e^{${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}}=${c}`, displayMode: true },
      { kind: 'math', content: String.raw`\ln\left(e^{${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}}\right)=\ln(${c})`, displayMode: true },
      { kind: 'math', content: String.raw`${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}=\ln(${c})`, displayMode: true },
      { kind: 'math', content: expectedLatex, displayMode: true },
    ];
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'solve_exp_ln_exact',
      answerKind: 'text',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedLatex,
    };
  }

  if (variant === 'exp_inequality_ln') {
    const a = rng.pick([1, 2, 3]);
    const b = rng.pick([-3, -2, -1, 0, 1, 2, 3]);
    const c = rng.pick([2, 3, 5, 7, 10, 12, 15, 20]);
    const sense = rng.pick(['<', '>', '\\le', '\\ge'] as const);
    const bound = (Math.log(c) - b) / a;
    const expected = to4sf(bound);
    const expectedStr = to4sfString(expected);

    const ineq = String.raw`e^{${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}}\;${sense}\;${c}`;
    const katexQuestion = String.raw`\text{Usage of calculator is allowed. Solve and give the critical value of }x\text{ correct to 4 significant figures: }\;${ineq}`;
    const rhs = b === 0
      ? String.raw`\frac{\ln(${c})}{${a}}`
      : String.raw`\frac{\ln(${c}) ${b >= 0 ? '-' : '+'} ${Math.abs(b)}}{${a}}`;
    const expectedLatex = sense === '<'
      ? String.raw`x < ${rhs}`
      : sense === '>'
        ? String.raw`x > ${rhs}`
        : sense === '\\le'
          ? String.raw`x \\le ${rhs}`
          : String.raw`x \\ge ${rhs}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Because e^t is increasing, taking ln keeps the inequality direction the same.' },
      { kind: 'math', content: String.raw`e^{${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}}\;${sense}\;${c}`, displayMode: true },
      { kind: 'math', content: String.raw`${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}\;${sense}\;\ln(${c})`, displayMode: true },
      { kind: 'math', content: expectedLatex, displayMode: true },
      { kind: 'text', content: `So the critical value is x \u2248 ${expectedStr} (4 s.f.).` },
    ];
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'exp_inequality_ln',
      answerKind: 'decimal_4sf',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      promptBlocks: [
        { kind: 'text', content: 'Usage of calculator is allowed. Solve and give the critical value of x correct to 4 significant figures: ' },
        { kind: 'math', content: ineq },
      ],
      katexQuestion,
      katexExplanation,
      expectedLatex,
      expectedNumber: expected,
    };
  }

  if (variant === 'exp_inequality_log10') {
    const base = rng.pick([2, 3, 5, 10]);
    const k = base === 10 ? rng.pick([3, 5, 7, 12, 25, 30]) : rng.pick([3, 5, 7, 12, 20, 35]);
    const sense = rng.pick(['<', '>', '\\le', '\\ge'] as const);

    const katexQuestion = String.raw`\text{Usage of calculator is allowed. Solve for }x\text{ in terms of base-10 logarithms: }\;${base}^{x}\;${sense}\;${k}`;
    const rhs = String.raw`\frac{\log_{10}(${k})}{\log_{10}(${base})}`;
    const expectedLatex = sense === '<'
      ? String.raw`x < ${rhs}`
      : sense === '>'
        ? String.raw`x > ${rhs}`
        : sense === '\\le'
          ? String.raw`x \le ${rhs}`
          : String.raw`x \ge ${rhs}`;

    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Take base-10 logs of both sides.' },
      { kind: 'math', content: String.raw`${base}^{x}\;${sense}\;${k}`, displayMode: true },
      { kind: 'math', content: String.raw`\log_{10}(${base}^{x})\;${sense}\;\log_{10}(${k})`, displayMode: true },
      { kind: 'math', content: String.raw`x\log_{10}(${base})\;${sense}\;\log_{10}(${k})`, displayMode: true },
      { kind: 'text', content: 'Now divide by \log_{10}(' + String(base) + ') (it is positive because the base is > 1).' },
      { kind: 'math', content: expectedLatex, displayMode: true },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'exp_inequality_log10',
      answerKind: 'text',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedLatex,
    };
  }

  if (variant === 'solve_exp_sub_u_ax') {
    // Single-answer substitution-style equation using a repeated root in u=a^x.
    const base = rng.pick([2, 3, 5, 10]);
    const sym = rng.pick(['u', 'v', 'w', 't']);
    const k = input.difficulty === 'easy' ? rng.pick([0, 1, 2, 3]) : rng.pick([0, 1, 2, 3, 4]);
    const u1 = Math.pow(base, k);

    const katexQuestion = String.raw`\text{Usage of calculator is not allowed.}\\[0.7em]\text{Use }${sym}=${base}^{x}\text{ to solve:}\\[0.7em]${base}^{2x}\; -\; ${2 * u1}\cdot ${base}^{x}\; +\; ${u1 * u1}\;=\;0`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: `Choose the substitution ${sym} = ${base}^x so the equation becomes a quadratic in ${sym}.` },
      { kind: 'math', content: String.raw`${sym}=${base}^{x}\quad\Rightarrow\quad ${base}^{2x}=(${base}^{x})^{2}=${sym}^{2}`, displayMode: true },
      { kind: 'text', content: `Rewrite every term in terms of ${sym}.` },
      { kind: 'math', content: String.raw`${base}^{2x} - ${2 * u1}\cdot ${base}^{x} + ${u1 * u1} = 0\quad\Rightarrow\quad ${sym}^{2} - ${2 * u1}${sym} + ${u1 * u1} = 0`, displayMode: true },
      { kind: 'text', content: 'Factorise or complete the square to solve the quadratic.' },
      { kind: 'math', content: String.raw`${sym}^{2} - ${2 * u1}${sym} + ${u1 * u1} = (${sym}-${u1})^{2}`, displayMode: true },
      { kind: 'text', content: 'Set the square equal to zero.' },
      { kind: 'math', content: String.raw`(${sym}-${u1})^{2}=0\quad\Rightarrow\quad ${sym}=${u1}`, displayMode: true },
      { kind: 'text', content: `Substitute back ${sym}=${base}^{x}.` },
      { kind: 'math', content: String.raw`${base}^{x}=${u1}`, displayMode: true },
      { kind: 'text', content: 'Write the right-hand side as a power of the same base.' },
      { kind: 'math', content: String.raw`${u1}=${base}^{${k}}`, displayMode: true },
      { kind: 'text', content: 'Equate exponents.' },
      { kind: 'math', content: String.raw`${base}^{x}=${base}^{${k}}\quad\Rightarrow\quad x=${k}`, displayMode: true },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'solve_exp_sub_u_ax',
      answerKind: 'integer',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: k,
      expectedLatex: String.raw`${k}`,
    };
  }

  if (variant === 'evaluate_ln_3sf') {
    const arg = rng.pick([0.15, 0.2, 0.3, 0.6, 0.9, 1.4, 3]);
    const value = to4sf(Math.log(arg));
    const valueStr = to4sfString(value);
    const katexQuestion = String.raw`\text{Usage of calculator is allowed. Evaluate correct to 4 significant figures: }\;\ln(${arg})`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Use a calculator to evaluate the natural log and round to 4 significant figures.' },
      { kind: 'math', content: String.raw`\ln(${arg})\approx ${valueStr}`, displayMode: true },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'evaluate_ln_3sf',
      answerKind: 'decimal_4sf',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: value,
      expectedLatex: String.raw`${valueStr}`,
    };
  }

  if (variant === 'solve_ln_3sf') {
    const c = rng.pick([1, 2, 3, 4, 5]);
    const k = input.difficulty === 'easy'
      ? rng.pick([1.2, 1.4, 1.6, 1.8])
      : rng.pick([1.1, 1.3, 1.5, 1.7, 1.9, 2.1]);
    const x = to4sf(Math.exp(k) - c);
    const xStr = to4sfString(x);

    const katexQuestion = String.raw`\text{Usage of calculator is allowed. Solve and give }x\text{ correct to 4 significant figures: }\;\ln(x+${c})=${k}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Exponentiate both sides to undo the natural log.' },
      { kind: 'math', content: String.raw`\ln(x+${c})=${k} \iff x+${c}=e^{${k}}`, displayMode: true },
      { kind: 'math', content: String.raw`x=e^{${k}}-${c}`, displayMode: true },
      { kind: 'text', content: 'Now evaluate with a calculator and round to 4 significant figures.' },
      { kind: 'math', content: String.raw`x\approx ${xStr}`, displayMode: true },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'solve_ln_3sf',
      answerKind: 'decimal_4sf',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: x,
      expectedLatex: String.raw`${xStr}`,
    };
  }

  if (variant === 'solve_abs_exp_unique') {
    // Construct |a^x - A| = A which has only one valid solution (a^x = 2A).
    const base = rng.pick([2, 3, 5]);
    const k = input.difficulty === 'easy' ? rng.pick([1, 2, 3]) : rng.pick([1, 2, 3, 4, 5]);
    const A = Math.pow(base, k);
    const x = k + 1;

    const katexQuestion = String.raw`\text{Usage of calculator is not allowed. Solve: }\;\left|${base}^{x}- ${A}\right| = ${A}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Use the definition of absolute value.' },
      { kind: 'math', content: String.raw`\left|U\right|=A \iff U=A\;\text{or}\;U=-A`, displayMode: true },
      { kind: 'math', content: String.raw`${base}^{x}-${A}=${A}\;\text{or}\;${base}^{x}-${A}=-${A}`, displayMode: true },
      { kind: 'math', content: String.raw`${base}^{x}=2\cdot ${A}\;\text{or}\;${base}^{x}=0`, displayMode: true },
      { kind: 'text', content: 'But ' + String(base) + '^x cannot be 0, so only the first equation is valid.' },
      { kind: 'math', content: String.raw`${base}^{x}=2\cdot ${base}^{${k}}`, displayMode: true },
      { kind: 'math', content: String.raw`${base}^{x}=${base}^{${k+1}}`, displayMode: true },
      { kind: 'math', content: String.raw`x=${x}`, displayMode: true },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'solve_abs_exp_unique',
      answerKind: 'integer',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: x,
      expectedLatex: String.raw`${x}`,
    };
  }

  if (variant === 'solve_log_equation') {
    const base = pickLogBase();
    const p = input.difficulty === 'easy' ? rng.pick([1, 2]) : rng.pick([1, 2, 3]);
    const s = input.difficulty === 'easy' ? rng.pick([1, 2, 3, 4]) : rng.pick([1, 2, 3, 4, 5, 6]);
    const t = -(p + rng.pick([1, 2, 3, 4]));
    const m = s + t + 2 * p;
    const n = p * p - s * t;

    const a = 2;
    const katexQuestion = String.raw`\text{Solve: }\;${a}\log_{${base}}(x+${p})=\log_{${base}}(${m}x+${n})`;

    const eq0 = String.raw`${a}\log_{${base}}(x+${p})=\log_{${base}}(${m}x+${n})`;
    const eq1 = String.raw`\log_{${base}}\left((x+${p})^{${a}}\right)=\log_{${base}}(${m}x+${n})`;
    const eq2 = String.raw`(x+${p})^{${a}}=${m}x+${n}`;
    const eq3 = String.raw`x^{2}+${2 * p}x+${p * p}=${m}x+${n}`;
    const eq4 = String.raw`x^{2}+${2 * p - m}x+${p * p - n}=0`;
    const eq5 = String.raw`(x-${s})(x-${t})=0`;
    const eq6 = String.raw`x=${s}\;\text{or}\;x=${t}`;
    const checkS = String.raw`x=${s}:\;x+${p}=${s + p}>0\;\text{and}\;${m}x+${n}=${m * s + n}>0`;
    const checkT = String.raw`x=${t}:\;x+${p}=${t + p}\le 0\;\text{(not defined)}`;

    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'math_callout', content: eq0, callout: 'Use the power law.', displayMode: true },
      { kind: 'math_callout', content: eq1, callout: 'Use equality of logarithms.', displayMode: true },
      { kind: 'math_callout', content: eq2, callout: 'Now solve the equation.', displayMode: true },
      { kind: 'math_callout', content: eq3, callout: 'Expand brackets.', displayMode: true },
      { kind: 'math', content: eq4, displayMode: true },
      { kind: 'math', content: eq5, displayMode: true },
      { kind: 'math', content: eq6, displayMode: true },
      { kind: 'text', content: 'Check which solutions make the logarithms defined (arguments must be positive).' },
      { kind: 'math', content: checkS, displayMode: true },
      { kind: 'math', content: checkT, displayMode: true },
      { kind: 'text', content: `Hence, the solution is x = ${s}.` },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'solve_log_equation',
      answerKind: 'integer',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: s,
      expectedLatex: String.raw`${s}`,
    };
  }

  if (variant === 'single_log_coeff_sum' || variant === 'single_log_coeff_diff') {
    const base = pickLogBase();
    const k1 = input.difficulty === 'easy' ? rng.pick([2, 3]) : rng.pick([2, 3, 4, 5]);
    const k2 = input.difficulty === 'easy' ? rng.pick([1, 2, 3]) : rng.pick([1, 2, 3, 4]);

    // Pick A and B as powers of the base so the final single-log argument is clean.
    const p1 = input.difficulty === 'hard' ? rng.int(1, 4) : rng.int(1, 3);
    const p2 = input.difficulty === 'hard' ? rng.int(1, 4) : rng.int(1, 3);
    const A = Math.pow(base, p1);
    const B = Math.pow(base, p2);

    const isSum = variant === 'single_log_coeff_sum';
    const op1 = isSum ? '+' : '-';
    const katexQuestion = String.raw`\text{Write as a single logarithm: }\;${k1}\log_{${base}}(${A}) ${op1} ${k2}\log_{${base}}(${B})`;

    const signText = isSum ? 'add' : 'subtract';
    const combineLatex = isSum
      ? String.raw`\log_{${base}}(X) + \log_{${base}}(Y) = \log_{${base}}(XY)`
      : String.raw`\log_{${base}}(X) - \log_{${base}}(Y) = \log_{${base}}\left(\frac{X}{Y}\right)`;

    const inner = isSum
      ? String.raw`${A}^{${k1}}\cdot ${B}^{${k2}}`
      : String.raw`\frac{${A}^{${k1}}}{${B}^{${k2}}}`;

    const expectedLatex = String.raw`\log_{${base}}\left(${inner}\right)`;

    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'This uses two log laws: the power rule and the product/quotient rule.' },
      { kind: 'text', content: 'Step 1 (power rule): move coefficients in front into exponents inside the log.' },
      { kind: 'math', content: String.raw`k\log_{${base}}(M)=\log_{${base}}\left(M^{k}\right)`, displayMode: true },
      { kind: 'math', content: String.raw`${k1}\log_{${base}}(${A})=\log_{${base}}\left(${A}^{${k1}}\right)`, displayMode: true },
      { kind: 'math', content: String.raw`${k2}\log_{${base}}(${B})=\log_{${base}}\left(${B}^{${k2}}\right)`, displayMode: true },
      { kind: 'text', content: `Step 2 (${signText} logs with the same base):` },
      { kind: 'math', content: combineLatex, displayMode: true },
      { kind: 'text', content: 'Apply it to the two logs:' },
      { kind: 'math', content: String.raw`\log_{${base}}\left(${A}^{${k1}}\right) ${op1} \log_{${base}}\left(${B}^{${k2}}\right) = ${expectedLatex}`, displayMode: true },
      { kind: 'text', content: 'So the single logarithm is:' },
      { kind: 'math', content: expectedLatex, displayMode: true },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: variant,
      answerKind: 'text',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedParts: [String(base), String(inner)],
      expectedLatex,
    };
  }

  if (variant === 'single_log_const_plus' || variant === 'single_log_const_minus') {
    const base = pickLogBase();
    // Choose constant as an integer log so it can be rewritten as log_b(b^c)
    const c = input.difficulty === 'easy' ? rng.pick([1, 2, 3]) : rng.pick([1, 2, 3, 4]);
    const k = input.difficulty === 'easy' ? rng.pick([2, 3]) : rng.pick([2, 3, 4, 5]);
    const p = input.difficulty === 'hard' ? rng.int(1, 4) : rng.int(1, 3);
    const M = Math.pow(base, p);

    const isPlus = variant === 'single_log_const_plus';
    const op = isPlus ? '+' : '-';
    const katexQuestion = String.raw`\text{Write as a single logarithm: }\;${c} ${op} ${k}\log_{${base}}(${M})`;

    const constAsLog = String.raw`${c}=\log_{${base}}\left(${base}^{${c}}\right)`;
    const inside = isPlus
      ? String.raw`${base}^{${c}}\cdot ${M}^{${k}}`
      : String.raw`\frac{${base}^{${c}}}{${M}^{${k}}}`;
    const expectedLatex = String.raw`\log_{${base}}\left(${inside}\right)`;

    const combineLatex = isPlus
      ? String.raw`\log_{${base}}(X) + \log_{${base}}(Y) = \log_{${base}}(XY)`
      : String.raw`\log_{${base}}(X) - \log_{${base}}(Y) = \log_{${base}}\left(\frac{X}{Y}\right)`;

    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'This type combines constants with logarithms. The trick is to rewrite the constant as a logarithm.' },
      { kind: 'text', content: 'Step 1: write the constant as a logarithm using the identity shown below.' },
      { kind: 'math', content: constAsLog, displayMode: true },
      { kind: 'text', content: 'Step 2: use the power rule to move the coefficient into an exponent:' },
      { kind: 'math', content: String.raw`k\log_{${base}}(M)=\log_{${base}}\left(M^{k}\right)`, displayMode: true },
      { kind: 'math', content: String.raw`${k}\log_{${base}}(${M})=\log_{${base}}\left(${M}^{${k}}\right)`, displayMode: true },
      { kind: 'text', content: 'Now both terms are logs with the same base, so we can combine them:' },
      { kind: 'math', content: combineLatex, displayMode: true },
      { kind: 'math', content: String.raw`\log_{${base}}\left(${base}^{${c}}\right) ${op} \log_{${base}}\left(${M}^{${k}}\right) = ${expectedLatex}`, displayMode: true },
      { kind: 'text', content: 'So the single logarithm is:' },
      { kind: 'math', content: expectedLatex, displayMode: true },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: variant,
      answerKind: 'text',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedParts: [String(base), String(inside)],
      expectedLatex,
    };
  }

  if (variant === 'single_log_then_simplify') {
    const base = pickLogBase();
    // Generate a quotient/product that simplifies nicely.
    const u = input.difficulty === 'easy' ? rng.int(2, 12) : rng.int(5, 40);
    const v = input.difficulty === 'easy' ? rng.int(2, 12) : rng.int(5, 40);
    const t = rng.pick([2, 3, 4, 5]);

    // Use numbers that share a common factor so (tu)/(tv) simplifies to u/v.
    const A = t * u;
    const B = t * v;

    const isDiff = rng.pick([true, false]);
    const katexQuestion = isDiff
      ? String.raw`\text{Write as a single logarithm, then simplify: }\;\log_{${base}}(${A}) - \log_{${base}}(${B})`
      : String.raw`\text{Write as a single logarithm, then simplify: }\;\log_{${base}}(${A}) + \log_{${base}}(${B})`;

    const combined = isDiff
      ? String.raw`\log_{${base}}\left(\frac{${A}}{${B}}\right)`
      : String.raw`\log_{${base}}(${A}\cdot ${B})`;

    const gcdInt = (x: number, y: number) => {
      let a = Math.abs(x);
      let b = Math.abs(y);
      while (b !== 0) {
        const t0 = a % b;
        a = b;
        b = t0;
      }
      return a || 1;
    };

    const g = isDiff ? gcdInt(u, v) : 1;
    const u2 = isDiff ? Math.floor(u / g) : u;
    const v2 = isDiff ? Math.floor(v / g) : v;

    const simplifiedInside = isDiff
      ? String.raw`\frac{${u2}}{${v2}}`
      : String.raw`${A * B}`;

    const expectedLatex = String.raw`\log_{${base}}\left(${simplifiedInside}\right)`;

    const ruleLatex = isDiff
      ? String.raw`\log_{${base}}(M)-\log_{${base}}(N)=\log_{${base}}\left(\frac{M}{N}\right)`
      : String.raw`\log_{${base}}(M)+\log_{${base}}(N)=\log_{${base}}(MN)`;

    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Step 1: combine into a single logarithm using a log law.' },
      { kind: 'math', content: ruleLatex, displayMode: true },
      { kind: 'math', content: combined, displayMode: true },
      { kind: 'text', content: 'Step 2: simplify the expression inside the log (cancel common factors or multiply).' },
      isDiff
        ? { kind: 'math', content: String.raw`\frac{${A}}{${B}}=\frac{${t}\cdot ${u}}{${t}\cdot ${v}}=\frac{${u}}{${v}}=\frac{${u2}}{${v2}}`, displayMode: true }
        : { kind: 'math', content: String.raw`${A}\cdot ${B} = ${A * B}`, displayMode: true },
      { kind: 'text', content: 'So the final simplified single logarithm is:' },
      { kind: 'math', content: expectedLatex, displayMode: true },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'single_log_then_simplify',
      answerKind: 'text',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedParts: [String(base), String(simplifiedInside)],
      expectedLatex,
    };
  }

  if (variant === 'log_to_exp_basic') {
    const base = input.difficulty === 'easy'
      ? rng.pick([2, 3, 4, 5, 10])
      : input.difficulty === 'medium'
        ? rng.pick([2, 3, 4, 5, 6, 8, 9, 10])
        : rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
    const { exp, argLatex } = pickReasonablePowInput({ base, difficulty: input.difficulty, rng });
    const katexQuestion = String.raw`\text{Convert }\;\log_{${base}}\left(${argLatex}\right) = ${exp}\;\text{to exponential form.}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Goal: rewrite the statement using exponents (powers) instead of logarithms.' },
      { kind: 'text', content: 'Key definition (logs and powers are inverses):' },
      { kind: 'math', content: String.raw`\log_{a}(b)=c \iff a^{c}=b`, displayMode: true },
      { kind: 'text', content: 'Identify what each symbol is playing in this question:' },
      { kind: 'math', content: String.raw`a=${base}\quad(\text{base of the log})`, displayMode: true },
      { kind: 'math', content: String.raw`b=${argLatex}\quad(\text{argument / number inside the log})`, displayMode: true },
      { kind: 'math', content: String.raw`c=${exp}\quad(\text{value of the log / exponent})`, displayMode: true },
      { kind: 'text', content: 'Now apply the definition directly:' },
      { kind: 'math', content: String.raw`\log_{${base}}\left(${argLatex}\right) = ${exp} \iff ${base}^{${exp}} = ${argLatex}`, displayMode: true },
      { kind: 'text', content: 'Quick check: the log says “the power you must raise ' + String(base) + ' to in order to get the inside number is ' + String(exp) + '”.' },
    ];
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'log_to_exp_basic',
      answerKind: 'text',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedParts: [String(base), String(exp), String(argLatex)],
      expectedLatex: String.raw`${base}^{${exp}} = ${argLatex}`,
    };
  }

  if (variant === 'log_to_exp_frac') {
    const frac = rng.pick([{ n: 1, d: 2 }, { n: 1, d: 3 }]);
    // Keep the RHS small and writable: choose bases that produce integer roots.
    const base = frac.d === 2
      ? rng.pick([4, 9, 16, 25, 36])
      : rng.pick([8, 27]);
    const argNum = frac.d === 2 ? Math.sqrt(base) : Math.cbrt(base);
    const argLatex = String(Math.round(argNum));
    const expLatex = String.raw`\frac{${frac.n}}{${frac.d}}`;
    const katexQuestion = String.raw`\text{Convert }\;\log_{${base}}\left(${argLatex}\right) = ${expLatex}\;\text{to exponential form.}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Use the definition shown below.' },
      { kind: 'math', content: String.raw`\log_{a}(b)=c \iff a^{c}=b`, displayMode: true },
      { kind: 'text', content: 'A fractional exponent means a root:' },
      { kind: 'math', content: String.raw`a^{\frac{1}{2}}=\sqrt{a}\quad\text{and}\quad a^{\frac{1}{3}}=\sqrt[3]{a}`, displayMode: true },
      { kind: 'math', content: String.raw`\log_{${base}}\left(${argLatex}\right) = ${expLatex} \iff ${base}^{${expLatex}} = ${argLatex}`, displayMode: true },
    ];
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'log_to_exp_frac',
      answerKind: 'text',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedParts: [String(base), `${frac.n}/${frac.d}`, String(argLatex)],
      expectedLatex: String.raw`${base}^{${expLatex}} = ${argLatex}`,
    };
  }

  if (variant === 'log_to_exp_zero') {
    const base = rng.pick([2, 3, 5, 10]);
    const katexQuestion = String.raw`\text{Convert }\;\log_{${base}}(1) = 0\;\text{to exponential form.}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Use the definition shown below.' },
      { kind: 'math', content: String.raw`\log_{${base}}(1)=0 \iff ${base}^{0}=1`, displayMode: true },
    ];
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'log_to_exp_zero',
      answerKind: 'text',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedParts: [String(base), '0', '1'],
      expectedLatex: String.raw`${base}^{0} = 1`,
    };
  }

  if (variant === 'log_to_exp_var_rhs') {
    const base = rng.pick([2, 3, 5, 10]);
    const arg = rng.pick([2, 3, 5, 7, 11]);
    const y = rng.pick(['x', 'y', 'n', 'k']);
    const katexQuestion = String.raw`\text{Convert }\;\log_{${base}}(${arg}) = ${y}\;\text{to exponential form.}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Use the definition (it still works when the exponent is a variable).' },
      { kind: 'math', content: String.raw`\log_{${base}}(${arg}) = ${y} \iff ${base}^{${y}} = ${arg}`, displayMode: true },
    ];
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'log_to_exp_var_rhs',
      answerKind: 'text',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedParts: [String(base), String(y), String(arg)],
      expectedLatex: String.raw`${base}^{${y}} = ${arg}`,
    };
  }

  if (variant === 'solve_log_basic') {
    const base = rng.pick([2, 3, 4, 5, 10]);
    const k = rng.pick([0, 1, 2, 3, 4]);
    const x = Math.pow(base, k);
    const katexQuestion = String.raw`\text{Solve: }\;\log_{${base}}(x) = ${k}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Undo the log by converting to exponential form.' },
      { kind: 'math', content: String.raw`\log_{${base}}(x)=${k} \iff x=${base}^{${k}}`, displayMode: true },
      { kind: 'math', content: String.raw`x=${x}`, displayMode: true },
    ];
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'solve_log_basic',
      answerKind: 'integer',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: x,
      expectedLatex: String.raw`${x}`,
    };
  }

  if (variant === 'solve_log_linear') {
    const base = rng.pick([2, 3, 5, 10]);
    const m = rng.pick([1, 2, 3, 4, 5]);

    // Construct a guaranteed-valid equation by picking k and x first,
    // then setting c so that mx + c = base^k at the solution.
    const k2 = rng.pick([0, 1, 2, 3]);
    const rhs2 = Math.pow(base, k2);

    let xInt = 1;
    let c = 1;
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidateX = rng.pick([1, 2, 3, 4, 5, 6, 7, 8]);
      const candidateC = rhs2 - m * candidateX;
      // Keep constants readable and avoid 0 so formatting stays clean.
      if (candidateC === 0) continue;
      if (candidateC < -12 || candidateC > 12) continue;
      xInt = candidateX;
      c = candidateC;
      break;
    }

    const katexQuestion = String.raw`\text{Solve: }\;\log_{${base}}\big(${m}x ${c >= 0 ? '+' : '-'} ${Math.abs(c)}\big) = ${k2}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Convert to exponential form, then solve the resulting linear equation.' },
      { kind: 'math', content: String.raw`\log_{${base}}(A)=${k2} \iff A=${base}^{${k2}}`, displayMode: true },
      { kind: 'math', content: String.raw`${m}x ${c >= 0 ? '+' : '-'} ${Math.abs(c)} = ${base}^{${k2}}`, displayMode: true },
      { kind: 'math', content: String.raw`${m}x ${c >= 0 ? '+' : '-'} ${Math.abs(c)} = ${rhs2}`, displayMode: true },
      { kind: 'math', content: String.raw`${m}x = ${rhs2 - c}`, displayMode: true },
      { kind: 'math', content: String.raw`x = ${xInt}`, displayMode: true },
    ];
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'solve_log_linear',
      answerKind: 'integer',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: xInt,
      expectedLatex: String.raw`${xInt}`,
    };
  }

  if (variant === 'solve_log_zero') {
    const base = rng.pick([2, 3, 5, 10]);
    const k = 0;
    // log_base(x)=0 -> x=1
    const katexQuestion = String.raw`\text{Solve: }\;\log_{${base}}(x) = 0`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Convert to exponential form.' },
      { kind: 'math', content: String.raw`${base}^{0} = x`, displayMode: true },
      { kind: 'math', content: String.raw`1 = x`, displayMode: true },
      { kind: 'math', content: String.raw`x = 1`, displayMode: true },
    ];
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'solve_log_zero',
      answerKind: 'integer',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: 1,
      expectedLatex: String.raw`1`,
    };
  }

  if (variant === 'evaluate_decimal') {
    // Example-like: log_2(0.125)= -3 (but randomized)
    const base = 2;
    const exp = rng.pick([-6, -5, -4, -3, -2, -1]);
    const denom = Math.pow(base, -exp);
    const katexQuestion = String.raw`\text{Find the value of: }\;\log_{${base}}\left(\frac{1}{${denom}}\right)`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Rewrite the decimal/fraction as a power of the base, then read off the exponent.' },
      { kind: 'math', content: String.raw`\frac{1}{${denom}} = ${base}^{${exp}}`, displayMode: true },
      { kind: 'math', content: String.raw`\log_{${base}}\left(${base}^{${exp}}\right) = ${exp}`, displayMode: true },
    ];
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'evaluate_decimal',
      answerKind: 'integer',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: exp,
      expectedLatex: String.raw`${exp}`,
    };
  }

  if (variant === 'evaluate_root') {
    // Do NOT generate questions that would require typing sqrt/cuberoot symbols.
    // We only use perfect squares/cubes so the argument is an integer.
    const root = rng.pick([2, 3]);
    const expLatex = root === 2 ? String.raw`\frac{1}{2}` : String.raw`\frac{1}{3}`;
    const base = root === 2
      ? rng.pick([4, 9, 16, 25, 36, 49, 64, 81, 100])
      : rng.pick([8, 27, 64]);
    const argNum = root === 2 ? Math.sqrt(base) : Math.cbrt(base);
    const arg = String(Math.round(argNum));
    const katexQuestion = String.raw`\text{Find the value of: }\;\log_{${base}}(${arg})`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Recognize the argument as a root, which corresponds to a fractional power.' },
      { kind: 'math', content: String.raw`${arg} = ${base}^{${expLatex}}`, displayMode: true },
      { kind: 'math', content: String.raw`\log_{${base}}\left(${base}^{${expLatex}}\right) = ${expLatex}`, displayMode: true },
      { kind: 'text', content: 'This evaluates to a fraction; here we ask for the simplified fractional exponent.' },
    ];
    // Store as text to allow fractional entry; still admin can override.
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'evaluate_root',
      answerKind: 'text',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedLatex: expLatex,
    };
  }

  if (variant === 'simplify_log_power') {
    const baseSym = rng.pick(['x', 'a', 'm']);
    const p = rng.pick([2, 3, 4, 5]);
    const katexQuestion = String.raw`\text{Simplify: }\;\log_{${baseSym}}\left(${baseSym}^{${p}}\right)`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Logs and powers are inverses.' },
      { kind: 'math', content: String.raw`\log_{${baseSym}}\left(${baseSym}^{${p}}\right) = ${p}`, displayMode: true },
    ];
    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'simplify_log_power',
      answerKind: 'integer',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: p,
      expectedLatex: String.raw`${p}`,
    };
  }

  if (variant === 'exp_to_log') {
    const base = rng.pick([2, 3, 5, 10]);
    const xSym = rng.pick(['x', 'y', 'n', 'k', 'a', 'p', 't']);
    const b = (() => {
      // Keep numbers varied but reasonable.
      if (base === 10) return rng.int(12, 98);
      if (base === 2) return rng.int(6, 48);
      if (base === 3) return rng.int(6, 80);
      return rng.int(6, 120);
    })();

    const katexQuestion = String.raw`\text{Convert } ${base}^{${xSym}} = ${b}\text{ to logarithmic form.}`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'Key idea: logarithms are another way of writing exponent questions.' },
      { kind: 'text', content: 'Use the definition shown below.' },
      { kind: 'math', content: String.raw`a^{x}=b \iff \log_{a}(b)=x`, displayMode: true },
      { kind: 'text', content: 'Match the parts from the question:' },
      { kind: 'math', content: String.raw`${base}^{${xSym}} = ${b}`, displayMode: true },
      { kind: 'math', content: String.raw`\log_{${base}}(${b}) = ${xSym}`, displayMode: true },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'exp_to_log',
      answerKind: 'text',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedParts: [String(base), String(b), String(xSym)],
      expectedLatex: String.raw`\log_{${base}}(${b}) = ${xSym}`,
    };
  }

  if (variant === 'evaluate_integer') {
    const base = rng.pick([2, 3, 5, 10]);
    const exponent = rng.pick([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
    const value = (() => {
      if (exponent >= 0) return Math.pow(base, exponent);
      return normalizeFraction({ n: 1, d: Math.pow(base, -exponent) });
    })();

		const argLatex = exponent >= 0
			? String.raw`${Math.pow(base, exponent)}`
			: String.raw`\frac{1}{${Math.pow(base, -exponent)}}`;

    const katexQuestion = exponent >= 0
      ? String.raw`\text{Find the value of: }\;\log_{${base}} ${Math.pow(base, exponent)}`
      : String.raw`\text{Find the value of: }\;\log_{${base}}\left(${fractionToLatex(value as Fraction)}\right)`;

    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'To evaluate a logarithm, rewrite it as an exponent question.' },
      { kind: 'text', content: 'Definition:' },
      { kind: 'math', content: String.raw`\log_{a}(b)=c \iff a^{c}=b`, displayMode: true },
      { kind: 'text', content: 'Here the base is a = ' + String(base) + ' and the argument is the number inside the log.' },
      exponent >= 0
        ? { kind: 'math', content: String.raw`\log_{${base}}(${Math.pow(base, exponent)}) = ?`, displayMode: true }
        : { kind: 'math', content: String.raw`\log_{${base}}\left(\frac{1}{${Math.pow(base, -exponent)}}\right) = ?`, displayMode: true },
      { kind: 'text', content: 'Ask: what power of ' + String(base) + ' gives the argument?' },
      exponent >= 0
        ? { kind: 'math', content: String.raw`${base}^{${exponent}} = ${Math.pow(base, exponent)}`, displayMode: true }
        : { kind: 'math', content: String.raw`${base}^{${exponent}} = \frac{1}{${base}^{${-exponent}}}`, displayMode: true },
      { kind: 'text', content: 'So the answer is the exponent.' },
      { kind: 'math', content: String.raw`\log_{${base}}\left(${argLatex}\right) = ${exponent}`, displayMode: true },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'evaluate_integer',
      answerKind: 'integer',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: exponent,
      expectedLatex: String.raw`${exponent}`,
    };
  }

  // evaluate_fraction: force nice fractional argument with integer result
  {
    // More variety in bases, but keep the fraction readable.
    const base = rng.pick([2, 3, 4, 5, 6, 8, 9, 10]);
    const maxDen = input.difficulty === 'easy' ? 256 : 1024;
    const expCandidates = [-1, -2, -3, -4, -5, -6].filter((e) => Math.pow(base, -e) <= maxDen);
    const exponent = rng.pick(expCandidates.length ? expCandidates : [-1, -2, -3]);
    const frac = normalizeFraction({ n: 1, d: Math.pow(base, -exponent) });

    const katexQuestion = String.raw`\text{Find the value of: }\;\log_{${base}}\left(${fractionToLatex(frac)}\right)`;
    const katexExplanation: KatexExplanationBlock[] = [
      { kind: 'text', content: 'To evaluate a log with a fraction inside, rewrite the fraction as a power of the base.' },
      { kind: 'text', content: 'Start from the fact that negative powers create fractions:' },
      { kind: 'math', content: String.raw`${base}^{-${-exponent}} = \frac{1}{${base}^{${-exponent}}}`, displayMode: true },
      { kind: 'text', content: 'So the fraction can be written as a power of ' + String(base) + ':' },
      { kind: 'math', content: String.raw`\frac{1}{${base}^{${-exponent}}} = ${base}^{${exponent}}`, displayMode: true },
      { kind: 'text', content: 'Now use the inverse relationship between logs and powers:' },
      { kind: 'math', content: String.raw`\log_{${base}}\left(${base}^{${exponent}}\right) = ${exponent}`, displayMode: true },
      { kind: 'text', content: 'So the answer is ' + String(exponent) + '.' },
    ];

    return {
      kind: 'logarithms',
      topicId: 'logarithms',
      variantId: 'evaluate_fraction',
      answerKind: 'integer',
      id: buildId(input.seed, variant),
      seed: input.seed,
      difficulty: input.difficulty,
      katexQuestion,
      katexExplanation,
      expectedNumber: exponent,
      expectedLatex: String.raw`${exponent}`,
      expectedFraction: frac,
    };
  }
}
