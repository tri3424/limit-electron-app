export function plainTextToSimpleHtml(text: string): string {
  const escaped = (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Paragraphs are separated by blank lines (double newline). Single newlines are treated
  // as wrapped lines and should be unwrapped into spaces.
  return escaped
    .split(/\n{2,}/)
    .map((p) => {
      const unwrapped = p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      return `<p>${unwrapped}</p>`;
    })
    .join('');
}

function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const SUP_DIGIT_MAP: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

const SUB_DIGIT_MAP: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
};

function applyBasicSupSub(escaped: string): string {
  let out = escaped;

  // unicode superscripts / subscripts
  out = out.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => `<sup>${m.split('').map((c) => SUP_DIGIT_MAP[c] ?? c).join('')}</sup>`);
  out = out.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (m) => `<sub>${m.split('').map((c) => SUB_DIGIT_MAP[c] ?? c).join('')}</sub>`);

  // x^2, x^(n+1), x^{n+1}
  out = out.replace(
    /([A-Za-z0-9\)\]\}])\s*\^\s*(\{([^{}]+)\}|\(([^()]+)\)|([A-Za-z0-9+\-]+))/g,
    (_m, base, _expAll, expBraces, expParens, expSimple) => {
      const exp = (expBraces || expParens || expSimple || '').trim();
      if (!exp) return _m;
      return `${base}<sup>${exp}</sup>`;
    }
  );

  // x_1, x_(n+1), x_{n+1}
  out = out.replace(
    /([A-Za-z0-9\)\]\}])\s*_\s*(\{([^{}]+)\}|\(([^()]+)\)|([A-Za-z0-9+\-]+))/g,
    (_m, base, _subAll, subBraces, subParens, subSimple) => {
      const sub = (subBraces || subParens || subSimple || '').trim();
      if (!sub) return _m;
      return `${base}<sub>${sub}</sub>`;
    }
  );

  return out;
}

export function ocrTextToRichHtml(text: string): string {
  const escaped = escapeHtml(text);

  return escaped
    .split(/\n{2,}/)
    .flatMap((block) =>
      block
        .split(/\n/)
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    )
    .map((line) => {
      const rich = applyBasicSupSub(line);
      return `<p>${rich}</p>`;
    })
    .join('');
}
