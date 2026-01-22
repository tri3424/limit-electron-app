import type { GraphPracticeQuestion, PracticeDifficulty, PracticeTopicId } from '@/lib/practiceEngine';

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

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function shuffle<T>(rng: Rng, arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function gcd(a: number, b: number) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function simplifyFrac(n: number, d: number) {
  const g = gcd(n, d) || 1;
  const nn = n / g;
  const dd = d / g;
  return dd < 0 ? { n: -nn, d: -dd } : { n: nn, d: dd };
}

function fracToLatex(n: number, d: number) {
  const f = simplifyFrac(n, d);
  if (f.d === 1) return String(f.n);
  if (f.n < 0) return String.raw`-\frac{${Math.abs(f.n)}}{${f.d}}`;
  return String.raw`\frac{${f.n}}{${f.d}}`;
}

function terminatingDecimalString(n: number, d: number) {
  const f = simplifyFrac(n, d);
  let dd = f.d;
  while (dd % 2 === 0) dd /= 2;
  while (dd % 5 === 0) dd /= 5;
  if (dd !== 1) return null;
  const val = f.n / f.d;
  // Keep up to 3 dp, trim trailing zeros.
  let s = val.toFixed(3);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

function ratioLatex(name: 'sin' | 'cos' | 'tan' | 'cot' | 'sec' | 'csc') {
  switch (name) {
    case 'sin':
      return String.raw`\sin`;
    case 'cos':
      return String.raw`\cos`;
    case 'tan':
      return String.raw`\tan`;
    case 'cot':
      return String.raw`\cot`;
    case 'sec':
      return String.raw`\sec`;
    case 'csc':
      return String.raw`\csc`;
  }
}

function trigPow(name: 'sin' | 'cos' | 'tan' | 'cot' | 'sec' | 'csc', exp: number) {
  const base = ratioLatex(name);
  if (exp === 0) return '';
  if (exp === 1) return String.raw`${base}\theta`;
  return String.raw`${base}^{${exp}}\theta`;
}

function trigPowValue(name: 'sin' | 'cos' | 'tan' | 'cot' | 'sec' | 'csc', exp: number) {
  if (exp === 0) return String.raw`1`;
  return trigPow(name, exp);
}

function trigProduct(items: Array<{ fn: 'sin' | 'cos' | 'tan' | 'cot' | 'sec' | 'csc'; exp: number }>) {
  const parts = items.map((it) => trigPow(it.fn, it.exp)).filter(Boolean);
  if (!parts.length) return String.raw`1`;
  if (parts.length === 1) return parts[0]!;
  return parts.join(String.raw`\,`);
}

function signsFromQuadrant(quadrant: 1 | 2 | 3 | 4) {
  const sinSign = quadrant === 3 || quadrant === 4 ? -1 : 1;
  const cosSign = quadrant === 2 || quadrant === 3 ? -1 : 1;
  const tanSign = sinSign * cosSign;
  return { sinSign, cosSign, tanSign };
}

function quadrantRangeLatex(quadrant: 1 | 2 | 3 | 4) {
  if (quadrant === 1) return String.raw`0^\circ < \theta < 90^\circ`;
  if (quadrant === 2) return String.raw`90^\circ < \theta < 180^\circ`;
  if (quadrant === 3) return String.raw`180^\circ < \theta < 270^\circ`;
  return String.raw`270^\circ < \theta < 360^\circ`;
}

function sampleFunctionPoints(input: {
  fn: (x: number) => number;
  xMin: number;
  xMax: number;
  yClip: number;
  n: number;
}): Array<Array<{ x: number; y: number }>> {
  const { fn, xMin, xMax, yClip, n } = input;
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let seg: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= n; i++) {
    const x = xMin + (i / n) * (xMax - xMin);
    const y = fn(x);

    if (!isFinite(y) || Math.abs(y) > yClip) {
      if (seg.length >= 2) segments.push(seg);
      seg = [];
      continue;
    }

    seg.push({ x, y });
  }

  if (seg.length >= 2) segments.push(seg);
  return segments;
}

function toSigFigsNumber(x: number, sf: number) {
  const n = Number(x);
  if (!Number.isFinite(n)) return n;
  if (n === 0) return 0;
  const d = Math.ceil(Math.log10(Math.abs(n)));
  const p = sf - d;
  const scale = Math.pow(10, p);
  return Math.round(n * scale) / scale;
}

function circlePolylinePoints(r: number, n: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push({ x: r * Math.cos(t), y: r * Math.sin(t) });
  }
  return pts;
}

type TrigExactDeg = {
  deg: number;
  sin: string;
  cos: string;
  tan: string;
};

const TRIG_EXACT_DEG: TrigExactDeg[] = [
  { deg: 0, sin: '0', cos: '1', tan: '0' },
  { deg: 30, sin: String.raw`\frac{1}{2}`, cos: String.raw`\frac{\sqrt{3}}{2}`, tan: String.raw`\frac{\sqrt{3}}{3}` },
  { deg: 45, sin: String.raw`\frac{\sqrt{2}}{2}`, cos: String.raw`\frac{\sqrt{2}}{2}`, tan: '1' },
  { deg: 60, sin: String.raw`\frac{\sqrt{3}}{2}`, cos: String.raw`\frac{1}{2}`, tan: String.raw`\sqrt{3}` },
  { deg: 90, sin: '1', cos: '0', tan: String.raw`\text{undefined}` },
  { deg: 120, sin: String.raw`\frac{\sqrt{3}}{2}`, cos: String.raw`-\frac{1}{2}`, tan: String.raw`-\sqrt{3}` },
  { deg: 135, sin: String.raw`\frac{\sqrt{2}}{2}`, cos: String.raw`-\frac{\sqrt{2}}{2}`, tan: '-1' },
  { deg: 150, sin: String.raw`\frac{1}{2}`, cos: String.raw`-\frac{\sqrt{3}}{2}`, tan: String.raw`-\frac{\sqrt{3}}{3}` },
  { deg: 180, sin: '0', cos: '-1', tan: '0' },
  { deg: 210, sin: String.raw`-\frac{1}{2}`, cos: String.raw`-\frac{\sqrt{3}}{2}`, tan: String.raw`\frac{\sqrt{3}}{3}` },
  { deg: 225, sin: String.raw`-\frac{\sqrt{2}}{2}`, cos: String.raw`-\frac{\sqrt{2}}{2}`, tan: '1' },
  { deg: 240, sin: String.raw`-\frac{\sqrt{3}}{2}`, cos: String.raw`-\frac{1}{2}`, tan: String.raw`\sqrt{3}` },
  { deg: 270, sin: '-1', cos: '0', tan: String.raw`\text{undefined}` },
  { deg: 300, sin: String.raw`-\frac{\sqrt{3}}{2}`, cos: String.raw`\frac{1}{2}`, tan: String.raw`-\sqrt{3}` },
  { deg: 315, sin: String.raw`-\frac{\sqrt{2}}{2}`, cos: String.raw`\frac{\sqrt{2}}{2}`, tan: '-1' },
  { deg: 330, sin: String.raw`-\frac{1}{2}`, cos: String.raw`\frac{\sqrt{3}}{2}`, tan: String.raw`-\frac{\sqrt{3}}{3}` },
];

function normDeg(deg: number) {
  const d = ((deg % 360) + 360) % 360;
  return d;
}

