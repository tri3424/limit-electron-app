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
  id: string;
  seed: number;
  difficulty: PracticeDifficulty;
  katexQuestion: string;
  katexExplanation: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string; displayMode?: boolean }>;
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
    const total = wStationary + wBasic;
    const pick = total <= 0 ? 0 : rng.next() * total;
    return pick < wStationary ? ('stationary_points' as const) : ('basic_polynomial' as const);
  })();

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

    const explanation: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string; displayMode?: boolean }> = [
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

  const explanation: Array<{ kind: 'text'; content: string } | { kind: 'math'; content: string; displayMode?: boolean }> = [
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
