import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore.js';
import { blendPace, countWords, epubWpmSample, pdfPageSample } from '../utils/pace.js';

/**
 * Learns how fast the user reads. Only moving forward one page/chapter counts,
 * and time while the app is in the background is excluded.
 */
export function useReadingPace(tab, doc) {
  const last = useRef(null);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'visible' && last.current) last.current.at = Date.now(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const docId = tab?.path, page = tab?.page;
  useEffect(() => {
    if (!docId || !doc || !page) { last.current = null; return; }
    const prev = last.current, now = Date.now();
    last.current = { docId, page, at: now };
    if (!prev || prev.docId !== docId || page !== prev.page + 1) return;
    const seconds = (now - prev.at) / 1000, { readingPace, recordPace } = useStore.getState(), old = readingPace[docId] || {};
    if (doc.kind === 'epub') {
      const wpm = epubWpmSample(countWords(doc.chapters?.[prev.page - 1]?.text), seconds);
      if (wpm) recordPace(docId, { wpm: Math.round(blendPace(old.wpm, wpm)) });
    } else {
      const sample = pdfPageSample(seconds);
      if (sample) recordPace(docId, { secondsPerPage: Math.round(blendPace(old.secondsPerPage, sample)) });
    }
  }, [docId, page, doc]);
}
