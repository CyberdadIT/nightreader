import { useEffect } from 'react';
import { create } from 'zustand';
import { useStore } from '../store/useStore.js';
import { isTauri } from '../utils/platform.js';
import { runSync, keepNotes, syncState } from '../utils/syncEngine.js';

/**
 * Live sync status for the settings dialog (not saved).
 * state: idle | syncing | ok | error | confirm. In 'confirm', `removed` holds the notes
 * the sync would delete, waiting for the user to approve or keep them.
 */
export const useSyncStatus = create(set => ({
  state: 'idle', message: '', removed: [],
  set: (state, message = '', removed = []) => set({ state, message, removed }),
}));

let runNow = null;
/** Ask the running folder sync to go now (used by "Sync now" and the confirm buttons). */
export const syncNow = options => runNow?.(options);
/** Answer a sync that wanted to remove several notes. */
export async function answerRemovals(approve) {
  const { removed } = useSyncStatus.getState();
  if (!approve) keepNotes(removed);
  useSyncStatus.getState().set('syncing');
  await syncNow({ approveRemovals: approve });
}

/**
 * Keeps notes, bookmarks and reading positions in step with the sync folder:
 * on start, a few seconds after changes, every minute, and when the window regains focus.
 */
export function useFolderSync(ready) {
  const folder = useStore(s => s.syncFolder);
  useEffect(() => {
    if (!ready || !folder || !isTauri()) { useSyncStatus.getState().set('idle'); return; }
    let stopped = false, busy = false, again = false, timer;
    const status = useSyncStatus.getState().set;
    async function run({ approveRemovals = false } = {}) {
      if (stopped) return;
      if (busy) { again = true; return; }
      // A pending "remove notes?" question pauses automatic sync until it's answered.
      if (useSyncStatus.getState().state === 'confirm' && !approveRemovals) return;
      busy = true; status('syncing');
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await runSync({
          readRemote: () => invoke('sync_read', { folder }),
          writeRemote: contents => invoke('sync_write', { folder, contents }),
          approveRemovals,
        });
        if (stopped) return;
        if (result.status === 'confirm') {
          status('confirm', `The sync folder would remove ${result.removed.length} notes from this device.`, result.removed);
        } else {
          useStore.getState().setLastSyncAt(Date.now());
          status('ok');
        }
      } catch (e) {
        status('error', String(e?.message || e));
      } finally {
        busy = false;
        if (again && !stopped) { again = false; run(); }
      }
    }
    runNow = run;
    run();
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (syncState.applying) return;
      if (s.annotations !== prev.annotations || s.library !== prev.library || s.deletedAnnotations !== prev.deletedAnnotations
        || s.collections !== prev.collections || s.bookmarks !== prev.bookmarks) {
        clearTimeout(timer); timer = setTimeout(run, 5000);
      }
    });
    const poll = setInterval(run, 60_000);
    const onFocus = () => run();
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true; runNow = null; clearTimeout(timer); clearInterval(poll); unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, [folder, ready]);
}
