// Locks NightReader after a period without use, or after it has been in the
// background that long. Locking forgets the data key and reloads the app, so no
// decrypted documents or notes stay in memory.
import { forgetKey, lockEnabled, lockInfo } from './vault.js';

export function lockNow() {
  forgetKey();
  window.location.reload();
}

/** Start watching for inactivity. Returns a stop function. */
export function startAutoLock({ isBusy = () => false } = {}) {
  let last = Date.now(), hiddenAt = 0;
  const minutes = () => Number(lockInfo()?.autoLockMinutes) || 0;
  const active = () => { last = Date.now(); };
  const events = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'];
  events.forEach(e => window.addEventListener(e, active, { passive: true, capture: true }));
  const check = () => {
    const limit = minutes() * 60_000;
    if (!lockEnabled() || !limit) return;
    if (isBusy()) { last = Date.now(); return; } // e.g. read aloud is playing
    if (Date.now() - last > limit) lockNow();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    const limit = minutes() * 60_000;
    if (lockEnabled() && limit && hiddenAt && Date.now() - hiddenAt > limit) lockNow();
    else active();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const timer = setInterval(check, 10_000);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    events.forEach(e => window.removeEventListener(e, active, { capture: true }));
  };
}
