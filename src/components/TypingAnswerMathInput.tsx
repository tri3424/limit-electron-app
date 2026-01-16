import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  enableScripts?: boolean;
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isDescendant(parent: Node | null, child: Node | null) {
  if (!parent || !child) return false;
  let node: Node | null = child;
  while (node) {
    if (node === parent) return true;
    try {
      node = node.parentNode;
    } catch {
      return false;
    }
  }
  return false;
}

function extractRawFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.nodeValue ?? '').replace(/\u200b/g, '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;

  if (el.tagName.toLowerCase() === 'sup') {
    return `^{${extractRawFromRoot(el)}}`;
  }
  if (el.tagName.toLowerCase() === 'sub') {
    return `_{${extractRawFromRoot(el)}}`;
  }

  const kind = el.getAttribute('data-kind');
  if (kind === 'sup' || kind === 'sub') {
    return extractRawFromRoot(el);
  }

  const raw = el.getAttribute('data-raw');
  if (raw) return raw;

  let out = '';
  el.childNodes.forEach((child) => {
    out += extractRawFromNode(child);
  });
  return out;
}

function extractRawFromRoot(root: HTMLElement): string {
  let out = '';
  root.childNodes.forEach((child) => {
    out += extractRawFromNode(child);
  });
  return out;
}

function extractRawFromRange(root: HTMLElement, range: Range): string {
  const fragment = range.cloneContents();
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  return extractRawFromRoot(wrapper);
}

function getCaretOffsetIn(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!isDescendant(root, range.startContainer)) return extractRawFromRoot(root).length;

  const targetNode = range.startContainer;
  const targetOffset = range.startOffset;

  const cleanText = (t: string) => t.replace(/\u200b/g, '');

  const rawLenOfNode = (node: Node): number => {
    if (node.nodeType === Node.TEXT_NODE) {
      return cleanText(node.nodeValue ?? '').length;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return 0;
    const el = node as HTMLElement;

    if (el.classList.contains('tk-script')) {
      const kindAttr = el.getAttribute('data-kind') as 'sup' | 'sub' | null;
      const kind: 'sup' | 'sub' = kindAttr ?? (el.querySelector('sub') ? 'sub' : 'sup');
      const inner = el.querySelector(kind === 'sub' ? 'sub' : 'sup') as HTMLElement | null;
      const payloadLen = cleanText(inner?.textContent ?? '').length;
      return 2 + payloadLen + 1; // ^{payload} or _{payload}
    }

    const raw = el.getAttribute('data-raw');
    if (raw) return raw.length;

    let sum = 0;
    el.childNodes.forEach((c) => {
      sum += rawLenOfNode(c);
    });
    return sum;
  };

  let total = 0;
  let found = false;

  const walk = (node: Node): void => {
    if (found) return;

    // If caret container is an element node, treat offset as child index.
    if (node === targetNode && node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const children = Array.from(el.childNodes);
      for (let i = 0; i < Math.min(targetOffset, children.length); i++) {
        total += rawLenOfNode(children[i]);
      }
      found = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      if (node === targetNode) {
        total += cleanText(node.nodeValue ?? '').slice(0, targetOffset).length;
        found = true;
        return;
      }
      total += cleanText(node.nodeValue ?? '').length;
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    if (el.classList.contains('tk-script')) {
      const kindAttr = el.getAttribute('data-kind') as 'sup' | 'sub' | null;
      const kind: 'sup' | 'sub' = kindAttr ?? (el.querySelector('sub') ? 'sub' : 'sup');
      const inner = el.querySelector(kind === 'sub' ? 'sub' : 'sup') as HTMLElement | null;

      if (inner && isDescendant(inner, targetNode)) {
        // Caret is inside the payload: count only the prefix plus payload up to caret.
        total += 2;
        if (targetNode.nodeType === Node.TEXT_NODE) {
          total += cleanText(targetNode.nodeValue ?? '').slice(0, targetOffset).length;
        } else if (targetNode.nodeType === Node.ELEMENT_NODE) {
          const children = Array.from((targetNode as Element).childNodes);
          for (let i = 0; i < Math.min(targetOffset, children.length); i++) {
            total += rawLenOfNode(children[i]);
          }
        }
        found = true;
        return;
      }

      // Not inside: count entire raw script.
      total += 2 + cleanText(inner?.textContent ?? '').length + 1;
      return;
    }

    const raw = el.getAttribute('data-raw');
    if (raw) {
      total += raw.length;
      return;
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child);
      if (found) return;
    }
  };

  for (const child of Array.from(root.childNodes)) {
    walk(child);
    if (found) break;
  }

  return total;
}

