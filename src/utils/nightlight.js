// Warm light: a colour layer that removes blue light, optionally on a schedule.

const minutes = hhmm => {
  const [h, m] = String(hhmm || '0:0').split(':').map(n => parseInt(n, 10) || 0);
  return (h % 24) * 60 + (m % 60);
};

/** Is the time inside the window? Windows may run past midnight (21:00 → 07:00). */
export function inTimeWindow(date, start, end) {
  const now = date.getHours() * 60 + date.getMinutes(), s = minutes(start), e = minutes(end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/** Warmth 0–100 actually applied now. With a schedule, warmth applies only inside it. */
export function effectiveWarmth(warmth, schedule, date = new Date()) {
  if (!warmth) return 0;
  if (!schedule?.enabled) return warmth;
  return inTimeWindow(date, schedule.start, schedule.end) ? warmth : 0;
}

/**
 * Colour for a multiply-blended layer. White leaves the page untouched; at full
 * warmth blue drops to about a third and green to two thirds (roughly 2700 K).
 */
export function warmLayerColor(warmth) {
  const w = Math.max(0, Math.min(100, warmth)) / 100;
  return `rgb(255, ${Math.round(255 - 85 * w)}, ${Math.round(255 - 165 * w)})`;
}
