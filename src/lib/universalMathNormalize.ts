function gcdInt(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function reduceNumericFraction(n: number, d: number): { n: number; d: number } {
  if (!Number.isFinite(n) || !Number.isFinite(d)) return { n, d };
  if (d === 0) return { n, d };
  if (n === 0) return { n: 0, d: 1 };
  const sign = d < 0 ? -1 : 1;
  const nn = n * sign;
  const dd = d * sign;
  const g = gcdInt(nn, dd);
  return { n: nn / g, d: dd / g };
}

function simplifyNormalizedExpr(s: string): string {
  let out = s;

  // Reduce all simple numeric fractions a/b.
  // (This intentionally does not try to parse full expressions.)
  out = out.replace(/(-?\d+)\/(\d+)/g, (_m, a, b) => {
    const n = Number(a);
    const d = Number(b);
    const r = reduceNumericFraction(n, d);
    if (r.d === 1) return String(r.n);
    return `${r.n}/${r.d}`;
  });

  // Remove ".../1" when it appears as a plain numeric fraction.
  out = out.replace(/(-?\d+)\/1(?!\d)/g, '$1');

  // Simplify powers for x and numeric bases.
  out = out
    // x^0 -> 1, x^1 -> x
    .replace(/x\^0(?!\d)/g, '1')
    .replace(/x\^1(?!\d)/g, 'x')
    // n^0 -> 1 (except 0^0; leave it)
    .replace(/\b(?!0\b)(-?\d+)\^0(?!\d)/g, '1')
    // n^1 -> n
    .replace(/\b(-?\d+)\^1(?!\d)/g, '$1');

  // Normalize coefficients: 1x -> x, -1x -> -x, 0x -> 0.
  out = out
    .replace(/\b1x\b/g, 'x')
    .replace(/\b-1x\b/g, '-x')
    .replace(/\b0x\b/g, '0')
    .replace(/\b1x\^/g, 'x^')
    .replace(/\b-1x\^/g, '-x^')
    .replace(/\b0x\^\d+/g, '0');

  // Clean repeated signs.
  // Run a few passes to stabilize.
  for (let i = 0; i < 4; i++) {
    const next = out
      .replace(/\+\+/g, '+')
      .replace(/--/g, '+')
      .replace(/\+-/g, '-')
      .replace(/-\+/g, '-')
      .replace(/^\+/, '');
    if (next === out) break;
    out = next;
  }

  // Remove empty parentheses.
  out = out.replace(/\(\)/g, '');
  return out;
}

export function normalizeUniversalMathAnswer(raw: string): string {
  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[−–]/g, '-')
    .replace(/\\dfrac/g, '\\frac')
    .replace(/\\tfrac/g, '\\frac')
    .replace(/\\mathit\{c\}/g, 'c')
    .replace(/\\mathrm\{c\}/g, 'c')
    .replace(/\{x\}/g, 'x')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    // Normalize scripts: MathLive may emit x^{6} while users might type x^6
    .replace(/\^\{([^}]+)\}/g, '^$1')
    .replace(/_\{([^}]+)\}/g, '_$1')
    // KaTeX/LaTeX can emit compact fractions without braces: \\frac52
    .replace(/-\\frac(\d{1,3})(\d{1,3})/g, '-$1/$2')
    .replace(/\\frac(\d{1,3})(\d{1,3})/g, '$1/$2')
    // Standard fractions
    .replace(/-\\frac\{(\d+)\}\{(\d+)\}/g, '-$1/$2')
    .replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2')
    // Division-style forms: x^6/3, 2x^3/3, -x/7, etc.
    .replace(/-(\d+)x\^(\d+)\/(\d+)/g, '-$1/$3x^$2')
    .replace(/(\d+)x\^(\d+)\/(\d+)/g, '$1/$3x^$2')
    .replace(/-x\^(\d+)\/(\d+)/g, '-1/$2x^$1')
    .replace(/x\^(\d+)\/(\d+)/g, '1/$2x^$1')
    .replace(/-(\d+)x\/(\d+)/g, '-$1/$2x')
    .replace(/(\d+)x\/(\d+)/g, '$1/$2x')
    .replace(/-x\/(\d+)/g, '-1/$1x')
    .replace(/x\/(\d+)/g, '1/$1x')
    // Accept plain-text (x)/13 forms as equivalent to (1/13)x
    .replace(/(^|[^a-z0-9_])\(?x\)?\/(\d+)/g, '$11/$2x')
    // Accept \\frac{2x^3}{3}, \\frac{2x}{3}
    .replace(/-\\frac\{(\d+)x\^(\d+)\}\{(\d+)\}/g, '-$1/$3x^$2')
    .replace(/\\frac\{(-?\d+)x\^(\d+)\}\{(\d+)\}/g, '$1/$3x^$2')
    .replace(/-\\frac\{(\d+)x\}\{(\d+)\}/g, '-$1/$2x')
    .replace(/\\frac\{(-?\d+)x\}\{(\d+)\}/g, '$1/$2x')
    // Also allow variable-only numerators: \\frac{-x^n}{d}, \\frac{x^n}{d}
    .replace(/\\frac\{-x\^(\d+)\}\{(\d+)\}/g, '-1/$2x^$1')
    .replace(/\\frac\{x\^(\d+)\}\{(\d+)\}/g, '1/$2x^$1')
    .replace(/\\frac\{-x\}\{(\d+)\}/g, '-1/$1x')
    .replace(/\\frac\{x\}\{(\d+)\}/g, '1/$1x')
    // Remove remaining braces around plain numbers
    .replace(/\{(\d+)\}/g, '$1')
    // Strip common LaTeX spacing + multiplication
    .replace(/\\[ ,;!:]/g, '')
    .replace(/\\cdot/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, '')
    // Normalize empty parentheses
    .replace(/\(\)/g, '');

  return simplifyNormalizedExpr(normalized);
}

