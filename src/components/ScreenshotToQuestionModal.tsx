import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Crop, Loader2, Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

import { recognizeImageText } from '@/lib/offlineOcr';
import {
  parseScreenshotOcrToDrafts,
  parseScreenshotOcrToDraftsFromTesseract,
  type ScreenshotQuestionDraft,
} from '@/lib/screenshotQuestionParser';
import { ocrTextToRichHtml } from '@/lib/htmlDraft';
import { normalizeOcrTextToParagraphs } from '@/lib/ocrTextNormalize';
import type { RecognizeResult } from 'tesseract.js';

type DraftOption = {
  id: string;
  label: string;
  text: string;
  attachedImages?: string[];
};

type DraftUiState = {
  question: string;
  options: DraftOption[];
  correctOptionId: string | null;
  rawLines: string[];
  detectedMcq: boolean;
  attachedImages: string[];
};

export type ScreenshotToQuestionPastePayload = {
  questionHtml: string;
  optionsHtml: Array<{ id: string; html: string }>;
  correctOptionIds: string[];
  questionImageDataUrls: string[];
  optionImageDataUrls: Record<string, string[]>;
};

type Props = {
  files: File[];
  onApply: (payload: ScreenshotToQuestionPastePayload) => void;
};

type CropRect = { x: number; y: number; w: number; h: number };

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function HtmlPreview({ html }: { html: string }) {
  const safe = String(html || '');
  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

export async function blobToImageData(blob: Blob): Promise<{ data: ImageData; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pixelLum(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function scanHorizontalInkRatio(
  img: ImageData,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  lumThreshold: number
): number {
  const w = img.width;
  const h = img.height;
  const ix0 = Math.max(0, Math.min(w - 1, Math.floor(x0)));
  const ix1 = Math.max(0, Math.min(w - 1, Math.floor(x1)));
  const iy0 = Math.max(0, Math.min(h - 1, Math.floor(y0)));
  const iy1 = Math.max(0, Math.min(h - 1, Math.floor(y1)));
  if (ix1 <= ix0 || iy1 < iy0) return 0;

  let dark = 0;
  let total = 0;

  for (let y = iy0; y <= iy1; y++) {
    for (let x = ix0; x <= ix1; x++) {
      const idx = (y * w + x) * 4;
      const lum = pixelLum(img.data[idx], img.data[idx + 1], img.data[idx + 2]);
      if (lum < lumThreshold) dark += 1;
      total += 1;
    }
  }

  return total ? dark / total : 0;
}

function escapeHtmlInline(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function richHtmlFromTesseractWithDecorations(
  raw: RecognizeResult,
  img: ImageData,
  opts: { inferUnderlineStrike: boolean; experimentalBoldItalic: boolean }
): string {
  const words = (raw.data as any)?.words as
    | Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence?: number }>
    | undefined;

  const lines = (raw.data as any)?.lines as
    | Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>
    | undefined;

  if (!words?.length) {
    return ocrTextToRichHtml(normalizeOcrTextToParagraphs(raw.data.text || ''));
  }

  const byYThenX = [...words].sort((a, b) => {
    const ay = (a.bbox.y0 + a.bbox.y1) / 2;
    const by = (b.bbox.y0 + b.bbox.y1) / 2;
    if (Math.abs(ay - by) > 6) return ay - by;
    return a.bbox.x0 - b.bbox.x0;
  });

  const lineBuckets: Array<{ bbox: { x0: number; y0: number; x1: number; y1: number }; words: typeof byYThenX }> = [];

  if (lines?.length) {
    for (const l of lines) {
      lineBuckets.push({ bbox: l.bbox, words: [] as any });
    }
    for (const w of byYThenX) {
      const cy = (w.bbox.y0 + w.bbox.y1) / 2;
      let bestIdx = -1;
      let bestScore = -Infinity;
      for (let i = 0; i < lineBuckets.length; i++) {
        const lb = lineBuckets[i];
        const inY = cy >= lb.bbox.y0 - 4 && cy <= lb.bbox.y1 + 4;
        if (!inY) continue;
        const score = -Math.abs(((lb.bbox.y0 + lb.bbox.y1) / 2) - cy);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) lineBuckets[bestIdx].words.push(w as any);
      else {
        lineBuckets.push({ bbox: w.bbox, words: [w as any] });
      }
    }
  } else {
    for (const w of byYThenX) {
      const cy = (w.bbox.y0 + w.bbox.y1) / 2;
      const existing = lineBuckets.find((lb) => cy >= lb.bbox.y0 - 6 && cy <= lb.bbox.y1 + 6);
      if (existing) {
        existing.words.push(w as any);
        existing.bbox = {
          x0: Math.min(existing.bbox.x0, w.bbox.x0),
          y0: Math.min(existing.bbox.y0, w.bbox.y0),
          x1: Math.max(existing.bbox.x1, w.bbox.x1),
          y1: Math.max(existing.bbox.y1, w.bbox.y1),
        };
      } else {
        lineBuckets.push({ bbox: w.bbox, words: [w as any] });
      }
    }
  }

  const sortedLines = lineBuckets.sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const paragraphs: string[] = [];

  for (const line of sortedLines) {
    const ws = [...line.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (!ws.length) continue;

    const avgH = ws.reduce((s, w) => s + (w.bbox.y1 - w.bbox.y0), 0) / ws.length;
    const gapSpacePx = Math.max(6, avgH * 0.4);

    let htmlLine = '';
    let prevX1: number | null = null;

    for (const w of ws) {
      const rawText = String(w.text ?? '').trim();
      if (!rawText) continue;

      if (prevX1 != null) {
        const gap = w.bbox.x0 - prevX1;
        if (gap > gapSpacePx) htmlLine += ' ';
      }

      let content = escapeHtmlInline(rawText);

      if (opts.inferUnderlineStrike) {
        const height = Math.max(1, w.bbox.y1 - w.bbox.y0);
        const underlineBandTop = w.bbox.y1 + Math.max(1, height * 0.05);
        const underlineBandBottom = w.bbox.y1 + Math.max(2, height * 0.22);
        const strikeY = (w.bbox.y0 + w.bbox.y1) / 2;
        const strikeBandTop = strikeY - Math.max(1, height * 0.08);
        const strikeBandBottom = strikeY + Math.max(1, height * 0.08);

        const underlineInk = scanHorizontalInkRatio(img, w.bbox.x0, w.bbox.x1, underlineBandTop, underlineBandBottom, 90);
        const strikeInk = scanHorizontalInkRatio(img, w.bbox.x0, w.bbox.x1, strikeBandTop, strikeBandBottom, 90);

        const underline = underlineInk > 0.18;
        const strike = strikeInk > 0.14;

        if (strike) content = `<s>${content}</s>`;
        if (underline) content = `<u>${content}</u>`;
      }

      if (opts.experimentalBoldItalic) {
        const boxInk = scanHorizontalInkRatio(
          img,
          w.bbox.x0,
          w.bbox.x1,
          w.bbox.y0,
          w.bbox.y1,
          110
        );
        const boldish = boxInk > 0.22;
        const italicish = clamp01((w.bbox.x1 - w.bbox.x0) / Math.max(1, w.bbox.y1 - w.bbox.y0)) > 3.8;
        if (italicish) content = `<em>${content}</em>`;
        if (boldish) content = `<strong>${content}</strong>`;
      }

      htmlLine += content;
      prevX1 = w.bbox.x1;
    }

    const finalLine = htmlLine.trim();
    if (finalLine) paragraphs.push(`<p>${finalLine}</p>`);
  }

  return paragraphs.join('');
}

function stripHtmlToText(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined') return html.replace(/<[^>]*>/g, ' ');
  try {
    const el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Failed to read file'));
    r.onload = () => {
      if (typeof r.result !== 'string') {
        reject(new Error('Unexpected FileReader result'));
        return;
      }
      resolve(r.result);
    };
    r.readAsDataURL(file);
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeCropRect(r: CropRect): CropRect {
  const x = Math.min(r.x, r.x + r.w);
  const y = Math.min(r.y, r.y + r.h);
  const w = Math.abs(r.w);
  const h = Math.abs(r.h);
  return { x, y, w, h };
}

async function cropImageDataUrl(dataUrl: string, crop: CropRect, imgEl: HTMLImageElement): Promise<Blob> {
  const { x, y, w, h } = normalizeCropRect(crop);

  const naturalW = imgEl.naturalWidth || imgEl.width;
  const naturalH = imgEl.naturalHeight || imgEl.height;

  const rect = imgEl.getBoundingClientRect();

  // The <img> uses object-contain, meaning the image content may be letterboxed
  // inside the element. Compute the displayed image rect within the element.
  const boxW = rect.width;
  const boxH = rect.height;
  const imgRatio = naturalW / naturalH;
  const boxRatio = boxW / boxH;
  let dispW = boxW;
  let dispH = boxH;
  let offX = 0;
  let offY = 0;
  if (imgRatio > boxRatio) {
    dispW = boxW;
    dispH = boxW / imgRatio;
    offY = (boxH - dispH) / 2;
  } else {
    dispH = boxH;
    dispW = boxH * imgRatio;
    offX = (boxW - dispW) / 2;
  }

  const relX = clamp(x - offX, 0, dispW);
  const relY = clamp(y - offY, 0, dispH);
  const relW = clamp(w, 1, dispW - relX);
  const relH = clamp(h, 1, dispH - relY);

  const scaleX = naturalW / dispW;
  const scaleY = naturalH / dispH;

  // IMPORTANT: Do not pad the crop. Padding can pull in surrounding text that
  // was not selected by the user.
  const sx = clamp(relX * scaleX, 0, naturalW);
  const sy = clamp(relY * scaleY, 0, naturalH);
  const sw = clamp(relW * scaleX, 1, naturalW - sx);
  const sh = clamp(relH * scaleY, 1, naturalH - sy);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');

  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load image'));
  });

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) {
        reject(new Error('Failed to create cropped image blob'));
        return;
      }
      resolve(b);
    }, 'image/png');
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Failed to read blob'));
    r.onload = () => {
      if (typeof r.result !== 'string') {
        reject(new Error('Unexpected FileReader result'));
        return;
      }
      resolve(r.result);
    };
    r.readAsDataURL(blob);
  });
}

