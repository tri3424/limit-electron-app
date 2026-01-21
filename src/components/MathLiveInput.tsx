import { useEffect, useMemo, useRef } from 'react';
import 'mathlive';

let mathliveOverlayObserverInstalled = false;

type Props = {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export default function MathLiveInput({ value, onChange, placeholder, className, disabled }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (mathliveOverlayObserverInstalled) return;
    if (typeof document === 'undefined') return;
    const body = document.body;
    if (!body) return;

    mathliveOverlayObserverInstalled = true;
    const hide = (node: Element) => {
      const el = node as HTMLElement;
      const cls = String((el as any).className ?? '');
      if (!cls.includes('ML__')) return;
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
    };

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of Array.from(m.addedNodes)) {
          if (!(n instanceof Element)) continue;
          hide(n);
          for (const child of Array.from(n.querySelectorAll?.("[class*='ML__']") ?? [])) {
            hide(child);
          }
        }
      }
    });

    obs.observe(body, { childList: true, subtree: true });
    for (const el of Array.from(body.querySelectorAll("[class*='ML__']"))) {
      hide(el);
    }
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === '\\') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onPasteCapture = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') ?? '';
      if (text.includes('\\')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    wrapper.addEventListener('keydown', onKeyDownCapture, true);
    wrapper.addEventListener('paste', onPasteCapture, true);
    return () => {
      wrapper.removeEventListener('keydown', onKeyDownCapture, true);
      wrapper.removeEventListener('paste', onPasteCapture, true);
    };
  }, []);

  // Stable listener ref so we can remove it.
  const listener = useMemo(
    () =>
      () => {
        const el = ref.current as any;
        if (!el) return;
        const next = String(el.value ?? '');
        onChange(next);
      },
    [onChange]
  );

  useEffect(() => {
    const el = ref.current as any;
    if (!el) return;

    el.readOnly = !!disabled;
    if (typeof placeholder === 'string') {
      el.placeholder = placeholder;
    }

    el.popoverPolicy = 'off';
    el.mathVirtualKeyboardPolicy = 'off';

    // Keep the field controlled.
    const current = String(el.value ?? '');
    const next = String(value ?? '');
    if (current !== next) {
      el.value = next;
    }

    el.addEventListener('input', listener);
    el.addEventListener('change', listener);
    return () => {
      el.removeEventListener('input', listener);
      el.removeEventListener('change', listener);
    };
  }, [disabled, listener, placeholder, value]);

  return (
    <div
      ref={wrapperRef}
      className={`w-full rounded-lg border border-border/85 bg-background px-3 py-1.5 shadow-sm hover:border-border focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/40 focus-within:border-ring/70 ${className ?? ''}`}
      style={{ minHeight: 40, height: 'auto' }}
    >
      <math-field
        className="tk-expr-input"
        ref={(node) => {
          ref.current = node as unknown as HTMLElement;
        }}
        virtual-keyboard-mode="off"
        smart-fence
        readOnly={!!disabled}
        style={{ display: 'block', width: '100%' }}
      />
    </div>
  );
}
