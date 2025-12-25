import { useCallback, useEffect, useMemo, useRef } from 'react';

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
    node = node.parentNode;
  }
  return false;
}

function extractRawFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue ?? '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
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

  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  return extractRawFromRange(root, pre).length;
}

function setCaretOffsetIn(root: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;

  let remaining = offset;

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.nodeValue?.length ?? 0;
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

  const pushText = (text: string) => {
    if (!text) return;
    out += escapeHtml(text);
  };

  while (i < raw.length) {
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

      if (payload) {
        const tag = kind === 'sup' ? 'sup' : 'sub';
        const rawToken = marker + raw.slice(i + 1, i + consumed);
        out += `<span class="tk-token tk-script" contenteditable="false" data-raw="${escapeHtml(rawToken)}" data-kind="${kind}">`;
        out += `<${tag} class="tk-${kind}">${escapeHtml(payload)}</${tag}>`;
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

  const html = useMemo(
    () => renderTypingAnswerMathToHtml(value ?? '', { enableScripts }),
    [value, enableScripts]
  );

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
      className={`min-h-[44px] w-full rounded-md border px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ring ${className || ''}`}
      style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
      contentEditable={!disabled}
      data-placeholder={placeholder}
      suppressContentEditableWarning
      onFocus={() => {
        if (disabled) return;
        ensureCaretInEditor();
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
        ref.current.innerHTML = renderTypingAnswerMathToHtml(nextRaw, { enableScripts });
        setCaretOffsetIn(ref.current, Math.min(caret, nextRaw.length));
      }}
      onInput={() => {
        if (disabled) return;
        if (!ref.current) return;
        const caret = getCaretOffsetIn(ref.current);
        const nextRaw = extractRawFromRoot(ref.current);
        onChange(nextRaw);
        // render immediately
        ref.current.innerHTML = renderTypingAnswerMathToHtml(nextRaw, { enableScripts });
        setCaretOffsetIn(ref.current, caret);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (!ref.current) return;

        if (e.key === 'Backspace' || e.key === 'Delete') {
          const sel = window.getSelection();
          const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
          if (range && range.collapsed) {
            const container = range.startContainer;
            const elementContainer =
              container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;

            const caretOffset = getCaretOffsetIn(ref.current);
            const token = elementContainer?.closest('.tk-token') as HTMLElement | null;
            if (token) {
              e.preventDefault();
              token.remove();
              const nextRaw = extractRawFromRoot(ref.current);
              onChange(nextRaw);
              ref.current.innerHTML = renderTypingAnswerMathToHtml(nextRaw, { enableScripts });
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
              ? (adjacent as HTMLElement).closest?.('.tk-token')
              : null;
            if (adjacentToken) {
              e.preventDefault();
              (adjacentToken as HTMLElement).remove();
              const nextRaw = extractRawFromRoot(ref.current);
              onChange(nextRaw);
              ref.current.innerHTML = renderTypingAnswerMathToHtml(nextRaw, { enableScripts });
              setCaretOffsetIn(ref.current, Math.min(caretOffset, nextRaw.length));
              return;
            }
          }
        }

        if (
          enableScripts &&
          (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')
        ) {
          const sel = window.getSelection();
          const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
          if (range && range.collapsed) {
            const container = range.startContainer;
            const elementContainer =
              container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;

            let scriptTag = (elementContainer?.closest('sub') || elementContainer?.closest('sup')) as HTMLElement | null;
            while (scriptTag?.parentElement) {
              const parentTag = scriptTag.parentElement.tagName.toLowerCase();
              if (parentTag === 'sub' || parentTag === 'sup') {
                scriptTag = scriptTag.parentElement;
                continue;
              }
              break;
            }
            if (scriptTag) {
              e.preventDefault();
              const next = document.createRange();
              const exitBefore = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
              if (exitBefore) {
                next.setStartBefore(scriptTag);
              } else {
                next.setStartAfter(scriptTag);
              }
              next.collapse(true);
              sel?.removeAllRanges();
              sel?.addRange(next);
              return;
            }
          }
        }
      }}
    />
  );
}
