import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Katex } from '@/components/Katex';

type PromptBlock = { kind: 'text'; content: string } | { kind: 'math'; content: string };

type Props = {
  blocks: PromptBlock[];
  className?: string;
  textClassName?: string;
  align?: 'left' | 'center';
};

const MIN_SCALE = 0.86;

function shouldSoftBreak(prev: PromptBlock | undefined, next: PromptBlock | undefined): boolean {
  const prevText = prev?.kind === 'text' ? String(prev.content ?? '') : '';
  const nextText = next?.kind === 'text' ? String(next.content ?? '') : '';

  // Keep real newlines after sentence/section endings.
  if (/[.?!:]\s*$/.test(prevText)) return false;

  // If the next block looks like it continues the sentence, don't force a new line.
  // This targets cases like: "... x = 6" + "\n" + "meet at the point...".
  const nextTrim = nextText.trimStart();
  if (!nextTrim) return true;

  // Lowercase-start typically means continuation.
  if (/^[a-z]/.test(nextTrim)) return true;

  // Common continuation starters.
  if (/^(and|or|meet|meets|intersect|intersects|touch|touches|at|where|when|then|so)\b/i.test(nextTrim)) return true;

  return false;
}

export function PromptBlocksFlow({ blocks, className, textClassName, align = 'left' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fitRef = useRef<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState(1);

  const normalizedBlocks = useMemo(() => {
    const out: PromptBlock[] = [];
    for (let i = 0; i < (blocks ?? []).length; i++) {
      const b: any = (blocks as any)[i];
      if (!b) continue;
      const kind = b.kind === 'math' ? 'math' : 'text';
      out.push({ kind, content: String(b.content ?? '') } as any);
    }
    return out;
  }, [blocks]);

  const rendered = useMemo(() => {
    const out: any[] = [];
    for (let i = 0; i < normalizedBlocks.length; i++) {
      const b = normalizedBlocks[i];
      const content = String(b.content ?? '');

      if (b.kind === 'text' && content === '\n') {
        const prev = i > 0 ? normalizedBlocks[i - 1] : undefined;
        const next = i + 1 < normalizedBlocks.length ? normalizedBlocks[i + 1] : undefined;
        if (shouldSoftBreak(prev, next)) {
          out.push(<span key={`sp-${i}`}> </span>);
        } else {
          out.push(<span key={`br-${i}`} className="w-full h-0" />);
        }
        continue;
      }

      if (b.kind === 'math') {
        out.push(
          <span key={`m-${i}`} className="inline-flex items-baseline max-w-full min-w-0">
            <span className="align-baseline max-w-full">
              <Katex latex={content} displayMode={false} />
            </span>
          </span>
        );
        continue;
      }

      out.push(
        <span key={`t-${i}`} className="whitespace-normal">
          {content}
        </span>
      );
    }
    return out;
  }, [normalizedBlocks]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const fitEl = fitRef.current;
    if (!el || !fitEl) return;

    const compute = () => {
      fitEl.style.transform = 'scale(1)';
      setScale(1);

      const containerWidth = el.clientWidth;
      const contentWidth = fitEl.scrollWidth;
      if (!containerWidth || !contentWidth) return;

      if (contentWidth <= containerWidth) {
        setScale(1);
        return;
      }

      const nextScale = Math.min(1, containerWidth / contentWidth);
      if (nextScale >= MIN_SCALE) {
        setScale(nextScale);
      } else {
        setScale(1);
      }
    };

    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    return () => ro.disconnect();
  }, [rendered]);

  const alignClass = align === 'center' ? 'justify-center text-center' : 'justify-start text-left';
  const wrapperClass = `${textClassName ?? 'font-slab'} w-full min-w-0 max-w-full overflow-x-hidden whitespace-normal break-words ${className ?? ''}`;

  return (
    <div ref={containerRef} className={wrapperClass}>
      <span
        ref={fitRef}
        className={`inline-flex flex-wrap items-baseline gap-x-1 gap-y-1 ${alignClass} whitespace-normal`}
        style={scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: align === 'center' ? 'center top' : 'left top' } : undefined}
      >
        {rendered}
      </span>
    </div>
  );
}
