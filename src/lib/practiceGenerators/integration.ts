import type { PracticeDifficulty, PracticeGraphSpec } from '@/lib/practiceEngine';

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

function normalizeExprForCompare(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\\cdot/g, '')
    .replace(/\*/g, '')
    .replace(/\+c/g, '+c')
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

function antiderivativeLatex(terms: Term[]) {
  const out: string[] = [];
  for (const t of terms) {
    if (t.n === -1) continue;
    const n2 = t.n + 1;
    // keep as fraction if not divisible
    const num = t.a;
    const den = n2;
    if (den === 0) continue;
    const g = fracGcd(num, den);
    const nn = num / g;
    const dd = den / g;
    const coeff = dd === 1 ? String(nn) : `\\frac{${nn}}{${dd}}`;
    if (n2 === 1) out.push(`${coeff}x`);
    else out.push(`${coeff}x^{${n2}}`);
  }
  if (out.length === 0) return 'C';
  const joined: string[] = [];
  for (const s of out) {
    if (!joined.length) {
      joined.push(s);
      continue;
    }
    if (s.startsWith('-')) joined.push(`- ${s.slice(1)}`);
    else joined.push(`+ ${s}`);
  }
  return `${joined.join(' ')} + C`;
}

function fracGcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : fracGcd(b, a % b);
}

function simplifyFrac(num: number, den: number): { num: number; den: number } {
  if (den < 0) return simplifyFrac(-num, -den);
  const g = fracGcd(num, den);
  return { num: num / g, den: den / g };
}

function addFrac(a: { num: number; den: number }, b: { num: number; den: number }) {
  return simplifyFrac(a.num * b.den + b.num * a.den, a.den * b.den);
}

function subFrac(a: { num: number; den: number }, b: { num: number; den: number }) {
  return simplifyFrac(a.num * b.den - b.num * a.den, a.den * b.den);
}

function evalAntiderivativeAt(terms: Term[], x: number): { num: number; den: number } {
  // F(x) where F is the reverse power rule antiderivative (for polynomial terms).
  let acc = { num: 0, den: 1 };
  for (const t of terms) {
    const n2 = t.n + 1;
    if (n2 === 0) continue;
    const pow = Math.pow(x, n2);
    if (!Number.isFinite(pow)) continue;
    const num = t.a * pow;
    acc = addFrac(acc, simplifyFrac(num, n2));
  }
  return acc;
}

function fracToLatex(fr: { num: number; den: number }) {
  if (fr.den === 1) return String(fr.num);
  return `\\frac{${fr.num}}{${fr.den}}`;
}

export type IntegrationQuestion = {
  kind: 'calculus';
  topicId: 'integration';
  id: string;
  seed: number;
  difficulty: PracticeDifficulty;
  katexQuestion: string;
  katexExplanation: Array<
    | { kind: 'text'; content: string }
    | { kind: 'math'; content: string; displayMode?: boolean }
    | { kind: 'graph'; graphSpec: PracticeGraphSpec; altText: string }
  >;
  expectedNormalized: string[];
  expectedLatex: string;
  normalize: (raw: string) => string;
};

