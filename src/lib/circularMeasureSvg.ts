export type CircularMeasureDiagramStyle = {
  stroke: string;
  strokeWidth: number;
  accent: string;
  accentSoft: string;
  text: string;
  fontFamily: string;
};

export type CircularMeasureDiagramInput = {
  width: number;
  height: number;
  radiusPx: number;
  thetaRad: number;
  showSectorFill?: boolean;
  showChord?: boolean;
  showMidpointChord?: boolean;
  labelR?: string;
  labelTheta?: string;
  labelArcS?: string;
  labelArea?: string;
  labelSegment?: string;
  shadeMode?: 'sector' | 'midpoint_shaded';
  style?: Partial<CircularMeasureDiagramStyle>;
  title?: string;
};

const DEFAULT_STYLE: CircularMeasureDiagramStyle = {
  stroke: '#0f172a',
  strokeWidth: 2,
  accent: '#2563eb',
  accentSoft: 'rgba(37, 99, 235, 0.12)',
  text: '#0f172a',
  fontFamily: 'KaTeX_Main, KaTeX_Math, KaTeX_AMS, Times New Roman, serif',
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function polar(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy - r * Math.sin(angleRad) };
}

function arcPath(cx: number, cy: number, r: number, startRad: number, endRad: number) {
  const a0 = startRad;
  const a1 = endRad;
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const delta = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const largeArc = delta > Math.PI ? 1 : 0;
  const sweep = 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} ${sweep} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

