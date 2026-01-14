export function plainTextToSimpleHtml(text: string): string {
  const escaped = (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Paragraphs are separated by blank lines (double newline). Single newlines are treated
  // as wrapped lines and should be unwrapped into spaces.
  return escaped
    .split(/\n{2,}/)
    .map((p) => {
      const unwrapped = p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      return `<p>${unwrapped}</p>`;
    })
    .join('');
}
