// Document bytes and OCR stay in IndexedDB, not localStorage.
const openDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('nightreader', 3);
  request.onupgradeneeded = () => {
    // snapshots: copies of notes taken before anything removes them (sync, restore). ocr_langs: optional OCR language packs.
    for (const name of ['pdf_files', 'ocr', 'snapshots', 'ocr_langs']) {
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
export const savePdfData = (id, data) => transaction('pdf_files', 'readwrite', s => s.put(new Uint8Array(data), id));
export const loadPdfData = (id) => transaction('pdf_files', 'readonly', s => s.get(id));
export const deletePdfData = (id) => transaction('pdf_files', 'readwrite', s => s.delete(id));
export const saveOcrPage = (id, page, result) => transaction('ocr', 'readwrite', s => s.put(result, `${id}:${page}`));
export const loadOcrPage = (id, page) => transaction('ocr', 'readonly', s => s.get(`${id}:${page}`));
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
  await transaction('snapshots', 'readwrite', s => s.put({ at, reason, ...data }, at));
  const keys = await transaction('snapshots', 'readonly', s => s.getAllKeys());
  for (const key of keys.sort((a, b) => a - b).slice(0, Math.max(0, keys.length - MAX_SNAPSHOTS))) {
    await transaction('snapshots', 'readwrite', s => s.delete(key));
  }
  return at;
}
export const listSnapshots = async () => (await transaction('snapshots', 'readonly', s => s.getAll())).sort((a, b) => b.at - a.at);
export const loadSnapshot = at => transaction('snapshots', 'readonly', s => s.get(at));

// ── OCR language packs (downloaded on request, verified, kept offline) ─────
export const saveOcrLanguage = (code, bytes) => transaction('ocr_langs', 'readwrite', s => s.put(new Uint8Array(bytes), code));
export const loadOcrLanguage = code => transaction('ocr_langs', 'readonly', s => s.get(code));
export const deleteOcrLanguage = code => transaction('ocr_langs', 'readwrite', s => s.delete(code));
export const listOcrLanguages = () => transaction('ocr_langs', 'readonly', s => s.getAllKeys());
