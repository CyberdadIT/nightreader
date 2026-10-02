// Printing through the system print dialog. PDF pages are rendered to images in a
// print-only area; EPUB chapters print as text. Phones can't print from a web view,
// so there the document goes to the share sheet, which offers Print.
import { AnnotationMode } from 'pdfjs-dist';
import { isCapacitor, saveBinaryFile } from './platform.js';
import { loadPdfData } from './storage.js';

export const MAX_PRINT_PAGES = 300;
export const canPrintHere = () => !isCapacitor() && typeof window.print === 'function';

/** Turn "this page / range / all" into a checked first–last page pair. */
export function printRange({ mode, current, from, to, total }) {
  const clamp = n => Math.min(total, Math.max(1, Math.floor(Number(n) || 1)));
  let first = 1, last = total;
  if (mode === 'current') first = last = clamp(current);
  if (mode === 'range') { first = clamp(from); last = clamp(to); if (last < first) [first, last] = [last, first]; }
  if (last - first + 1 > MAX_PRINT_PAGES) last = first + MAX_PRINT_PAGES - 1;
  return { first, last };
}

function printArea() {
  document.getElementById('print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'print-root';
  document.body.append(root);
  return root;
}

function printAndClean(root, urls) {
  return new Promise(resolve => {
    const done = () => {
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('printing');
      root.remove(); urls.forEach(URL.revokeObjectURL); resolve();
    };
    window.addEventListener('afterprint', done);
    document.body.classList.add('printing');
    window.print();
    // Some engines don't fire afterprint; clean up anyway once the dialog has closed.
    setTimeout(done, 1500);
  });
}

/** Print PDF pages first–last. onProgress(n, total) reports preparation. */
export async function printPdf(doc, { first, last }, onProgress, isCancelled = () => false) {
  const root = printArea(), urls = [];
  try {
    for (let n = first; n <= last; n++) {
      if (isCancelled()) { root.remove(); urls.forEach(URL.revokeObjectURL); return false; }
      onProgress?.(n - first + 1, last - first + 1);
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // About 150 dpi on paper, bounded for very large pages.
      const scale = Math.min(150 / 72, Math.sqrt(12_000_000 / (base.width * base.height)));
      const vp = page.getViewport({ scale }), canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, annotationMode: AnnotationMode.ENABLE_STORAGE, annotationStorage: doc.annotationStorage }).promise;
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
      canvas.width = canvas.height = 0;
      const url = URL.createObjectURL(blob); urls.push(url);
      const img = document.createElement('img'); img.src = url; img.alt = `Page ${n}`;
      root.append(img);
      await img.decode().catch(() => {});
    }
    await printAndClean(root, urls);
    return true;
  } catch (e) { root.remove(); urls.forEach(URL.revokeObjectURL); throw e; }
}

/** Print EPUB chapters first–last as plain, readable text. */
export async function printEpub(book, { first, last }) {
  const root = printArea();
  for (let n = first; n <= last; n++) {
    const chapter = document.createElement('section');
    chapter.className = 'print-chapter';
    chapter.innerHTML = book.chapters[n - 1]?.html || ''; // already sanitised when the book was opened
    root.append(chapter);
  }
  await printAndClean(root, []);
  return true;
}

/** Phones: hand the original PDF to the share sheet, which includes Print. */
export async function sharePdfForPrinting(tab) {
  const bytes = await loadPdfData(tab.path);
  if (!bytes) throw new Error('This document is no longer cached. Import the original file again.');
  return saveBinaryFile(tab.name, new Uint8Array(bytes), 'application/pdf');
}
