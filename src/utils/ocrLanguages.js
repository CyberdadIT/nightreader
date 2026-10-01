// Extra OCR languages, downloaded on request. English ships with the app.
// Each pack comes from a pinned npm release on jsDelivr and is checked against the
// SHA-256 recorded here (of the uncompressed .traineddata, computed with `npm pack`
// when this list was made), so a changed or tampered file is refused, not used.
import { gunzipSync } from 'fflate';
import { saveOcrLanguage, loadOcrLanguage, deleteOcrLanguage, listOcrLanguages } from './storage.js';

export const OCR_PACK_VERSION = '1.0.0';
export const OCR_LANGUAGES = [
  { code: 'eng', name: 'English', bundled: true },
  { code: 'ara', name: 'Arabic', sha256: 'e7d6494e2ef249ee97ad151eb01e0e6ae3aaf429256442ad6af534862a2a8c0f', size: 2495395, download: 1661906 },
  { code: 'chi_sim', name: 'Chinese (Simplified)', sha256: '9784f7c917c546424b690fcde708ce1f604a4393d08bb51ddab146d7d7c794e6', size: 2471033, download: 1718768 },
  { code: 'chi_tra', name: 'Chinese (Traditional)', sha256: '6abfb87cce5db0d09624f16eedd8a0b24173718856121f721b6d1214193d4dab', size: 2368636, download: 1656239 },
  { code: 'ces', name: 'Czech', sha256: '8602be919dc0368d01255e1f03ba1003cffdca434f1ba5cc33cfec3ff72aaa32', size: 4342164, download: 2225029 },
  { code: 'nld', name: 'Dutch', sha256: '363c360db9838838ff7ed3d8b885b33acc0d61d37165708303cf8a81e50164f3', size: 6065224, download: 3005696 },
  { code: 'fra', name: 'French', sha256: 'bf83833fa957ff0076f6aa93f69e3bdf7b014dea829ea0c0d6be6b48a3ceef6d', size: 1248107, download: 707406 },
  { code: 'deu', name: 'German', sha256: 'a1b72cc25753eac167edfef5af4448a8dc34973503a2265c34c84520f896eb03', size: 2070514, download: 1333102 },
  { code: 'ell', name: 'Greek', sha256: 'c8dc383cf201efee45b3f83bf3f8d005bf544ace6a937c46813de5196ea5d79f', size: 2121037, download: 1324749 },
  { code: 'heb', name: 'Hebrew', sha256: 'a95d74d445e9bbb772a3572b4f01741309b3ab2c015773ef6fe7f25829c2dd0b', size: 1074644, download: 580576 },
  { code: 'hin', name: 'Hindi', sha256: '187d00e09ac523b0e7c8c3edf93050ffc1caa8083674fd637f6a493178c5caff', size: 1651097, download: 1389692 },
  { code: 'ind', name: 'Indonesian', sha256: '431ad6931126cfd70a35db57eb14823c090fc6174e0eaf1f400dd06b9cb1baf3', size: 1776253, download: 1194182 },
  { code: 'ita', name: 'Italian', sha256: '36ec897f5f1f489b257801881286167a79b99a16040c6fbc7e3e30f03821b10b', size: 3126172, download: 1660998 },
  { code: 'jpn', name: 'Japanese', sha256: '1a0175291ea145d4a66be681d1084496f10af938aacab247c5d40b31359a604e', size: 3039374, download: 2030256 },
  { code: 'kor', name: 'Korean', sha256: 'ec1749377d49ac38fb3d3cd05dd5e2a53359d329f359762bc638a81132109992', size: 2208378, download: 1572336 },
  { code: 'pol', name: 'Polish', sha256: '02b89cad819f1374631b4a3c92bdac79c214150f97a3686df78de6c8c30782db', size: 5426310, download: 2642356 },
  { code: 'por', name: 'Portuguese', sha256: '42fab1f017aedab69b92bdecc01bbb11166cd3b177575612ee860f8e2825ece0', size: 2422444, download: 1392239 },
  { code: 'rus', name: 'Russian', sha256: 'eb9be824435f6bb0f993925acb85fd842c8418d6db7613c818e749e619a1ad6d', size: 5053706, download: 2679598 },
  { code: 'spa', name: 'Spanish', sha256: '0062377729b81cc268b1822f09eb1c08c09f3f7f1c6b422540b51555a7eeea70', size: 3379457, download: 2100190 },
  { code: 'swe', name: 'Swedish', sha256: 'a4c33cbd23d988c84b5f9d5d5b2417fc16da061e3dc7b16acb904a4566088b14', size: 4167074, download: 2503095 },
  { code: 'tur', name: 'Turkish', sha256: 'f0127d0f3745f9c65e2ae7ec6b23198fbe5aa186a61b35661426f5e1ef9dedd7', size: 4680866, download: 2141291 },
  { code: 'ukr', name: 'Ukrainian', sha256: 'c9bceda0ec7f1cd8dc7642ec62221395066b98359fa0e988d5db82ceae727892', size: 4365622, download: 2114206 },
  { code: 'vie', name: 'Vietnamese', sha256: '112f6fd1d04ab4cb0208cad9cada8de214ae33a1e4db3750ffcda69262aef0a8', size: 1667949, download: 1423003 },
];
export const ocrLanguage = code => OCR_LANGUAGES.find(l => l.code === code);
export const ocrPackUrl = code => `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${code}@${OCR_PACK_VERSION}/4.0.0_best_int/${code}.traineddata.gz`;

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const isGzip = b => b[0] === 0x1f && b[1] === 0x8b;

