// App lock and encryption at rest.
//
// A random 256-bit data key encrypts NightReader's stored data with AES-GCM: the
// library, notes and settings (localStorage), and the documents, OCR text, note
// snapshots and search index (IndexedDB). The data key is itself encrypted ("wrapped")
// with a key derived from your passphrase (PBKDF2-SHA-256, 600,000 iterations, random
// salt). Only the wrapped key and the salt are stored; the passphrase never is.
// Unlocking derives the wrapping key, unwraps the data key and keeps it in memory,
// non-extractable, until the app locks again.

export const LOCK_KEY = 'nightreader-lock';
export const ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 8;
const enc = new TextEncoder(), dec = new TextDecoder();

let dataKey = null;
// While the lock is being turned off, records are written in the clear even though the key is still in memory.
let writePlain = false;
export const setWritePlain = on => { writePlain = Boolean(on); };
const listeners = new Set();
export const isUnlocked = () => dataKey !== null;
export const onVaultChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = () => listeners.forEach(fn => fn());

// Base64 in chunks: spreading a large array into String.fromCharCode overflows the call stack.
function b64(bytes) {
  const b = new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(out);
}
const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

/** The stored lock record, or null when the app isn't locked with a passphrase. */
export function lockInfo() {
  try {
    const info = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
    return info?.v === 1 && info.salt && info.wrapped && info.iv ? info : null;
  } catch { return null; }
}
export const lockEnabled = () => lockInfo() !== null;

async function wrappingKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

async function wrap(key, passphrase, autoLockMinutes) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const kek = await wrappingKey(passphrase, salt, ITERATIONS);
  const wrapped = await crypto.subtle.wrapKey('raw', key, kek, { name: 'AES-GCM', iv });
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), wrapped: b64(wrapped), autoLockMinutes };
}

