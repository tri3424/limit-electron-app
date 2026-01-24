export function normalizeUniversalMathAnswer(raw: string): string {
  return String(raw ?? '')
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
}
