import { normalizeOcrTextToParagraphs } from '@/lib/ocrTextNormalize';

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
  const letter = s.match(/^\(?\s*([A-D])\s*\)?\s*[\).:\-–—]?\s+(.*)$/i);
  if (letter) {
    return { label: letter[1].toUpperCase(), text: letter[2].trim() };
  }

  // 1. / 1) / (1) / 1 -
  const num = s.match(/^\(?\s*([1-9])\s*\)?\s*[\).:\-–—]?\s+(.*)$/);
  if (num) {
    return { label: num[1], text: num[2].trim() };
  }

  return null;
}

function joinLinesAsPlainText(lines: string[]): string {
  // Preserve paragraph breaks only when OCR had a true blank line.
  return normalizeOcrTextToParagraphs(lines.join('\n'));
}

export function parseScreenshotOcrToDraft(ocrText: string): ScreenshotQuestionDraft {
  // Preserve blank lines so we can treat them as paragraph breaks (double newline).
  const rawLines = ocrText
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00A0/g, ' '))
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

  // Identify first option-like line in the original rawLines while skipping blanks.
  const optionStartNonBlank = trimmedNonBlank.findIndex((x) => !!matchOptionMarker(x.text));
  const optionStartRawIdx = optionStartNonBlank >= 0 ? trimmedNonBlank[optionStartNonBlank].idx : -1;

  const questionLines = optionStartRawIdx >= 0 ? rawLines.slice(0, optionStartRawIdx) : rawLines.slice(0);
  const optionLines = optionStartRawIdx >= 0 ? rawLines.slice(optionStartRawIdx) : [];

  const qIdxs = questionLines.map((_, i) => i);
  const optIdxs = optionStartRawIdx >= 0 ? optionLines.map((_, i) => optionStartRawIdx + i) : [];

  let questionText = joinLinesAsPlainText(questionLines);
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
    .map((l) => l.replace(/\u00A0/g, ' '))
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
    const m = matchOptionMarker(line);
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