// Conservative helper for rendering: avoids lowercasing and avoids stripping whitespace,
// but still performs safe simplifications (fractions, ^0/^1 for x/numbers, 1x).
export function simplifyLatexForDisplay(rawLatex: string): string {
  let s = String(rawLatex ?? '').replace(/[−–]/g, '-');

  // Normalize \\dfrac/\\tfrac for consistent matching.
  s = s.replace(/\\dfrac/g, '\\frac').replace(/\\tfrac/g, '\\frac');

  // Normalize brace scripts.
  // IMPORTANT: keep braces for negative exponents (e.g. x^{-4}) since `x^-4` renders incorrectly in KaTeX.
  // Only strip braces for simple unsigned numeric exponents.
  s = s
    .replace(/\^\{(\d+)\}/g, '^$1')
    .replace(/\^\{(-\d+)\}/g, '^{$1}');

  // Convert \frac{a}{b} (numeric only) to a/b so we can reduce it, then restore to \frac.
  s = s.replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2');

  // Reduce numeric fractions.
  s = s.replace(/(-?\d+)\/(\d+)/g, (_m, a, b) => {
    const n = Number(a);
    const d = Number(b);
    const r = reduceNumericFraction(n, d);
    if (r.d === 1) return String(r.n);
    return String.raw`\\frac{${r.n}}{${r.d}}`;
  });

  // x^0 and x^1
  s = s.replace(/x\^0(?!\d)/g, '1').replace(/x\^1(?!\d)/g, 'x');

  // n^0 and n^1 (numeric base only)
  s = s.replace(/\b(?!0\b)(-?\d+)\^0(?!\d)/g, '1');
  s = s.replace(/\b(-?\d+)\^1(?!\d)/g, '$1');

  // 1x / -1x
  s = s.replace(/\b1x\b/g, 'x').replace(/\b-1x\b/g, '-x');
  s = s.replace(/\b1x\^/g, 'x^').replace(/\b-1x\^/g, '-x^');

  // Reduce 3/1-like explicit divisions (already handled above for numeric only), and clean empty parens.
  s = s.replace(/\(\)/g, '');
  return s;
}
