import { useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Point = { x: number; y: number };

type PolylinePlot = {
  kind: 'polyline';
  points: Point[];
  stroke: string;
  strokeWidth: number;
};

type FunctionPlot = {
  kind: 'function';
  fn: (x: number) => number;
  stroke: string;
  strokeWidth: number;
  yClip?: number;
};

type PolygonPlot = {
  kind: 'polygon';
  points: Point[];
  fill: string;
  fillOpacity: number;
  stroke?: string;
  strokeWidth?: number;
};

type LabelPlot = {
  kind: 'label';
  at: Point;
  text: string;
  fill?: string;
  fontSize?: number;
  anchor?: 'start' | 'middle' | 'end';
};

type PointPlot = {
  kind: 'point';
  at: Point;
  r?: number;
  fill: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
};

type GraphSpec = {
  width: number;
  height: number;
  window: { xMin: number; xMax: number; yMin: number; yMax: number };
  equalAspect?: boolean;
  axisLabelX?: string;
  axisLabelY?: string;
  caption?: string;
  plot: Array<PolylinePlot | PolygonPlot | LabelPlot | PointPlot | FunctionPlot>;
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function niceStep(range: number) {
  const targetTicks = 10;
  const raw = Math.abs(range) / targetTicks;
  if (!isFinite(raw) || raw <= 0) return 1;

  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const base = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return base * pow;
}

export default function InteractiveGraph(props: {
  spec: GraphSpec;
  altText: string;
}) {
  const { spec } = props;

  const padL = 48;
  const padR = 18;
  const padT = 18;
  const padB = 44;

  const innerW = spec.width - padL - padR;
  const innerH = spec.height - padT - padB;

  const normalizeView = (v: { xMin: number; xMax: number; yMin: number; yMax: number }) => {
    if (!spec.equalAspect) return v;

    const xRange = v.xMax - v.xMin;
    const yRange = v.yMax - v.yMin;
    if (!isFinite(xRange) || !isFinite(yRange) || xRange <= 0 || yRange <= 0) return v;

    const unitsPerPx = Math.max(xRange / innerW, yRange / innerH);
    const xAdj = unitsPerPx * innerW;
    const yAdj = unitsPerPx * innerH;
    const cx = (v.xMin + v.xMax) / 2;
    const cy = (v.yMin + v.yMax) / 2;
    return { xMin: cx - xAdj / 2, xMax: cx + xAdj / 2, yMin: cy - yAdj / 2, yMax: cy + yAdj / 2 };
  };

  const [view, setView] = useState(() => normalizeView(spec.window));
  const [drag, setDrag] = useState<null | {
    pointerId: number;
    startClient: { x: number; y: number };
    startView: { xMin: number; xMax: number; yMin: number; yMax: number };
  }>(null);

  const [cursorWorld, setCursorWorld] = useState<null | { x: number; y: number }>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const renderView = useMemo(() => normalizeView(view), [view]);

  const sx = (x: number) => padL + ((x - renderView.xMin) / (renderView.xMax - renderView.xMin)) * innerW;
  const sy = (y: number) => padT + (1 - (y - renderView.yMin) / (renderView.yMax - renderView.yMin)) * innerH;

  const invX = (px: number) => renderView.xMin + ((px - padL) / innerW) * (renderView.xMax - renderView.xMin);
  const invY = (py: number) => renderView.yMin + (1 - (py - padT) / innerH) * (renderView.yMax - renderView.yMin);

  const xStep = useMemo(() => niceStep(renderView.xMax - renderView.xMin), [renderView.xMax, renderView.xMin]);
  const yStep = useMemo(() => niceStep(renderView.yMax - renderView.yMin), [renderView.yMax, renderView.yMin]);

  const axisColor = '#111827';
  const gridColor = '#e5e7eb';
  const labelColor = '#111827';

  const grid = useMemo(() => {
    const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number }> = [];
    const labels: Array<{ key: string; x: number; y: number; text: string; anchor: 'start' | 'end' | 'middle' }> = [];

    const xStart = Math.ceil(renderView.xMin / xStep) * xStep;
    const xEnd = Math.floor(renderView.xMax / xStep) * xStep;
    for (let x = xStart; x <= xEnd + 1e-9; x += xStep) {
      const px = sx(x);
      lines.push({ key: `gx-${x}`, x1: px, y1: padT, x2: px, y2: padT + innerH, stroke: gridColor, strokeWidth: 1 });
      if (Math.abs(x) > 1e-9) {
        labels.push({ key: `xl-${x}`, x: px, y: padT + innerH + 18, text: String(Number(x.toFixed(6))), anchor: 'middle' });
      }
    }

    const yStart = Math.ceil(renderView.yMin / yStep) * yStep;
    const yEnd = Math.floor(renderView.yMax / yStep) * yStep;
    for (let y = yStart; y <= yEnd + 1e-9; y += yStep) {
      const py = sy(y);
      lines.push({ key: `gy-${y}`, x1: padL, y1: py, x2: padL + innerW, y2: py, stroke: gridColor, strokeWidth: 1 });
      if (Math.abs(y) > 1e-9) {
        labels.push({ key: `yl-${y}`, x: padL - 10, y: py + 4, text: String(Number(y.toFixed(6))), anchor: 'end' });
      }
    }

    return { lines, labels };
  }, [innerH, innerW, padL, padT, renderView.xMax, renderView.xMin, renderView.yMax, renderView.yMin, sx, sy, xStep, yStep]);

  const axes = useMemo(() => {
    const x0 = clamp(0, renderView.xMin, renderView.xMax);
    const y0 = clamp(0, renderView.yMin, renderView.yMax);
    const xAxisY = sy(y0);
    const yAxisX = sx(x0);

    const ticks: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = [];

    const xStart = Math.ceil(renderView.xMin / xStep) * xStep;
    const xEnd = Math.floor(renderView.xMax / xStep) * xStep;
    for (let x = xStart; x <= xEnd + 1e-9; x += xStep) {
      const px = sx(x);
      ticks.push({ key: `xt-${x}`, x1: px, y1: xAxisY - 4, x2: px, y2: xAxisY + 4 });
    }

    const yStart = Math.ceil(renderView.yMin / yStep) * yStep;
    const yEnd = Math.floor(renderView.yMax / yStep) * yStep;
    for (let y = yStart; y <= yEnd + 1e-9; y += yStep) {
      const py = sy(y);
      ticks.push({ key: `yt-${y}`, x1: yAxisX - 4, y1: py, x2: yAxisX + 4, y2: py });
    }

    return { xAxisY, yAxisX, ticks };
  }, [renderView.xMax, renderView.xMin, renderView.yMax, renderView.yMin, sx, sy, xStep, yStep]);

  const plotElements = useMemo(() => {
    const elements: Array<
      | { key: string; kind: 'polyline'; points: string; stroke: string; strokeWidth: number }
      | { key: string; kind: 'polygon'; points: string; fill: string; fillOpacity: number; stroke?: string; strokeWidth?: number }
      | { key: string; kind: 'label'; x: number; y: number; html: string; fill: string; fontSize: number; anchor: 'start' | 'middle' | 'end' }
      | { key: string; kind: 'point'; cx: number; cy: number; r: number; fill: string; fillOpacity: number; stroke?: string; strokeWidth?: number }
    > = [];

    const worldRangeY = renderView.yMax - renderView.yMin;

    const sampleFunctionSegments = (input: {
      fn: (x: number) => number;
      xMin: number;
      xMax: number;
      yClip: number;
      n: number;
    }) => {
      const { fn, xMin, xMax, yClip, n } = input;
      const segs: Array<Array<{ x: number; y: number }>> = [];
      let seg: Array<{ x: number; y: number }> = [];
      let prevY: number | null = null;
      const jumpClip = Math.max(10, worldRangeY * 2);

      for (let i = 0; i <= n; i++) {
        const x = xMin + (i / n) * (xMax - xMin);
        const y = fn(x);

        if (!isFinite(y) || Math.abs(y) > yClip) {
          if (seg.length >= 2) segs.push(seg);
          seg = [];
          prevY = null;
          continue;
        }

        if (prevY !== null && Math.abs(y - prevY) > jumpClip) {
          if (seg.length >= 2) segs.push(seg);
          seg = [];
          prevY = y;
          seg.push({ x, y });
          continue;
        }

        prevY = y;
        seg.push({ x, y });
      }

      if (seg.length >= 2) segs.push(seg);
      return segs;
    };

    for (let i = 0; i < spec.plot.length; i++) {
      const p = spec.plot[i];

      if (p.kind === 'label') {
        const fontSize = p.fontSize ?? 12;
        const html = katex.renderToString(p.text, {
          throwOnError: false,
          displayMode: false,
          strict: 'ignore',
        });

        elements.push({
          key: `lab-${i}`,
          kind: 'label',
          x: sx(p.at.x),
          y: sy(p.at.y),
          html,
          fill: p.fill ?? '#111827',
          fontSize,
          anchor: p.anchor ?? 'start',
        });
        continue;
      }

      if (p.kind === 'point') {
        elements.push({
          key: `pt-${i}`,
          kind: 'point',
          cx: sx(p.at.x),
          cy: sy(p.at.y),
          r: p.r ?? 5,
          fill: p.fill,
          fillOpacity: p.fillOpacity ?? 1,
          stroke: p.stroke,
          strokeWidth: p.strokeWidth,
        });
        continue;
      }

      if (p.kind === 'function') {
        const n = Math.min(2400, Math.max(600, Math.floor(innerW * 2)));
        const yClip = p.yClip ?? Math.max(10, Math.max(Math.abs(renderView.yMin), Math.abs(renderView.yMax)) * 4);
        const xRange = renderView.xMax - renderView.xMin;
        const padX = isFinite(xRange) && xRange > 0 ? xRange * 0.08 : 0;
        const segs = sampleFunctionSegments({
          fn: p.fn,
          xMin: renderView.xMin - padX,
          xMax: renderView.xMax + padX,
          yClip,
          n,
        });

        segs.forEach((seg, j) => {
          const pts = seg.map((pt) => `${sx(pt.x).toFixed(2)},${sy(pt.y).toFixed(2)}`).join(' ');
          elements.push({
            key: `fn-${i}-${j}`,
            kind: 'polyline',
            points: pts,
            stroke: p.stroke,
            strokeWidth: p.strokeWidth,
          });
        });
        continue;
      }

      const pts = p.points.map((pt) => `${sx(pt.x).toFixed(2)},${sy(pt.y).toFixed(2)}`).join(' ');

      if (p.kind === 'polygon') {
        elements.push({
          key: `poly-${i}`,
          kind: 'polygon',
          points: pts,
          fill: p.fill,
          fillOpacity: p.fillOpacity,
          stroke: p.stroke,
          strokeWidth: p.strokeWidth,
        });
        continue;
      }

      elements.push({
        key: `line-${i}`,
        kind: 'polyline',
        points: pts,
        stroke: p.stroke,
        strokeWidth: p.strokeWidth,
      });
    }

    return elements;
  }, [innerW, renderView.xMax, renderView.xMin, renderView.yMax, renderView.yMin, spec.plot, sx, sy]);

  const setCursorFromEvent = (e: { clientX: number; clientY: number }) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;

    if (px < padL || px > padL + innerW || py < padT || py > padT + innerH) {
      setCursorWorld(null);
      return;
    }

    setCursorWorld({ x: invX(px), y: invY(py) });
  };

  const zoomAtCenter = (factor: number) => {
    setView((v) => {
      const cx = (v.xMin + v.xMax) / 2;
      const cy = (v.yMin + v.yMax) / 2;
      const hw = ((v.xMax - v.xMin) / 2) * factor;
      const hh = ((v.yMax - v.yMin) / 2) * factor;
      return normalizeView({ xMin: cx - hw, xMax: cx + hw, yMin: cy - hh, yMax: cy + hh });
    });
  };

  const cursorLabel = cursorWorld ? `(${cursorWorld.x.toFixed(2)}, ${cursorWorld.y.toFixed(2)})` : null;

  const axisLabelX = spec.axisLabelX ?? 'x';
  const axisLabelY = spec.axisLabelY ?? 'y';

  return (
    <div className="w-full">
      <div className="flex justify-center">
        <svg
          ref={svgRef}
          width={spec.width}
          height={spec.height}
          viewBox={`0 0 ${spec.width} ${spec.height}`}
          role="img"
          aria-label={props.altText}
          className="max-w-full h-auto rounded-md border bg-white touch-none select-none"
          onPointerDown={(e) => {
            const el = svgRef.current;
            if (!el) return;
            el.setPointerCapture(e.pointerId);
            setDrag({
              pointerId: e.pointerId,
              startClient: { x: e.clientX, y: e.clientY },
              startView: view,
            });
            setCursorFromEvent(e);
          }}
          onPointerMove={(e) => {
            if (drag && drag.pointerId === e.pointerId) {
              const dxPx = e.clientX - drag.startClient.x;
              const dyPx = e.clientY - drag.startClient.y;

              const dxWorld = (-dxPx / innerW) * (drag.startView.xMax - drag.startView.xMin);
              const dyWorld = (dyPx / innerH) * (drag.startView.yMax - drag.startView.yMin);

              setView(normalizeView({
                xMin: drag.startView.xMin + dxWorld,
                xMax: drag.startView.xMax + dxWorld,
                yMin: drag.startView.yMin + dyWorld,
                yMax: drag.startView.yMax + dyWorld,
              }));
              setCursorFromEvent(e);
              return;
            }
            setCursorFromEvent(e);
          }}
          onPointerUp={(e) => {
            if (drag && drag.pointerId === e.pointerId) {
              setDrag(null);
            }
          }}
          onPointerCancel={(e) => {
            if (drag && drag.pointerId === e.pointerId) {
              setDrag(null);
            }
          }}
          onPointerLeave={() => setCursorWorld(null)}
        >
          <rect x="0" y="0" width={spec.width} height={spec.height} fill="#ffffff" />

          {grid.lines.map((l) => (
            <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.stroke} strokeWidth={l.strokeWidth} />
          ))}

          <line x1={padL} y1={axes.xAxisY} x2={padL + innerW} y2={axes.xAxisY} stroke={axisColor} strokeWidth={2} />
          <line x1={axes.yAxisX} y1={padT} x2={axes.yAxisX} y2={padT + innerH} stroke={axisColor} strokeWidth={2} />

          {axes.ticks.map((t) => (
            <line key={t.key} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={axisColor} strokeWidth={1} />
          ))}

          {grid.labels.map((lab) => (
            <text key={lab.key} x={lab.x} y={lab.y} textAnchor={lab.anchor} fontSize={12} fill={labelColor}>
              {lab.text}
            </text>
          ))}

          <text x={padL + innerW} y={axes.xAxisY - 8} textAnchor="end" fontSize={12} fill={labelColor}>
            {axisLabelX}
          </text>
          <text x={axes.yAxisX + 8} y={padT + 14} textAnchor="start" fontSize={12} fill={labelColor}>
            {axisLabelY}
          </text>

          {plotElements.map((p) =>
            p.kind === 'polygon' ? (
              <polygon
                key={p.key}
                points={p.points}
                fill={p.fill}
                fillOpacity={p.fillOpacity}
                stroke={p.stroke}
                strokeWidth={p.strokeWidth}
              />
            ) : p.kind === 'point' ? (
              <circle
                key={p.key}
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill={p.fill}
                fillOpacity={p.fillOpacity}
                stroke={p.stroke}
                strokeWidth={p.strokeWidth}
              />
            ) : p.kind === 'label' ? (
              (() => {
                const boxW = 260;
                const boxH = 34;
                const x = p.anchor === 'middle' ? p.x - boxW / 2 : p.anchor === 'end' ? p.x - boxW : p.x;
                const y = p.y - boxH + 8;
                return (
                  <foreignObject key={p.key} x={x} y={y} width={boxW} height={boxH} overflow="visible">
                    <div
                      style={{
                        display: 'inline-block',
                        color: p.fill,
                        fontSize: `${p.fontSize}px`,
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                      }}
                      dangerouslySetInnerHTML={{ __html: p.html }}
                    />
                  </foreignObject>
                );
              })()
            ) : (
              <polyline key={p.key} fill="none" stroke={p.stroke} strokeWidth={p.strokeWidth} points={p.points} />
            )
          )}

          {cursorWorld ? (
            <g>
              <circle cx={sx(cursorWorld.x)} cy={sy(cursorWorld.y)} r={4} fill="#111827" opacity={0.65} />
            </g>
          ) : null}

          {cursorWorld && cursorLabel ? (() => {
            const px = sx(cursorWorld.x);
            const py = sy(cursorWorld.y);

            const padX = 6;
            const boxH = 18;
            const approxCharW = 7;
            const boxW = cursorLabel.length * approxCharW + padX * 2;

            const x = clamp(px - boxW / 2, padL, padL + innerW - boxW);
            const y = clamp(py - 26, padT, padT + innerH - boxH);

            return (
              <g>
                <rect x={x} y={y} width={boxW} height={boxH} rx={6} ry={6} fill="#111827" opacity={0.85} />
                <text x={x + padX} y={y + 13} textAnchor="start" fontSize={12} fill="#ffffff">
                  {cursorLabel}
                </text>
              </g>
            );
          })() : null}
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Zoom in" onClick={() => zoomAtCenter(0.8)}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="Zoom out" onClick={() => zoomAtCenter(1.25)}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="Reset" onClick={() => setView(spec.window)}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-2 text-sm text-center text-muted-foreground">
        Hover the graph to inspect coordinates. Drag to pan.
      </div>
    </div>
  );
}
