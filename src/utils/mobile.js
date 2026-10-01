import { isCapacitor } from './platform.js';

/** PDF or EPUB, judged from the bytes themselves (Android often gives no file name). */
export function sniffKind(bytes) {
  const b = new Uint8Array(bytes.slice ? bytes.slice(0, 64) : bytes);
  const ascii = String.fromCharCode(...b);
  if (ascii.startsWith('%PDF')) return 'pdf';
  // EPUB = ZIP whose first entry is "mimetype" containing application/epub+zip.
  if (b[0] === 0x50 && b[1] === 0x4b && ascii.includes('mimetypeapplication/epub+zip')) return 'epub';
  return null;
}

/** A readable name for a file handed over by another app. */
export function nameFor(url, kind) {
  let last = '';
  try { last = decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch { /* opaque URI */ }
  if (new RegExp(`\\.${kind}$`, 'i').test(last)) return last.slice(0, 200);
  return `Shared ${kind === 'epub' ? 'book' : 'document'}.${kind}`;
}

const fromBase64 = text => {
  const binary = atob(text), out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
};

/**
 * Files opened in NightReader from Files, email or another app on Android and iOS
 * ("Open with" / "Open in"). Calls onFile({name, data}) for each. Returns a stop function.
 */
export async function watchMobileOpenedFiles(onFile, onError) {
  if (!isCapacitor()) return () => {};
  const { App } = await import('@capacitor/app');
  const { Filesystem } = await import('@capacitor/filesystem');
  const seen = new Set();
  async function open(url) {
    if (!url || seen.has(url) || !/^(content|file):/i.test(url)) return;
    seen.add(url);
    try {
      const { data } = await Filesystem.readFile({ path: url });
      const bytes = typeof data === 'string' ? fromBase64(data) : await data.arrayBuffer();
      const kind = sniffKind(bytes);
      if (!kind) throw new Error('That file isn\'t a PDF or EPUB.');
      await onFile({ name: nameFor(url, kind), data: bytes, kind });
      // iOS copies "Open in" files into the app's Inbox; the library keeps its own copy.
      if (url.startsWith('file:') && url.includes('/Inbox/')) Filesystem.deleteFile({ path: url }).catch(() => {});
    } catch (e) { onError(new Error(`Could not open the shared file: ${e?.message || e}`)); }
  }
  const launch = await App.getLaunchUrl().catch(() => null);
  if (launch?.url) await open(launch.url);
  const handle = await App.addListener('appUrlOpen', event => open(event.url));
  return () => handle.remove();
}
