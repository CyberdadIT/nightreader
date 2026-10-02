import React, { useEffect, useRef, useState } from 'react';
import Dialog, { dialogStyles as styles } from './Dialog.jsx';
import { useStore, whenSaved } from '../store/useStore.js';
import { isTauri, pickFile, saveBinaryFile, saveTextFile, copyToClipboard } from '../utils/platform.js';
import { chooseFolder, openExternal } from '../utils/desktop.js';
import { checkForUpdate, RELEASES_PAGE } from '../utils/updates.js';
import { syncNow, useSyncStatus, answerRemovals } from '../hooks/useFolderSync.js';
import { runSync, keepNotes } from '../utils/syncEngine.js';
import { makeBackup, restoreBackup, restoreSnapshot } from '../utils/backup.js';
import { listSnapshots, resealAll } from '../utils/storage.js';
import { MIN_PASSPHRASE, changePassphrase, createLock, decryptBackup, encryptBackup, isEncryptedBackup, isUnlocked, lockEnabled, lockInfo, removeLock, saveLockInfo, setAutoLock, setPending, setWritePlain, verifyPassphrase } from '../utils/vault.js';
import { lockNow } from '../utils/autoLock.js';
import { OCR_LANGUAGES, installOcrLanguage, installedOcrLanguages, removeOcrLanguage } from '../utils/ocrLanguages.js';
import { readErrors, clearErrors, errorReport } from '../utils/errorLog.js';
import { APP_VERSION } from './UpdateBanner.jsx';

