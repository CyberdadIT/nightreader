// Flashcard review inside the app, with spaced repetition.
// Every highlight that has a note is a card: the front is the passage, the back is
// your note. Scheduling follows the SM-2 family used by Anki: each answer sets when
// the card comes back, and how quickly the gaps grow for that card.

const MINUTE = 60_000, DAY = 86_400_000;
export const GRADES = [[1, 'Again'], [2, 'Hard'], [3, 'Good'], [4, 'Easy']];
export const NEW_PER_SESSION = 20;
const START_EASE = 2.5, MIN_EASE = 1.3;

/** Notes that make cards: a passage with a note, from a document still in the library. */
export function cardNotes(annotations, library) {
  const docs = new Map(library.map(d => [d.id, d]));
  return annotations
    .filter(a => a.type !== 'ink' && docs.has(a.filePath) && a.quote?.trim() && a.note?.trim())
    .map(a => ({ ...a, document: docs.get(a.filePath) }));
}

/** The schedule after answering `grade` (1 Again … 4 Easy). Pure; `card` may be undefined for a new card. */
export function schedule(card, grade, now = Date.now()) {
  const c = { reps: 0, lapses: 0, ease: START_EASE, interval: 0, ...card };
  if (grade === 1) {
    return { reps: 0, lapses: c.lapses + 1, ease: Math.max(MIN_EASE, c.ease - 0.2), interval: 0, due: now + 10 * MINUTE, last: now };
  }
  let interval;
  if (c.reps === 0) interval = { 2: 1, 3: 1, 4: 4 }[grade];
  else if (c.reps === 1) interval = { 2: 2, 3: 4, 4: 7 }[grade];
  else interval = c.interval * { 2: 1.2, 3: c.ease, 4: c.ease * 1.3 }[grade];
  interval = Math.max(c.reps ? c.interval + (grade === 2 ? 0 : 1) : 1, Math.round(interval));
  const ease = Math.max(MIN_EASE, c.ease + (grade === 2 ? -0.15 : grade === 4 ? 0.15 : 0));
  return { reps: c.reps + 1, lapses: c.lapses, ease: Math.round(ease * 100) / 100, interval, due: now + interval * DAY, last: now };
}

/** "10 min", "1 day", "3 weeks" for the answer buttons. */
export function describeGap(ms) {
  const minutes = Math.round(ms / MINUTE), days = Math.round(ms / DAY);
  if (minutes < 60) return `${minutes} min`;
  if (days < 1) return `${Math.round(minutes / 60)} h`;
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

/**
 * Cards to review now: everything due, then up to `newLimit` cards never studied,
 * oldest notes first. `docId` limits it to one document.
 */
export function dueCards(notes, cards, { now = Date.now(), docId = '', newLimit = NEW_PER_SESSION } = {}) {
  const pool = notes.filter(n => !docId || n.filePath === docId);
  const due = pool.filter(n => cards[n.id] && cards[n.id].due <= now).sort((a, b) => cards[a.id].due - cards[b.id].due);
  const fresh = pool.filter(n => !cards[n.id]).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).slice(0, newLimit);
  return [...due, ...fresh];
}

/** Counts for the review screen. */
export function reviewCounts(notes, cards, now = Date.now()) {
  let due = 0, fresh = 0, later = 0;
  for (const n of notes) { const c = cards[n.id]; if (!c) fresh++; else if (c.due <= now) due++; else later++; }
  return { due, fresh, later, total: notes.length };
}

/** Keep only well-formed schedules (for backups). */
export function cleanCards(cards) {
  const out = {};
  if (!cards || typeof cards !== 'object') return out;
  for (const [id, c] of Object.entries(cards).slice(0, 50000)) {
    if (typeof id !== 'string' || id.length > 64 || !c || typeof c !== 'object') continue;
    const num = v => (Number.isFinite(v) ? v : 0);
    out[id] = { reps: Math.max(0, Math.floor(num(c.reps))), lapses: Math.max(0, Math.floor(num(c.lapses))),
      ease: Math.min(5, Math.max(MIN_EASE, num(c.ease) || START_EASE)), interval: Math.min(36500, Math.max(0, num(c.interval))),
      due: num(c.due), last: num(c.last) };
  }
  return out;
}
