import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { isTauri } from '../utils/platform.js';
import { checkForUpdate, updateCheckDue } from '../utils/updates.js';
import { openExternal } from '../utils/desktop.js';

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** Shows "a new version is available" on desktop. Mobile updates come through the app stores. */
export default function UpdateBanner() {
  const auto = useStore(s => s.autoUpdateCheck), dismissed = useStore(s => s.dismissedUpdate);
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    const { lastUpdateCheck, setUpdateCheck } = useStore.getState();
    if (!isTauri() || !auto || !updateCheckDue(lastUpdateCheck)) return;
    let cancelled = false;
    checkForUpdate(APP_VERSION)
      .then(result => { setUpdateCheck({ lastUpdateCheck: Date.now() }); if (!cancelled && result.status === 'available') setUpdate(result); })
      .catch(() => {}); // Offline or rate-limited: try again tomorrow, quietly.
    return () => { cancelled = true; };
  }, [auto]);
  if (!update || update.version === dismissed) return null;
  return (
    <div role="region" aria-label="Update available" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 14px', background: 'var(--panel)', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span>NightReader {update.version} is available. You have {APP_VERSION}.</span>
      <button onClick={() => openExternal(update.url)}>Download</button>
      <button onClick={() => useStore.getState().setUpdateCheck({ dismissedUpdate: update.version })}>Not now</button>
    </div>
  );
}
