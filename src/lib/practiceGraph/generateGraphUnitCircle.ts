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

type TrigFn = 'sin' | 'cos' | 'tan' | 'sec' | 'cosec' | 'cot';

const UNDEFINED_LATEX = String.raw`\text{undefined}`;

function asFractionLatex(num: string, den: string) {
  return String.raw`\frac{${num}}{${den}}`;
}

function simplifySqrtFrac(num: number, den: number) {
  // For the fixed set we use, keep simple outputs.
  // e.g. 2/sqrt(3) -> 2\sqrt{3}/3
  return String.raw`\frac{${num}\sqrt{${den}}}{${den}}`;
}

function computeTrigValue(fn: TrigFn, a: Angle): { valueLatex: string; undefined: boolean } {
  const sin = a.sinLatex;
  const cos = a.cosLatex;

  const isZero = (s: string) => s === '0';
  const isOne = (s: string) => s === '1';
  const isNegOne = (s: string) => s === '-1';

  if (fn === 'sin') return { valueLatex: sin, undefined: false };
  if (fn === 'cos') return { valueLatex: cos, undefined: false };

  if (fn === 'tan') {
    if (isZero(cos)) return { valueLatex: UNDEFINED_LATEX, undefined: true };
    if (isZero(sin)) return { valueLatex: '0', undefined: false };
    // Handle known exact ratios for our angle table.
    // tan = sin/cos
    const key = `${sin}/${cos}`;
    const map: Record<string, string> = {
      [`${String.raw`\frac{1}{2}`}/${String.raw`\frac{\sqrt{3}}{2}`}`]: String.raw`\frac{\sqrt{3}}{3}`,
      [`${String.raw`\frac{\sqrt{2}}{2}`}/${String.raw`\frac{\sqrt{2}}{2}`}`]: '1',
      [`${String.raw`\frac{\sqrt{3}}{2}`}/${String.raw`\frac{1}{2}`}`]: String.raw`\sqrt{3}`,
      [`${String.raw`\frac{\sqrt{3}}{2}`}/${String.raw`-\frac{1}{2}`}`]: String.raw`-\sqrt{3}`,
      [`${String.raw`\frac{\sqrt{2}}{2}`}/${String.raw`-\frac{\sqrt{2}}{2}`}`]: '-1',
      [`${String.raw`\frac{1}{2}`}/${String.raw`-\frac{\sqrt{3}}{2}`}`]: String.raw`-\frac{\sqrt{3}}{3}`,
      [`${String.raw`-\frac{1}{2}`}/${String.raw`-\frac{\sqrt{3}}{2}`}`]: String.raw`\frac{\sqrt{3}}{3}`,
      [`${String.raw`-\frac{\sqrt{2}}{2}`}/${String.raw`-\frac{\sqrt{2}}{2}`}`]: '1',
      [`${String.raw`-\frac{\sqrt{3}}{2}`}/${String.raw`-\frac{1}{2}`}`]: String.raw`\sqrt{3}`,
      [`${String.raw`-\frac{\sqrt{3}}{2}`}/${String.raw`\frac{1}{2}`}`]: String.raw`-\sqrt{3}`,
      [`${String.raw`-\frac{\sqrt{2}}{2}`}/${String.raw`\frac{\sqrt{2}}{2}`}`]: '-1',
      [`${String.raw`-\frac{1}{2}`}/${String.raw`\frac{\sqrt{3}}{2}`}`]: String.raw`-\frac{\sqrt{3}}{3}`,
    };
    return { valueLatex: map[key] ?? UNDEFINED_LATEX, undefined: map[key] ? false : true };
  }

  if (fn === 'sec') {
    if (isZero(cos)) return { valueLatex: UNDEFINED_LATEX, undefined: true };
    if (isOne(cos)) return { valueLatex: '1', undefined: false };
    if (isNegOne(cos)) return { valueLatex: '-1', undefined: false };
    // Reciprocal of cos.
    const map: Record<string, string> = {
      [String.raw`\frac{1}{2}`]: '2',
      [String.raw`-\frac{1}{2}`]: '-2',
      [String.raw`\frac{\sqrt{2}}{2}`]: String.raw`\sqrt{2}`,
      [String.raw`-\frac{\sqrt{2}}{2}`]: String.raw`-\sqrt{2}`,
      [String.raw`\frac{\sqrt{3}}{2}`]: simplifySqrtFrac(2, 3),
      [String.raw`-\frac{\sqrt{3}}{2}`]: `-${simplifySqrtFrac(2, 3)}`,
    };
    return { valueLatex: map[cos] ?? UNDEFINED_LATEX, undefined: map[cos] ? false : true };
  }

  if (fn === 'cosec') {
    if (isZero(sin)) return { valueLatex: UNDEFINED_LATEX, undefined: true };
    if (isOne(sin)) return { valueLatex: '1', undefined: false };
    if (isNegOne(sin)) return { valueLatex: '-1', undefined: false };
    const map: Record<string, string> = {
      [String.raw`\frac{1}{2}`]: '2',
      [String.raw`-\frac{1}{2}`]: '-2',
      [String.raw`\frac{\sqrt{2}}{2}`]: String.raw`\sqrt{2}`,
      [String.raw`-\frac{\sqrt{2}}{2}`]: String.raw`-\sqrt{2}`,
      [String.raw`\frac{\sqrt{3}}{2}`]: simplifySqrtFrac(2, 3),
      [String.raw`-\frac{\sqrt{3}}{2}`]: `-${simplifySqrtFrac(2, 3)}`,
    };
    return { valueLatex: map[sin] ?? UNDEFINED_LATEX, undefined: map[sin] ? false : true };
  }

  // cot
  if (isZero(sin)) return { valueLatex: UNDEFINED_LATEX, undefined: true };
  if (isZero(cos)) return { valueLatex: '0', undefined: false };
  // Reciprocal of tan.
  const tan = computeTrigValue('tan', a);
  if (tan.undefined || tan.valueLatex === '0') return { valueLatex: UNDEFINED_LATEX, undefined: true };
  const t = tan.valueLatex;
  const map: Record<string, string> = {
    [String.raw`\frac{\sqrt{3}}{3}`]: String.raw`\sqrt{3}`,
    [String.raw`-\frac{\sqrt{3}}{3}`]: String.raw`-\sqrt{3}`,
    [String.raw`\sqrt{3}`]: String.raw`\frac{\sqrt{3}}{3}`,
    [String.raw`-\sqrt{3}`]: String.raw`-\frac{\sqrt{3}}{3}`,
    ['1']: '1',
    ['-1']: '-1',
  };
  return { valueLatex: map[t] ?? UNDEFINED_LATEX, undefined: map[t] ? false : true };
}

