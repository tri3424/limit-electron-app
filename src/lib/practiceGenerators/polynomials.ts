import type { PracticeDifficulty } from '@/lib/practiceGenerators/quadraticFactorization';

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

function stableId(prefix: string, seed: number, suffix: string) {
  return `${prefix}-${seed}-${suffix}`;
}

function powInt(base: number, exp: number) {
  let out = 1;
  for (let i = 0; i < exp; i++) out *= base;
  return out;
}

function latexSignedInt(n: number) {
  if (n < 0) return `- ${Math.abs(n)}`;
  return `+ ${n}`;
}

function latexCoeff(n: number) {
  if (n === 1) return '';
  if (n === -1) return '-';
  return String(n);
}

function latexTerm(coeff: string, power: number) {
  if (power === 0) {
    if (!coeff) return '1';
    if (coeff === '-') return '-1';
    return coeff;
  }
  if (power === 1) return `${coeff}x`;
  return `${coeff}x^{${power}}`;
}

function normalizeNumericTerms(terms: Array<{ c: number; p: number }>) {
  const byPow = new Map<number, number>();
  for (const t of terms) {
    byPow.set(t.p, (byPow.get(t.p) ?? 0) + t.c);
  }
  const out: Array<{ c: number; p: number }> = [];
  for (const [p, c] of byPow.entries()) {
    if (c === 0) continue;
    out.push({ c, p });
  }
  out.sort((a, b) => b.p - a.p);
  return out;
}

function joinPolyTerms(terms: Array<{ coeff: string; power: number }>) {
  const out: string[] = [];
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i]!;
    const s = latexTerm(t.coeff, t.power);
    if (!out.length) {
      out.push(s);
      continue;
    }
    if (s.startsWith('-')) out.push(`- ${s.slice(1)}`);
    else out.push(`+ ${s}`);
  }
  return out.join(' ');
}

export type PolynomialsQuestion = {
  kind: 'polynomial';
  topicId: 'polynomials';
  id: string;
  seed: number;
  difficulty: PracticeDifficulty;
  katexQuestion: string;
  promptBlocks?: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string; displayMode?: boolean }>;
  katexExplanation: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string; displayMode?: boolean }>;
  expectedNumber: number;
};

