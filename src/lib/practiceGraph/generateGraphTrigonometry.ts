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
  const pickVariant = (): 'trig_ratio_quadrant' | 'identity_simplify' => {
    if (input.difficulty !== 'hard') return 'trig_ratio_quadrant';
    const w = input.variantWeights ?? {};
    const wRatio = typeof w.ratio_quadrant === 'number' ? Math.max(0, Number(w.ratio_quadrant)) : 65;
    const wIdentity = typeof w.identity_simplify === 'number' ? Math.max(0, Number(w.identity_simplify)) : 35;
    const total = wRatio + wIdentity;
    if (!(total > 0)) return 'trig_ratio_quadrant';
    const r = rng.next() * total;
    return r < wIdentity ? 'identity_simplify' : 'trig_ratio_quadrant';
  };

  const variant = pickVariant();

  if (variant === 'identity_simplify') {
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
        const lhs = String.raw`\frac{\sin^{${p}}\theta}{\csc\theta}`;
        const rhs = String.raw`\sin^{${p + 1}}\theta`;
        const wrong = [String.raw`\sin^{${p}}\theta`, String.raw`\sin^{${p - 1 < 0 ? 0 : p - 1}}\theta`, String.raw`\csc^{${p + 1}}\theta`].filter((x) => x !== rhs);
        const steps = [
          { katex: String.raw`\csc\theta = \frac{1}{\sin\theta}`, text: 'Use the reciprocal identity.' },
          { katex: String.raw`\frac{\sin^{${p}}\theta}{\csc\theta}=\frac{\sin^{${p}}\theta}{\frac{1}{\sin\theta}}`, text: 'Substitute cscθ.' },
          { katex: String.raw`=\sin^{${p}}\theta\cdot\sin\theta=\sin^{${p + 1}}\theta`, text: 'Multiply and simplify.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const p = rng.int(1, 8);
        const lhs = String.raw`\frac{\cos^{${p}}\theta}{\sec\theta}`;
        const rhs = String.raw`\cos^{${p + 1}}\theta`;
        const wrong = [String.raw`\cos^{${p}}\theta`, String.raw`\cos^{${p - 1 < 0 ? 0 : p - 1}}\theta`, String.raw`\sec^{${p + 1}}\theta`].filter((x) => x !== rhs);
        const steps = [
          { katex: String.raw`\sec\theta = \frac{1}{\cos\theta}`, text: 'Use the reciprocal identity.' },
          { katex: String.raw`\frac{\cos^{${p}}\theta}{\sec\theta}=\frac{\cos^{${p}}\theta}{\frac{1}{\cos\theta}}`, text: 'Substitute secθ.' },
          { katex: String.raw`=\cos^{${p}}\theta\cdot\cos\theta=\cos^{${p + 1}}\theta`, text: 'Multiply and simplify.' },
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
        const lhs = String.raw`\frac{\tan^{${p}}\theta}{\sec^{${p}}\theta}`;
        const rhs = String.raw`\sin^{${p}}\theta`;
        const wrong = [String.raw`\cos^{${p}}\theta`, String.raw`\tan^{${p}}\theta`, String.raw`\sec^{${p}}\theta`].filter((x) => x !== rhs);
        const steps = [
          { katex: String.raw`\tan\theta=\frac{\sin\theta}{\cos\theta}`, text: 'Write tan in terms of sin and cos.' },
          { katex: String.raw`\sec\theta=\frac{1}{\cos\theta}`, text: 'Write sec in terms of cos.' },
          { katex: String.raw`\frac{\tan^{${p}}\theta}{\sec^{${p}}\theta}=\frac{\left(\frac{\sin\theta}{\cos\theta}\right)^{${p}}}{\left(\frac{1}{\cos\theta}\right)^{${p}}}`, text: 'Substitute and simplify.' },
          { katex: String.raw`=\sin^{${p}}\theta`, text: 'Cancel the matching powers of cosθ.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const p = rng.int(1, 6);
        const lhs = String.raw`\frac{\cot^{${p}}\theta}{\csc^{${p}}\theta}`;
        const rhs = String.raw`\cos^{${p}}\theta`;
        const wrong = [String.raw`\sin^{${p}}\theta`, String.raw`\cot^{${p}}\theta`, String.raw`\csc^{${p}}\theta`].filter((x) => x !== rhs);
        const steps = [
          { katex: String.raw`\cot\theta=\frac{\cos\theta}{\sin\theta}`, text: 'Write cot in terms of sin and cos.' },
          { katex: String.raw`\csc\theta=\frac{1}{\sin\theta}`, text: 'Write csc in terms of sin.' },
          { katex: String.raw`\frac{\cot^{${p}}\theta}{\csc^{${p}}\theta}=\frac{\left(\frac{\cos\theta}{\sin\theta}\right)^{${p}}}{\left(\frac{1}{\sin\theta}\right)^{${p}}}`, text: 'Substitute and simplify.' },
          { katex: String.raw`=\cos^{${p}}\theta`, text: 'Cancel the matching powers of sinθ.' },
        ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const a = rng.int(2, 9);
        const b = rng.int(2, 9);
        const c = rng.int(1, a - 1);
        const d = rng.int(1, b - 1);
        const lhs = String.raw`\frac{\sin^{${a}}\theta\,\cos^{${b}}\theta}{\sin^{${c}}\theta\,\cos^{${d}}\theta}`;
        const rhs = String.raw`\sin^{${a - c}}\theta\,\cos^{${b - d}}\theta`;
        const wrong = [
          String.raw`\sin^{${a - c}}\theta\,\cos^{${b + d}}\theta`,
          String.raw`\sin^{${a + c}}\theta\,\cos^{${b - d}}\theta`,
          String.raw`\sin^{${a - c}}\theta\,\cos^{${b - d - 1}}\theta`,
        ].filter((x) => x !== rhs);
        const steps = [
          { katex: String.raw`\frac{\sin^{${a}}\theta}{\sin^{${c}}\theta}=\sin^{${a - c}}\theta`, text: 'Divide powers with the same base by subtracting exponents.' },
          { katex: String.raw`\frac{\cos^{${b}}\theta}{\cos^{${d}}\theta}=\cos^{${b - d}}\theta`, text: 'Do the same for cosθ.' },
          { katex: rhs, text: 'Combine the simplified factors.' },
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
        const lhs = String.raw`\frac{(1+\tan^2\theta)^{${p}}}{\sec^{2${p}}\theta}`;
        const rhs = String.raw`1`;
        const wrong = [String.raw`0`, String.raw`\sec^{2${p}}\theta`, String.raw`\tan^{2${p}}\theta`];
        const steps = [
          { katex: String.raw`1+\tan^2\theta=\sec^2\theta`, text: 'Use the Pythagorean identity.' },
          { katex: String.raw`\frac{(\sec^2\theta)^{${p}}}{\sec^{2${p}}\theta}=\frac{\sec^{2${p}}\theta}{\sec^{2${p}}\theta}`, text: 'Substitute and simplify powers.' },
          { katex: String.raw`=1`, text: 'Any nonzero expression divided by itself equals 1.' },
        ];
        return { lhs, rhs, steps, wrong };
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
            { katex: String.raw`\tan\theta=\frac{\sin\theta}{\cos\theta}`, text: 'Use the quotient identity.' },
            { katex: String.raw`\frac{\sin\theta}{\cos\theta}=\tan\theta`, text: 'Match the given expression.' },
          ]
          : which === 1
            ? [
              { katex: String.raw`\cot\theta=\frac{\cos\theta}{\sin\theta}`, text: 'Use the quotient identity.' },
              { katex: String.raw`\frac{\cos\theta}{\sin\theta}=\cot\theta`, text: 'Match the given expression.' },
            ]
            : [
              { katex: String.raw`\cot\theta=\frac{1}{\tan\theta}`, text: 'Use the reciprocal identity.' },
              { katex: String.raw`\frac{1}{\tan\theta}=\cot\theta`, text: 'Match the given expression.' },
            ];
        return { lhs, rhs, steps, wrong };
      },
      () => {
        const lhs = String.raw`\frac{\sin^2\theta}{1+\cot^2\theta}`;
        const rhs = String.raw`\sin^4\theta`;
        const wrong = [String.raw`\sin^2\theta`, String.raw`\cos^2\theta`, String.raw`\sin^2\theta\cos^2\theta`];
        const steps = [
          { katex: String.raw`1+\cot^2\theta=\csc^2\theta`, text: 'Use the Pythagorean identity for cotangent.' },
          { katex: String.raw`\csc^2\theta=\frac{1}{\sin^2\theta}`, text: 'Write csc in terms of sin.' },
          { katex: String.raw`\frac{\sin^2\theta}{1+\cot^2\theta}=\frac{\sin^2\theta}{\frac{1}{\sin^2\theta}}`, text: 'Substitute the identities.' },
          { katex: String.raw`=\sin^2\theta\cdot\sin^2\theta=\sin^4\theta`, text: 'Multiply and simplify.' },
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
