import { normalizeOcrLineArtifacts, normalizeOcrTextToParagraphs } from '@/lib/ocrTextNormalize';

type TesseractBbox = { x0: number; y0: number; x1: number; y1: number };

type TesseractWord = {
  text: string;
  bbox: TesseractBbox;
  confidence?: number;
};

type TesseractLine = {
  text: string;
  bbox: TesseractBbox;
};

type TesseractRaw = {
  data: {
    text?: string;
    words?: TesseractWord[];
    lines?: TesseractLine[];
  };
};

export type ParsedOption = {
  label: string; // e.g. A, B, C, D or 1,2,3
  text: string;
  sourceLines: string[];
};

export type ScreenshotQuestionDraft = {
  questionText: string;
  options: ParsedOption[];
  rawLines: string[];
  questionLineIndexes: number[];
  optionLineIndexes: number[];
};

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pixelLum(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function scanBoxInkRatio(img: ImageData, bbox: TesseractBbox, lumThreshold: number): number {
  const w = img.width;
  const h = img.height;
  const x0 = clamp(Math.floor(bbox.x0), 0, w - 1);
  const x1 = clamp(Math.floor(bbox.x1), 0, w - 1);
  const y0 = clamp(Math.floor(bbox.y0), 0, h - 1);
  const y1 = clamp(Math.floor(bbox.y1), 0, h - 1);
  if (x1 <= x0 || y1 <= y0) return 0;

  let dark = 0;
  let total = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const idx = (y * w + x) * 4;
      const lum = pixelLum(img.data[idx], img.data[idx + 1], img.data[idx + 2]);
      if (lum < lumThreshold) dark += 1;
      total += 1;
    }
  }
  return total ? dark / total : 0;
}

function isBoldDarkishWord(word: TesseractWord, img: ImageData): boolean {
  // Heuristic tuned similarly to ScreenshotToQuestionModal.
  const ink = scanBoxInkRatio(img, word.bbox, 110);
  return ink > 0.22;
}

function normalizeTesseractLinesToParagraphs(lines: TesseractLine[]): string {
  // Reconstruct paragraphs by using visual vertical gaps instead of requiring blank lines in OCR.
  // Rule of thumb: if the gap between consecutive lines is ~>= one line-height, treat as paragraph.
  const sorted = [...lines]
    .filter((l) => String(l.text || '').trim().length > 0)
    .sort((a, b) => a.bbox.y0 - b.bbox.y0);
  if (!sorted.length) return '';

  const heights = sorted.map((l) => Math.max(1, l.bbox.y1 - l.bbox.y0)).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 14;
  const paraGap = Math.max(6, medianH * 0.9);

  const out: string[] = [];
  let prev: TesseractLine | null = null;
  for (const l of sorted) {
    const text = normalizeOcrLineArtifacts(String(l.text || '')).replace(/\s+$/g, '');
    if (!text.trim()) continue;
    if (prev) {
      const gap = l.bbox.y0 - prev.bbox.y1;
      if (gap >= paraGap) out.push('');
    }
    out.push(text);
    prev = l;
  }
  return normalizeOcrTextToParagraphs(out.join('\n'));
}

function matchLetterOptionMarkerInText(line: string): OptionMarkerMatch | null {
  return matchLetterOptionMarker(line);
}

function extractBoldLetterMarkersFromLine(
  line: TesseractLine,
  words: TesseractWord[],
  img: ImageData
): Array<{ label: string; x: number }> {
  const out: Array<{ label: string; x: number }> = [];
  const lineWords = words.filter((w) => {
    const cy = (w.bbox.y0 + w.bbox.y1) / 2;
    return cy >= line.bbox.y0 - 4 && cy <= line.bbox.y1 + 4;
  });

  for (const w of lineWords) {
    const t = String(w.text || '').trim();
    if (!/^[A-D]$/i.test(t)) continue;
    if (!isBoldDarkishWord(w, img)) continue;
    out.push({ label: t.toUpperCase(), x: w.bbox.x0 });
  }

  return out.sort((a, b) => a.x - b.x);
}

