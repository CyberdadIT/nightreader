// Handwriting (Surface Pen, other styluses, or the mouse with the ink tool).
// A stroke is stored as points in PDF page coordinates, [x, y, pressure], so it stays
// in place at any zoom or rotation and can be written into a PDF as a standard /Ink annotation.

export const INK_COLORS = [
  ['#1b1b1b', 'Black'], ['#1e5bd8', 'Blue'], ['#d32f2f', 'Red'], ['#2e7d32', 'Green'], ['#f9a825', 'Yellow'],
];
export const INK_WIDTHS = [[0.8, 'Fine'], [1.6, 'Medium'], [3.2, 'Thick']];
export const MAX_POINTS = 4000;

const HEX = /^#[0-9a-f]{6}$/i;
const round = v => Math.round(v * 10) / 10;

/** Validate a stroke from storage, sync or a backup. Returns a clean copy or null. */
export function cleanInk(ink) {
  if (!ink || typeof ink !== 'object' || !Array.isArray(ink.points)) return null;
  const points = ink.points
    .filter(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) < 1e5 && Math.abs(p[1]) < 1e5)
    .slice(0, MAX_POINTS)
    .map(([x, y, pressure]) => [round(x), round(y), Number.isFinite(pressure) ? Math.min(1, Math.max(0, Math.round(pressure * 100) / 100)) : 0.5]);
  if (points.length < 1) return null;
  return {
    points,
    color: HEX.test(ink.color) ? ink.color.toLowerCase() : '#1b1b1b',
    width: Number.isFinite(ink.width) ? Math.min(20, Math.max(0.2, ink.width)) : 1.6,
  };
}

/** Drop points closer than `min` to the previous one (keeps strokes small). */
export function simplify(points, min = 0.4) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= min) out.push(p);
  }
  if (points.length && out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

/** Stroke width at a given pressure: light touches are thinner, firm ones thicker. */
export const pressureWidth = (width, pressure = 0.5) => width * (0.35 + 1.3 * Math.min(1, Math.max(0, pressure)));

/**
 * SVG path for a stroke drawn as a filled outline, so its width follows the pen's
 * pressure. `points` are screen points [x, y, pressure]; `width` is in screen pixels.
 */
export function outlinePath(points, width) {
  if (!points.length) return '';
  if (points.length === 1) {
    const [x, y, p] = points[0], r = pressureWidth(width, p) / 2;
    return `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
  }
  const left = [], right = [];
  for (let i = 0; i < points.length; i++) {
    const [x, y, p] = points[i];
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const r = pressureWidth(width, p) / 2;
    left.push([x - dy * r, y + dx * r]); right.push([x + dy * r, y - dx * r]);
  }
  const fmt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const ep = points[points.length - 1][2], sp = points[0][2];
  const re = pressureWidth(width, ep) / 2, rs = pressureWidth(width, sp) / 2;
  return `M${fmt(left[0])}L${left.slice(1).map(fmt).join('L')}`
    + `A${re.toFixed(1)},${re.toFixed(1)} 0 0,1 ${fmt(right[right.length - 1])}`
    + `L${right.slice(0, -1).reverse().map(fmt).join('L')}`
    + `A${rs.toFixed(1)},${rs.toFixed(1)} 0 0,1 ${fmt(left[0])}Z`;
}

/** Shortest distance from point p to segment a–b. */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Does the eraser at `point` (PDF coordinates) touch this stroke? */
export function touchesStroke(ink, point, radius) {
  const pts = ink.points;
  if (pts.length === 1) return Math.hypot(pts[0][0] - point[0], pts[0][1] - point[1]) <= radius + ink.width;
  for (let i = 1; i < pts.length; i++) if (segmentDistance(point, pts[i - 1], pts[i]) <= radius + ink.width / 2) return true;
  return false;
}

/** Bounding box [x1, y1, x2, y2] of a stroke, padded by its width. */
export function inkBounds(ink) {
  const xs = ink.points.map(p => p[0]), ys = ink.points.map(p => p[1]), pad = ink.width * 1.5 + 1;
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}

export const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
