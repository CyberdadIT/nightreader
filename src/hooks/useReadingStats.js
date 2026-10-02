import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore.js';
import { dayKey, IDLE_MS, TICK_MS } from '../utils/stats.js';

/**
 * Counts active reading time and pages for the open document. `reading` is false
 * while the library or a dialog covers the document.
 */
export function useReadingStats(tab, doc, reading) {
  const lastActivity = useRef(Date.now()), lastPage = useRef(null);
  useEffect(() => {
    const active = () => { lastActivity.current = Date.now(); };
    const events = ['keydown', 'pointerdown', 'wheel', 'touchstart'];
    events.forEach(e => window.addEventListener(e, active, { passive: true, capture: true }));
    document.addEventListener('scroll', active, { passive: true, capture: true });
    return () => { events.forEach(e => window.removeEventListener(e, active, { capture: true })); document.removeEventListener('scroll', active, { capture: true }); };
  }, []);

  const docId = tab?.path, page = tab?.page, total = tab?.totalPages;
  // Time: a tick every 15 s while the document is on screen and in use (or being read aloud).
  useEffect(() => {
    if (!docId || !doc || !reading) return;
    lastActivity.current = Date.now();
    const timer = setInterval(() => {
      const s = useStore.getState();
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivity.current > IDLE_MS && !s.speechMark) return;
      s.recordReading(docId, { day: dayKey(), ms: TICK_MS });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [docId, doc, reading]);

  // Pages: moving forward one page (or two in two-page view) counts; jumps don't.
  useEffect(() => {
    if (!docId || !doc || !page) { lastPage.current = null; return; }
    const prev = lastPage.current;
    lastPage.current = { docId, page };
    if (prev?.docId !== docId) return;
    const step = page - prev.page;
    if (step >= 1 && step <= 2) useStore.getState().recordReading(docId, { day: dayKey(), pages: step, page, total });
  }, [docId, page, doc, total]);
}