export function stripLeadingQuestionNumber(input: string): { text: string; stripped: boolean } {
  const s = input.trimStart();

  // Examples:
  // 1. ...
  // 12) ...
  // Q1 ...
  // Q.1 ...
  // Q 1) ...
  // Question 1. ...
  const patterns: RegExp[] = [
    /^\(?\s*Q\s*\.?\s*(\d{1,3})\s*[\).:\-–—]?\s+/i,
    /^\(?\s*Question\s+(\d{1,3})\s*[\).:\-–—]?\s+/i,
    /^(\d{1,3})\s*[\).:\-–—]\s+/,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      return { text: s.slice(m[0].length).trimStart(), stripped: true };
    }
  }

  return { text: s, stripped: false };
}

function looksLikeQuestionStartLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  return stripLeadingQuestionNumber(s).stripped;
}

export type OptionMarkerMatch = {
  label: string;
  text: string;
};

export function matchOptionMarker(line: string): OptionMarkerMatch | null {
  const s = normalizeLine(line);
  if (!s) return null;

  // A. / A) / A - / (A) / A :
  const letter = s.match(/^\(?\s*([A-D])\s*\)?\s*[\).:\-–—]?\s*(.+)$/i);
  if (letter) {
    return { label: letter[1].toUpperCase(), text: letter[2].trim() };
  }

  // 1. / 1) / (1) / 1 -
  const num = s.match(/^\(?\s*([1-9])\s*\)?\s*[\).:\-–—]?\s*(.+)$/);
  if (num) {
    return { label: num[1], text: num[2].trim() };
  }

  return null;
}

function matchLetterOptionMarker(line: string): OptionMarkerMatch | null {
  const s = normalizeLine(line);
  if (!s) return null;
  const letter = s.match(/^(\(?\s*([A-D])\s*\)?\s*[\).:\-–—]?\s*)(.+)$/i);
  if (!letter) return null;
  return { label: letter[2].toUpperCase(), text: String(letter[3] ?? '').trim() };
}

function matchNumericOptionMarker(line: string): OptionMarkerMatch | null {
  const s = normalizeLine(line);
  if (!s) return null;
  const num = s.match(/^(\(?\s*([1-9])\s*\)?\s*[\).:\-–—]?\s*)(.+)$/);
  if (!num) return null;
  return { label: num[2], text: String(num[3] ?? '').trim() };
}

function matchInlineLetterOptions(line: string): OptionMarkerMatch[] {
  const s = normalizeLine(line);
  if (!s) return [];

  // Example OCR output (single line):
  // "A 1 and 2  B 1 and 3  C 2 and 4  D 3 and 4"
  // We detect multiple A-D markers and split by their positions.
  const re = /(^|\s)([A-D])\s*[\).:\-–—]?\s+/gi;
  const hits: Array<{ label: string; start: number; end: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const label = String(m[2] ?? '').toUpperCase();
    if (!label) continue;
    // marker starts at label character, not the preceding whitespace
    const labelIdx = m.index + String(m[1] ?? '').length;
    hits.push({ label, start: labelIdx, end: re.lastIndex });
  }

  if (hits.length < 2) return [];

  const out: OptionMarkerMatch[] = [];
  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i];
    const next = hits[i + 1];
    const text = s.slice(cur.end, next ? next.start : undefined).trim();
    if (!text) continue;
    out.push({ label: cur.label, text });
  }
  return out;
}

function joinLinesPreservingLineParagraphs(lines: string[]): string {
  const paragraphs: string[] = [];
  for (const raw of lines) {
    const trimmedRight = raw.replace(/\s+$/g, '');
    const isBlank = trimmedRight.trim().length === 0;
    if (isBlank) {
      // preserve blank lines as paragraph breaks
      if (paragraphs.length && paragraphs[paragraphs.length - 1] !== '') paragraphs.push('');
      continue;
    }
    const cleaned = normalizeLine(trimmedRight);
    if (!cleaned) continue;
    paragraphs.push(cleaned);
  }
  // Collapse multiple blanks and ensure paragraph separation.
  const out: string[] = [];
  for (const p of paragraphs) {
    if (p === '') {
      if (out.length && out[out.length - 1] !== '') out.push('');
    } else {
      out.push(p);
    }
  }
  return out
    .join('\n')
    .split(/\n{2,}/)
    .map((p) => p.split(/\n/).filter(Boolean).join('\n\n'))
    .join('\n\n');
}

