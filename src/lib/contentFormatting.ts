const SOFT_BREAK_THRESHOLD = 28;

function fallbackSoftBreaks(value: string): string {
  return value.replace(new RegExp(`([^\\s]{${SOFT_BREAK_THRESHOLD}})`, 'g'), '$1<wbr/>');
}

const BENGALI_RANGE_RE = /[\u0980-\u09FF]/;
const BENGALI_RUN_RE = /(\u0980-\u09FF)/;

function applySoftBreaksAndBengaliWrapping(doc: Document, text: string): DocumentFragment | null {
  const needsSoftBreaks = text.trim().length >= SOFT_BREAK_THRESHOLD;
  const hasBengali = BENGALI_RANGE_RE.test(text);
  if (!needsSoftBreaks && !hasBengali) return null;

  const frag = doc.createDocumentFragment();
  const parts = text.split(/(\s+)/);

  for (const part of parts) {
    if (!part) continue;

    if (/^\s+$/.test(part)) {
      frag.appendChild(doc.createTextNode(part));
      continue;
    }

    const segments: string[] = [];
    if (part.length <= SOFT_BREAK_THRESHOLD) {
      segments.push(part);
    } else {
      for (let i = 0; i < part.length; i += SOFT_BREAK_THRESHOLD) {
        segments.push(part.slice(i, i + SOFT_BREAK_THRESHOLD));
      }
    }

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (BENGALI_RANGE_RE.test(segment)) {
        const runs = segment.split(BENGALI_RUN_RE);
        for (const run of runs) {
          if (!run) continue;
          if (BENGALI_RANGE_RE.test(run)) {
            const span = doc.createElement('span');
            span.className = 'tk-bn';
            span.textContent = run;
            frag.appendChild(span);
          } else {
            frag.appendChild(doc.createTextNode(run));
          }
        }
      } else {
        frag.appendChild(doc.createTextNode(segment));
      }

      if (i < segments.length - 1) {
        frag.appendChild(doc.createElement('wbr'));
      }
    }
  }

  return frag;
}

/**
 * Normalizes stored HTML so long plain-text stretches can wrap naturally.
 * - Converts non-breaking spaces to normal spaces.
 * - Adds <wbr> hints to very long uninterrupted sequences (excluding KaTeX/code).
 */
export function prepareContentForDisplay(value?: string | null): string {
  if (!value) return '';
  const normalized = value.replace(/&nbsp;/gi, ' ').replace(/\u00a0/g, ' ');

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return fallbackSoftBreaks(normalized);
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(normalized, 'text/html');

    // Remove inline font sizing/family styles that can cause inconsistent rendering
    // between options when content is pasted from different sources.
    const elements = doc.body.querySelectorAll<HTMLElement>('[style], font');
    elements.forEach((el) => {
      if (el.closest('code, pre, kbd, samp, .katex')) return;

      if (el.tagName.toLowerCase() === 'font') {
        el.removeAttribute('size');
        el.removeAttribute('face');
      }

      const style = (el as HTMLElement).style;
      if (!style) return;
      style.removeProperty('font-size');
      style.removeProperty('line-height');
      style.removeProperty('font-family');
    });

    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      if (!parent) continue;
      if (parent.closest('code, pre, kbd, samp, .katex, .tk-bn')) continue;

      const text = node.textContent ?? '';
      const replacement = applySoftBreaksAndBengaliWrapping(doc, text);
      if (!replacement) continue;
      node.parentNode?.replaceChild(replacement, node);
    }

    return doc.body.innerHTML;
  } catch (error) {
    console.warn('prepareContentForDisplay: failed to parse HTML', error);
    return fallbackSoftBreaks(normalized);
  }
}

