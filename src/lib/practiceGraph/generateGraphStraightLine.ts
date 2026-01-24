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

function fmtLineAxByC(input: { a: number; b: number; c: number }) {
  const { a, b, c } = input;
  const aPart = a === 0 ? '' : (a === 1 ? 'x' : a === -1 ? '-x' : `${a}x`);
  const bPartRaw = b === 0 ? '' : (b === 1 ? 'y' : b === -1 ? '-y' : `${b}y`);
  const bPart = bPartRaw ? (aPart ? (b > 0 ? ` + ${bPartRaw}` : ` - ${bPartRaw.replace('-', '')}`) : bPartRaw) : '';
  const lhs = `${aPart}${bPart}`.trim() || '0';
  return `${lhs} = ${c}`;
}

function fmtCircleFromDiameter(input: { ax: number; ay: number; bx: number; by: number }) {
  const { ax, ay, bx, by } = input;
  // Circle with diameter AB:
  // (x-ax)(x-bx) + (y-ay)(y-by) = 0
  // => x^2 + y^2 - (ax+bx)x - (ay+by)y + (ax*bx + ay*by) = 0
  const sx = ax + bx;
  const sy = ay + by;
  const k = ax * bx + ay * by;

  const xTerm = sx === 0 ? '' : sx > 0 ? ` - ${sx}x` : ` + ${Math.abs(sx)}x`;
  const yTerm = sy === 0 ? '' : sy > 0 ? ` - ${sy}y` : ` + ${Math.abs(sy)}y`;
  const cTerm = k === 0 ? '' : k > 0 ? ` + ${k}` : ` - ${Math.abs(k)}`;
  return `x^2 + y^2${xTerm}${yTerm}${cTerm} = 0`;
}

