export type Bbox = { x0: number; y0: number; x1: number; y1: number };

type TesseractWord = { text: string; bbox: Bbox };

type TesseractLine = { text: string; bbox: Bbox };

type TesseractRaw = {
  data?: {
    words?: TesseractWord[];
    lines?: TesseractLine[];
  };
};

export type AutoAttachmentResult = {
  questionImages: string[];
  optionImagesByLabel: Record<string, string[]>;
  imageBboxes: Bbox[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeLine(line: string): string {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

function matchOptionLabel(line: string): string | null {
  const s = normalizeLine(line);
  if (!s) return null;

  // A) text / (A) text / A. text / A text
  const letter = s.match(/^\(?\s*([A-D])\s*\)?(?:\s*[\).:\-–—]\s*|\s+).+$/i);
  if (letter) return String(letter[1]).toUpperCase();

  // (a) text etc
  const neet = s.match(/^\(\s*([A-D])\s*\)\s+.+$/i);
  if (neet) return String(neet[1]).toUpperCase();

  // (1) text / 1) text / 1. text / 1 text
  const num = s.match(/^\(?\s*([1-9])\s*\)?(?:\s*[\).:\-–—]\s*|\s+).+$/);
  if (num) return String(num[1]);

  return null;
}

function matchStandaloneOptionLabel(line: string): string | null {
  const s = normalizeLine(line);
  if (!s) return null;

  const letter = s.match(/^\(?\s*([A-D])\s*\)?$/i);
  if (letter) return String(letter[1]).toUpperCase();

  const num = s.match(/^\(?\s*([1-9])\s*\)?$/);
  if (num) return String(num[1]);

  return null;
}

function pixelLum(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function bboxUnion(a: Bbox, b: Bbox): Bbox {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

function bboxArea(b: Bbox): number {
  return Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
}

function bboxIntersectArea(a: Bbox, b: Bbox): number {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

function expandBboxToIncludeNearbyWords(b: Bbox, words: TesseractWord[], w: number, h: number): Bbox {
  // Include nearby small labels (axis text, tick labels) that may fall just outside the ink component.
  // Keep conservative to avoid swallowing surrounding paragraph text.
  let out = expandBbox(b, 16, w, h);
  const margin = 28;
  const edgeBand = 70;

  for (const wd of words) {
    const bb = wd.bbox;
    const ww = bb.x1 - bb.x0;
    const hh = bb.y1 - bb.y0;
    if (ww <= 0 || hh <= 0) continue;

    // Ignore large word boxes (likely sentence text).
    if (ww > 220 || hh > 90) continue;

    // Candidate if inside an expanded neighborhood around the diagram.
    const nearX = bb.x1 >= out.x0 - margin && bb.x0 <= out.x1 + margin;
    const nearY = bb.y1 >= out.y0 - margin && bb.y0 <= out.y1 + margin;
    if (!nearX || !nearY) continue;

    // Only pull in small labels that are close to the diagram edges.
    // This prevents absorbing nearby regular sentence text (which is near, but not on the axes).
    const nearLeftEdge = bb.x1 <= out.x0 + edgeBand;
    const nearRightEdge = bb.x0 >= out.x1 - edgeBand;
    const nearTopEdge = bb.y1 <= out.y0 + edgeBand;
    const nearBottomEdge = bb.y0 >= out.y1 - edgeBand;
    if (!nearLeftEdge && !nearRightEdge && !nearTopEdge && !nearBottomEdge) continue;

    out = bboxUnion(out, expandBbox(bb, 10, w, h));
  }

  return out;
}

function expandBbox(b: Bbox, pad: number, w: number, h: number): Bbox {
  return {
    // Treat x1/y1 as exclusive bounds for cropping.
    x0: clamp(Math.floor(b.x0 - pad), 0, w - 1),
    y0: clamp(Math.floor(b.y0 - pad), 0, h - 1),
    x1: clamp(Math.ceil(b.x1 + pad), 1, w),
    y1: clamp(Math.ceil(b.y1 + pad), 1, h),
  };
}

function overlapsY(b: Bbox, y0: number, y1: number): number {
  const a0 = b.y0;
  const a1 = b.y1;
  const inter = Math.max(0, Math.min(a1, y1) - Math.max(a0, y0));
  const denom = Math.max(1, a1 - a0);
  return inter / denom;
}

function clampBboxAwayFromSentenceLines(b: Bbox, lines: TesseractLine[], imgW: number, imgH: number): Bbox {
  // Prevent pulling full sentence lines into the diagram crop (common with graphs in between paragraphs).
  // Heuristic: sentence lines are wide, relatively short, and overlap the candidate bbox.
  let out: Bbox = { ...b };

  const maxLineH = Math.max(18, imgH * 0.12);
  const minLineW = imgW * 0.55;
  const pad = 6;

  for (const l of lines) {
    const lb = l.bbox;
    const lw = lb.x1 - lb.x0;
    const lh = lb.y1 - lb.y0;
    if (lw <= 0 || lh <= 0) continue;
    if (lw < minLineW) continue;
    if (lh > maxLineH) continue;

    const interY = Math.max(0, Math.min(out.y1, lb.y1) - Math.max(out.y0, lb.y0));
    if (interY <= 0) continue;

    // If the bbox overlaps a sentence line, clamp away from it.
    const midB = (out.y0 + out.y1) / 2;
    const midL = (lb.y0 + lb.y1) / 2;

    // Sentence line below diagram => clamp bottom up.
    if (midL > midB && lb.y0 < out.y1) {
      out.y1 = Math.min(out.y1, Math.max(out.y0 + 1, lb.y0 - pad));
      continue;
    }

    // Sentence line above diagram => clamp top down.
    if (midL < midB && lb.y1 > out.y0) {
      out.y0 = Math.max(out.y0, Math.min(out.y1 - 1, lb.y1 + pad));
    }
  }

  // Keep within image bounds.
  out.y0 = clamp(out.y0, 0, Math.max(0, imgH - 1));
  out.y1 = clamp(out.y1, 1, imgH);
  if (out.y1 <= out.y0) out.y1 = Math.min(imgH, out.y0 + 1);
  return out;
}

function buildOptionVerticalRanges(lines: TesseractLine[], imgH: number): Array<{ label: string; y0: number; y1: number }> {
  const markers = lines
    .map((l) => ({ label: matchOptionLabel(l.text) ?? matchStandaloneOptionLabel(l.text), bbox: l.bbox }))
    .filter((x): x is { label: string; bbox: Bbox } => !!x.label)
    .sort((a, b) => a.bbox.y0 - b.bbox.y0);

  // De-dup labels (keep first occurrence by y)
  const uniq: Array<{ label: string; bbox: Bbox }> = [];
  const seen = new Set<string>();
  for (const m of markers) {
    if (seen.has(m.label)) continue;
    seen.add(m.label);
    uniq.push(m);
  }

  const out: Array<{ label: string; y0: number; y1: number }> = [];
  for (let i = 0; i < uniq.length; i++) {
    const cur = uniq[i];
    const next = uniq[i + 1];
    out.push({
      label: cur.label,
      y0: clamp(cur.bbox.y0 - 4, 0, imgH),
      y1: clamp((next ? next.bbox.y0 : imgH) + 2, 0, imgH),
    });
  }
  return out;
}

function detectCandidateBboxes(
  img: ImageData,
  words: TesseractWord[],
  opts: {
    downsample: number;
    inkLum: number;
    subtractWords: boolean;
    wordPad: number;
    mergeDist: number;
    minAreaRatio: number;
    minW: number;
    minH: number;
  }
): Bbox[] {
  const ds = Math.max(1, Math.floor(opts.downsample));
  const mask = componentMaskFromImage(img, { downsample: ds, inkLum: opts.inkLum });

  if (opts.subtractWords) {
    for (const w of words) {
      const b = expandBbox(w.bbox, opts.wordPad, img.width, img.height);
      clearMaskInBbox(mask, b, ds);
    }
  }

  let comps = findConnectedComponents(mask);
  comps = comps.map((b) => ({ x0: b.x0 * ds, y0: b.y0 * ds, x1: b.x1 * ds, y1: b.y1 * ds }));
  comps = mergeNearbyBoxes(comps, opts.mergeDist);

  const minArea = Math.max(6000, img.width * img.height * opts.minAreaRatio);
  return comps
    .map((b) => expandBbox(b, 18, img.width, img.height))
    .filter((b) => bboxArea(b) >= minArea)
    .filter((b) => (b.x1 - b.x0) >= opts.minW && (b.y1 - b.y0) >= opts.minH)
    .filter((b) => (b.x1 - b.x0) <= img.width * 0.95 && (b.y1 - b.y0) <= img.height * 0.95);
}

function componentMaskFromImage(img: ImageData, opts: { downsample: number; inkLum: number }): { w: number; h: number; data: Uint8Array } {
  const ds = Math.max(1, Math.floor(opts.downsample));
  const w = Math.max(1, Math.floor(img.width / ds));
  const h = Math.max(1, Math.floor(img.height / ds));
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x * ds;
      const sy = y * ds;
      const idx = (sy * img.width + sx) * 4;
      const lum = pixelLum(img.data[idx], img.data[idx + 1], img.data[idx + 2]);
      out[y * w + x] = lum < opts.inkLum ? 1 : 0;
    }
  }

  return { w, h, data: out };
}

function clearMaskInBbox(mask: { w: number; h: number; data: Uint8Array }, bbox: Bbox, ds: number): void {
  const x0 = clamp(Math.floor(bbox.x0 / ds), 0, mask.w - 1);
  const x1 = clamp(Math.ceil(bbox.x1 / ds), 0, mask.w - 1);
  const y0 = clamp(Math.floor(bbox.y0 / ds), 0, mask.h - 1);
  const y1 = clamp(Math.ceil(bbox.y1 / ds), 0, mask.h - 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      mask.data[y * mask.w + x] = 0;
    }
  }
}

function findConnectedComponents(mask: { w: number; h: number; data: Uint8Array }): Bbox[] {
  const { w, h, data } = mask;
  const visited = new Uint8Array(w * h);
  const comps: Bbox[] = [];

  const qx: number[] = [];
  const qy: number[] = [];

  const push = (x: number, y: number) => {
    qx.push(x);
    qy.push(y);
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!data[i] || visited[i]) continue;

      visited[i] = 1;
      push(x, y);

      let x0 = x;
      let x1 = x;
      let y0 = y;
      let y1 = y;
      let count = 0;

      while (qx.length) {
        const cx = qx.pop() as number;
        const cy = qy.pop() as number;
        count += 1;
        x0 = Math.min(x0, cx);
        x1 = Math.max(x1, cx);
        y0 = Math.min(y0, cy);
        y1 = Math.max(y1, cy);

        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (!data[ni] || visited[ni]) continue;
          visited[ni] = 1;
          push(nx, ny);
        }
      }

      // Filter tiny components early.
      if (count < 25) continue;
      comps.push({ x0, y0, x1, y1 });
    }
  }

  return comps;
}

