import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Crop, Loader2, Wand2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

import { recognizeImageText } from '@/lib/offlineOcr';
import { parseScreenshotOcrToDrafts, type ScreenshotQuestionDraft } from '@/lib/screenshotQuestionParser';
import { plainTextToSimpleHtml } from '@/lib/htmlDraft';
import { normalizeOcrTextToParagraphs } from '@/lib/ocrTextNormalize';

type DraftOption = {
  id: string;
  label: string;
  text: string;
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
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: File[];
  onPaste: (payload: ScreenshotToQuestionPastePayload) => void;
};

type CropRect = { x: number; y: number; w: number; h: number };

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
    { id: uuidv4(), label: 'A', text: 'Option A' },
    { id: uuidv4(), label: 'B', text: 'Option B' },
    { id: uuidv4(), label: 'C', text: 'Option C' },
    { id: uuidv4(), label: 'D', text: 'Option D' },
  ];
}

function isDefaultOptionText(text: string, label: string) {
  return String(text || '').trim().toLowerCase() === `option ${String(label || '').trim().toLowerCase()}`;
}

function buildOptionsFromParsed(parsed: ScreenshotQuestionDraft): DraftOption[] {
  const defaults = buildDefaultOptions();
  if (!parsed.options || parsed.options.length < 2) return defaults;

  const fromParsed: DraftOption[] = parsed.options.map((o) => ({
    id: uuidv4(),
    label: o.label,
    text: o.text,
  }));

  const parsedLabels = new Set(fromParsed.map((o) => o.label));
  const remainingDefaults = defaults.filter((d) => !parsedLabels.has(d.label));
  return [...fromParsed, ...remainingDefaults];
}

