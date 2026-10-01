// Content Security Policy for every build of NightReader.
// The Windows app (Tauri) applies it from src-tauri/tauri.conf.json; Android, iOS
// and browser builds get the same policy as a <meta> tag added at build time.
// tests/security.unit.test.js checks the two copies match.
//
// Why each source is allowed:
//   'wasm-unsafe-eval'     OCR runs Tesseract as WebAssembly. No JavaScript eval is allowed.
//   style 'unsafe-inline'  React and PDF.js position text with inline styles.
//   img blob: data:        EPUB images are served from blob: URLs made from the book itself.
//   ipc: / ipc.localhost   Tauri's bridge between the page and the native layer.
//   api.github.com         The once-a-day "new version available" check.
//   cdn.jsdelivr.net       Optional OCR language packs, verified against pinned SHA-256 hashes.
export const CSP = {
  'default-src': "'self'",
  'script-src': "'self' 'wasm-unsafe-eval'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' blob: data:",
  'font-src': "'self' data:",
  'connect-src': "'self' ipc: http://ipc.localhost https://api.github.com https://cdn.jsdelivr.net blob: data:",
  'worker-src': "'self' blob:",
  'media-src': "'none'",
  'object-src': "'none'",
  'frame-src': "'none'",
  'base-uri': "'none'",
  'form-action': "'none'",
};

export const cspString = (policy = CSP) => Object.entries(policy).map(([k, v]) => `${k} ${v}`).join('; ');