function normalizeIntTriple(a: number, b: number, c: number) {
  // Make a,b,c reasonably small / consistent sign.
  const sign = (a < 0 || (a === 0 && b < 0)) ? -1 : 1;
  return { a: a * sign, b: b * sign, c: c * sign };
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
    const wCoords = Math.max(0, Number((w as any).line_circle_intersections_coords_ab ?? 0));
    const wLen = Math.max(0, Number((w as any).line_circle_intersections_length_ab ?? 0));
    const wMid = Math.max(0, Number((w as any).line_circle_intersections_midpoint_ab ?? 0));
    const total = wMcq + wYInt + wGrad + wCoords + wLen + wMid;

    if (total > 0) {
      const r = rng.next() * total;
      if (r < wMcq) return 'mcq_graph_equation';
      if (r < wMcq + wYInt) return 'y_intercept_from_equation';
      if (r < wMcq + wYInt + wGrad) return 'gradient_from_equation';
      if (r < wMcq + wYInt + wGrad + wCoords) return 'line_circle_intersections_coords_ab';
      if (r < wMcq + wYInt + wGrad + wCoords + wLen) return 'line_circle_intersections_length_ab';
      return 'line_circle_intersections_midpoint_ab';
    }

    const roll = rng.int(0, 9);
    if (input.difficulty === 'easy') {
      // Make y-intercept questions more common than slope questions.
      return roll < 4
        ? 'mcq_graph_equation'
        : roll < 9
          ? 'y_intercept_from_equation'
          : 'gradient_from_equation';
    }
    if (input.difficulty === 'medium') {
      return roll < 5
        ? 'mcq_graph_equation'
        : roll < 9
          ? 'y_intercept_from_equation'
          : 'gradient_from_equation';
    }
    // For hard/ultimate, allow the AB-intersection family occasionally.
    if (roll <= 5) return 'mcq_graph_equation';
    if (roll <= 7) return 'y_intercept_from_equation';
    if (roll === 8) return 'gradient_from_equation';
    return rng.int(0, 2) === 0
      ? 'line_circle_intersections_coords_ab'
      : rng.int(0, 1) === 0
        ? 'line_circle_intersections_length_ab'
        : 'line_circle_intersections_midpoint_ab';
  })();

  if (variant.startsWith('line_circle_intersections_')) {
    // Build an easy-to-solve configuration:
    // - Choose integer points A and B such that |AB| is an integer.
    // - Define the circle with diameter AB (guarantees A and B are intersection points).
    // - Define the line passing through A and B.

    const triples: Array<{ dx: number; dy: number }> =
      input.difficulty === 'easy'
        ? [
            { dx: 3, dy: 4 },
            { dx: 4, dy: 3 },
            { dx: 6, dy: 8 },
            { dx: 8, dy: 6 },
          ]
        : input.difficulty === 'medium'
          ? [
              { dx: 3, dy: 4 },
              { dx: 4, dy: 3 },
              { dx: 5, dy: 12 },
              { dx: 12, dy: 5 },
              { dx: 6, dy: 8 },
              { dx: 8, dy: 6 },
            ]
          : [
              { dx: 3, dy: 4 },
              { dx: 4, dy: 3 },
              { dx: 5, dy: 12 },
              { dx: 12, dy: 5 },
              { dx: 7, dy: 24 },
              { dx: 24, dy: 7 },
              { dx: 8, dy: 15 },
              { dx: 15, dy: 8 },
            ];

    const pick = triples[rng.int(0, triples.length - 1)]!;
    const sx = input.difficulty === 'easy' ? 5 : input.difficulty === 'medium' ? 7 : 10;
    const sy = input.difficulty === 'easy' ? 5 : input.difficulty === 'medium' ? 7 : 10;
    const ax = rng.int(-sx, sx);
    const ay = rng.int(-sy, sy);
    const bx = ax + pick.dx;
    const by = ay + pick.dy;

    const dx = bx - ax;
    const dy = by - ay;
    const lengthAB = Math.sqrt(dx * dx + dy * dy);

    // Line through A and B: dy*x - dx*y = dy*ax - dx*ay
    const line0 = normalizeIntTriple(dy, -dx, dy * ax - dx * ay);
    const lineEq = fmtLineAxByC(line0);
    const circleEq = fmtCircleFromDiameter({ ax, ay, bx, by });

    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;

    // Graph spec (static in explanation): plot circle + line + mark A,B.
    const cx = midX;
    const cy = midY;
    const r = lengthAB / 2;

    const pad = input.difficulty === 'easy' ? 4 : input.difficulty === 'medium' ? 5 : 6;
    const xMin = Math.floor(Math.min(ax, bx, cx - r) - pad);
    const xMax = Math.ceil(Math.max(ax, bx, cx + r) + pad);
    const yMin = Math.floor(Math.min(ay, by, cy - r) - pad);
    const yMax = Math.ceil(Math.max(ay, by, cy + r) + pad);

    const circlePts: Array<{ x: number; y: number }> = [];
    const n = 240;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      circlePts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
    }

    // Avoid vertical line configurations (dx=0) in our triples, but still keep fallback.
    const lineFn = dx === 0
      ? ((x: number) => Number.NaN)
      : ((x: number) => (dy / dx) * (x - ax) + ay);

    const graphSpec = {
      width: 720,
      height: 520,
      window: { xMin, xMax, yMin, yMax },
      equalAspect: true,
      caption: 'Line and circle intersect at points A and B',
      plot: [
        { kind: 'polyline' as const, points: circlePts, stroke: '#2563eb', strokeWidth: 2 },
        ...(dx === 0
          ? [{ kind: 'polyline' as const, points: [{ x: ax, y: yMin }, { x: ax, y: yMax }], stroke: '#dc2626', strokeWidth: 2 }]
          : [{ kind: 'function' as const, fn: lineFn, stroke: '#dc2626', strokeWidth: 2 }]),
        { kind: 'point' as const, at: { x: ax, y: ay }, r: 4, fill: '#111827' },
        { kind: 'point' as const, at: { x: bx, y: by }, r: 4, fill: '#111827' },
        { kind: 'label' as const, at: { x: ax + 0.4, y: ay + 0.4 }, text: 'A', fill: '#111827', fontSize: 16 },
        { kind: 'label' as const, at: { x: bx + 0.4, y: by + 0.4 }, text: 'B', fill: '#111827', fontSize: 16 },
      ],
    };

    const promptBlocksBase = [
      { kind: 'text' as const, content: 'The line ' },
      { kind: 'math' as const, content: lineEq },
      { kind: 'text' as const, content: ' meets the curve ' },
      { kind: 'math' as const, content: circleEq },
      { kind: 'text' as const, content: ' at the points ' },
      { kind: 'math' as const, content: 'A' },
      { kind: 'text' as const, content: ' and ' },
      { kind: 'math' as const, content: 'B' },
      { kind: 'text' as const, content: '.' },
    ];

    const promptKatexBase = String.raw`\text{The line }${lineEq}\text{ meets the curve }${circleEq}\text{ at the points }A\text{ and }B.`;

    if (variant === 'line_circle_intersections_coords_ab') {
      return {
        kind: 'graph',
        id: stableId('graph-straight-line', input.seed, `line-circle-coords-${ax}-${ay}-${bx}-${by}`),
        topicId: 'graph_straight_line',
        difficulty: input.difficulty,
        seed: input.seed,
        katexQuestion: '',
        generatorParams: {
          kind: variant,
          graphInExplanationOnly: true,
          expectedParts: [ax, ay, bx, by],
          expectedPartsOrdered: true,
          expectedTolerance: 0.02,
        },
        promptText: '',
        promptBlocks: [
          ...promptBlocksBase,
          { kind: 'text' as const, content: ' Find the coordinates of ' },
          { kind: 'math' as const, content: 'A' },
          { kind: 'text' as const, content: ' and ' },
          { kind: 'math' as const, content: 'B' },
          { kind: 'text' as const, content: '.' },
        ],
        promptKatex: undefined,
        inputFields: [
          { id: 'xA', label: String.raw`x_{A}`, kind: 'number' },
          { id: 'yA', label: String.raw`y_{A}`, kind: 'number' },
          { id: 'xB', label: String.raw`x_{B}`, kind: 'number' },
          { id: 'yB', label: String.raw`y_{B}`, kind: 'number' },
        ],
        graphSpec,
        svgDataUrl: '',
        svgAltText: 'A circle and a straight line intersecting at two points labeled A and B.',
        katexExplanation: {
          steps: [
            { katex: promptKatexBase, text: 'We are told that A and B are the intersection points, so they satisfy both equations (the line and the curve).' },
            { katex: String.raw`\text{Solve simultaneously by substitution.}`, text: 'Use the line equation to express one variable in terms of the other, then substitute into the curve.' },
            { katex: String.raw`\text{Line: }${lineEq}`, text: 'Rearrange the line to make substitution straightforward.' },
            { katex: String.raw`\text{Curve: }${circleEq}`, text: 'Substitute from the line into the curve to get a quadratic in one variable.' },
            { katex: String.raw`\Rightarrow\ (x,y)=(${ax},${ay})\ \text{or}\ (x,y)=(${bx},${by})`, text: 'The two solutions correspond to the two intersection points A and B.' },
            { katex: String.raw`A=(${ax},${ay}),\quad B=(${bx},${by})`, text: 'Report both intersection points as coordinates.' },
          ],
          summary: 'At intersections, both equations hold. Substitute the line into the curve to get two solutions (A and B).',
        },
      };
    }

    if (variant === 'line_circle_intersections_length_ab') {
      return {
        kind: 'graph',
        id: stableId('graph-straight-line', input.seed, `line-circle-length-${ax}-${ay}-${bx}-${by}`),
        topicId: 'graph_straight_line',
        difficulty: input.difficulty,
        seed: input.seed,
        katexQuestion: '',
        generatorParams: {
          kind: variant,
          graphInExplanationOnly: true,
          expectedValue: lengthAB,
        },
        promptText: '',
        promptBlocks: [
          ...promptBlocksBase,
          { kind: 'text' as const, content: ' Find the length of the line ' },
          { kind: 'math' as const, content: 'AB' },
          { kind: 'text' as const, content: '.' },
        ],
        promptKatex: undefined,
        inputFields: [{ id: 'ans', label: 'Length of AB', kind: 'number' }],
        graphSpec,
        svgDataUrl: '',
        svgAltText: 'A circle and a straight line intersecting at two points labeled A and B.',
        katexExplanation: {
          steps: [
            { katex: promptKatexBase, text: 'To find the length AB, first determine the intersection points A and B (they satisfy both equations).' },
            { katex: String.raw`A=(${ax},${ay}),\quad B=(${bx},${by})`, text: 'Solving the simultaneous equations gives these two points.' },
            { katex: String.raw`AB = \sqrt{(x_B-x_A)^2 + (y_B-y_A)^2}`, text: 'Use the distance formula between two points.' },
            { katex: String.raw`AB = \sqrt{(${bx}-${ax})^2 + (${by}-${ay})^2}`, text: 'Substitute the coordinate differences.' },
            { katex: String.raw`AB = \sqrt{${dx * dx} + ${dy * dy}} = ${Number(lengthAB.toFixed(6))}`, text: 'Compute the magnitude of the displacement.' },
            { katex: String.raw`\boxed{AB = ${Number(lengthAB.toFixed(6))}}`, text: 'So the length of AB is the magnitude shown above.' },
          ],
          summary: String.raw`\text{Find }A\text{ and }B\text{, then apply the distance formula }AB = \sqrt{(x_{B}-x_{A})^2 + (y_{B}-y_{A})^2}.`,
        },
      };
    }

    // midpoint
    return {
      kind: 'graph',
      id: stableId('graph-straight-line', input.seed, `line-circle-mid-${ax}-${ay}-${bx}-${by}`),
      topicId: 'graph_straight_line',
      difficulty: input.difficulty,
      seed: input.seed,
      katexQuestion: '',
      generatorParams: {
        kind: variant,
        graphInExplanationOnly: true,
        expectedParts: [midX, midY],
        expectedPartsOrdered: true,
        expectedTolerance: 0.02,
      },
      promptText: '',
      promptBlocks: [
        ...promptBlocksBase,
        { kind: 'text' as const, content: ' Find the midpoint of the line ' },
        { kind: 'math' as const, content: 'AB' },
        { kind: 'text' as const, content: '.' },
      ],
      promptKatex: undefined,
      inputFields: [
        { id: 'mx', label: 'x-coordinate of midpoint', kind: 'number' },
        { id: 'my', label: 'y-coordinate of midpoint', kind: 'number' },
      ],
      graphSpec,
      svgDataUrl: '',
      svgAltText: 'A circle and a straight line intersecting at two points labeled A and B.',
      katexExplanation: {
        steps: [
          { katex: promptKatexBase, text: 'The midpoint is halfway between A and B. First identify A and B by solving the simultaneous equations.' },
          { katex: String.raw`A=(${ax},${ay}),\quad B=(${bx},${by})`, text: 'These are the intersection points.' },
          { katex: String.raw`M = \left(\frac{x_A+x_B}{2},\frac{y_A+y_B}{2}\right)`, text: 'Use the midpoint formula.' },
          { katex: String.raw`M = \left(\frac{${ax}+${bx}}{2},\frac{${ay}+${by}}{2}\right)`, text: 'Substitute the coordinates.' },
          { katex: String.raw`M = (${midX},${midY})`, text: 'This is the midpoint of segment AB.' },
        ],
        summary: String.raw`\text{Once }A\text{ and }B\text{ are known, the midpoint is }\left(\frac{x_{A}+x_{B}}{2},\frac{y_{A}+y_{B}}{2}\right).`,
      },
    };
  }

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

    const wrongs = unique.filter((u) => u !== lineLatex).slice(0, 3);
    for (let i = wrongs.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const tmp = wrongs[i];
      wrongs[i] = wrongs[j];
      wrongs[j] = tmp;
    }

    // Bias the correct answer toward option D more often.
    // Probabilities: A 20%, B 20%, C 20%, D 40%
    const r = rng.next();
    const targetIndex = r < 0.2 ? 0 : r < 0.4 ? 1 : r < 0.6 ? 2 : 3;

    const shuffled = wrongs.slice();
    shuffled.splice(targetIndex, 0, lineLatex);
    return { shuffled, correctIndex: targetIndex };
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