function mergeNearbyBoxes(boxes: Bbox[], dist: number): Bbox[] {
  const out: Bbox[] = [];
  const used = new Array(boxes.length).fill(false);

  const near = (a: Bbox, b: Bbox) => {
    const ax0 = a.x0;
    const ax1 = a.x1;
    const ay0 = a.y0;
    const ay1 = a.y1;
    const bx0 = b.x0;
    const bx1 = b.x1;
    const by0 = b.y0;
    const by1 = b.y1;

    const dx = Math.max(0, Math.max(bx0 - ax1, ax0 - bx1));
    const dy = Math.max(0, Math.max(by0 - ay1, ay0 - by1));
    return dx <= dist && dy <= dist;
  };

  for (let i = 0; i < boxes.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let cur = boxes[i];
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < boxes.length; j++) {
        if (used[j]) continue;
        if (near(cur, boxes[j])) {
          used[j] = true;
          cur = bboxUnion(cur, boxes[j]);
          changed = true;
        }
      }
    }
    out.push(cur);
  }

  return out;
}

async function cropToDataUrl(img: ImageData, bbox: Bbox): Promise<string> {
  const w = Math.max(1, Math.ceil(bbox.x1 - bbox.x0));
  const h = Math.max(1, Math.ceil(bbox.y1 - bbox.y0));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const sub = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcX = clamp(Math.floor(bbox.x0 + x), 0, img.width - 1);
      const srcY = clamp(Math.floor(bbox.y0 + y), 0, img.height - 1);
      const srcIdx = (srcY * img.width + srcX) * 4;
      const dstIdx = (y * w + x) * 4;
      sub.data[dstIdx] = img.data[srcIdx];
      sub.data[dstIdx + 1] = img.data[srcIdx + 1];
      sub.data[dstIdx + 2] = img.data[srcIdx + 2];
      sub.data[dstIdx + 3] = img.data[srcIdx + 3];
    }
  }

  ctx.putImageData(sub, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function autoAttachImagesFromTesseract(raw: unknown, img: ImageData): Promise<AutoAttachmentResult> {
  const r = raw as TesseractRaw;
  const words = (r?.data?.words ?? []) as TesseractWord[];
  const lines = (r?.data?.lines ?? []) as TesseractLine[];

  if (!words.length || !lines.length) {
    return { questionImages: [], optionImagesByLabel: {}, imageBboxes: [] };
  }

  // Pass 1: subtract word boxes from the ink mask (works well for pure diagrams with little/no text).
  let filtered = detectCandidateBboxes(img, words, {
    downsample: 3,
    inkLum: 225,
    subtractWords: true,
    wordPad: 6,
    mergeDist: 26,
    minAreaRatio: 0.004,
    minW: 55,
    minH: 40,
  });

  // Pass 2 (fallback): do NOT subtract words. This preserves labeled graphs (axes labels, P1/P2 etc).
  // We then filter candidates by how much of their area is covered by word boxes.
  if (!filtered.length) {
    const candidates = detectCandidateBboxes(img, words, {
      downsample: 2,
      inkLum: 235,
      subtractWords: false,
      wordPad: 0,
      mergeDist: 30,
      minAreaRatio: 0.003,
      minW: 65,
      minH: 50,
    });

    filtered = candidates.filter((b) => {
      const area = Math.max(1, bboxArea(b));
      let covered = 0;
      for (const w of words) {
        covered += bboxIntersectArea(b, w.bbox);
      }
      const ratio = covered / area;
      // Allow some text inside (labels), but reject mostly-text blocks.
      return ratio <= 0.55;
    });
  }

  if (!filtered.length) {
    return { questionImages: [], optionImagesByLabel: {}, imageBboxes: [] };
  }

  const optionRanges = buildOptionVerticalRanges(lines, img.height);
  const firstOptY0 = optionRanges.length ? optionRanges[0].y0 : img.height;

  const questionImages: string[] = [];
  const optionImagesByLabel: Record<string, string[]> = {};

  const finalBboxes: Bbox[] = [];

  for (const b of filtered) {
    let b2 = expandBboxToIncludeNearbyWords(b, words, img.width, img.height);
    b2 = clampBboxAwayFromSentenceLines(b2, lines, img.width, img.height);

    // Assign by vertical overlap with option ranges.
    let bestLabel: string | null = null;
    let bestScore = 0;
    for (const r0 of optionRanges) {
      const sc = overlapsY(b2, r0.y0, r0.y1);
      if (sc > bestScore) {
        bestScore = sc;
        bestLabel = r0.label;
      }
    }

    const url = await cropToDataUrl(img, b2);
    if (!url) continue;

    finalBboxes.push(b2);

    // Otherwise: if it lies above first option, treat as question image.
    const aboveOptions = b2.y1 <= firstOptY0 + 6;
    if (aboveOptions) {
      questionImages.push(url);
      continue;
    }

    // Fallback: attach to question if uncertain.
    questionImages.push(url);
  }

  return { questionImages, optionImagesByLabel, imageBboxes: finalBboxes.length ? finalBboxes : filtered };
}
