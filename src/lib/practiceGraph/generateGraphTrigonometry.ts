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

export function generateGraphTrigonometryMcq(input: {
  topicId: PracticeTopicId;
  difficulty: PracticeDifficulty;
  seed: number;
}): GraphPracticeQuestion {
  const rng = mulberry32(input.seed);

  const xMin = -2 * Math.PI;
  const xMax = 2 * Math.PI;
  const yMin = -3;
  const yMax = 3;

  const pool = input.difficulty === 'hard' ? (['sin', 'cos', 'tan'] as const) : (['sin', 'cos'] as const);
  const base = pool[rng.int(0, pool.length - 1)];

  // Keep transformations minimal so the task stays readable.
  const sign = rng.next() < 0.5 ? 1 : -1;
  const vShift = input.difficulty === 'easy' ? 0 : rng.next() < 0.5 ? 0 : rng.int(-1, 1);

  const fn = (x: number) => {
    const core = base === 'sin' ? Math.sin(x) : base === 'cos' ? Math.cos(x) : Math.tan(x);
    return sign * core + vShift;
  };

  const correctLatex = (() => {
    const trig = base === 'sin' ? String.raw`\sin(x)` : base === 'cos' ? String.raw`\cos(x)` : String.raw`\tan(x)`;
    const core = sign === -1 ? `-${trig}` : trig;
    if (vShift === 0) return `y = ${core}`;
    return `y = ${core} ${vShift > 0 ? `+ ${vShift}` : `- ${Math.abs(vShift)}`}`;
  })();

  const distractors = (() => {
    const baseAlt = base === 'sin' ? 'cos' : 'sin';
    const trigAlt = baseAlt === 'sin' ? String.raw`\sin(x)` : String.raw`\cos(x)`;
    const d1 = `y = ${sign === -1 ? '-' : ''}${trigAlt}${vShift === 0 ? '' : vShift > 0 ? ` + ${vShift}` : ` - ${Math.abs(vShift)}`}`;
    const d2 = `y = ${sign === 1 ? '-' : ''}${base === 'sin' ? String.raw`\sin(x)` : base === 'cos' ? String.raw`\cos(x)` : String.raw`\tan(x)`}${vShift === 0 ? '' : vShift > 0 ? ` + ${vShift}` : ` - ${Math.abs(vShift)}`}`;
    const d3 = base === 'tan'
      ? `y = ${sign === -1 ? '-' : ''}${String.raw`\sin(x)`}${vShift === 0 ? '' : vShift > 0 ? ` + ${vShift}` : ` - ${Math.abs(vShift)}`}`
      : `y = ${sign === -1 ? '-' : ''}${String.raw`\tan(x)`}`;
    return [d1, d2, d3];
  })();

  const optionsRaw = [correctLatex, ...distractors];
  const optionsUnique: string[] = [];
  for (const o of optionsRaw) if (!optionsUnique.includes(o)) optionsUnique.push(o);
  while (optionsUnique.length < 4) optionsUnique.push(`y = ${String.raw`\sin(x)`} + ${optionsUnique.length - 1}`);

  const shuffled = shuffle(rng, optionsUnique.slice(0, 4));
  const correctIndex = shuffled.indexOf(correctLatex);

  const plot = [{ kind: 'function' as const, fn, stroke: '#dc2626', strokeWidth: 2, yClip: 2.9 }];

  return {
    kind: 'graph',
    id: stableId('graph-trig', input.seed, `${base}-${sign}-${vShift}`),
    topicId: 'graph_trigonometry',
    difficulty: input.difficulty,
    seed: input.seed,
    generatorParams: { base, sign, vShift },
    promptText: 'Which equation matches the trigonometric graph?',
    promptKatex: String.raw`\text{Which equation matches the trigonometric graph?}`,
    katexQuestion: '',
    katexOptions: shuffled,
    correctIndex,
    graphSpec: {
      width: 720,
      height: 480,
      window: { xMin, xMax, yMin, yMax },
      caption: 'Trigonometric graph',
      plot,
    },
    svgDataUrl: '',
    svgAltText: 'A trigonometric curve on axes.',
    katexExplanation: {
      steps: [
        {
          katex: String.raw`\text{Look at the }y\text{-intercept and the overall shape.}`,
          text: 'At x = 0, sin(0)=0, cos(0)=1, tan(0)=0. This helps identify the base function.',
        },
        {
          katex: String.raw`\text{Check if the graph is reflected or shifted vertically.}`,
          text: 'A reflection flips the curve; a vertical shift moves it up or down by a constant.',
        },
      ],
      summary: 'Use the value at x=0 and the shape to decide sin/cos/tan, then account for sign and vertical shift.',
    },
    hints: [
      { katex: String.raw`\sin(0)=0,\;\cos(0)=1,\;\tan(0)=0`, text: 'Start by checking the y-intercept.' },
    ],
  };
}