function buildOptionBank() {
  // Collect all values across all angles for all trig functions.
  const values = new Set<string>();
  for (const fn of ['sin', 'cos', 'tan', 'sec', 'cosec', 'cot'] as const) {
    for (const a of ANGLES) {
      const v = computeTrigValue(fn, a);
      values.add(v.valueLatex);
    }
  }
  values.add(UNDEFINED_LATEX);
  const arr = Array.from(values);
  // Stable-ish ordering for UI.
  const order = [
    '0',
    '1',
    '-1',
    String.raw`\frac{1}{2}`,
    String.raw`-\frac{1}{2}`,
    String.raw`\frac{\sqrt{2}}{2}`,
    String.raw`-\frac{\sqrt{2}}{2}`,
    String.raw`\frac{\sqrt{3}}{2}`,
    String.raw`-\frac{\sqrt{3}}{2}`,
    String.raw`\sqrt{2}`,
    String.raw`-\sqrt{2}`,
    '2',
    '-2',
    String.raw`\sqrt{3}`,
    String.raw`-\sqrt{3}`,
    String.raw`\frac{\sqrt{3}}{3}`,
    String.raw`-\frac{\sqrt{3}}{3}`,
    simplifySqrtFrac(2, 3),
    `-${simplifySqrtFrac(2, 3)}`,
    UNDEFINED_LATEX,
  ];
  const out: string[] = [];
  for (const o of order) if (arr.includes(o) && !out.includes(o)) out.push(o);
  for (const o of arr) if (!out.includes(o)) out.push(o);
  return out;
}

