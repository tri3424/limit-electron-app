import type { PracticeDifficulty, PracticeGraphSpec } from '@/lib/practiceEngine';
import { normalizeUniversalMathAnswer } from '@/lib/universalMathNormalize';

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
  return normalizeUniversalMathAnswer(raw);
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

function powAsMultiplicationLatex(base: number, exp: number) {
  if (exp === 0) return '1';
  const b = base < 0 ? String.raw`\left(${base}\right)` : String(base);
  return Array.from({ length: exp }, () => b).join(String.raw`\cdot `);
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
    const coeff = (() => {
      if (dd !== 1) return nn < 0 ? `-\\frac{${Math.abs(nn)}}{${dd}}` : `\\frac{${nn}}{${dd}}`;
      if (nn === 1) return '';
      if (nn === -1) return '-';
      return String(nn);
    })();
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
  if (fr.num < 0) return `-\\frac{${Math.abs(fr.num)}}{${fr.den}}`;
  return `\\frac{${fr.num}}{${fr.den}}`;
}

function fracMulInt(fr: { num: number; den: number }, k: number) {
  return simplifyFrac(fr.num * k, fr.den);
}

function fracFromInt(n: number) {
  return { num: n, den: 1 };
}

function fmtCoeffFracLatex(fr: { num: number; den: number }) {
  if (fr.den === 1) return String(fr.num);
  if (fr.num < 0) return `-\\frac{${Math.abs(fr.num)}}{${fr.den}}`;
  return `\\frac{${fr.num}}{${fr.den}}`;
}

function antiderivativeTermCoeffFrac(t: Term) {
  const n2 = t.n + 1;
  return simplifyFrac(t.a, n2);
}

function antiderivativeTermLatex(t: Term) {
  const n2 = t.n + 1;
  const coeff = antiderivativeTermCoeffFrac(t);
  const coeffLatex = (() => {
    if (coeff.den !== 1) return fmtCoeffFracLatex(coeff);
    if (coeff.num === 1) return '';
    if (coeff.num === -1) return '-';
    return String(coeff.num);
  })();
  if (n2 === 1) return `${coeffLatex}x`;
  return `${coeffLatex}x^{${n2}}`;
}