/** Try a passphrase. Returns true and keeps the data key in memory if it's right. */
export async function unlock(passphrase) {
  const info = lockInfo(); if (!info) return true;
  try {
    const kek = await wrappingKey(passphrase, unb64(info.salt), info.iterations || ITERATIONS);
    dataKey = await crypto.subtle.unwrapKey('raw', unb64(info.wrapped), kek, { name: 'AES-GCM', iv: unb64(info.iv) }, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    changed();
    return true;
  } catch { return false; } // AES-GCM authentication fails for a wrong passphrase
}

/** Turn the lock on: a new data key, wrapped with this passphrase. Data is re-encrypted by the caller. */
export async function createLock(passphrase, autoLockMinutes = 5) {
  if (String(passphrase).length < MIN_PASSPHRASE) throw new Error(`Use at least ${MIN_PASSPHRASE} characters.`);
  const extractable = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const info = await wrap(extractable, passphrase, autoLockMinutes);
  // Keep a non-extractable copy in memory: it can't be read out of the page afterwards.
  const raw = await crypto.subtle.exportKey('raw', extractable);
  dataKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  new Uint8Array(raw).fill(0);
  return info;
}
export const saveLockInfo = info => localStorage.setItem(LOCK_KEY, JSON.stringify(info));

/** New passphrase for the same data key (no re-encryption needed). */
export async function changePassphrase(oldPassphrase, newPassphrase) {
  if (String(newPassphrase).length < MIN_PASSPHRASE) throw new Error(`Use at least ${MIN_PASSPHRASE} characters.`);
  const info = lockInfo(); if (!info) throw new Error('The app lock is off.');
  let key;
  try {
    const kek = await wrappingKey(oldPassphrase, unb64(info.salt), info.iterations || ITERATIONS);
    key = await crypto.subtle.unwrapKey('raw', unb64(info.wrapped), kek, { name: 'AES-GCM', iv: unb64(info.iv) }, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  } catch { throw new Error('The current passphrase is wrong.'); }
  // Keep every other field (auto-lock time, an unfinished-migration marker).
  const fresh = await wrap(key, newPassphrase, info.autoLockMinutes);
  saveLockInfo({ ...info, ...fresh, ...(info.pending ? { pending: true } : {}) });
}

/** Check a passphrase without changing anything (for turning the lock off). */
export async function verifyPassphrase(passphrase) {
  const info = lockInfo(); if (!info) return true;
  try {
    const kek = await wrappingKey(passphrase, unb64(info.salt), info.iterations || ITERATIONS);
    await crypto.subtle.unwrapKey('raw', unb64(info.wrapped), kek, { name: 'AES-GCM', iv: unb64(info.iv) }, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return true;
  } catch { return false; }
}

export function setAutoLock(minutes) {
  const info = lockInfo(); if (info) saveLockInfo({ ...info, autoLockMinutes: minutes });
}

/** Forget the data key (the caller reloads the app so no decrypted data stays in memory). */
export function forgetKey() { dataKey = null; changed(); }
/** Turning the lock off: the caller has decrypted everything first. */
export function removeLock() { localStorage.removeItem(LOCK_KEY); dataKey = null; writePlain = false; changed(); }
/** Mark or clear an unfinished turn-on/turn-off, re-reading the record so nothing else is lost. */
export function setPending(on) {
  const info = lockInfo(); if (!info) return;
  const next = { ...info }; if (on) next.pending = true; else delete next.pending;
  saveLockInfo(next);
}

// ── Sealing records ────────────────────────────────────────────────────────
// A sealed record is { nrEnc: 1, iv, data, t } where t says what was sealed:
// 'b' bytes, 'j' a JSON value. Unsealed (older) records are returned as they are.
export const isSealed = value => Boolean(value && typeof value === 'object' && value.nrEnc === 1 && value.iv && value.data);

export async function seal(value) {
  if (value === undefined || value === null) return value;
  if (writePlain) return value;
  if (!dataKey) {
    // Never fall back to storing plaintext while the lock is on (e.g. a write racing an auto-lock).
    if (lockEnabled()) throw new Error('NightReader is locked.');
    return value;
  }
  const bytes = value instanceof ArrayBuffer || ArrayBuffer.isView(value);
  const plain = bytes ? new Uint8Array(value.buffer ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : value) : enc.encode(JSON.stringify(value));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, plain);
  return { nrEnc: 1, t: bytes ? 'b' : 'j', iv, data };
}

export async function unseal(record) {
  if (!isSealed(record)) return record;
  if (!dataKey) throw new Error('NightReader is locked.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, dataKey, record.data);
  return record.t === 'b' ? new Uint8Array(plain) : JSON.parse(dec.decode(plain));
}

/** Text versions for localStorage. */
export async function sealText(text) {
  if (writePlain) return text;
  const sealed = await seal(enc.encode(text));
  if (!isSealed(sealed)) return text;
  return JSON.stringify({ nrEnc: 1, t: 's', iv: b64(sealed.iv), data: b64(sealed.data) });
}
export async function unsealText(stored) {
  const v = JSON.parse(stored);
  if (!(v && v.nrEnc === 1 && v.t === 's')) return stored;
  if (!dataKey) throw new Error('NightReader is locked.');
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, dataKey, unb64(v.data)));
}

// ── Password-protected backup files ────────────────────────────────────────
// Layout: "NRENC1\n" · iterations (4 bytes, big-endian) · salt (16) · iv (12) · AES-GCM
// ciphertext. The magic and iteration count are authenticated as additional data.
const BACKUP_MAGIC = enc.encode('NRENC1\n');
const HEADER = BACKUP_MAGIC.length + 4, PREFIX = HEADER + 16 + 12;
export const isEncryptedBackup = bytes => {
  const b = new Uint8Array(bytes.slice ? bytes.slice(0, BACKUP_MAGIC.length) : bytes);
  return BACKUP_MAGIC.every((c, i) => b[i] === c);
};
async function backupKey(password, salt, iterations, usage) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(password).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}
export async function encryptBackup(bytes, password) {
  if (String(password).length < MIN_PASSPHRASE) throw new Error(`Use at least ${MIN_PASSPHRASE} characters for the backup password.`);
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const header = new Uint8Array(HEADER);
  header.set(BACKUP_MAGIC); new DataView(header.buffer).setUint32(BACKUP_MAGIC.length, ITERATIONS);
  const key = await backupKey(password, salt, ITERATIONS, 'encrypt');
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, bytes));
  const out = new Uint8Array(PREFIX + data.length);
  out.set(header); out.set(salt, HEADER); out.set(iv, HEADER + 16); out.set(data, PREFIX);
  return out;
}
export async function decryptBackup(bytes, password) {
  const b = new Uint8Array(bytes);
  if (b.length < PREFIX + 16 || !isEncryptedBackup(b)) throw new Error('This backup is damaged or incomplete.');
  const iterations = new DataView(b.buffer, b.byteOffset).getUint32(BACKUP_MAGIC.length);
  if (iterations < 100_000 || iterations > 10_000_000) throw new Error('This backup is damaged or incomplete.');
  try {
    const key = await backupKey(password, b.slice(HEADER, HEADER + 16), iterations, 'decrypt');
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(HEADER + 16, PREFIX), additionalData: b.slice(0, HEADER) }, key, b.slice(PREFIX)));
  } catch { throw new Error('Wrong password, or the backup is damaged.'); }
}