async function resizeImageDataUrl(dataUrl: string, maxW: number, maxH: number): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load image'));
  });

  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (!w || !h) return dataUrl;

  const scale = Math.min(1, maxW / w, maxH / h);
  if (scale >= 1) return dataUrl;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.imageSmoothingEnabled = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx as any).imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/png');
}

function buildDefaultOptions(): DraftOption[] {
  return [
    { id: uuidv4(), label: 'A', text: 'a) Option A' },
    { id: uuidv4(), label: 'B', text: 'b) Option B' },
    { id: uuidv4(), label: 'C', text: 'c) Option C' },
    { id: uuidv4(), label: 'D', text: 'd) Option D' },
  ];
}

function normalizeOptionLabel(label: string): string {
  const s = String(label || '').trim();
  if (!s) return '';
  const upper = s.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return upper;
  if (/^[1-9]$/.test(s)) {
    const n = Number(s);
    if (n >= 1 && n <= 26) return String.fromCharCode(64 + n);
  }
  return upper;
}

function isDefaultOptionText(text: string, label: string) {

  const t = String(text || '').trim().toLowerCase();
  const lbl = String(label || '').trim().toLowerCase();
  const lettered = `${lbl}) option ${lbl}`;
  return t === `option ${lbl}` || t === lettered;
}