export function generateIntegrationQuestion(input: { seed: number; difficulty: PracticeDifficulty }): IntegrationQuestion {
  const rng = mulberry32(input.seed);

  const maxPow = input.difficulty === 'easy' ? 4 : input.difficulty === 'medium' ? 5 : 6;
  const termCount = input.difficulty === 'easy' ? 2 : input.difficulty === 'medium' ? 3 : 3;

  const terms: Term[] = [];
  for (let i = 0; i < termCount; i++) {
    const n = rng.int(0, maxPow);
    const a = rng.int(-7, 7) || 1;
    terms.push({ a, n });
  }

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
  const aLatex = antiderivativeLatex(terms);

  const isDefinite = input.difficulty !== 'easy' && rng.next() < 0.45;
  const aBound = isDefinite ? rng.int(-2, 1) : 0;
  const bBound = isDefinite ? rng.int(aBound + 1, 3) : 0;

  const definiteValue = isDefinite
    ? (() => {
        const Fb = evalAntiderivativeAt(terms, bBound);
        const Fa = evalAntiderivativeAt(terms, aBound);
        return subFrac(Fb, Fa);
      })()
    : null;

  const expectedLatex = isDefinite && definiteValue ? fracToLatex(definiteValue) : aLatex;

  const expectedNormalized = [normalizeExprForCompare(expectedLatex)];

  const buildShadedGraph = (): { kind: 'graph'; graphSpec: PracticeGraphSpec; altText: string } => {
    const xMin = -1;
    const xMax = 3;
    const sample = (x: number) => {
      let y = 0;
      for (const t of terms) {
        y += t.a * Math.pow(x, t.n);
      }
      return y;
    };

    const curvePts: Array<{ x: number; y: number }> = [];
    const nPts = 120;
    for (let i = 0; i <= nPts; i++) {
      const x = xMin + (i / nPts) * (xMax - xMin);
      curvePts.push({ x, y: sample(x) });
    }

    const a = isDefinite ? aBound : 0;
    const b = isDefinite ? bBound : 2;
    const shadePts: Array<{ x: number; y: number }> = [];
    shadePts.push({ x: a, y: 0 });
    const shadeN = 80;
    for (let i = 0; i <= shadeN; i++) {
      const x = a + (i / shadeN) * (b - a);
      shadePts.push({ x, y: sample(x) });
    }
    shadePts.push({ x: b, y: 0 });

    const yValues = curvePts.map((p) => p.y).concat([0]);
    const yMin = Math.min(...yValues, -10);
    const yMax = Math.max(...yValues, 10);

    const graphSpec: PracticeGraphSpec = {
      width: 620,
      height: 360,
      window: { xMin, xMax, yMin, yMax },
      plot: [
        { kind: 'polygon', points: shadePts, fill: '#10b981', fillOpacity: 0.18, stroke: '#10b981', strokeWidth: 1 },
        { kind: 'polyline', points: curvePts, stroke: '#111827', strokeWidth: 2 },
      ],
    };

    return {
      kind: 'graph',
      graphSpec,
      altText: 'Graph of the integrand with the region under the curve shaded (example interval).',
    };
  };

  const explanation: IntegrationQuestion['katexExplanation'] = [
    { kind: 'text' as const, content: 'Integrate term-by-term using the reverse power rule.' },
    {
      kind: 'math' as const,
      content: isDefinite ? String.raw`\int_{${aBound}}^{${bBound}} (${fLatex})\,dx` : String.raw`\int (${fLatex})\,dx`,
      displayMode: true,
    },
    { kind: 'text' as const, content: 'Reverse power rule:' },
    { kind: 'math' as const, content: String.raw`\int ax^n\,dx = \frac{a x^{n+1}}{n+1} + C\quad (n \ne -1)`, displayMode: true },
  ];

  if (isDefinite && definiteValue) {
    explanation.push({ kind: 'math' as const, content: String.raw`F(x) = ${aLatex}`, displayMode: true });

    explanation.splice(2, 0, {
      kind: 'text' as const,
      content: 'A visual: the shaded region shows the area under the curve for the interval in the definite integral.',
    });
    explanation.splice(3, 0, buildShadedGraph());

    explanation.push({ kind: 'text' as const, content: 'Evaluate the antiderivative at the bounds and subtract:' });
    explanation.push({
      kind: 'math' as const,
      content: String.raw`\int_{${aBound}}^{${bBound}} (${fLatex})\,dx = F(${bBound}) - F(${aBound})`,
      displayMode: true,
    });
    explanation.push({ kind: 'math' as const, content: String.raw`= ${expectedLatex}`, displayMode: true });
  } else {
    // Indefinite integral: show the final antiderivative.
    explanation.push({ kind: 'math' as const, content: String.raw`= ${aLatex}`, displayMode: true });
  }

  return {
    kind: 'calculus',
    topicId: 'integration',
    id: stableId('int', input.seed, `${termCount}-${maxPow}`),
    seed: input.seed,
    difficulty: input.difficulty,
    katexQuestion: isDefinite
      ? String.raw`\textbf{Evaluate: }\; \int_{${aBound}}^{${bBound}} (${fLatex})\,dx.`
      : String.raw`\textbf{Integrate: }\; \int (${fLatex})\,dx.\;\textbf{Include }+C.`,
    katexExplanation: explanation,
    expectedNormalized,
    expectedLatex,
    normalize: normalizeExprForCompare,
  };
}