/** Check pack bytes (gzipped or not) against the pinned hash; returns the uncompressed data. */
export async function verifyOcrPack(code, bytes) {
  const lang = ocrLanguage(code);
  if (!lang || lang.bundled) throw new Error('Unknown OCR language.');
  let data = new Uint8Array(bytes);
  if (isGzip(data)) {
    try { data = gunzipSync(data); } catch { throw new Error('The language pack is damaged.'); }
  }
  if (data.length !== lang.size || hex(await crypto.subtle.digest('SHA-256', data)) !== lang.sha256) {
    throw new Error(`The ${lang.name} language pack didn't match its checksum, so it wasn't installed.`);
  }
  return data;
}

/** Download, verify and store a language pack. onProgress(fraction). */
export async function installOcrLanguage(code, onProgress, signal) {
  const lang = ocrLanguage(code);
  if (!lang || lang.bundled) throw new Error('Unknown OCR language.');
  const response = await fetch(ocrPackUrl(code), { signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  if (!response.ok) throw new Error(`Couldn't download the ${lang.name} language pack (HTTP ${response.status}).`);
  const limit = lang.size + 1024 * 1024; // never more than the uncompressed size, whatever the server says
  const reader = response.body.getReader(), parts = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > limit) { reader.cancel(); throw new Error('The language pack is larger than expected, so it was refused.'); }
    parts.push(value);
    onProgress?.(Math.min(1, received / lang.download));
  }
  const bytes = new Uint8Array(received);
  let offset = 0; for (const p of parts) { bytes.set(p, offset); offset += p.length; }
  const data = await verifyOcrPack(code, bytes);
  await saveOcrLanguage(code, data);
  return data.length;
}

export const removeOcrLanguage = code => deleteOcrLanguage(code);
export async function installedOcrLanguages() {
  try { return ['eng', ...(await listOcrLanguages())]; } catch { return ['eng']; }
}

// tesseract.js reads language data from its own IndexedDB cache (idb-keyval:
// database "keyval-store", store "keyval") before trying to download anything.
// A verified pack is placed there under our own path, and the worker is told to read
// the cache only, so it never fetches language data from the network itself.
export const VERIFIED_CACHE_PATH = 'nr-verified';
function tesseractCache(mode, action) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('keyval-store');
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('keyval')) open.result.createObjectStore('keyval'); };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('keyval', mode), req = action(tx.objectStore('keyval'));
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

/** Make a stored pack available to the OCR worker. Re-checks it first. */
export async function prepareOcrLanguage(code) {
  if (code === 'eng') return;
  const stored = await loadOcrLanguage(code);
  const lang = ocrLanguage(code);
  if (!stored) throw new Error(`Download the ${lang?.name || code} language pack in NightReader settings first.`);
  const data = await verifyOcrPack(code, stored);
  await tesseractCache('readwrite', s => s.put(data, `${VERIFIED_CACHE_PATH}/${code}.traineddata`));
}
