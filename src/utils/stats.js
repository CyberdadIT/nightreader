// Reading statistics: time spent reading and pages turned, per day and per document.
// Only active reading counts: a document open and on screen, with some activity in the
// last two minutes (or read aloud playing). Everything stays on this device.

export const TICK_MS = 15_000, IDLE_MS = 120_000, KEEP_DAYS = 400;

/** Local calendar day as "YYYY-MM-DD". */
export function dayKey(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Add reading time and pages to the log (pure). Keeps the last KEEP_DAYS days. */
export function addToLog(log, { day, ms = 0, pages = 0 }) {
  const old = log[day] || { ms: 0, pages: 0 };
  const next = { ...log, [day]: { ms: old.ms + ms, pages: old.pages + pages } };
  const days = Object.keys(next).sort();
  if (days.length > KEEP_DAYS) for (const d of days.slice(0, days.length - KEEP_DAYS)) delete next[d];
  return next;
}

/** Last `count` days, oldest first: [{ day, ms, pages }]. */
export function lastDays(log, count = 30, now = Date.now()) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
    const day = dayKey(d.getTime());
    out.push({ day, ms: log[day]?.ms || 0, pages: log[day]?.pages || 0 });
  }
  return out;
}

/** Days in a row with at least a minute of reading, ending today (or yesterday, if today hasn't started). */
export function streak(log, now = Date.now()) {
  const read = day => (log[day]?.ms || 0) >= 60_000;
  const d = new Date(now); d.setHours(12, 0, 0, 0);
  if (!read(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  let count = 0;
  while (read(dayKey(d.getTime()))) { count++; d.setDate(d.getDate() - 1); }
  return count;
}

/** Totals over the log: { ms, pages, days }. `since` is an optional day key. */
export function totals(log, since = '') {
  let ms = 0, pages = 0, days = 0;
  for (const [day, v] of Object.entries(log)) {
    if (since && day < since) continue;
    ms += v.ms; pages += v.pages; if (v.ms >= 60_000) days++;
  }
  return { ms, pages, days };
}

/** "2 h 05 min", "12 min", "under a minute". */
export function formatMinutes(ms) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return ms > 0 ? 'under a minute' : '0 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Start of this week (Monday) as a day key. */
export function weekStart(now = Date.now()) {
  const d = new Date(now); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d.getTime());
}

/** Validate a reading log from a backup: { "YYYY-MM-DD": { ms, pages } }. */
export function cleanLog(log) {
  const out = {};
  if (!log || typeof log !== 'object') return out;
  for (const [day, v] of Object.entries(log).slice(-KEEP_DAYS)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !v || typeof v !== 'object') continue;
    out[day] = { ms: Math.min(86_400_000, Math.max(0, Number(v.ms) || 0)), pages: Math.min(100_000, Math.max(0, Math.floor(Number(v.pages) || 0))) };
  }
  return out;
}

/** Merge two logs, keeping the larger figure for each day (restoring never double-counts). */
export function mergeLogs(a, b) {
  const out = { ...a };
  for (const [day, v] of Object.entries(b)) out[day] = { ms: Math.max(out[day]?.ms || 0, v.ms), pages: Math.max(out[day]?.pages || 0, v.pages) };
  return out;
}
