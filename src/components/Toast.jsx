import React, { useEffect } from 'react';
import { create } from 'zustand';
import { useStore } from '../store/useStore.js';

/** One message at a time at the bottom of the window, optionally with an action such as Undo. */
export const useToast = create(set => ({
  toast: null,
  show: (message, action = null, ms = 8000) => set({ toast: { message, action, ms, key: Date.now() } }),
  hide: () => set({ toast: null }),
}));

/** Delete a note with an Undo that brings back exactly the same note. */
export function deleteNoteWithUndo(id) {
  const note = useStore.getState().annotations.find(a => a.id === id);
  if (!note) return;
  useStore.getState().removeAnnotation(id);
  useToast.getState().show('Note deleted', { label: 'Undo', run: () => useStore.getState().restoreAnnotation(note) });
}

export default function Toast() {
  const toast = useToast(s => s.toast), hide = useToast(s => s.hide);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hide, toast.ms);
    return () => clearTimeout(t);
  }, [toast, hide]);
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', left: '50%', bottom: 'calc(40px + var(--safe-bottom))', transform: 'translateX(-50%)', zIndex: 600,
      display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--panel)', color: 'var(--text)',
      border: '1px solid var(--border)', boxShadow: '0 8px 28px #000a', fontSize: 14, maxWidth: 'calc(100vw - 32px)' }}>
      <span>{toast.message}</span>
      {toast.action && <button onClick={() => { toast.action.run(); hide(); }} style={{ background: 'transparent', border: 0, color: 'var(--accent)', fontWeight: 600, fontSize: 14 }}>{toast.action.label}</button>}
      <button onClick={hide} aria-label="Dismiss" style={{ background: 'transparent', border: 0, color: 'var(--muted)', fontSize: 15 }}>✕</button>
    </div>
  );
}
