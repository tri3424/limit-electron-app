import katex from 'katex';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

type Props = {
  latex: string;
  displayMode?: boolean;
  className?: string;
};

const MIN_SCALE = 0.78;

function injectAllowBreaksForPolynomials(src: string): string {
  // KaTeX doesn't support arbitrary word-wrapping, so we insert TeX break opportunities.
  // This preserves mathematical tokens (operators remain operators) and avoids CSS-level breaks.
  // Only do this for display-style content; inline math should stay compact.
  return src
    // Provide break opportunities after + and - operators.
    // Use negative lookbehind to avoid changing exponent signs like x^{-2}.
    .replace(/(?<!\^)\s*\+\s*/g, ' \\allowbreak+ ')
    .replace(/(?<!\^)(?<!\{)\s*-\s*/g, ' \\allowbreak- ');
}

export function Katex({ latex, displayMode, className }: Props) {
  const containerRef = useRef<HTMLDivElement | HTMLSpanElement | null>(null);
  const fitRef = useRef<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState(1);
  const [useScrollFallback, setUseScrollFallback] = useState(false);

  const normalizedLatex = useMemo(() => {
    // Some generators/content can include unicode minus/dash characters.
    // Normalize them to ASCII '-' so KaTeX treats them as the standard operator.
    return String(latex ?? '').replace(/[−–]/g, '-');
  }, [latex]);

  const html = useMemo(() => {
    try {
      const shouldInjectAllowBreaks =
        !!displayMode
        && /[a-zA-Z0-9]/.test(normalizedLatex)
        && !normalizedLatex.includes('\\text')
        && !normalizedLatex.includes('\\begin{array}')
        && !normalizedLatex.includes('\\cline')
        && !normalizedLatex.includes('\\hline');
      const maybeWithBreaks = shouldInjectAllowBreaks
        ? injectAllowBreaksForPolynomials(normalizedLatex)
        : normalizedLatex;
      return katex.renderToString(maybeWithBreaks, {
        throwOnError: false,
        displayMode: !!displayMode,
        strict: 'warn',
        trust: false,
        output: 'htmlAndMathml',
        errorColor: '#cc0000',
      });
    } catch {
      return '';
    }
  }, [displayMode, normalizedLatex]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const fitEl = fitRef.current;
    if (!el || !fitEl) return;

    const compute = () => {
      // Reset first so we measure natural width.
      fitEl.style.transform = 'scale(1)';
      setScale(1);
      setUseScrollFallback(false);

      const containerWidth = el.clientWidth;
      const contentWidth = fitEl.scrollWidth;
      if (!containerWidth || !contentWidth) return;

      if (contentWidth <= containerWidth) {
        setScale(1);
        setUseScrollFallback(false);
        return;
      }

      const nextScale = Math.min(1, containerWidth / contentWidth);
      if (nextScale >= MIN_SCALE) {
        setScale(nextScale);
        setUseScrollFallback(false);
      } else {
        // If scaling would make it too small to read, allow a controlled scroll fallback.
        setScale(1);
        setUseScrollFallback(true);
      }
    };

    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    return () => ro.disconnect();
  }, [html]);

  const Wrapper: any = displayMode ? 'div' : 'span';
  const baseClass = displayMode ? 'tk-math-block' : 'tk-math-inline';
  const wrapperClass = `${baseClass}${useScrollFallback ? ' tk-math-scroll' : ''}${className ? ` ${className}` : ''}`;

  return (
    <Wrapper ref={containerRef} className={wrapperClass}>
      <span
        ref={fitRef}
        className="tk-math-fit"
        style={scale !== 1 ? { transform: `scale(${scale})` } : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Wrapper>
  );
}
