import { normalizeOcrLineArtifacts, normalizeOcrTextToParagraphs } from './ocrTextNormalize.ts';

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

function bboxIntersectArea(a: TesseractBbox, b: TesseractBbox): number {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

function bboxArea(b: TesseractBbox): number {
  return Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
}

function overlapsAnyImageRegion(bbox: TesseractBbox, regions: TesseractBbox[], minOverlapRatio: number): boolean {
  if (!regions.length) return false;
  const area = Math.max(1, bboxArea(bbox));
  for (const r of regions) {
    const inter = bboxIntersectArea(bbox, r);
    if (inter / area >= minOverlapRatio) return true;
  }
  return false;
}

function stripTrailingYearTag(s: string): string {
  // Common in past-paper scans: question line ends with a year tag like [2014]
  return String(s || '')
    .replace(/\s*\[\s*\d{4}\s*\]\s*$/g, '')
    .trim();
}

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

 export function mergeParsedOptionsByLabel(base: ParsedOption[], overrides: ParsedOption[]): ParsedOption[] {
   const byLabel = new Map<string, ParsedOption>();
   for (const o of base) {
     const label = String(o.label || '').trim();
     if (!label) continue;
     byLabel.set(label, o);
   }

   for (const o of overrides) {
     const label = String(o.label || '').trim();
     if (!label) continue;
     byLabel.set(label, o);
   }

   const out: ParsedOption[] = [];
   const seen = new Set<string>();
   for (const o of base) {
     const label = String(o.label || '').trim();
     if (!label || seen.has(label)) continue;
     const merged = byLabel.get(label);
     if (merged) out.push(merged);
     seen.add(label);
   }

   for (const o of overrides) {
     const label = String(o.label || '').trim();
     if (!label || seen.has(label)) continue;
     const merged = byLabel.get(label);
     if (merged) out.push(merged);
     seen.add(label);
   }

   return out;
 }

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function looksLikeOptionBody(text: string): boolean {
  const t = normalizeLine(text);
  if (!t) return false;
  // Heuristic: option text tends to be short and not a full question sentence.
  if (t.length > 90) return false;
  if (/[?]/.test(t)) return false;
  const wordCount = t.split(/\s+/).filter(Boolean).length;
  if (wordCount > 14) return false;
  return true;
}

function matchStandaloneLetterOptionLabel(line: string): string | null {
  const s = normalizeLine(line);
  if (!s) return null;
  const m = s.match(/^\(?\s*([A-D])\s*\)?\s*$/i);
  return m ? m[1].toUpperCase() : null;
}

function matchLetteredStatementMarker(line: string): OptionMarkerMatch | null {
  const s = normalizeLine(line);
  if (!s) return null;
  // Like options, but allow A-E since some questions list statements A-E then ask for combinations.
  const m = s.match(/^\(?\s*([A-E])\s*\)?(?:\s*[\).:\-–—]\s*|\s+)(.+)$/i);
  if (!m) return null;
  return { label: String(m[1]).toUpperCase(), text: String(m[2] ?? '').trim() };
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
  // IMPORTANT: require a separator after the label so we don't match plain words like "cytokinesis".
  const letter = s.match(/^\(?\s*([A-D])\s*\)?(?:\s*[\).:\-–—]\s*|\s+)(.+)$/i);
  if (letter) {
    return { label: letter[1].toUpperCase(), text: letter[2].trim() };
  }

  // 1. / 1) / (1) / 1 -
  // IMPORTANT: require whitespace after the marker so we don't mis-detect decimals like "1.0 g".
  const num = s.match(/^\(?\s*([1-9])\s*\)?(?:\s*[\).:\-–—]\s+|\s+)(.+)$/);
  if (num) {
    return { label: num[1], text: num[2].trim() };
  }

  return null;
}

function matchLetterOptionMarker(line: string): OptionMarkerMatch | null {
  const s = normalizeLine(line);
  if (!s) return null;
  // IMPORTANT: require a separator after the label so we don't match plain words like "cytokinesis".
  const letter = s.match(/^(\(?\s*([A-D])\s*\)?(?:\s*[\).:\-–—]\s*|\s+))(.+)$/i);
  if (!letter) return null;
  return { label: letter[2].toUpperCase(), text: String(letter[3] ?? '').trim() };
}