export function generatePolynomialsQuestion(input: { seed: number; difficulty: PracticeDifficulty }): PolynomialsQuestion {
  const rng = mulberry32(input.seed);

  const maxDegree = input.difficulty === 'easy' ? 3 : input.difficulty === 'medium' ? 4 : 5;
  const d = rng.int(3, maxDegree);

  // Choose a rational root r = s/q, where s is +/-1.
  const q = rng.int(1, input.difficulty === 'easy' ? 3 : 4);
  const sgn = rng.next() < 0.5 ? 1 : -1;

  // Factor is (q x - s) so the root is x = s/q.
  const qxLatex = q === 1 ? 'x' : `${q}x`;
  const factorLatex = sgn === 1 ? `${qxLatex} - 1` : `${qxLatex} + 1`;
  const rLatex = sgn === 1 ? String.raw`\frac{1}{${q}}` : String.raw`-\frac{1}{${q}}`;

  // Build a polynomial p(x) = a*(x^d + k1 x^{d-1} + k2 x^{k}) + (fixed polynomial)
  // Then use Factor Theorem: p(r) = 0 to solve for a.
  const k1 = rng.int(-3, 4);
  const k2Pow = rng.int(1, Math.max(1, d - 2));
  const k2 = rng.int(-3, 4);

  const fixedTermCount = input.difficulty === 'easy' ? 2 : 3;
  const fixedTerms: Array<{ c: number; p: number }> = [];
  const reservedPowers = new Set<number>([d, d - 1, k2Pow]);
  while (fixedTerms.length < fixedTermCount) {
    const p = rng.int(0, d - 1);
    const c = rng.int(-9, 9);
    if (c === 0) continue;
    // Avoid creating fixed terms that collide with the symbolic a-terms.
    // Otherwise we'd get unsimplified-looking output like ax^k + 2x^k (same exponent shown twice).
    if (reservedPowers.has(p)) continue;
    fixedTerms.push({ c, p });
  }

  const fixedTermsNormalized = normalizeNumericTerms(fixedTerms);

  // Compute A = (r^d + k1 r^{d-1} + k2 r^{k2Pow}) and B = fixed(r)
  // Work in integers by scaling everything by q^d.
  const qd = powInt(q, d);
  const sPow = (n: number) => (n % 2 === 0 ? 1 : sgn);

  const termScaled = (coeff: number, pow: number) => {
    // coeff * (sgn^pow / q^pow) * q^d = coeff * sgn^pow * q^(d-pow)
    return coeff * sPow(pow) * powInt(q, d - pow);
  };

  const AScaled = termScaled(1, d) + termScaled(k1, d - 1) + termScaled(k2, k2Pow);
  const BScaled = fixedTermsNormalized.reduce((acc, t) => acc + termScaled(t.c, t.p), 0);

  // Solve: a*AScaled + BScaled = 0  => a = -BScaled / AScaled
  // Ensure a is a positive integer.
  let a = 0;
  if (AScaled !== 0 && (-BScaled) % AScaled === 0) {
    a = (-BScaled) / AScaled;
  }

  // If not a good integer, retry deterministically by nudging seed.
  if (!Number.isFinite(a) || a <= 0 || !Number.isInteger(a) || a > (input.difficulty === 'easy' ? 40 : 80)) {
    return generatePolynomialsQuestion({ seed: input.seed + 1, difficulty: input.difficulty });
  }

  const aTerms: Array<{ coeff: string; power: number }> = [];
  aTerms.push({ coeff: 'a', power: d });
  if (k1 !== 0) aTerms.push({ coeff: `${k1 === 1 ? '' : k1 === -1 ? '-' : String(k1)}a`, power: d - 1 });
  if (k2 !== 0) aTerms.push({ coeff: `${k2 === 1 ? '' : k2 === -1 ? '-' : String(k2)}a`, power: k2Pow });

  const fixedLatexTerms: Array<{ coeff: string; power: number }> = fixedTermsNormalized
    .map((t) => ({ coeff: latexCoeff(t.c), power: t.p }));

  const polyLatex = joinPolyTerms([...aTerms, ...fixedLatexTerms]);

  const questionLatex = String.raw`p(x) = ${polyLatex}`;
  const promptBlocks: PolynomialsQuestion['promptBlocks'] = [
    { kind: 'text', content: 'The polynomial p is given by' },
    { kind: 'math', content: questionLatex, displayMode: true },
    { kind: 'text', content: 'where a is a positive integer. It is given that ' },
    { kind: 'math', content: String.raw`(${factorLatex})`, displayMode: false },
    { kind: 'text', content: ' is a factor of ' },
    { kind: 'math', content: String.raw`p(x)`, displayMode: false },
    { kind: 'text', content: '\n' },
    { kind: 'text', content: 'Find a.' },
  ];

  const explanation: PolynomialsQuestion['katexExplanation'] = [];

  explanation.push({
    kind: 'text' as const,
    content:
      'We are told a linear expression is a factor of the polynomial. This lets us use the Factor Theorem to turn the statement “is a factor” into an equation.'
  });

  explanation.push({ kind: 'text' as const, content: 'Factor Theorem (key idea):' });
  explanation.push({
    kind: 'math' as const,
    content: String.raw`(qx - s)\text{ is a factor of }p(x)\ \Longleftrightarrow\ p\left(\frac{s}{q}\right)=0`,
    displayMode: true,
  });

  explanation.push({
    kind: 'text' as const,
    content: `Here, the factor is (${factorLatex}). So we set it equal to zero to find the corresponding root.`,
  });

  explanation.push({
    kind: 'math' as const,
    content: sgn === 1 ? String.raw`${q}x - 1 = 0` : String.raw`${q}x + 1 = 0`,
    displayMode: true,
  });

  explanation.push({
    kind: 'math' as const,
    content: sgn === 1 ? String.raw`${q}x = 1` : String.raw`${q}x = -1`,
    displayMode: true,
  });

  explanation.push({ kind: 'math' as const, content: String.raw`x = ${rLatex}`, displayMode: true });

  explanation.push({
    kind: 'text' as const,
    content: 'Now apply the Factor Theorem. Since the given linear expression is a factor, the polynomial must be zero at the corresponding root.',
  });

  explanation.push({
    kind: 'math' as const,
    content: String.raw`\text{Root: }x = ${rLatex}`,
    displayMode: true,
  });

  explanation.push({
    kind: 'math' as const,
    content: String.raw`p\left(${rLatex}\right)=0`,
    displayMode: true,
  });

  explanation.push({ kind: 'text' as const, content: 'Now substitute this value of x into p(x). We will be systematic.' });

  explanation.push({ kind: 'math' as const, content: String.raw`p(x) = ${polyLatex}`, displayMode: true });

  explanation.push({ kind: 'text' as const, content: 'First, rewrite p(x) by collecting the terms that contain a and the terms that do not contain a.' });

  const aPartLatex = joinPolyTerms(aTerms);
  const fixedPartLatex = fixedLatexTerms.length ? joinPolyTerms(fixedLatexTerms) : '0';

  explanation.push({
    kind: 'math' as const,
    content: String.raw`p(x) = a\cdot\left(x^{${d}} ${k1 === 0 ? '' : `${latexSignedInt(k1)}x^{${d - 1}}`} ${k2 === 0 ? '' : `${latexSignedInt(k2)}x^{${k2Pow}}`}\right) ${fixedLatexTerms.length ? `${fixedPartLatex.startsWith('-') ? '' : '+'} ${fixedPartLatex}` : ''}`,
    displayMode: true,
  });

  explanation.push({
    kind: 'text' as const,
    content:
      'Now substitute x = ' + (sgn === 1 ? `1/${q}` : `-1/${q}`) + '. The result will be a linear equation in a (because a only appears as a coefficient).',
  });

  // Provide the scaled-integer approach explanation.
  explanation.push({
    kind: 'text' as const,
    content:
      'Because x is a fraction, powers of x will produce fractions. A clean way to avoid messy fractions is to multiply the entire equation by a suitable power of q, which clears denominators up to power ' +
      String(d) +
      '.',
  });

  explanation.push({
    kind: 'math' as const,
    content: String.raw`\text{Multiply both sides by }q^{${d}}\text{ to clear denominators.}`,
    displayMode: true,
  });

  explanation.push({
    kind: 'math' as const,
    content: String.raw`\text{Let }r=${rLatex}.\ \text{We solve }a\cdot A + B = 0\text{ where }A = r^{${d}} + ${k1}\,r^{${d - 1}} + ${k2}\,r^{${k2Pow}}\text{ and }B\text{ is the remaining part.}`,
    displayMode: true,
  });

  explanation.push({
    kind: 'text' as const,
    content: 'Multiply both sides of p(r)=0 by a suitable power of q to clear denominators. This turns A and B into integers.',
  });

  explanation.push({
    kind: 'math' as const,
    content: String.raw`q^{${d}}\,p(r) = 0`,
    displayMode: true,
  });

  explanation.push({
    kind: 'math' as const,
    content: String.raw`a\cdot\left(q^{${d}}A\right) + \left(q^{${d}}B\right)=0`,
    displayMode: true,
  });

  explanation.push({
    kind: 'text' as const,
    content: 'From the substitutions (computed term-by-term), we get:',
  });

  explanation.push({
    kind: 'math' as const,
    content: String.raw`q^{${d}}A = ${AScaled}\quad\text{and}\quad q^{${d}}B = ${BScaled}`,
    displayMode: true,
  });

  explanation.push({
    kind: 'math' as const,
    content: String.raw`${a}\cdot (${AScaled}) + (${BScaled}) = 0`,
    displayMode: true,
  });

  explanation.push({
    kind: 'text' as const,
    content: 'Now solve this linear equation for a.'
  });

  explanation.push({
    kind: 'math' as const,
    content: String.raw`${AScaled}a = ${-BScaled}`,
    displayMode: true,
  });

  explanation.push({
    kind: 'math' as const,
    content: String.raw`a = \frac{${-BScaled}}{${AScaled}} = ${a}`,
    displayMode: true,
  });

  explanation.push({
    kind: 'text' as const,
    content: 'Therefore, the value of the positive integer a is:'
  });

  explanation.push({ kind: 'math' as const, content: String.raw`a = ${a}`, displayMode: true });

  return {
    kind: 'polynomial',
    topicId: 'polynomials',
    id: stableId('poly', input.seed, `${d}-${q}-${sgn}-${a}`),
    seed: input.seed,
    difficulty: input.difficulty,
    katexQuestion: questionLatex,
    promptBlocks,
    katexExplanation: explanation,
    expectedNumber: a,
  };
}