const when = t => (t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
const megabytes = n => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const MAX_SYNC_FILE = 20 * 1024 * 1024;

/** Lists the notes a sync wants to remove, with Apply / Keep mine. */
function RemovalQuestion({ removed, onAnswer }) {
  return (
    <div role="alertdialog" aria-label="Sync wants to remove notes" style={{ border: '1px solid var(--warn)', borderRadius: 8, padding: 10, margin: '8px 0' }}>
      <p style={{ color: 'var(--text)' }}>This sync would remove {plural(removed.length, 'note')} from this device, because they were deleted on another device:</p>
      <ul style={{ margin: '0 0 8px 18px', fontSize: 12, color: 'var(--muted)', maxHeight: 120, overflow: 'auto' }}>
        {removed.slice(0, 20).map(n => <li key={n.id}>{(n.quote || n.note || 'Bookmark-style note').slice(0, 80)}{n.page ? ` (p. ${n.page})` : ''}</li>)}
        {removed.length > 20 && <li>…and {removed.length - 20} more</li>}
      </ul>
      <p>A snapshot is kept either way, so this can be undone below.</p>
      <div className={styles.row}>
        <button onClick={() => onAnswer(false)}>Keep mine</button>
        <button className={styles.primary} onClick={() => onAnswer(true)}>Remove them</button>
      </div>
    </div>
  );
}

function FolderSync() {
  const folder = useStore(s => s.syncFolder), lastSyncAt = useStore(s => s.lastSyncAt);
  const sync = useSyncStatus();
  async function pickFolder() {
    try {
      const chosen = await chooseFolder('Choose a folder to sync NightReader notes (for example OneDrive)');
      if (chosen) useStore.getState().setSyncFolder(chosen);
    } catch (e) { useSyncStatus.getState().set('error', e.message); }
  }
  return <>
    <p>Keeps reading positions, highlights and notes in step through a folder you choose, such as OneDrive. Your documents themselves aren't copied: import the same file on another device and its notes appear. Notes from password-protected PDFs stay on this device.</p>
    <p><strong style={{ color: 'var(--text)' }}>Folder:</strong> {folder ? <code style={{ wordBreak: 'break-all' }}>{folder}</code> : 'not set'}</p>
    {folder && sync.state !== 'confirm' && <p role="status">{sync.state === 'error' ? <span className={styles.error}>Sync problem: {sync.message}</span> : sync.state === 'syncing' ? 'Syncing…' : `Last synced: ${when(lastSyncAt)}`}</p>}
    {sync.state === 'confirm' && <RemovalQuestion removed={sync.removed} onAnswer={answerRemovals} />}
    <div className={styles.row}>
      <button onClick={pickFolder}>{folder ? 'Change folder…' : 'Choose sync folder…'}</button>
      {folder && <button onClick={() => syncNow()} disabled={sync.state === 'syncing'}>Sync now</button>}
      {folder && <button onClick={() => useStore.getState().setSyncFolder('')}>Stop syncing</button>}
    </div>
  </>;
}

/**
 * Phones (and the web build) can't watch a cloud folder, so sync is a two-step file
 * exchange: open nightreader-sync.json from OneDrive/Drive/iCloud, and save the merged
 * copy back through the share sheet. The merge rules are exactly the Windows ones.
 */
function FileSync() {
  const [state, setState] = useState({ status: '', removed: [] });
  const pending = useRef(null);
  async function exchange(text, approveRemovals = false) {
    setState({ status: 'Merging…', removed: [] });
    const result = await runSync({
      readRemote: async () => text,
      writeRemote: async contents => { await saveTextFile('nightreader-sync.json', contents, 'application/json'); },
      approveRemovals,
    });
    if (result.status === 'confirm') { pending.current = text; setState({ status: '', removed: result.removed }); return; }
    pending.current = null;
    useStore.getState().setLastSyncAt(Date.now());
    setState({ status: 'Merged. Save the updated nightreader-sync.json back to the same cloud folder (replace the old one) so your other devices see it.', removed: [] });
  }
  async function openSyncFile() {
    try {
      const file = await pickFile('.json,application/json');
      if (!file) return;
      if (file.data.byteLength > MAX_SYNC_FILE) throw new Error('That file is too large to be a NightReader sync file.');
      await exchange(new TextDecoder().decode(file.data));
    } catch (e) { setState({ status: `Sync problem: ${e.message}`, removed: [] }); }
  }
  async function answer(approve) {
    try {
      if (!approve) keepNotes(state.removed);
      await exchange(pending.current, approve);
    } catch (e) { setState({ status: `Sync problem: ${e.message}`, removed: [] }); }
  }
  return <>
    <p>On phones, sync works through a file: open <code>nightreader-sync.json</code> from the NightReader folder in OneDrive, Google Drive or iCloud (the same file the Windows app keeps up to date), and NightReader merges it with this device and gives you the updated copy to save back.</p>
    {state.removed.length > 0 && <RemovalQuestion removed={state.removed} onAnswer={answer} />}
    <div className={styles.row}>
      <button onClick={openSyncFile}>Open sync file…</button>
      <button onClick={() => exchange('').catch(e => setState({ status: `Sync problem: ${e.message}`, removed: [] }))}>Create a new sync file</button>
    </div>
    {state.status && <p role="status">{state.status}</p>}
  </>;
}

function BackupSection() {
  const [withDocs, setWithDocs] = useState(false), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const [protect, setProtect] = useState(lockEnabled()), [password, setPassword] = useState(''), [restoreFile, setRestoreFile] = useState(null), [restorePassword, setRestorePassword] = useState('');
  async function backup() {
    setBusy(true); setStatus('Preparing backup…');
    try {
      if (protect && password.length < MIN_PASSPHRASE) throw new Error(`Use at least ${MIN_PASSPHRASE} characters for the backup password.`);
      const result = await makeBackup({ includeDocuments: withDocs });
      const bytes = protect ? await encryptBackup(result.bytes, password) : result.bytes;
      const name = `nightreader-backup-${new Date().toISOString().slice(0, 10)}.${protect ? 'nrbackup' : 'zip'}`;
      const saved = await saveBinaryFile(name, bytes, protect ? 'application/octet-stream' : 'application/zip');
      result.bytes = bytes;
      setStatus(saved === false ? '' : `Backup saved (${megabytes(result.bytes.length)}${withDocs ? `, ${plural(result.documents, 'document')}` : ''}).${result.missing ? ` ${plural(result.missing, 'document')} weren't on this device and were left out.` : ''}`);
    } catch (e) { setStatus(`Couldn't make the backup: ${e.message}`); }
    finally { setBusy(false); }
  }
  async function restore() {
    try {
      const file = restoreFile || await pickFile('.zip,.nrbackup,application/zip');
      if (!file) return;
      let data = file.data;
      if (isEncryptedBackup(data)) {
        if (!restoreFile || !restorePassword) { setRestoreFile(file); setStatus('This backup is password-protected. Enter its password, then press Restore again.'); return; }
        setBusy(true); setStatus('Decrypting…');
        data = await decryptBackup(data, restorePassword);
      }
      setBusy(true); setStatus('Restoring…');
      const r = await restoreBackup(data);
      setRestoreFile(null); setRestorePassword('');
      setStatus(`Restored: ${plural(r.notesAdded, 'new note')}, ${plural(r.notesUpdated, 'updated note')}, ${plural(r.libraryAdded, 'library entry')}, ${plural(r.documentsAdded, 'document')}.${r.rejected ? ` ${plural(r.rejected, 'document')} didn't match their records and were skipped.` : ''} Nothing on this device was deleted.`);
    } catch (e) { setStatus(e.message); }
    finally { setBusy(false); }
  }
  return <>
    <p>One file with your library list, notes, highlights, bookmarks and reading settings. Restoring adds what's missing and keeps the newer copy of anything on both; it never deletes.</p>
    <label className={styles.row} style={{ fontSize: 13 }}>
      <input type="checkbox" checked={withDocs} onChange={e => setWithDocs(e.target.checked)} />
      Include the documents themselves (larger file)
    </label>
    <label className={styles.row} style={{ fontSize: 13 }}>
      <input type="checkbox" checked={protect} onChange={e => setProtect(e.target.checked)} />
      Protect the backup with a password (AES-256)
    </label>
    {protect && <input type="password" aria-label="Backup password" autoComplete="new-password" placeholder={`Backup password (${MIN_PASSPHRASE}+ characters)`} value={password} onChange={e => setPassword(e.target.value)} />}
    {restoreFile && <input type="password" aria-label="Password of the backup to restore" placeholder="Password of this backup" value={restorePassword} onChange={e => setRestorePassword(e.target.value)} />}
    <div className={styles.row}>
      <button onClick={backup} disabled={busy}>Save backup…</button>
      <button onClick={restore} disabled={busy}>Restore from backup…</button>
    </div>
    {status && <p role="status">{status}</p>}
  </>;
}

const AUTO_LOCK = [[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [60, '1 hour'], [0, 'Only when I lock it']];

/** Passphrase lock with encryption of everything NightReader stores on this device. */
function AppLockSection() {
  const unfinished = Boolean(lockInfo()?.pending);
  const [on, setOn] = useState(lockEnabled() && !unfinished), [mode, setMode] = useState(unfinished ? 'on' : null);
  const [a, setA] = useState(''), [b, setB] = useState(''), [old, setOld] = useState('');
  const [minutes, setMinutes] = useState(lockInfo()?.autoLockMinutes ?? 5), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const reset = () => { setMode(null); setA(''); setB(''); setOld(''); };
  const progress = (done, total) => setStatus(`Encrypting stored data… ${done} of ${total}`);

  async function turnOn(e) {
    e.preventDefault();
    const unfinished = lockInfo()?.pending && isUnlocked();
    if (!unfinished) {
      if (a.length < MIN_PASSPHRASE) { setStatus(`Use at least ${MIN_PASSPHRASE} characters. A short sentence is easier to remember and harder to guess.`); return; }
      if (a !== b) { setStatus("The two passphrases don't match."); return; }
    }
    setBusy(true); setStatus('Setting up…');
    try {
      // Saved first and marked unfinished: if the app closes part-way, the passphrase
      // still opens everything and encryption finishes on the next start. A retry after
      // a failure carries on with the same key rather than making a new one.
      if (!unfinished) saveLockInfo({ ...(await createLock(a, Number(minutes))), pending: true });
      useStore.setState({});             // re-save the library and notes, now encrypted
      await whenSaved();
      const { failed } = await resealAll(true, progress); // documents, OCR text, snapshots, search index
      if (failed) throw new Error(`${failed} stored item${failed === 1 ? '' : 's'} couldn't be encrypted (storage full?). Free some space and press the button again to finish.`);
      setPending(false);
      clearErrors(); // the stored error log isn't encrypted; from now on errors stay in memory
      setOn(true); reset();
      setStatus('App lock is on. Your library, notes and documents on this device are encrypted.');
    } catch (err) { setStatus(`Couldn't finish turning the lock on: ${err.message}`); setOn(lockEnabled()); }
    finally { setBusy(false); }
  }
  async function turnOff(e) {
    e.preventDefault();
    setBusy(true); setStatus('Checking…');
    try {
      if (!(await verifyPassphrase(old))) { setStatus('That passphrase is not right.'); return; }
      setPending(true);                  // if interrupted, the next start re-encrypts
      setWritePlain(true);               // new writes are plain from here on
      const { failed } = await resealAll(false, (done, total) => setStatus(`Decrypting stored data… ${done} of ${total}`));
      if (failed) { setWritePlain(false); await resealAll(true); setPending(false); throw new Error(`${failed} stored item${failed === 1 ? '' : 's'} couldn't be decrypted, so the lock stays on.`); }
      removeLock();
      useStore.setState({});
      setOn(false); reset();
      setStatus('App lock is off. Stored data is no longer encrypted.');
    } catch (err) { setStatus(`Couldn't turn the lock off: ${err.message}`); }
    finally { setBusy(false); }
  }
  async function change(e) {
    e.preventDefault();
    if (a !== b) { setStatus("The two new passphrases don't match."); return; }
    setBusy(true);
    try { await changePassphrase(old, a); reset(); setStatus('Passphrase changed.'); }
    catch (err) { setStatus(err.message); }
    finally { setBusy(false); }
  }
  const newFields = <>
    <input type="password" aria-label="New passphrase" autoComplete="new-password" placeholder={`New passphrase (${MIN_PASSPHRASE}+ characters)`} value={a} onChange={e => setA(e.target.value)} />
    <input type="password" aria-label="Repeat the new passphrase" autoComplete="new-password" placeholder="Repeat it" value={b} onChange={e => setB(e.target.value)} />
  </>;
  return <>
    <p>{on ? 'On. NightReader asks for your passphrase when it starts and after the time below without use. Everything it stores on this device is encrypted (AES-256).'
      : 'Lock NightReader with a passphrase and encrypt your library, notes and stored documents on this device. If you forget the passphrase, the data can\'t be recovered (keep a backup).'}</p>
    <label className={styles.row} style={{ fontSize: 13 }}>Lock after
      <select aria-label="Lock after" value={minutes} onChange={e => { setMinutes(Number(e.target.value)); if (on) setAutoLock(Number(e.target.value)); }} style={{ width: 'auto' }}>
        {AUTO_LOCK.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {!on && mode !== 'on' && <div className={styles.row}><button onClick={() => { setMode('on'); setStatus(''); }}>Turn on app lock…</button></div>}
    {!on && mode === 'on' && <form onSubmit={turnOn} style={{ display: 'grid', gap: 8 }}>{unfinished ? <p>Encryption didn't finish last time. Your passphrase is already set.</p> : newFields}
      <div className={styles.row}><button type="button" onClick={reset}>Cancel</button><button type="submit" className={styles.primary} disabled={busy}>Turn on and encrypt</button></div></form>}
    {on && !mode && <div className={styles.row}>
      <button onClick={lockNow}>Lock now</button>
      <button onClick={() => { setMode('change'); setStatus(''); }}>Change passphrase…</button>
      <button onClick={() => { setMode('off'); setStatus(''); }}>Turn off…</button>
    </div>}
    {on && mode === 'change' && <form onSubmit={change} style={{ display: 'grid', gap: 8 }}>
      <input type="password" aria-label="Current passphrase" autoComplete="current-password" placeholder="Current passphrase" value={old} onChange={e => setOld(e.target.value)} />{newFields}
      <div className={styles.row}><button type="button" onClick={reset}>Cancel</button><button type="submit" className={styles.primary} disabled={busy}>Change passphrase</button></div></form>}
    {on && mode === 'off' && <form onSubmit={turnOff} style={{ display: 'grid', gap: 8 }}>
      <input type="password" aria-label="Current passphrase" autoComplete="current-password" placeholder="Current passphrase" value={old} onChange={e => setOld(e.target.value)} />
      <div className={styles.row}><button type="button" onClick={reset}>Cancel</button><button type="submit" disabled={busy}>Turn off and decrypt</button></div></form>}
    {status && <p role="status">{status}</p>}
    {on && <p>The sync file and unprotected backups are not encrypted by the lock. Protect backups with a password below, and keep the sync folder somewhere private.</p>}
  </>;
}

function SnapshotsSection() {
  const [snapshots, setSnapshots] = useState(null), [status, setStatus] = useState('');
  const load = () => listSnapshots().then(setSnapshots).catch(() => setSnapshots([]));
  return (
    <details onToggle={e => { if (e.currentTarget.open && !snapshots) load(); }}>
      <summary style={{ cursor: 'pointer', fontSize: 13 }}>Earlier versions of your notes</summary>
      <p style={{ marginTop: 8 }}>NightReader saves a copy of your notes before a sync or restore removes any. Restoring one brings back missing notes without removing newer ones.</p>
      {snapshots?.length === 0 && <p>No snapshots yet.</p>}
      <ul style={{ listStyle: 'none', display: 'grid', gap: 6 }}>
        {snapshots?.map(s => (
          <li key={s.at} className={styles.row} style={{ justifyContent: 'space-between', fontSize: 12 }}>
            <span>{when(s.at)} · {s.reason} · {plural(s.annotations?.length || 0, 'note')}</span>
            <button onClick={async () => { try { const r = await restoreSnapshot(s); setStatus(`Brought back ${plural(r.notesAdded, 'note')}, updated ${r.notesUpdated}.`); load(); } catch (e) { setStatus(e.message); } }}>Restore</button>
          </li>
        ))}
      </ul>
      {status && <p role="status">{status}</p>}
    </details>
  );
}

function OcrLanguagesSection() {
  const [installed, setInstalled] = useState(['eng']), [busy, setBusy] = useState(''), [status, setStatus] = useState('');
  const ocrLanguage = useStore(s => s.ocrLanguage);
  const abort = useRef(null);
  useEffect(() => { installedOcrLanguages().then(setInstalled); return () => abort.current?.abort(); }, []);
  async function install(lang) {
    abort.current = new AbortController();
    setBusy(lang.code); setStatus(`Downloading ${lang.name}…`);
    try {
      await installOcrLanguage(lang.code, f => setStatus(`Downloading ${lang.name}… ${Math.round(f * 100)}%`), abort.current.signal);
      setInstalled(await installedOcrLanguages());
      useStore.getState().setOcrLanguage(lang.code);
      setStatus(`${lang.name} is ready and checked. It's now the OCR language.`);
    } catch (e) { setStatus(e.name === 'AbortError' ? '' : e.message); }
    finally { setBusy(''); }
  }
  async function remove(lang) {
    await removeOcrLanguage(lang.code);
    if (ocrLanguage === lang.code) useStore.getState().setOcrLanguage('eng');
    setInstalled(await installedOcrLanguages());
  }
  return (
    <details>
      <summary style={{ cursor: 'pointer', fontSize: 13 }}>Text recognition languages ({installed.length} installed)</summary>
      <p style={{ marginTop: 8 }}>English is built in. Other languages download once (1–3 MB each) from jsDelivr, are checked against a fixed checksum before use, and then work offline.</p>
      <ul style={{ listStyle: 'none', display: 'grid', gap: 4 }}>
        {OCR_LANGUAGES.map(lang => {
          const has = installed.includes(lang.code);
          return (
            <li key={lang.code} className={styles.row} style={{ justifyContent: 'space-between', fontSize: 12, margin: 0 }}>
              <span>{lang.name}{lang.code === ocrLanguage ? ' · in use' : ''}</span>
              {lang.bundled ? <span style={{ color: 'var(--muted)' }}>Built in</span>
                : has ? <button onClick={() => remove(lang)} aria-label={`Remove ${lang.name}`}>Remove</button>
                : <button onClick={() => install(lang)} disabled={!!busy} aria-label={`Download ${lang.name}`}>{busy === lang.code ? 'Downloading…' : `Download (${megabytes(lang.download)})`}</button>}
            </li>
          );
        })}
      </ul>
      {status && <p role="status" style={{ marginTop: 8 }}>{status}</p>}
    </details>
  );
}

function StorageSection() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all([navigator.storage?.persisted?.().catch(() => null), navigator.storage?.estimate?.().catch(() => null)])
      .then(([persisted, estimate]) => { if (live) setInfo({ persisted, estimate }); });
    return () => { live = false; };
  }, []);
  if (!info) return null;
  return <p>
    {info.estimate?.usage != null && <>Using {megabytes(info.estimate.usage)} on this device. </>}
    {info.persisted === true ? 'Storage is marked as permanent, so the system won\'t clear it to free space.'
      : info.persisted === false ? 'The system may clear stored documents if space runs very low; keep a backup.' : ''}
  </p>;
}

function ErrorLogSection() {
  const [errors, setErrors] = useState(readErrors()), [copied, setCopied] = useState(false);
  return <>
    <p>{errors.length ? `${plural(errors.length, 'problem')} recorded on this device (most recent ${when(Date.parse(errors[0].at))}). The log stays here; nothing is sent anywhere.` : 'No problems recorded.'}</p>
    {errors.length > 0 && <div className={styles.row}>
      <button onClick={async () => { await copyToClipboard(`NightReader ${APP_VERSION}\n${navigator.userAgent}\n\n${errorReport()}`); setCopied(true); }}>{copied ? 'Copied' : 'Copy error details'}</button>
      <button onClick={() => { clearErrors(); setErrors([]); }}>Clear log</button>
    </div>}
  </>;
}

export default function AppSettings({ onClose, onShortcuts }) {
  const desktop = isTauri();
  const autoUpdate = useStore(s => s.autoUpdateCheck);
  const [update, setUpdate] = useState(null), [checking, setChecking] = useState(false);

  async function checkNow() {
    setChecking(true); setUpdate(null);
    try {
      const result = await checkForUpdate(APP_VERSION);
      useStore.getState().setUpdateCheck({ lastUpdateCheck: Date.now() });
      setUpdate(result);
    } catch (e) { setUpdate({ status: 'error', message: e.message }); }
    finally { setChecking(false); }
  }

  return (
    <Dialog title="NightReader settings" onClose={onClose}>
      <h3>Sync</h3>
      {desktop ? <FolderSync /> : <FileSync />}

      <h3>App lock</h3>
      <AppLockSection />

      <h3>Backup</h3>
      <BackupSection />
      <SnapshotsSection />

      <h3>Text recognition</h3>
      <OcrLanguagesSection />

      <h3>Updates</h3>
      <p>You're using NightReader {APP_VERSION}.</p>
      {desktop ? <>
        <label className={styles.row} style={{ fontSize: 13 }}>
          <input type="checkbox" checked={autoUpdate} onChange={e => useStore.getState().setAutoUpdateCheck(e.target.checked)} />
          Check for new versions once a day (contacts GitHub; nothing else is sent)
        </label>
        <div className={styles.row}>
          <button onClick={checkNow} disabled={checking}>{checking ? 'Checking…' : 'Check now'}</button>
          {update?.status === 'available' && <button className={styles.primary} onClick={() => openExternal(update.url)}>Download {update.version}</button>}
        </div>
        {update && <p role="status">{
          update.status === 'available' ? `Version ${update.version} is available.` :
          update.status === 'current' ? 'You have the latest version.' :
          update.status === 'none' ? 'No releases have been published yet.' : <span className={styles.error}>{update.message}</span>}</p>}
      </> : <p>Updates for the phone apps come through the app store. <button onClick={() => openExternal(RELEASES_PAGE)}>Release notes</button></p>}

      <h3>Storage and diagnostics</h3>
      <StorageSection />
      <ErrorLogSection />

      <h3>Help</h3>
      <div className={styles.row}><button onClick={onShortcuts}>Keyboard, mouse and touch shortcuts</button></div>
      <p style={{ marginTop: 12 }}>Offline dictionary: WordNet 3.0 © 2006 Princeton University, used under the WordNet licence. Text recognition: Tesseract. PDF rendering: PDF.js.</p>
    </Dialog>
  );
}
