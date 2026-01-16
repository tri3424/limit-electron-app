import { buildCircularMeasureDiagramSvg } from '@/lib/circularMeasureSvg';

export type CircularMeasureDifficulty = 'easy' | 'medium' | 'hard';

export type CircularMeasureProblemKind =
  | 'arc_length_forward'
  | 'arc_length_inverse_radius'
  | 'arc_length_inverse_theta'
  | 'sector_area_forward'
  | 'sector_area_inverse_radius'
  | 'sector_area_inverse_theta'
  | 'sector_perimeter_forward'
  | 'chord_length_forward'
  | 'midpoint_shaded_area_forward'
  | 'midpoint_shaded_area_inverse_radius'
  | 'segment_area_forward'
  | 'segment_area_inverse_radius'
  | 'segment_area_inverse_theta';

export type CircularMeasureProblem = {
  id: string;
  kind: CircularMeasureProblemKind;
  difficulty: CircularMeasureDifficulty;
  promptText: string;
  promptKatex: string;
  answerLatex: string;
  answerValue?: number;
  steps: Array<{ katex: string; text: string }>;
  svg: string;
  svgAltText: string;
  diagram: {
    radius: number;
    thetaRad: number;
    radiusPx: number;
  };
};

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

type PiFraction = { n: number; d: number };

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function simplifyFrac(n: number, d: number): { n: number; d: number } {
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function fracToLatex(n: number, d: number): string {
  const s = simplifyFrac(n, d);
  if (s.d === 1) return String(s.n);
  return String.raw`\frac{${s.n}}{${s.d}}`;
}

function fracToPlain(n: number, d: number): string {
  const s = simplifyFrac(n, d);
  if (s.d === 1) return String(s.n);
  return `${s.n}/${s.d}`;
}

function piMultipleLatex(n: number, d: number): string {
  const s = simplifyFrac(n, d);
  if (s.d === 1) return s.n === 1 ? String.raw`\pi` : String.raw`${s.n}\pi`;
  if (s.n === 1) return String.raw`\frac{\pi}{${s.d}}`;
  return String.raw`\frac{${s.n}\pi}{${s.d}}`;
}

function piMultiplePlain(n: number, d: number): string {
  const s = simplifyFrac(n, d);
  if (s.d === 1) return s.n === 1 ? 'π' : `${s.n}π`;
  if (s.n === 1) return `π/${s.d}`;
  return `${s.n}π/${s.d}`;
}

function simplifyPiFrac(p: PiFraction): PiFraction {
  const g = gcd(p.n, p.d);
  return { n: p.n / g, d: p.d / g };
}

function piFracToLatex(p: PiFraction): string {
  const s = simplifyPiFrac(p);
  if (s.d === 1) return s.n === 1 ? String.raw`\pi` : String.raw`${s.n}\pi`;
  if (s.n === 1) return String.raw`\frac{\pi}{${s.d}}`;
  return String.raw`\frac{${s.n}\pi}{${s.d}}`;
}

function piFracToPlain(p: PiFraction): string {
  const s = simplifyPiFrac(p);
  if (s.d === 1) return s.n === 1 ? 'π' : `${s.n}π`;
  if (s.n === 1) return `π/${s.d}`;
  return `${s.n}π/${s.d}`;
}

function piFracToNumber(p: PiFraction): number {
  const s = simplifyPiFrac(p);
  return (s.n * Math.PI) / s.d;
}

function piFracToDegrees(p: PiFraction): { deg: number; latex: string; plain: string } {
  const s = simplifyPiFrac(p);
  const num = 180 * s.n;
  const den = s.d;
  const f = simplifyFrac(num, den);
  const deg = f.n / f.d;
  // Our theta banks are chosen so this should be an integer.
  const label = Number.isInteger(deg) ? String(deg) : `${f.n}/${f.d}`;
  return { deg: deg, latex: String.raw`${label}^{\circ}`, plain: `${label}°` };
}

function rndNiceRadius(rng: Rng, difficulty: CircularMeasureDifficulty): number {
  if (difficulty === 'easy') return rng.int(3, 10);
  if (difficulty === 'medium') return rng.int(4, 12);
  return rng.int(5, 15);
}

function pickTheta(rng: Rng, difficulty: CircularMeasureDifficulty): PiFraction {
  const bankEasy: PiFraction[] = [
    { n: 1, d: 6 },
    { n: 1, d: 4 },
    { n: 1, d: 3 },
    { n: 1, d: 2 },
    { n: 2, d: 3 },
  ];
  const bankMed: PiFraction[] = [
    ...bankEasy,
    { n: 3, d: 4 },
    { n: 5, d: 6 },
    { n: 7, d: 6 },
    { n: 4, d: 3 },
  ];
  const bankHard: PiFraction[] = [
    ...bankMed,
    { n: 5, d: 4 },
    { n: 7, d: 4 },
    { n: 11, d: 6 },
    { n: 3, d: 2 },
  ];

  const bank = difficulty === 'easy' ? bankEasy : difficulty === 'medium' ? bankMed : bankHard;
  const p = bank[rng.int(0, bank.length - 1)];
  return simplifyPiFrac(p);
}

function asNumberLatex(v: number): string {
  return String(Number(v.toFixed(4))).replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1');
}

function asFixed2(v: number): string {
  return Number(v).toFixed(2);
}

function sectorArea(r: number, theta: number) {
  return 0.5 * r * r * theta;
}

function arcLength(r: number, theta: number) {
  return r * theta;
}

function sectorPerimeter(r: number, theta: number) {
  // perimeter of a sector = 2r + arc length
  return 2 * r + r * theta;
}

function chordLength(r: number, theta: number) {
  return 2 * r * Math.sin(theta / 2);
}

function midpointShadedArea(r: number, theta: number) {
  // Shaded region = sector AOB - triangle OCD, where C and D are midpoints of OA and OB.
  // Sector area = 1/2 r^2 theta
  // Triangle OCD area = 1/2 (r/2)(r/2) sin(theta) = r^2/8 * sin(theta)
  return 0.5 * r * r * theta - (r * r * Math.sin(theta)) / 8;
}

function inverseMidpointRadius(area: number, theta: number) {
  // area = r^2(4theta - sin(theta))/8
  const k = (4 * theta - Math.sin(theta)) / 8;
  if (!isFinite(k) || k <= 0) return NaN;
  return Math.sqrt(area / k);
}

function segmentArea(r: number, theta: number) {
  return 0.5 * r * r * (theta - Math.sin(theta));
}

function inverseSegmentRadius(area: number, theta: number) {
  // From: A = 1/2 r^2 (theta - sin theta)
  const denom = theta - Math.sin(theta);
  if (!isFinite(denom) || denom <= 0) return NaN;
  return Math.sqrt((2 * area) / denom);
}

export function generateCircularMeasureProblem(input: {
  seed: number;
  difficulty: CircularMeasureDifficulty;
  avoidKind?: CircularMeasureProblemKind;
  variantWeights?: Record<string, number>;
}): CircularMeasureProblem {
  const rng = mulberry32(input.seed);

  const kindPoolEasy: CircularMeasureProblemKind[] = ['arc_length_forward', 'sector_area_forward', 'arc_length_inverse_radius'];
  const kindPoolMed: CircularMeasureProblemKind[] = [
    'arc_length_forward',
    'arc_length_inverse_radius',
    'arc_length_inverse_theta',
    'sector_area_forward',
    'sector_area_inverse_radius',
    'sector_area_inverse_theta',
    'sector_perimeter_forward',
    'chord_length_forward',
    'midpoint_shaded_area_forward',
    'segment_area_forward',
  ];
  const kindPoolHard: CircularMeasureProblemKind[] = [
    'arc_length_forward',
    'arc_length_inverse_radius',
    'arc_length_inverse_theta',
    'sector_area_forward',
    'sector_area_inverse_radius',
    'sector_area_inverse_theta',
    'sector_perimeter_forward',
    'chord_length_forward',
    'midpoint_shaded_area_forward',
    'midpoint_shaded_area_inverse_radius',
    'segment_area_forward',
    'segment_area_inverse_radius',
    'segment_area_inverse_theta',
  ];

  const kindPool = input.difficulty === 'easy' ? kindPoolEasy : input.difficulty === 'medium' ? kindPoolMed : kindPoolHard;
  const pool = input.avoidKind ? kindPool.filter((k) => k !== input.avoidKind) : kindPool;

  const kind = (() => {
    const candidates = (pool.length ? pool : kindPool);
    const w = input.variantWeights ?? {};
    let total = 0;
    const weights = candidates.map((k) => {
      const wk = typeof w[k] === 'number' ? Math.max(0, Number(w[k])) : 0;
      total += wk;
      return wk;
    });
    if (!(total > 0)) {
      return candidates[rng.int(0, candidates.length - 1)];
    }
    let r = rng.next() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i] ?? 0;
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  })();

  const r = rndNiceRadius(rng, input.difficulty);
  const thetaFrac = pickTheta(rng, input.difficulty);
  const thetaBase = piFracToNumber(thetaFrac);
  const theta = kind.includes('segment') ? Math.min(thetaBase, 2 * Math.PI - thetaBase) : thetaBase;
  const thetaLatex = piFracToLatex(thetaFrac);
  const thetaPlain = piFracToPlain(thetaFrac);
  const thetaDeg = piFracToDegrees(thetaFrac);

  const askDiameter =
    kind.includes('inverse_radius') &&
    rng.next() < (input.difficulty === 'easy' ? 0.15 : input.difficulty === 'medium' ? 0.25 : 0.35);

  // When we show radians, we want decimal radians everywhere.
  const thetaRadDec = Number(theta.toFixed(2));
  const thetaRadLatex = asFixed2(thetaRadDec);
  const thetaRadPlain = thetaRadLatex;

  const showDegrees = rng.next() < (input.difficulty === 'easy' ? 0.35 : input.difficulty === 'medium' ? 0.25 : 0.15);

  const thetaShown = showDegrees ? theta : thetaRadDec;
  const thetaShownLatex = showDegrees ? thetaDeg.latex : thetaRadLatex;
  const thetaShownPlain = showDegrees ? thetaDeg.plain : `${thetaRadPlain} rad`;

  const radiusPx = input.difficulty === 'easy' ? 110 : input.difficulty === 'medium' ? 120 : 130;

  const title =
    kind.startsWith('arc_length')
      ? 'Arc length'
      : kind.startsWith('sector_area')
        ? 'Sector area'
        : kind.startsWith('sector_perimeter')
          ? 'Perimeter'
        : kind.startsWith('chord_length')
          ? 'Chord length'
        : kind.startsWith('midpoint_shaded')
          ? 'Shaded region'
        : 'Segment area';

  const baseSvg = buildCircularMeasureDiagramSvg({
    width: 440,
    height: 320,
    radiusPx,
    thetaRad: thetaShown,
    showSectorFill: kind.includes('sector') || kind.includes('segment'),
    showChord: kind.includes('segment'),
    labelR: 'r',
    labelTheta: 'θ',
    title,
  });

  const steps: Array<{ katex: string; text: string }> = [];

  const eqArc = String.raw`s = r\theta`;
  const eqArea = String.raw`A = \frac{1}{2}r^2\theta`;
  const eqSeg = String.raw`A_{\text{segment}} = \frac{1}{2}r^2(\theta - \sin\theta)`;

  let promptText = '';
  let promptKatex = '';
  let answerLatex = '';
  let answerValue: number | undefined;

  if (kind === 'arc_length_forward') {
    const s = arcLength(r, thetaShown);
    promptText = `Find the arc length of a sector with radius r = ${r} and central angle θ = ${thetaShownPlain}.`;
    promptKatex = String.raw`\text{Find the arc length }s\text{ of a sector with }r=${r},\;\theta=${thetaShownLatex}.`;

    if (input.difficulty === 'hard') {
      if (showDegrees) {
        steps.push({ katex: String.raw`\theta = ${thetaDeg.latex}`, text: 'Convert degrees to radians before using the formula.' });
        steps.push({ katex: String.raw`\theta = ${thetaDeg.latex}\cdot \frac{\pi}{180} = ${thetaLatex}`, text: 'Multiply by π/180.' });
      }
      steps.push({ katex: eqArc, text: 'Arc length uses the formula s = rθ (θ must be in radians).' });
      if (!showDegrees) steps.push({ katex: String.raw`\theta = ${thetaRadLatex}\text{ rad}`, text: 'The angle is given in radians as a decimal.' });
      steps.push({ katex: String.raw`s = ${r}\cdot ${showDegrees ? thetaLatex : thetaRadLatex}`, text: 'Substitute r and θ into s = rθ.' });
      steps.push({ katex: String.raw`s \approx ${asFixed2(s)}`, text: 'Calculate and round to 2 decimal places.' });
    } else {
      if (showDegrees) {
        steps.push({ katex: String.raw`\theta = ${thetaDeg.latex}`, text: 'Convert degrees to radians.' });
        steps.push({ katex: String.raw`\theta = ${thetaDeg.latex}\cdot \frac{\pi}{180} = ${thetaLatex}`, text: 'Multiply by π/180.' });
      }
      steps.push({ katex: eqArc, text: 'Use the arc length formula.' });
      steps.push({ katex: String.raw`s = ${r}\cdot ${showDegrees ? thetaLatex : thetaRadLatex}`, text: 'Substitute r and θ.' });
      steps.push({ katex: String.raw`s \approx ${asFixed2(s)}`, text: 'Calculate (2 d.p.).' });
    }

    answerLatex = asFixed2(s);
    answerValue = Number(asFixed2(s));
  }

  if (kind === 'arc_length_inverse_radius') {
    const s = arcLength(r, thetaRadDec);
    promptText = `A sector has arc length s = ${asFixed2(s)} and central angle θ = ${thetaRadPlain} rad. Find the ${askDiameter ? 'diameter d' : 'radius r'}.`;
    promptKatex = askDiameter
      ? String.raw`\text{A sector has }s=${asFixed2(s)},\;\theta=${thetaRadLatex}\text{ rad}.\;\text{Find }d.`
      : String.raw`\text{A sector has }s=${asFixed2(s)},\;\theta=${thetaRadLatex}\text{ rad}.\;\text{Find }r.`;

    steps.push({ katex: eqArc, text: 'Start with the arc length formula.' });
    steps.push({ katex: String.raw`${asFixed2(s)} = r\cdot ${thetaRadLatex}`, text: 'Substitute s and θ (θ in radians).' });
    steps.push({ katex: String.raw`r = \frac{${asFixed2(s)}}{${thetaRadLatex}}`, text: 'Rearrange to solve for r.' });
    if (askDiameter) {
      steps.push({ katex: String.raw`r = ${r}`, text: 'Find the radius.' });
      steps.push({ katex: String.raw`d = 2r = ${2 * r}`, text: 'Diameter is twice the radius.' });

      answerLatex = String(2 * r);
      answerValue = 2 * r;
    } else {
      steps.push({ katex: String.raw`r = ${r}`, text: 'Final answer.' });

      answerLatex = String(r);
      answerValue = r;
    }
  }

  if (kind === 'arc_length_inverse_theta') {
    const s = arcLength(r, thetaRadDec);
    promptText = `A sector has arc length s = ${asFixed2(s)} and radius r = ${r}. Find the central angle θ (in radians).`;
    promptKatex = String.raw`\text{A sector has }s=${asFixed2(s)},\;r=${r}.\;\text{Find }\theta\text{ (radians).}`;

    steps.push({ katex: eqArc, text: 'Start with the arc length formula.' });
    steps.push({ katex: String.raw`${asFixed2(s)} = ${r}\theta`, text: 'Substitute s and r.' });
    steps.push({ katex: String.raw`\theta = \frac{${asFixed2(s)}}{${r}}`, text: 'Rearrange to solve for θ.' });
    steps.push({ katex: String.raw`\theta \approx ${thetaRadLatex}`, text: 'Final answer (decimal radians).' });

    answerLatex = thetaRadLatex;
    answerValue = thetaRadDec;
  }

  if (kind === 'sector_perimeter_forward') {
    const p = sectorPerimeter(r, theta);
    promptText = `Find the perimeter of a sector with radius r = ${r} and central angle θ = ${showDegrees ? thetaDeg.plain : `${thetaRadPlain} rad`}.`;
    promptKatex = showDegrees
      ? String.raw`\text{Find the perimeter }P\text{ of a sector with }r=${r},\;\theta=${thetaDeg.latex}.`
      : String.raw`\text{Find the perimeter }P\text{ of a sector with }r=${r},\;\theta=${thetaRadLatex}\text{ rad}.`;

    const eqP = String.raw`P = 2r + r\theta`;
    if (showDegrees) {
      steps.push({ katex: String.raw`\theta = ${thetaDeg.latex}`, text: 'Convert degrees to radians.' });
      steps.push({ katex: String.raw`\theta = ${thetaDeg.latex}\cdot \frac{\pi}{180} = ${thetaLatex}`, text: 'Multiply by π/180.' });
    }
    steps.push({ katex: eqP, text: 'Perimeter of a sector is two radii plus the arc length.' });
    steps.push({ katex: String.raw`P = 2\cdot ${r} + ${r}\cdot ${showDegrees ? thetaLatex : thetaRadLatex}`, text: 'Substitute r and θ.' });
    steps.push({ katex: String.raw`P \approx ${asFixed2(p)}`, text: 'Calculate and round to 2 decimal places.' });

    answerLatex = asFixed2(p);
    answerValue = Number(asFixed2(p));
  }

  if (kind === 'sector_area_forward') {
    const a = sectorArea(r, theta);
    promptText = `Find the area of a sector with radius r = ${r} and central angle θ = ${showDegrees ? thetaDeg.plain : `${thetaRadPlain} rad`}.`;
    promptKatex = showDegrees
      ? String.raw`\text{Find the area }A\text{ of a sector with }r=${r},\;\theta=${thetaDeg.latex}.`
      : String.raw`\text{Find the area }A\text{ of a sector with }r=${r},\;\theta=${thetaRadLatex}\text{ rad}.`;

    if (input.difficulty === 'hard') {
      if (showDegrees) {
        steps.push({ katex: String.raw`\theta = ${thetaDeg.latex}`, text: 'Convert degrees to radians before using the formula.' });
        steps.push({ katex: String.raw`\theta = ${thetaDeg.latex}\cdot \frac{\pi}{180} = ${thetaLatex}`, text: 'Multiply by π/180.' });
      }
      steps.push({ katex: eqArea, text: 'Sector area uses A = (1/2)r²θ (θ must be in radians).' });
      steps.push({ katex: String.raw`A = \frac{1}{2}\cdot ${r}^2\cdot ${showDegrees ? thetaLatex : thetaRadLatex}`, text: 'Substitute r and θ.' });
      steps.push({ katex: String.raw`A \approx ${asFixed2(a)}`, text: 'Calculate and round to 2 decimal places.' });
    } else {
      if (showDegrees) {
        steps.push({ katex: String.raw`\theta = ${thetaDeg.latex}`, text: 'Convert degrees to radians.' });
        steps.push({ katex: String.raw`\theta = ${thetaDeg.latex}\cdot \frac{\pi}{180} = ${thetaLatex}`, text: 'Multiply by π/180.' });
      }
      steps.push({ katex: eqArea, text: 'Use the sector area formula.' });
      steps.push({ katex: String.raw`A = \frac{1}{2}\cdot ${r}^2\cdot ${showDegrees ? thetaLatex : thetaRadLatex}`, text: 'Substitute r and θ.' });
      steps.push({ katex: String.raw`A \approx ${asFixed2(a)}`, text: 'Calculate (2 d.p.).' });
    }

    answerLatex = asFixed2(a);
    answerValue = Number(asFixed2(a));
  }

  if (kind === 'chord_length_forward') {
    const c = chordLength(r, theta);
    promptText = `Find the chord length for a circle of radius r = ${r} subtending a central angle θ = ${thetaRadPlain} rad.`;
    promptKatex = String.raw`\text{Find the chord length }c\text{ for }r=${r},\;\theta=${thetaRadLatex}\text{ rad}.`;

    const eqC = String.raw`c = 2r\sin\left(\frac{\theta}{2}\right)`;
    steps.push({ katex: eqC, text: 'The chord length depends on the central angle and radius.' });
    steps.push({ katex: String.raw`c = 2\cdot ${r}\sin\left(\frac{${thetaRadLatex}}{2}\right)`, text: 'Substitute r and θ (decimal radians).' });
    steps.push({ katex: String.raw`c \approx ${asFixed2(c)}`, text: 'Calculate and round to 2 decimal places.' });

    steps.push({ katex: String.raw`\text{Note: The chord is only shown when a chord length is needed (or for segment diagrams).}`, text: 'If the question does not involve the chord, we do not draw it.' });

    answerLatex = asFixed2(c);
    answerValue = Number(asFixed2(c));
  }

  if (kind === 'midpoint_shaded_area_forward') {
    const area = midpointShadedArea(r, theta);
    // Show theta as a decimal radians in this family sometimes (matches typical exam style like 0.6 rad).
    const thetaDec = Number(theta.toFixed(2));
    const thetaDecLatex = asFixed2(thetaDec);

    promptText = `In a sector of radius r = ${r}, the midpoints of OA and OB are joined by a straight line. If ∠AOB = ${thetaDecLatex} radians, find the area of the shaded region.`;
    promptKatex = String.raw`\text{In a sector of radius }r=${r}\text{, C and D are the midpoints of }OA\text{ and }OB.\\\text{If }\angle AOB=${thetaDecLatex}\text{ rad, find the shaded area.}`;

    const eqSector = String.raw`A_{\text{sector}} = \frac{1}{2}r^2\theta`;
    const eqTri = String.raw`A_{\triangle OCD} = \frac{1}{2}\left(\frac{r}{2}\right)\left(\frac{r}{2}\right)\sin\theta = \frac{r^2}{8}\sin\theta`;
    const eqShaded = String.raw`A_{\text{shaded}} = A_{\text{sector}} - A_{\triangle OCD}`;

    steps.push({ katex: eqSector, text: 'First find the area of the whole sector.' });
    steps.push({ katex: eqTri, text: 'C and D are midpoints, so OC = OD = r/2. The chord CD creates triangle OCD.' });
    steps.push({ katex: eqShaded, text: 'Shaded area is sector area minus triangle OCD.' });
    steps.push({ katex: String.raw`A_{\text{shaded}} \approx ${asFixed2(area)}`, text: 'Calculate and round to 2 decimal places.' });

    answerLatex = asFixed2(area);
    answerValue = Number(asFixed2(area));
  }

  if (kind === 'midpoint_shaded_area_inverse_radius') {
    const area = midpointShadedArea(r, theta);
    const solvedR = inverseMidpointRadius(Number(asFixed2(area)), theta);
    const thetaDec = Number(theta.toFixed(2));
    const thetaDecLatex = asFixed2(thetaDec);

    promptText = `In a sector, C and D are the midpoints of OA and OB. If ∠AOB = ${thetaDecLatex} radians and the shaded area is approximately ${asFixed2(area)}, find the ${askDiameter ? 'diameter d' : 'radius r'}.`;
    promptKatex = askDiameter
      ? String.raw`\text{C and D are midpoints of }OA\text{ and }OB.\;\angle AOB=${thetaDecLatex}\text{ rad}.\\\text{If shaded area }\approx ${asFixed2(area)}\text{, find }d.`
      : String.raw`\text{C and D are midpoints of }OA\text{ and }OB.\;\angle AOB=${thetaDecLatex}\text{ rad}.\\\text{If shaded area }\approx ${asFixed2(area)}\text{, find }r.`;

    steps.push({ katex: String.raw`A_{\text{shaded}} = \frac{1}{2}r^2\theta - \frac{r^2}{8}\sin\theta`, text: 'Use sector minus midpoint-triangle formula.' });
    steps.push({ katex: String.raw`${asFixed2(area)} = r^2\left(\frac{4\theta - \sin\theta}{8}\right)`, text: 'Factor out r^2.' });
    steps.push({ katex: String.raw`r^2 = \frac{${asFixed2(area)}}{\left(\frac{4\theta - \sin\theta}{8}\right)}`, text: 'Rearrange to solve for r^2.' });
    if (askDiameter) {
      steps.push({ katex: String.raw`r \approx ${asFixed2(solvedR)}`, text: 'Find the radius (2 d.p.).' });
      steps.push({ katex: String.raw`d = 2r \approx ${asFixed2(2 * solvedR)}`, text: 'Diameter is twice the radius.' });

      answerLatex = asFixed2(2 * solvedR);
      answerValue = Number(asFixed2(2 * solvedR));
    } else {
      steps.push({ katex: String.raw`r \approx ${asFixed2(solvedR)}`, text: 'Take square root and round to 2 decimal places.' });

      answerLatex = asFixed2(solvedR);
      answerValue = Number(asFixed2(solvedR));
    }
  }

  if (kind === 'sector_area_inverse_radius') {
    const a = sectorArea(r, theta);
    // Exact given area: A = 1/2 r^2 θ, with θ a multiple of π.
    const aCoeff = simplifyFrac(r * r * thetaFrac.n, 2 * thetaFrac.d);
    const aLatex = piMultipleLatex(aCoeff.n, aCoeff.d);
    const aPlain = piMultiplePlain(aCoeff.n, aCoeff.d);
    promptText = `A sector has area A = ${aPlain} and central angle θ = ${thetaRadPlain} rad. Find the ${askDiameter ? 'diameter d' : 'radius r'}.`;
    promptKatex = askDiameter
      ? String.raw`\text{A sector has }A=${aLatex},\;\theta=${thetaRadLatex}\text{ rad}.\;\text{Find }d.`
      : String.raw`\text{A sector has }A=${aLatex},\;\theta=${thetaRadLatex}\text{ rad}.\;\text{Find }r.`;

    steps.push({ katex: eqArea, text: 'Start with the sector area formula.' });
    steps.push({ katex: String.raw`${aLatex} = \frac{1}{2}r^2\cdot ${thetaRadLatex}`, text: 'Substitute A and θ (decimal radians).' });
    steps.push({ katex: String.raw`r^2 = \frac{2\cdot ${aLatex}}{${thetaRadLatex}}`, text: 'Rearrange.' });
    if (askDiameter) {
      steps.push({ katex: String.raw`r = ${r}`, text: 'Find the radius.' });
      steps.push({ katex: String.raw`d = 2r = ${2 * r}`, text: 'Diameter is twice the radius.' });

      answerLatex = String(2 * r);
      answerValue = 2 * r;
    } else {
      steps.push({ katex: String.raw`r = ${r}`, text: 'Final answer.' });

      answerLatex = String(r);
      answerValue = r;
    }
  }

  if (kind === 'sector_area_inverse_theta') {
    const a = sectorArea(r, theta);
    const aCoeff = simplifyFrac(r * r * thetaFrac.n, 2 * thetaFrac.d);
    const aLatex = piMultipleLatex(aCoeff.n, aCoeff.d);
    const aPlain = piMultiplePlain(aCoeff.n, aCoeff.d);
    promptText = `A sector has area A = ${aPlain} and radius r = ${r}. Find the central angle θ (in radians).`;
    promptKatex = String.raw`\text{A sector has }A=${aLatex},\;r=${r}.\;\text{Find }\theta\text{ (radians).}`;

    steps.push({ katex: eqArea, text: 'Start with the sector area formula.' });
    steps.push({ katex: String.raw`${aLatex} = \frac{1}{2}\cdot ${r}^2\cdot \theta`, text: 'Substitute A and r.' });
    steps.push({ katex: String.raw`\theta = \frac{2\cdot ${aLatex}}{${r}^2}`, text: 'Rearrange to solve for θ.' });
    steps.push({ katex: String.raw`\theta \approx ${thetaRadLatex}`, text: 'Final answer (decimal radians).' });

    answerLatex = thetaRadLatex;
    answerValue = thetaRadDec;
  }

  if (kind === 'segment_area_forward') {
    const seg = segmentArea(r, theta);
    // Segment uses sin(theta) so keep theta in radians for clarity.
    promptText = `Find the area of the minor segment for a circle of radius r = ${r} subtending an angle θ = ${thetaRadPlain} rad.`;
    promptKatex = String.raw`\text{Find the area of the minor segment with }r=${r},\;\theta=${thetaRadLatex}\text{ rad}.`;

    const eqSector = String.raw`A_{\text{sector}} = \frac{1}{2}r^2\theta`;
    const eqTri = String.raw`A_{\triangle AOB} = \frac{1}{2}r^2\sin\theta`;
    const eqSub = String.raw`A_{\text{segment}} = A_{\text{sector}} - A_{\triangle AOB}`;

    if (input.difficulty === 'hard') {
      steps.push({ katex: String.raw`\text{A segment is the region between a chord and an arc.}`, text: 'We use sector minus triangle.' });
      steps.push({ katex: String.raw`\theta = ${thetaRadLatex}\text{ rad}`, text: 'Use radians (we are given radians already).' });
      steps.push({ katex: eqSector, text: 'Area of the sector formed by radii OA and OB.' });
      steps.push({ katex: eqTri, text: 'Area of triangle AOB (two sides r with included angle θ).' });
      steps.push({ katex: eqSub, text: 'Minor segment = sector area minus triangle area.' });
      steps.push({ katex: eqSeg, text: 'Combine these to get the compact formula.' });
      steps.push({ katex: String.raw`\text{The chord AB is drawn to show the triangle boundary AOB.}`, text: 'Chord is relevant for segment diagrams.' });
      steps.push({ katex: String.raw`A_{\text{segment}} = \frac{1}{2}\cdot ${r}^2\left(${thetaRadLatex} - \sin(${thetaRadLatex})\right)`, text: 'Substitute r and θ.' });
      steps.push({ katex: String.raw`A_{\text{segment}} \approx ${asFixed2(seg)}`, text: 'Calculate and round to 2 decimal places.' });
    } else {
      steps.push({ katex: String.raw`\text{A segment area is sector area minus triangle area.}`, text: 'Set up the method.' });
      steps.push({ katex: eqSector, text: 'Write the sector area formula.' });
      steps.push({ katex: eqTri, text: 'Write the triangle area formula using sin(θ).' });
      steps.push({ katex: eqSeg, text: 'So the segment area formula becomes:' });
      steps.push({ katex: String.raw`\text{The chord AB is drawn because the segment is bounded by a chord.}`, text: 'Chord is relevant for segment diagrams.' });
      steps.push({ katex: String.raw`A_{\text{segment}} = \frac{1}{2}\cdot ${r}^2\left(${thetaRadLatex} - \sin(${thetaRadLatex})\right)`, text: 'Substitute r and θ.' });
      steps.push({ katex: String.raw`A_{\text{segment}} \approx ${asFixed2(seg)}`, text: 'Calculate (2 d.p.).' });
    }

    answerLatex = asFixed2(seg);
    answerValue = Number(asFixed2(seg));
  }

  if (kind === 'segment_area_inverse_radius') {
    const seg = segmentArea(r, theta);
    const solvedR = inverseSegmentRadius(seg, theta);
    promptText = `A minor segment has area approximately ${asFixed2(seg)} and central angle θ = ${thetaRadPlain} rad. Find the ${askDiameter ? 'diameter d' : 'radius r'}.`;
    promptKatex = askDiameter
      ? String.raw`\text{A minor segment has }A_{\text{segment}}\approx ${asFixed2(seg)},\;\theta=${thetaRadLatex}\text{ rad}.\;\text{Find }d.`
      : String.raw`\text{A minor segment has }A_{\text{segment}}\approx ${asFixed2(seg)},\;\theta=${thetaRadLatex}\text{ rad}.\;\text{Find }r.`;

    const eqSector = String.raw`A_{\text{sector}} = \frac{1}{2}r^2\theta`;
    const eqTri = String.raw`A_{\triangle AOB} = \frac{1}{2}r^2\sin\theta`;
    const eqSub = String.raw`A_{\text{segment}} = A_{\text{sector}} - A_{\triangle AOB}`;

    steps.push({ katex: String.raw`\text{A segment area is sector minus triangle.}`, text: 'Start from the geometry.' });
    steps.push({ katex: eqSector, text: 'Sector area formula.' });
    steps.push({ katex: eqTri, text: 'Triangle area formula (sides r and r with included angle θ).' });
    steps.push({ katex: eqSub, text: 'Subtract to get the segment area.' });
    steps.push({ katex: eqSeg, text: 'This simplifies to the compact formula.' });
    steps.push({ katex: String.raw`${asFixed2(seg)} = \frac{1}{2}r^2(${thetaRadLatex} - \sin(${thetaRadLatex}))`, text: 'Substitute the segment area and θ.' });
    steps.push({ katex: String.raw`r^2 = \frac{2\cdot ${asFixed2(seg)}}{${thetaRadLatex} - \sin(${thetaRadLatex})}`, text: 'Rearrange to make r^2 the subject.' });
    if (askDiameter) {
      steps.push({ katex: String.raw`r \approx ${asFixed2(solvedR)}`, text: 'Find the radius (2 d.p.).' });
      steps.push({ katex: String.raw`d = 2r \approx ${asFixed2(2 * solvedR)}`, text: 'Diameter is twice the radius.' });

      answerLatex = asFixed2(2 * solvedR);
      answerValue = Number(asFixed2(2 * solvedR));
    } else {
      steps.push({ katex: String.raw`r \approx ${asFixed2(solvedR)}`, text: 'Take the square root and round to 2 decimal places.' });

      answerLatex = asFixed2(solvedR);
      answerValue = Number(asFixed2(solvedR));
    }
  }

  if (kind === 'segment_area_inverse_theta') {
    const seg = segmentArea(r, theta);
    promptText = `A circle has radius r = ${r}. A minor segment has area approximately ${asFixed2(seg)}. Estimate the central angle θ (in radians). Give your answer as a decimal.`;
    promptKatex = String.raw`\text{A circle has }r=${r}.\;\text{A minor segment has area }\approx ${asFixed2(seg)}.\\\text{Estimate }\theta\text{ in radians (decimal).}`;

    const eqSector = String.raw`A_{\text{sector}} = \frac{1}{2}r^2\theta`;
    const eqTri = String.raw`A_{\triangle AOB} = \frac{1}{2}r^2\sin\theta`;
    const eqSub = String.raw`A_{\text{segment}} = A_{\text{sector}} - A_{\triangle AOB}`;

    steps.push({ katex: String.raw`\text{A segment area is sector minus triangle.}`, text: 'Set up the relationship.' });
    steps.push({ katex: eqSector, text: 'Sector area in terms of θ.' });
    steps.push({ katex: eqTri, text: 'Triangle area in terms of θ.' });
    steps.push({ katex: eqSub, text: 'So the segment area is:' });
    steps.push({ katex: eqSeg, text: 'This simplifies to the compact formula.' });
    steps.push({ katex: String.raw`${asFixed2(seg)} \approx \frac{1}{2}\cdot ${r}^2(\theta - \sin\theta)`, text: 'Substitute r and the segment area.'});
    steps.push({ katex: String.raw`\text{Solve for }\theta\text{ (this usually needs a numerical method).}`, text: 'θ appears both inside and outside sin(θ).' });
    steps.push({ katex: String.raw`\theta \approx ${thetaRadLatex}`, text: 'This instance is generated from a known θ. In general you would solve numerically.'});

    answerLatex = thetaRadLatex;
    answerValue = thetaRadDec;
  }

  const diagramSvg = buildCircularMeasureDiagramSvg({
    width: 440,
    height: 320,
    radiusPx,
    thetaRad: thetaShown,
    showSectorFill: kind.includes('sector') || kind.includes('segment') || kind.includes('area') || kind.includes('perimeter') || kind.includes('chord_length') || kind.includes('midpoint_shaded'),
    showChord: kind.includes('segment') || kind.includes('chord_length'),
    showMidpointChord: kind.includes('midpoint_shaded'),
    shadeMode: kind.includes('midpoint_shaded') ? 'midpoint_shaded' : kind.includes('segment') ? 'segment' : 'sector',
    labelR: kind.includes('inverse_radius') ? (askDiameter ? String.raw`d = ?` : String.raw`r = ?`) : String.raw`r = ${r}`,
    labelTheta: kind.includes('inverse_theta')
      ? 'θ = ?'
      : `θ = ${showDegrees && (kind === 'arc_length_forward' || kind === 'sector_area_forward' || kind === 'sector_perimeter_forward') ? thetaDeg.plain : `${thetaRadPlain} rad`}`,
    labelArcS: kind.startsWith('arc_length') ? String.raw`s` : undefined,
    title,
  });

  const id = stableId('circular-measure', input.seed, `${kind}-${askDiameter ? 'd' : 'r'}-${r}-${thetaFrac.n}-${thetaFrac.d}`);

  return {
    id,
    kind,
    difficulty: input.difficulty,
    promptText,
    promptKatex,
    answerLatex,
    answerValue,
    steps,
    svg: diagramSvg.svg,
    svgAltText: diagramSvg.altText,
    diagram: {
      radius: r,
      thetaRad: theta,
      radiusPx,
    },
  };
}