function buildOptionsFromParsed(parsed: ScreenshotQuestionDraft): DraftOption[] {
  const defaults = buildDefaultOptions();
  if (!parsed.options || parsed.options.length < 2) return defaults;

  const fromParsed: DraftOption[] = parsed.options.map((o) => ({
    id: uuidv4(),
    label: normalizeOptionLabel(o.label),
    text: ocrTextToRichHtml(o.text),
    attachedImages: [],
  }));

  const parsedLabels = new Set(fromParsed.map((o) => o.label));
  const remainingDefaults = defaults.filter((d) => !parsedLabels.has(d.label));
  return [...fromParsed, ...remainingDefaults];
}

export default function ScreenshotToQuestionModal({ files, onApply }: Props) {
  const [tab, setTab] = useState('0');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ status?: string; progress?: number } | null>(null);

  const [showScreenshotPanel, setShowScreenshotPanel] = useState(true);

  const [drafts, setDrafts] = useState<ScreenshotQuestionDraft[]>([]);
  const [draftIndex, setDraftIndex] = useState(0);

  const [draftUi, setDraftUi] = useState<DraftUiState[]>([]);

  const [draftQuestion, setDraftQuestion] = useState('');
  const [draftOptions, setDraftOptions] = useState<DraftOption[]>([]);
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [detectedMcq, setDetectedMcq] = useState(false);

  const [selectedOcrText, setSelectedOcrText] = useState('');

  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [attachedQuestionImages, setAttachedQuestionImages] = useState<string[]>([]);

  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [cropAssignTarget, setCropAssignTarget] = useState<'question' | { optionId: string } | null>(null);

  const [inferFormatting, setInferFormatting] = useState(true);
  const [experimentalBoldItalic, setExperimentalBoldItalic] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);

  const activeIndex = useMemo(() => {
    const n = Number(tab);
    return Number.isFinite(n) ? clamp(n, 0, Math.max(0, files.length - 1)) : 0;
  }, [tab, files.length]);

  useEffect(() => {
    if (!files.length) {
      setImageUrls([]);
      setDraftQuestion('');
      setDraftOptions([]);
      setRawLines([]);
      setDetectedMcq(false);
      setAttachedQuestionImages([]);
      setDrafts([]);
      setDraftIndex(0);
      setDraftUi([]);
      return;
    }

    setTab('0');
    setCropMode(false);
    setCropRect(null);
    setCropAssignTarget(null);
    setProgress(null);
    setShowScreenshotPanel(true);
    setCorrectOptionId(null);
    setAttachedQuestionImages([]);
    setDetectedMcq(false);
    setDrafts([]);
    setDraftIndex(0);
    setDraftUi([]);

    void (async () => {
      try {
        const urls = await Promise.all(files.map((f) => fileToDataUrl(f)));
        setImageUrls(urls);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load screenshots');
      }
    })();
  }, [files]);

  const syncDraftUiAtIndex = (idx: number, next: Partial<DraftUiState>) => {
    setDraftUi((prev) => {
      if (idx < 0) return prev;
      const base: DraftUiState =
        prev[idx] ??
        ({
          question: '',
          options: buildDefaultOptions(),
          correctOptionId: null,
          rawLines: [],
          detectedMcq: false,
          attachedImages: [],
        } satisfies DraftUiState);
      const copy = [...prev];
      copy[idx] = { ...base, ...next };
      return copy;
    });
  };

  const applyParsedDraft = (parsed: ScreenshotQuestionDraft) => {
    const isMcq = parsed.options.length >= 2;
    const baseOptions = buildOptionsFromParsed(parsed);
    const idx = draftIndex;
    const existing = draftUi[idx];

    const existingLooksDefault =
      !!existing?.options?.length &&
      existing.options.every((o) => isDefaultOptionText(o.text, o.label));

    const merged: DraftUiState = {
      question: ocrTextToRichHtml(parsed.questionText),
      options: existing?.options?.length && !existingLooksDefault ? existing.options : baseOptions,
      correctOptionId: existing?.correctOptionId ?? null,
      rawLines: parsed.rawLines,
      detectedMcq: isMcq,
      attachedImages: existing?.attachedImages ?? [],
    };
    syncDraftUiAtIndex(idx, merged);

    setDraftQuestion(merged.question);
    setDraftOptions(merged.options);
    setCorrectOptionId(merged.correctOptionId);
    setRawLines(merged.rawLines);
    setDetectedMcq(merged.detectedMcq);
    setAttachedQuestionImages(merged.attachedImages);
  };

  useEffect(() => {
    if (!drafts.length) return;
    const next = drafts[clamp(draftIndex, 0, drafts.length - 1)];
    if (!next) return;
    const state = draftUi[draftIndex];
    const uiLooksForDifferentDraftSet = draftUi.length !== drafts.length;
    if (state && !uiLooksForDifferentDraftSet) {
      setDraftQuestion(state.question);
      setDraftOptions(state.options);
      setCorrectOptionId(state.correctOptionId);
      setRawLines(state.rawLines);
      setDetectedMcq(state.detectedMcq);
      setAttachedQuestionImages(state.attachedImages);
    } else {
      applyParsedDraft(next);
    }
  }, [draftIndex, drafts, draftUi]);

  useEffect(() => {
    if (!files.length) return;

    // Auto-run OCR on load (first screenshot) for speed.
    void (async () => {
      try {
        setBusy(true);
        setProgress(null);
        const res = await recognizeImageText(files[0], {
          lang: 'eng',
          onProgress: setProgress,
        });
        let nextDrafts: ScreenshotQuestionDraft[];
        try {
          const { data } = await blobToImageData(files[0]);
          nextDrafts = parseScreenshotOcrToDraftsFromTesseract(res.raw as any, data);
        } catch {
          nextDrafts = parseScreenshotOcrToDrafts(res.text);
        }
        setDrafts(nextDrafts);
        setDraftIndex(0);
        const nextUi: DraftUiState[] = nextDrafts.map((d) => ({
          question: ocrTextToRichHtml(d.questionText),
          options: buildOptionsFromParsed(d),
          correctOptionId: null,
          rawLines: d.rawLines,
          detectedMcq: d.options.length >= 2,
          attachedImages: [],
        }));
        setDraftUi(nextUi);
        if (nextDrafts[0]) {
          setDraftQuestion(nextUi[0].question);
          setDraftOptions(nextUi[0].options);
          setCorrectOptionId(nextUi[0].correctOptionId);
          setRawLines(nextUi[0].rawLines);
          setDetectedMcq(nextUi[0].detectedMcq);
          setAttachedQuestionImages(nextUi[0].attachedImages);
        }
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message ? String(e.message) : 'OCR failed');
      } finally {
        setBusy(false);
        setProgress(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const runOcrForActiveImage = async () => {
    if (!imageUrls[activeIndex]) return;

    try {
      setBusy(true);
      setProgress(null);
      const res = await recognizeImageText(imageUrls[activeIndex], {
        lang: 'eng',
        onProgress: setProgress,
      });

      let nextDrafts: ScreenshotQuestionDraft[];
      try {
        const url = imageUrls[activeIndex];
        const b = await fetch(url).then((r) => r.blob());
        const { data } = await blobToImageData(b);
        nextDrafts = parseScreenshotOcrToDraftsFromTesseract(res.raw as any, data);
      } catch {
        nextDrafts = parseScreenshotOcrToDrafts(res.text);
      }
      setDrafts(nextDrafts);
      setDraftIndex(0);
      const nextUi: DraftUiState[] = nextDrafts.map((d) => ({
        question: ocrTextToRichHtml(d.questionText),
        options: buildOptionsFromParsed(d),
        correctOptionId: null,
        rawLines: d.rawLines,
        detectedMcq: d.options.length >= 2,
        attachedImages: [],
      }));
      setDraftUi(nextUi);
      if (nextDrafts[0]) {
        setDraftQuestion(nextUi[0].question);
        setDraftOptions(nextUi[0].options);
        setCorrectOptionId(nextUi[0].correctOptionId);
        setRawLines(nextUi[0].rawLines);
        setDetectedMcq(nextUi[0].detectedMcq);
        setAttachedQuestionImages(nextUi[0].attachedImages);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ? String(e.message) : 'OCR failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const runCropOcrAndAppend = async (target: 'question' | { optionId: string }) => {
    if (!cropRect) return;
    if (!imageUrls[activeIndex]) return;
    const imgEl = imgRef.current;
    if (!imgEl) return;

    try {
      setBusy(true);
      setProgress(null);
      const blob = await cropImageDataUrl(imageUrls[activeIndex], cropRect, imgEl);
      const res = await recognizeImageText(blob, {
        lang: 'eng',
        onProgress: setProgress,
      });

      let html: string;
      if (inferFormatting) {
        const { data } = await blobToImageData(blob);
        html = richHtmlFromTesseractWithDecorations(res.raw, data, {
          inferUnderlineStrike: true,
          experimentalBoldItalic,
        });
      } else {
        const text = normalizeOcrTextToParagraphs(res.text);
        html = ocrTextToRichHtml(text);
      }

      if (target === 'question') {
        setDraftQuestion((prev) => {
          const base = String(prev || '').trim();
          const next = base ? `${base}<p></p>${html}` : html;
          syncDraftUiAtIndex(draftIndex, { question: next });
          return next;
        });
      } else {
        setDraftOptions((prev) => {
          const next = prev.map((o) => {
            if (o.id !== target.optionId) return o;
            const base = String(o.text || '').trim();
            return { ...o, text: base ? `${base}<p></p>${html}` : html };
          });
          syncDraftUiAtIndex(draftIndex, { options: next });
          return next;
        });
      }

      setCropMode(false);
      setCropRect(null);
      setCropAssignTarget(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ? String(e.message) : 'Region OCR failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const insertCropIntoQuestionText = async () => {
    if (!cropRect) return;
    if (!imageUrls[activeIndex]) return;
    const imgEl = imgRef.current;
    if (!imgEl) return;

    try {
      setBusy(true);
      setProgress(null);

      const blob = await cropImageDataUrl(imageUrls[activeIndex], cropRect, imgEl);
      const dataUrl = await blobToDataUrl(blob);
      const resized = await resizeImageDataUrl(dataUrl, 1600, 1200);

      const imgHtml = `<p><img src="${resized}" alt="attached" style="max-width:100%;height:auto;" /></p>`;
      setDraftQuestion((prev) => {
        const next = `${String(prev || '').trim()}${imgHtml}`;
        syncDraftUiAtIndex(draftIndex, { question: next });
        return next;
      });

      setCropMode(false);
      setCropRect(null);
      setCropAssignTarget(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ? String(e.message) : 'Failed to insert image');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const attachCropAsQuestionImage = async () => {
    if (!cropRect) return;
    if (!imageUrls[activeIndex]) return;
    const imgEl = imgRef.current;
    if (!imgEl) return;

    try {
      setBusy(true);
      setProgress(null);

      const blob = await cropImageDataUrl(imageUrls[activeIndex], cropRect, imgEl);
      const dataUrl = await blobToDataUrl(blob);
      // Keep images sharp: only downscale if truly huge.
      const resized = await resizeImageDataUrl(dataUrl, 1600, 1200);
      setAttachedQuestionImages((prev) => {
        const next = [...prev, resized];
        syncDraftUiAtIndex(draftIndex, { attachedImages: next });
        return next;
      });

      setCropMode(false);
      setCropRect(null);
      setCropAssignTarget(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ? String(e.message) : 'Failed to attach image');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const attachCropAsOptionImage = async (optionId: string) => {
    if (!cropRect) return;
    if (!imageUrls[activeIndex]) return;
    const imgEl = imgRef.current;
    if (!imgEl) return;

    try {
      setBusy(true);
      setProgress(null);

      const blob = await cropImageDataUrl(imageUrls[activeIndex], cropRect, imgEl);
      const dataUrl = await blobToDataUrl(blob);
      // Keep images sharp: only downscale if truly huge.
      const resized = await resizeImageDataUrl(dataUrl, 1600, 1200);

      setDraftOptions((prev) => {
        const next = prev.map((o) =>
          o.id === optionId
            ? {
                ...o,
                attachedImages: [...(o.attachedImages ?? []), resized],
              }
            : o
        );
        syncDraftUiAtIndex(draftIndex, { options: next });
        return next;
      });

      setCropMode(false);
      setCropRect(null);
      setCropAssignTarget(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ? String(e.message) : 'Failed to attach option image');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const runCropOcrAndAssign = async (target: 'question' | { optionId: string }) => {
    if (!cropRect) return;
    if (!imageUrls[activeIndex]) return;
    const imgEl = imgRef.current;
    if (!imgEl) return;

    try {
      setBusy(true);
      setProgress(null);
      const blob = await cropImageDataUrl(imageUrls[activeIndex], cropRect, imgEl);
      const res = await recognizeImageText(blob, {
        lang: 'eng',
        onProgress: setProgress,
      });

      let html: string;
      if (inferFormatting) {
        const { data } = await blobToImageData(blob);
        html = richHtmlFromTesseractWithDecorations(res.raw, data, {
          inferUnderlineStrike: true,
          experimentalBoldItalic,
        });
      } else {
        const text = normalizeOcrTextToParagraphs(res.text);
        html = ocrTextToRichHtml(text);
      }

      if (target === 'question') {
        setDraftQuestion(html);
        syncDraftUiAtIndex(draftIndex, { question: html });
      } else {
        setDraftOptions((prev) => {
          const next = prev.map((o) => (o.id === target.optionId ? { ...o, text: html } : o));
          syncDraftUiAtIndex(draftIndex, { options: next });
          return next;
        });
      }

      setCropMode(false);
      setCropRect(null);
      setCropAssignTarget(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ? String(e.message) : 'Region OCR failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Only shortcuts when crop is active and there's a selection.
      if (!cropRect) return;
      if (!cropMode) return;
      if (!e.ctrlKey) return;

      if (e.key === '1') {
        e.preventDefault();
        void runCropOcrAndAssign('question');
      }
      if (e.key === '2') {
        e.preventDefault();
        if (draftOptions[0]) void runCropOcrAndAssign({ optionId: draftOptions[0].id });
      }
      if (e.key === '3') {
        e.preventDefault();
        if (draftOptions[1]) void runCropOcrAndAssign({ optionId: draftOptions[1].id });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cropRect, cropMode, draftOptions]);

  const onImageMouseDown = (e: React.MouseEvent) => {
    if (!cropMode) return;
    const imgEl = imgRef.current;
    if (!imgEl) return;
    const rect = imgEl.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    dragRef.current = { startX, startY, dragging: true };
    setCropRect({ x: startX, y: startY, w: 1, h: 1 });
  };

  const onImageMouseMove = (e: React.MouseEvent) => {
    if (!cropMode) return;
    if (!dragRef.current?.dragging) return;
    const imgEl = imgRef.current;
    if (!imgEl) return;
    const rect = imgEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const startX = dragRef.current.startX;
    const startY = dragRef.current.startY;
    setCropRect({ x: startX, y: startY, w: x - startX, h: y - startY });
  };

  const onImageMouseUp = () => {
    if (!cropMode) return;
    if (dragRef.current) dragRef.current.dragging = false;
    setCropAssignTarget('question');
  };

  const isMcqDraft = draftOptions.length >= 2;

  const selectedOcrHtml = useMemo(() => {
    const t = normalizeOcrTextToParagraphs(selectedOcrText || '').trim();
    if (!t) return '';
    return ocrTextToRichHtml(t);
  }, [selectedOcrText]);

  const assignSelectedOcrToQuestion = () => {
    if (!selectedOcrHtml) return;
    setDraftQuestion(selectedOcrHtml);
    syncDraftUiAtIndex(draftIndex, { question: selectedOcrHtml });
  };

  const appendSelectedOcrToQuestion = () => {
    if (!selectedOcrHtml) return;
    setDraftQuestion((prev) => {
      const base = String(prev || '').trim();
      const next = base ? `${base}<p></p>${selectedOcrHtml}` : selectedOcrHtml;
      syncDraftUiAtIndex(draftIndex, { question: next });
      return next;
    });
  };

  const assignSelectedOcrToOption = (optionId: string) => {
    if (!selectedOcrHtml) return;
    setDraftOptions((prev) => {
      const next = prev.map((o) => (o.id === optionId ? { ...o, text: selectedOcrHtml } : o));
      syncDraftUiAtIndex(draftIndex, { options: next });
      return next;
    });
  };

  const appendSelectedOcrToOption = (optionId: string) => {
    if (!selectedOcrHtml) return;
    setDraftOptions((prev) => {
      const next = prev.map((o) => {
        if (o.id !== optionId) return o;
        const base = String(o.text || '').trim();
        return { ...o, text: base ? `${base}<p></p>${selectedOcrHtml}` : selectedOcrHtml };
      });
      syncDraftUiAtIndex(draftIndex, { options: next });
      return next;
    });
  };

  const pasteToInputs = ({ close }: { close: boolean }) => {
    if (!isMcqDraft) {
      toast.error('No MCQ options detected. Screenshot → Question only works for MCQ.');
      return;
    }

    const baseQHtml = draftQuestion.trim();
    const imgHtml = attachedQuestionImages.length
      ? `<div>${attachedQuestionImages
          .map((src) => `<img src="${src}" alt="attached" style="max-width:100%;height:auto;display:block;margin:0.5rem 0;" />`)
          .join('')}</div>`
      : '';
    const qHtml = `${baseQHtml}${imgHtml}`;

    const optionImageDataUrls: Record<string, string[]> = {};
    const optPayload = draftOptions.map((o) => {
      optionImageDataUrls[o.id] = o.attachedImages?.length ? [...o.attachedImages] : [];
      const base = o.text.trim();
      const imgs = (o.attachedImages ?? []).length
        ? `<div>${(o.attachedImages ?? [])
            .map((src) => `<img src="${src}" alt="option" style="max-width:100%;height:auto;display:block;margin:0.5rem 0;" />`)
            .join('')}</div>`
        : '';
      return { id: o.id, html: `${base}${imgs}` };
    });
    const correctIds = isMcqDraft && correctOptionId ? [correctOptionId] : [];

    onApply({
      questionHtml: qHtml,
      optionsHtml: optPayload,
      correctOptionIds: correctIds,
      questionImageDataUrls: attachedQuestionImages,
      optionImageDataUrls,
    });

    toast.success('Applied OCR draft');

    if (close) {
      // no-op for inline tool
    }
  };

  const pasteAndNext = () => {
    pasteToInputs({ close: false });
    if (drafts.length > 1) {
      setDraftIndex((v) => Math.min(drafts.length - 1, v + 1));
    }
  };

  const disablePaste =
    !isMcqDraft ||
    !stripHtmlToText(draftQuestion).trim() ||
    draftOptions.some((o) => !stripHtmlToText(o.text).trim() && !(o.attachedImages ?? []).length);

  if (!files.length) return null;

  return (
    <div className="rounded-lg bg-background/50 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Screenshot → Question</div>
          <div className="text-xs text-muted-foreground">
            Select regions and assign to question/options, then click Apply.
          </div>
        </div>
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{progress?.status || 'Working…'}{typeof progress?.progress === 'number' ? ` ${Math.round(progress.progress * 100)}%` : ''}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div
          className={
            showScreenshotPanel
              ? 'rounded-lg bg-muted/10 overflow-hidden flex flex-col flex-shrink-0'
              : 'rounded-lg bg-muted/10 overflow-hidden flex flex-col flex-shrink-0'
          }
        >
            <div className="p-3 flex items-center gap-2">
              <div className="font-medium text-sm">Screenshot</div>
              <div className="ml-auto flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setShowScreenshotPanel((v) => !v)}>
                  {showScreenshotPanel ? 'Collapse' : 'Expand'}
                </Button>
                {drafts.length > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDraftIndex((v) => Math.max(0, v - 1))}
                      disabled={busy || draftIndex <= 0}
                    >
                      Prev
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      Draft {draftIndex + 1} / {drafts.length}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDraftIndex((v) => Math.min(drafts.length - 1, v + 1))}
                      disabled={busy || draftIndex >= drafts.length - 1}
                    >
                      Next
                    </Button>
                  </div>
                )}
                <Button
                  type="button"
                  variant={cropMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setCropMode((v) => !v);
                    setCropRect(null);
                    setCropAssignTarget(null);
                  }}
                >
                  <Crop className="h-4 w-4 mr-2" />
                  Select region
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={runOcrForActiveImage} disabled={busy}>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Re-run OCR
                </Button>
              </div>
            </div>

            {showScreenshotPanel ? (
              <div className="p-3">
                <Tabs value={tab} onValueChange={setTab} className="h-full flex flex-col">
                  <TabsList className="w-full justify-start overflow-x-auto flex-shrink-0">
                    {files.map((_, i) => (
                      <TabsTrigger key={i} value={String(i)}>
                        {i + 1}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <div className="mt-3">
                    {files.map((_, i) => (
                      <TabsContent key={i} value={String(i)} className="mt-0">
                        <div
                          className="relative rounded-md bg-background/60"
                          onMouseDown={onImageMouseDown}
                          onMouseMove={onImageMouseMove}
                          onMouseUp={onImageMouseUp}
                        >
                          <img
                            ref={i === activeIndex ? imgRef : undefined}
                            src={imageUrls[i]}
                            alt={`screenshot-${i + 1}`}
                            className="w-full object-contain select-none"
                            draggable={false}
                          />
                        {cropMode && cropRect && i === activeIndex && (
                          <div
                            className="absolute border-2 border-primary bg-primary/10"
                            style={{
                              left: `${normalizeCropRect(cropRect).x}px`,
                              top: `${normalizeCropRect(cropRect).y}px`,
                              width: `${normalizeCropRect(cropRect).w}px`,
                              height: `${normalizeCropRect(cropRect).h}px`,
                            }}
                          />
                        )}
                        </div>
                        {cropMode && cropRect && i === activeIndex && (
                          <div className="mt-3 rounded-md bg-muted/10 p-3 space-y-2">
                            <div className="text-xs text-muted-foreground">
                              Region selected. Assign via buttons or shortcuts:
                              <div className="mt-1">
                                <span className="font-mono">Ctrl+1</span> Question
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={inferFormatting}
                                  onChange={(e) => setInferFormatting(e.target.checked)}
                                />
                                Infer underline/strike (region OCR)
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={experimentalBoldItalic}
                                  onChange={(e) => setExperimentalBoldItalic(e.target.checked)}
                                  disabled={!inferFormatting}
                                />
                                Experimental: infer bold/italic
                              </label>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" size="sm" onClick={() => void runCropOcrAndAssign('question')} disabled={busy}>
                                Assign to question
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => void runCropOcrAndAppend('question')} disabled={busy}>
                                Append to question
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => void attachCropAsQuestionImage()} disabled={busy}>
                                Attach crop as image
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => void insertCropIntoQuestionText()} disabled={busy}>
                                Insert into question
                              </Button>
                            </div>

							<div className="flex flex-wrap gap-2">
								{draftOptions.map((o) => (
									<Button
										key={`assign-${o.id}`}
										type="button"
										size="sm"
										variant="outline"
										onClick={() => void runCropOcrAndAssign({ optionId: o.id })}
										disabled={busy}
									>
										Assign to {o.label}
									</Button>
								))}
							</div>
							<div className="flex flex-wrap gap-2">
								{draftOptions.map((o) => (
									<Button
										key={`append-${o.id}`}
										type="button"
										size="sm"
										variant="outline"
										onClick={() => void runCropOcrAndAppend({ optionId: o.id })}
										disabled={busy}
									>
										Append to {o.label}
									</Button>
								))}
							</div>
                          </div>
                        )}
                      </TabsContent>
                    ))}
                  </div>
                </Tabs>
              </div>
            ) : null}
          </div>

			<div className="rounded-lg bg-muted/10 p-3">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<div className="text-sm font-medium">Raw OCR text</div>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => setSelectedOcrText('')}
								disabled={!selectedOcrText}
							>
								Clear selection
							</Button>
						</div>
						<div
							className="rounded-md bg-background/60 border p-3 text-sm whitespace-pre-wrap select-text"
							onMouseUp={() => {
								const t = window.getSelection?.()?.toString() ?? '';
								setSelectedOcrText(t);
							}}
						>
							{rawLines && rawLines.length ? rawLines.join('\n') : 'No OCR text available.'}
						</div>
						{selectedOcrText ? (
							<div className="text-xs text-muted-foreground">
								Selected: <span className="font-mono">{selectedOcrText.length}</span> chars
							</div>
						) : (
							<div className="text-xs text-muted-foreground">Highlight any text above to enable Insert/Append.</div>
						)}
					</div>

					<div className="space-y-4">
						<div className="space-y-2">
							<div className="flex items-center justify-between gap-2">
								<Label className="text-sm">Question</Label>
								<div className="flex items-center gap-2">
									<Button type="button" size="sm" variant="outline" onClick={assignSelectedOcrToQuestion} disabled={!selectedOcrHtml}>
										Insert
									</Button>
									<Button type="button" size="sm" variant="outline" onClick={appendSelectedOcrToQuestion} disabled={!selectedOcrHtml}>
										Append
									</Button>
								</div>
							</div>
							<textarea
								className="w-full min-h-[120px] rounded-md border bg-background/60 p-3 text-sm"
								value={draftQuestion}
								onChange={(e) => {
									const next = e.target.value;
									setDraftQuestion(next);
									syncDraftUiAtIndex(draftIndex, { question: next });
								}}
							/>
						</div>

						<div className="space-y-2">
							<Label className="text-sm">Options</Label>
							<div className="space-y-3">
								{draftOptions.map((o) => (
									<div key={o.id} className="rounded-md border bg-background/40 p-3 space-y-2">
										<div className="flex items-center justify-between gap-2">
											<div className="text-sm font-medium">{o.label}</div>
											<div className="flex items-center gap-2">
												<Button type="button" size="sm" variant="outline" onClick={() => assignSelectedOcrToOption(o.id)} disabled={!selectedOcrHtml}>
													Insert
												</Button>
												<Button type="button" size="sm" variant="outline" onClick={() => appendSelectedOcrToOption(o.id)} disabled={!selectedOcrHtml}>
													Append
												</Button>
											</div>
									</div>
									<textarea
										className="w-full min-h-[70px] rounded-md border bg-background/60 p-2 text-sm"
										value={o.text}
										onChange={(e) => {
											const nextText = e.target.value;
											setDraftOptions((prev) => {
												const next = prev.map((x) => (x.id === o.id ? { ...x, text: nextText } : x));
												syncDraftUiAtIndex(draftIndex, { options: next });
												return next;
											});
										}}
									/>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
        
        <div className="flex-shrink-0 flex items-center justify-end gap-2 pt-2">
          {drafts.length > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={pasteAndNext}
              disabled={disablePaste || draftIndex >= drafts.length - 1}
            >
              Apply & Next
            </Button>
          )}
          <Button type="button" onClick={() => pasteToInputs({ close: true })} disabled={disablePaste}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
