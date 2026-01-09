export function stableHashString(input: string): Promise<string> {
  const enc = new TextEncoder();
  return crypto.subtle.digest('SHA-256', enc.encode(input)).then((buf) => {
    const bytes = new Uint8Array(buf);
    let out = '';
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
    return out;
  });
}

export function extractPlainText(html?: string): string {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ');
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na <= 0 || nb <= 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function softClamp(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}
