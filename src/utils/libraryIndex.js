// Search inside every document in the library.
// Each document's text is extracted once (PDF text, or OCR text for scanned pages;
// EPUB chapter text) and kept on this device, so searching is instant and offline.
// Password-protected PDFs are never indexed: their text stays out of storage.
import { loadPdfData, saveTextIndex, loadTextIndex, listTextIndexes, deleteTextIndex } from './storage.js';

export const INDEX_VERSION = 1;
const MAX_PAGES = 3000, MAX_CHARS = 4_000_000;

/** Fold case and accents so "café" finds "Cafe". Keeps string length the same for most text. */
export function fold(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Fold text while remembering where each folded character came from, so a match in
 * the folded text maps back to the original for the snippet.
 */
function foldWithMap(text) {
  let out = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const f = fold(text[i]);
    for (let k = 0; k < f.length; k++) { out += f[k]; map.push(i); }
  }
  return { out, map };
}

/** Build the text index for one document. Returns 'indexed', 'skipped' or 'missing'. */
export async function indexDocument(entry, { loadDocument }) {
  if (entry.protected) return 'skipped';
  const bytes = await loadPdfData(entry.id);
  if (!bytes) return 'missing';
  let doc;
  try { doc = await loadDocument(bytes, entry.kind || 'pdf', entry.id, { askPassword: () => null }); }
  catch (e) { if (e?.name === 'PasswordCancelled') return 'skipped'; throw e; }
  try {
    const pages = [];
    let total = 0;
    const count = Math.min(doc.numPages, MAX_PAGES);
    for (let n = 1; n <= count && total < MAX_CHARS; n++) {
      const text = String(await doc.getPageText(n) || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS - total);
      pages.push(text); total += text.length;
    }
    await saveTextIndex(entry.id, { v: INDEX_VERSION, kind: entry.kind || 'pdf', pages, at: Date.now() });
    return 'indexed';
  } finally { doc.destroy?.(); }
}

/** Index every document that isn't indexed yet. onProgress(done, total, name). */
export async function ensureIndexed(library, { loadDocument, onProgress, isCancelled = () => false } = {}) {
  const have = new Set(await listTextIndexes().catch(() => []));
  const todo = library.filter(d => !d.needsFile && !d.protected && !have.has(d.id));
  let done = 0;
  for (const entry of todo) {
    if (isCancelled()) break;
    onProgress?.(done, todo.length, entry.name);
    try { await indexDocument(entry, { loadDocument }); } catch { /* unreadable file: searched by name only */ }
    done++;
  }
  onProgress?.(done, todo.length, '');
  return { indexed: done, total: todo.length };
}

/** Forget a document's text (after it's removed, or OCR adds text to it). */
export const forgetIndex = id => deleteTextIndex(id).catch(() => {});

/**
 * Search the indexed text. Returns [{ doc, hits: [{ page, before, match, after }], count }],
 * best documents (most matches) first. At most `perDoc` snippets per document.
 */
export async function searchLibrary(query, library, { perDoc = 8, maxDocs = 50 } = {}) {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const results = [];
  for (const doc of library) {
    if (doc.protected) continue;
    const index = await loadTextIndex(doc.id).catch(() => null);
    if (!index?.pages) continue;
    let count = 0;
    const hits = [];
    index.pages.forEach((text, i) => {
      const folded = fold(text);
      if (!folded.includes(q)) return;
      const { out, map } = foldWithMap(text);
      for (let at = out.indexOf(q); at >= 0; at = out.indexOf(q, at + q.length)) {
        count++;
        if (hits.length < perDoc) {
          const start = map[at], end = map[at + q.length - 1] + 1;
          hits.push({
            page: i + 1,
            before: (start > 70 ? '…' : '') + text.slice(Math.max(0, start - 70), start),
            match: text.slice(start, end),
            after: text.slice(end, end + 90) + (end + 90 < text.length ? '…' : ''),
          });
        }
      }
    });
    if (count) results.push({ doc, hits, count });
  }
  return results.sort((a, b) => b.count - a.count).slice(0, maxDocs);
}
