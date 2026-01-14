export type NormalizeOcrTextOptions = {
  preserveSingleNewlines?: boolean;
};

function normalizeSpaces(s: string): string {
  return s.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

function shouldJoinNoSpace(prev: string): boolean {
  // Simple de-hyphenation across wrapped lines.
  return /-$/.test(prev.trimEnd());
}

function joinWithUnwrap(prev: string, next: string): string {
  const a = prev.trimEnd();
  const b = next.trimStart();
  if (!a) return b;
  if (!b) return a;

  if (shouldJoinNoSpace(a)) {
    return a.replace(/-\s*$/, '') + b;
  }

  return `${a} ${b}`;
}

/**
 * Converts OCR text to wide-editor-friendly text:
 * - Single line breaks (PDF wrapping) become spaces.
 * - Paragraph breaks require an empty line => produces "\n\n".
 */
export function normalizeOcrTextToParagraphs(ocrText: string, _opts: NormalizeOcrTextOptions = {}): string {
  const lines = ocrText.split(/\r?\n/).map((l) => l.replace(/\u00A0/g, ''));

  const paragraphs: string[] = [];
  let current = '';

  const flush = () => {
    const c = current.trim();
    if (c) paragraphs.push(c);
    current = '';
  };

  for (const raw of lines) {
    const trimmedRight = raw.replace(/\s+$/g, '');
    const isBlank = trimmedRight.trim().length === 0;

    if (isBlank) {
      flush();
      continue;
    }

    const cleaned = normalizeSpaces(trimmedRight);
    if (!cleaned) continue;

    current = current ? joinWithUnwrap(current, cleaned) : cleaned;
  }

  flush();

  return paragraphs.join('\n\n');
}

export function normalizeOcrLinesToParagraphs(lines: string[]): string {
  return normalizeOcrTextToParagraphs(lines.join('\n'));
}