function joinLinesAsPlainText(lines: string[]): string {
  // Preserve paragraph breaks only when OCR had a true blank line.
  return normalizeOcrTextToParagraphs(lines.join('\n'));
}

export function parseScreenshotOcrToDraft(ocrText: string): ScreenshotQuestionDraft {
  // Preserve blank lines so we can treat them as paragraph breaks (double newline).
  const rawLines = ocrText
    .split(/\r?\n/)
    .map((l) => normalizeOcrLineArtifacts(l))
    .map((l) => l.replace(/\s+$/g, ''));

  const trimmedNonBlank = rawLines
    .map((l, idx) => ({ idx, text: l.trim() }))
    .filter((x) => x.text.length > 0);

  if (trimmedNonBlank.length === 0) {
    return {
      questionText: '',
      options: [],
      rawLines: [],
      questionLineIndexes: [],
      optionLineIndexes: [],
    };
  }

  // Identify first option-like line.
  // IMPORTANT: If we have A-D options later, do NOT treat numbered statements (1,2,3,4)
  // as options. Those often belong to the question stem.
  const firstLetterNonBlank = trimmedNonBlank.findIndex((x) => !!matchLetterOptionMarker(x.text));
  const firstAnyNonBlank = trimmedNonBlank.findIndex((x) => !!matchOptionMarker(x.text));
  const optionStartRawIdx =
    firstLetterNonBlank >= 0
      ? trimmedNonBlank[firstLetterNonBlank].idx
      : firstAnyNonBlank >= 0
        ? trimmedNonBlank[firstAnyNonBlank].idx
        : -1;

  const questionLines = optionStartRawIdx >= 0 ? rawLines.slice(0, optionStartRawIdx) : rawLines.slice(0);
  const optionLines = optionStartRawIdx >= 0 ? rawLines.slice(optionStartRawIdx) : [];

  const qIdxs = questionLines.map((_, i) => i);
  const optIdxs = optionStartRawIdx >= 0 ? optionLines.map((_, i) => optionStartRawIdx + i) : [];

  const hasLetterOptions = optionStartRawIdx >= 0 && optionLines.some((l) => !!matchLetterOptionMarker(l));
  const numberedStatementsInQuestion = hasLetterOptions
    ? questionLines.filter((l) => !!matchNumericOptionMarker(l)).length
    : 0;

  // If the question contains multiple numbered statement lines and options are A-D,
  // keep each line as its own paragraph for clearer spacing.
  let questionText =
    hasLetterOptions && numberedStatementsInQuestion >= 2
      ? joinLinesPreservingLineParagraphs(questionLines)
      : joinLinesAsPlainText(questionLines);
  const stripped = stripLeadingQuestionNumber(questionText);
  questionText = stripped.text;

  if (!optionLines.length) {
    return {
      questionText,
      options: [],
      rawLines,
      questionLineIndexes: qIdxs,
      optionLineIndexes: [],
    };
  }

  // Group contiguous option blocks.
  const options: ParsedOption[] = [];
  let current: ParsedOption | null = null;

  const finalizeCurrent = () => {
    if (!current) return;
    // Normalize the collected lines for this option: unwrap wrapped lines into spaces,
    // keep paragraph breaks only on blank lines.
    current.text = normalizeOcrTextToParagraphs(current.sourceLines.join('\n'));
    options.push(current);
    current = null;
  };

  for (const line of optionLines) {
    const isBlank = line.trim().length === 0;
    if (isBlank) {
      // Preserve paragraph break within the current option.
      if (current) current.sourceLines.push('');
      continue;
    }

    const inline = matchInlineLetterOptions(line);
    if (inline.length) {
      finalizeCurrent();
      for (const o of inline) {
        options.push({ label: o.label, text: '', sourceLines: [o.text] });
      }
      current = null;
      continue;
    }

    const m = matchOptionMarker(line);
    if (m) {
      finalizeCurrent();
      current = { label: m.label, text: '', sourceLines: [m.text] };
    } else {
      // Continuation line: only attach if we already started options.
      if (!current) continue;
      current.sourceLines.push(line);
    }
  }
  finalizeCurrent();

  // Conservative: if we detected only 1 option, treat it as OCR noise and keep everything as question.
  if (options.length < 2) {
    const fallbackQuestion = joinLinesAsPlainText(rawLines);
    const strippedFallback = stripLeadingQuestionNumber(fallbackQuestion);
    return {
      questionText: strippedFallback.text,
      options: [],
      rawLines,
      questionLineIndexes: rawLines.map((_, i) => i),
      optionLineIndexes: [],
    };
  }

  return {
    questionText,
    options,
    rawLines,
    questionLineIndexes: qIdxs,
    optionLineIndexes: optIdxs,
  };
}

