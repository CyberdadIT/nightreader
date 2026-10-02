import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { loadPdfData } from '../utils/storage.js';
import { loadDocument } from '../utils/documents.js';

/**
 * Keeps the documents on screen loaded: the active tab's, plus the other pane's in
 * side-by-side view. A document shown in both panes is loaded once. Documents that
 * leave the screen are closed to free memory. Loads run one at a time, so password
 * prompts never overlap.
 *
 * Returns { [path]: { doc } | { loading: true } | { error } }.
 */
export function useOpenDocuments(tabs, { restoring, askPassword }) {
  const [docs, setDocs] = useState({});
  const loaded = useRef(new Map()), queue = useRef(Promise.resolve());
  const wanted = tabs.filter(Boolean);
  const key = [...new Set(wanted.map(t => `${t.path}|${t.kind || 'pdf'}`))].sort().join(',');

  useEffect(() => {
    if (restoring) return;
    const want = new Map(wanted.map(t => [t.path, t]));
    for (const [path, entry] of loaded.current) {
      if (want.has(path)) continue;
      entry.cancelled = true; entry.cancelPrompt?.(); entry.doc?.destroy?.();
      loaded.current.delete(path);
      setDocs(d => { const next = { ...d }; delete next[path]; return next; });
    }
    for (const [path, tab] of want) {
      if (loaded.current.has(path)) continue;
      const entry = { cancelled: false };
      loaded.current.set(path, entry);
      setDocs(d => ({ ...d, [path]: { loading: true } }));
      queue.current = queue.current.then(async () => {
        if (entry.cancelled) return;
        try {
          const bytes = await loadPdfData(path);
          if (!bytes) throw new Error('This document is no longer cached. Import the original file again.');
          const opened = await loadDocument(bytes, tab.kind || 'pdf', path, {
            askPassword: info => new Promise(resolve => { entry.cancelPrompt = () => resolve(null); askPassword(tab, info).then(resolve); }),
          });
          if (entry.cancelled) { opened.destroy?.(); return; }
          entry.doc = opened;
          const outline = opened.kind === 'epub' ? opened.outline : await opened.getOutline().catch(() => []);
          if (entry.cancelled) return;
          const s = useStore.getState();
          for (const t of s.tabs.filter(x => x.path === path)) {
            s.updateTab(t.id, { totalPages: opened.numPages, outline: outline || [], page: Math.min(Math.max(1, t.page || 1), opened.numPages) });
          }
          // Remembered so its notes stay out of sync and its text out of storage.
          if (opened.passwordProtected) s.updateDocument(path, { protected: true });
          setDocs(d => ({ ...d, [path]: { doc: opened } }));
        } catch (e) {
          if (!entry.cancelled) setDocs(d => ({ ...d, [path]: { error: e.message || 'Could not open document.' } }));
          loaded.current.delete(path); // allow a retry when the tab is shown again
        }
      });
    }
  }, [key, restoring]);

  useEffect(() => () => {
    for (const entry of loaded.current.values()) { entry.cancelled = true; entry.cancelPrompt?.(); entry.doc?.destroy?.(); }
    loaded.current.clear();
  }, []);
  return docs;
}
