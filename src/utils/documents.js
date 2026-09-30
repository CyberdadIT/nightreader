import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { loadOcrPage } from './storage.js';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
export async function loadDocument(bytes, kind, id) {
  if (kind === 'epub') {
    const { loadEpub } = await import('./epub.js');
    return loadEpub(bytes);
  }
  const pdf = await pdfjs.getDocument({data:new Uint8Array(bytes).slice()}).promise;
  pdf.kind = 'pdf';
  pdf.documentId = id;
  const cache = new Map();
  pdf.getPageText = async n => {
    const ocr = await loadOcrPage(id, n);
    if (ocr?.text?.trim()) return ocr.text;
    if (!cache.has(n)) {
      const page = await pdf.getPage(n), content = await page.getTextContent();
      cache.set(n, content.items.map(item => item.str || '').join(' '));
    }
    return cache.get(n);
  };
  pdf.getSearchText = async n => {
    const ocr = await loadOcrPage(id,n);
    if (ocr?.words?.length) return ocr.words.map(w=>w.text+' ').join('');
    return (await (await pdf.getPage(n)).getTextContent()).items.map(i=>i.str||'').join('');
  };
  return pdf;
}