function setCaretOffsetIn(root: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;

  let remaining = offset;

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const rawText = node.nodeValue ?? '';
      const cleaned = rawText.replace(/\u200b/g, '');
      const len = cleaned.length;

      if (len === 0) {
        if (remaining === 0) {
          const r = document.createRange();
          r.setStart(node, 0);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
          return true;
        }
        return false;
      }

      if (remaining <= len) {
        const r = document.createRange();
        r.setStart(node, remaining);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        return true;
      }
      remaining -= len;
      return false;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      // Scripts (sup/sub) represent raw like ^{...} or _{...} but the DOM only contains the payload.
      // Map the caret into the payload when the desired raw offset falls within a script.
      if (el.classList.contains('tk-script')) {
        const kindAttr = el.getAttribute('data-kind') as 'sup' | 'sub' | null;
        const kind: 'sup' | 'sub' = kindAttr ?? (el.querySelector('sub') ? 'sub' : 'sup');
        const rawScript = extractRawFromRoot(el);
        const prefixLen = 2; // _{ or ^{

        if (remaining <= rawScript.length) {
          const inner = el.querySelector(kind === 'sub' ? 'sub' : 'sup') as HTMLElement | null;
          const textNode = inner?.firstChild && inner.firstChild.nodeType === Node.TEXT_NODE ? (inner.firstChild as Text) : null;
          const payloadText = (textNode?.nodeValue ?? '').replace(/\u200b/g, '');
          const payloadLen = payloadText.length;

          // Allow caret to be placed before/after the script token at boundaries.
          // This prevents the caret from getting "stuck" inside the exponent.
          if (remaining <= 0) {
            const r = document.createRange();
            r.setStartBefore(el);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
            return true;
          }
          if (remaining >= rawScript.length) {
            const r = document.createRange();
            r.setStartAfter(el);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
            return true;
          }

          const withinPayload = Math.max(0, Math.min(payloadLen, remaining - prefixLen));
          const r = document.createRange();
          if (textNode) {
            r.setStart(textNode, withinPayload);
          } else if (inner) {
            r.setStart(inner, 0);
          } else {
            r.setStart(el, 0);
          }
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
          return true;
        }

        remaining -= rawScript.length;
        return false;
      }

      const raw = el.getAttribute('data-raw');
      if (raw) {
        if (remaining <= raw.length) {
          const r = document.createRange();
          // Can't place caret inside token; choose before if at start, otherwise after.
          if (remaining === 0) {
            r.setStartBefore(el);
          } else {
            r.setStartAfter(el);
          }
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
          return true;
        }
        remaining -= raw.length;
        return false;
      }

      for (const child of Array.from(el.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  };

  for (const child of Array.from(root.childNodes)) {
    if (walk(child)) return;
  }

  const r = document.createRange();
  r.selectNodeContents(root);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

function findBalanced(raw: string, start: number, open: string, close: string): { end: number; content: string } | null {
  if (raw[start] !== open) return null;
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === open) depth++;
    if (raw[i] === close) depth--;
    if (depth === 0) {
      return { end: i, content: raw.slice(start + 1, i) };
    }
  }
  return null;
}