type Angle = {
  label: string;
  thetaLatex: string;
  cosLatex: string;
  sinLatex: string;
};

const ANGLES: Angle[] = [
  { label: '0°', thetaLatex: '0', cosLatex: '1', sinLatex: '0' },
  { label: '30°', thetaLatex: String.raw`\frac{\pi}{6}`, cosLatex: String.raw`\frac{\sqrt{3}}{2}`, sinLatex: String.raw`\frac{1}{2}` },
  { label: '45°', thetaLatex: String.raw`\frac{\pi}{4}`, cosLatex: String.raw`\frac{\sqrt{2}}{2}`, sinLatex: String.raw`\frac{\sqrt{2}}{2}` },
  { label: '60°', thetaLatex: String.raw`\frac{\pi}{3}`, cosLatex: String.raw`\frac{1}{2}`, sinLatex: String.raw`\frac{\sqrt{3}}{2}` },
  { label: '90°', thetaLatex: String.raw`\frac{\pi}{2}`, cosLatex: '0', sinLatex: '1' },
  { label: '120°', thetaLatex: String.raw`\frac{2\pi}{3}`, cosLatex: String.raw`-\frac{1}{2}`, sinLatex: String.raw`\frac{\sqrt{3}}{2}` },
  { label: '135°', thetaLatex: String.raw`\frac{3\pi}{4}`, cosLatex: String.raw`-\frac{\sqrt{2}}{2}`, sinLatex: String.raw`\frac{\sqrt{2}}{2}` },
  { label: '150°', thetaLatex: String.raw`\frac{5\pi}{6}`, cosLatex: String.raw`-\frac{\sqrt{3}}{2}`, sinLatex: String.raw`\frac{1}{2}` },
  { label: '180°', thetaLatex: String.raw`\pi`, cosLatex: '-1', sinLatex: '0' },
  { label: '210°', thetaLatex: String.raw`\frac{7\pi}{6}`, cosLatex: String.raw`-\frac{\sqrt{3}}{2}`, sinLatex: String.raw`-\frac{1}{2}` },
  { label: '225°', thetaLatex: String.raw`\frac{5\pi}{4}`, cosLatex: String.raw`-\frac{\sqrt{2}}{2}`, sinLatex: String.raw`-\frac{\sqrt{2}}{2}` },
  { label: '240°', thetaLatex: String.raw`\frac{4\pi}{3}`, cosLatex: String.raw`-\frac{1}{2}`, sinLatex: String.raw`-\frac{\sqrt{3}}{2}` },
  { label: '270°', thetaLatex: String.raw`\frac{3\pi}{2}`, cosLatex: '0', sinLatex: '-1' },
  { label: '300°', thetaLatex: String.raw`\frac{5\pi}{3}`, cosLatex: String.raw`\frac{1}{2}`, sinLatex: String.raw`-\frac{\sqrt{3}}{2}` },
  { label: '315°', thetaLatex: String.raw`\frac{7\pi}{4}`, cosLatex: String.raw`\frac{\sqrt{2}}{2}`, sinLatex: String.raw`-\frac{\sqrt{2}}{2}` },
  { label: '330°', thetaLatex: String.raw`\frac{11\pi}{6}`, cosLatex: String.raw`\frac{\sqrt{3}}{2}`, sinLatex: String.raw`-\frac{1}{2}` },
];

