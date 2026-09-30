export function textRange(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0, node, from = null, to = null;
  while ((node = walker.nextNode())) {
    const length = node.textContent.length;
    if (!from && start < offset + length) from = [node, Math.max(0, start - offset)];
    if (from && end <= offset + length) { to = [node, Math.max(0, end - offset)]; break; }
    offset += length;
  }
  if (!from || !to) return null;
  const range = document.createRange(); range.setStart(...from); range.setEnd(...to); return range;
}
export function selectionAnchor(root, range) {
  const before = range.cloneRange(); before.selectNodeContents(root); before.setEnd(range.startContainer, range.startOffset);
  return {start:before.toString().length, end:before.toString().length + range.toString().length};
}
export function findQuote(text, quote, preferred = 0) {
  if (text.slice(preferred, preferred + quote.length) === quote) return preferred;
  return text.indexOf(quote);
}
export function matchingOffsets(text, query) {
  if (!query.trim()) return [];
  const lower = text.toLowerCase(), q = query.toLowerCase(), results = [];
  for (let index = lower.indexOf(q); index >= 0; index = lower.indexOf(q, index + Math.max(1, q.length))) results.push({start:index,end:index+q.length});
  return results;
}
export function fitScale(width, height, availableWidth, availableHeight, mode, zoom = 1) {
  if (mode === 'manual') return 1.8 * zoom;
  const w = Math.max(100, availableWidth) / width;
  return Math.max(.1, mode === 'page' ? Math.min(w, Math.max(100, availableHeight) / height) : w);
}
