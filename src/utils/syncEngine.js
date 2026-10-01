// One sync pass, shared by folder sync (Windows) and sync-file import/export (phones).
import { useStore } from '../store/useStore.js';
import { mergeSync, parseSyncFile, syncFileText, CONFIRM_REMOVALS } from './sync.js';
import { saveSnapshot } from './storage.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SYNCED = ['library', 'annotations', 'deletedAnnotations', 'collections', 'bookmarks'];

/** True while a sync result is being written into the store (so it doesn't trigger another sync). */
export const syncState = { applying: false };

/**
 * Read the shared file, merge, apply, write back.
 * Returns { status: 'ok' } or, when it would remove CONFIRM_REMOVALS or more notes and
 * removals weren't approved, { status: 'confirm', removed: [notes] } with nothing changed.
 * Notes are snapshotted before any are removed.
 */
export async function runSync({ readRemote, writeRemote, approveRemovals = false }) {
  const text = await readRemote();
  const remote = text ? parseSyncFile(text) : null;
  const s = useStore.getState();
  const merged = mergeSync(Object.fromEntries(SYNCED.map(k => [k, s[k]])), remote);
  if (merged.removed.length >= CONFIRM_REMOVALS && !approveRemovals) return { status: 'confirm', removed: merged.removed };
  if (merged.removed.length) {
    await saveSnapshot(`Before sync removed ${merged.removed.length} note${merged.removed.length === 1 ? '' : 's'}`,
      { annotations: s.annotations, bookmarks: s.bookmarks });
  }
  const patch = {};
  for (const key of SYNCED) if (!same(merged[key], s[key])) patch[key] = merged[key];
  if (Object.keys(patch).length) {
    syncState.applying = true;
    try { useStore.setState(patch); } finally { syncState.applying = false; }
  }
  const out = syncFileText(merged.file);
  if (out !== text) await writeRemote(out);
  return { status: 'ok', removed: merged.removed };
}

/** "Keep mine": bring back notes a sync wanted to remove, dated now, so they win next time. */
export function keepNotes(notes) {
  for (const note of notes) useStore.getState().restoreAnnotation(note);
}
