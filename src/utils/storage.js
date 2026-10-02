// Document bytes and OCR stay in IndexedDB, not localStorage.
// With the app lock on, every record here except OCR language packs is sealed
// (AES-GCM, see vault.js) before it's stored and opened again when it's read.
import { seal, unseal, isSealed } from './vault.js';
const openDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('nightreader', 4);
  request.onupgradeneeded = () => {
    // snapshots: copies of notes taken before anything removes them (sync, restore). ocr_langs: optional OCR language packs.
    // text_index: each document's text by page, for searching the whole library.
    for (const name of ['pdf_files', 'ocr', 'snapshots', 'ocr_langs', 'text_index']) {
      if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function transaction(store, mode, action) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = action(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error || req.error);
      tx.onabort = () => reject(tx.error || new Error('Storage operation aborted'));
    });
  } finally { db.close(); }
}
export const savePdfData = async (id, data) => { const value = await seal(new Uint8Array(data)); return transaction('pdf_files', 'readwrite', s => s.put(value, id)); };
export const loadPdfData = async (id) => unseal(await transaction('pdf_files', 'readonly', s => s.get(id)));
export const deletePdfData = (id) => transaction('pdf_files', 'readwrite', s => s.delete(id));
export const saveOcrPage = async (id, page, result) => { const value = await seal(result); return transaction('ocr', 'readwrite', s => s.put(value, `${id}:${page}`)); };
export const loadOcrPage = async (id, page) => unseal(await transaction('ocr', 'readonly', s => s.get(`${id}:${page}`)));
export async function deleteOcrPages(id) {
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('ocr', 'readwrite');
      const req = tx.objectStore('ocr').openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(`${id}:`)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function documentId(data) {
  const bytes = new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}

// ── Note snapshots ─────────────────────────────────────────────────────────
// Taken automatically before sync or a restore removes notes, and at most once a
// day otherwise. The newest 20 are kept.
const MAX_SNAPSHOTS = 20;
export async function saveSnapshot(reason, data) {
  const at = Date.now();
  const value = await seal({ at, reason, ...data });
  await transaction('snapshots', 'readwrite', s => s.put(value, at));
  const keys = await transaction('snapshots', 'readonly', s => s.getAllKeys());
  for (const key of keys.sort((a, b) => a - b).slice(0, Math.max(0, keys.length - MAX_SNAPSHOTS))) {
    await transaction('snapshots', 'readwrite', s => s.delete(key));
  }
  return at;
}
export const listSnapshots = async () => (await Promise.all((await transaction('snapshots', 'readonly', s => s.getAll())).map(unseal))).sort((a, b) => b.at - a.at);
export const loadSnapshot = async at => unseal(await transaction('snapshots', 'readonly', s => s.get(at)));

// ── OCR language packs (downloaded on request, verified, kept offline) ─────
export const saveOcrLanguage = (code, bytes) => transaction('ocr_langs', 'readwrite', s => s.put(new Uint8Array(bytes), code));
export const loadOcrLanguage = code => transaction('ocr_langs', 'readonly', s => s.get(code));
export const deleteOcrLanguage = code => transaction('ocr_langs', 'readwrite', s => s.delete(code));
export const listOcrLanguages = () => transaction('ocr_langs', 'readonly', s => s.getAllKeys());

// ── Library search index (each document's text, page by page) ─────────
export const saveTextIndex = async (id, entry) => { const value = await seal(entry); return transaction('text_index', 'readwrite', s => s.put(value, id)); };
export const loadTextIndex = async id => unseal(await transaction('text_index', 'readonly', s => s.get(id)));
export const deleteTextIndex = id => transaction('text_index', 'readwrite', s => s.delete(id));
export const listTextIndexes = () => transaction('text_index', 'readonly', s => s.getAllKeys());

// ── Turning the app lock on or off ─────────────────────────────────────────
export const SEALED_STORES = ['pdf_files', 'ocr', 'snapshots', 'text_index'];
const sameRecord = (a, b) => {
  if (isSealed(a) || isSealed(b)) return isSealed(a) && isSealed(b) && a.iv.length === b.iv.length && a.iv.every((v, i) => v === b.iv[i]);
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) return ArrayBuffer.isView(a) && ArrayBuffer.isView(b) && a.byteLength === b.byteLength && a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
  return JSON.stringify(a) === JSON.stringify(b);
};
/**
 * Rewrite every record so it matches the lock: sealed when `lock` is true (the data
 * key must be in memory), plain when false (call setWritePlain(true) first, so new
 * writes are plain too). Passes repeat until nothing is left to convert, so records
 * written meanwhile are caught. A record is replaced only if it hasn't changed since
 * it was read. Returns { converted, failed }; onProgress(done, total).
 */
export async function resealAll(lock, onProgress) {
  let converted = 0, failed = 0;
  for (let pass = 0; pass < 5; pass++) {
    const work = [];
    for (const store of SEALED_STORES) for (const key of await transaction(store, 'readonly', s => s.getAllKeys())) work.push([store, key]);
    let changedThisPass = 0, done = 0;
    failed = 0;
    for (const [store, key] of work) {
      try {
        const stored = await transaction(store, 'readonly', s => s.get(key));
        if (stored !== undefined && isSealed(stored) !== lock) {
          const plain = await unseal(stored);
          const value = lock ? await seal(plain) : plain;
          if (lock && !isSealed(value)) throw new Error('No key to seal with.');
          await transaction(store, 'readwrite', s => {
            const check = s.get(key);
            check.onsuccess = () => { if (check.result !== undefined && sameRecord(check.result, stored)) s.put(value, key); };
            return check;
          });
          changedThisPass++;
        }
      } catch { failed++; }
      onProgress?.(++done, work.length);
    }
    converted += changedThisPass;
    if (!changedThisPass) break;
  }
  return { converted, failed };
}
/** Delete everything NightReader keeps in IndexedDB (forgotten passphrase → start again). */
export const deleteAllData = () => new Promise((resolve, reject) => {
  const request = indexedDB.deleteDatabase('nightreader');
  request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = resolve;
});
