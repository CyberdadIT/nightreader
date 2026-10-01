// A small local error log (last 30 entries), so a problem can be described and copied
// into a bug report. It stays on this device; nothing is sent anywhere.
const KEY = 'nightreader-errors', MAX = 30;

export function readErrors() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function logError(error, where = '') {
  try {
    const entry = {
      at: new Date().toISOString(),
      where: String(where).slice(0, 80),
      message: String(error?.message || error).slice(0, 500),
      // First lines of the stack only: enough to locate the problem, no document content.
      stack: String(error?.stack || '').split('\n').slice(0, 6).join('\n').slice(0, 1200),
      version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
    };
    localStorage.setItem(KEY, JSON.stringify([entry, ...readErrors()].slice(0, MAX)));
  } catch { /* storage full or unavailable: nothing more to do */ }
}

export const clearErrors = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

export const errorReport = () => readErrors().map(e => `${e.at} [${e.version}] ${e.where}\n${e.message}\n${e.stack}`).join('\n\n');

/** Log uncaught errors and rejected promises too, not only crashes in the interface. */
export function watchGlobalErrors() {
  window.addEventListener('error', e => logError(e.error || e.message, 'window'));
  window.addEventListener('unhandledrejection', e => logError(e.reason, 'promise'));
}