export function generateGraphUnitCircleMcq(input: {
  topicId: 'graph_trigonometry' | 'graph_unit_circle';
  difficulty: 'easy' | 'medium' | 'hard';
  seed: number;
}): GraphPracticeQuestion {
  const rng = mulberry32(input.seed);

  const anglePool = input.difficulty === 'easy'
    ? ANGLES.filter((a) => ['0°', '30°', '45°', '60°', '90°', '120°', '135°', '150°', '180°', '210°', '225°', '240°', '270°', '300°', '315°', '330°'].includes(a.label))
    : ANGLES;

  const fnPool: TrigFn[] = input.difficulty === 'easy'
    ? (['sin', 'cos', 'tan'] as TrigFn[])
    : (['sin', 'cos', 'tan', 'sec', 'cosec', 'cot'] as TrigFn[]);

  const angleOrder = shuffle(mulberry32(input.seed ^ 0x9e3779b9), anglePool);
  const fnOrder = shuffle(mulberry32(input.seed ^ 0x85ebca6b), fnPool);

  const idxAngle = input.seed % angleOrder.length;
  const idxFn = Math.floor(input.seed / angleOrder.length) % fnOrder.length;

  const angle = angleOrder[idxAngle];
  const ask = fnOrder[idxFn];
  const askLatex = ask === 'sin'
    ? String.raw`\sin`
    : ask === 'cos'
      ? String.raw`\cos`
      : ask === 'tan'
        ? String.raw`\tan`
        : ask === 'sec'
          ? String.raw`\sec`
          : ask === 'cosec'
            ? String.raw`\cosec`
            : String.raw`\cot`;

  const computed = computeTrigValue(ask, angle);
  const correct = computed.valueLatex;

  const options = buildOptionBank();
  const correctIndex = options.indexOf(correct);

  const theta = angle.thetaLatex;

  // For drawing: map our fixed angles to numeric degrees.
  const degMap: Record<string, number> = {
    '0°': 0,
    '30°': 30,
    '45°': 45,
    '60°': 60,
    '90°': 90,
    '120°': 120,
    '135°': 135,
    '150°': 150,
    '180°': 180,
    '210°': 210,
    '225°': 225,
    '240°': 240,
    '270°': 270,
    '300°': 300,
    '315°': 315,
    '330°': 330,
  };
  const rad = (degMap[angle.label] * Math.PI) / 180;
  const px = Math.cos(rad);
  const py = Math.sin(rad);

  const trigFn = (x: number) => {
    if (ask === 'sin') return Math.sin(x);
    if (ask === 'cos') return Math.cos(x);
    if (ask === 'tan') return Math.tan(x);
    if (ask === 'sec') return 1 / Math.cos(x);
    if (ask === 'cosec') return 1 / Math.sin(x);
    return Math.cos(x) / Math.sin(x);
  };

  // Circle as polyline
  const circlePts: Array<{ x: number; y: number }> = [];
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 * Math.PI;
    circlePts.push({ x: Math.cos(t), y: Math.sin(t) });
  }

  const projectionX: Array<{ x: number; y: number }> = [
    { x: px, y: py },
    { x: px, y: 0 },
  ];
  const projectionY: Array<{ x: number; y: number }> = [
    { x: px, y: py },
    { x: 0, y: py },
  ];

  const useRadians = input.difficulty !== 'easy' ? rng.next() < 0.6 : rng.next() < 0.25;
  const angleDisplayText = useRadians ? `θ = ${angle.thetaLatex}` : `θ = ${angle.label}`;
  const angleDisplayKatex = useRadians ? String.raw`\theta = ${angle.thetaLatex}` : String.raw`\theta = ${angle.label.replace('°', '^\\circ')}`;

  const questionKatex = String.raw`${askLatex}(${useRadians ? angle.thetaLatex : angle.label.replace('°', '^\\circ')})`;

  const coordLabelX = `x = ${angle.cosLatex}`;
  const coordLabelY = `y = ${angle.sinLatex}`;

  const thetaMin = 0;
  const thetaMax = 2 * Math.PI;
  const yClip = 2.9;

  const curveSampleMin = -4 * Math.PI;
  const curveSampleMax = 4 * Math.PI;

  const trigY = trigFn(rad);
  const showTrigPoint = isFinite(trigY) && Math.abs(trigY) <= yClip;

  return {
    kind: 'graph',
    id: stableId('graph-unit-circle', input.seed, `${angle.label}-${ask}`),
    topicId: input.topicId,
    difficulty: input.difficulty,
    seed: input.seed,
    generatorParams: { theta: angle.label, ask, unitCircle: true },
    promptText: `Find the exact value of ${ask}(θ) for ${angleDisplayText}.`,
    promptKatex: String.raw`\text{Find the exact value of }${questionKatex}\text{ for }${angleDisplayKatex}.`,
    katexQuestion: '',
    katexOptions: options,
    correctIndex,
    svgDataUrl: '',
    svgAltText: 'Unit circle trigonometric ratio question.',
    graphSpec: {
      width: 520,
      height: 360,
      equalAspect: true,
      axisLabelX: 'x',
      axisLabelY: 'y',
      window: { xMin: -1.35, xMax: 1.35, yMin: -1.25, yMax: 1.25 },
      caption: 'Unit circle',
      plot: [
        { kind: 'polyline', points: circlePts, stroke: '#111827', strokeWidth: 2 },
        { kind: 'polyline', points: [{ x: 0, y: 0 }, { x: px, y: py }], stroke: '#0b5cff', strokeWidth: 3 },
        { kind: 'polyline', points: projectionX, stroke: '#9ca3af', strokeWidth: 1.5 },
        { kind: 'polyline', points: projectionY, stroke: '#9ca3af', strokeWidth: 1.5 },
        { kind: 'point', at: { x: px, y: py }, r: 6, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1.5, fillOpacity: 1 },
        { kind: 'label', at: { x: px + 0.12, y: py + 0.12 }, text: `(${coordLabelX}, ${coordLabelY})`, fill: '#111827', fontSize: 11, anchor: 'start' },
        { kind: 'label', at: { x: px, y: -0.1 }, text: coordLabelX, fill: '#111827', fontSize: 12, anchor: 'middle' },
        { kind: 'label', at: { x: -0.1, y: py }, text: coordLabelY, fill: '#111827', fontSize: 12, anchor: 'end' },
      ],
    },
    secondaryGraphSpec: {
      width: 720,
      height: 320,
      axisLabelX: 'θ',
      axisLabelY: ask,
      window: { xMin: thetaMin, xMax: thetaMax, yMin: -3, yMax: 3 },
      caption: 'Trigonometric ratio vs angle',
      plot: [
        { kind: 'function' as const, fn: trigFn, stroke: '#0b5cff', strokeWidth: 2, yClip },
        ...(showTrigPoint
          ? [
              { kind: 'polyline' as const, points: [{ x: rad, y: 0 }, { x: rad, y: trigY }], stroke: '#9ca3af', strokeWidth: 1.5 },
              { kind: 'point' as const, at: { x: rad, y: trigY }, r: 5, fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 1.5, fillOpacity: 1 },
            ]
          : []),
      ],
    },
    katexExplanation: {
      steps: [
        {
          katex: String.raw`\theta=${theta}\;\Rightarrow\;(\cos\theta,\sin\theta)=(${angle.cosLatex},${angle.sinLatex})`,
          text: 'Use the unit circle coordinates for this special angle.',
        },
        {
          katex: String.raw`${askLatex}(\theta)`,
          text: computed.undefined
            ? 'This ratio is undefined here (division by 0), which we treat as infinite.'
            : 'Use the unit circle ratio definition to read the exact value.',
        },
        {
          katex: String.raw`${askLatex}(\theta) = ${correct}`,
          text: 'Final answer.',
        },
      ],
      summary: 'Use unit-circle special-angle values and the ratio definitions (including undefined when dividing by 0).',
    },
    hints: [
      { katex: String.raw`(\cos\theta,\sin\theta)`, text: 'cosθ is x, sinθ is y.' },
    ],
  };
}