function sectorPath(cx: number, cy: number, r: number, startRad: number, endRad: number) {
  const p0 = polar(cx, cy, r, startRad);
  const p1 = polar(cx, cy, r, endRad);
  const delta = ((endRad - startRad) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const largeArc = delta > Math.PI ? 1 : 0;
  const sweep = 0;
  return `M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} ${sweep} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildCircularMeasureDiagramSvg(input: CircularMeasureDiagramInput): { svg: string; altText: string } {
  const style: CircularMeasureDiagramStyle = { ...DEFAULT_STYLE, ...(input.style ?? {}) };

  const width = input.width;
  const height = input.height;

  const cx = width / 2;
  const cy = height / 2;

  const theta = clamp(input.thetaRad, 0.15, Math.PI * 1.7);

  const a0 = 0;
  const a1 = theta;

  const r = clamp(input.radiusPx, 40, Math.min(width, height) * 0.42);

  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);

  const mid0 = polar(cx, cy, r * 0.5, a0);
  const mid1 = polar(cx, cy, r * 0.5, a1);

  const angleArcR = Math.max(18, Math.min(32, r * 0.18));
  const angleArc = arcPath(cx, cy, angleArcR, a0, a1);

  const mid = (a0 + a1) / 2;

  const labelOffset = 14;
  const rLabelPos = polar(cx, cy, r * 0.62, mid);
  const thetaLabelPos = polar(cx, cy, angleArcR + labelOffset, mid);

  const arcLabelPos = polar(cx, cy, r + 18, mid);

  const chord = input.showChord ? `<line x1="${p0.x.toFixed(2)}" y1="${p0.y.toFixed(2)}" x2="${p1.x.toFixed(2)}" y2="${p1.y.toFixed(2)}" stroke="${style.accent}" stroke-width="${style.strokeWidth}" />` : '';

  const midpointChord = input.showMidpointChord
    ? `<line x1="${mid0.x.toFixed(2)}" y1="${mid0.y.toFixed(2)}" x2="${mid1.x.toFixed(2)}" y2="${mid1.y.toFixed(2)}" stroke="${style.accent}" stroke-width="${style.strokeWidth}" />`
    : '';

  const sectorD = sectorPath(cx, cy, r, a0, a1);

  const triangleD = `M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${mid0.x.toFixed(2)} ${mid0.y.toFixed(2)} L ${mid1.x.toFixed(2)} ${mid1.y.toFixed(2)} Z`;
  const fillSector = input.showSectorFill
    ? (input.shadeMode === 'midpoint_shaded'
      ? `
  <defs>
    <mask id="cm-mid-mask">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
      <path d="${triangleD}" fill="#000000" />
    </mask>
  </defs>
  <path d="${sectorD}" fill="${style.accentSoft}" stroke="none" mask="url(#cm-mid-mask)" />`
      : `<path d="${sectorD}" fill="${style.accentSoft}" stroke="none" />`)
    : '';

  const title = input.title
    ? `<text x="${(width / 2).toFixed(2)}" y="22" text-anchor="middle" font-size="14" font-weight="600" fill="${style.text}" font-family="${esc(style.fontFamily)}" stroke="#ffffff" stroke-width="5" paint-order="stroke fill" stroke-linejoin="round">${esc(input.title)}</text>`
    : '';

  const rLabel = input.labelR
    ? `<text x="${rLabelPos.x.toFixed(2)}" y="${rLabelPos.y.toFixed(2)}" text-anchor="middle" font-size="15" font-weight="500" fill="${style.text}" font-family="${esc(style.fontFamily)}" stroke="#ffffff" stroke-width="5" paint-order="stroke fill" stroke-linejoin="round">${esc(input.labelR)}</text>`
    : '';

  const thetaLabel = input.labelTheta
    ? `<text x="${thetaLabelPos.x.toFixed(2)}" y="${thetaLabelPos.y.toFixed(2)}" text-anchor="middle" font-size="15" font-weight="500" fill="${style.text}" font-family="${esc(style.fontFamily)}" stroke="#ffffff" stroke-width="5" paint-order="stroke fill" stroke-linejoin="round">${esc(input.labelTheta)}</text>`
    : '';

  const arcLabel = input.labelArcS
    ? `<text x="${arcLabelPos.x.toFixed(2)}" y="${arcLabelPos.y.toFixed(2)}" text-anchor="middle" font-size="15" font-weight="500" fill="${style.text}" font-family="${esc(style.fontFamily)}" stroke="#ffffff" stroke-width="5" paint-order="stroke fill" stroke-linejoin="round">${esc(input.labelArcS)}</text>`
    : '';

  const areaLabel = input.labelArea
    ? `<text x="${(width - 16).toFixed(2)}" y="${(height - 16).toFixed(2)}" text-anchor="end" font-size="13" font-weight="500" fill="${style.text}" font-family="${esc(style.fontFamily)}" stroke="#ffffff" stroke-width="5" paint-order="stroke fill" stroke-linejoin="round">${esc(input.labelArea)}</text>`
    : '';

  const segmentLabel = input.labelSegment
    ? `<text x="${(width - 16).toFixed(2)}" y="${(height - 16).toFixed(2)}" text-anchor="end" font-size="13" font-weight="500" fill="${style.text}" font-family="${esc(style.fontFamily)}" stroke="#ffffff" stroke-width="5" paint-order="stroke fill" stroke-linejoin="round">${esc(input.labelSegment)}</text>`
    : '';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  ${title}

  ${fillSector}

  <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="none" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" />

  <line x1="${cx.toFixed(2)}" y1="${cy.toFixed(2)}" x2="${p0.x.toFixed(2)}" y2="${p0.y.toFixed(2)}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" />
  <line x1="${cx.toFixed(2)}" y1="${cy.toFixed(2)}" x2="${p1.x.toFixed(2)}" y2="${p1.y.toFixed(2)}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" />

  ${chord}
  ${midpointChord}

  <path d="${arcPath(cx, cy, r, a0, a1)}" fill="none" stroke="${style.accent}" stroke-width="${style.strokeWidth + 1}" stroke-linecap="round" />

  <path d="${angleArc}" fill="none" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" stroke-linecap="round" />

  <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="3" fill="${style.stroke}" />

  ${rLabel}
  ${thetaLabel}
  ${arcLabel}
  ${areaLabel}
  ${segmentLabel}
</svg>`;

  const altText = input.title ?? 'Circular measure diagram showing a circle, two radii, and a central angle.';
  return { svg, altText };
}
