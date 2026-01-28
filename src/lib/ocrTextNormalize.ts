export type NormalizeOcrTextOptions = {
  preserveSingleNewlines?: boolean;
};

function fixCommonJoinedWords(s: string): string {
  let out = s;
  out = out.replace(/\b(It)(is|was|were|are|has|have|had)\b/g, '$1 $2');
  out = out.replace(/\b(There)(is|are|was|were)\b/g, '$1 $2');
  out = out.replace(/\b(there)(is|are|was|were)\b/g, '$1 $2');
  out = out.replace(/\b(Thatis)\b/g, 'That is');
  out = out.replace(/\b(thatis)\b/g, 'that is');
  out = out.replace(/\b(whatis)\b/g, 'what is');
  out = out.replace(/\b(What)(is)\b/g, '$1 $2');
  return out;
}

function stripOcrUnderscoreArtifacts(s: string): string {
  let out = s;
  out = out.replace(/(^|\s)_+(?=\S)/g, '$1');
  out = out.replace(/_+(\s|$)/g, '$1');
  out = out.replace(/\s_{2,}\s/g, ' ');
  return out;
}

export function normalizeOcrLineArtifacts(line: string): string {
  const cleaned = String(line || '').replace(/\u00A0/g, ' ');
  const noUnderscores = stripOcrUnderscoreArtifacts(cleaned);
  let out = fixCommonJoinedWords(noUnderscores);
  // Common OCR confusion in physics graphs: t (time) inside parentheses becomes currency symbols.
  out = out.replace(/\btime\s*\(\s*[£€]\s*\)/gi, 'time (t)');
  out = out.replace(/\b-\s*time\s*\(\s*[£€]\s*\)/gi, '-time (t)');
  return out;
}

function normalizeSpaces(s: string): string {
  const cleaned = s.replace(/\u00A0/g, ' ');
  const noUnderscores = stripOcrUnderscoreArtifacts(cleaned);
  const spaced = noUnderscores.replace(/\s+/g, ' ').trim();
  return fixCommonJoinedWords(spaced);
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
