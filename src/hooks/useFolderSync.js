import { useEffect } from 'react';
import { create } from 'zustand';
import { useStore } from '../store/useStore.js';
import { isTauri } from '../utils/platform.js';
import { mergeSync, parseSyncFile, syncFileText } from '../utils/sync.js';

/** Live sync status for the settings dialog (not saved). */
export const useSyncStatus = create(set => ({ state: 'idle', message: '', set: (state, message = '') => set({ state, message }) }));

let runNow = null;
/** Ask the running sync to go now (used by "Sync now"). */
export const syncNow = () => runNow?.();

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Keeps notes, highlights and reading positions in step with the sync folder:
 * on start, a few seconds after changes, every minute, and when the window regains focus.
 */
export function useFolderSync(ready) {
  const folder = useStore(s => s.syncFolder);
  useEffect(() => {
    if (!ready || !folder || !isTauri()) { useSyncStatus.getState().set('idle'); return; }
    let stopped = false, busy = false, again = false, applying = false, timer;
    const status = useSyncStatus.getState().set;
    async function run() {
      if (stopped) return;
      if (busy) { again = true; return; }
      busy = true; status('syncing');
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const text = await invoke('sync_read', { folder });
        const remote = text ? parseSyncFile(text) : null;
        const s = useStore.getState();
        const merged = mergeSync({ library: s.library, annotations: s.annotations, deletedAnnotations: s.deletedAnnotations, collections: s.collections }, remote);
        if (stopped) return;
        const patch = {};
        for (const key of ['library', 'annotations', 'deletedAnnotations', 'collections']) if (!same(merged[key], s[key])) patch[key] = merged[key];
        if (Object.keys(patch).length) { applying = true; useStore.setState(patch); applying = false; }
        const out = syncFileText(merged.file);
        if (out !== text) await invoke('sync_write', { folder, contents: out });
        useStore.getState().setLastSyncAt(Date.now());
        status('ok');
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
      if (applying) return;
      if (s.annotations !== prev.annotations || s.library !== prev.library || s.deletedAnnotations !== prev.deletedAnnotations || s.collections !== prev.collections) {
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
