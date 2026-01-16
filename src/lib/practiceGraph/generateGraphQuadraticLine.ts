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

function fmtSigned(n: number) {
  if (n === 0) return '';
  return n > 0 ? `+ ${n}` : `- ${Math.abs(n)}`;
}

function lineToKatex(m: number, d: number) {
  if (m === 0) {
    return `y = ${d}`;
  }
  const mPart = m === 1 ? 'x' : m === -1 ? '-x' : `${m}x`;
  const dPart = d === 0 ? '' : ` ${fmtSigned(d)}`;
  return `y = ${mPart}${dPart}`;
}

function parabolaToKatex(a: number, b: number, c: number) {
  const aPart = a === 1 ? 'x^2' : a === -1 ? '-x^2' : `${a}x^2`;
  const bPart = b === 0 ? '' : ` ${fmtSigned(b)}x`;
  const cPart = c === 0 ? '' : ` ${fmtSigned(c)}`;
  return `y = ${aPart}${bPart}${cPart}`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function makeSvgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildCartesianSvg(input: {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  width: number;
  height: number;
  tickStep: number;
  caption: string;
  plot: Array<{ kind: 'polyline'; points: Array<{ x: number; y: number }>; stroke: string; strokeWidth: number }>;
}): { svg: string; altText: string; dataUrl: string } {
  const { xMin, xMax, yMin, yMax, width, height, tickStep, caption, plot } = input;

  const padL = 48;
  const padR = 18;
  const padT = 18;
  const padB = 44;

  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const sx = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * innerW;
  const sy = (y: number) => padT + (1 - (y - yMin) / (yMax - yMin)) * innerH;

  const axisColor = '#111827';
  const gridColor = '#e5e7eb';
  const labelColor = '#111827';

  const x0 = clamp(0, xMin, xMax);
  const y0 = clamp(0, yMin, yMax);

  const xAxisY = sy(y0);
  const yAxisX = sx(x0);

  const ticks: string[] = [];
  for (let x = Math.ceil(xMin / tickStep) * tickStep; x <= xMax; x += tickStep) {
    const px = sx(x);
    ticks.push(`<line x1="${px}" y1="${padT}" x2="${px}" y2="${padT + innerH}" stroke="${gridColor}" stroke-width="1" />`);
    ticks.push(`<line x1="${px}" y1="${xAxisY - 4}" x2="${px}" y2="${xAxisY + 4}" stroke="${axisColor}" stroke-width="1" />`);
    if (x !== 0) {
      ticks.push(`<text x="${px}" y="${padT + innerH + 18}" text-anchor="middle" font-size="12" fill="${labelColor}">${x}</text>`);
    }
  }
  for (let y = Math.ceil(yMin / tickStep) * tickStep; y <= yMax; y += tickStep) {
    const py = sy(y);
    ticks.push(`<line x1="${padL}" y1="${py}" x2="${padL + innerW}" y2="${py}" stroke="${gridColor}" stroke-width="1" />`);
    ticks.push(`<line x1="${yAxisX - 4}" y1="${py}" x2="${yAxisX + 4}" y2="${py}" stroke="${axisColor}" stroke-width="1" />`);
    if (y !== 0) {
      ticks.push(`<text x="${padL - 10}" y="${py + 4}" text-anchor="end" font-size="12" fill="${labelColor}">${y}</text>`);
    }
  }

  const curves: string[] = [];
  for (const p of plot) {
    const pts = p.points
      .map((pt) => `${sx(pt.x).toFixed(2)},${sy(pt.y).toFixed(2)}`)
      .join(' ');
    curves.push(
      `<polyline fill="none" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" points="${pts}" />`
    );
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${caption.replace(/"/g, '&quot;')}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
  ${ticks.join('\n  ')}
  <line x1="${padL}" y1="${xAxisY}" x2="${padL + innerW}" y2="${xAxisY}" stroke="${axisColor}" stroke-width="2" />
  <line x1="${yAxisX}" y1="${padT}" x2="${yAxisX}" y2="${padT + innerH}" stroke="${axisColor}" stroke-width="2" />
  <text x="${padL + innerW}" y="${xAxisY - 8}" text-anchor="end" font-size="12" fill="${labelColor}">x</text>
  <text x="${yAxisX + 8}" y="${padT + 14}" text-anchor="start" font-size="12" fill="${labelColor}">y</text>
  ${curves.join('\n  ')}
  <text x="${padL}" y="${height - 14}" text-anchor="start" font-size="12" fill="#374151">${caption}</text>
</svg>`;

  const dataUrl = makeSvgDataUrl(svg);
  return { svg, dataUrl, altText: caption };
}

function yParabola(a: number, b: number, c: number, x: number) {
  return a * x * x + b * x + c;
}

export function generateGraphQuadraticLineMcq(input: {
  topicId: PracticeTopicId;
  difficulty: PracticeDifficulty;
  seed: number;
  variantWeights?: Record<string, number>;
}): GraphPracticeQuestion {
  const rng = mulberry32(input.seed);

  const variant = (() => {
    // Add a non-MCQ skill variant: read y-intercept directly from a quadratic equation.
    // y-intercept is y when x = 0, so for y = ax^2 + bx + c it is simply c.
    const w = input.variantWeights ?? {};
    const wMcq = Math.max(0, Number(w.mcq_quad_line ?? 0));
    const wYInt = Math.max(0, Number(w.y_intercept_from_quadratic_equation ?? 0));
    const total = wMcq + wYInt;
    if (total > 0) {
      return rng.next() * total < wYInt ? 'y_intercept_from_quadratic_equation' : 'mcq_quad_line';
    }

    const roll = rng.int(0, 9);
    if (input.difficulty === 'easy') return roll < 2 ? 'y_intercept_from_quadratic_equation' : 'mcq_quad_line';
    if (input.difficulty === 'medium') return roll < 3 ? 'y_intercept_from_quadratic_equation' : 'mcq_quad_line';
    return roll < 4 ? 'y_intercept_from_quadratic_equation' : 'mcq_quad_line';
  })() as 'y_intercept_from_quadratic_equation' | 'mcq_quad_line';

  if (variant === 'y_intercept_from_quadratic_equation') {
    const a = rng.next() < 0.5 ? 1 : -1;
    const bRange = input.difficulty === 'easy' ? 3 : input.difficulty === 'medium' ? 5 : 7;
    const cRange = input.difficulty === 'easy' ? 6 : input.difficulty === 'medium' ? 8 : 10;
    const b = rng.int(-bRange, bRange);
    const c = rng.int(-cRange, cRange);
    const parabolaLatex = parabolaToKatex(a, b, c);

    return {
      kind: 'graph',
      id: stableId('graph-quad-intercept', input.seed, `${a}-${b}-${c}`),
      topicId: 'graph_quadratic_line',
      difficulty: input.difficulty,
      seed: input.seed,
      katexQuestion: '',
      generatorParams: {
        kind: 'y_intercept_from_quadratic_equation',
        parabola: { a, b, c },
        expectedValue: c,
      },
      promptText: '',
      promptKatex: String.raw`\text{The graph is }${parabolaLatex}\text{. Find the }y\text{-intercept value.}`,
      inputFields: [{ id: 'ans', label: 'y-intercept', kind: 'number' }],
      graphSpec: undefined,
      svgDataUrl: '',
      svgAltText: '',
      katexExplanation: {
        steps: [
          { katex: parabolaLatex, text: 'A quadratic can be written as y = ax^2 + bx + c.' },
          { katex: String.raw`\text{The }y\text{-intercept is the value of }y\text{ when }x=0.`, text: 'At the y-axis, x = 0.' },
          { katex: String.raw`x=0\;\Rightarrow\; y = a\cdot 0^2 + b\cdot 0 + c = c`, text: 'Substitute x = 0.' },
          { katex: String.raw`y\text{-intercept} = ${c}`, text: `So the y-intercept value is ${c}.` },
        ],
        summary: 'Set x = 0 to find the y-intercept. For y = ax^2 + bx + c, the y-intercept is c.',
      },
    };
  }

  // Visible window
  const xMin = -10;
  const xMax = 10;
  const yMin = -10;
  const yMax = 10;

  // Pick parabola parameters
  const a = rng.next() < 0.5 ? 1 : -1;
  const bRange = input.difficulty === 'easy' ? 3 : input.difficulty === 'medium' ? 5 : 7;
  const cRange = input.difficulty === 'easy' ? 6 : input.difficulty === 'medium' ? 8 : 10;
  const b = rng.int(-bRange, bRange);
  const c = rng.int(-cRange, cRange);

  // Choose two distinct x-values for intersections and define the line through those intersection points.
  // This guarantees the line intersects the parabola at least at those x values.
  let x1 = rng.int(-6, 0);
  let x2 = rng.int(1, 6);
  if (x1 === x2) x2 = x1 + 1;

  const y1 = yParabola(a, b, c, x1);
  const y2 = yParabola(a, b, c, x2);

  // Keep them inside the visible window by resampling if necessary.
  if (y1 < yMin || y1 > yMax || y2 < yMin || y2 > yMax) {
    // Deterministic fallback: clamp y via shifting c (keeps determinism).
    const shift = rng.int(-4, 4);
    const c2 = c + shift;
    const yy1 = yParabola(a, b, c2, x1);
    const yy2 = yParabola(a, b, c2, x2);
    // If still out of range, clamp the points visually by choosing closer x's.
    if (yy1 < yMin || yy1 > yMax || yy2 < yMin || yy2 > yMax) {
      x1 = -2;
      x2 = 2;
    }
  }

  const yy1 = yParabola(a, b, c, x1);
  const yy2 = yParabola(a, b, c, x2);

  const m = (yy2 - yy1) / (x2 - x1);
  // force integer slope for now (MCQ clarity)
  const mInt = clamp(Math.round(m), -6, 6);
  const d = Math.round(yy1 - mInt * x1);

  const parabolaLatex = parabolaToKatex(a, b, c);
  const lineLatex = lineToKatex(mInt, d);

  const options = (() => {
    const d1 = lineToKatex(-mInt, d); // sign error
    const d2 = lineToKatex(mInt + (mInt >= 0 ? 1 : -1), d); // slope perturbation
    const d3 = lineToKatex(mInt, d + (input.difficulty === 'easy' ? 2 : 3)); // intercept shift

    const raw = [lineLatex, d1, d2, d3];
    const unique: string[] = [];
    for (const r of raw) {
      if (!unique.includes(r)) unique.push(r);
    }
    while (unique.length < 4) {
      unique.push(lineToKatex(mInt, d + unique.length));
    }

    // Shuffle deterministically
    const order = [0, 1, 2, 3];
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    const shuffled = order.map((i) => unique[i]);
    const correctIndex = shuffled.indexOf(lineLatex);
    return { shuffled, correctIndex };
  })();

  const caption = `Range: x ${xMin}..${xMax}, y ${yMin}..${yMax} (1 unit per tick)`;

  const parabolaFn = (x: number) => yParabola(a, b, c, x);
  const lineFn = (x: number) => mInt * x + d;

  // For the static SVG preview/export we still need concrete points.
  const parabolaPts: Array<{ x: number; y: number }> = [];
  const linePts: Array<{ x: number; y: number }> = [];
  const samples = 220;
  for (let i = 0; i <= samples; i++) {
    const x = xMin + (i / samples) * (xMax - xMin);
    parabolaPts.push({ x, y: parabolaFn(x) });
  }
  linePts.push({ x: xMin, y: lineFn(xMin) });
  linePts.push({ x: xMax, y: lineFn(xMax) });

  const svg = buildCartesianSvg({
    xMin,
    xMax,
    yMin,
    yMax,
    width: 720,
    height: 480,
    tickStep: 1,
    caption,
    plot: [
      { kind: 'polyline', points: parabolaPts, stroke: '#2563eb', strokeWidth: 2 },
      { kind: 'polyline', points: linePts, stroke: '#dc2626', strokeWidth: 2 },
    ],
  });

  const explanation = {
    steps: [
      {
        katex: parabolaLatex,
        text: 'The parabola is also shown on the graph, but the question asks for the straight line equation.',
      },
      {
        katex: String.raw`\text{Choose two clear points on the line.}`,
        text: `For example, use the points where the line crosses the grid at x=${x1} and x=${x2}.`,
      },
      {
        katex: String.raw`m = \frac{y_2 - y_1}{x_2 - x_1}`,
        text: 'The gradient (slope) is the change in y divided by the change in x.',
      },
      {
        katex: `m = ${mInt}`,
        text: 'Reading the rise/run from the chosen points gives the slope.',
      },
      {
        katex: `y = mx + d`,
        text: 'A straight line can be written in the form y = mx + d.',
      },
      {
        katex: `y = ${mInt}x ${fmtSigned(d).replace('+ ', '+').replace('- ', '-')}`.replace('+-', '-'),
        text: 'Substituting the slope and intercept gives the final equation.',
      },
    ],
    summary: 'Pick two points on the line → compute slope → find intercept → write y = mx + d.',
    commonMistake: {
      katex: `y = ${-mInt}x ${fmtSigned(d).replace('+ ', '+').replace('- ', '-')}`.replace('+-', '-'),
      text: 'A common mistake is to use the wrong sign for the slope when counting rise/run.',
    },
  };

  const hints = explanation.steps.slice(0, 3).map((s) => ({ katex: s.katex, text: s.text }));

  return {
    kind: 'graph',
    id: stableId('graph-quad-line', input.seed, `${a}-${b}-${c}-${mInt}-${d}`),
    topicId: 'graph_quadratic_line',
    difficulty: input.difficulty,
    seed: input.seed,
    generatorParams: {
      parabola: { a, b, c },
      line: { m: mInt, d },
      window: { xMin, xMax, yMin, yMax, tickStep: 1 },
      examplePoints: [
        { x: x1, y: yy1 },
        { x: x2, y: yy2 },
      ],
    },
    promptText: 'Which equation represents the straight line shown in the graph?',
    katexQuestion: '',
    katexOptions: options.shuffled,
    correctIndex: options.correctIndex,
    graphSpec: {
      width: 720,
      height: 480,
      window: { xMin, xMax, yMin, yMax },
      caption,
      plot: [
        { kind: 'function', fn: parabolaFn, stroke: '#2563eb', strokeWidth: 2 },
        { kind: 'function', fn: lineFn, stroke: '#dc2626', strokeWidth: 2 },
      ],
    },
    svgDataUrl: svg.dataUrl,
    svgAltText: `A coordinate grid with a blue parabola (${parabolaLatex}) and a red straight line. ${caption}.`,
    katexExplanation: explanation,
    hints,
  };
}
