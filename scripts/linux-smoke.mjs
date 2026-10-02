// Smoke test for the Linux desktop app (Tauri + WebKitGTK), driven over WebDriver
// through tauri-driver. Checks what can differ from the browser tests: opening a file
// passed on the command line, PDF rendering and OCR (WebAssembly) under the app's CSP,
// WebCrypto for the app lock, and the native speech voices.
//
//   tauri-driver &               (needs WebKitWebDriver: apt install webkit2gtk-driver)
//   node scripts/linux-smoke.mjs <path to nightreader binary> [screenshot directory]
//
// Uses only Node's built-in fetch: no WebDriver client library needed.
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const binary = resolve(process.argv[2] || 'src-tauri/target/release/nightreader');
const shots = process.argv[3] ? resolve(process.argv[3]) : null;
const DRIVER = process.env.TAURI_DRIVER_URL || 'http://127.0.0.1:4444';
const fixture = name => resolve('tests/fixtures', name);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(method, path, body) {
  const res = await fetch(`${DRIVER}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok || data.value?.error) throw new Error(`${method} ${path}: ${data.value?.message || res.status}`);
  return data.value;
}

async function session(args = []) {
  const value = await call('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: binary, args } } } });
  const id = value.sessionId;
  const s = {
    run: (script, ...a) => call('POST', `/session/${id}/execute/sync`, { script, args: a }),
    runAsync: (script, ...a) => call('POST', `/session/${id}/execute/async`, { script, args: a }),
    async until(what, script, timeout = 60_000) {
      const end = Date.now() + timeout;
      for (;;) {
        const v = await s.run(script).catch(() => null);
        if (v) return v;
        if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
        await sleep(400);
      }
    },
    async click(text) {
      const ok = await s.run(`const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===arguments[0]||b.getAttribute('aria-label')===arguments[0]);if(b){b.click();return true}return false`, text);
      if (!ok) throw new Error(`No button "${text}"`);
    },
    async shot(name) {
      if (!shots) return;
      await mkdir(shots, { recursive: true });
      await writeFile(resolve(shots, `${name}.png`), Buffer.from(await call('GET', `/session/${id}/screenshot`), 'base64'));
    },
    end: () => call('DELETE', `/session/${id}`).catch(() => {}),
  };
  return s;
}

const results = [];
async function check(name, fn) {
  const started = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`); }
  catch (e) { results.push({ name, ok: false }); console.log(`✗ ${name}: ${e.message}`); }
}

// Collect CSP violations from the start of each page.
const CSP_WATCH = `if(!window.__csp){window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));}return true`;

let s = await session([fixture('reading.pdf')]);
await check('opens a PDF passed on the command line and renders it', async () => {
  await s.run(CSP_WATCH);
  await s.until('the document text', `return document.querySelector('[data-text-root]')?.textContent.includes('NightReader chapter 1')`);
  const painted = await s.run(`const c=document.querySelector('canvas');return c&&c.width>0`);
  if (!painted) throw new Error('page canvas is empty');
  await s.shot('linux-pdf');
});
await check('lists native voices, male and female', async () => {
  const labels = await s.until('voices', `const o=[...document.querySelectorAll('select[aria-label="Speech voice"] option')].map(o=>o.textContent);return o.length>1&&o`);
  if (!labels.some(l => / · male/.test(l)) || !labels.some(l => / · female/.test(l))) throw new Error(`voices: ${labels.slice(0, 8).join(', ')}`);
  console.log(`  ${labels.length - 1} voices, e.g. ${labels.slice(1, 4).join(' | ')}`);
});
await check('WebCrypto supports the app lock (PBKDF2 600k, AES-GCM key wrapping)', async () => {
  const ok = await s.runAsync(`const done=arguments[arguments.length-1];(async()=>{
    const enc=new TextEncoder(),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const base=await crypto.subtle.importKey('raw',enc.encode('correct horse battery'),'PBKDF2',false,['deriveKey']);
    const kek=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},base,{name:'AES-GCM',length:256},false,['wrapKey','unwrapKey']);
    const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
    const wrapped=await crypto.subtle.wrapKey('raw',key,kek,{name:'AES-GCM',iv});
    const back=await crypto.subtle.unwrapKey('raw',wrapped,kek,{name:'AES-GCM',iv},{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    const iv2=crypto.getRandomValues(new Uint8Array(12)),ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv2},back,enc.encode('note'));
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:iv2},back,ct))==='note';
  })().then(done,e=>done('error: '+e.message));`);
  if (ok !== true) throw new Error(String(ok));
});
await check('no Content Security Policy violations', async () => {
  const v = await s.run('return window.__csp||[]');
  if (v.length) throw new Error(v.join('; '));
});
await s.end();

s = await session([fixture('scanned.pdf')]);
await check('OCR (WebAssembly) works under the app CSP', async () => {
  await s.run(CSP_WATCH);
  await s.until('the scanned page', `return document.querySelector('[data-page] canvas')?.width>0`);
  await s.click('OCR this page');
  await s.until('OCR to finish', `return [...document.querySelectorAll('[role=status]')].some(e=>/OCR complete/.test(e.textContent))`, 120_000);
  const text = await s.run(`return document.querySelector('[data-text-root]')?.textContent||''`);
  if (!/Offline OCR/i.test(text)) throw new Error(`recognised: ${text.slice(0, 80)}`);
  const v = await s.run('return window.__csp||[]');
  if (v.length) throw new Error(`CSP: ${v.join('; ')}`);
  await s.shot('linux-ocr');
});
await s.end();

s = await session([fixture('styled.epub')]);
await check('opens an EPUB with its contents', async () => {
  await s.until('the book text', `return document.querySelector('.epubContent')?.textContent.includes('Once upon a time')`);
  await s.shot('linux-epub');
});
await s.end();

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