function exactTrigDeg(deg: number) {
  const d = normDeg(deg);
  const row = TRIG_EXACT_DEG.find((x) => x.deg === d);
  return row ?? null;
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function tanResultAnglesDeg() {
  // Angles where tan has an exact finite value (avoid 90, 270 etc).
  return [
    0,
    30,
    45,
    60,
    120,
    135,
    150,
    180,
    210,
    225,
    240,
    300,
    315,
    330,
  ];
}

function signedFracLatex(n: number, d: number) {
  return fracToLatex(n, d);
}

function simplifySignedFrac(n: number, d: number) {
  return simplifyFrac(n, d);
}

function mulFrac(a: { n: number; d: number }, b: { n: number; d: number }) {
  return simplifySignedFrac(a.n * b.n, a.d * b.d);
}

function addFrac(a: { n: number; d: number }, b: { n: number; d: number }) {
  return simplifySignedFrac(a.n * b.d + b.n * a.d, a.d * b.d);
}

function subFrac(a: { n: number; d: number }, b: { n: number; d: number }) {
  return simplifySignedFrac(a.n * b.d - b.n * a.d, a.d * b.d);
}

function fracEq(a: { n: number; d: number }, b: { n: number; d: number }) {
  const x = simplifySignedFrac(a.n, a.d);
  const y = simplifySignedFrac(b.n, b.d);
  return x.n === y.n && x.d === y.d;
}

export function generateGraphTrigonometryMcq(input: {
  topicId: PracticeTopicId;
  difficulty: PracticeDifficulty;
  seed: number;
  variantWeights?: Record<string, number>;
}): GraphPracticeQuestion {
  const rng = mulberry32(input.seed);
  const pickVariant = (): 'trig_ratio_quadrant' | 'identity_simplify' | 'exact_values_special_angles' | 'solve_trig_equation' | 'compound_angle_expand' | 'exact_value_identities' | 'given_cosx_compound' | 'tan_add_sub_identity' | 'sumdiff_from_given_ratios' => {
    // easy: keep the existing style.
    if (input.difficulty === 'easy') return 'trig_ratio_quadrant';

    const w = input.variantWeights ?? {};
    const wRatio = typeof w.ratio_quadrant === 'number' ? Math.max(0, Number(w.ratio_quadrant)) : 40;
    const wIdentity = typeof w.identity_simplify === 'number'
      ? Math.max(0, Number(w.identity_simplify))
      : (input.difficulty === 'hard' ? 25 : 0);
    const wExact = typeof (w as any).exact_values_special_angles === 'number'
      ? Math.max(0, Number((w as any).exact_values_special_angles))
      : 25;
    const wSolve = typeof (w as any).solve_trig_equation === 'number'
      ? Math.max(0, Number((w as any).solve_trig_equation))
      : 25;

    const wCompound = typeof (w as any).compound_angle_expand === 'number'
      ? Math.max(0, Number((w as any).compound_angle_expand))
      : 25;
    const wExactId = typeof (w as any).exact_value_identities === 'number'
      ? Math.max(0, Number((w as any).exact_value_identities))
      : 25;
    const wGiven = typeof (w as any).given_cosx_compound === 'number'
      ? Math.max(0, Number((w as any).given_cosx_compound))
      : (input.difficulty === 'hard' ? 15 : 0);

    const wTanAdd = typeof (w as any).tan_add_sub_identity === 'number'
      ? Math.max(0, Number((w as any).tan_add_sub_identity))
      : 25;

    const wSumDiff = typeof (w as any).sumdiff_from_given_ratios === 'number'
      ? Math.max(0, Number((w as any).sumdiff_from_given_ratios))
      : 22;

    const total = wRatio + wIdentity + wExact + wSolve + wCompound + wExactId + wGiven + wTanAdd + wSumDiff;
    if (!(total > 0)) return 'trig_ratio_quadrant';
    const r = rng.next() * total;
    let t = 0;
    t += wExact;
    if (r < t) return 'exact_values_special_angles';
    t += wSolve;
    if (r < t) return 'solve_trig_equation';
    t += wCompound;
    if (r < t) return 'compound_angle_expand';
    t += wExactId;
    if (r < t) return 'exact_value_identities';
    t += wGiven;
    if (r < t) return 'given_cosx_compound';
    t += wTanAdd;
    if (r < t) return 'tan_add_sub_identity';
    t += wSumDiff;
    if (r < t) return 'sumdiff_from_given_ratios';
    t += wIdentity;
    if (r < t) return 'identity_simplify';
    return 'trig_ratio_quadrant';
  };

  const variant = pickVariant();

  if (variant === 'compound_angle_expand') {
    // Expand and simplify sin(x±a) or cos(x±a) using exact a.
    const aPool = [30, 45, 60];
    const a = aPool[rng.int(0, aPool.length - 1)]!;
    const sign = rng.next() < 0.5 ? 1 : -1;
    const fn = rng.next() < 0.5 ? ('cos' as const) : ('sin' as const);
    const aRow = exactTrigDeg(a)!;
    const op = sign > 0 ? '+' : '-';

    const lhs = fn === 'cos'
      ? String.raw`\cos\left(x${op}${a}^\circ\right)`
      : String.raw`\sin\left(x${op}${a}^\circ\right)`;

    const correct = (() => {
      // cos(x+a)=cosx cosa - sinx sina; cos(x-a)=cosx cosa + sinx sina
      // sin(x+a)=sinx cosa + cosx sina; sin(x-a)=sinx cosa - cosx sina
      if (fn === 'cos') {
        const mid = sign > 0 ? '-' : '+';
        return String.raw`\cos x\,${aRow.cos}\,${mid}\,\sin x\,${aRow.sin}`;
      }
      const mid = sign > 0 ? '+' : '-';
      return String.raw`\sin x\,${aRow.cos}\,${mid}\,\cos x\,${aRow.sin}`;
    })();

    const wrong1 = fn === 'cos'
      ? String.raw`\cos x\,${aRow.cos}\,+\,\sin x\,${aRow.sin}`
      : String.raw`\sin x\,${aRow.cos}\,+\,\cos x\,${aRow.sin}`;
    const wrong2 = fn === 'cos'
      ? String.raw`\sin x\,${aRow.cos}\,-\,\cos x\,${aRow.sin}`
      : String.raw`\cos x\,${aRow.cos}\,-\,\sin x\,${aRow.sin}`;
    const wrong3 = fn === 'cos'
      ? String.raw`\cos x\,${aRow.sin}\,-\,\sin x\,${aRow.cos}`
      : String.raw`\sin x\,${aRow.sin}\,+\,\cos x\,${aRow.cos}`;

    const optionsRaw = [correct, wrong1, wrong2, wrong3];
    const optionsUnique: string[] = [];
    for (const o of optionsRaw) if (!optionsUnique.includes(o)) optionsUnique.push(o);
    while (optionsUnique.length < 4) optionsUnique.push(optionsUnique[0]!);
    const shuffled = shuffle(rng, optionsUnique.slice(0, 4));
    const correctIndex = shuffled.indexOf(correct);

    const promptText = '';
    const promptKatex = String.raw`\text{Expand and simplify }${lhs}.`;

    const steps: Array<{ katex: string; text: string }> = [
      { katex: String.raw`\textbf{Use the compound-angle identity}`, text: 'Pick the correct formula for sin or cos of a sum/difference.' },
      fn === 'cos'
        ? {
          katex: sign > 0
            ? String.raw`\cos(x+a)=\cos x\cos a-\sin x\sin a`
            : String.raw`\cos(x-a)=\cos x\cos a+\sin x\sin a`,
          text: 'This is the standard identity for cosine.' ,
        }
        : {
          katex: sign > 0
            ? String.raw`\sin(x+a)=\sin x\cos a+\cos x\sin a`
            : String.raw`\sin(x-a)=\sin x\cos a-\cos x\sin a`,
          text: 'This is the standard identity for sine.' ,
        },
      { katex: String.raw`\cos ${a}^\circ=${aRow.cos},\quad \sin ${a}^\circ=${aRow.sin}`, text: 'Use exact values for the special angle.' },
      { katex: String.raw`\boxed{${lhs}=${correct}}`, text: 'Substitute and simplify.' },
    ];

    return {
      kind: 'graph',
      id: stableId('trig-compound-expand', input.seed, `${fn}-${a}-${sign}`),
      topicId: 'graph_trigonometry',
      difficulty: input.difficulty,
      seed: input.seed,
      generatorParams: { kind: 'compound_angle_expand' },
      promptText,
      promptKatex,
      katexQuestion: '',
      katexOptions: shuffled,
      correctIndex,
      svgDataUrl: '',
      svgAltText: 'A trigonometry compound-angle expansion multiple-choice question.',
      katexExplanation: {
        steps,
        summary: 'Use the correct compound-angle formula and substitute the special-angle exact values.',
      },
    };
  }

  if (variant === 'exact_value_identities') {
    // Exact value from trig sum/diff identities like sinA cosB ± cosA sinB.
    const baseAngles = [15, 20, 25, 30, 35, 37, 40, 45, 50, 52, 60, 70, 75];
    const specials = [0, 30, 45, 60, 90, 120, 135, 150, 180];
    const useSinForm = rng.next() < 0.5;
    const plus = rng.next() < 0.5;

    let A = 20;
    let B = 70;
    let target = 90;
    let tries = 0;
    while (tries < 200) {
      tries += 1;
      A = baseAngles[rng.int(0, baseAngles.length - 1)]!;
      B = baseAngles[rng.int(0, baseAngles.length - 1)]!;
      target = plus ? A + B : A - B;
      if (specials.includes(Math.abs(target))) break;
    }
    const t = normDeg(target);
    const row = exactTrigDeg(t);
    // fallback to 90
    const resultRow = row ?? exactTrigDeg(90)!;

    const expr = (() => {
      if (useSinForm) {
        // sinA cosB ± cosA sinB = sin(A±B)
        return plus
          ? String.raw`\sin ${A}^\circ\cos ${B}^\circ+\cos ${A}^\circ\sin ${B}^\circ`
          : String.raw`\sin ${A}^\circ\cos ${B}^\circ-\cos ${A}^\circ\sin ${B}^\circ`;
      }
      // cosA cosB ± sinA sinB = cos(A∓B) or cos(A±B)
      return plus
        ? String.raw`\cos ${A}^\circ\cos ${B}^\circ+\sin ${A}^\circ\sin ${B}^\circ`
        : String.raw`\cos ${A}^\circ\cos ${B}^\circ-\sin ${A}^\circ\sin ${B}^\circ`;
    })();

    const correct = (() => {
      if (useSinForm) return resultRow.sin;
      // plus -> cos(A-B), minus -> cos(A+B)
      const angle = plus ? A - B : A + B;
      const rr = exactTrigDeg(angle);
      return (rr ?? resultRow).cos;
    })();

    const distractors: string[] = [];
    const alt1 = resultRow.cos;
    const alt2 = resultRow.tan;
    if (alt1 !== correct) distractors.push(alt1);
    if (alt2 !== correct && !distractors.includes(alt2)) distractors.push(alt2);
    // common: wrong sign
    if (correct.startsWith('-')) distractors.push(correct.slice(1));
    else if (correct !== '0') distractors.push(`-${correct}`);
    while (distractors.length < 3) distractors.push('0');

    const optionsRaw = [correct, distractors[0]!, distractors[1]!, distractors[2]!];
    const optionsUnique: string[] = [];
    for (const o of optionsRaw) if (!optionsUnique.includes(o)) optionsUnique.push(o);
    while (optionsUnique.length < 4) optionsUnique.push(optionsUnique[0]!);
    const shuffled = shuffle(rng, optionsUnique.slice(0, 4));
    const correctIndex = shuffled.indexOf(correct);

    const circle = circlePolylinePoints(1, 120);
    const pt = { x: Math.cos(degToRad(t)), y: Math.sin(degToRad(t)) };
    const graphSpec = {
      width: 560,
      height: 420,
      window: { xMin: -1.4, xMax: 1.4, yMin: -1.4, yMax: 1.4 },
      equalAspect: true,
      axisLabelX: '',
      axisLabelY: '',
      caption: '',
      plot: [
        { kind: 'polyline' as const, points: circle, stroke: '#111827', strokeWidth: 2 },
        { kind: 'point' as const, at: pt, r: 5, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1 },
      ],
    };

    const steps: Array<{ katex: string; text: string }> = [
      { katex: String.raw`\textbf{Spot the identity pattern}`, text: 'The expression matches a standard compound-angle identity.' },
      useSinForm
        ? {
          katex: plus
            ? String.raw`\sin A\cos B+\cos A\sin B=\sin(A+B)`
            : String.raw`\sin A\cos B-\cos A\sin B=\sin(A-B)`,
          text: 'Use the sine sum/difference identity.' ,
        }
        : {
          katex: plus
            ? String.raw`\cos A\cos B+\sin A\sin B=\cos(A-B)`
            : String.raw`\cos A\cos B-\sin A\sin B=\cos(A+B)`,
          text: 'Use the cosine sum/difference identity.' ,
        },
      { katex: String.raw`\Rightarrow\ ${expr}= ${useSinForm ? String.raw`\sin` : String.raw`\cos`}\,${normDeg(useSinForm ? target : (plus ? A - B : A + B))}^\circ`, text: 'Reduce to a single trig function at a special angle.' },
      { katex: String.raw`\boxed{=${correct}}`, text: 'Now use the exact special-angle value.' },
    ];

    return {
      kind: 'graph',
      id: stableId('trig-exact-identity', input.seed, `${useSinForm ? 'sin' : 'cos'}-${A}-${B}-${plus ? 'p' : 'm'}`),
      topicId: 'graph_trigonometry',
      difficulty: input.difficulty,
      seed: input.seed,
      generatorParams: { kind: 'exact_value_identities', graphInExplanationOnly: true },
      promptText: '',
      promptKatex: String.raw`\text{Without using a calculator, find the exact value of }${expr}.`,
      katexQuestion: '',
      katexOptions: shuffled,
      correctIndex,
      graphSpec,
      svgDataUrl: '',
      svgAltText: 'A unit circle diagram highlighting the resulting special angle.',
      katexExplanation: {
        steps,
        summary: 'Recognize the compound-angle identity pattern and reduce to a special angle.',
      },
    };
  }

  if (variant === 'given_cosx_compound') {
    // Given cos x = adjacent/hypotenuse with acute x, evaluate cos(x±a).
    const triples = [
      { adj: 4, opp: 3, hyp: 5 },
      { adj: 12, opp: 5, hyp: 13 },
      { adj: 15, opp: 8, hyp: 17 },
      { adj: 24, opp: 7, hyp: 25 },
    ];
    const t = triples[rng.int(0, triples.length - 1)]!;
    const aPool = [30, 45, 60];
    const a = aPool[rng.int(0, aPool.length - 1)]!;
    const sign = rng.next() < 0.5 ? 1 : -1;
    const op = sign > 0 ? '+' : '-';

    const cosx = String.raw`\frac{${t.adj}}{${t.hyp}}`;
    const sinx = String.raw`\frac{${t.opp}}{${t.hyp}}`;
    const lhs = String.raw`\cos\left(x${op}${a}^\circ\right)`;
    const cosA = exactTrigDeg(a)!.cos;
    const sinA = exactTrigDeg(a)!.sin;
    const correct = sign > 0
      ? String.raw`${cosx}\cdot${cosA}-${sinx}\cdot${sinA}`
      : String.raw`${cosx}\cdot${cosA}+${sinx}\cdot${sinA}`;

    const simplifiedCorrect = (() => {
      // cos(x+a)=cosx cos a - sinx sin a
      // cos(x-a)=cosx cos a + sinx sin a
      const denom = 2 * t.hyp;
      if (a === 60) {
        const n = `${t.adj}${sign > 0 ? '-' : '+'}${t.opp}\\sqrt{3}`;
        return String.raw`\frac{${n}}{${denom}}`;
      }
      if (a === 30) {
        const n = `${t.adj}\\sqrt{3}${sign > 0 ? '-' : '+'}${t.opp}`;
        return String.raw`\frac{${n}}{${denom}}`;
      }
      // 45
      const n = `${t.adj}${sign > 0 ? '-' : '+'}${t.opp}`;
      return String.raw`\frac{${n}\sqrt{2}}{${denom}}`;
    })();

    const wrong1 = (() => {
      const denom = 2 * t.hyp;
      if (a === 60) {
        const n = `${t.adj}${sign > 0 ? '+' : '-'}${t.opp}\\sqrt{3}`;
        return String.raw`\frac{${n}}{${denom}}`;
      }
      if (a === 30) {
        const n = `${t.adj}\\sqrt{3}${sign > 0 ? '+' : '-'}${t.opp}`;
        return String.raw`\frac{${n}}{${denom}}`;
      }
      const n = `${t.adj}${sign > 0 ? '+' : '-'}${t.opp}`;
      return String.raw`\frac{${n}\sqrt{2}}{${denom}}`;
    })();
    const wrong2 = (() => {
      const denom = 2 * t.hyp;
      if (a === 60) return String.raw`\frac{${t.adj}}{${denom}}`;
      if (a === 30) return String.raw`\frac{${t.opp}}{${denom}}`;
      return String.raw`\frac{${t.adj}\sqrt{2}}{${denom}}`;
    })();
    const wrong3 = (() => {
      const denom = 2 * t.hyp;
      if (a === 60) return String.raw`\frac{${t.opp}\sqrt{3}}{${denom}}`;
      if (a === 30) return String.raw`\frac{${t.adj}\sqrt{3}}{${denom}}`;
      return String.raw`\frac{${t.opp}\sqrt{2}}{${denom}}`;
    })();

    const optionsRaw = [simplifiedCorrect, wrong1, wrong2, wrong3];
    const optionsUnique: string[] = [];
    for (const o of optionsRaw) if (!optionsUnique.includes(o)) optionsUnique.push(o);
    while (optionsUnique.length < 4) optionsUnique.push(optionsUnique[0]!);
    const shuffled = shuffle(rng, optionsUnique.slice(0, 4));
    const correctIndex = shuffled.indexOf(simplifiedCorrect);

    const steps: Array<{ katex: string; text: string }> = [
      { katex: String.raw`\cos x = ${cosx},\quad 0^\circ<x<90^\circ`, text: 'Because x is acute, sinx is positive.' },
      { katex: String.raw`\sin x = \sqrt{1-\cos^2x}=\sqrt{1-\left(${cosx}\right)^2}=${sinx}`, text: 'Find sinx using sin²x+cos²x=1.' },
      { katex: sign > 0
        ? String.raw`\cos(x+a)=\cos x\cos a-\sin x\sin a`
        : String.raw`\cos(x-a)=\cos x\cos a+\sin x\sin a`,
      text: 'Use the cosine compound-angle identity.' },
      { katex: String.raw`\cos ${a}^\circ=${cosA},\quad \sin ${a}^\circ=${sinA}`, text: 'Use exact values for 60°.' },
      { katex: String.raw`${lhs}=${correct}=\boxed{${simplifiedCorrect}}`, text: 'Substitute and simplify.' },
    ];

    return {
      kind: 'graph',
      id: stableId('trig-given-cosx', input.seed, `${sign}-${a}`),
      topicId: 'graph_trigonometry',
      difficulty: input.difficulty,
      seed: input.seed,
      generatorParams: { kind: 'given_cosx_compound' },
      promptText: '',
      promptKatex: String.raw`\text{Given }\cos x=${cosx}\text{ and }0^\circ<x<90^\circ\text{, find the exact value of }${lhs}.`,
      katexQuestion: '',
      katexOptions: shuffled,
      correctIndex,
      svgDataUrl: '',
      svgAltText: 'A trigonometry compound-angle evaluation multiple-choice question.',
      katexExplanation: {
        steps,
        summary: 'Find sinx using sin²x+cos²x=1, then apply the compound-angle identity with exact special-angle values.',
      },
    };
  }

  if (variant === 'tan_add_sub_identity') {
    // Exact value using tan addition/subtraction identity.
    // (tanA ± tanB) / (1 ∓ tanA tanB) = tan(A ± B)
    const baseAngles = [15, 20, 25, 30, 35, 37, 40, 45, 50, 52, 60, 70, 75];
    const specials = tanResultAnglesDeg();
    const plus = rng.next() < 0.5;

    let A = 30;
    let B = 45;
    let tries = 0;
    while (tries < 250) {
      tries += 1;
      A = baseAngles[rng.int(0, baseAngles.length - 1)]!;
      B = baseAngles[rng.int(0, baseAngles.length - 1)]!;
      const t = plus ? A + B : A - B;
      if (specials.includes(normDeg(t))) break;
    }

    const target = normDeg(plus ? A + B : A - B);
    const tanTarget = exactTrigDeg(target)?.tan;
    const correct = tanTarget && tanTarget !== String.raw`\text{undefined}` ? tanTarget : '0';

    const top = plus
      ? String.raw`\tan ${A}^\circ+\tan ${B}^\circ`
      : String.raw`\tan ${A}^\circ-\tan ${B}^\circ`;
    const bottom = plus
      ? String.raw`1-\tan ${A}^\circ\tan ${B}^\circ`
      : String.raw`1+\tan ${A}^\circ\tan ${B}^\circ`;
    const expr = String.raw`\frac{${top}}{${bottom}}`;

    const wrongSign = correct.startsWith('-') ? correct.slice(1) : (correct !== '0' ? `-${correct}` : correct);
    const wrongAngle = exactTrigDeg(normDeg(plus ? A - B : A + B))?.tan ?? '0';
    const wrongReciprocal = correct === '1'
      ? '1'
      : correct === String.raw`\sqrt{3}`
        ? String.raw`\frac{\sqrt{3}}{3}`
        : correct === String.raw`-\sqrt{3}`
          ? String.raw`-\frac{\sqrt{3}}{3}`
          : correct === String.raw`\frac{\sqrt{3}}{3}`
            ? String.raw`\sqrt{3}`
            : correct === String.raw`-\frac{\sqrt{3}}{3}`
              ? String.raw`-\sqrt{3}`
              : correct === '0'
                ? '0'
                : correct;

    const optionsRaw = [correct, wrongSign, wrongAngle, wrongReciprocal];
    const optionsUnique: string[] = [];
    for (const o of optionsRaw) if (!optionsUnique.includes(o)) optionsUnique.push(o);
    while (optionsUnique.length < 4) optionsUnique.push(optionsUnique[0]!);
    const shuffled = shuffle(rng, optionsUnique.slice(0, 4));
    const correctIndex = shuffled.indexOf(correct);

    const steps: Array<{ katex: string; text: string }> = [
      { katex: String.raw`\textbf{Recognize the tan identity}`, text: 'This fraction is exactly the tan(A±B) formula.' },
      {
        katex: plus
          ? String.raw`\tan(A+B)=\frac{\tan A+\tan B}{1-\tan A\tan B}`
          : String.raw`\tan(A-B)=\frac{\tan A-\tan B}{1+\tan A\tan B}`,
        text: 'Use the correct version (plus or minus).' ,
      },
      { katex: String.raw`\Rightarrow\ ${expr}=\tan\left(${plus ? A + B : A - B}^\circ\right)`, text: 'Match A and B to the identity.' },
      { katex: String.raw`\boxed{=${correct}}`, text: 'Now use the exact special-angle value of tan.' },
    ];

    return {
      kind: 'graph',
      id: stableId('trig-tan-add', input.seed, `${plus ? 'p' : 'm'}-${A}-${B}`),
      topicId: 'graph_trigonometry',
      difficulty: input.difficulty,
      seed: input.seed,
      generatorParams: { kind: 'tan_add_sub_identity' },
      promptText: '',
      promptKatex: String.raw`\text{Without using a calculator, find the exact value of }${expr}.`,
      katexQuestion: '',
      katexOptions: shuffled,
      correctIndex,
      svgDataUrl: '',
      svgAltText: 'A trigonometry tangent addition/subtraction identity multiple-choice question.',
      katexExplanation: {
        steps,
        summary: 'Spot the tan(A±B) identity, rewrite the expression as tan of a special angle, then use the exact value.',
      },
    };
  }

  if (variant === 'sumdiff_from_given_ratios') {
    // Given two trig ratios (A and B) + quadrant constraints, find sin/cos/tan of A±B.
    // Use Pythagorean triples so all intermediate ratios are rational.
    const triples = [
      { opp: 3, adj: 4, hyp: 5 },
      { opp: 5, adj: 12, hyp: 13 },
      { opp: 8, adj: 15, hyp: 17 },
      { opp: 7, adj: 24, hyp: 25 },
      { opp: 20, adj: 21, hyp: 29 },
    ];

    const tA = triples[rng.int(0, triples.length - 1)]!;
    let tB = triples[rng.int(0, triples.length - 1)]!;
    if (tB === tA) tB = triples[(rng.int(0, triples.length - 1) + 1) % triples.length]!;

    const givenPool = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot'] as const;
    type GivenFn = (typeof givenPool)[number];
    const givenA: GivenFn = givenPool[rng.int(0, givenPool.length - 1)]!;
    const givenB: GivenFn = givenPool[rng.int(0, givenPool.length - 1)]!;

    // Two scenario templates (like the screenshot):
    // 1) A obtuse (Q2), B acute (Q1)
    // 2) A and B in same quadrant (Q3 or Q4) and given values may be negative
    const scenario = rng.next() < 0.5 ? 1 : 2;
    const quadA: 1 | 2 | 3 | 4 = scenario === 1 ? 2 : (rng.next() < 0.5 ? 3 : 4);
    const quadB: 1 | 2 | 3 | 4 = scenario === 1 ? 1 : quadA;

    const sA = signsFromQuadrant(quadA);
    const sB = signsFromQuadrant(quadB);

    const sinA = simplifySignedFrac(sA.sinSign * tA.opp, tA.hyp);
    const cosA = simplifySignedFrac(sA.cosSign * tA.adj, tA.hyp);
    const tanA = simplifySignedFrac(sA.tanSign * tA.opp, tA.adj);

    const sinB = simplifySignedFrac(sB.sinSign * tB.opp, tB.hyp);
    const cosB = simplifySignedFrac(sB.cosSign * tB.adj, tB.hyp);
    const tanB = simplifySignedFrac(sB.tanSign * tB.opp, tB.adj);

    const signStyle = (v: { n: number; d: number }) => signedFracLatex(v.n, v.d);

    const invFrac = (v: { n: number; d: number }) => {
      // Avoid division by 0 (should not happen for triangle-based ratios).
      if (!v.n) return { n: 0, d: 1 };
      return simplifySignedFrac(v.d, v.n);
    };

    const valueFor = (fn: GivenFn, sinV: { n: number; d: number }, cosV: { n: number; d: number }, tanV: { n: number; d: number }) => {
      if (fn === 'sin') return sinV;
      if (fn === 'cos') return cosV;
      if (fn === 'tan') return tanV;
      if (fn === 'sec') return invFrac(cosV);
      if (fn === 'csc') return invFrac(sinV);
      return invFrac(tanV);
    };

    const latexName = (fn: GivenFn) => {
      if (fn === 'sin') return String.raw`\sin`;
      if (fn === 'cos') return String.raw`\cos`;
      if (fn === 'tan') return String.raw`\tan`;
      if (fn === 'sec') return String.raw`\sec`;
      if (fn === 'csc') return String.raw`\csc`;
      return String.raw`\cot`;
    };

    const givenValA = valueFor(givenA, sinA, cosA, tanA);
    const givenValB = valueFor(givenB, sinB, cosB, tanB);

    const givenLatexA = String.raw`${latexName(givenA)} A=${signStyle(givenValA)}`;
    const givenLatexB = String.raw`${latexName(givenB)} B=${signStyle(givenValB)}`;

    const opPlus = rng.next() < 0.5;
    const askPool = ['sin', 'cos', 'tan'] as const;
    const ask = askPool[rng.int(0, askPool.length - 1)]!;
    const askLatex = ratioLatex(ask as any);
    const angleExpr = opPlus ? 'A+B' : 'A-B';

    const correctFrac = (() => {
      if (ask === 'sin') {
        // sin(A±B)=sinA cosB ± cosA sinB
        const left = mulFrac(sinA, cosB);
        const right = mulFrac(cosA, sinB);
        return opPlus ? addFrac(left, right) : subFrac(left, right);
      }
      if (ask === 'cos') {
        // cos(A±B)=cosA cosB ∓ sinA sinB
        const left = mulFrac(cosA, cosB);
        const right = mulFrac(sinA, sinB);
        return opPlus ? subFrac(left, right) : addFrac(left, right);
      }
      // tan(A±B) = (tanA ± tanB)/(1 ∓ tanA tanB)
      const num = opPlus ? addFrac(tanA, tanB) : subFrac(tanA, tanB);
      const prod = mulFrac(tanA, tanB);
      const one = { n: 1, d: 1 };
      const den = opPlus ? subFrac(one, prod) : addFrac(one, prod);
      return simplifySignedFrac(num.n * den.d, num.d * den.n);
    })();

    const correct = signStyle(correctFrac);

    const wrongSign = signStyle({ n: -correctFrac.n, d: correctFrac.d });
    const wrongOp = (() => {
      // Use the opposite identity sign (A-B instead of A+B or vice versa).
      const other = (() => {
        if (ask === 'sin') {
          const left = mulFrac(sinA, cosB);
          const right = mulFrac(cosA, sinB);
          return opPlus ? subFrac(left, right) : addFrac(left, right);
        }
        if (ask === 'cos') {
          const left = mulFrac(cosA, cosB);
          const right = mulFrac(sinA, sinB);
          return opPlus ? addFrac(left, right) : subFrac(left, right);
        }
        const num = opPlus ? subFrac(tanA, tanB) : addFrac(tanA, tanB);
        const prod = mulFrac(tanA, tanB);
        const one = { n: 1, d: 1 };
        const den = opPlus ? addFrac(one, prod) : subFrac(one, prod);
        return simplifySignedFrac(num.n * den.d, num.d * den.n);
      })();
      return signStyle(other);
    })();

    const wrongSimple = (() => {
      // Common incorrect simplification: multiply same functions.
      const alt = ask === 'sin'
        ? mulFrac(sinA, sinB)
        : ask === 'cos'
          ? mulFrac(cosA, cosB)
          : mulFrac(tanA, tanB);
      return signStyle(alt);
    })();

    const optionsRaw = [correct, wrongSign, wrongOp, wrongSimple];
    const optionsUnique: string[] = [];
    for (const o of optionsRaw) if (!optionsUnique.includes(o)) optionsUnique.push(o);
    while (optionsUnique.length < 4) optionsUnique.push(optionsUnique[0]!);
    const shuffled = shuffle(rng, optionsUnique.slice(0, 4));
    const correctIndex = shuffled.indexOf(correct);

    const formulaKatex = ask === 'sin'
      ? (opPlus
        ? String.raw`\sin(A+B)=\sin A\cos B+\cos A\sin B`
        : String.raw`\sin(A-B)=\sin A\cos B-\cos A\sin B`)
      : ask === 'cos'
        ? (opPlus
          ? String.raw`\cos(A+B)=\cos A\cos B-\sin A\sin B`
          : String.raw`\cos(A-B)=\cos A\cos B+\sin A\sin B`)
        : (opPlus
          ? String.raw`\tan(A+B)=\frac{\tan A+\tan B}{1-\tan A\tan B}`
          : String.raw`\tan(A-B)=\frac{\tan A-\tan B}{1+\tan A\tan B}`);

    // Simple visual: show a unit circle with one point in A's quadrant and one in B's quadrant.
    const repAngle = (q: 1 | 2 | 3 | 4) => (q === 1 ? 45 : q === 2 ? 135 : q === 3 ? 225 : 315);
    const pA = { x: Math.cos(degToRad(repAngle(quadA))), y: Math.sin(degToRad(repAngle(quadA))) };
    const pB = { x: Math.cos(degToRad(repAngle(quadB))), y: Math.sin(degToRad(repAngle(quadB))) };
    const graphSpec = {
      width: 560,
      height: 420,
      window: { xMin: -1.4, xMax: 1.4, yMin: -1.4, yMax: 1.4 },
      equalAspect: true,
      axisLabelX: '',
      axisLabelY: '',
      caption: '',
      plot: [
        { kind: 'polyline' as const, points: circlePolylinePoints(1, 120), stroke: '#111827', strokeWidth: 2 },
        { kind: 'point' as const, at: pA, r: 5, fill: '#2563eb', stroke: '#1e3a8a', strokeWidth: 1 },
        { kind: 'point' as const, at: pB, r: 5, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1 },
      ],
    };

    const steps: Array<{ katex: string; text: string }> = [
      { katex: String.raw`\textbf{1) Use the quadrants to decide signs}`, text: 'Quadrants tell you whether sin and cos are positive or negative.' },
      { katex: String.raw`\text{Quadrant }${quadA}:\ \sin A\text{ is }${sA.sinSign < 0 ? '\\text{negative}' : '\\text{positive}'},\ \cos A\text{ is }${sA.cosSign < 0 ? '\\text{negative}' : '\\text{positive}'}.`, text: 'So you know the signs for A.' },
      { katex: String.raw`\text{Quadrant }${quadB}:\ \sin B\text{ is }${sB.sinSign < 0 ? '\\text{negative}' : '\\text{positive}'},\ \cos B\text{ is }${sB.cosSign < 0 ? '\\text{negative}' : '\\text{positive}'}.`, text: 'So you know the signs for B.' },
      { katex: String.raw`\sin A=${signStyle(sinA)},\ \cos A=${signStyle(cosA)},\ \tan A=${signStyle(tanA)}`, text: 'Write down the trig ratios for A (including sign).' },
      { katex: String.raw`\sin B=${signStyle(sinB)},\ \cos B=${signStyle(cosB)},\ \tan B=${signStyle(tanB)}`, text: 'Write down the trig ratios for B (including sign).' },
      { katex: String.raw`\textbf{2) Apply the correct sum/difference identity}`, text: 'Now substitute into the identity for sin/cos/tan of A±B.' },
      { katex: formulaKatex, text: 'This is the identity we use.' },
      { katex: String.raw`\boxed{${askLatex}\left(${angleExpr}\right)=${correct}}`, text: 'Substitute and simplify.' },
    ];

    const promptKatex = String.raw`\text{Given }${givenLatexA}\text{ and }${givenLatexB}\text{, where }A\text{ is in quadrant }${quadA}\text{ and }B\text{ is in quadrant }${quadB}\text{, find }${askLatex}\left(${angleExpr}\right).`;

    return {
      kind: 'graph',
      id: stableId('trig-sumdiff-ratios', input.seed, `${ask}-${opPlus ? 'p' : 'm'}-${quadA}-${quadB}`),
      topicId: 'graph_trigonometry',
      difficulty: input.difficulty,
      seed: input.seed,
      generatorParams: { kind: 'sumdiff_from_given_ratios', graphInExplanationOnly: true },
      promptText: '',
      promptKatex,
      katexQuestion: '',
      katexOptions: shuffled,
      correctIndex,
      graphSpec,
      svgDataUrl: '',
      svgAltText: 'A unit circle with two points indicating the quadrants of A and B.',
      katexExplanation: {
        steps,
        summary: 'Use quadrant signs, then apply the correct sum/difference identity and simplify.',
      },
    };
  }

  if (variant === 'exact_values_special_angles') {
    // Exact values of sec/csc/cot at special angles.
    // Output is numeric decimal because user must convert pi-angle to decimal radians.
    const angles = [
      { theta: 0, thetaLatex: '0' },
      { theta: Math.PI / 6, thetaLatex: String.raw`\frac{\pi}{6}` },
      { theta: Math.PI / 4, thetaLatex: String.raw`\frac{\pi}{4}` },
      { theta: Math.PI / 3, thetaLatex: String.raw`\frac{\pi}{3}` },
      { theta: Math.PI / 2, thetaLatex: String.raw`\frac{\pi}{2}` },
      { theta: (2 * Math.PI) / 3, thetaLatex: String.raw`\frac{2\pi}{3}` },
      { theta: (4 * Math.PI) / 3, thetaLatex: String.raw`\frac{4\pi}{3}` },
      { theta: (5 * Math.PI) / 6, thetaLatex: String.raw`\frac{5\pi}{6}` },
      { theta: Math.PI, thetaLatex: String.raw`\pi` },
      { theta: (7 * Math.PI) / 4, thetaLatex: String.raw`\frac{7\pi}{4}` },
      { theta: (5 * Math.PI) / 4, thetaLatex: String.raw`\frac{5\pi}{4}` },
      { theta: (3 * Math.PI) / 2, thetaLatex: String.raw`\frac{3\pi}{2}` },
      { theta: (11 * Math.PI) / 6, thetaLatex: String.raw`\frac{11\pi}{6}` },
      { theta: (-Math.PI) / 6, thetaLatex: String.raw`-\frac{\pi}{6}` },
      { theta: (-Math.PI) / 4, thetaLatex: String.raw`-\frac{\pi}{4}` },
      { theta: (-Math.PI) / 3, thetaLatex: String.raw`-\frac{\pi}{3}` },
    ];

    const fnPool = (['sec', 'csc', 'cot'] as const);
    const fn = fnPool[rng.int(0, fnPool.length - 1)]!;
    const a = angles[rng.int(0, angles.length - 1)]!;

    const value = (() => {
      const t = a.theta;
      if (fn === 'sec') return 1 / Math.cos(t);
      if (fn === 'csc') return 1 / Math.sin(t);
      return 1 / Math.tan(t);
    })();

    // Ensure value is finite (avoid cot(0), etc)
    if (!Number.isFinite(value)) {
      // deterministic fallback
      const t = Math.PI / 3;
      const v = fn === 'sec' ? 1 / Math.cos(t) : fn === 'csc' ? 1 / Math.sin(t) : 1 / Math.tan(t);
      a.theta = t as any;
      (a as any).thetaLatex = String.raw`\frac{\pi}{3}`;
      (a as any).value = v;
    }

    const thetaDec = toSigFigsNumber(a.theta, 4);
    const ansDec = toSigFigsNumber(Number((a as any).value ?? value), 4);

    const fnLatex = fn === 'sec' ? String.raw`\sec` : fn === 'csc' ? String.raw`\csc` : String.raw`\cot`;
    const fnPlain = fn === 'sec' ? 'sec' : fn === 'csc' ? 'csc' : 'cot';
    const qKatex = String.raw`\text{Given }\theta=${a.thetaLatex}\text{, find }${fnLatex}(\theta)\text{.}`;

    const circle = circlePolylinePoints(1, 120);
    const pt = { x: Math.cos(a.theta), y: Math.sin(a.theta) };
    const graphSpec = {
      width: 560,
      height: 420,
      window: { xMin: -1.4, xMax: 1.4, yMin: -1.4, yMax: 1.4 },
      equalAspect: true,
      axisLabelX: '',
      axisLabelY: '',
      caption: '',
      plot: [
        { kind: 'polyline' as const, points: circle, stroke: '#111827', strokeWidth: 2 },
        { kind: 'point' as const, at: pt, r: 5, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1 },
      ],
    };

    return {
      kind: 'graph',
      id: stableId('trig-exact-special', input.seed, `${fn}-${thetaDec}`),
      topicId: 'graph_trigonometry',
      difficulty: input.difficulty,
      seed: input.seed,
      generatorParams: {
        kind: 'exact_values_special_angles',
        graphInExplanationOnly: true,
        expectedParts: [thetaDec, ansDec],
        expectedUnit: 'rad',
        expectedFormat: 'sigfig_4',
        expectedTolerance: 0.001,
        expectedForbidPi: true,
      },
      promptText: '',
      promptKatex: qKatex,
      katexQuestion: '',
      inputFields: [
        { id: 'theta', label: 'θ (decimal radians, 4 s.f.)', kind: 'number' },
        { id: 'val', label: `${fnPlain}(θ) value (decimal, 4 s.f.)`, kind: 'number' },
      ],
      graphSpec,
      svgDataUrl: '',
      svgAltText: 'A unit circle with the angle point marked.',
      katexExplanation: {
        steps: [
          { katex: String.raw`\textbf{1) Convert the angle to decimal radians}`, text: 'You were given the angle in terms of π. Convert it to a decimal (4 s.f.) because this question requires a decimal radian input.' },
          { katex: String.raw`\theta = ${a.thetaLatex} \approx ${thetaDec}`, text: 'This is the decimal radian measure you should type for θ.' },
          { katex: String.raw`\textbf{2) Use the unit circle idea}`, text: 'On the unit circle, the point at angle θ is (cosθ, sinθ).' },
          { katex: String.raw`(x,y)=(\cos\theta,\sin\theta)`, text: 'So once you know cosθ and sinθ, you can get sec, csc, or cot by reciprocals/ratios.' },
          { katex: fn === 'sec'
            ? String.raw`\sec\theta=\frac{1}{\cos\theta}`
            : fn === 'csc'
              ? String.raw`\csc\theta=\frac{1}{\sin\theta}`
              : String.raw`\cot\theta=\frac{\cos\theta}{\sin\theta}`, text: 'Use the correct definition.' },
          { katex: String.raw`\textbf{3) Read the sign from the graph}`, text: 'The point on the unit circle shows whether cosθ (x) and sinθ (y) are positive/negative, which determines the sign of the answer.' },
          { katex: String.raw`\boxed{\theta\approx ${thetaDec}\text{ and }${fnLatex}(\theta)\approx ${ansDec}}`, text: 'Enter both numbers (any order is accepted).' },
        ],
        summary: 'Convert the π-angle to decimal radians (4 s.f.), then use unit-circle definitions of sec/csc/cot and the quadrant sign.' ,
      },
    };
  }

  if (variant === 'solve_trig_equation') {
    // Solve a trig equation in a given domain.
    // Answers must be entered in decimal radians (4 s.f.), no pi.
    const twoPi = Math.PI * 2;
    const domain = { min: 0, max: twoPi };

    type EqKind = 'sin' | 'cos' | 'tan';
    const eqPool: EqKind[] = input.difficulty === 'medium'
      ? ['sin', 'cos']
      : ['sin', 'cos', 'tan'];
    const eq = eqPool[rng.int(0, eqPool.length - 1)]!;

    const makeTargets = () => {
      // Choose values that yield clean exact solutions.
      if (eq === 'sin') {
        const vals = [
          0,
          0.5,
          -0.5,
          Math.sqrt(2) / 2,
          -Math.sqrt(2) / 2,
          Math.sqrt(3) / 2,
          -Math.sqrt(3) / 2,
        ];
        return vals[rng.int(0, vals.length - 1)]!;
      }
      if (eq === 'cos') {
        const vals = [
          0.5,
          -0.5,
          Math.sqrt(2) / 2,
          -Math.sqrt(2) / 2,
          Math.sqrt(3) / 2,
          -Math.sqrt(3) / 2,
          0,
          -1,
          1,
        ];
        return vals[rng.int(0, vals.length - 1)]!;
      }
      // tan
      const vals = [
        0,
        1,
        -1,
        Math.sqrt(3),
        -Math.sqrt(3),
        Math.sqrt(3) / 3,
        -Math.sqrt(3) / 3,
        2,
        -2,
      ];
      return vals[rng.int(0, vals.length - 1)]!;
    };

    const k = makeTargets();

    const solutions = (() => {
      const out: number[] = [];
      const addInDomain = (x: number) => {
        const v = ((x % twoPi) + twoPi) % twoPi;
        if (v < domain.min - 1e-10 || v > domain.max + 1e-10) return;
        for (const e of out) if (Math.abs(e - v) < 1e-6) return;
        out.push(v);
      };

      if (eq === 'sin') {
        const a = Math.asin(Math.max(-1, Math.min(1, k)));
        addInDomain(a);
        addInDomain(Math.PI - a);
      } else if (eq === 'cos') {
        const a = Math.acos(Math.max(-1, Math.min(1, k)));
        addInDomain(a);
        addInDomain(twoPi - a);
      } else {
        const a = Math.atan(k);
        addInDomain(a);
        addInDomain(a + Math.PI);
      }
      return out.sort((x, y) => x - y);
    })();

    // For tan, avoid vertical asymptotes dominating view by clipping.
    const fn = (x: number) => {
      if (eq === 'sin') return Math.sin(x);
      if (eq === 'cos') return Math.cos(x);
      return Math.tan(x);
    };

    const yClip = eq === 'tan' ? 6 : 1.5;
    const segs = sampleFunctionPoints({ fn, xMin: domain.min, xMax: domain.max, yClip, n: 360 });
    const plotCurves = segs.map((pts) => ({ kind: 'polyline' as const, points: pts, stroke: '#2563eb', strokeWidth: 2 }));

    const graphSpec = {
      width: 720,
      height: 420,
      window: { xMin: 0, xMax: twoPi, yMin: -yClip, yMax: yClip },
      axisLabelX: '',
      axisLabelY: '',
      caption: '',
      plot: [
        ...plotCurves,
        { kind: 'function' as const, fn: (_x: number) => k, stroke: '#dc2626', strokeWidth: 2, yClip },
        ...solutions.map((x) => ({ kind: 'point' as const, at: { x, y: k }, r: 4, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1 })),
      ],
    };

    const fnLatex = eq === 'sin' ? String.raw`\sin` : eq === 'cos' ? String.raw`\cos` : String.raw`\tan`;
    const qKatex = String.raw`\text{Solve }${fnLatex}\,x = ${toSigFigsNumber(k, 4)}\text{ for }0\le x\le 2\pi\text{.}`;

    const expectedParts = solutions.map((x) => toSigFigsNumber(x, 4));

    return {
      kind: 'graph',
      id: stableId('trig-solve', input.seed, `${eq}-${toSigFigsNumber(k, 4)}`),
      topicId: 'graph_trigonometry',
      difficulty: input.difficulty,
      seed: input.seed,
      generatorParams: {
        kind: 'solve_trig_equation',
        graphInExplanationOnly: true,
        expectedParts,
        expectedUnit: 'rad',
        expectedFormat: 'sigfig_4',
        expectedTolerance: 0.001,
        expectedForbidPi: true,
      },
      promptText: '',
      promptKatex: qKatex,
      katexQuestion: '',
      inputFields: expectedParts.map((_, i) => ({ id: `x${i + 1}`, label: `x${i + 1} (rad, 4 s.f.)`, kind: 'number' as const })),
      graphSpec,
      svgDataUrl: '',
      svgAltText: 'A trigonometry function graph with solution points highlighted.',
      katexExplanation: {
        steps: [
          { katex: String.raw`\textbf{1) Think “intersection”}`, text: 'Solving trig equations is finding where the curve y=f(x) meets the horizontal line y=k.' },
          { katex: String.raw`y=${fnLatex}\,x\quad\text{and}\quad y=${toSigFigsNumber(k, 4)}`, text: 'These are the two graphs being compared.' },
          { katex: String.raw`\textbf{2) Use the graph to count solutions}`, text: 'On 0 to 2π, sine and cosine typically give 0, 1, or 2 solutions; tangent can give 0, 1, or 2 depending on k.' },
          { katex: String.raw`\textbf{3) Read the x-values}`, text: 'Each intersection point gives an x-value. The graph labels show the solution x-values in decimal radians.' },
          { katex: String.raw`\boxed{${expectedParts.map((x) => String(x)).join(',\ ')}}`, text: 'Enter all solutions (any order).' },
        ],
        summary: 'Draw/interpret y=f(x) and y=k on the given domain; the intersection x-values are the solutions. Enter decimal radians (4 s.f.).',
        commonMistake: { katex: String.raw`\text{Missing a solution}`, text: 'A common mistake is to stop after the first intersection. Always scan the full 0 to 2π range.' },
      },
    };
  }

  if (variant === 'identity_simplify') {
    const fmtTrigPow = (name: 'sin' | 'cos', exp: number): string => {
      if (exp === 0) return '';
      const base = name === 'sin' ? String.raw`\sin\theta` : String.raw`\cos\theta`;
      if (exp === 1) return base;
      return name === 'sin' ? String.raw`\sin^{${exp}}\theta` : String.raw`\cos^{${exp}}\theta`;
    };

    const joinFactors = (factors: string[]): string => {
      const xs = factors.map((s) => String(s ?? '').trim()).filter(Boolean);
      if (!xs.length) return String.raw`1`;
      if (xs.length === 1) return xs[0]!;
      return xs.join(String.raw`\,`);
    };

    const makeWrongPool = (correct: string) => {
      const pool = [
        String.raw`\sin\theta`,
        String.raw`\cos\theta`,
        String.raw`\tan\theta`,
        String.raw`\cot\theta`,
        String.raw`\sec\theta`,
        String.raw`\csc\theta`,
        String.raw`\sin^2\theta`,
        String.raw`\cos^2\theta`,
        String.raw`\tan^2\theta`,
        String.raw`\cot^2\theta`,
        String.raw`\sec^2\theta`,
        String.raw`\csc^2\theta`,
        String.raw`=0`,
        String.raw`=1`,
        String.raw`=\sin\theta`,
        String.raw`=\cos\theta`,
        String.raw`=\tan\theta`,
        String.raw`=\cot\theta`,
        String.raw`=\sec\theta`,
        String.raw`=\csc\theta`,
        String.raw`=\sin^2\theta`,
        String.raw`=\cos^2\theta`,
        String.raw`=\tan^2\theta`,
        String.raw`=\cot^2\theta`,
      ];
      return pool.filter((x) => x !== correct);
    };

    const pickDistinct = (pool: string[], count: number, avoid: Set<string>) => {
      const out: string[] = [];
      let tries = 0;
      while (out.length < count && tries < 200) {
        tries += 1;
        const v = pool[rng.int(0, pool.length - 1)]!;
        if (avoid.has(v)) continue;
        avoid.add(v);
        out.push(v);
      }
      while (out.length < count) out.push(pool[0]!);
      return out;
    };

    const templates: Array<() => {
      lhs: string;
      rhs: string;
      steps: Array<{ katex: string; text: string }>;
      wrong: string[];
    }> = [
      () => {
        const p = rng.int(1, 8);
        const sinP = trigPow('sin', p);
        const lhs = String.raw`\frac{${sinP}}{\csc\theta}`;
        const rhs = trigPowValue('sin', p + 1);
        const wrong = [
          trigPowValue('sin', p),
          trigPowValue('sin', Math.max(0, p - 1)),
          trigPowValue('csc', p + 1),
        ].filter((x) => x !== rhs);
        const steps = [
          { katex: String.raw`\text{Goal: simplify }${lhs}.`, text: 'We will rewrite everything using basic trig identities.' },
          { katex: String.raw`\csc\theta = \frac{1}{\sin\theta}`, text: 'Use the reciprocal identity for cosecant.' },
          { katex: String.raw`${lhs}=\frac{${sinP}}{\frac{1}{\sin\theta}}`, text: 'Substitute cscθ into the expression.' },
          { katex: String.raw`\frac{1}{\frac{1}{\sin\theta}}=\sin\theta`, text: 'Dividing by a fraction means multiplying by its reciprocal.' },
          { katex: String.raw`\frac{${sinP}}{\frac{1}{\sin\theta}}=${sinP}\cdot\sin\theta`, text: 'Rewrite as a product.' },
          { katex: String.raw`${sinP}\cdot\sin\theta=\sin^{${p + 1}}\theta`, text: 'Multiply same-base powers: add exponents.' },
          { katex: String.raw`\boxed{${lhs}=${rhs}}`, text: 'So this is the simplified form.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const p = rng.int(1, 8);
        const cosP = trigPow('cos', p);
        const lhs = String.raw`\frac{${cosP}}{\sec\theta}`;
        const rhs = trigPowValue('cos', p + 1);
        const wrong = [
          trigPowValue('cos', p),
          trigPowValue('cos', Math.max(0, p - 1)),
          trigPowValue('sec', p + 1),
        ].filter((x) => x !== rhs);
        const steps = [
          { katex: String.raw`\text{Goal: simplify }${lhs}.`, text: 'We will rewrite everything using basic trig identities.' },
          { katex: String.raw`\sec\theta = \frac{1}{\cos\theta}`, text: 'Use the reciprocal identity for secant.' },
          { katex: String.raw`${lhs}=\frac{${cosP}}{\frac{1}{\cos\theta}}`, text: 'Substitute secθ into the expression.' },
          { katex: String.raw`\frac{1}{\frac{1}{\cos\theta}}=\cos\theta`, text: 'Dividing by a fraction means multiplying by its reciprocal.' },
          { katex: String.raw`\frac{${cosP}}{\frac{1}{\cos\theta}}=${cosP}\cdot\cos\theta`, text: 'Rewrite as a product.' },
          { katex: String.raw`${cosP}\cdot\cos\theta=\cos^{${p + 1}}\theta`, text: 'Multiply same-base powers: add exponents.' },
          { katex: String.raw`\boxed{${lhs}=${rhs}}`, text: 'So this is the simplified form.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const useSin = rng.next() < 0.5;
        const lhs = useSin ? String.raw`1-\cos^2\theta` : String.raw`1-\sin^2\theta`;
        const rhs = useSin ? String.raw`=\sin^2\theta` : String.raw`=\cos^2\theta`;
        const wrong = useSin
          ? [String.raw`=\cos^2\theta`, String.raw`=\sin\theta`, String.raw`=\tan^2\theta`]
          : [String.raw`=\sin^2\theta`, String.raw`=\cos\theta`, String.raw`=\cot^2\theta`];
        const steps = useSin
          ? [
            { katex: String.raw`\sin^2\theta+\cos^2\theta=1`, text: 'Start from the Pythagorean identity.' },
            { katex: String.raw`1-\cos^2\theta=\sin^2\theta`, text: 'Subtract cos²θ from both sides.' },
            { katex: String.raw`\boxed{1-\cos^2\theta=\sin^2\theta}`, text: 'This is the simplified form.' },
          ]
          : [
            { katex: String.raw`\sin^2\theta+\cos^2\theta=1`, text: 'Start from the Pythagorean identity.' },
            { katex: String.raw`1-\sin^2\theta=\cos^2\theta`, text: 'Subtract sin²θ from both sides.' },
            { katex: String.raw`\boxed{1-\sin^2\theta=\cos^2\theta}`, text: 'This is the simplified form.' },
          ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const lhs = String.raw`\sec^2\theta-1`;
        const rhs = String.raw`\tan^2\theta`;
        const wrong = [String.raw`\cot^2\theta`, String.raw`\sec\theta`, String.raw`\sin^2\theta`];
        const steps = [
          { katex: String.raw`\text{Goal: rewrite }\sec^2\theta-1\text{ in a simpler form.}`, text: 'We will use a standard Pythagorean identity.' },
          { katex: String.raw`1+\tan^2\theta=\sec^2\theta`, text: 'Recall the identity connecting tan and sec.' },
          { katex: String.raw`\sec^2\theta-1=\tan^2\theta`, text: 'Subtract 1 from both sides.' },
          { katex: String.raw`\boxed{\sec^2\theta-1=\tan^2\theta}`, text: 'So the expression simplifies to tan²θ.' },
          { katex: String.raw`\text{(Optional check)}\;\sec^2\theta=\frac{1}{\cos^2\theta},\;\tan^2\theta=\frac{\sin^2\theta}{\cos^2\theta}`, text: 'You can also verify by writing everything in terms of sin and cos.' },
          { katex: String.raw`\frac{1}{\cos^2\theta}-1=\frac{1-\cos^2\theta}{\cos^2\theta}=\frac{\sin^2\theta}{\cos^2\theta}=\tan^2\theta`, text: 'This confirms the identity by direct algebra.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const lhs = String.raw`\csc^2\theta-1`;
        const rhs = String.raw`\cot^2\theta`;
        const wrong = [String.raw`\tan^2\theta`, String.raw`\csc\theta`, String.raw`\cos^2\theta`];
        const steps = [
          { katex: String.raw`\text{Goal: rewrite }\csc^2\theta-1\text{ in a simpler form.}`, text: 'We will use a standard Pythagorean identity.' },
          { katex: String.raw`1+\cot^2\theta=\csc^2\theta`, text: 'Recall the identity connecting cot and csc.' },
          { katex: String.raw`\csc^2\theta-1=\cot^2\theta`, text: 'Subtract 1 from both sides.' },
          { katex: String.raw`\boxed{\csc^2\theta-1=\cot^2\theta}`, text: 'So the expression simplifies to cot²θ.' },
          { katex: String.raw`\text{(Optional check)}\;\csc^2\theta=\frac{1}{\sin^2\theta},\;\cot^2\theta=\frac{\cos^2\theta}{\sin^2\theta}`, text: 'You can also verify by writing everything in terms of sin and cos.' },
          { katex: String.raw`\frac{1}{\sin^2\theta}-1=\frac{1-\sin^2\theta}{\sin^2\theta}=\frac{\cos^2\theta}{\sin^2\theta}=\cot^2\theta`, text: 'This confirms the identity by direct algebra.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const p = rng.int(1, 6);
        const tanP = trigPow('tan', p);
        const secP = trigPow('sec', p);
        const lhs = String.raw`\frac{${tanP}}{${secP}}`;
        const rhs = trigPow('sin', p);
        const wrong = [trigPow('cos', p), trigPow('tan', p), trigPow('sec', p)].filter((x) => x !== rhs);
        const steps = [
          { katex: String.raw`\text{Goal: simplify }${lhs}.`, text: 'Rewrite tan and sec using sin and cos, then simplify.' },
          { katex: String.raw`\tan\theta=\frac{\sin\theta}{\cos\theta}`, text: 'Use the quotient identity for tangent.' },
          { katex: String.raw`\sec\theta=\frac{1}{\cos\theta}`, text: 'Use the reciprocal identity for secant.' },
          { katex: String.raw`\tan^{${p}}\theta=\left(\frac{\sin\theta}{\cos\theta}\right)^{${p}}`, text: 'Raise both sides to the power p.' },
          { katex: String.raw`\sec^{${p}}\theta=\left(\frac{1}{\cos\theta}\right)^{${p}}`, text: 'Raise both sides to the power p.' },
          { katex: String.raw`${lhs}=\frac{\left(\frac{\sin\theta}{\cos\theta}\right)^{${p}}}{\left(\frac{1}{\cos\theta}\right)^{${p}}}`, text: 'Substitute into the original expression.' },
          { katex: String.raw`=\left(\frac{\sin\theta}{\cos\theta}\right)^{${p}}\cdot\left(\cos\theta\right)^{${p}}`, text: 'Dividing by (1/cosθ)^p is multiplying by (cosθ)^p.' },
          { katex: String.raw`=${trigPowValue('sin', p)}`, text: 'The cos^p factors cancel, leaving sin^pθ.' },
          { katex: String.raw`\boxed{${lhs}=${rhs}}`, text: 'So this is the simplified form.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const p = rng.int(1, 6);
        const cotP = trigPow('cot', p);
        const cscP = trigPow('csc', p);
        const lhs = String.raw`\frac{${cotP}}{${cscP}}`;
        const rhs = trigPow('cos', p);
        const wrong = [trigPow('sin', p), trigPow('cot', p), trigPow('csc', p)].filter((x) => x !== rhs);
        const steps = [
          { katex: String.raw`\text{Goal: simplify }${lhs}.`, text: 'Rewrite cot and csc using sin and cos, then simplify.' },
          { katex: String.raw`\cot\theta=\frac{\cos\theta}{\sin\theta}`, text: 'Use the quotient identity for cotangent.' },
          { katex: String.raw`\csc\theta=\frac{1}{\sin\theta}`, text: 'Use the reciprocal identity for cosecant.' },
          { katex: String.raw`\cot^{${p}}\theta=\left(\frac{\cos\theta}{\sin\theta}\right)^{${p}}`, text: 'Raise both sides to the power p.' },
          { katex: String.raw`\csc^{${p}}\theta=\left(\frac{1}{\sin\theta}\right)^{${p}}`, text: 'Raise both sides to the power p.' },
          { katex: String.raw`${lhs}=\frac{\left(\frac{\cos\theta}{\sin\theta}\right)^{${p}}}{\left(\frac{1}{\sin\theta}\right)^{${p}}}`, text: 'Substitute into the original expression.' },
          { katex: String.raw`=\left(\frac{\cos\theta}{\sin\theta}\right)^{${p}}\cdot\left(\sin\theta\right)^{${p}}`, text: 'Dividing by (1/sinθ)^p is multiplying by (sinθ)^p.' },
          { katex: String.raw`=${trigPowValue('cos', p)}`, text: 'The sin^p factors cancel, leaving cos^pθ.' },
          { katex: String.raw`\boxed{${lhs}=${rhs}}`, text: 'So this is the simplified form.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const a = rng.int(2, 9);
        const b = rng.int(2, 9);
        const c = rng.int(1, a - 1);
        const d = rng.int(1, b - 1);
        const lhs = String.raw`\frac{\sin^{${a}}\theta\,\cos^{${b}}\theta}{\sin^{${c}}\theta\,\cos^{${d}}\theta}`;
        const sExp = a - c;
        const cExp = b - d;
        const rhs = trigProduct([
          { fn: 'sin', exp: sExp },
          { fn: 'cos', exp: cExp },
        ]);
        const wrong = [
          trigProduct([{ fn: 'sin', exp: a - c }, { fn: 'cos', exp: b + d }]),
          trigProduct([{ fn: 'sin', exp: a + c }, { fn: 'cos', exp: b - d }]),
          trigProduct([{ fn: 'sin', exp: a - c }, { fn: 'cos', exp: b - d - 1 }]),
        ].filter((x) => x !== rhs);
        const steps = [
          { katex: String.raw`\text{Goal: simplify }\frac{\sin^{${a}}\theta\,\cos^{${b}}\theta}{\sin^{${c}}\theta\,\cos^{${d}}\theta}.`, text: 'We will simplify by canceling common factors using index rules.' },
          { katex: String.raw`\frac{A\cdot B}{C\cdot D}=\frac{A}{C}\cdot\frac{B}{D}`, text: 'Split the fraction into two parts (sin-part and cos-part).' },
          { katex: String.raw`\frac{\sin^{${a}}\theta\,\cos^{${b}}\theta}{\sin^{${c}}\theta\,\cos^{${d}}\theta}=\frac{\sin^{${a}}\theta}{\sin^{${c}}\theta}\cdot\frac{\cos^{${b}}\theta}{\cos^{${d}}\theta}`, text: 'Apply the split to this expression.' },
          { katex: String.raw`\frac{\sin^{${a}}\theta}{\sin^{${c}}\theta}=\sin^{${a - c}}\theta`, text: 'Divide same-base powers by subtracting exponents.' },
          { katex: String.raw`\frac{\cos^{${b}}\theta}{\cos^{${d}}\theta}=\cos^{${b - d}}\theta`, text: 'Do the same for cosθ.' },
          { katex: rhs, text: 'Multiply the simplified factors together.' },
          { katex: String.raw`\boxed{\frac{\sin^{${a}}\theta\,\cos^{${b}}\theta}{\sin^{${c}}\theta\,\cos^{${d}}\theta}=${rhs}}`, text: 'So this is the simplified form.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const lhs = String.raw`(\sec\theta-\tan\theta)(\sec\theta+\tan\theta)`;
        const rhs = String.raw`1`;
        const wrong = [String.raw`0`, String.raw`\sec^2\theta+\tan^2\theta`, String.raw`\sec\theta+\tan\theta`];
        const steps = [
          { katex: String.raw`\text{Goal: simplify }(\sec\theta-\tan\theta)(\sec\theta+\tan\theta).`, text: 'This is set up for a difference-of-squares expansion.' },
          { katex: String.raw`(a-b)(a+b)=a^2-b^2`, text: 'Use the identity for the product of conjugates.' },
          { katex: String.raw`(\sec\theta-\tan\theta)(\sec\theta+\tan\theta)=\sec^2\theta-\tan^2\theta`, text: 'Substitute a=secθ and b=tanθ.' },
          { katex: String.raw`1+\tan^2\theta=\sec^2\theta`, text: 'Recall the Pythagorean identity relating tan and sec.' },
          { katex: String.raw`\sec^2\theta-\tan^2\theta=1`, text: 'Rearrange by subtracting tan²θ from both sides.' },
          { katex: String.raw`\boxed{(\sec\theta-\tan\theta)(\sec\theta+\tan\theta)=1}`, text: 'So the expression simplifies to 1.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const lhs = String.raw`(\csc\theta-\cot\theta)(\csc\theta+\cot\theta)`;
        const rhs = String.raw`1`;
        const wrong = [String.raw`0`, String.raw`\csc^2\theta+\cot^2\theta`, String.raw`\csc\theta+\cot\theta`];
        const steps = [
          { katex: String.raw`\text{Goal: simplify }(\csc\theta-\cot\theta)(\csc\theta+\cot\theta).`, text: 'This is a product of conjugates.' },
          { katex: String.raw`(a-b)(a+b)=a^2-b^2`, text: 'Use the identity for the product of conjugates.' },
          { katex: String.raw`(\csc\theta-\cot\theta)(\csc\theta+\cot\theta)=\csc^2\theta-\cot^2\theta`, text: 'Substitute a=cscθ and b=cotθ.' },
          { katex: String.raw`1+\cot^2\theta=\csc^2\theta`, text: 'Recall the Pythagorean identity relating cot and csc.' },
          { katex: String.raw`\csc^2\theta-\cot^2\theta=1`, text: 'Rearrange by subtracting cot²θ from both sides.' },
          { katex: String.raw`\boxed{(\csc\theta-\cot\theta)(\csc\theta+\cot\theta)=1}`, text: 'So the expression simplifies to 1.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const lhs = String.raw`\frac{1-\cos^2\theta}{1+\cos\theta}`;
        const rhs = String.raw`1-\cos\theta`;
        const wrong = [String.raw`1+\cos\theta`, String.raw`\sin\theta`, String.raw`\sin^2\theta`];
        const steps = [
          { katex: String.raw`\text{Goal: simplify }\frac{1-\cos^2\theta}{1+\cos\theta}.`, text: 'We will factor the numerator and cancel.' },
          { katex: String.raw`1-\cos^2\theta=(1-\cos\theta)(1+\cos\theta)`, text: 'Use the difference of squares: 1−x²=(1−x)(1+x).' },
          { katex: String.raw`\frac{1-\cos^2\theta}{1+\cos\theta}=\frac{(1-\cos\theta)(1+\cos\theta)}{1+\cos\theta}`, text: 'Substitute the factorization into the fraction.' },
          { katex: String.raw`=1-\cos\theta`, text: 'Cancel the common factor (1+cosθ).' },
          { katex: String.raw`\boxed{\frac{1-\cos^2\theta}{1+\cos\theta}=1-\cos\theta}`, text: 'So the simplified result is 1−cosθ.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const lhs = String.raw`\frac{\sin^2\theta}{1-\cos\theta}`;
        const rhs = String.raw`1+\cos\theta`;
        const wrong = [String.raw`1-\cos\theta`, String.raw`\sin\theta`, String.raw`\sin^2\theta`];
        const steps = [
          { katex: String.raw`\text{Goal: simplify }\frac{\sin^2\theta}{1-\cos\theta}.`, text: 'We will rewrite sin²θ and then cancel.' },
          { katex: String.raw`\sin^2\theta+\cos^2\theta=1`, text: 'Start from the Pythagorean identity.' },
          { katex: String.raw`\sin^2\theta=1-\cos^2\theta`, text: 'Rearrange to express sin²θ in terms of cosθ.' },
          { katex: String.raw`1-\cos^2\theta=(1-\cos\theta)(1+\cos\theta)`, text: 'Factor using difference of squares.' },
          { katex: String.raw`\frac{\sin^2\theta}{1-\cos\theta}=\frac{(1-\cos\theta)(1+\cos\theta)}{1-\cos\theta}`, text: 'Substitute the factorization into the fraction.' },
          { katex: String.raw`=1+\cos\theta`, text: 'Cancel the common factor (1−cosθ).' },
          { katex: String.raw`\boxed{\frac{\sin^2\theta}{1-\cos\theta}=1+\cos\theta}`, text: 'So the simplified result is 1+cosθ.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const lhs = String.raw`\frac{\sin\theta}{1-\cos\theta}`;
        const rhs = String.raw`\frac{1+\cos\theta}{\sin\theta}`;
        const wrong = [String.raw`\frac{1-\cos\theta}{\sin\theta}`, String.raw`\tan\theta`, String.raw`\cot\theta`];
        const steps = [
          { katex: String.raw`\text{Goal: simplify }\frac{\sin\theta}{1-\cos\theta}.`, text: 'This has a (1−cosθ) denominator, so we rationalize using the conjugate.' },
          { katex: String.raw`\frac{\sin\theta}{1-\cos\theta}\cdot\frac{1+\cos\theta}{1+\cos\theta}`, text: 'Multiply by the conjugate (1+cosθ)/(1+cosθ), which equals 1.' },
          { katex: String.raw`=\frac{\sin\theta(1+\cos\theta)}{(1-\cos\theta)(1+\cos\theta)}`, text: 'Multiply out numerator and denominator.' },
          { katex: String.raw`(1-\cos\theta)(1+\cos\theta)=1-\cos^2\theta`, text: 'Use difference of squares in the denominator.' },
          { katex: String.raw`=\frac{\sin\theta(1+\cos\theta)}{1-\cos^2\theta}`, text: 'Substitute 1−cos²θ.' },
          { katex: String.raw`1-\cos^2\theta=\sin^2\theta`, text: 'Use 1 = sin²θ + cos²θ.' },
          { katex: String.raw`=\frac{\sin\theta(1+\cos\theta)}{\sin^2\theta}`, text: 'Replace the denominator with sin²θ.' },
          { katex: String.raw`=\frac{1+\cos\theta}{\sin\theta}`, text: 'Cancel one factor of sinθ.' },
          { katex: String.raw`\boxed{\frac{\sin\theta}{1-\cos\theta}=\frac{1+\cos\theta}{\sin\theta}}`, text: 'So the simplified form is (1+cosθ)/sinθ.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const p = rng.int(1, 5);
        const twoP = 2 * p;
        const lhs = String.raw`\frac{(1+\tan^2\theta)^{${p}}}{\sec^{2${p}}\theta}`;
        const rhs = String.raw`1`;
        const lhsFixed = String.raw`\frac{(1+\tan^2\theta)^{${p}}}{\sec^{${twoP}}\theta}`;
        const wrong = [String.raw`0`, String.raw`\sec^{${twoP}}\theta`, String.raw`\tan^{${twoP}}\theta`];
        const steps = [
          { katex: String.raw`\text{Goal: simplify }${lhsFixed}.`, text: 'We will convert the bracket using a trig identity, then simplify indices.' },
          { katex: String.raw`1+\tan^2\theta=\sec^2\theta`, text: 'Use the Pythagorean identity linking tan and sec.' },
          { katex: String.raw`(1+\tan^2\theta)^{${p}}=(\sec^2\theta)^{${p}}`, text: 'Raise both sides to the power p.' },
          { katex: String.raw`(\sec^2\theta)^{${p}}=\sec^{2${p}}\theta`, text: 'Power of a power: (a^{2})^{p}=a^{2p}.' },
          { katex: String.raw`(\sec^2\theta)^{${p}}=\sec^{${twoP}}\theta`, text: 'Here, the exponent becomes 2p.' },
          { katex: String.raw`${lhsFixed}=\frac{\sec^{${twoP}}\theta}{\sec^{${twoP}}\theta}`, text: 'Substitute the simplified numerator.' },
          { katex: String.raw`=1`, text: 'Any nonzero expression divided by itself equals 1.' },
          { katex: String.raw`\boxed{${lhsFixed}=1}`, text: 'So the simplified form is 1.' },
        ];
        return { lhs: lhsFixed, rhs, steps, wrong };
      },
      () => {
        const which = rng.int(0, 2);
        const lhs = which === 0
          ? String.raw`\frac{\sin\theta}{\cos\theta}`
          : which === 1
            ? String.raw`\frac{\cos\theta}{\sin\theta}`
            : String.raw`\frac{1}{\tan\theta}`;
        const rhs = which === 0 ? String.raw`\tan\theta` : which === 1 ? String.raw`\cot\theta` : String.raw`\cot\theta`;
        const wrong = which === 0
          ? [String.raw`\cot\theta`, String.raw`\sec\theta`, String.raw`\csc\theta`]
          : [String.raw`\tan\theta`, String.raw`\sec\theta`, String.raw`\csc\theta`];
        const steps = which === 0
          ? [
            { katex: String.raw`\text{Goal: simplify }\frac{\sin\theta}{\cos\theta}.`, text: 'We will use the quotient identity for tangent.' },
            { katex: String.raw`\tan\theta=\frac{\sin\theta}{\cos\theta}`, text: 'Recall the identity definition of tanθ.' },
            { katex: String.raw`\frac{\sin\theta}{\cos\theta}=\tan\theta`, text: 'So the given fraction is exactly tanθ.' },
            { katex: String.raw`\boxed{\frac{\sin\theta}{\cos\theta}=\tan\theta}`, text: 'This is the simplified form.' },
          ]
          : which === 1
            ? [
              { katex: String.raw`\text{Goal: simplify }\frac{\cos\theta}{\sin\theta}.`, text: 'We will use the quotient identity for cotangent.' },
              { katex: String.raw`\cot\theta=\frac{\cos\theta}{\sin\theta}`, text: 'Recall the identity definition of cotθ.' },
              { katex: String.raw`\frac{\cos\theta}{\sin\theta}=\cot\theta`, text: 'So the given fraction is exactly cotθ.' },
              { katex: String.raw`\boxed{\frac{\cos\theta}{\sin\theta}=\cot\theta}`, text: 'This is the simplified form.' },
            ]
            : [
              { katex: String.raw`\text{Goal: simplify }\frac{1}{\tan\theta}.`, text: 'We will use a reciprocal identity.' },
              { katex: String.raw`\cot\theta=\frac{1}{\tan\theta}`, text: 'Recall that cotθ is the reciprocal of tanθ.' },
              { katex: String.raw`\frac{1}{\tan\theta}=\cot\theta`, text: 'So the given expression is cotθ.' },
              { katex: String.raw`\boxed{\frac{1}{\tan\theta}=\cot\theta}`, text: 'This is the simplified form.' },
            ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const lhs = String.raw`\frac{\sin^2\theta}{1+\cot^2\theta}`;
        const rhs = String.raw`\sin^4\theta`;
        const wrong = [String.raw`\sin^2\theta`, String.raw`\cos^2\theta`, String.raw`\sin^2\theta\cos^2\theta`];
        const steps = [
          { katex: String.raw`\text{Goal: simplify }\frac{\sin^2\theta}{1+\cot^2\theta}.`, text: 'We will rewrite the denominator using a Pythagorean identity.' },
          { katex: String.raw`1+\cot^2\theta=\csc^2\theta`, text: 'Use the Pythagorean identity linking cot and csc.' },
          { katex: String.raw`\frac{\sin^2\theta}{1+\cot^2\theta}=\frac{\sin^2\theta}{\csc^2\theta}`, text: 'Substitute csc²θ for (1+cot²θ).' },
          { katex: String.raw`\csc\theta=\frac{1}{\sin\theta}`, text: 'Use the reciprocal identity.' },
          { katex: String.raw`\csc^2\theta=\frac{1}{\sin^2\theta}`, text: 'Square both sides to get csc²θ.' },
          { katex: String.raw`\frac{\sin^2\theta}{\csc^2\theta}=\frac{\sin^2\theta}{\frac{1}{\sin^2\theta}}`, text: 'Substitute 1/sin²θ.' },
          { katex: String.raw`=\sin^2\theta\cdot\sin^2\theta`, text: 'Dividing by 1/sin²θ is multiplying by sin²θ.' },
          { katex: String.raw`=\sin^4\theta`, text: 'Multiply and simplify.' },
          { katex: String.raw`\boxed{\frac{\sin^2\theta}{1+\cot^2\theta}=\sin^4\theta}`, text: 'So the simplified form is sin^4θ.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
    ];

    const row = templates[rng.int(0, templates.length - 1)]!();
    const correct = row.rhs;
    const wrongFromTemplate = row.wrong.filter((x) => x !== correct);
    const wrongPool = makeWrongPool(correct);
    const avoid = new Set<string>([correct, ...wrongFromTemplate]);
    const extraWrong = pickDistinct(wrongPool, Math.max(0, 3 - wrongFromTemplate.length), avoid);
    const optionsRaw = [correct, ...wrongFromTemplate, ...extraWrong];
    const optionsUnique: string[] = [];
    for (const o of optionsRaw) if (!optionsUnique.includes(o)) optionsUnique.push(o);
    while (optionsUnique.length < 4) optionsUnique.push(optionsUnique[0]!);
    const shuffled = shuffle(rng, optionsUnique.slice(0, 4));
    const correctIndex = shuffled.indexOf(correct);

    const promptText = '';
    const promptKatex = String.raw`\text{What can }(${row.lhs})\text{ be written as.}`;

    return {
      kind: 'graph',
      id: stableId('trig-ident-simplify', 0, `${row.lhs}__${row.rhs}`),
      topicId: 'graph_trigonometry',
      difficulty: input.difficulty,
      seed: input.seed,
      generatorParams: { kind: 'identity_simplify' },
      promptText,
      promptKatex,
      katexQuestion: '',
      katexOptions: shuffled,
      correctIndex,
      svgDataUrl: '',
      svgAltText: 'A trigonometry identity multiple-choice question.',
      katexExplanation: {
        steps: row.steps,
        summary: 'Rewrite everything in terms of sin and cos (or use standard identities), then simplify.',
      },
    };
  }

  {
    const allRatios = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc'] as const;
    const givenPool = input.difficulty === 'hard' ? allRatios : (['tan', 'cot'] as const);
    const given = givenPool[rng.int(0, givenPool.length - 1)]!;
    const askPool = allRatios.filter((r) => r !== given);
    const ask = askPool[rng.int(0, askPool.length - 1)]!;

    // Build an exact ratio using opposite = a*sqrt(m), adjacent = b.
    const mPool = input.difficulty === 'easy'
      ? [1, 2, 3, 5]
      : input.difficulty === 'medium'
        ? [1, 2, 3, 5, 6, 7]
        : [1, 2, 3, 5, 6, 7, 10];
    const m = mPool[rng.int(0, mPool.length - 1)]!;

    const a = rng.int(1, input.difficulty === 'hard' ? 6 : 4);
    const bPool = input.difficulty === 'easy' ? [1, 2, 4, 5, 10] : [1, 2, 3, 4, 5, 10];
    const b = bPool[rng.int(0, bPool.length - 1)]!;

    const quadrant = rng.int(1, 4) as 1 | 2 | 3 | 4;
    const rangeLatex = quadrantRangeLatex(quadrant);
    const { sinSign, cosSign, tanSign } = signsFromQuadrant(quadrant);

    // Magnitudes for triangle (positive lengths)
    const oppMagLatex = m === 1 ? String.raw`${a}` : String.raw`${a}\sqrt{${m}}`;
    const adjMagLatex = String.raw`${b}`;
    const hypSq = a * a * m + b * b;
    const hypMagLatex = String.raw`\sqrt{${hypSq}}`;

    const hypInt = (() => {
      const rt = Math.sqrt(hypSq);
      return Number.isFinite(rt) && Math.abs(rt - Math.round(rt)) < 1e-9 ? Math.round(rt) : null;
    })();

    const formatRational = (n: number, d: number) => {
      const f = simplifyFrac(n, d);
      const asDec = terminatingDecimalString(f.n, f.d);
      const styleRoll = rng.int(0, 9);
      if (styleRoll < 3 && f.d === 1) return String(f.n);
      if (styleRoll < 6 && asDec !== null) return asDec;
      return fracToLatex(f.n, f.d);
    };

    const givenLatex = ratioLatex(given);
    const askLatex = ratioLatex(ask);

    const sinMag = String.raw`\frac{${oppMagLatex}}{${hypMagLatex}}`;
    const cosMag = String.raw`\frac{${adjMagLatex}}{${hypMagLatex}}`;
    const tanMag = m === 1 ? fracToLatex(a, b) : String.raw`\frac{${oppMagLatex}}{${adjMagLatex}}`;
    const cotMag = m === 1 ? fracToLatex(b, a) : String.raw`\frac{${adjMagLatex}}{${oppMagLatex}}`;
    const secMag = String.raw`\frac{${hypMagLatex}}{${adjMagLatex}}`;
    const cscMag = String.raw`\frac{${hypMagLatex}}{${oppMagLatex}}`;

    const magByRatio: Record<typeof allRatios[number], string> = {
      sin: sinMag,
      cos: cosMag,
      tan: tanMag,
      cot: cotMag,
      sec: secMag,
      csc: cscMag,
    };

    const signByRatio: Record<typeof allRatios[number], number> = {
      sin: sinSign,
      cos: cosSign,
      tan: tanSign,
      cot: tanSign,
      sec: cosSign,
      csc: sinSign,
    };

    const signedValue = (ratio: typeof allRatios[number]) => `${signByRatio[ratio] < 0 ? '-' : ''}${magByRatio[ratio]}`;

    const givenValueLatex = (() => {
      // If we can express it as a simple rational, show integer/decimal/fraction.
      if (m === 1) {
        if (given === 'tan') return `${tanSign < 0 ? '-' : ''}${formatRational(a, b)}`;
        if (given === 'cot') return `${tanSign < 0 ? '-' : ''}${formatRational(b, a)}`;
        if (hypInt) {
          if (given === 'sin') return `${sinSign < 0 ? '-' : ''}${formatRational(a, hypInt)}`;
          if (given === 'cos') return `${cosSign < 0 ? '-' : ''}${formatRational(b, hypInt)}`;
          if (given === 'sec') return `${cosSign < 0 ? '-' : ''}${formatRational(hypInt, b)}`;
          if (given === 'csc') return `${sinSign < 0 ? '-' : ''}${formatRational(hypInt, a)}`;
        }
      }

      return signedValue(given);
    })();

    const correct = signedValue(ask);
    const wrongSign = `${signByRatio[ask] < 0 ? '' : '-'}${magByRatio[ask]}`;

    const swapped = (() => {
      // Common mistake: swap numerator/denominator for sin/cos/sec/csc.
      if (ask === 'sin') return `${signByRatio[ask] < 0 ? '-' : ''}${cscMag}`;
      if (ask === 'cos') return `${signByRatio[ask] < 0 ? '-' : ''}${secMag}`;
      if (ask === 'sec') return `${signByRatio[ask] < 0 ? '-' : ''}${cosMag}`;
      if (ask === 'csc') return `${signByRatio[ask] < 0 ? '-' : ''}${sinMag}`;
      if (ask === 'tan') return `${signByRatio[ask] < 0 ? '-' : ''}${cotMag}`;
      return `${signByRatio[ask] < 0 ? '-' : ''}${tanMag}`;
    })();

    const noRoot = (() => {
      // Another mistake: forget to take square root in hypotenuse.
      if (ask === 'sin') return `${signByRatio[ask] < 0 ? '-' : ''}${String.raw`\frac{${oppMagLatex}}{${hypSq}}`}`;
      if (ask === 'cos') return `${signByRatio[ask] < 0 ? '-' : ''}${String.raw`\frac{${adjMagLatex}}{${hypSq}}`}`;
      if (ask === 'sec') return `${signByRatio[ask] < 0 ? '-' : ''}${String.raw`\frac{${hypSq}}{${adjMagLatex}}`}`;
      if (ask === 'csc') return `${signByRatio[ask] < 0 ? '-' : ''}${String.raw`\frac{${hypSq}}{${oppMagLatex}}`}`;
      return wrongSign;
    })();

    const optionsRaw = [correct, wrongSign, swapped, noRoot];
    const optionsUnique: string[] = [];
    for (const o of optionsRaw) if (!optionsUnique.includes(o)) optionsUnique.push(o);
    while (optionsUnique.length < 4) optionsUnique.push(optionsUnique[0]!);
    const shuffled = shuffle(rng, optionsUnique.slice(0, 4));
    const correctIndex = shuffled.indexOf(correct);

    const promptText = 'It is given that:';
    const promptKatex = String.raw`${givenLatex}\theta = ${givenValueLatex},\quad ${rangeLatex}.\quad \text{Find }${askLatex}\theta.`;

    const givenDefKatex = (() => {
      if (given === 'sin') return String.raw`\sin\theta = \frac{\text{opposite}}{\text{hypotenuse}}`;
      if (given === 'cos') return String.raw`\cos\theta = \frac{\text{adjacent}}{\text{hypotenuse}}`;
      if (given === 'tan') return String.raw`\tan\theta = \frac{\text{opposite}}{\text{adjacent}}`;
      if (given === 'cot') return String.raw`\cot\theta = \frac{\text{adjacent}}{\text{opposite}}`;
      if (given === 'sec') return String.raw`\sec\theta = \frac{\text{hypotenuse}}{\text{adjacent}}`;
      return String.raw`\csc\theta = \frac{\text{hypotenuse}}{\text{opposite}}`;
    })();

    const chooseSidesKatex = (() => {
      if (given === 'tan' || given === 'cot') {
        return String.raw`\text{Choose }\text{opposite} = ${oppMagLatex},\quad \text{adjacent} = ${adjMagLatex}`;
      }
      if (given === 'sin' || given === 'csc') {
        return String.raw`\text{Choose }\text{opposite} = ${oppMagLatex},\quad \text{hypotenuse} = ${hypMagLatex}`;
      }
      return String.raw`\text{Choose }\text{adjacent} = ${adjMagLatex},\quad \text{hypotenuse} = ${hypMagLatex}`;
    })();

    const pythagorasSetupKatex = (() => {
      if (given === 'sin' || given === 'csc') {
        return String.raw`(\text{adjacent})^2 = (\text{hypotenuse})^2 - (\text{opposite})^2`;
      }
      if (given === 'cos' || given === 'sec') {
        return String.raw`(\text{opposite})^2 = (\text{hypotenuse})^2 - (\text{adjacent})^2`;
      }
      return String.raw`(\text{hypotenuse})^2 = (\text{opposite})^2 + (\text{adjacent})^2`;
    })();

    const steps = [
      {
        katex: String.raw`${givenLatex}\theta = ${givenValueLatex}`,
        text: 'Start from the given trigonometric ratio and interpret it using a right-angled triangle (using magnitudes first).',
      },
      {
        katex: givenDefKatex,
        text: 'Write the definition of the given ratio in terms of triangle sides.',
      },
      {
        katex: String.raw`${givenDefKatex}\quad\Rightarrow\quad ${givenLatex}\theta = ${givenValueLatex}`,
        text: 'Match the definition to the given value.',
      },
      {
        katex: chooseSidesKatex,
        text: 'Pick convenient side lengths that produce the correct ratio. (Any common scaling would also work.)',
      },
      {
        katex: String.raw`\text{Now use Pythagoras:}\quad ${pythagorasSetupKatex}`,
        text: 'Find the missing side using the Pythagorean theorem.',
      },
      {
        katex: given === 'sin' || given === 'csc'
          ? String.raw`(\text{adjacent})^2 = (${hypMagLatex})^2 - (${oppMagLatex})^2`
          : given === 'cos' || given === 'sec'
            ? String.raw`(\text{opposite})^2 = (${hypMagLatex})^2 - (${adjMagLatex})^2`
            : String.raw`(\text{hypotenuse})^2 = (${oppMagLatex})^2 + (${adjMagLatex})^2`,
        text: 'Substitute the chosen sides into the Pythagoras relationship.',
      },
      {
        katex: String.raw`(${oppMagLatex})^2 = (${a})^2\cdot(${m}) = ${a * a * m}`,
        text: 'Square the opposite side carefully.',
      },
      {
        katex: String.raw`(${adjMagLatex})^2 = ${b}^2 = ${b * b}`,
        text: 'Square the adjacent side.',
      },
      {
        katex: given === 'sin' || given === 'csc'
          ? String.raw`(\text{adjacent})^2 = ${hypSq} - ${a * a * m} = ${b * b}`
          : given === 'cos' || given === 'sec'
            ? String.raw`(\text{opposite})^2 = ${hypSq} - ${b * b} = ${a * a * m}`
            : String.raw`(\text{hypotenuse})^2 = ${a * a * m} + ${b * b} = ${hypSq}`,
        text: 'Simplify to find the missing side squared.',
      },
      {
        katex: given === 'sin' || given === 'csc'
          ? String.raw`\text{adjacent} = \sqrt{${b * b}} = ${b}`
          : given === 'cos' || given === 'sec'
            ? String.raw`\text{opposite} = \sqrt{${a * a * m}} = ${oppMagLatex}`
            : String.raw`\text{hypotenuse} = \sqrt{${hypSq}}`,
        text: 'Take the square root (side lengths are positive magnitudes).',
      },
      {
        katex: String.raw`\text{Write the required ratio:}\quad ${askLatex}\theta`,
        text: 'Now we compute the asked trigonometric ratio using the triangle.',
      },
      {
        katex: (() => {
          if (ask === 'sin') return String.raw`\sin\theta = \frac{\text{opposite}}{\text{hypotenuse}} = ${sinMag}`;
          if (ask === 'cos') return String.raw`\cos\theta = \frac{\text{adjacent}}{\text{hypotenuse}} = ${cosMag}`;
          if (ask === 'tan') return String.raw`\tan\theta = \frac{\text{opposite}}{\text{adjacent}} = ${tanMag}`;
          if (ask === 'cot') return String.raw`\cot\theta = \frac{\text{adjacent}}{\text{opposite}} = ${cotMag}`;
          if (ask === 'sec') return String.raw`\sec\theta = \frac{\text{hypotenuse}}{\text{adjacent}} = ${secMag}`;
          return String.raw`\csc\theta = \frac{\text{hypotenuse}}{\text{opposite}} = ${cscMag}`;
        })(),
        text: 'Substitute the triangle sides into the definition of the required ratio.',
      },
      {
        katex: String.raw`\text{Now choose the correct sign using the quadrant.}`,
        text: 'So far we have the magnitude. The sign depends on which quadrant the angle lies in.',
      },
      {
        katex: String.raw`\text{Quadrant }${quadrant}:\quad \sin\theta\text{ is }${sinSign < 0 ? '\\text{negative}' : '\\text{positive}'},\ \cos\theta\text{ is }${cosSign < 0 ? '\\text{negative}' : '\\text{positive}'}.`,
        text: 'In each quadrant, the signs of sin and cos are fixed. We use those to decide the sign of the requested ratio.',
      },
      {
        katex: String.raw`\tan\theta = \frac{\sin\theta}{\cos\theta}\quad\Rightarrow\quad \tan\theta\text{ is }${tanSign < 0 ? '\\text{negative}' : '\\text{positive}'}.`,
        text: 'Because tanθ = sinθ/cosθ, its sign is determined from the signs of sinθ and cosθ.',
      },
      {
        katex: String.raw`\cot\theta = \frac{1}{\tan\theta}\quad\Rightarrow\quad \cot\theta\text{ has the same sign as }\tan\theta.`,
        text: 'Cotangent is the reciprocal of tangent, so it has the same sign as tanθ.',
      },
      {
        katex: String.raw`\sec\theta = \frac{1}{\cos\theta}\quad\Rightarrow\quad \sec\theta\text{ has the same sign as }\cos\theta.`,
        text: 'Secant is the reciprocal of cosine, so it has the same sign as cosθ.',
      },
      {
        katex: String.raw`\csc\theta = \frac{1}{\sin\theta}\quad\Rightarrow\quad \csc\theta\text{ has the same sign as }\sin\theta.`,
        text: 'Cosecant is the reciprocal of sine, so it has the same sign as sinθ.',
      },
      {
        katex: String.raw`${askLatex}\theta = ${correct}`,
        text: 'Apply the correct sign to the magnitude to get the final exact value.',
      },
    ];

    return {
      kind: 'graph',
      id: stableId('trig-ratio-quad', input.seed, `${given}-${ask}-${quadrant}-${a}-${m}-${b}`),
      topicId: 'graph_trigonometry',
      difficulty: input.difficulty,
      seed: input.seed,
      generatorParams: { kind: 'trig_ratio_quadrant', given, ask, quadrant, a, m, b },
      promptText,
      promptKatex,
      katexQuestion: '',
      katexOptions: shuffled,
      correctIndex,
      svgDataUrl: '',
      svgAltText: 'A trigonometry exact value multiple-choice question.',
      katexExplanation: {
        steps,
        summary: 'Translate the given ratio into triangle side lengths, use Pythagoras to find the third side, compute the required ratio, then use the quadrant to choose the correct sign.',
      },
    };
  }
}
