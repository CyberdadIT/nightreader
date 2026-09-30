// Shared page-navigation and zoom helpers for keyboard and mouse wheel input.

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];

/** Next zoom level up (direction 1) or down (direction -1) from the current zoom. */
export function stepZoom(zoom, direction) {
  if (direction > 0) return ZOOM_STEPS.find((s) => s > zoom + 0.01) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.01) ?? ZOOM_STEPS[0];
}

// A pixel or two of rounding slack: scrollTop is fractional on scaled displays.
const EDGE_SLACK = 2;

/**
 * Should this wheel movement turn the page?
 * Returns 1 (next page) when scrolling down at the bottom of the view,
 * -1 (previous page) when scrolling up at the top, otherwise 0 so the
 * view scrolls normally. A page that fits entirely on screen is at both
 * edges, so the wheel turns pages straight away.
 */
export function wheelPageTurn({ deltaX = 0, deltaY, scrollTop, clientHeight, scrollHeight }) {
  if (!deltaY || Math.abs(deltaX) > Math.abs(deltaY)) return 0;
  if (deltaY > 0 && scrollTop + clientHeight >= scrollHeight - EDGE_SLACK) return 1;
  if (deltaY < 0 && scrollTop <= EDGE_SLACK) return -1;
  return 0;
}

/** Wheel delta in pixels, whatever unit the device reported. */
export function wheelPixels(event, pageHeight) {
  if (event.deltaMode === 1) return event.deltaY * 16;          // lines
  if (event.deltaMode === 2) return event.deltaY * pageHeight;  // pages
  return event.deltaY;
}
