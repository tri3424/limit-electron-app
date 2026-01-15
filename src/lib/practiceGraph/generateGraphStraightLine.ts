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
    curves.push(`<polyline fill="none" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" points="${pts}" />`);
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

function lineToKatex(m: number, d: number) {
  if (m === 0) {
    return `y = ${d}`;
  }
  const mPart = m === 1 ? 'x' : m === -1 ? '-x' : `${m}x`;
  const dPart = d === 0 ? '' : ` ${fmtSigned(d)}`;
  return `y = ${mPart}${dPart}`;
}

export function generateGraphStraightLineMcq(input: {
  topicId: PracticeTopicId;
  difficulty: PracticeDifficulty;
  seed: number;
  variantWeights?: Record<string, number>;
}): GraphPracticeQuestion {
  const rng = mulberry32(input.seed);

  const variant = (() => {
    // Keep some probability on the existing graph-MCQ format, but add more skills:
    // - Read y-intercept/slope from a given straight-line equation.
    const w = input.variantWeights ?? {};
    const wMcq = Math.max(0, Number(w.mcq_graph_equation ?? 0));
    const wYInt = Math.max(0, Number(w.y_intercept_from_equation ?? 0));
    const wGrad = Math.max(0, Number(w.gradient_from_equation ?? 0));
    const total = wMcq + wYInt + wGrad;

    if (total > 0) {
      const r = rng.next() * total;
      if (r < wMcq) return 'mcq_graph_equation';
      if (r < wMcq + wYInt) return 'y_intercept_from_equation';
      return 'gradient_from_equation';
    }

    const roll = rng.int(0, 9);
    if (input.difficulty === 'easy') {
      // Make y-intercept questions more common than slope questions.
      return roll < 4 ? 'mcq_graph_equation' : roll < 9 ? 'y_intercept_from_equation' : 'gradient_from_equation';
    }
    if (input.difficulty === 'medium') {
      return roll < 5 ? 'mcq_graph_equation' : roll < 9 ? 'y_intercept_from_equation' : 'gradient_from_equation';
    }
    return roll < 5 ? 'mcq_graph_equation' : roll < 9 ? 'y_intercept_from_equation' : 'gradient_from_equation';
  })();

  if (variant !== 'mcq_graph_equation') {
    const slopeRange = input.difficulty === 'easy' ? 5 : input.difficulty === 'medium' ? 7 : 9;
    let m = 0;
    while (m === 0) m = rng.int(-slopeRange, slopeRange);

    const dRange = input.difficulty === 'easy' ? 8 : input.difficulty === 'medium' ? 10 : 12;
    const d = rng.int(-dRange, dRange);

    const lineLatex = lineToKatex(m, d);

    const expects = variant === 'y_intercept_from_equation' ? d : m;
    const prompt =
      variant === 'y_intercept_from_equation'
        ? String.raw`\text{The line is }${lineLatex}\text{. Find the }y\text{-intercept value.}`
        : String.raw`\text{The line is }${lineLatex}\text{. Find the Slope }m\text{.}`;

    const fieldLabel = variant === 'y_intercept_from_equation' ? 'y-intercept' : 'Slope (m)';

    return {
      kind: 'graph',
      id: stableId('graph-straight-line', input.seed, `${variant}-${m}-${d}`),
      topicId: 'graph_straight_line',
      difficulty: input.difficulty,
      seed: input.seed,
      katexQuestion: '',
      generatorParams: {
        kind: variant,
        line: { m, d },
        expectedValue: expects,
      },
      promptText: '',
      promptKatex: prompt,
      inputFields: [{ id: 'ans', label: fieldLabel, kind: 'number' }],
      graphSpec: undefined,
      svgDataUrl: '',
      svgAltText: '',
      katexExplanation: {
        steps:
          variant === 'y_intercept_from_equation'
            ? [
                { katex: lineLatex, text: 'A straight line can be written in the form y = mx + d.' },
                { katex: String.raw`\text{The }y\text{-intercept is the value of }y\text{ when }x=0.`, text: 'At the y-axis, x = 0.' },
                { katex: String.raw`x=0\;\Rightarrow\; y = ${m}\cdot 0 + ${d} = ${d}`, text: `So the y-intercept value is ${d}.` },
              ]
            : [
                { katex: lineLatex, text: 'A straight line can be written in the form y = mx + d.' },
                { katex: String.raw`\text{The Slope }m\text{ is the coefficient of }x.`, text: 'Read off the coefficient of x.' },
                { katex: String.raw`m = ${m}`, text: `So the Slope is ${m}.` },
              ],
        summary:
          variant === 'y_intercept_from_equation'
            ? 'Set x = 0 to find the y-intercept, or read it directly as d in y = mx + d.'
            : 'In y = mx + d, the Slope is the coefficient of x.',
      },
    };
  }

  const xMin = -10;
  const xMax = 10;
  const yMin = -10;
  const yMax = 10;

  const slopeRange = input.difficulty === 'easy' ? 4 : input.difficulty === 'medium' ? 5 : 6;
  let m = 0;
  while (m === 0) m = rng.int(-slopeRange, slopeRange);

  const dRange = input.difficulty === 'easy' ? 6 : input.difficulty === 'medium' ? 8 : 10;
  const d = rng.int(-dRange, dRange);

  const lineLatex = lineToKatex(m, d);

  const options = (() => {
    const o1 = lineToKatex(-m, d); // sign error on slope
    const o2 = lineToKatex(clamp(m + (m >= 0 ? 1 : -1), -6, 6), d); // slope perturbation
    const o3 = lineToKatex(m, d + (input.difficulty === 'easy' ? 2 : 3)); // intercept shift

    const raw = [lineLatex, o1, o2, o3];
    const unique: string[] = [];
    for (const r of raw) {
      if (!unique.includes(r)) unique.push(r);
    }
    while (unique.length < 4) {
      unique.push(lineToKatex(m, d + unique.length));
    }

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

  const lineFn = (x: number) => m * x + d;

  const findGridPoint = (xPref: number): { x: number; y: number } | null => {
    const y = m * xPref + d;
    if (y < yMin || y > yMax) return null;
    return { x: xPref, y };
  };

  const p1 =
    findGridPoint(0) ||
    findGridPoint(1) ||
    (() => {
      for (let x = -8; x <= 8; x++) {
        const p = findGridPoint(x);
        if (p) return p;
      }
      return { x: 0, y: d };
    })();

  const p2 =
    findGridPoint(p1.x + 1) ||
    (() => {
      for (let dx = 1; dx <= 8; dx++) {
        const p = findGridPoint(p1.x + dx);
        if (p) return p;
      }
      // fallback: use another simple x
      return { x: 1, y: m + d };
    })();

  const caption = 'Straight line on a coordinate grid (1 unit per tick)';

  const explanation = {
    steps: [
      {
        katex: String.raw`\text{Choose two clear points on the line.}`,
        text: 'Pick two grid-intersection points on the line to reduce reading errors.',
      },
      {
        katex: String.raw`(x_1,y_1)=(${p1.x},${p1.y}),\quad (x_2,y_2)=(${p2.x},${p2.y})`,
        text: 'Example points taken from the graph (any two accurate points will work).',
      },
      {
        katex: `m = \\frac{y_2 - y_1}{x_2 - x_1}`,
        text: 'The gradient (slope) is the change in y divided by the change in x.',
      },
      {
        katex: String.raw`m = \frac{${p2.y} - ${p1.y}}{${p2.x} - ${p1.x}} = ${m}`,
        text: 'Substitute the two points into the slope formula.',
      },
      {
        katex: `y = mx + d`,
        text: 'Use the form y = mx + d, then substitute a point to find d.',
      },
      {
        katex: String.raw`${p1.y} = (${m})(${p1.x}) + d\quad\Rightarrow\quad d = ${p1.y - m * p1.x}`,
        text: 'Substitute one point to solve for the y-intercept d.',
      },
      {
        katex: `y = ${m}x ${fmtSigned(d).replace('+ ', '+').replace('- ', '-')}`.replace('+-', '-'),
        text: 'This is the equation of the straight line shown.',
      },
    ],
    summary: 'Pick two points → compute slope → substitute a point to find d → write y = mx + d.',
    commonMistake: {
      katex: `y = ${-m}x ${fmtSigned(d).replace('+ ', '+').replace('- ', '-')}`.replace('+-', '-'),
      text: 'A common mistake is using the wrong sign for the slope when counting rise/run.',
    },
  };

  const hints = explanation.steps.slice(0, 2).map((s) => ({ katex: s.katex, text: s.text }));

  return {
    kind: 'graph',
    id: stableId('graph-straight-line', input.seed, `${m}-${d}`),
    topicId: 'graph_straight_line',
    difficulty: input.difficulty,
    seed: input.seed,
    generatorParams: {
      line: { m, d },
      window: { xMin, xMax, yMin, yMax, tickStep: 1 },
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
      plot: [{ kind: 'function', fn: lineFn, stroke: '#dc2626', strokeWidth: 2 }],
    },
    svgDataUrl: buildCartesianSvg({
      xMin,
      xMax,
      yMin,
      yMax,
      width: 720,
      height: 480,
      tickStep: 1,
      caption,
      plot: [{ kind: 'polyline', points: [{ x: xMin, y: lineFn(xMin) }, { x: xMax, y: lineFn(xMax) }], stroke: '#dc2626', strokeWidth: 2 }],
    }).dataUrl,
    svgAltText: `A coordinate grid with a red straight line. ${caption}.`,
    katexExplanation: explanation,
    hints,
  };
}
