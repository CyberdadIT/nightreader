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

// Touch: a deliberate swipe, not a slow drag or a tap.
const SWIPE_DISTANCE = 80, SWIPE_MAX_MS = 1000;

/**
 * Should this finished one-finger swipe turn the page?
 * - Swipe left / right: next / previous page. When the page is zoomed wider than
 *   the screen, the swipe pans instead, until the view is already at that side.
 * - Swipe up at the bottom of a page / down at the top: next / previous page,
 *   matching the mouse wheel.
 * The start/end scroll positions tell us whether the swipe scrolled the view;
 * if it did, it was a scroll, not a page turn.
 */
export function touchPageTurn({ dx, dy, ms, start, end, clientWidth, scrollWidth, clientHeight, scrollHeight }) {
  if (ms > SWIPE_MAX_MS) return 0;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax >= SWIPE_DISTANCE && ax > ay * 1.5) {
    if (scrollWidth > clientWidth + EDGE_SLACK) {
      const atRight = start.left + clientWidth >= scrollWidth - EDGE_SLACK, atLeft = start.left <= EDGE_SLACK;
      if (dx < 0 ? !atRight : !atLeft) return 0;
    }
    return dx < 0 ? 1 : -1;
  }
  if (ay >= SWIPE_DISTANCE && ay > ax * 1.5) {
    const bottom = top => top + clientHeight >= scrollHeight - EDGE_SLACK;
    if (dy < 0 && bottom(start.top) && bottom(end.top)) return 1;
    if (dy > 0 && start.top <= EDGE_SLACK && end.top <= EDGE_SLACK) return -1;
  }
  return 0;
}

/**
 * PDF zoom level after a pinch. Pages render at 1.8 × zoom in manual mode, so the
 * current on-screen scale (whatever the fit mode) converts back to a zoom level.
 */
export function pinchZoom(startScale, ratio) {
  const zoom = (startScale / 1.8) * ratio;
  return Math.round(Math.max(0.25, Math.min(4, zoom)) * 100) / 100;
}
