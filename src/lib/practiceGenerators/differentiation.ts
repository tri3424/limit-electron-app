import type { PracticeDifficulty } from '@/lib/practiceEngine';

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
    .replace(/\s+/g, '')
    .replace(/\\cdot/g, '')
    .replace(/\*/g, '')
    .replace(/\(\)/g, '');
}

type Term = { a: number; n: number };

function termLatex(t: Term) {
  const a = t.a;
  const n = t.n;
  if (n === 0) return String(a);
  if (n === 1) return a === 1 ? 'x' : a === -1 ? '-x' : `${a}x`;
  const aPart = a === 1 ? '' : a === -1 ? '-' : String(a);
  return `${aPart}x^{${n}}`;
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
  id: string;
  seed: number;
  difficulty: PracticeDifficulty;
  katexQuestion: string;
  katexExplanation: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string; displayMode?: boolean }>;
  expectedNormalized: string[];
  expectedLatex: string;
  normalize: (raw: string) => string;
};

export function generateDifferentiationQuestion(input: { seed: number; difficulty: PracticeDifficulty }): DifferentiationQuestion {
  const rng = mulberry32(input.seed);

  const maxPow = input.difficulty === 'easy' ? 5 : input.difficulty === 'medium' ? 6 : 7;
  const termCount = input.difficulty === 'easy' ? 2 : input.difficulty === 'medium' ? 3 : 3;

  const terms: Term[] = [];
  for (let i = 0; i < termCount; i++) {
    const n = rng.int(0, maxPow);
    const a = rng.int(-7, 7) || 1;
    terms.push({ a, n });
  }
  // ensure at least one non-constant term
  if (terms.every((t) => t.n === 0)) terms[0] = { ...terms[0], n: 2 };

  // build function latex
  const parts: string[] = [];
  for (const t of terms) {
    const s = termLatex(t);
    if (!parts.length) {
      parts.push(s);
      continue;
    }
    if (s.startsWith('-')) parts.push(`- ${s.slice(1)}`);
    else parts.push(`+ ${s}`);
  }
  const fLatex = parts.join(' ');
  const dLatex = derivativeLatex(terms);
  const stepPairs = derivativeStepsLatex(terms);

  const expectedNormalized = [normalizeExprForCompare(dLatex)];

  const explanation: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string; displayMode?: boolean }> = [
    { kind: 'text' as const, content: 'Differentiate term-by-term using the power rule.' },
    { kind: 'math' as const, content: `y = ${fLatex}`, displayMode: true },
    { kind: 'text' as const, content: 'Power rule:' },
    { kind: 'math' as const, content: String.raw`\frac{d}{dx}\left(ax^n\right)=anx^{n-1}\quad\text{and}\quad\frac{d}{dx}(c)=0`, displayMode: true },
    { kind: 'text' as const, content: 'Differentiate each term:' },
  ];

  for (const s of stepPairs) {
    explanation.push({
      kind: 'math' as const,
      content: String.raw`\frac{d}{dx}\left(${s.original}\right) = ${s.derived}`,
      displayMode: true,
    });
  }

  explanation.push({ kind: 'text' as const, content: 'Combine the derivatives:' });
  explanation.push({ kind: 'math' as const, content: String.raw`\frac{dy}{dx} = ${dLatex}`, displayMode: true });

  return {
    kind: 'calculus',
    topicId: 'differentiation',
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