function latexParens(s: string) {
  return `\\left(${s}\\right)`;
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

export function generateIntegrationQuestion(input: { seed: number; difficulty: PracticeDifficulty; variantWeights?: Record<string, number> }): IntegrationQuestion {
  const rng = mulberry32(input.seed);

  const maxPow = input.difficulty === 'easy' ? 4 : input.difficulty === 'medium' ? 5 : 6;
  const termCount = input.difficulty === 'easy' ? 2 : input.difficulty === 'medium' ? 3 : 3;

  const rawTerms: Term[] = [];
  for (let i = 0; i < termCount; i++) {
    const n = rng.int(0, maxPow);
    const a = rng.int(-7, 7) || 1;
    rawTerms.push({ a, n });
  }

  const terms = simplifyTermList(rawTerms);

  const fLatex = joinSignedLatex(terms.map(termLatex));
  const aLatex = antiderivativeLatex(terms);

  const isDefinite = (() => {
    if (input.difficulty === 'easy') return false;

    const w = input.variantWeights ?? {};
    const wDef = typeof w.definite === 'number' ? Math.max(0, w.definite) : 45;
    const wInd = typeof w.indefinite === 'number' ? Math.max(0, w.indefinite) : 55;
    const total = wDef + wInd;
    if (total <= 0) return rng.next() < 0.45;
    return rng.next() * total < wDef;
  })();
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
    const a = isDefinite ? aBound : 0;
    const b = isDefinite ? bBound : 2;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    // Keep the view focused near the interval so the shaded region is visible.
    // Too much padding makes high-degree polynomials explode (y becomes enormous) and the shading disappears visually.
    const interval = hi - lo;
    const pad = Math.min(6, Math.max(2, Math.ceil(interval * 1.25)));
    const xMin = lo - pad;
    const xMax = hi + pad;
    const sample = (x: number) => {
      let y = 0;
      for (const t of terms) {
        y += t.a * Math.pow(x, t.n);
      }
      return y;
    };

    const curvePts: Array<{ x: number; y: number }> = [];
    const nPts = 160;
    for (let i = 0; i <= nPts; i++) {
      const x = xMin + (i / nPts) * (xMax - xMin);
      curvePts.push({ x, y: sample(x) });
    }

    const shadeN = 200;
    const shadeSamples: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= shadeN; i++) {
      const x = a + (i / shadeN) * (b - a);
      shadeSamples.push({ x, y: sample(x) });
    }

    const shadePolys: Array<Array<{ x: number; y: number }>> = [];
    const startX = shadeSamples[0]?.x ?? a;
    let seg: Array<{ x: number; y: number }> = [{ x: startX, y: 0 }];
    if (shadeSamples[0]) seg.push(shadeSamples[0]);

    const crossesAxis = (y1: number, y2: number) => (y1 > 0 && y2 < 0) || (y1 < 0 && y2 > 0);

    for (let i = 1; i < shadeSamples.length; i++) {
      const prev = shadeSamples[i - 1]!;
      const cur = shadeSamples[i]!;

      if (prev.y === 0) {
        seg.push(cur);
        continue;
      }

      if (cur.y === 0 || crossesAxis(prev.y, cur.y)) {
        const t = cur.y === prev.y ? 0 : (0 - prev.y) / (cur.y - prev.y);
        const x0 = prev.x + t * (cur.x - prev.x);
        seg.push({ x: x0, y: 0 });
        if (seg.length >= 3) shadePolys.push(seg.concat([{ x: seg[0]!.x, y: 0 }]));

        seg = [{ x: x0, y: 0 }];
        if (cur.y !== 0) seg.push(cur);
        continue;
      }

      seg.push(cur);
    }

    const endX = shadeSamples[shadeSamples.length - 1]?.x ?? b;
    seg.push({ x: endX, y: 0 });
    if (seg.length >= 3) shadePolys.push(seg.concat([{ x: seg[0]!.x, y: 0 }]));

    // If we failed to produce any polygon (edge cases), fall back to a single region.
    if (shadePolys.length === 0 && shadeSamples.length >= 2) {
      const poly = [{ x: startX, y: 0 }, ...shadeSamples, { x: endX, y: 0 }, { x: startX, y: 0 }];
      shadePolys.push(poly);
    }

    const yValues = curvePts.map((p) => p.y).concat([0]);
    const yLo = Math.min(...yValues);
    const yHi = Math.max(...yValues);
    const yPad = Math.max(6, (yHi - yLo) * 0.15);
    const yMin = yLo - yPad;
    const yMax = yHi + yPad;

    const labelAtX = xMin + (xMax - xMin) * 0.04;
    const labelAtY = yMax - (yMax - yMin) * 0.08;

    const graphSpec: PracticeGraphSpec = {
      width: 620,
      height: 360,
      window: { xMin, xMax, yMin, yMax },
      plot: [
        ...shadePolys.map((points) => ({
          kind: 'polygon' as const,
          points,
          fill: '#10b981',
          fillOpacity: 0.26,
          stroke: '#10b981',
          strokeWidth: 1,
        })),
        // show the integration interval boundaries
        { kind: 'polyline', points: [{ x: a, y: 0 }, { x: a, y: sample(a) }], stroke: '#10b981', strokeWidth: 2 },
        { kind: 'polyline', points: [{ x: b, y: 0 }, { x: b, y: sample(b) }], stroke: '#10b981', strokeWidth: 2 },
        // Use a precomputed polyline instead of a function reference so the generated question
        // is deterministic under deep-equality (functions are not referentially stable).
        { kind: 'polyline', points: curvePts, stroke: '#111827', strokeWidth: 2 },
        { kind: 'label', at: { x: labelAtX, y: labelAtY }, text: String.raw`y = ${fLatex}`, fill: '#111827', fontSize: 14, anchor: 'start' },
      ],
    };

    return {
      kind: 'graph',
      graphSpec,
      altText: 'Graph of the integrand y = f(x) with the region under the curve shaded over the interval of integration.',
    };
  };

  const explanation: IntegrationQuestion['katexExplanation'] = [
    {
      kind: 'text' as const,
      content:
        'We will integrate using the reverse (antiderivative) power rule, working carefully term-by-term and showing each algebraic step.' +
        (isDefinite ? ' Since this is a definite integral, we will then substitute the limits and subtract.' : ''),
    },
    {
      kind: 'math' as const,
      content: isDefinite
        ? String.raw`\displaystyle\int_{${aBound}}^{${bBound}} (${fLatex})\,dx`
        : String.raw`\displaystyle\int (${fLatex})\,dx`,
      displayMode: true,
    },
    { kind: 'text' as const, content: 'Reverse power rule (stated):' },
    {
      kind: 'math' as const,
      content: String.raw`\displaystyle\int a x^n\,dx = a\cdot\frac{x^{n+1}}{n+1} + C\quad (n \ne -1)`,
      displayMode: true,
    },
    {
      kind: 'text' as const,
      content:
        'This means: increase the power by 1, then divide by the new power (so that differentiating the result brings the new power down and cancels the division).',
    },
  ];

  explanation.push({ kind: 'text' as const, content: 'Now integrate each term separately.' });

  for (const t of terms) {
    const n2 = t.n + 1;
    const coeffFrac = antiderivativeTermCoeffFrac(t);
    const coeffFracLatex = fmtCoeffFracLatex(coeffFrac);
    const original = termLatex(t);
    const afterPower = n2 === 1 ? `${t.a}x` : `${t.a}x^{${n2}}`;
    const termAntiLatex = antiderivativeTermLatex(t);
    const rawCoeffFracLatex = t.a < 0 ? String.raw`-\frac{${Math.abs(t.a)}}{${n2}}` : String.raw`\frac{${t.a}}{${n2}}`;

    explanation.push({
      kind: 'text' as const,
      content: `Consider the next term. Here the coefficient is ${t.a} and the power of x is ${t.n}.`,
    });
    explanation.push({
      kind: 'math' as const,
      content: String.raw`${original}`,
      displayMode: true,
    });
    explanation.push({
      kind: 'math' as const,
      content: String.raw`\int ${latexParens(original)}\,dx`,
      displayMode: true,
    });
    explanation.push({
      kind: 'text' as const,
      content: `Using the reverse power rule, we increase the exponent by 1: ${t.n} → ${n2}.`,
    });
    explanation.push({
      kind: 'math' as const,
      content: String.raw`= ${t.a}\cdot \frac{x^{${n2}}}{${n2}}`,
      displayMode: true,
    });
    explanation.push({
      kind: 'text' as const,
      content: `Now divide the coefficient by the new exponent ${n2} and simplify the coefficient as a fraction if needed.`,
    });
    explanation.push({
      kind: 'math' as const,
      content: String.raw`= ${rawCoeffFracLatex}x^{${n2}}`,
      displayMode: true,
    });
    explanation.push({
      kind: 'math' as const,
      content:
        coeffFrac.den === 1
          ? String.raw`= ${coeffFracLatex}x^{${n2}}`
          : String.raw`= ${coeffFracLatex}x^{${n2}}\quad\text{(after simplifying }${rawCoeffFracLatex}\text{)}`,
      displayMode: true,
    });
    if (n2 === 1) {
      explanation.push({ kind: 'text' as const, content: 'Since the new exponent is 1, we write x to the power 1 simply as x.' });
      explanation.push({ kind: 'math' as const, content: String.raw`= ${coeffFracLatex}x`, displayMode: true });
    }
    explanation.push({ kind: 'text' as const, content: 'So the antiderivative of this term is:' });
    explanation.push({ kind: 'math' as const, content: String.raw`${termAntiLatex}`, displayMode: true });
  }

  explanation.push({ kind: 'text' as const, content: 'Putting the integrated terms back together gives the full antiderivative:' });
  explanation.push({ kind: 'math' as const, content: String.raw`F(x) = ${aLatex}`, displayMode: true });

  if (isDefinite && definiteValue) {
    explanation.splice(2, 0, {
      kind: 'text' as const,
      content:
        'A visual: the shaded region represents the signed area under the curve y = f(x) over the interval of integration.',
    });
    explanation.splice(3, 0, buildShadedGraph());

    explanation.push({ kind: 'text' as const, content: 'Now substitute the limits into F(x) and subtract (Fundamental Theorem of Calculus):' });
    explanation.push({
      kind: 'math' as const,
      content: String.raw`\displaystyle\int_{${aBound}}^{${bBound}} (${fLatex})\,dx = F(${bBound}) - F(${aBound})`,
      displayMode: true,
    });

    const explainEvalAt = (x: number, label: 'upper' | 'lower') => {
      explanation.push({
        kind: 'text' as const,
        content: label === 'upper' ? `Substituting the upper limit x = ${x}:` : `Substituting the lower limit x = ${x}:`,
      });

      const termEvalLatexParts: string[] = [];
      let sum = { num: 0, den: 1 };
      for (const t of terms) {
        const n2 = t.n + 1;
        const coeff = antiderivativeTermCoeffFrac(t);
        const coeffLatex = fmtCoeffFracLatex(coeff);
        const pow = Math.pow(x, n2);
        const powInt = Number.isFinite(pow) ? Math.trunc(pow) : pow;

        explanation.push({
          kind: 'text' as const,
          content:
            n2 % 2 === 0 && x < 0
              ? `Note: because the power ${n2} is even, the value will be positive even if x is negative.`
              : n2 % 2 === 1 && x < 0
                ? `Note: because the power ${n2} is odd, the value will stay negative when x is negative.`
                : `Compute x raised to the power ${n2} explicitly.`,
        });

        if (Number.isFinite(pow) && Number.isInteger(pow)) {
          explanation.push({
            kind: 'math' as const,
            content: String.raw`(${x})^{${n2}} = ${powAsMultiplicationLatex(x, n2)} = ${powInt}`,
            displayMode: true,
          });
        } else {
          explanation.push({
            kind: 'math' as const,
            content: String.raw`(${x})^{${n2}} = ${pow}`,
            displayMode: true,
          });
        }

        explanation.push({
          kind: 'text' as const,
          content: 'Now multiply by the coefficient.',
        });
        explanation.push({
          kind: 'math' as const,
          content: String.raw`\text{Coefficient} = ${coeffLatex}`,
          displayMode: true,
        });
        explanation.push({
          kind: 'math' as const,
          content: String.raw`${coeffLatex}\cdot (${x})^{${n2}} = ${coeffLatex}\cdot ${powInt}`,
          displayMode: true,
        });

        const termValue = simplifyFrac(coeff.num * powInt, coeff.den);
        explanation.push({
          kind: 'math' as const,
          content: String.raw`= ${fracToLatex(termValue)}`,
          displayMode: true,
        });

        termEvalLatexParts.push(fracToLatex(termValue));
        sum = addFrac(sum, termValue);
      }

      explanation.push({ kind: 'text' as const, content: 'Add the evaluated terms (using common denominators where needed):' });
      explanation.push({
        kind: 'math' as const,
        content: String.raw`F(${x}) = ${joinSignedLatex(termEvalLatexParts)}`,
        displayMode: true,
      });
      explanation.push({ kind: 'math' as const, content: String.raw`= ${fracToLatex(sum)}`, displayMode: true });
      return sum;
    };

    const Fb = explainEvalAt(bBound, 'upper');
    const Fa = explainEvalAt(aBound, 'lower');

    explanation.push({ kind: 'text' as const, content: 'Now subtract with clear brackets:' });
    explanation.push({
      kind: 'math' as const,
      content: String.raw`\displaystyle\int_{${aBound}}^{${bBound}} (${fLatex})\,dx = F(${bBound}) - F(${aBound}) = ${latexParens(fracToLatex(Fb))} - ${latexParens(fracToLatex(Fa))}`,
      displayMode: true,
    });

    const diff = subFrac(Fb, Fa);
    explanation.push({ kind: 'math' as const, content: String.raw`= ${fracToLatex(diff)}`, displayMode: true });
    explanation.push({ kind: 'text' as const, content: 'Hence, the value of the definite integral is the simplified fraction above.' });

    explanation.push({ kind: 'text' as const, content: 'Verification (brief): differentiating F(x) returns the original integrand.' });
    explanation.push({
      kind: 'math' as const,
      content: String.raw`\frac{d}{dx}\left(${aLatex}\right) = ${fLatex}`,
      displayMode: true,
    });

    explanation.push({ kind: 'text' as const, content: 'Common errors:' });
    explanation.push({
      kind: 'text' as const,
      content: '1) Forgetting to divide by the new power (e.g. integrating x^3 as x^4 instead of x^4/4).',
    });
    explanation.push({
      kind: 'text' as const,
      content: '2) Sign mistakes when substituting a negative lower limit (odd/even powers behave differently).',
    });
    explanation.push({
      kind: 'text' as const,
      content: '3) Forgetting the subtraction order: definite integral is F(upper) − F(lower).',
    });
  } else {
    // Indefinite integral: show the final antiderivative.
    explanation.push({ kind: 'text' as const, content: 'So the indefinite integral is the antiderivative plus the constant of integration.' });
    explanation.push({ kind: 'math' as const, content: String.raw`\int (${fLatex})\,dx = ${aLatex}`, displayMode: true });
    explanation.push({ kind: 'text' as const, content: 'Verification (brief): differentiating the result gives back the integrand.' });
    explanation.push({
      kind: 'math' as const,
      content: String.raw`\frac{d}{dx}\left(${aLatex}\right) = ${fLatex}`,
      displayMode: true,
    });

    explanation.push({ kind: 'text' as const, content: 'Common errors:' });
    explanation.push({
      kind: 'text' as const,
      content: '1) Forgetting to add +C for an indefinite integral.',
    });
    explanation.push({
      kind: 'text' as const,
      content: '2) Increasing the exponent but not dividing by the new exponent.',
    });
    explanation.push({
      kind: 'text' as const,
      content: '3) Dropping negative signs when integrating term-by-term.',
    });
  }

  return {
    kind: 'calculus',
    topicId: 'integration',
    id: stableId('int', input.seed, `${isDefinite ? `${aBound}-${bBound}` : 'indef'}-${fLatex}`),
    seed: input.seed,
    difficulty: input.difficulty,
    katexQuestion: isDefinite
      ? String.raw`\textbf{Evaluate: }\; \displaystyle\int_{${aBound}}^{${bBound}} (${fLatex})\,dx.`
      : String.raw`\textbf{Integrate: }\; \displaystyle\int (${fLatex})\,dx.\;\textbf{Include }+C.`,
    katexExplanation: explanation,
    expectedNormalized,
    expectedLatex,
    normalize: normalizeExprForCompare,
  };
}
