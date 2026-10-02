import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { loadOcrPage } from './storage.js';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
// Passwords are kept in memory for this session only, never written to disk.
const sessionPasswords = new Map();
export class PasswordCancelled extends Error {
  constructor() { super('This PDF is password-protected. Open it again and enter the password to read it.'); this.name = 'PasswordCancelled'; }
}
/**
 * Open a PDF or EPUB. For a protected PDF, askPassword({incorrect}) is called and
 * should resolve to the password, or null if the user cancels.
 */
export async function loadDocument(bytes, kind, id, { askPassword } = {}) {
  if (kind === 'epub') {
    const { loadEpub } = await import('./epub.js');
    const book = await loadEpub(bytes);
    book.documentId = id;
    return book;
  }
  // No eval: closes the class of bug behind CVE-2024-4367. No embedded PDF JavaScript either.
  const task = pdfjs.getDocument({data:new Uint8Array(bytes).slice(), isEvalSupported:false, enableScripting:false});
  let used = null, triedSaved = false, cancelled = false;
  task.onPassword = (update, reason) => {
    const saved = sessionPasswords.get(id);
    if (saved && !triedSaved) { triedSaved = true; used = saved; update(saved); return; }
    const incorrect = reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
    Promise.resolve(askPassword ? askPassword({ incorrect }) : null).then(password => {
      if (password == null) { cancelled = true; task.destroy(); return; }
      used = password; update(password);
    });
  };
  let pdf;
  try { pdf = await task.promise; }
  catch (e) {
    if (cancelled || e?.name === 'PasswordException') throw new PasswordCancelled();
    throw e;
  }
  if (used) sessionPasswords.set(id, used);
  pdf.kind = 'pdf';
  pdf.documentId = id;
  pdf.passwordProtected = !!used;
  pdf.ocrMemory = new Map();
  // OCR results: memory first (protected PDFs never store them), then local storage.
  pdf.loadOcr = async n => pdf.ocrMemory.get(n) || (pdf.passwordProtected ? null : await loadOcrPage(id, n));
  const cache = new Map();
  pdf.getPageText = async n => {
    const ocr = await pdf.loadOcr(n);
    if (ocr?.text?.trim()) return ocr.text;
    if (!cache.has(n)) {
      const page = await pdf.getPage(n), content = await page.getTextContent();
      cache.set(n, content.items.map(item => item.str || '').join(' '));
    }
    return cache.get(n);
  };
  pdf.getSearchText = async n => {
    const ocr = await pdf.loadOcr(n);
    if (ocr?.words?.length) return ocr.words.map(w=>w.text+' ').join('');
    return (await (await pdf.getPage(n)).getTextContent()).items.map(i=>i.str||'').join('');
  };
  return pdf;
}