function matchNumericOptionMarker(line: string): OptionMarkerMatch | null {
  const s = normalizeLine(line);
  if (!s) return null;
  // IMPORTANT: require whitespace after marker (avoid matching decimals like "1.0").
  const num = s.match(/^(\(?\s*([1-9])\s*\)?(?:\s*[\).:\-–—]\s+|\s+))(.+)$/);
  if (!num) return null;
  return { label: num[2], text: String(num[3] ?? '').trim() };
}

function matchInlineLetterOptions(line: string): OptionMarkerMatch[] {
  const s = normalizeLine(line);
  if (!s) return [];

  // Example OCR output (single line):
  // "A 1 and 2  B 1 and 3  C 2 and 4  D 3 and 4"
  // We detect multiple A-D markers and split by their positions.
  // IMPORTANT: case-sensitive so we don't match the article "a" in the question stem.
  // Also allow OCR outputs that omit whitespace before the marker, e.g. "system?A contract..."
  // by matching markers after any non-letter boundary.
  const re = /(^|[^A-Za-z])([A-D])\s*[\).:\-–—]?\s+/g;
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

function matchInlineParenthesizedNumericOptions(line: string): OptionMarkerMatch[] {
  const s = normalizeLine(line);
  if (!s) return [];

  // Example OCR output (single line):
  // "... (1) foo (2) bar (3) baz (4) qux"
  const re = /(^|\s)\(\s*([1-9])\s*\)\s*/g;
  const hits: Array<{ label: string; start: number; end: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const label = String(m[2] ?? '').trim();
    if (!label) continue;
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

function matchInlineParenthesizedLetterOptions(line: string): OptionMarkerMatch[] {
  const s = normalizeLine(line);
  if (!s) return [];

  // Example OCR output (single line):
  // "(a) Mg, 0.16 g   (b) O2, 0.16 g"
  // We detect multiple (A)-(D) markers and split by their positions.
  const re = /(^|\s)\(\s*([A-D])\s*\)\s*/gi;
  const hits: Array<{ label: string; start: number; end: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const label = String(m[2] ?? '').toUpperCase();
    if (!label) continue;
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

function stripTrailingMarkTag(input: string): string {
  // Remove trailing point/mark indicators often found in papers, e.g. "[1]".
  return String(input || '').replace(/\s*\[\s*\d{1,3}\s*\]\s*$/g, '').trimEnd();
}

function normalizeOptionBodyText(input: string): string {
  let s = String(input || '');
  // Normalize comma spacing.
  s = s.replace(/\s*,\s*/g, ', ');
  s = s.replace(/\s{2,}/g, ' ');

  // Fix common OCR join artifacts for lists like "A,BandC" / "B,DandE".
  // Only target short labels (A-E and 1-9) to avoid harming normal words.
  s = s.replace(/\b([A-E1-9])\s*and\s*([A-E1-9])\b/gi, (_m, a, b) => `${String(a).toUpperCase()} and ${String(b).toUpperCase()}`);
  s = s.replace(/\b([A-E1-9])\s*,\s*([A-E1-9])and([A-E1-9])\b/gi, (_m, a, b, c) => {
    return `${String(a).toUpperCase()}, ${String(b).toUpperCase()} and ${String(c).toUpperCase()}`;
  });
  s = s.replace(/\b([A-E1-9])and([A-E1-9])\b/gi, (_m, a, b) => `${String(a).toUpperCase()} and ${String(b).toUpperCase()}`);
  s = s.replace(/\b([A-E1-9])\s*,\s*([A-E1-9])\b/g, (_m, a, b) => `${a}, ${b}`);

  // Ensure space after semicolons/colons when OCR collapses.
  s = s.replace(/\s*([;:])\s*/g, '$1 ');
  s = s.replace(/\s{2,}/g, ' ');

  return s.trim();
}

function splitQuestionLineWithInlineOptions(line: string): { questionPart: string; optionPart: string } | null {
  const s = String(line || '');
  if (!s.trim()) return null;

  // Prefer explicit NEET markers: (a) ... (b) ...
  const neet = matchInlineParenthesizedLetterOptions(s);
  if (neet.length >= 2) {
    const m = s.match(/\(\s*[A-D]\s*\)/i);
    if (!m || typeof m.index !== 'number') return null;
    const idx = m.index;
    const questionPart = s.slice(0, idx).trimEnd();
    const optionPart = s.slice(idx).trimStart();
    if (!questionPart || !optionPart) return null;
    return { questionPart, optionPart };
  }

  // Numeric markers: (1) ... (2) ...
  // Be robust to OCR outputs that keep everything on a single line.
  const n1 = s.match(/\(\s*1\s*\)/);
  const n2 = s.match(/\(\s*2\s*\)/);
  if (n1 && n2 && typeof n1.index === 'number' && typeof n2.index === 'number') {
    const idx = n1.index;
    const questionPart = s.slice(0, idx).trimEnd();
    const optionPart = s.slice(idx).trimStart();
    if (!questionPart || !optionPart) return null;
    return { questionPart, optionPart };
  }

  // Also support compact inline options like: "... A one B two C three D four"
  // Do NOT depend solely on matchInlineLetterOptions() here; we only need to know
  // that there are at least 2 markers to split the line.
  // IMPORTANT: case-sensitive so we don't match the article "a" in the question stem.
  // Also allow OCR outputs that omit whitespace before the marker, e.g. "system?A contract..."
  // by matching markers after any non-letter boundary.
  const markerRe = /(^|[^A-Za-z])([A-D])\s*[\).:\-–—]?\s+/g;
  const hits: Array<{ idx: number; lead: string }> = [];
  let m2: RegExpExecArray | null;
  while ((m2 = markerRe.exec(s))) {
    hits.push({ idx: m2.index + String(m2[1] ?? '').length, lead: String(m2[1] ?? '') });
  }
  if (hits.length >= 2) {
    const idx = hits[0].idx;
    const questionPart = s.slice(0, idx).trimEnd();
    const optionPart = s.slice(idx).trimStart();
    if (!questionPart || !optionPart) return null;
    return { questionPart, optionPart };
  }

  return null;
}

export function parseScreenshotOcrToDraft(ocrText: string): ScreenshotQuestionDraft {
  // Preserve blank lines so we can treat them as paragraph breaks (double newline).
  const rawLines0 = ocrText
    .split(/\r?\n/)
    .map((l) => normalizeOcrLineArtifacts(l))
    .map((l) => l.replace(/\s+$/g, ''));

  // Some past-paper OCR outputs put the options on the SAME line as the question.
  // Split that into two lines so the existing option parser can pick it up.
  const rawLines: string[] = [];
  for (const l of rawLines0) {
    const split = splitQuestionLineWithInlineOptions(l);
    if (split) {
      rawLines.push(split.questionPart);
      rawLines.push(split.optionPart);
    } else {
      rawLines.push(l);
    }
  }

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
  // IMPORTANT: Avoid false-positives where a line begins with an article like "a ...".
  // Also, if we have A-D options later, do NOT treat numbered statements (1,2,3,4)
  // as options. Those often belong to the question stem.
  let optionStartRawIdx = -1;

  // If the block contains 2+ numeric option markers, prefer numeric options.
  // This helps questions that list statements A-E and then provide answers as (1)-(4).
  const numericOptionMarkersInBlock = trimmedNonBlank.filter((x) => !!matchNumericOptionMarker(x.text)).length;

  for (const x of trimmedNonBlank) {
    const m = matchOptionMarker(x.text);
    if (!m) continue;

    // Guard against question stems that start with the article "A ...".
    // When OCR collapses/normalizes, the first character may look like an option label.
    // Only apply this guard to the first non-blank line to avoid breaking real option lines.
    if (
      x.idx === trimmedNonBlank[0]?.idx &&
      String(m.label || '').toUpperCase() === 'A' &&
      /^[a-z]/.test(String(m.text || '').trimStart())
    ) {
      continue;
    }

    // If we likely have numeric options later, treat letter markers (A-E) in the stem
    // as statements rather than option starts.
    if (numericOptionMarkersInBlock >= 2 && /^[A-E]$/i.test(String(m.label || '').trim())) {
      continue;
    }

    // If the current line itself contains multiple inline markers (e.g. "... (a) ... (b) ...")
    // treat it as an option start without requiring a later marker line.
    // This is important for single-line question+options OCR outputs.
    const inlineHere = matchInlineLetterOptions(x.text);
    const inlineNeetHere = matchInlineParenthesizedLetterOptions(x.text);
    const inlineNumHere = matchInlineParenthesizedNumericOptions(x.text);
    if (inlineHere.length >= 2 || inlineNeetHere.length >= 2 || inlineNumHere.length >= 2) {
      optionStartRawIdx = x.idx;
      break;
    }

     // Guard: only accept an option start marker if there is at least one more
     // marker of the SAME family (letters or numbers) later in the block.
     // This prevents false-positives like a question stem starting with "A ...".
     const isLetterMarker = /^[A-D]$/i.test(m.label);
     const isNumericMarker = /^[1-9]$/.test(m.label);
     let hasAnotherSameFamily = false;
     for (const y of trimmedNonBlank) {
       if (y.idx <= x.idx) continue;
       const my = matchOptionMarker(y.text);
       if (!my) continue;
       if (isLetterMarker && /^[A-D]$/i.test(my.label)) {
         hasAnotherSameFamily = true;
         break;
       }
       if (isNumericMarker && /^[1-9]$/.test(my.label)) {
         hasAnotherSameFamily = true;
         break;
       }
     }
     if (!hasAnotherSameFamily) continue;

    // If the marker is a letter A-D, require it to look like an option (short, no '?').
    const isLetter = /^[A-D]$/i.test(m.label);
    if (isLetter && !looksLikeOptionBody(m.text)) {
      // Special case: options are on the same line: "A ... B ... C ... D ...".
      // The first option's text will look very long, but we still want to treat this as options.
      const inline = matchInlineLetterOptions(x.text);
      const inlineNeet = matchInlineParenthesizedLetterOptions(x.text);
      if (inline.length < 2 && inlineNeet.length < 2) continue;
    }

    optionStartRawIdx = x.idx;
    break;
  }

  // If we didn't find a normal "A text" option marker, handle cases where OCR outputs
  // "A" on one line and the option body on the next line.
  if (optionStartRawIdx < 0) {
    for (let i = 0; i < trimmedNonBlank.length; i += 1) {
      const x = trimmedNonBlank[i];
      const label = matchStandaloneLetterOptionLabel(x.text);
      if (!label) continue;
      const next = trimmedNonBlank[i + 1];
      if (!next) continue;
      if (!looksLikeOptionBody(next.text)) continue;
      optionStartRawIdx = x.idx;
      break;
    }
  }

  const questionLines = optionStartRawIdx >= 0 ? rawLines.slice(0, optionStartRawIdx) : rawLines.slice(0);
  const optionLines = optionStartRawIdx >= 0 ? rawLines.slice(optionStartRawIdx) : [];

  // If we have a dangling standalone option label at the end of the question block,
  // drop it so the question doesn't end with "A"/"B" etc.
  while (questionLines.length) {
    const last = questionLines[questionLines.length - 1];
    if (!matchStandaloneLetterOptionLabel(last)) break;
    questionLines.pop();
  }

  const qIdxs = questionLines.map((_, i) => i);
  const optIdxs = optionStartRawIdx >= 0 ? optionLines.map((_, i) => optionStartRawIdx + i) : [];

  const hasLetterOptions = optionStartRawIdx >= 0 && optionLines.some((l) => !!matchLetterOptionMarker(l));
  const hasNumericOptions = optionStartRawIdx >= 0 && optionLines.some((l) => !!matchNumericOptionMarker(l) || matchInlineParenthesizedNumericOptions(l).length >= 2);
  const numberedStatementsInQuestion = hasLetterOptions
    ? questionLines.filter((l) => !!matchNumericOptionMarker(l)).length
    : 0;

  const letteredStatementsInQuestion = questionLines.filter((l) => !!matchLetteredStatementMarker(l)).length;

  // If the question contains multiple numbered statement lines and options are A-D,
  // keep each line as its own paragraph for clearer spacing.
  let questionText =
    (hasLetterOptions && numberedStatementsInQuestion >= 2) || (hasNumericOptions && letteredStatementsInQuestion >= 2)
      ? joinLinesPreservingLineParagraphs(questionLines)
      : joinLinesAsPlainText(questionLines);
  const stripped = stripLeadingQuestionNumber(questionText);
  questionText = stripTrailingYearTag(stripped.text);

  if (!optionLines.length) {
    return {
      questionText,
      options: [],
      rawLines,
      questionLineIndexes: qIdxs,
      optionLineIndexes: [],
    };
  }

  // Merge standalone label lines ("B") with their following non-blank line ("G1").
  // This prevents empty option texts which later show up as placeholders like "Option B".
  const mergedOptionLines: string[] = [];
  for (let i = 0; i < optionLines.length; i += 1) {
    const line = optionLines[i];
    const label = matchStandaloneLetterOptionLabel(line);
    if (!label) {
      mergedOptionLines.push(line);
      continue;
    }

    // Find next non-blank line.
    let j = i + 1;
    while (j < optionLines.length && optionLines[j].trim().length === 0) j += 1;
    if (j >= optionLines.length) {
      mergedOptionLines.push(line);
      continue;
    }

    mergedOptionLines.push(`${label} ${optionLines[j].trim()}`);
    i = j;
  }

  // Group contiguous option blocks.
  const options: ParsedOption[] = [];
  let current: ParsedOption | null = null;

  const finalizeCurrent = () => {
    if (!current) return;
    // Normalize the collected lines for this option: unwrap wrapped lines into spaces,
    // keep paragraph breaks only on blank lines.
    current.text = normalizeOptionBodyText(stripTrailingMarkTag(normalizeOcrTextToParagraphs(current.sourceLines.join('\n'))));
    options.push(current);
    current = null;
  };

  for (const line of mergedOptionLines) {
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
        const t = normalizeOptionBodyText(stripTrailingMarkTag(o.text));
        options.push({ label: o.label, text: t, sourceLines: [t] });
      }
      current = null;
      continue;
    }

    const inlineNeet = matchInlineParenthesizedLetterOptions(line);
    if (inlineNeet.length) {
      finalizeCurrent();
      for (const o of inlineNeet) {
        const t = normalizeOptionBodyText(stripTrailingMarkTag(o.text));
        options.push({ label: o.label, text: t, sourceLines: [t] });
      }
      current = null;
      continue;
    }

    const inlineNum = matchInlineParenthesizedNumericOptions(line);
    if (inlineNum.length) {
      finalizeCurrent();
      for (const o of inlineNum) {
        const t = normalizeOptionBodyText(stripTrailingMarkTag(o.text));
        options.push({ label: o.label, text: t, sourceLines: [t] });
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
      questionText: stripTrailingYearTag(strippedFallback.text),
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

export function parseScreenshotOcrToDraftsFromTesseract(
  raw: unknown,
  img: ImageData,
  opts?: { excludeBboxes?: TesseractBbox[] }
): ScreenshotQuestionDraft[] {
  const r = raw as TesseractRaw;
  const exclude = (opts?.excludeBboxes ?? []) as TesseractBbox[];
  const linesAll = (r?.data?.lines ?? []) as TesseractLine[];
  const wordsAll = (r?.data?.words ?? []) as TesseractWord[];

  // Drop text that belongs to detected diagram/image regions so it doesn't pollute the question/options.
  const lines = exclude.length ? linesAll.filter((l) => !overlapsAnyImageRegion(l.bbox, exclude, 0.45)) : linesAll;
  const words = exclude.length ? wordsAll.filter((w) => !overlapsAnyImageRegion(w.bbox, exclude, 0.55)) : wordsAll;

  if (!lines.length) {
    const fallbackText = String(r?.data?.text ?? '');
    return parseScreenshotOcrToDrafts(fallbackText);
  }

  const normalizedText = normalizeTesseractLinesToParagraphs(lines);

  const minLineY0 = lines.reduce((m, l) => Math.min(m, l.bbox.y0), Number.POSITIVE_INFINITY);

  const parsedOptions: ParsedOption[] = [];
  for (const line of lines) {
    const text = normalizeLine(String(line.text || ''));
    if (!text) continue;

    // Guard against question stems that begin with the article "A ...".
    // In some scans, the first "A" is dark enough to be treated as a bold option marker,
    // which then gets merged into option A.
    const isTopLine = line.bbox.y0 <= minLineY0 + 10;
    if (isTopLine) {
      const m0 = matchOptionMarker(text);
      if (m0 && String(m0.label || '').toUpperCase() === 'A' && /^[a-z]/.test(String(m0.text || '').trimStart())) {
        continue;
      }
    }

    const inlineNum = matchInlineParenthesizedNumericOptions(text);
    if (inlineNum.length) {
      for (const o of inlineNum) {
        parsedOptions.push({ label: o.label, text: o.text, sourceLines: [o.text] });
      }
      continue;
    }

    const inline = matchInlineLetterOptions(text);
    if (inline.length) {
      const markers = extractBoldLetterMarkersFromLine(line, words, img);
      const boldLabels = new Set(markers.map((m) => m.label));
      const boldHits = inline.filter((o) => boldLabels.has(o.label)).length;
      if (boldHits >= 2) {
        for (const o of inline) {
          parsedOptions.push({ label: o.label, text: o.text, sourceLines: [o.text] });
        }
      }
      continue;
    }

    const num = matchNumericOptionMarker(text);
    if (num) {
      parsedOptions.push({ label: num.label, text: '', sourceLines: [num.text] });
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

   const mergedOptions = draft.options.length >= 2 ? mergeParsedOptionsByLabel(draft.options, uniq) : uniq;

  return [
    {
      ...draft,
      options: mergedOptions.length >= 2 ? mergedOptions : draft.options,
    },
  ];
}
