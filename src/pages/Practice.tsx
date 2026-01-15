import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Katex } from '@/components/Katex';
import { PolynomialLongDivision } from '@/components/PolynomialLongDivision';
import { ArrowLeft, Bug, CircleHelp } from 'lucide-react';
import TypingAnswerMathInput from '@/components/TypingAnswerMathInput';
import InteractiveGraph from '@/components/InteractiveGraph';
import { PRACTICE_TOPICS, PracticeTopicId } from '@/lib/practiceTopics';
import { Fraction, fractionsEqual, parseFraction } from '@/lib/fraction';
import { db } from '@/lib/db';
import { generateQuadraticByFactorisation, PracticeDifficulty, QuadraticFactorizationQuestion } from '@/lib/practiceGenerators/quadraticFactorization';
import { generatePracticeQuestion, PracticeQuestion, GraphPracticeQuestion } from '@/lib/practiceEngine';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function Practice() {
  const { user } = useAuth();
  const settings = useLiveQuery(() => db.settings.get('1'));

  const [mode, setMode] = useState<'individual' | 'mixed'>('individual');
  const [step, setStep] = useState<'chooser' | 'session'>('chooser');
  const [topicId, setTopicId] = useState<PracticeTopicId | null>(null);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>('easy');

  const [sessionSeed, setSessionSeed] = useState(() => {
    try {
      const buf = new Uint32Array(1);
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(buf);
        return (Date.now() ^ buf[0]) >>> 0;
      }
    } catch {
      // ignore
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  });
  const [question, setQuestion] = useState<QuadraticFactorizationQuestion | PracticeQuestion | null>(null);
  const [mixedModuleId, setMixedModuleId] = useState<string | null>(null);
  const [mixedCursor, setMixedCursor] = useState(0);
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [answer3, setAnswer3] = useState('');
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const [lastVariantByTopic, setLastVariantByTopic] = useState<Record<string, string | undefined>>({});
  const [recentQuestionIds, setRecentQuestionIds] = useState<string[]>([]);
  const [recentWordProblemCategories, setRecentWordProblemCategories] = useState<string[]>([]);

  const practiceHistoryLoadedRef = useRef(false);
  const practiceHistoryPersistTimerRef = useRef<number | null>(null);

  const practiceContentRef = useRef<HTMLDivElement | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportHelpOpen, setReportHelpOpen] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reportScreenshotDataUrl, setReportScreenshotDataUrl] = useState<string | undefined>(undefined);
  const [isCapturingReportScreenshot, setIsCapturingReportScreenshot] = useState(false);
  const [reportScreenshotError, setReportScreenshotError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportCaptureMode, setReportCaptureMode] = useState<'practice_full' | 'screen'>('practice_full');

  const findScrollableAncestor = (el: HTMLElement | null): HTMLElement | null => {
    let cur: HTMLElement | null = el;
    while (cur) {
      const style = window.getComputedStyle(cur);
      const overflowY = style.overflowY;
      const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight + 2;
      if (isScrollable) return cur;
      cur = cur.parentElement;
    }
    return null;
  };

  const captureAppVisualStateScreenshotDataUrl = async (scrollContainer?: HTMLElement | null): Promise<string> => {
    if (typeof window !== 'undefined' && (window as any).examProctor?.captureViewportScreenshot) {
      const res = await (window as any).examProctor.captureViewportScreenshot();
      if (res && typeof res.dataUrl === 'string' && res.dataUrl.startsWith('data:image/')) {
        return res.dataUrl;
      }
      throw new Error('Viewport screenshot failed');
    }

    const root = document.documentElement;
    const docWidth = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0, root.clientWidth);
    const docHeight = Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0, root.clientHeight);
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;
    const clone = root.cloneNode(true) as HTMLElement;
    const originalScrollContainer = scrollContainer ?? null;
    let cloneScrollContainer: HTMLElement | null = null;

    const originalWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    const cloneWalker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
    let originalNode = originalWalker.nextNode() as Element | null;
    let cloneNode = cloneWalker.nextNode() as Element | null;

    while (originalNode && cloneNode) {
      const style = window.getComputedStyle(originalNode);
      let cssText = '';
      for (let i = 0; i < style.length; i++) {
        const prop = style[i];
        cssText += `${prop}:${style.getPropertyValue(prop)};`;
      }
      (cloneNode as HTMLElement).setAttribute('style', cssText);
      if (originalNode instanceof HTMLElement && cloneNode instanceof HTMLElement) {
        cloneNode.scrollTop = originalNode.scrollTop;
        cloneNode.scrollLeft = originalNode.scrollLeft;
        if (originalScrollContainer && originalNode === originalScrollContainer) {
          cloneScrollContainer = cloneNode;
        }
      }

      originalNode = originalWalker.nextNode() as Element | null;
      cloneNode = cloneWalker.nextNode() as Element | null;
    }

    if (originalScrollContainer && cloneScrollContainer) {
      const y = originalScrollContainer.scrollTop;
      const x = originalScrollContainer.scrollLeft;
      const wrapper = document.createElement('div');
      wrapper.setAttribute('style', `width:100%;height:100%;transform:translate(${-x}px,${-y}px);will-change:transform;`);
      while (cloneScrollContainer.firstChild) {
        wrapper.appendChild(cloneScrollContainer.firstChild);
      }
      cloneScrollContainer.appendChild(wrapper);
    }

    await (document as any).fonts?.ready;

    const serialized = new XMLSerializer().serializeToString(clone);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${viewportWidth}" height="${viewportHeight}">\n  <foreignObject x="0" y="0" width="100%" height="100%">\n    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${docWidth}px;height:${docHeight}px;transform:translate(${-scrollX}px,${-scrollY}px);">${serialized}</div>\n  </foreignObject>\n</svg>`;

    const img = new Image();
    img.decoding = 'async';
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewportWidth * dpr);
    canvas.height = Math.round(viewportHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.scale(dpr, dpr);
    const bg = window.getComputedStyle(document.body).backgroundColor || window.getComputedStyle(root).backgroundColor || '#ffffff';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    ctx.drawImage(img, 0, 0, viewportWidth, viewportHeight);
    return canvas.toDataURL('image/png');
  };

  const cropDataUrl = async (dataUrl: string, crop: { x: number; y: number; w: number; h: number }): Promise<string> => {
    const img = new Image();
    img.decoding = 'async';
    img.src = dataUrl;
    await img.decode();

    const x = Math.max(0, Math.min(img.naturalWidth - 1, Math.round(crop.x)));
    const y = Math.max(0, Math.min(img.naturalHeight - 1, Math.round(crop.y)));
    const w = Math.max(1, Math.min(img.naturalWidth - x, Math.round(crop.w)));
    const h = Math.max(1, Math.min(img.naturalHeight - y, Math.round(crop.h)));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  };

  const capturePracticeContentScreenshotDataUrl = async (): Promise<string> => {
    const el = practiceContentRef.current;
    if (!el) return captureAppVisualStateScreenshotDataUrl();

    const rect = el.getBoundingClientRect();
    const pad = 16;
    const viewportW = Math.max(1, window.innerWidth);
    const viewportH = Math.max(1, window.innerHeight);

    const x = Math.max(0, rect.left - pad);
    const y = Math.max(0, rect.top - pad);
    const w = Math.min(viewportW - x, rect.width + pad * 2);
    const h = Math.min(viewportH - y, rect.height + pad * 2);

    const dataUrl = await captureAppVisualStateScreenshotDataUrl();
    const img = new Image();
    img.decoding = 'async';
    img.src = dataUrl;
    await img.decode();

    const scaleX = img.naturalWidth / viewportW;
    const scaleY = img.naturalHeight / viewportH;
    return cropDataUrl(dataUrl, { x: x * scaleX, y: y * scaleY, w: w * scaleX, h: h * scaleY });
  };

  const capturePracticeContentFullScreenshotDataUrl = async (): Promise<string> => {
    const el = practiceContentRef.current;
    if (!el) return capturePracticeContentScreenshotDataUrl();

    const container = findScrollableAncestor(el);
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);

    const pad = 16;
    const rect = el.getBoundingClientRect();

    const containerRect = container ? container.getBoundingClientRect() : null;
    const topStripHeight = containerRect ? Math.max(0, Math.min(viewportHeight, Math.floor(containerRect.top))) : 0;

    const xCss = (() => {
      if (containerRect) return Math.max(0, (rect.left - containerRect.left) + (container?.scrollLeft ?? 0) - pad);
      return Math.max(0, (rect.left + (window.scrollX || 0)) - pad);
    })();
    const yCss = (() => {
      if (containerRect) return Math.max(0, (rect.top - containerRect.top) + (container?.scrollTop ?? 0) - pad);
      return Math.max(0, (rect.top + (window.scrollY || 0)) - pad);
    })();

    const wCss = Math.max(1, rect.width + pad * 2);
    const hCss = Math.max(1, rect.height + pad * 2);

    const stitchedDataUrl = await captureFullContentScreenshotDataUrl(container);
    const stitchedImg = new Image();
    stitchedImg.decoding = 'async';
    stitchedImg.src = stitchedDataUrl;
    await stitchedImg.decode();

    const scale = containerRect
      ? (stitchedImg.naturalWidth / Math.max(1, containerRect.width))
      : (stitchedImg.naturalWidth / viewportWidth);

    const cropX = xCss * scale;
    const cropY = (topStripHeight + yCss) * scale;
    const cropW = wCss * scale;
    const cropH = hCss * scale;

    return cropDataUrl(stitchedDataUrl, { x: cropX, y: cropY, w: cropW, h: cropH });
  };

  const captureFullContentScreenshotDataUrl = async (scrollContainer?: HTMLElement | null): Promise<string> => {
    const container = scrollContainer ?? null;
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);

    const hideFixedTopBars = () => {
      const hidden: Array<{ el: HTMLElement; visibility: string }> = [];
      const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));
      for (const el of all) {
        const style = window.getComputedStyle(el);
        if (style.position !== 'fixed' && style.position !== 'sticky') continue;
        const rect = el.getBoundingClientRect();
        if (!(rect.height > 0 && rect.width > viewportWidth * 0.5)) continue;
        // Only hide elements that are anchored to the top of the viewport.
        if (rect.top > 1) continue;
        hidden.push({ el, visibility: el.style.visibility });
        el.style.visibility = 'hidden';
      }
      return () => {
        for (const h of hidden) {
          h.el.style.visibility = h.visibility;
        }
      };
    };

    const restoreFixed = hideFixedTopBars();
    const containerRect = container ? container.getBoundingClientRect() : null;
    const topStripHeight = containerRect ? Math.max(0, Math.min(viewportHeight, Math.floor(containerRect.top))) : 0;
    const containerViewportHeight = containerRect ? Math.max(1, Math.floor(containerRect.height)) : viewportHeight;
    const totalHeight = container
      ? Math.max(container.scrollHeight, container.clientHeight)
      : Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
    // Add overlap between tiles to avoid gaps due to rounding/layout jitter.
    const overlapCss = 24;
    const strideCss = Math.max(1, containerViewportHeight - overlapCss);
    const steps = Math.max(1, Math.ceil(totalHeight / strideCss));

    const originalWindowX = window.scrollX;
    const originalWindowY = window.scrollY;
    const originalContainerScrollTop = container ? container.scrollTop : 0;

    const tiles: { y: number; dataUrl: string; width: number; height: number; cropTopCss: number }[] = [];
    let topStripTile: { dataUrl: string; width: number; height: number } | null = null;
    let scale = 1;
    try {
      for (let i = 0; i < steps; i++) {
        const yTarget = Math.min(i * strideCss, Math.max(0, totalHeight - containerViewportHeight));
        if (container) {
          container.scrollTop = yTarget;
        } else {
          window.scrollTo(originalWindowX, yTarget);
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const yActual = container ? container.scrollTop : (window.scrollY || 0);
        const dataUrl = await captureAppVisualStateScreenshotDataUrl(container);
        const img = new Image();
        img.decoding = 'async';
        img.src = dataUrl;
        await img.decode();
        if (i === 0) {
          scale = viewportWidth > 0 ? img.naturalWidth / viewportWidth : 1;
          if (!Number.isFinite(scale) || scale <= 0) scale = 1;
          if (topStripHeight > 0) {
            topStripTile = { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
          }
        }
        tiles.push({ y: yActual, dataUrl, width: img.naturalWidth, height: img.naturalHeight, cropTopCss: i === 0 ? 0 : overlapCss });
      }
    } finally {
      restoreFixed();
      if (container) {
        container.scrollTop = originalContainerScrollTop;
      } else {
        window.scrollTo(originalWindowX, originalWindowY);
      }
    }

    if (!tiles.length) throw new Error('No screenshot tiles captured');

    const canvas = document.createElement('canvas');
    if (containerRect) {
      canvas.width = Math.max(1, Math.round(containerRect.width * scale));
      canvas.height = Math.max(1, Math.round((totalHeight + topStripHeight) * scale));
    } else {
      canvas.width = tiles[0].width;
      canvas.height = Math.max(1, Math.round(totalHeight * scale));
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (topStripTile) {
      const stripImg = new Image();
      stripImg.decoding = 'async';
      stripImg.src = topStripTile.dataUrl;
      await stripImg.decode();
      const stripPxH = Math.max(1, Math.round(topStripHeight * scale));
      ctx.drawImage(stripImg, 0, 0, topStripTile.width, stripPxH, 0, 0, canvas.width, stripPxH);
    }

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const img = new Image();
      img.decoding = 'async';
      img.src = t.dataUrl;
      await img.decode();
      const cropTopPx = Math.max(0, Math.round(t.cropTopCss * scale));
      const srcY = cropTopPx;
      const srcH = Math.max(1, t.height - cropTopPx);
      const destY = Math.round((t.y + topStripHeight + t.cropTopCss) * scale);
      ctx.drawImage(img, 0, srcY, t.width, srcH, 0, destY, canvas.width, srcH);
    }

    return canvas.toDataURL('image/png');
  };

  const openReportDialogWithCapture = useCallback(async (mode?: 'practice_full' | 'screen') => {
    if (isCapturingReportScreenshot) return;
    setReportDialogOpen(false);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    setReportScreenshotDataUrl(undefined);
    setReportScreenshotError(null);
    setIsCapturingReportScreenshot(true);
    void (async () => {
      try {
        const m = mode ?? reportCaptureMode;
        const url = m === 'screen'
          ? await captureAppVisualStateScreenshotDataUrl()
          : await capturePracticeContentFullScreenshotDataUrl();
        setReportScreenshotDataUrl(url);
      } catch (e) {
        console.error('Failed to capture screenshot for report preview:', e);
        setReportScreenshotError('Screenshot capture failed');
      } finally {
        setIsCapturingReportScreenshot(false);
        setReportDialogOpen(true);
      }
    })();
  }, [isCapturingReportScreenshot, reportCaptureMode]);

  const submitErrorReport = useCallback(async () => {
    if (!reportMessage.trim()) {
      toast.error('Please describe the issue.');
      return;
    }
    try {
      setIsSubmittingReport(true);
      const now = Date.now();
      let screenshotDataUrl: string | undefined = reportScreenshotDataUrl;
      const scrollEl = findScrollableAncestor(practiceContentRef.current) ?? practiceContentRef.current;
      const effectiveScrollY = scrollEl ? scrollEl.scrollTop : window.scrollY;
      if (!screenshotDataUrl) {
        try {
          screenshotDataUrl = await capturePracticeContentFullScreenshotDataUrl();
        } catch (e) {
          console.error('Failed to capture screenshot for report:', e);
          setReportScreenshotError('Screenshot capture failed');
        }
      }
      await db.transaction('rw', db.errorReports, async () => {
        await db.errorReports.add({
          id: uuidv4(),
          status: 'new',
          message: reportMessage.trim(),
          screenshotDataUrl,
          createdAt: now,
          updatedAt: now,
          route: location.pathname,
          moduleId: undefined,
          moduleTitle: undefined,
          questionId: (question as any)?.id,
          questionCode: (question as any)?.code,
          questionTags: (question as any)?.tags,
          attemptId: undefined,
          currentQuestionIndex: undefined,
          scrollY: effectiveScrollY,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          phase: 'practice',
          appState: {
            practiceMode: mode,
            topicId,
            difficulty,
          },
          reporterUserId: user?.id,
          reporterUsername: user?.username,
        });
      });
      setReportDialogOpen(false);
      setReportMessage('');
      setReportScreenshotDataUrl(undefined);
      setReportScreenshotError(null);
      toast.success('Report sent');
    } catch (e) {
      console.error(e);
      toast.error('Failed to submit report');
    } finally {
      setIsSubmittingReport(false);
    }
  }, [difficulty, mode, question, reportMessage, reportScreenshotDataUrl, topicId, user?.id, user?.username]);

  const wpKatexOuterRef = useRef<HTMLDivElement | null>(null);
  const wpKatexInnerRef = useRef<HTMLDivElement | null>(null);
  const [wpKatexScale, setWpKatexScale] = useState(1);

  const escapeKatexText = (s: string) =>
    String(s ?? '')
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\$/g, '\\$')
      .replace(/%/g, '\\%')
      .replace(/&/g, '\\&')
      .replace(/#/g, '\\#')
      .replace(/_/g, '\\_')
      .replace(/\^/g, '\\^{}')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\r\n|\r|\n/g, ' \\ ');

  const preventScrollCapture = (e: React.WheelEvent | React.TouchEvent | React.KeyboardEvent) => {
    // Keep scrollbars visible (for overflow affordance) but prevent the user from scrolling the KaTeX container.
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement | null;
    if (!el) return;
    if (el.scrollLeft !== 0) el.scrollLeft = 0;
    if (el.scrollTop !== 0) el.scrollTop = 0;
  };

  const selectedTopic = useMemo(() => PRACTICE_TOPICS.find((t) => t.id === topicId) ?? null, [topicId]);

  const mixedModules = useMemo(() => settings?.mixedPracticeModules ?? [], [settings?.mixedPracticeModules]);
  const practiceTopicLocks = useMemo(() => settings?.practiceTopicLocks ?? {}, [settings?.practiceTopicLocks]);
  const selectedMixedModule = useMemo(
    () => (mixedModuleId ? mixedModules.find((m) => m.id === mixedModuleId) ?? null : null),
    [mixedModules, mixedModuleId]
  );

  const resetAttemptState = () => {
    setAnswer1('');
    setAnswer2('');
    setAnswer3('');
    setSelectedOptionIndex(null);
    setSubmitted(false);
    setIsCorrect(null);
  };

  useEffect(() => {
    if (!settings) return;
    if (practiceHistoryLoadedRef.current) return;

    const ph = (settings as any).practiceHistory;
    if (ph && Array.isArray(ph.recentQuestionIds) && Array.isArray(ph.recentWordProblemCategories)) {
      setRecentQuestionIds(ph.recentQuestionIds.slice(0, 1000));
      setRecentWordProblemCategories(ph.recentWordProblemCategories.slice(0, 50));
    }
    practiceHistoryLoadedRef.current = true;
  }, [settings]);

  useEffect(() => {
    if (!practiceHistoryLoadedRef.current) return;
    if (practiceHistoryPersistTimerRef.current) {
      window.clearTimeout(practiceHistoryPersistTimerRef.current);
    }

    practiceHistoryPersistTimerRef.current = window.setTimeout(() => {
      void db.settings.update('1', {
        practiceHistory: {
          recentQuestionIds: recentQuestionIds.slice(0, 1000),
          recentWordProblemCategories: recentWordProblemCategories.slice(0, 50),
          updatedAt: Date.now(),
        },
      });
    }, 600);

    return () => {
      if (practiceHistoryPersistTimerRef.current) {
        window.clearTimeout(practiceHistoryPersistTimerRef.current);
        practiceHistoryPersistTimerRef.current = null;
      }
    };
  }, [recentQuestionIds, recentWordProblemCategories]);

  const rememberQuestionId = (id: string) => {
    if (!id) return;
    setRecentQuestionIds((prev) => {
      const next = [id, ...prev];
      return next.length > 1000 ? next.slice(0, 1000) : next;
    });
  };

  const wordProblemCategory = (variantId: unknown) => {
    const v = String(variantId ?? '');
    if (!v) return 'other';
    if (v.startsWith('probability_')) return 'probability';
    return 'other';
  };

  const rememberWordProblemCategory = (variantId: unknown) => {
    const cat = wordProblemCategory(variantId);
    setRecentWordProblemCategories((prev) => {
      const next = [cat, ...prev];
      return next.length > 50 ? next.slice(0, 50) : next;
    });
  };

  const generateNext = (seedValue: number) => {
    const userKey = user?.role === 'admin' ? 'admin' : (user?.id || user?.username || 'anonymous');
    const freq = (settings as any)?.practiceFrequencies?.byUserKey?.[userKey] ?? null;
    const topicVariantWeights = (freq?.topicVariantWeights ?? {}) as Record<string, Record<string, number>>;
    const mixedModuleItemWeights = (freq?.mixedModuleItemWeights ?? {}) as Record<string, Record<number, number>>;

    const weightedPickIndex = (weightsByIndex: Record<number, number>, n: number, seed: number) => {
      const rng = (() => {
        let t = (seed ^ 0x5bd1e995) >>> 0;
        const next = () => {
          t += 0x6d2b79f5;
          let x = Math.imul(t ^ (t >>> 15), 1 | t);
          x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
          return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
        return { next };
      })();

      let total = 0;
      for (let i = 0; i < n; i++) total += Math.max(0, Number(weightsByIndex[i] ?? 0));
      if (!(total > 0)) return null;
      let r = rng.next() * total;
      for (let i = 0; i < n; i++) {
        const w = Math.max(0, Number(weightsByIndex[i] ?? 0));
        r -= w;
        if (r <= 0) return i;
      }
      return n - 1;
    };

    const recentSet = new Set(recentQuestionIds);
    const tryGenerate = (
      fn: (seed: number) => QuadraticFactorizationQuestion | PracticeQuestion,
      accept?: (q: QuadraticFactorizationQuestion | PracticeQuestion) => boolean
    ) => {
      for (let attempt = 0; attempt < 50; attempt++) {
        const seed = seedValue + attempt;
        const q = fn(seed);
        if (recentSet.has(q.id)) continue;
        if (accept && !accept(q)) continue;
        return q;
      }
      return fn(seedValue);
    };

    const probabilityCooldown = 8;
    const acceptWordProblem = (q: QuadraticFactorizationQuestion | PracticeQuestion) => {
      const cat = wordProblemCategory((q as any).variantId);
      if (cat !== 'probability') return true;
      const recent = recentWordProblemCategories.slice(0, probabilityCooldown);
      return !recent.includes('probability');
    };

    if (mode === 'mixed') {
      if (!selectedMixedModule || !selectedMixedModule.items?.length) return;
      const items = selectedMixedModule.items;
      const weights = mixedModuleItemWeights?.[selectedMixedModule.id];
      const weightedIdx = weights ? weightedPickIndex(weights as any, items.length, seedValue) : null;
      const idx = typeof weightedIdx === 'number' ? weightedIdx : (mixedCursor % items.length);
      const item = items[idx];
      if (!item) return;

      if (item.topicId === 'quadratics') {
        const q = tryGenerate((seed) => generateQuadraticByFactorisation({ seed, difficulty: item.difficulty }));
        setQuestion(q);
        rememberQuestionId(q.id);
      } else {
        const avoidVariantId = item.topicId === 'word_problems'
          ? (lastVariantByTopic.word_problems as string | undefined)
          : undefined;
        const q = tryGenerate((seed) =>
          generatePracticeQuestion({
            topicId: item.topicId,
            difficulty: item.difficulty,
            seed,
            avoidVariantId,
            variantWeights: topicVariantWeights?.[item.topicId] as any,
          })
        , item.topicId === 'word_problems' ? acceptWordProblem : undefined);
        setQuestion(q);
        rememberQuestionId(q.id);
        if (item.topicId === 'word_problems') {
          const nextVariant = (q as any).variantId ?? undefined;
          setLastVariantByTopic((m) => ({ ...m, word_problems: nextVariant }));
          rememberWordProblemCategory((q as any).variantId);
        }
      }
      resetAttemptState();
      return;
    }

    if (!topicId) return;
    if (topicId === 'quadratics') {
      const q = tryGenerate((seed) => generateQuadraticByFactorisation({ seed, difficulty }));
      setQuestion(q);
      rememberQuestionId(q.id);
      resetAttemptState();
      return;
    }
    const avoidVariantId = lastVariantByTopic[topicId] as string | undefined;
    const q = tryGenerate(
      (seed) => generatePracticeQuestion({ topicId, difficulty, seed, avoidVariantId, variantWeights: topicVariantWeights?.[topicId] as any }),
      topicId === 'word_problems' ? acceptWordProblem : undefined
    );
    setQuestion(q);
    rememberQuestionId(q.id);
    // Record last variant id (if present) so the next question avoids it.
    const nextVariant = (q as any).variantId ?? (q as any).generatorParams?.kind ?? undefined;
    setLastVariantByTopic((m) => ({ ...m, [topicId]: nextVariant }));
    if (topicId === 'word_problems') {
      rememberWordProblemCategory((q as any).variantId);
    }
    resetAttemptState();
  };

  useEffect(() => {
    if (step !== 'session') return;
    if (!practiceHistoryLoadedRef.current) return;
    if (!question) {
      generateNext(sessionSeed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, question, sessionSeed]);

  useEffect(() => {
    const outer = wpKatexOuterRef.current;
    const inner = wpKatexInnerRef.current;
    if (!outer || !inner) return;

    const compute = () => {
      const ow = outer.clientWidth;
      const iw = inner.scrollWidth;
      if (!ow || !iw) return;
      const next = Math.min(1, Math.max(0.6, ow / iw));
      setWpKatexScale((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
    };

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(compute);
    });
    ro.observe(outer);

    requestAnimationFrame(compute);
    return () => {
      ro.disconnect();
    };
  }, [question, step]);

  const checkQuadraticAnswers = (expected: Fraction[], a: string, b: string) => {
    const p1 = parseFraction(a);
    const p2 = parseFraction(b);
    if (!p1 || !p2) return false;

    const [e1, e2] = expected;

    const direct = fractionsEqual(p1, e1) && fractionsEqual(p2, e2);
    const swapped = fractionsEqual(p1, e2) && fractionsEqual(p2, e1);
    return direct || swapped;
  };

  const checkSingleFractionAnswer = (expected: Fraction, raw: string) => {
    const parsed = parseFraction(raw);
    if (!parsed) return false;
    return fractionsEqual(parsed, expected);
  };

  const parseFractionFromMathRaw = (raw: string): Fraction | null => {
    const s0 = String(raw ?? '').trim();
    if (!s0) return null;
    const s = s0.replace(/[−–]/g, '-');
    const cleaned = s.replace(/\s+/g, '');

    const fromBasic = parseFraction(cleaned);
    if (fromBasic) return fromBasic;

    const m = cleaned.match(/^\\frac\{(-?\d+)\}\{(\d+)\}$/);
    if (m) {
      const n = Number(m[1]);
      const d = Number(m[2]);
      if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
      return { n, d };
    }

    const m2 = cleaned.match(/^-\\frac\{(\d+)\}\{(\d+)\}$/);
    if (m2) {
      const n = -Number(m2[1]);
      const d = Number(m2[2]);
      if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
      return { n, d };
    }

    return null;
  };

  const isDefiniteIntegralQuestion = (q: any) => {
    const latex = String(q?.katexQuestion ?? '');
    return /\\int_\{/.test(latex);
  };

  const sanitizeNumericInput = (raw: string, opts?: { maxDecimals?: number }) => {
    const maxDecimals = opts?.maxDecimals;
    let s = raw.replace(/[−–]/g, '-').replace(/[^0-9.\-]/g, '');
    const hadDot = s.includes('.');
    const hadTrailingDot = s.endsWith('.');
    const minusAtStart = s.startsWith('-');
    s = s.replace(/\-/g, '');
    if (minusAtStart) s = `-${s}`;

    // Allow a leading '.' during typing (e.g. ".3" -> "0.3").
    if (s.startsWith('.')) s = `0${s}`;
    if (s.startsWith('-.')) s = `-0${s.slice(1)}`;

    const dot = s.indexOf('.');
    if (dot !== -1) {
      const before = s.slice(0, dot + 1);
      const after = s.slice(dot + 1).replace(/\./g, '');
      s = before + after;
    }

    if (typeof maxDecimals === 'number' && maxDecimals >= 0) {
      const m = s.match(/^(-?\d+)(?:\.(\d*))?$/);
      if (m) {
        const a = m[1];
        const b = (m[2] ?? '').slice(0, maxDecimals);
        // Preserve an in-progress trailing dot (e.g. "0.") so users can continue typing decimals.
        if (!b.length && hadDot && hadTrailingDot && maxDecimals > 0) {
          s = `${a}.`;
        } else {
          s = b.length ? `${a}.${b}` : a;
        }
      }
    }

    return s;
  };

  const sanitizeRationalInput = (raw: string, opts?: { maxDecimals?: number }) => {
    const maxDecimals = opts?.maxDecimals;
    let s = raw.replace(/[−–]/g, '-').replace(/[^0-9.\/\-]/g, '');

    const hadDot = s.includes('.');
    const hadTrailingDot = s.endsWith('.');

    const minusAtStart = s.startsWith('-');
    s = s.replace(/\-/g, '');
    if (minusAtStart) s = `-${s}`;

    // keep only one '/'
    const slash = s.indexOf('/');
    if (slash !== -1) {
      const before = s.slice(0, slash + 1);
      const after = s.slice(slash + 1).replace(/\//g, '');
      s = before + after;

      // when fraction is present, remove any extra dots
      const left = s.slice(0, slash);
      const right = s.slice(slash + 1);
      const cleanLeft = (() => {
        const d = left.indexOf('.');
        if (d === -1) return left;
        return left.slice(0, d + 1) + left.slice(d + 1).replace(/\./g, '');
      })();
      const cleanRight = (() => {
        const d = right.indexOf('.');
        if (d === -1) return right;
        return right.slice(0, d + 1) + right.slice(d + 1).replace(/\./g, '');
      })();
      s = `${cleanLeft}/${cleanRight}`;
      return s;
    }

    // No fraction slash -> treat as decimal/integer; preserve "in-progress" decimal states.
    if (s.startsWith('.')) s = `0${s}`;
    if (s.startsWith('-.')) s = `-0${s.slice(1)}`;

    // otherwise treat as decimal/integer
    const dot = s.indexOf('.');
    if (dot !== -1) {
      const before = s.slice(0, dot + 1);
      const after = s.slice(dot + 1).replace(/\./g, '');
      s = before + after;
    }

    if (typeof maxDecimals === 'number' && maxDecimals >= 0) {
      const m = s.match(/^(-?\d+)(?:\.(\d*))?$/);
      if (m) {
        const a = m[1];
        const b = (m[2] ?? '').slice(0, maxDecimals);
        if (!b.length && hadDot && hadTrailingDot && maxDecimals > 0) {
          s = `${a}.`;
        } else {
          s = b.length ? `${a}.${b}` : a;
        }
      }
    }

    return s;
  };

  const normalizeFixed2 = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (!/^-?\d*(?:\.\d*)?$/.test(trimmed)) return trimmed;
    if (trimmed === '-' || trimmed === '.' || trimmed === '-.') return trimmed;

    const n = Number(trimmed);
    if (Number.isNaN(n)) return trimmed;
    return n.toFixed(2);
  };

  const checkSessionAnswer = () => {
    if (!question) return false;

    if ((question as any).metadata?.topic === 'quadratics') {
      const q = question as QuadraticFactorizationQuestion;
      return checkQuadraticAnswers(q.solutions, answer1, answer2);
    }

    const q = question as PracticeQuestion;
    switch (q.kind) {
      case 'linear':
        return checkSingleFractionAnswer(q.solution, answer1);
      case 'fractions':
        return checkSingleFractionAnswer(q.solution, answer1);
      case 'indices': {
        const trimmed = answer1.trim().replace(/\s+/g, '');

        // Indices: require the exponent only (numeric).
        if (!/^-?\d+$/.test(trimmed)) return false;
        const exp = Number(trimmed);
        if (exp === null || Number.isNaN(exp)) return false;
        return exp === q.exponent;
      }
      case 'polynomial': {
        const trimmed = String(answer1 ?? '').trim().replace(/\s+/g, '').replace(/[−–]/g, '-');
        if (!/^\d+$/.test(trimmed)) return false;
        const v = Number(trimmed);
        if (!Number.isFinite(v)) return false;
        return v === (q as any).expectedNumber;
      }
      case 'simultaneous': {
        const xOk = checkSingleFractionAnswer(q.solutionX, answer1);
        const yOk = checkSingleFractionAnswer(q.solutionY, answer2);
        if ((q as any).variableCount === 3) {
          if (!(q as any).solutionZ) return false;
          const zOk = checkSingleFractionAnswer((q as any).solutionZ, answer3);
          return xOk && yOk && zOk;
        }
        return xOk && yOk;
      }
      case 'factorisation': {
        const norm = (s: string) => String(s ?? '')
          .trim()
          .replace(/[−–]/g, '-')
          .replace(/\u200b/g, '')
          .replace(/\s+/g, '')
          // TypingAnswerMathInput can emit scripts as ^{3} / _{2}; normalize to ^3 / _2
          .replace(/\^\{([^}]+)\}/g, '^$1')
          .replace(/_\{([^}]+)\}/g, '_$1')
          .toLowerCase();

        const fq = q as any;
        const expectedCount = Math.max(2, Math.min(3, Number(fq.expectedFactors?.length ?? 2)));

        const factors = [norm(answer1), norm(answer2), norm(answer3)].filter(Boolean);
        if (factors.length !== expectedCount) return false;

        const perms = (arr: string[]) => {
          if (arr.length <= 1) return [arr];
          if (arr.length === 2) return [[arr[0], arr[1]], [arr[1], arr[0]]];
          if (arr.length === 3) {
            const [a0, a1, a2] = arr;
            return [
              [a0, a1, a2],
              [a0, a2, a1],
              [a1, a0, a2],
              [a1, a2, a0],
              [a2, a0, a1],
              [a2, a1, a0],
            ];
          }
          return [arr];
        };

        const candidates: string[] = [];
        for (const p of perms(factors)) {
          const paren = p.map((f) => `(${f})`);
          candidates.push(paren.join(''));
          candidates.push(paren.join('*'));
        }

        for (const c of candidates) {
          if (q.expectedNormalized.includes(c)) return true;
        }
        return false;
      }
      case 'calculus': {
        const cq = q as any;

        // Definite integrals should accept numeric fractions/decimals like -2/3.
        if (cq.topicId === 'integration' && isDefiniteIntegralQuestion(cq)) {
          const expectedFrac = parseFractionFromMathRaw(String(cq.expectedLatex ?? ''));
          const userFrac = parseFractionFromMathRaw(String(answer1 ?? ''));
          if (expectedFrac && userFrac) return fractionsEqual(expectedFrac, userFrac);

          // Fallback to normalized string compare.
          const normalized = String(answer1 ?? '').replace(/\s+/g, '').toLowerCase();
          return (cq.expectedNormalized ?? []).includes(normalized);
        }

        // Indefinite calculus answers are symbolic.
        const normalized = typeof cq.normalize === 'function'
          ? String(cq.normalize(String(answer1 ?? '')))
          : String(answer1 ?? '').replace(/\s+/g, '').toLowerCase();
        return (cq.expectedNormalized ?? []).includes(normalized);
      }
      case 'word_problem': {
        const wp = q as any;
        const raw1 = String(answer1 ?? '').trim();
        const raw2 = String(answer2 ?? '').trim();
        const raw = wp.answerKind === 'rational' && wp.expectedFraction
          ? (raw2 ? `${raw1}/${raw2}` : raw1)
          : raw1;

        if (!raw) return false;

        if (wp.answerKind === 'integer') {
          if (!/^-?\d+$/.test(raw)) return false;
          return Number(raw) === Number(wp.expectedNumber);
        }

        if (wp.answerKind === 'decimal_2dp') {
          if (!/^-?\d+\.\d{2}$/.test(raw)) return false;
          return Number(raw) === Number(wp.expectedNumber);
        }

        // rational: allow fraction or decimal
        if (wp.expectedFraction) {
          const parsed = parseFraction(raw);
          if (!parsed) return false;
          return fractionsEqual(parsed, wp.expectedFraction);
        }
        return false;
      }
      case 'graph': {
        const gq = q as unknown as GraphPracticeQuestion;
        if (gq.katexOptions?.length) {
          if (typeof gq.correctIndex !== 'number') return false;
          if (selectedOptionIndex === null) return false;
          return selectedOptionIndex === gq.correctIndex;
        }

        const gp = (gq.generatorParams ?? {}) as any;
        if (typeof gp.expectedValue === 'number' && Number.isFinite(gp.expectedValue)) {
          const raw = answer1.trim();
          if (!raw) return false;

          if (gp.expectedFormat === 'fixed2') {
            if (!/^-?\d+\.\d{2}$/.test(raw)) return false;
            return raw === Number(gp.expectedValue).toFixed(2);
          }

          const user = Number(raw);
          if (Number.isNaN(user)) return false;
          return Math.abs(user - gp.expectedValue) <= 0.02;
        }

        if (typeof gp.expectedLatex === 'string') {
          const normalized = answer1.replace(/\s+/g, '');
          const expected = String(gp.expectedLatex).replace(/\s+/g, '');
          return normalized === expected;
        }

        return false;
      }
      default:
        return false;
    }
  };

  const persistAttempt = (payload: { correct: boolean; inputs: [string, string]; q: QuadraticFactorizationQuestion }) => {
    try {
      const key = `practice.attempts.${payload.q.metadata.topic}.${payload.q.metadata.method}`;
      const existingRaw = localStorage.getItem(key);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const next = [
        {
          id: payload.q.id,
          seed: payload.q.metadata.seed,
          difficulty: payload.q.metadata.difficulty,
          coefficients: payload.q.metadata.coefficients,
          correct: payload.correct,
          inputs: payload.inputs,
          createdAt: Date.now(),
        },
        ...existing,
      ].slice(0, 200);
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const chooserTitle = mode === 'mixed' ? 'Mixed Exercises' : 'Individual Topics';

  const nowMs = Date.now();
  const chooserList = mode === 'mixed'
    ? (mixedModules ?? []).map((m) => {
        const sched = (m as any).schedule as { enabled: boolean; opensAt: number; closesAt: number } | undefined;
        const isOpen = !sched?.enabled || (nowMs >= sched.opensAt && nowMs <= sched.closesAt);
        return { id: m.id, title: m.title || 'Untitled mixed module', disabled: !isOpen };
      })
    : PRACTICE_TOPICS.map((t) => ({ id: t.id, title: t.title, disabled: !t.enabled || !!(practiceTopicLocks as any)[t.id] }));

  const currentTitle = useMemo(() => {
    if (mode === 'mixed') return selectedMixedModule?.title || 'Mixed Exercises';
    return selectedTopic?.title || 'Practice';
  }, [mode, selectedMixedModule?.title, selectedTopic?.title]);

  const currentInstruction = useMemo(() => {
    if (!question) return '';
    if (mode === 'mixed') {
      const items = selectedMixedModule?.items ?? [];
      const idx = mixedCursor % (items.length || 1);
      const it = items[idx];
      const topic = PRACTICE_TOPICS.find((t) => t.id === it?.topicId);
      return '';
    }
    return '';
  }, [mode, mixedCursor, question, selectedMixedModule?.items, selectedTopic?.description]);

  const sessionInstruction = useMemo(() => {
    if (!question) return '';

    if ((question as any).metadata?.topic === 'quadratics') {
      return 'Enter both values of x. Order does not matter. Fractions are allowed.';
    }

    const q = question as PracticeQuestion;
    switch (q.kind) {
      case 'linear':
        return 'Solve for x. Enter x as a simplified integer or fraction.';
      case 'fractions':
        return 'Calculate the result and enter your answer as a simplified fraction (or integer).';
      case 'indices':
        return 'Use index laws to find the final exponent. Enter only the exponent as an integer.';
      case 'simultaneous':
        return 'Solve for x and y. Enter both values (fractions are allowed).';
      case 'factorisation':
        return 'Factorise the expression completely. Enter the final factorised answer.';
      case 'word_problem': {
        // We render word-problem instructions inside the question text to keep the UI clean.
        return '';
      }
      default:
        return '';
    }
  }, [currentInstruction, question]);

  return (
    <div className="w-full py-8">
      {step === 'chooser' ? (
        <div className="max-w-6xl mx-auto">
          <div className="mb-4">
            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Practice</div>
          </div>

          <Card className="p-6">
            <div className="flex items-center gap-2 border-b pb-3">
              <button
                type="button"
                className={`text-sm font-semibold px-2 py-1 ${mode === 'individual' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground'}`}
                onClick={() => {
                  setMode('individual');
                  setMixedModuleId(null);
                  setTopicId(null);
                }}
              >
                INDIVIDUAL TOPICS
              </button>
              <button
                type="button"
                className={`text-sm font-semibold px-2 py-1 ${mode === 'mixed' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground'}`}
                onClick={() => {
                  setMode('mixed');
                  setTopicId(null);
                }}
              >
                MIXED EXERCISES
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
              <div className="space-y-2">
                {chooserList.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    disabled={(row as any).disabled}
                    className={`w-full text-left rounded-md border px-5 py-4 bg-white transition-colors ${(row as any).disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/10'} ${(mode === 'mixed' ? mixedModuleId === row.id : topicId === row.id) ? 'border-foreground/40 bg-muted/10' : ''}`}
                    onClick={() => {
                      if (mode === 'mixed') {
                        setMixedModuleId(row.id);
                        return;
                      }
                      setTopicId(row.id as PracticeTopicId);
                    }}
                  >
                    <div className="text-lg font-semibold">{row.title}</div>
                  </button>
                ))}
              </div>

              <div className="rounded-md border bg-muted/10 p-5">
                {mode === 'mixed' ? (
                  <>
                    <div className="text-base font-semibold">Start</div>
                    <div className="text-sm text-muted-foreground mt-1">{chooserTitle}</div>
                    <div className="mt-5">
                      <Button
                        variant="default"
                        className="w-full h-12 text-base"
                        disabled={!mixedModuleId}
                        onClick={() => {
                          setSessionSeed(Date.now());
                          setQuestion(null);
                          setSubmitted(false);
                          setIsCorrect(null);
                          setMixedCursor(0);
                          setStep('session');
                        }}
                      >
                        Start
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-base font-semibold">Choose a level</div>
                    <div className="text-sm text-muted-foreground mt-1">{selectedTopic?.title || chooserTitle}</div>
                    <div className="mt-5 space-y-3">
                      <Button
                        variant="outline"
                        className="w-full h-12 text-base"
                        disabled={!topicId}
                        onClick={() => {
                          setDifficulty('easy');
                          setSessionSeed(Date.now());
                          setQuestion(null);
                          setSubmitted(false);
                          setIsCorrect(null);
                          setMixedCursor(0);
                          setStep('session');
                        }}
                      >
                        Easy
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full h-12 text-base"
                        disabled={!topicId}
                        onClick={() => {
                          setDifficulty('medium');
                          setSessionSeed(Date.now());
                          setQuestion(null);
                          setSubmitted(false);
                          setIsCorrect(null);
                          setMixedCursor(0);
                          setStep('session');
                        }}
                      >
                        Medium
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full h-12 text-base"
                        disabled={!topicId}
                        onClick={() => {
                          setDifficulty('hard');
                          setSessionSeed(Date.now());
                          setQuestion(null);
                          setSubmitted(false);
                          setIsCorrect(null);
                          setMixedCursor(0);
                          setStep('session');
                        }}
                      >
                        Ultimate
                      </Button>
                    </div>
                  </>
                )}

                {mode === 'mixed' && mixedModules.length === 0 ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    No mixed modules configured. Ask an admin to create one in Settings.
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {step === 'session' && question ? (
        <div className="w-full max-w-none mx-auto space-y-3 px-3 md:px-6">
          <Card className="px-4 py-3">
            <div className="flex items-center justify-between gap-3 min-h-12">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setStep('chooser');
                    setQuestion(null);
                    setSubmitted(false);
                    setIsCorrect(null);
                    setAnswer1('');
                    setAnswer2('');
                    setAnswer3('');
                  }}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0 select-none">
                  <div className="text-lg font-semibold leading-tight text-foreground truncate">{currentTitle}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void openReportDialogWithCapture();
                  }}
                  className="bg-white"
                >
                  <Bug className="h-4 w-4 mr-2" />
                  Report issue
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setReportHelpOpen(true)}
                  className="bg-white rounded-full"
                  aria-label="Answer input help"
                  title="Answer input help"
                >
                  <CircleHelp className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </Card>

          <Dialog open={reportHelpOpen} onOpenChange={setReportHelpOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Answer input help</DialogTitle>
                <DialogDescription>
                  How to type answers and what format is accepted.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm leading-relaxed text-foreground">
                <div className="font-semibold">General rules</div>
                <div>
                  - Do <span className="font-semibold">not</span> include spaces between parts of an answer.
                </div>
                <div>
                  Example: type <span className="font-mono">2x-1</span>, not <span className="font-mono">2x - 1</span>.
                </div>

                <div className="font-semibold mt-2">Powers (superscripts)</div>
                <div>
                  Use <span className="font-mono">^</span> for powers.
                </div>
                <div>
                  Examples:
                  <div className="mt-1 font-mono">x^2</div>
                  <div className="font-mono">(x+1)^2</div>
                </div>

                <div className="font-semibold mt-2">Subscripts</div>
                <div>
                  Use <span className="font-mono">_</span> for subscripts.
                </div>
                <div>
                  Examples:
                  <div className="mt-1 font-mono">a_1</div>
                  <div className="font-mono">x_0</div>
                </div>

                <div className="font-semibold mt-2">Factorisation</div>
                <div>
                  Enter each factor in its own box. Each factor is treated as being inside brackets.
                </div>
                <div>
                  Example: <span className="font-mono">(12x)(2x-1)(5x+3)</span>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setReportHelpOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card ref={practiceContentRef} className="p-6 border-2">
            {sessionInstruction ? (
              <div className="text-base font-medium text-foreground">{sessionInstruction}</div>
            ) : null}

            {(question as any).kind === 'graph'
              && (((question as GraphPracticeQuestion).graphSpec) || ((question as GraphPracticeQuestion).svgDataUrl))
              && !(question as any).generatorParams?.unitCircle ? (
                <div className="mt-4 flex justify-center">
                  {(question as GraphPracticeQuestion).graphSpec ? (
                    <InteractiveGraph
                      spec={(question as GraphPracticeQuestion).graphSpec!}
                      altText={(question as GraphPracticeQuestion).svgAltText}
                      interactive={(question as any).topicId === 'graph_straight_line'}
                    />
                  ) : (
                    <img
                      src={(question as GraphPracticeQuestion).svgDataUrl}
                      alt={(question as GraphPracticeQuestion).svgAltText}
                      className={(question as any).generatorParams?.circularMeasure ? 'max-w-full h-auto' : 'max-w-full h-auto rounded-md border bg-white'}
                    />
                  )}
                </div>
              )
              : null}

            <div className="mt-6 w-full">
              {(question as any).kind === 'graph' ? (
                <div className="w-full select-none">
                  {(question as GraphPracticeQuestion).promptText ? (
                    <div className="tk-wp-expl-text text-xl md:text-2xl leading-snug text-left text-foreground">
                      {(question as GraphPracticeQuestion).promptText}
                    </div>
                  ) : null}

                  {(question as GraphPracticeQuestion).promptKatex ? (
                    <div
                      className={`${(question as GraphPracticeQuestion).promptText ? 'mt-2 text-2xl leading-snug text-left text-foreground' : 'text-2xl leading-snug text-center text-foreground'} max-w-full`}
                    >
                      <Katex latex={(question as GraphPracticeQuestion).promptKatex!} displayMode />
                    </div>
                  ) : null}
                </div>
              ) : (() => {
                  const isWordProblem = (question as any).topicId === 'word_problems' || (question as any).kind === 'word_problem';
                  const wpPromptText = isWordProblem ? String((question as any).promptText ?? '') : '';

                  const stripLatex = (src: string) => src
                    // Remove common LaTeX wrappers seen in some prompt strings.
                    .replace(/\\text\{([^}]*)\}/g, '$1')
                    // Handle malformed \\text{... with no closing brace.
                    .replace(/\\text\{([^}]*)/g, '$1')
                    // Some prompts may contain \text(...) instead of braces.
                    .replace(/\\text\(([^)]*)\)/g, '$1')
                    // If \text appears without a brace, drop it.
                    .replace(/\\text\b\{?/g, '')
                    .replace(/\\!+/g, '')
                    // Line breaks and spacing escapes.
                    .replace(/\\\\/g, ' ')
                    .replace(/\\,/g, ' ')
                    .replace(/\\quad/g, ' ')
                    .replace(/\\;/g, ' ')
                    // Punctuation escapes.
                    .replace(/\\\./g, '.')
                    .replace(/\\\}/g, '')
                    .replace(/\\\{/g, '')
                    // Remove any remaining LaTeX commands/backslashes.
                    .replace(/\\[a-zA-Z]+/g, '')
                    .replace(/\\+/g, '')
                    .replace(/~/g, ' ')
                    .replace(/[{}]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                  const preserveFractions = (src: string) => {
                    const fracs: string[] = [];
                    const out = src.replace(/\\frac\{[^}]+\}\{[^}]+\}/g, (m) => {
                      const id = fracs.length;
                      fracs.push(m);
                      return `@@FRAC_${id}@@`;
                    });
                    return { out, fracs };
                  };

                  const restoreFractionsParts = (src: string, fracs: string[]) => {
                    const parts = src.split(/(@@FRAC_\d+@@)/g).filter((p) => p.length > 0);
                    return parts.map((p) => {
                      const m = p.match(/^@@FRAC_(\d+)@@$/);
                      if (!m) return { kind: 'text' as const, value: p };
                      const idx = Number(m[1]);
                      const latex = fracs[idx] ?? '';
                      return { kind: 'math' as const, value: latex };
                    });
                  };

                  if (isWordProblem && wpPromptText.trim().length) {
                    const wp = question as any;

                    const { out: tmp, fracs } = preserveFractions(wpPromptText);
                    const baseText = stripLatex(tmp.replace(/\s*\n+\s*/g, ' ').trim());
                    const needsFixed2 = wp?.answerKind === 'decimal_2dp';

                    const hasFixed2Instruction = /give\s+your\s+answer\s+to\s+2\s+decimal\s+places\.?/i.test(baseText);
                    const fullText = needsFixed2 && !hasFixed2Instruction
                      ? `${baseText}${baseText.endsWith('.') ? '' : '.'} Give your answer to 2 decimal places.`
                      : baseText;

                    const sentences = fullText
                      .split(/(?<=[.!?])\s+/)
                      .map((s) => s.trim())
                      .filter(Boolean);

                    return (
                      <div className={`w-full select-none font-slab text-xl md:text-2xl leading-snug text-left`}>
                        <div className="w-full min-w-0 max-w-full space-y-2">
                          {sentences.map((t, i) => {
                            const segs = restoreFractionsParts(t, fracs);
                            return (
                              <div key={i} className="whitespace-normal">
                                {segs.map((seg, j) => seg.kind === 'math'
                                  ? (
                                    <span key={j} className="inline-block align-baseline mx-1">
                                      <Katex latex={seg.value} displayMode={false} />
                                    </span>
                                  )
                                  : (
                                    <span key={j}>{seg.value}</span>
                                  ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  if (isWordProblem) {
                    const wpLatex = String((question as any).katexQuestion ?? '').trim();
                    if (wpLatex && /\\text\b|\\!|\\\.|\\,|\{|\}|\\|\\frac\{/.test(wpLatex)) {
                      const { out: tmp, fracs } = preserveFractions(wpLatex);
                      const cleaned = stripLatex(tmp);
                      if (cleaned) {
                        const segs = restoreFractionsParts(cleaned, fracs);
                        return (
                          <div className={`w-full select-none font-slab text-xl md:text-2xl leading-snug text-left`}>
                            {segs.map((seg, j) => seg.kind === 'math'
                              ? (
                                <span key={j} className="inline-block align-baseline mx-1">
                                  <Katex latex={seg.value} displayMode={false} />
                                </span>
                              )
                              : (
                                <span key={j}>{seg.value}</span>
                              ))}
                          </div>
                        );
                      }
                    }
                  }

                  const promptBlocks = (question as any).promptBlocks as any[] | undefined;
                  if ((question as any).kind === 'polynomial' && Array.isArray(promptBlocks) && promptBlocks.length) {
                    return (
                      <div className="w-full select-none">
                        <div className="tk-wp-expl-text text-lg md:text-xl leading-relaxed text-left text-foreground">
                          {promptBlocks.map((b, i) => {
                            if (b?.kind === 'text' && String(b?.content ?? '') === '\n') {
                              return ' ';
                            }
                            if (b?.kind === 'math') {
                              // Render inline so the whole prompt stays on one line.
                              return (
                                <span key={`pm-${i}`} className="inline-block align-baseline mx-1">
                                  <Katex latex={String(b.content ?? '')} displayMode={false} />
                                </span>
                              );
                            }
                            return (
                              <span key={`pt-${i}`} className="whitespace-normal">
                                {String(b?.content ?? '')}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  const latex = String((question as any).katexQuestion ?? '');
                  const isMultiline = latex.includes('\\begin{cases}') || latex.includes('\\begin{aligned}') || latex.includes('\\\\');
                  const promptTextClass = isWordProblem
                    ? (isMultiline ? 'text-2xl md:text-3xl leading-snug text-left' : 'text-2xl md:text-3xl leading-snug text-left')
                    : (isMultiline ? 'text-xl md:text-2xl leading-snug text-center' : 'text-2xl md:text-3xl leading-snug text-center');

                  const useResponsiveScale = isWordProblem && !wpPromptText.trim().length && !isMultiline;
                  const scale = useResponsiveScale ? wpKatexScale : 1;

                  // If the prompt is pure text (\text{...}), render it as HTML so we can control the font.
                  // This improves headings like the stationary-points prompt.
                  const textOnlyMatch = latex.match(/^\\text\{([\s\S]*)\}$/);
                  if (textOnlyMatch && !/\\frac\{|\^\{|_\{|\\int\b|\\cdot\b|\\sqrt\b|\\sum\b|\\pi\b/.test(textOnlyMatch[1] ?? '')) {
                    return (
                      <div className={`${promptTextClass} font-slab max-w-full select-none`}>
                        {String(textOnlyMatch[1] ?? '').replace(/\\\\/g, ' ')}
                      </div>
                    );
                  }

                  const boldTextWithMathMatch = latex.match(/^\\textbf\{([\s\S]*?)\}\\;\s*([\s\S]*)$/);
                  if (boldTextWithMathMatch) {
                    const t = String(boldTextWithMathMatch[1] ?? '').replace(/\\\\/g, ' ').trim();
                    const rest = String(boldTextWithMathMatch[2] ?? '').trim();
                    return (
                      <div className={'text-xl md:text-2xl leading-snug text-center font-slab max-w-full select-none'}>
                        <span className="inline-flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
                          <span>{t}</span>
                          <span className="inline-block">
                            <Katex latex={rest} displayMode={false} />
                          </span>
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div className={`${promptTextClass} select-none`}>
                      <div className={isWordProblem ? 'w-full min-w-0 max-w-full px-2' : 'w-full min-w-0 max-w-full'}>
                        <div
                          ref={useResponsiveScale ? wpKatexOuterRef : undefined}
                          className={useResponsiveScale ? 'w-full overflow-visible py-1' : 'w-full max-w-full'}
                        >
                          <div
                            ref={useResponsiveScale ? wpKatexInnerRef : undefined}
                            className={useResponsiveScale ? 'inline-block w-max max-w-none' : 'w-full'}
                            style={useResponsiveScale ? { transform: `scale(${scale})`, transformOrigin: 'top left' } : undefined}
                          >
                            <Katex latex={latex} displayMode />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
            </div>

            <Dialog
              open={reportDialogOpen}
              onOpenChange={(open) => {
                setReportDialogOpen(open);
                if (!open) {
                  setReportScreenshotDataUrl(undefined);
                  setIsCapturingReportScreenshot(false);
                  setReportScreenshotError(null);
                }
              }}
            >
              <DialogContent className="max-w-6xl h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Report an issue</DialogTitle>
                  <DialogDescription>
                    Send a detailed description so the admin can fix it.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="min-h-0 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">Screenshot</div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant={reportCaptureMode === 'practice_full' ? 'default' : 'outline'}
                          size="sm"
                          disabled={isCapturingReportScreenshot}
                          onClick={() => {
                            setReportCaptureMode('practice_full');
                            void openReportDialogWithCapture('practice_full');
                          }}
                        >
                          Capture practice
                        </Button>
                        <Button
                          variant={reportCaptureMode === 'screen' ? 'default' : 'outline'}
                          size="sm"
                          disabled={isCapturingReportScreenshot}
                          onClick={() => {
                            setReportCaptureMode('screen');
                            void openReportDialogWithCapture('screen');
                          }}
                        >
                          Capture screen
                        </Button>
                      </div>
                    </div>
                    {reportScreenshotDataUrl ? (
                      <div className="flex-1 min-h-0 overflow-auto rounded-md border bg-muted/20">
                        <img
                          src={reportScreenshotDataUrl}
                          alt="Report screenshot preview"
                          className="w-full h-auto block"
                        />
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground flex items-center justify-center text-center">
                        {isCapturingReportScreenshot
                          ? 'Capturing screenshot…'
                          : reportScreenshotError
                            ? reportScreenshotError
                            : 'Click “Capture practice” (recommended) or “Capture screen”.'}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      Tip: “Capture practice” includes off-screen content; “Capture screen” captures exactly what you see.
                    </div>
                  </div>

                  <div className="min-h-0 flex flex-col gap-2">
                    <div className="text-xs text-muted-foreground">Issue description</div>
                    <Textarea
                      value={reportMessage}
                      onChange={(e) => setReportMessage(e.target.value)}
                      placeholder="Please describe the issue in detail (what you expected vs what happened, steps to reproduce, etc.)"
                      className="flex-1 min-h-0"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setReportDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={submitErrorReport}
                    disabled={isSubmittingReport || isCapturingReportScreenshot || (!reportScreenshotDataUrl && !reportScreenshotError)}
                  >
                    {isSubmittingReport ? 'Sending…' : 'Send report'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="mt-8">
              {(question as any).kind === 'graph' && (question as GraphPracticeQuestion).katexOptions?.length ? (
                (() => {
                  const q = question as GraphPracticeQuestion;
                  const isTrigRatio = !!(q as any).generatorParams?.unitCircle;
                  const correctIdx = q.correctIndex;
                  const gridClass = isTrigRatio
                    ? 'max-w-5xl mx-auto grid grid-cols-4 gap-2'
                    : 'max-w-2xl mx-auto space-y-2';
                  return (
                    <div className={gridClass}>
                      {q.katexOptions!.map((opt, idx) => {
                        const selected = selectedOptionIndex === idx;
                        const isCorrectOption = submitted && correctIdx !== undefined && idx === correctIdx;
                        const isWrongSelected = submitted && selected && correctIdx !== undefined && idx !== correctIdx;
                        const baseClass = isTrigRatio
                          ? 'w-full text-center rounded-md border px-2 py-2 bg-white transition-colors'
                          : 'w-full text-left rounded-md border px-4 py-3 bg-white transition-colors';
                        const stateClass = submitted
                          ? isCorrectOption
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-300'
                            : isWrongSelected
                              ? 'border-rose-600 bg-rose-50 text-rose-950 ring-2 ring-rose-300'
                              : 'opacity-90'
                          : 'hover:bg-muted/10';
                        const selectedClass = !submitted && selected ? 'border-foreground/40 bg-muted/10' : '';

                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={submitted}
                            onClick={() => setSelectedOptionIndex(idx)}
                            className={`${baseClass} ${stateClass} ${selectedClass}`}
                          >
                            <div className={isTrigRatio ? 'text-base md:text-lg leading-snug' : 'text-xl leading-snug'}>
                              <Katex latex={opt} displayMode={false} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()
              ) : null}

              {(question as any).kind === 'graph'
                && !(question as GraphPracticeQuestion).katexOptions?.length
                && (question as GraphPracticeQuestion).inputFields?.length ? (
                <div className="max-w-sm mx-auto space-y-3">
                  {(question as GraphPracticeQuestion).inputFields!.map((f) => (
                    <div key={f.id} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{f.label}</Label>
                      {f.kind === 'text' ? (
                        <TypingAnswerMathInput
                          value={answer1}
                          onChange={setAnswer1}
                          placeholder=""
                          disabled={submitted}
                          className="text-2xl font-normal text-left"
                        />
                      ) : (
                        <Input
                          value={answer1}
                          inputMode="decimal"
                          onChange={(e) => {
                            const gp = ((question as GraphPracticeQuestion).generatorParams ?? {}) as any;
                            const fixed2 = gp.expectedFormat === 'fixed2';
                            const next = sanitizeNumericInput(e.target.value, { maxDecimals: fixed2 ? 2 : undefined });
                            setAnswer1(next);
                          }}
                          disabled={submitted}
                          className="h-12 text-2xl font-normal text-center py-1"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {(question as any).metadata?.topic === 'quadratics' ? (
                <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Answer 1</Label>
                    <Input
                      value={answer1}
                      onChange={(e) => setAnswer1(e.target.value)}
                      disabled={submitted}
                      className="h-12 text-2xl font-normal text-center py-1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Answer 2</Label>
                    <Input
                      value={answer2}
                      onChange={(e) => setAnswer2(e.target.value)}
                      disabled={submitted}
                      className="h-12 text-2xl font-normal text-center py-1"
                    />
                  </div>
                </div>
              ) : (question as PracticeQuestion).kind === 'simultaneous' ? (
                <div className={(question as any).variableCount === 3 ? 'grid grid-cols-3 gap-3 max-w-2xl mx-auto' : 'grid grid-cols-2 gap-3 max-w-md mx-auto'}>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">x</Label>
                    <Input
                      value={answer1}
                      inputMode="decimal"
                      onChange={(e) => setAnswer1(sanitizeRationalInput(e.target.value))}
                      disabled={submitted}
                      className="h-12 text-2xl font-normal text-center py-1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">y</Label>
                    <Input
                      value={answer2}
                      inputMode="decimal"
                      onChange={(e) => setAnswer2(sanitizeRationalInput(e.target.value))}
                      disabled={submitted}
                      className="h-12 text-2xl font-normal text-center py-1"
                    />
                  </div>
                  {(question as any).variableCount === 3 ? (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">z</Label>
                      <Input
                        value={answer3}
                        inputMode="decimal"
                        onChange={(e) => setAnswer3(sanitizeRationalInput(e.target.value))}
                        disabled={submitted}
                        className="h-12 text-2xl font-normal text-center py-1"
                      />
                    </div>
                  ) : null}
                </div>
              ) : (question as any).kind === 'graph' ? null : (
                <div className="max-w-sm mx-auto space-y-1">
                  <Label className="text-xs text-muted-foreground">Answer</Label>
                  {(question as PracticeQuestion).kind === 'factorisation' ? (
                    <div className={`grid gap-3 ${(question as any).expectedFactors?.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Factor 1</Label>
                        <div className="flex items-center justify-center gap-2">
                          <div className="text-2xl select-none">(</div>
                          <div className="flex-1">
                            <TypingAnswerMathInput
                              value={answer1}
                              onChange={setAnswer1}
                              placeholder=""
                              disabled={submitted}
                              enableScripts
                              className={'text-2xl font-normal text-center'}
                            />
                          </div>
                          <div className="text-2xl select-none">)</div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Factor 2</Label>
                        <div className="flex items-center justify-center gap-2">
                          <div className="text-2xl select-none">(</div>
                          <div className="flex-1">
                            <TypingAnswerMathInput
                              value={answer2}
                              onChange={setAnswer2}
                              placeholder=""
                              disabled={submitted}
                              enableScripts
                              className={'text-2xl font-normal text-center'}
                            />
                          </div>
                          <div className="text-2xl select-none">)</div>
                        </div>
                      </div>
                      {(question as any).expectedFactors?.length === 3 ? (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Factor 3</Label>
                          <div className="flex items-center justify-center gap-2">
                            <div className="text-2xl select-none">(</div>
                            <div className="flex-1">
                              <TypingAnswerMathInput
                                value={answer3}
                                onChange={setAnswer3}
                                placeholder=""
                                disabled={submitted}
                                enableScripts
                                className={'text-2xl font-normal text-center'}
                              />
                            </div>
                            <div className="text-2xl select-none">)</div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (question as PracticeQuestion).kind === 'calculus' && (question as any).topicId === 'integration' && /\\int_\{/.test(String((question as any).katexQuestion ?? '')) ? (
                    <Input
                      value={answer1}
                      inputMode="decimal"
                      onChange={(e) => setAnswer1(sanitizeRationalInput(e.target.value))}
                      disabled={submitted}
                      spellCheck={false}
                      autoCorrect="off"
                      autoCapitalize="off"
                      className="h-12 text-2xl font-normal text-center py-1 overflow-hidden text-ellipsis whitespace-nowrap"
                    />
                  ) : (question as PracticeQuestion).kind === 'calculus' ? (
                    <TypingAnswerMathInput
                      value={answer1}
                      onChange={setAnswer1}
                      placeholder=""
                      disabled={submitted}
                      enableScripts
                      className={'text-2xl font-normal text-left'}
                    />
                  ) : (
                    (question as PracticeQuestion).kind === 'word_problem'
                      && (question as any).answerKind === 'rational'
                      && !!(question as any).expectedFraction ? (
                      <div className="w-full flex justify-center">
                        <div className="w-56">
                          <Input
                            value={answer1}
                            inputMode="numeric"
                            onChange={(e) => setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 0 }))}
                            disabled={submitted}
                            className="h-12 text-2xl font-normal text-center py-1"
                          />
                          <div className="my-2 h-px bg-foreground/40" />
                          <Input
                            value={answer2}
                            inputMode="numeric"
                            onChange={(e) => setAnswer2(sanitizeNumericInput(e.target.value, { maxDecimals: 0 }))}
                            disabled={submitted}
                            className="h-12 text-2xl font-normal text-center py-1"
                          />
                        </div>
                      </div>
                    ) : (
                    <Input
                      value={answer1}
                      inputMode={(() => {
                        const kind = (question as PracticeQuestion).kind;
                        if (kind === 'indices') return 'numeric';
                        if (kind === 'polynomial') return 'numeric';
                        if (kind === 'linear' || kind === 'fractions') return 'decimal';
                        if (kind === 'word_problem') {
                          const wp = question as any;
                          if (wp.answerKind === 'integer') return 'numeric';
                          // decimal_2dp + rational (single input) should allow '.'
                          return 'decimal';
                        }
                        return undefined;
                      })()}
                      onChange={(e) => {
                        if ((question as PracticeQuestion).kind === 'indices') {
                          setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 0 }));
                          return;
                        }
                        if ((question as PracticeQuestion).kind === 'polynomial') {
                          setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 0 }));
                          return;
                        }
                        if ((question as PracticeQuestion).kind === 'linear' || (question as PracticeQuestion).kind === 'fractions') {
                          // Fractions/linear allow fraction or decimal.
                          setAnswer1(sanitizeRationalInput(e.target.value));
                          return;
                        }
                        if ((question as PracticeQuestion).kind === 'word_problem') {
                          const wp = question as any;
                          if (wp.answerKind === 'integer') {
                            setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 0 }));
                            return;
                          }
                          if (wp.answerKind === 'decimal_2dp') {
                            setAnswer1(sanitizeNumericInput(e.target.value, { maxDecimals: 2 }));
                            return;
                          }
                          setAnswer1(sanitizeRationalInput(e.target.value));
                          return;
                        }
                        // For other non-text topics, keep it numeric-only.
                        setAnswer1(sanitizeNumericInput(e.target.value));
                        return;
                      }}
                      disabled={submitted}
                      className="h-12 text-2xl font-normal text-center py-1"
                    />
                    )
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-center">
              <Button
                disabled={submitted
                  || (
                    (question as any).kind === 'graph'
                    && !!(question as GraphPracticeQuestion).katexOptions?.length
                    && selectedOptionIndex === null
                  )}
                onClick={() => {
                  const ok = checkSessionAnswer();
                  setSubmitted(true);
                  setIsCorrect(ok);
                  if ((question as any).metadata?.topic === 'quadratics') {
                    persistAttempt({ correct: ok, inputs: [answer1, answer2], q: question as QuadraticFactorizationQuestion });
                  }
                }}
              >
                Submit
              </Button>
            </div>

            {submitted ? (
              <div className="mt-6 space-y-3">
                <div className={`${isCorrect
                  ? 'bg-gradient-to-r from-emerald-500/15 via-emerald-400/10 to-emerald-500/15 border-emerald-600 text-emerald-950'
                  : 'bg-gradient-to-r from-red-500/15 via-red-400/10 to-red-500/15 border-red-600 text-red-950'} rounded-md border px-3 py-2 flex items-center justify-between gap-3`}>
                  <div className="text-base font-semibold">{isCorrect ? 'Correct' : 'Wrong'}</div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const nextSeed = Date.now();
                      setSessionSeed(nextSeed);
                      if (mode === 'mixed') {
                        setMixedCursor((c) => c + 1);
                      }
                      setQuestion(null);
                      generateNext(nextSeed);
                    }}
                  >
                    Next
                  </Button>
                </div>

                <div className="rounded-md border bg-background p-4">
                  {(question as any).kind === 'graph' ? (
                    <div className="space-y-4">
                      {!!(question as any).generatorParams?.unitCircle && (question as GraphPracticeQuestion).graphSpec ? (
                        (question as GraphPracticeQuestion).secondaryGraphSpec ? (
                          <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <InteractiveGraph
                              spec={(question as GraphPracticeQuestion).graphSpec!}
                              altText={(question as GraphPracticeQuestion).svgAltText}
                              interactive={false}
                            />
                            <InteractiveGraph
                              spec={(question as GraphPracticeQuestion).secondaryGraphSpec!}
                              altText={(question as GraphPracticeQuestion).svgAltText}
                              interactive={false}
                            />
                          </div>
                        ) : (
                          <div className="flex justify-center">
                            <InteractiveGraph
                              spec={(question as GraphPracticeQuestion).graphSpec!}
                              altText={(question as GraphPracticeQuestion).svgAltText}
                              interactive={false}
                            />
                          </div>
                        )
                      ) : null}

                      {!!(question as any).generatorParams?.circularMeasure && (question as any).generatorParams?.expectedLatex ? (
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="text-xs text-muted-foreground">Answer</div>
                          <div className="text-2xl leading-snug">
                            <Katex latex={(question as any).generatorParams.expectedLatex} displayMode={false} />
                          </div>
                        </div>
                      ) : null}

                      {(question as GraphPracticeQuestion).correctIndex !== undefined && (question as GraphPracticeQuestion).katexOptions?.[(question as GraphPracticeQuestion).correctIndex!] ? (
                        <div className="rounded-md border bg-background px-3 py-2">
                          <div className="text-xs text-muted-foreground">Answer</div>
                          <div className="text-2xl leading-snug">
                            <Katex
                              latex={(question as GraphPracticeQuestion).katexOptions![(question as GraphPracticeQuestion).correctIndex!]}
                              displayMode={false}
                            />
                          </div>
                        </div>
                      ) : null}

                      {(question as GraphPracticeQuestion).katexExplanation.steps.map((s, idx) => (
                        <div key={idx} className="space-y-1">
                          <div
                            className={
                              (question as any).generatorParams?.circularMeasure
                                ? 'text-lg md:text-xl leading-snug max-w-full'
                                : 'text-xl md:text-2xl leading-snug max-w-full'
                            }
                          >
                            <Katex latex={s.katex} displayMode />
                          </div>
                          <div className="tk-wp-expl-text text-lg leading-relaxed text-foreground">{s.text}</div>
                        </div>
                      ))}

                      <div className="pt-2 border-t">
                        <div className="text-base font-semibold text-foreground">Key Idea</div>
                        <div className="tk-wp-expl-text text-lg leading-relaxed text-foreground">
                          {(question as GraphPracticeQuestion).katexExplanation.summary}
                        </div>
                      </div>

                      {(question as GraphPracticeQuestion).katexExplanation.commonMistake ? (
                        <div className="pt-2 border-t">
                          <div className="text-base font-semibold text-foreground">Common mistake</div>
                          <div
                            className={
                              (question as any).generatorParams?.circularMeasure
                                ? 'mt-1 text-base md:text-lg leading-snug max-w-full'
                                : 'mt-1 text-lg md:text-xl leading-snug max-w-full'
                            }
                          >
                            <Katex
                              latex={(question as GraphPracticeQuestion).katexExplanation.commonMistake!.katex}
                              displayMode
                            />
                          </div>
                          <div className="tk-wp-expl-text text-lg leading-relaxed text-foreground">
                            {(() => {
                              const s = String((question as GraphPracticeQuestion).katexExplanation.commonMistake!.text ?? '');
                              const hasLatex = /\\frac\{|\^\{|\^\d|_\{|\\int\b|\\cdot\b/.test(s);
                              if (!hasLatex) return s;

                              const parts = s.split(
                                /(\\frac\{[^}]+\}\{[^}]+\}|\\cdot|\\int\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+)/g
                              );
                              return (
                                <span>
                                  {parts.filter((p) => p.length > 0).map((p, i) => {
                                    const isMath =
                                      /^(\\frac\{[^}]+\}\{[^}]+\}|\\cdot|\\int\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+)$/.test(p);
                                    return isMath ? <Katex key={i} latex={p} /> : <span key={i}>{p}</span>;
                                  })}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(question as any).katexExplanation?.map((b: any, idx: number) =>
                        b.kind === 'text' ? (
                          <div
                            key={idx}
                            className={(question as any).topicId === 'word_problems'
                              ? 'tk-wp-expl-text text-xl leading-relaxed text-foreground'
                              : (question as any).topicId === 'polynomials'
                                ? 'tk-wp-expl-text text-base leading-relaxed text-foreground'
                                : 'text-base leading-relaxed text-foreground'}
                          >
                            {(question as any).topicId === 'word_problems' ? (
                              String(b.content ?? '')
                            ) : (
                              (() => {
                                const s = String(b.content ?? '');
                                const hasLatex = /\\frac\{|\^\{|\^\d|_\{|\\int\b|\\cdot\b/.test(s);
                                if (!hasLatex) return s;

                                const parts = s.split(
                                  /(\\frac\{[^}]+\}\{[^}]+\}|\\cdot|\\int\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+)/g
                                );
                                return (
                                  <span>
                                    {parts.filter((p) => p.length > 0).map((p, i) => {
                                      const isMath =
                                        /^(\\frac\{[^}]+\}\{[^}]+\}|\\cdot|\\int\b|-?\d*x\^\{\d+\}|x\^\{\d+\}|-?\d*x\^\d+|x\^\d+)$/.test(p);
                                      return isMath ? <Katex key={i} latex={p} /> : <span key={i}>{p}</span>;
                                    })}
                                  </span>
                                );
                              })()
                            )}
                          </div>
                        ) : b.kind === 'graph' ? (
                          <div key={idx} className="flex justify-center">
                            <InteractiveGraph
                              spec={b.graphSpec}
                              altText={b.altText}
                              interactive={(question as any).topicId === 'integration'}
                            />
                          </div>
                        ) : b.kind === 'long_division' ? (
                          <div key={idx} className="py-2">
                            <PolynomialLongDivision
                              divisorLatex={b.divisorLatex}
                              dividendLatex={b.dividendLatex}
                              quotientLatex={b.quotientLatex}
                              steps={b.steps}
                            />
                          </div>
                        ) : (
                          <div
                            key={idx}
                            className={
                              (question as any).topicId === 'word_problems'
                                ? 'text-2xl leading-snug py-1'
                                : (b.displayMode ? 'text-xl leading-snug' : 'text-xl leading-snug')
                            }
                          >
                            <Katex latex={b.content} displayMode={(question as any).topicId === 'word_problems' ? false : !!b.displayMode} />
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
