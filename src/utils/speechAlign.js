// Read-along highlighting: find the sentence being spoken in the page's on-screen text.
//
// The text that is spoken (PDF.js text content, OCR text or an EPUB chapter) and the
// text drawn on screen differ in spacing and line breaks, so matching ignores
// whitespace and case. Each character that counts keeps its position in the original,
// so a match maps straight back to on-screen offsets for highlighting.

/** Characters that count for matching, with their positions in the original text. */
export function compact(text) {
  let chars = '';
  const positions = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c) || c === '­') continue; // whitespace and soft hyphens
    chars += c.toLowerCase();
    positions.push(i);
  }
  return { chars, positions };
}

/**
 * Locate `chunk` in the on-screen text, searching from `from` (an on-screen offset)
 * so repeated sentences are found in reading order. Returns
 * { start, end, toScreen(chunkOffset) } or null when the chunk isn't on screen.
 */
export function alignChunk(screen, chunk, from = 0) {
  const s = typeof screen === 'string' ? compact(screen) : screen;
  const c = compact(chunk);
  if (!c.chars) return null;
  // First compact index at or after `from`.
  let lo = 0, hi = s.positions.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s.positions[mid] < from) lo = mid + 1; else hi = mid; }
  let at = s.chars.indexOf(c.chars, lo);
  if (at < 0) at = s.chars.indexOf(c.chars); // fall back to anywhere on the page
  if (at < 0) return null;
  const start = s.positions[at], end = s.positions[at + c.chars.length - 1] + 1;
  return {
    start, end,
    /** On-screen offset of a character offset inside the chunk. */
    toScreen(offset) {
      // Count characters that matter before `offset` in the chunk.
      let lo2 = 0, hi2 = c.positions.length;
      while (lo2 < hi2) { const mid = (lo2 + hi2) >> 1; if (c.positions[mid] < offset) lo2 = mid + 1; else hi2 = mid; }
      const index = Math.min(at + lo2, at + c.chars.length - 1);
      return s.positions[index];
    },
  };
}

/** On-screen [start, end) of a spoken word, given its offset and length in the chunk. */
export function wordOnScreen(alignment, offset, length) {
  if (!alignment || length <= 0) return null;
  const start = alignment.toScreen(offset), last = alignment.toScreen(offset + length - 1);
  return last >= start ? { start, end: last + 1 } : null;
}
