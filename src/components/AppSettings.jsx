import React, { useState } from 'react';
import Dialog, { dialogStyles as styles } from './Dialog.jsx';
import { useStore } from '../store/useStore.js';
import { isTauri } from '../utils/platform.js';
import { chooseFolder, openExternal } from '../utils/desktop.js';
import { checkForUpdate, RELEASES_PAGE } from '../utils/updates.js';
import { syncNow, useSyncStatus } from '../hooks/useFolderSync.js';
import { APP_VERSION } from './UpdateBanner.jsx';

const when = t => (t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

export default function AppSettings({ onClose, onShortcuts }) {
  const desktop = isTauri();
  const folder = useStore(s => s.syncFolder), lastSyncAt = useStore(s => s.lastSyncAt);
  const autoUpdate = useStore(s => s.autoUpdateCheck);
  const sync = useSyncStatus();
  const [update, setUpdate] = useState(null), [checking, setChecking] = useState(false);

  async function pickFolder() {
    try {
      const chosen = await chooseFolder('Choose a folder to sync NightReader notes (for example OneDrive)');
      if (chosen) useStore.getState().setSyncFolder(chosen);
    } catch (e) { useSyncStatus.getState().set('error', e.message); }
  }
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
      {desktop ? <>
        <p>Keeps reading positions, highlights and notes in step through a folder you choose, such as OneDrive. Your documents themselves aren't copied: import the same file on another device and its notes appear.</p>
        <p><strong style={{ color: 'var(--text)' }}>Folder:</strong> {folder ? <code style={{ wordBreak: 'break-all' }}>{folder}</code> : 'not set'}</p>
        {folder && <p role="status">{sync.state === 'error' ? <span className={styles.error}>Sync problem: {sync.message}</span> : sync.state === 'syncing' ? 'Syncing…' : `Last synced: ${when(lastSyncAt)}`}</p>}
        <div className={styles.row}>
          <button onClick={pickFolder}>{folder ? 'Change folder…' : 'Choose sync folder…'}</button>
          {folder && <button onClick={() => syncNow()}>Sync now</button>}
          {folder && <button onClick={() => useStore.getState().setSyncFolder('')}>Stop syncing</button>}
        </div>
      </> : <p>Folder sync is available in the Windows app. Phone support is planned.</p>}

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

      <h3>Help</h3>
      <div className={styles.row}><button onClick={onShortcuts}>Keyboard and mouse shortcuts</button></div>
      <p style={{ marginTop: 12 }}>Offline dictionary: WordNet 3.0 © 2006 Princeton University, used under the WordNet licence. Text recognition: Tesseract. PDF rendering: PDF.js.</p>
    </Dialog>
  );
}
