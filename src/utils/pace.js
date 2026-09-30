// Reading pace and "time left" estimates.

export const DEFAULT_SECONDS_PER_PAGE = 60;
export const DEFAULT_WPM = 230;

export const countWords = text => (String(text || '').match(/\S+/g) || []).length;

/** Smooth new measurements into the running pace so one slow page doesn't swing it. */
export const blendPace = (old, sample, weight = 0.3) => (old ? old + (sample - old) * weight : sample);

/** Seconds spent on one PDF page, if it looks like reading (not a glance or a coffee break). */
export const pdfPageSample = seconds => (seconds >= 5 && seconds <= 900 ? seconds : null);

/** Words per minute from finishing an EPUB chapter, if plausible. */
export function epubWpmSample(words, seconds) {
  if (!words || seconds < 30 || seconds > 7200) return null;
  const wpm = words / (seconds / 60);
  return wpm >= 60 && wpm <= 900 ? wpm : null;
}

/** Pace for this document, else the average from other documents, else a sensible default. */
export function paceFor(readingPace, docId, key, fallback) {
  if (readingPace?.[docId]?.[key]) return readingPace[docId][key];
  const others = Object.values(readingPace || {}).map(p => p?.[key]).filter(Boolean);
  return others.length ? others.reduce((a, b) => a + b, 0) / others.length : fallback;
}

/**
 * Remaining time in seconds.
 * PDF: pages left (counting half of the current one) × seconds per page.
 * EPUB: words in the current and later chapters ÷ words per minute.
 */
export function timeLeft({ kind, page, total, secondsPerPage, wpm, chapterWords = [] }) {
  if (!total) return null;
  if (kind === 'epub') {
    const perWord = 60 / (wpm || DEFAULT_WPM);
    const chapter = (chapterWords[page - 1] || 0) * perWord;
    const book = chapterWords.slice(page - 1).reduce((a, b) => a + b, 0) * perWord;
    return { chapter, book };
  }
  return { book: Math.max(0, total - page + 0.5) * (secondsPerPage || DEFAULT_SECONDS_PER_PAGE) };
}

export function formatDuration(seconds) {
  if (seconds == null) return '';
  const m = Math.round(seconds / 60);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