export default function ScreenshotToQuestionModal({ open, onOpenChange, files, onPaste }: Props) {
  const [tab, setTab] = useState('0');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ status?: string; progress?: number } | null>(null);

  const [drafts, setDrafts] = useState<ScreenshotQuestionDraft[]>([]);
  const [draftIndex, setDraftIndex] = useState(0);

  const [draftUi, setDraftUi] = useState<DraftUiState[]>([]);

  const [draftQuestion, setDraftQuestion] = useState('');
  const [draftOptions, setDraftOptions] = useState<DraftOption[]>([]);
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [detectedMcq, setDetectedMcq] = useState(false);

  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [attachedQuestionImages, setAttachedQuestionImages] = useState<string[]>([]);

  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [cropAssignTarget, setCropAssignTarget] = useState<'question' | { optionId: string } | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);

  const activeIndex = useMemo(() => {
    const n = Number(tab);
    return Number.isFinite(n) ? clamp(n, 0, Math.max(0, files.length - 1)) : 0;
  }, [tab, files.length]);

  useEffect(() => {
    if (!open) return;
    setTab('0');
    setCropMode(false);
    setCropRect(null);
    setCropAssignTarget(null);
    setProgress(null);
    setCorrectOptionId(null);
    setAttachedQuestionImages([]);
    setDetectedMcq(false);
    setDrafts([]);
    setDraftIndex(0);
    setDraftUi([]);

    (async () => {
      try {
        const urls = await Promise.all(files.map((f) => fileToDataUrl(f)));
        setImageUrls(urls);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load screenshots');
      }
    })();
  }, [open, files]);

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
      question: parsed.questionText,
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
    if (state) {
      setDraftQuestion(state.question);
      setDraftOptions(state.options);
      setCorrectOptionId(state.correctOptionId);
      setRawLines(state.rawLines);
      setDetectedMcq(state.detectedMcq);
      setAttachedQuestionImages(state.attachedImages);
    } else {
      applyParsedDraft(next);
    }
  }, [draftIndex, drafts]);

  useEffect(() => {
    if (!open) return;
    if (!files.length) {
      setDraftQuestion('');
      setDraftOptions([]);
      setRawLines([]);
      return;
    }

    // Auto-run OCR on open (first screenshot) for speed.
    void (async () => {
      try {
        setBusy(true);
        setProgress(null);
        const res = await recognizeImageText(files[0], {
          lang: 'eng',
          onProgress: setProgress,
        });
        const nextDrafts = parseScreenshotOcrToDrafts(res.text);
        setDrafts(nextDrafts);
        setDraftIndex(0);
        const nextUi: DraftUiState[] = nextDrafts.map((d) => ({
          question: d.questionText,
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
  }, [open]);

  const runOcrForActiveImage = async () => {
    if (!imageUrls[activeIndex]) return;

    try {
      setBusy(true);
      setProgress(null);
      const res = await recognizeImageText(imageUrls[activeIndex], {
        lang: 'eng',
        onProgress: setProgress,
      });

      const nextDrafts = parseScreenshotOcrToDrafts(res.text);
      setDrafts(nextDrafts);
      setDraftIndex(0);
      const nextUi: DraftUiState[] = nextDrafts.map((d) => ({
        question: d.questionText,
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
      const text = normalizeOcrTextToParagraphs(res.text);

      if (target === 'question') {
        setDraftQuestion(text);
        syncDraftUiAtIndex(draftIndex, { question: text });
      } else {
        setDraftOptions((prev) => {
          const next = prev.map((o) => (o.id === target.optionId ? { ...o, text } : o));
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
    if (!open) return;

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
  }, [open, cropRect, cropMode, draftOptions]);

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

  const pasteToInputs = ({ close }: { close: boolean }) => {
    const baseQHtml = plainTextToSimpleHtml(draftQuestion.trim());
    const imgHtml = attachedQuestionImages.length
      ? `<div>${attachedQuestionImages
          .map((src) => `<img src="${src}" alt="attached" style="max-width:100%;height:auto;display:block;margin:0.5rem 0;" />`)
          .join('')}</div>`
      : '';
    const qHtml = `${baseQHtml}${imgHtml}`;
    const optPayload = draftOptions.map((o) => ({ id: o.id, html: plainTextToSimpleHtml(o.text.trim()) }));
    const correctIds = correctOptionId ? [correctOptionId] : [];

    onPaste({
      questionHtml: qHtml,
      optionsHtml: optPayload,
      correctOptionIds: correctIds,
      questionImageDataUrls: attachedQuestionImages,
    });

    if (close) onOpenChange(false);
  };

  const pasteAndNext = () => {
    pasteToInputs({ close: false });
    if (drafts.length > 1) {
      setDraftIndex((v) => Math.min(drafts.length - 1, v + 1));
    }
  };

  const splitAssistFromLines = () => {
    // User-assisted: pick a line to start options.
    const idx = rawLines.findIndex((l) => l.toLowerCase().includes('a') && /[\).:\-]/.test(l));
    if (idx < 0) return;
    const q = rawLines.slice(0, idx).join('\n');
    const rest = rawLines.slice(idx);
    setDraftQuestion(q);
    syncDraftUiAtIndex(draftIndex, { question: q });
    const nextOptions = rest.slice(0, 4).map((t, i) => ({
      id: uuidv4(),
      label: String.fromCharCode(65 + i),
      text: t,
    }));
    setDraftOptions(nextOptions);
    syncDraftUiAtIndex(draftIndex, { options: nextOptions });
    setCorrectOptionId(null);
    syncDraftUiAtIndex(draftIndex, { correctOptionId: null });
    setAttachedQuestionImages([]);
    syncDraftUiAtIndex(draftIndex, { attachedImages: [] });
  };

  const disablePaste =
    !detectedMcq ||
    !draftQuestion.trim() ||
    draftOptions.length < 2 ||
    draftOptions.some((o) => !o.text.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-6xl h-[90vh] overflow-hidden flex flex-col" aria-describedby={undefined}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Screenshot → Question</DialogTitle>
          <DialogDescription>
            OCR runs on-device. Review and fix text, then paste into the form.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="min-h-0 rounded-lg border bg-background/50 overflow-hidden flex flex-col">
            <div className="p-3 border-b flex items-center gap-2">
              <div className="font-medium text-sm">Screenshot</div>
              <div className="ml-auto flex items-center gap-2">
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

            <div className="p-3 flex-1 min-h-0">
              <Tabs value={tab} onValueChange={setTab} className="h-full flex flex-col">
                <TabsList className="w-full justify-start overflow-x-auto flex-shrink-0">
                  {files.map((_, i) => (
                    <TabsTrigger key={i} value={String(i)}>
                      {i + 1}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <ScrollArea className="flex-1 min-h-0 mt-3">
                  {files.map((_, i) => (
                    <TabsContent key={i} value={String(i)} className="mt-0">
                      <div
                        className="relative rounded-md border bg-muted/10"
                        onMouseDown={onImageMouseDown}
                        onMouseMove={onImageMouseMove}
                        onMouseUp={onImageMouseUp}
                      >
                        <img
                          ref={i === activeIndex ? imgRef : undefined}
                          src={imageUrls[i]}
                          alt={`screenshot-${i + 1}`}
                          className="w-full max-h-[70vh] object-contain select-none"
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
                        <div className="mt-3 rounded-md border bg-muted/10 p-3 space-y-2">
                          <div className="text-xs text-muted-foreground">
                            Region selected. Assign via buttons or shortcuts:
                            <div className="mt-1">
                              <span className="font-mono">Ctrl+1</span> Question, <span className="font-mono">Ctrl+2</span> Option 1, <span className="font-mono">Ctrl+3</span> Option 2
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" onClick={() => void runCropOcrAndAssign('question')} disabled={busy}>
                              Assign to question
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => void attachCropAsQuestionImage()} disabled={busy}>
                              Attach crop as image
                            </Button>
                            {draftOptions.slice(0, 4).map((o, idx) => (
                              <Button
                                key={o.id}
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void runCropOcrAndAssign({ optionId: o.id })}
                                disabled={busy}
                              >
                                Assign to option {idx + 1}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  ))}
                </ScrollArea>
              </Tabs>
            </div>
          </div>

          <div className="min-h-0 rounded-lg border bg-background/50 overflow-hidden flex flex-col">
            <div className="p-3 border-b flex items-center gap-2">
              <div className="font-medium text-sm">Extracted draft</div>
              <div className="ml-auto flex items-center gap-2">
                {busy && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{progress?.status || 'Working…'}{typeof progress?.progress === 'number' ? ` ${Math.round(progress.progress * 100)}%` : ''}</span>
                  </div>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-semibold">Question</Label>
                    <Button type="button" variant="outline" size="sm" onClick={splitAssistFromLines}>
                      Use OCR lines
                    </Button>
                  </div>
                  <textarea
                    value={draftQuestion}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraftQuestion(v);
                      syncDraftUiAtIndex(draftIndex, { question: v });
                    }}
                    className="w-full min-h-[140px] rounded-md border bg-background p-3 text-sm resize-vertical"
                    placeholder="Question text"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-semibold">Attached images</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAttachedQuestionImages([]);
                        syncDraftUiAtIndex(draftIndex, { attachedImages: [] });
                      }}
                      disabled={attachedQuestionImages.length === 0}
                    >
                      Clear
                    </Button>
                  </div>
                  {attachedQuestionImages.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      Use “Select region” → “Attach crop as image” to capture tables/diagrams.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {attachedQuestionImages.map((src, idx) => (
                        <div key={`${src}-${idx}`} className="rounded-md border bg-background/70 p-2 space-y-2">
                          <img src={src} alt={`attached-${idx + 1}`} className="w-full max-h-56 object-contain rounded" />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setAttachedQuestionImages((prev) => {
                                const next = prev.filter((_, i) => i !== idx);
                                syncDraftUiAtIndex(draftIndex, { attachedImages: next });
                                return next;
                              })
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Options</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDraftOptions((prev) => [...prev, { id: uuidv4(), label: String(prev.length + 1), text: '' }])}
                    >
                      Add option
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {draftOptions.map((opt, idx) => (
                      <div key={opt.id} className="rounded-md border p-3 bg-background/70">
                        <div className="flex items-center gap-3">
                          <div className="text-xs font-semibold text-muted-foreground w-10">{opt.label || idx + 1}</div>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input
                              type="radio"
                              name="correct_option"
                              checked={correctOptionId === opt.id}
                              onChange={() => {
                                setCorrectOptionId(opt.id);
                                syncDraftUiAtIndex(draftIndex, { correctOptionId: opt.id });
                              }}
                            />
                            Correct
                          </label>
                          <div className="ml-auto">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setDraftOptions((prev) => prev.filter((o) => o.id !== opt.id));
                                setCorrectOptionId((prev) => (prev === opt.id ? null : prev));
                              }}
                              disabled={draftOptions.length <= 2}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2">
                          <Textarea
                            value={opt.text}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDraftOptions((prev) => {
                                const next = prev.map((o) => (o.id === opt.id ? { ...o, text: v } : o));
                                syncDraftUiAtIndex(draftIndex, { options: next });
                                return next;
                              });
                            }}
                            placeholder={`Option ${idx + 1}`}
                            rows={3}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Tip: If OCR split is wrong, use “Select region” on the left and assign the crop to question/option.
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">OCR lines (for manual reassignment)</Label>
                  <div className="rounded-md border bg-muted/10 p-2 text-xs text-muted-foreground whitespace-pre-wrap">
                    {rawLines.length ? rawLines.map((l, i) => `${i + 1}. ${l}`).join('\n') : '—'}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {drafts.length > 1 && (
            <Button type="button" variant="outline" onClick={pasteAndNext} disabled={disablePaste || draftIndex >= drafts.length - 1}>
              Paste & Next
            </Button>
          )}
          <Button type="button" onClick={() => pasteToInputs({ close: true })} disabled={disablePaste}>
            Paste to inputs
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
