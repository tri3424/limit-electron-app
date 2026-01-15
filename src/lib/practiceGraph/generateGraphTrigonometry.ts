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

export function generateGraphTrigonometryMcq(input: {
  topicId: PracticeTopicId;
  difficulty: PracticeDifficulty;
  seed: number;
  variantWeights?: Record<string, number>;
}): GraphPracticeQuestion {
  const rng = mulberry32(input.seed);
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