export function renderTypingAnswerMathToHtml(raw: string, opts?: { enableScripts?: boolean }): string {
  let i = 0;
  let out = '';

  const enableScripts = opts?.enableScripts !== false;
  const disableFractions = (opts as any)?.disableFractions === true;

  const tryReadSimpleFraction = (s: string, start: number): { raw: string; num: string; den: string; end: number } | null => {
    const m = s.slice(start).match(/^(-?\d+)\/(\d+)/);
    if (!m) return null;
    return { raw: m[0], num: m[1], den: m[2], end: start + m[0].length };
  };

  const isTokenChar = (ch: string) => /[A-Za-z0-9_\^{}]/.test(ch);

  const findBalancedParens = (s: string, start: number): { end: number; content: string } | null => {
    if (s[start] !== '(') return null;
    let depth = 0;
    for (let idx = start; idx < s.length; idx++) {
      const ch = s[idx];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth === 0) {
        return { end: idx, content: s.slice(start + 1, idx) };
      }
    }
    return null;
  };

  const tryReadGeneralFraction = (
    s: string,
    start: number
  ): { raw: string; numRaw: string; denRaw: string; end: number } | null => {
    // Support common student inputs:
    // - (x^2+1)/7
    // - x/(x+1)
    // - (2x-3)/(x+1)
    // Heuristic: numerator is either a balanced (...) group, or a contiguous token with no spaces.
    // Denominator is either a balanced (...) group, a number, or a contiguous token with no spaces.
    if (start >= s.length) return null;
    if (s[start] === ' ' || s[start] === '\n' || s[start] === '\t') return null;

    let j = start;
    // allow leading sign for token numerators
    if (s[j] === '+' || s[j] === '-') j++;
    if (j >= s.length) return null;

    const parseToken = (from: number): { raw: string; end: number } | null => {
      let k = from;
      let saw = false;
      for (; k < s.length; k++) {
        const ch = s[k];
        if (ch === '/') break;
        if (ch === ' ' || ch === '\n' || ch === '\t') break;
        if (!isTokenChar(ch)) break;
        saw = true;
      }
      if (!saw) return null;
      return { raw: s.slice(from, k), end: k };
    };

    const parseNumerator = (): { raw: string; end: number } | null => {
      if (s[j] === '(') {
        const b = findBalancedParens(s, j);
        if (!b) return null;
        return { raw: s.slice(start, b.end + 1), end: b.end + 1 };
      }
      const tok = parseToken(start);
      if (!tok) return null;
      return { raw: tok.raw, end: tok.end };
    };

    const num = parseNumerator();
    if (!num) return null;
    if (num.end >= s.length || s[num.end] !== '/') return null;

    const denStart = num.end + 1;
    if (denStart >= s.length) return null;
    if (s[denStart] === ' ' || s[denStart] === '\n' || s[denStart] === '\t') return null;

    const parseDenominator = (): { raw: string; end: number } | null => {
      if (s[denStart] === '(') {
        const b = findBalancedParens(s, denStart);
        if (!b) return null;
        return { raw: s.slice(denStart, b.end + 1), end: b.end + 1 };
      }

      // number denominator
      let k = denStart;
      while (k < s.length && /\d/.test(s[k]!)) k++;
      if (k > denStart) return { raw: s.slice(denStart, k), end: k };

      // token denominator (e.g., x or x^2)
      const tok = parseToken(denStart);
      if (!tok) return null;
      return { raw: tok.raw, end: tok.end };
    };

    const den = parseDenominator();
    if (!den) return null;

    const rawAll = s.slice(start, den.end);
    return { raw: rawAll, numRaw: num.raw, denRaw: den.raw, end: den.end };
  };

  const tryReadAlgebraicFraction = (
    s: string,
    start: number
  ): { raw: string; numRaw: string; den: string; end: number } | null => {
    // Support common student inputs like x/7, x^7/7, 3x/7, -x^2/5.
    // Heuristic: numerator must be a contiguous "token" (no spaces), slash, then numeric denominator.
    let j = start;
    if (s[j] === '+' || s[j] === '-') j++;

    let sawToken = false;
    for (; j < s.length; j++) {
      const ch = s[j];
      if (ch === '/') break;
      if (ch === ' ' || ch === '\n' || ch === '\t') return null;
      if (!isTokenChar(ch)) return null;
      sawToken = true;
    }

    if (!sawToken) return null;
    if (j >= s.length || s[j] !== '/') return null;

    const denStart = j + 1;
    if (denStart >= s.length) return null;
    let k = denStart;
    while (k < s.length && /\d/.test(s[k]!)) k++;
    if (k === denStart) return null;

    const numRaw = s.slice(start, j);
    const den = s.slice(denStart, k);
    const rawAll = s.slice(start, k);
    return { raw: rawAll, numRaw, den, end: k };
  };

  const pushText = (text: string) => {
    if (!text) return;
    out += escapeHtml(text);
  };

  while (i < raw.length) {
    if (!disableFractions) {
      // Render numeric fractions like 4/7.
      const frac = tryReadSimpleFraction(raw, i);
      if (frac) {
        out += `<span class="tk-frac" data-raw="${escapeHtml(frac.raw)}">`;
        out += `<span class="tk-frac-num">${escapeHtml(frac.num)}</span>`;
        out += `<span class="tk-frac-bar"></span>`;
        out += `<span class="tk-frac-den">${escapeHtml(frac.den)}</span>`;
        out += `</span>`;
        i = frac.end;
        continue;
      }

      // Render parenthesized / general fractions like (x^2+1)/7 or (2x-3)/(x+1).
      const gf = tryReadGeneralFraction(raw, i);
      if (gf) {
        const numHtml = renderTypingAnswerMathToHtml(gf.numRaw, { enableScripts, disableFractions: true } as any);
        const denHtml = renderTypingAnswerMathToHtml(gf.denRaw, { enableScripts, disableFractions: true } as any);
        out += `<span class="tk-frac" data-raw="${escapeHtml(gf.raw)}">`;
        out += `<span class="tk-frac-num">${numHtml || '\u200b'}</span>`;
        out += `<span class="tk-frac-bar"></span>`;
        out += `<span class="tk-frac-den">${denHtml || '\u200b'}</span>`;
        out += `</span>`;
        i = gf.end;
        continue;
      }

      // Render simple algebraic fractions like x^7/7, x/7, 3x/7.
      const af = tryReadAlgebraicFraction(raw, i);
      if (af) {
        const numHtml = renderTypingAnswerMathToHtml(af.numRaw, { enableScripts, disableFractions: true } as any);
        out += `<span class="tk-frac" data-raw="${escapeHtml(af.raw)}">`;
        out += `<span class="tk-frac-num">${numHtml || '\u200b'}</span>`;
        out += `<span class="tk-frac-bar"></span>`;
        out += `<span class="tk-frac-den">${escapeHtml(af.den)}</span>`;
        out += `</span>`;
        i = af.end;
        continue;
      }
    }

    // superscript/subscript
    if (enableScripts && (raw[i] === '^' || raw[i] === '_')) {
      const kind = raw[i] === '^' ? 'sup' : 'sub';
      const marker = raw[i];
      const next = raw[i + 1];

      let payload = '';
      let consumed = 1;

      if (next === '{') {
        const balanced = findBalanced(raw, i + 1, '{', '}');
        if (balanced) {
          payload = balanced.content;
          consumed = balanced.end - i + 1;
        }
      } else if (next) {
        payload = next;
        consumed = 2;
      }

      // Render scripts even when payload is empty (e.g. '^{}'), so caret can enter script mode.
      if (payload !== '' || (next === '{' && consumed > 1)) {
        const tag = kind === 'sup' ? 'sup' : 'sub';
        const safe = payload === '' ? '\u200b' : escapeHtml(payload);
        out += `<span class="tk-script" data-kind="${kind}">`;
        out += `<${tag} class="tk-${kind}">${safe}</${tag}>`;
        out += `</span>`;
        i += consumed;
        continue;
      }
    }

    // default: emit char
    pushText(raw[i]);
    i++;
  }

  return out;
}

