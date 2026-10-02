import React, { useEffect, useRef, useState } from 'react';
import { unlock } from '../utils/vault.js';
import { deleteAllData } from '../utils/storage.js';

/** Shown at start (and after auto-lock) when the app lock is on. */
export default function LockScreen({ onUnlocked }) {
  const [passphrase, setPassphrase] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState(0), [waitUntil, setWaitUntil] = useState(0), [now, setNow] = useState(Date.now());
  const [resetting, setResetting] = useState(false), [confirmText, setConfirmText] = useState('');
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, [resetting]);
  useEffect(() => { if (waitUntil <= now) return; const t = setTimeout(() => setNow(Date.now()), 500); return () => clearTimeout(t); }, [waitUntil, now]);
  const waiting = waitUntil > now;

  async function submit(e) {
    e.preventDefault();
    if (busy || waiting || !passphrase) return;
    setBusy(true); setError('');
    const ok = await unlock(passphrase);
    setBusy(false);
    if (ok) { setPassphrase(''); onUnlocked(); return; }
    const count = failures + 1;
    setFailures(count); setPassphrase('');
    // After a few wrong tries, wait a little longer each time.
    if (count >= 3) { const until = Date.now() + Math.min(60, 2 ** (count - 2)) * 1000; setWaitUntil(until); setNow(Date.now()); }
    setError('That passphrase is not right.');
    input.current?.focus();
  }
  async function reset() {
    try { localStorage.clear(); } catch { /* ignore */ }
    await deleteAllData().catch(() => {});
    window.location.reload();
  }

  const box = { width: 'min(400px, 100%)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, color: 'var(--text)' };
  const field = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 15, margin: '10px 0' };
  const primary = { padding: '10px 16px', borderRadius: 8, border: 0, background: 'var(--accent)', color: '#041018', fontWeight: 600, fontSize: 14, width: '100%' };
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg)' }}>
      {!resetting ? (
        <form style={box} onSubmit={submit} aria-label="Unlock NightReader">
          <h1 style={{ fontSize: 22, marginBottom: 6 }}>☽ NightReader is locked</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>Enter your passphrase to open your library. Your documents and notes are encrypted on this device.</p>
          <input ref={input} type="password" aria-label="Passphrase" autoComplete="current-password" value={passphrase} onChange={e => setPassphrase(e.target.value)} style={field} disabled={busy} />
          <button type="submit" style={primary} disabled={busy || waiting || !passphrase}>{busy ? 'Unlocking…' : waiting ? `Try again in ${Math.ceil((waitUntil - now) / 1000)} s` : 'Unlock'}</button>
          {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{error}</p>}
          <button type="button" onClick={() => setResetting(true)} style={{ marginTop: 16, background: 'transparent', border: 0, color: 'var(--muted)', textDecoration: 'underline', fontSize: 12 }}>Forgot the passphrase?</button>
        </form>
      ) : (
        <form style={box} onSubmit={e => { e.preventDefault(); if (confirmText === 'DELETE') reset(); }} aria-label="Reset NightReader">
          <h1 style={{ fontSize: 20, marginBottom: 6 }}>Start again without the passphrase</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>There's no way to recover encrypted data without the passphrase: that's what keeps it safe. You can delete everything NightReader stored on this device and start again, then restore a backup if you have one. Your original document files are not affected.</p>
          <label style={{ fontSize: 13, display: 'block', marginTop: 10 }}>Type DELETE to confirm
            <input ref={input} aria-label="Type DELETE to confirm" value={confirmText} onChange={e => setConfirmText(e.target.value)} style={field} />
          </label>
          <button type="submit" disabled={confirmText !== 'DELETE'} style={{ ...primary, background: confirmText === 'DELETE' ? 'var(--danger)' : 'var(--surface)', color: confirmText === 'DELETE' ? '#fff' : 'var(--muted)' }}>Delete everything and start again</button>
          <button type="button" onClick={() => { setResetting(false); setConfirmText(''); }} style={{ marginTop: 12, background: 'transparent', border: 0, color: 'var(--muted)', textDecoration: 'underline', fontSize: 12 }}>Back</button>
        </form>
      )}
    </main>
  );
}
