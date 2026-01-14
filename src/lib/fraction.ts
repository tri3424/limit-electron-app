export type Fraction = {
  n: number;
  d: number;
};

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

export function normalizeFraction(f: Fraction): Fraction {
  if (!Number.isFinite(f.n) || !Number.isFinite(f.d) || f.d === 0) {
    return { n: NaN, d: NaN };
  }
  if (f.n === 0) return { n: 0, d: 1 };
  const sign = f.d < 0 ? -1 : 1;
  const n = f.n * sign;
  const d = Math.abs(f.d);
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export function fractionsEqual(a: Fraction, b: Fraction): boolean {
  const aa = normalizeFraction(a);
  const bb = normalizeFraction(b);
  return aa.n === bb.n && aa.d === bb.d;
}

export function fractionToLatex(f: Fraction): string {
  const ff = normalizeFraction(f);
  if (!Number.isFinite(ff.n) || !Number.isFinite(ff.d)) return '';
  if (ff.d === 1) return String(ff.n);
  return `\\frac{${ff.n}}{${ff.d}}`;
}

export function fractionToDisplay(f: Fraction): string {
  const ff = normalizeFraction(f);
  if (!Number.isFinite(ff.n) || !Number.isFinite(ff.d)) return '';
  if (ff.d === 1) return String(ff.n);
  return `${ff.n}/${ff.d}`;
}

// Accepts: "-3", "5/2", " - 5 / 2 ", "x=..." will be rejected.
export function parseFraction(input: string): Fraction | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  const cleaned = raw.replace(/\s+/g, '');

  // allow leading +
  const s = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;

  if (/^-?\d+$/.test(s)) {
    return normalizeFraction({ n: Number(s), d: 1 });
  }

  // decimals: -12.34
  const dm = s.match(/^(-?)(\d+)\.(\d+)$/);
  if (dm) {
    const sign = dm[1] === '-' ? -1 : 1;
    const intPart = dm[2];
    const fracPart = dm[3];
    const scale = Math.pow(10, fracPart.length);
    const n = sign * (Number(intPart) * scale + Number(fracPart));
    const d = scale;
    return normalizeFraction({ n, d });
  }

  const m = s.match(/^(-?\d+)\/(\d+)$/);
  if (m) {
    const n = Number(m[1]);
    const d = Number(m[2]);
    if (d === 0) return null;
    return normalizeFraction({ n, d });
  }

  return null;
}