export default function TypingAnswerMathInput({ value, onChange, placeholder, className, disabled, enableScripts }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [caretMode, setCaretMode] = useState<'normal' | 'sup' | 'sub'>('normal');
  const [isFocused, setIsFocused] = useState(false);
  const pendingArrowSpaceRef = useRef(false);

  const scriptsEnabled = enableScripts !== false;

  const isCentered = useMemo(() => {
    const cls = (className ?? '').split(/\s+/g);
    return cls.includes('text-center');
  }, [className]);

  const insertRawAtCaret = useCallback(
    (snippet: string, caretDeltaFromInsertEnd: number) => {
      if (!ref.current) return;
      const caret = getCaretOffsetIn(ref.current);
      const currentRaw = extractRawFromRoot(ref.current);
      const nextRaw = currentRaw.slice(0, caret) + snippet + currentRaw.slice(caret);
      const nextCaret = caret + snippet.length - caretDeltaFromInsertEnd;
      onChange(nextRaw);
      ref.current.innerHTML = renderTypingAnswerMathToHtml(nextRaw, { enableScripts: scriptsEnabled });
      setCaretOffsetIn(ref.current, Math.max(0, Math.min(nextCaret, nextRaw.length)));
    },
    [onChange, scriptsEnabled]
  );

  const html = useMemo(() => {
    const raw = value ?? '';
    const rendered = renderTypingAnswerMathToHtml(raw, { enableScripts: scriptsEnabled });
    // When centered and empty, keep a zero-width character so the browser can center the caret.
    return isCentered && raw === '' ? '\u200b' : rendered;
  }, [isCentered, value, scriptsEnabled]);

  useEffect(() => {
    if (!ref.current) return;
    const current = extractRawFromRoot(ref.current);
    if (current !== (value ?? '')) {
      const caret = document.activeElement === ref.current ? getCaretOffsetIn(ref.current) : null;
      ref.current.innerHTML = html;
      if (caret !== null) {
        setCaretOffsetIn(ref.current, caret);
      }
    } else if (ref.current.innerHTML !== html) {
      const caret = document.activeElement === ref.current ? getCaretOffsetIn(ref.current) : null;
      ref.current.innerHTML = html;
      if (caret !== null) {
        setCaretOffsetIn(ref.current, caret);
      }
    }
  }, [value, html]);

  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      const sel = window.getSelection();
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      if (!range) {
        setCaretMode('normal');
        return;
      }
      if (!isDescendant(ref.current, range.startContainer)) {
        setCaretMode('normal');
        return;
      }
      const container = range.startContainer;
      const elementContainer = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;
      if (!elementContainer) {
        setCaretMode('normal');
        return;
      }
      if (elementContainer.closest('sup')) {
        setCaretMode('sup');
        return;
      }
      if (elementContainer.closest('sub')) {
        setCaretMode('sub');
        return;
      }
      setCaretMode('normal');
    };

    document.addEventListener('selectionchange', update);
    update();
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  const ensureCaretInEditor = useCallback(() => {
    if (!ref.current) return;
    const sel = window.getSelection();
    if (!sel) return;
    if (sel.rangeCount > 0 && isDescendant(ref.current, sel.getRangeAt(0).startContainer)) return;

    const range = document.createRange();
    range.selectNodeContents(ref.current);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  return (
    <div
      ref={ref}
      data-caret-mode={caretMode}
      data-empty={(value ?? '') === '' ? '1' : '0'}
      data-focused={isFocused ? '1' : '0'}
      className={`min-h-[48px] w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring ${
        caretMode === 'sup' ? 'ring-1 ring-sky-500/40' : caretMode === 'sub' ? 'ring-1 ring-violet-500/40' : ''
      } ${className || ''}`}
      style={{ fontSize: 'inherit', lineHeight: 1.35 }}
      contentEditable={!disabled}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      data-placeholder={placeholder}
      suppressContentEditableWarning
      onFocus={() => {
        if (disabled) return;
        setIsFocused(true);
        ensureCaretInEditor();
      }}
      onBlur={() => {
        setIsFocused(false);
      }}
      onPaste={(e) => {
        if (disabled) return;
        if (!ref.current) return;
        e.preventDefault();

        const text = e.clipboardData?.getData('text/plain') ?? '';
        if (!text) return;

        // Insert plain text at caret to avoid carrying external font family/size.
        // Use execCommand for broad compatibility.
        try {
          document.execCommand('insertText', false, text);
        } catch {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }

        // Normalize immediately into our controlled raw representation.
        const caret = getCaretOffsetIn(ref.current);
        const nextRaw = extractRawFromRoot(ref.current);
        onChange(nextRaw);
        ref.current.innerHTML = renderTypingAnswerMathToHtml(nextRaw, { enableScripts: scriptsEnabled });
        setCaretOffsetIn(ref.current, Math.min(caret, nextRaw.length));
      }}
      onInput={() => {
        if (disabled) return;
        if (!ref.current) return;
        const caret = getCaretOffsetIn(ref.current);
        const nextRaw = extractRawFromRoot(ref.current);
        onChange(nextRaw);
        // render immediately
        ref.current.innerHTML = renderTypingAnswerMathToHtml(nextRaw, { enableScripts: scriptsEnabled });
        setCaretOffsetIn(ref.current, caret);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (!ref.current) return;

        const isRightKey = e.key === 'ArrowRight' || e.key === 'Right';
        const isLeftKey = e.key === 'ArrowLeft' || e.key === 'Left';

        // If the user just exited a script (sup/sub) via ArrowRight, allow a second ArrowRight
        // to insert a normal word-space after the token (so they don't need to press Space).
        if (scriptsEnabled && isRightKey && pendingArrowSpaceRef.current) {
          const sel = window.getSelection();
          const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
          if (range && range.collapsed) {
            const container = range.startContainer;
            const elementContainer = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;
            const token = (elementContainer?.closest('.tk-script') || elementContainer?.previousSibling) as HTMLElement | null;
            const prev = token && token.nodeType === Node.ELEMENT_NODE ? (token as HTMLElement) : null;
            const prevIsScript = !!prev?.classList?.contains('tk-script');
            if (prevIsScript) {
              e.preventDefault();
              pendingArrowSpaceRef.current = false;

              try {
                document.execCommand('insertText', false, ' ');
              } catch {
                // ignore
              }

              const caret = getCaretOffsetIn(ref.current);
              const nextRaw = extractRawFromRoot(ref.current);
              onChange(nextRaw);
              ref.current.innerHTML = renderTypingAnswerMathToHtml(nextRaw, { enableScripts: scriptsEnabled });
              setCaretOffsetIn(ref.current, Math.min(caret, nextRaw.length));
              return;
            }
          }
          pendingArrowSpaceRef.current = false;
        }

        if (scriptsEnabled && (e.key === '^' || e.key === '_')) {
          e.preventDefault();
          const snippet = e.key === '^' ? '^{}' : '_{}';
          insertRawAtCaret(snippet, 1);
          pendingArrowSpaceRef.current = false;
          return;
        }

        if (e.key === 'Backspace' || e.key === 'Delete') {
          pendingArrowSpaceRef.current = false;
          const sel = window.getSelection();
          const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
          if (range && range.collapsed) {
            const container = range.startContainer;
            const elementContainer =
              container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;

            const caretOffset = getCaretOffsetIn(ref.current);
            const token = elementContainer?.closest('.tk-token, .tk-script') as HTMLElement | null;
            if (token) {
              e.preventDefault();
              token.remove();
              const nextRaw = extractRawFromRoot(ref.current);
              onChange(nextRaw);
              ref.current.innerHTML = renderTypingAnswerMathToHtml(nextRaw, { enableScripts: scriptsEnabled });
              setCaretOffsetIn(ref.current, Math.min(caretOffset, nextRaw.length));
              return;
            }

            // If caret is adjacent to a token, delete the token as a whole.
            const anchor = range.startContainer;
            const anchorEl = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
            if (!anchorEl) return;

            const isBackspace = e.key === 'Backspace';
            const adjacent = isBackspace
              ? (anchorEl.previousSibling as HTMLElement | null)
              : (anchorEl.nextSibling as HTMLElement | null);
            const adjacentToken = adjacent && adjacent.nodeType === Node.ELEMENT_NODE
              ? (adjacent as HTMLElement).closest?.('.tk-token, .tk-script')
              : null;
            if (adjacentToken) {
              e.preventDefault();
              (adjacentToken as HTMLElement).remove();
              const nextRaw = extractRawFromRoot(ref.current);
              onChange(nextRaw);
              ref.current.innerHTML = renderTypingAnswerMathToHtml(nextRaw, { enableScripts: scriptsEnabled });
              setCaretOffsetIn(ref.current, Math.min(caretOffset, nextRaw.length));
              return;
            }
          }
        }

        if (scriptsEnabled) {
          const sel = window.getSelection();
          const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
          if (!range || !range.collapsed) return;

          const container = range.startContainer;
          const elementContainer = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;
          const insideScript = (elementContainer?.closest('sub') || elementContainer?.closest('sup')) as HTMLElement | null;

          // Quick exit from scripts back to normal text.
          // Space/Tab/Escape should leave the script and continue on the baseline.
          const isExitKey = e.key === ' ' || e.key === 'Spacebar' || e.key === 'Tab' || e.key === 'Escape';
          if (insideScript && isExitKey) {
            e.preventDefault();
            pendingArrowSpaceRef.current = false;
            const wrapper = insideScript.closest('.tk-script') as HTMLElement | null;
            const next = document.createRange();
            if (e.shiftKey && e.key === 'Tab') {
              next.setStartBefore(wrapper || insideScript);
            } else {
              next.setStartAfter(wrapper || insideScript);
            }
            next.collapse(true);
            sel?.removeAllRanges();
            sel?.addRange(next);

            if (e.key === ' ' || e.key === 'Spacebar') {
              try {
                document.execCommand('insertText', false, ' ');
              } catch {
                // ignore
              }
              const caret = getCaretOffsetIn(ref.current);
              const nextRaw = extractRawFromRoot(ref.current);
              onChange(nextRaw);
              ref.current.innerHTML = renderTypingAnswerMathToHtml(nextRaw, { enableScripts: scriptsEnabled });
              setCaretOffsetIn(ref.current, Math.min(caret, nextRaw.length));
            }
            return;
          }

          // Exit scripts with ArrowLeft/ArrowRight when caret is at the start/end of the payload.
          // Use DOM offsets rather than Range comparisons (which can be unreliable with zero-width placeholders).
          const isArrowRight = e.key === 'ArrowRight';
          const isArrowLeft = e.key === 'ArrowLeft';
          const right = isRightKey;
          const left = isLeftKey;
          if (insideScript && (right || left)) {
            const wrapper = insideScript.closest('.tk-script') as HTMLElement | null;
            const payloadTextNode =
              insideScript.firstChild && insideScript.firstChild.nodeType === Node.TEXT_NODE
                ? (insideScript.firstChild as Text)
                : null;

            const payloadLen = (payloadTextNode?.nodeValue ?? '').replace(/\u200b/g, '').length;

            const atStart = (() => {
              if (container === payloadTextNode) return range.startOffset <= 0;
              if (container === insideScript) return range.startOffset <= 0;
              return false;
            })();

            const atEnd = (() => {
              if (container === payloadTextNode) return range.startOffset >= payloadLen;
              if (container === insideScript) return range.startOffset >= insideScript.childNodes.length;
              return false;
            })();

            if ((left && atStart) || (right && atEnd)) {
              e.preventDefault();
              // If the user exits to the right, allow a second ArrowRight to insert a space.
              pendingArrowSpaceRef.current = right;
              const next = document.createRange();
              if (left) {
                next.setStartBefore(wrapper || insideScript);
              } else {
                next.setStartAfter(wrapper || insideScript);
              }
              next.collapse(true);
              sel?.removeAllRanges();
              sel?.addRange(next);
              return;
            }
          }
        }

        // Any other key cancels the pending-arrow-space behavior.
        pendingArrowSpaceRef.current = false;
      }}
    />
  );
}