export function parseScreenshotOcrToDrafts(ocrText: string): ScreenshotQuestionDraft[] {
  const rawLines = ocrText
    .split(/\r?\n/)
    .map((l) => normalizeOcrLineArtifacts(l))
    .map((l) => l.replace(/\s+$/g, ''));

  const segments: string[] = [];
  let buf: string[] = [];
  let optionMarkersSeenInCurrent = 0;

  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) segments.push(text);
    buf = [];
    optionMarkersSeenInCurrent = 0;
  };

  for (const line of rawLines) {
    const m = matchLetterOptionMarker(line);
    if (m) optionMarkersSeenInCurrent += 1;

    if (looksLikeQuestionStartLine(line) && optionMarkersSeenInCurrent >= 2 && buf.length) {
      flush();
    }

    buf.push(line);
  }
  flush();

  const drafts = segments
    .map((s) => parseScreenshotOcrToDraft(s))
    .filter((d) => d.options.length >= 2 || d.questionText.trim().length > 0);

  if (drafts.length <= 1) return drafts;

  return drafts.filter((d) => d.options.length >= 2);
}

export function parseScreenshotOcrToDraftsFromTesseract(raw: unknown, img: ImageData): ScreenshotQuestionDraft[] {
  const r = raw as TesseractRaw;
  const lines = (r?.data?.lines ?? []) as TesseractLine[];
  const words = (r?.data?.words ?? []) as TesseractWord[];

  if (!lines.length) {
    const fallbackText = String(r?.data?.text ?? '');
    return parseScreenshotOcrToDrafts(fallbackText);
  }

  const normalizedText = normalizeTesseractLinesToParagraphs(lines);

  const parsedOptions: ParsedOption[] = [];
  for (const line of lines) {
    const text = normalizeLine(String(line.text || ''));
    if (!text) continue;

    const inline = matchInlineLetterOptions(text);
    if (inline.length) {
      const markers = extractBoldLetterMarkersFromLine(line, words, img);
      const boldLabels = new Set(markers.map((m) => m.label));
      const boldHits = inline.filter((o) => boldLabels.has(o.label)).length;
      if (boldHits >= 2) {
        for (const o of inline) {
          parsedOptions.push({ label: o.label, text: '', sourceLines: [o.text] });
        }
      }
      continue;
    }

    const m = matchLetterOptionMarkerInText(text);
    if (!m) continue;
    const markers = extractBoldLetterMarkersFromLine(line, words, img);
    const ok = markers.some((x) => x.label === m.label);
    if (!ok) continue;
    parsedOptions.push({ label: m.label, text: '', sourceLines: [m.text] });
  }

  const draft = parseScreenshotOcrToDraft(normalizedText);

  // If bold/dark marker detection missed the options (common in clean scans/screenshots),
  // fall back to the text-based parser which recognizes A-D prefixes.
  if (parsedOptions.length < 2) {
    if (draft.options.length >= 2) return [draft];
    const stripped = stripLeadingQuestionNumber(normalizedText);
    return [
      {
        questionText: stripped.text,
        options: [],
        rawLines: normalizedText.split(/\r?\n/),
        questionLineIndexes: normalizedText.split(/\r?\n/).map((_, i) => i),
        optionLineIndexes: [],
      },
    ];
  }

  const uniq: ParsedOption[] = [];
  const seen = new Set<string>();
  for (const o of parsedOptions) {
    const key = `${o.label}::${normalizeLine(o.sourceLines.join(' '))}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push({ ...o, text: normalizeOcrTextToParagraphs(o.sourceLines.join('\n')) });
  }
  uniq.sort((a, b) => a.label.localeCompare(b.label));

  return [
    {
      ...draft,
      options: uniq.length >= 2 ? uniq : draft.options,
    },
  ];
}
