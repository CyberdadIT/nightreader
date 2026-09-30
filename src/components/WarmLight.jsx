import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { effectiveWarmth, warmLayerColor } from '../utils/nightlight.js';

/** Full-window warm layer. Re-evaluated every minute so the schedule switches on time. */
export default function WarmLight() {
  const warmth = useStore(s => s.warmth), schedule = useStore(s => s.warmSchedule);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!schedule?.enabled) return;
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [schedule?.enabled]);
  const applied = effectiveWarmth(warmth, schedule, now);
  if (!applied) return null;
  return <div aria-hidden="true" data-warm-light={applied} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9000, mixBlendMode: 'multiply', background: warmLayerColor(applied) }} />;
}
