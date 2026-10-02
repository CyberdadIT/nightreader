import React, { useMemo, useState } from 'react';
import Dialog, { dialogStyles as styles } from './Dialog.jsx';
import { useStore } from '../store/useStore.js';
import { dayKey, formatMinutes, lastDays, streak, totals, weekStart } from '../utils/stats.js';

const BAR = '#2f9fd6'; // one series, one hue (checked for contrast on the dark surface)

function Tile({ label, value, detail }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{detail}</div>
    </div>
  );
}

/** Minutes read per day, last 30 days. Hover or focus a bar for its figures. */
function DailyChart({ days }) {
  const [hover, setHover] = useState(null);
  const W = 460, H = 140, top = 12, bottom = 22, left = 30, gap = 2;
  const maxMin = Math.max(10, ...days.map(d => d.ms / 60000));
  const nice = maxMin <= 30 ? Math.ceil(maxMin / 10) * 10 : maxMin <= 120 ? Math.ceil(maxMin / 30) * 30 : Math.ceil(maxMin / 60) * 60;
  const bw = (W - left) / days.length, y = m => top + (H - top - bottom) * (1 - m / nice);
  const ticks = [0, nice / 2, nice];
  const today = dayKey();
  const label = d => new Date(`${d}T12:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
  return (
    <figure style={{ margin: '4px 0 0', position: 'relative' }}>
      <figcaption style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>Minutes read per day, last 30 days</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-label="Bar chart of minutes read per day over the last 30 days" onMouseLeave={() => setHover(null)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" strokeDasharray={t ? '2 3' : undefined} />
            <text x={left - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const minutes = d.ms / 60000, x = left + i * bw + gap / 2, h = Math.max(minutes > 0 ? 2 : 0, y(0) - y(minutes)), w = Math.max(1, bw - gap);
          const r = Math.min(4, w / 2, h);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} role="img" aria-label={`${label(d.day)}: ${formatMinutes(d.ms)}, ${d.pages} pages`}>
              <rect x={left + i * bw} y={top} width={bw} height={H - top - bottom} fill="transparent" />
              {h > 0 && <path d={`M${x},${y(0)}V${y(0) - h + r}Q${x},${y(0) - h} ${x + r},${y(0) - h}H${x + w - r}Q${x + w},${y(0) - h} ${x + w},${y(0) - h + r}V${y(0)}Z`}
                fill={BAR} opacity={hover === null || hover === i ? 1 : 0.55} />}
              {d.day === today && <text x={W} y={H - 8} textAnchor="end" fontSize="9" fill="var(--muted)">today</text>}
            </g>
          );
        })}
        <text x={left} y={H - 8} fontSize="9" fill="var(--muted)">{label(days[0].day)}</text>
      </svg>
      {hover !== null && (
        <div role="tooltip" style={{ position: 'absolute', top: 18, left: `${Math.min(70, Math.max(0, ((left + hover * bw) / W) * 100 - 10))}%`, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          <strong>{label(days[hover].day)}</strong> · {formatMinutes(days[hover].ms)} · {days[hover].pages} page{days[hover].pages === 1 ? '' : 's'}
        </div>
      )}
      <table className="sr-only">
        <caption>Minutes read per day</caption>
        <thead><tr><th>Day</th><th>Time</th><th>Pages</th></tr></thead>
        <tbody>{days.map(d => <tr key={d.day}><td>{d.day}</td><td>{formatMinutes(d.ms)}</td><td>{d.pages}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

export default function StatsDialog({ onClose }) {
  const log = useStore(s => s.readingLog), docStats = useStore(s => s.docStats), library = useStore(s => s.library);
  const days = useMemo(() => lastDays(log, 30), [log]);
  const today = log[dayKey()] || { ms: 0, pages: 0 }, week = totals(log, weekStart()), all = totals(log), run = streak(log);
  const docs = useMemo(() => library.map(d => ({ ...d, stats: docStats[d.id] })).filter(d => d.stats?.ms || d.stats?.pages)
    .sort((a, b) => (b.stats.lastReadAt || 0) - (a.stats.lastReadAt || 0)).slice(0, 12), [library, docStats]);
  const finished = Object.values(docStats).filter(s => s.finishedAt).length;
  return (
    <Dialog title="Reading statistics" onClose={onClose} wide>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <Tile label="Today" value={formatMinutes(today.ms)} detail={`${today.pages} page${today.pages === 1 ? '' : 's'}`} />
        <Tile label="This week" value={formatMinutes(week.ms)} detail={`${week.pages} pages · ${week.days} day${week.days === 1 ? '' : 's'}`} />
        <Tile label="Streak" value={`${run} day${run === 1 ? '' : 's'}`} detail="in a row, 1+ min a day" />
        <Tile label="All time" value={formatMinutes(all.ms)} detail={`${all.pages} pages · ${finished} finished`} />
      </div>
      <DailyChart days={days} />
      <h3>Documents</h3>
      {docs.length ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}><th style={{ fontWeight: 500, padding: '4px 0' }}>Document</th><th style={{ fontWeight: 500, textAlign: 'right' }}>Time</th><th style={{ fontWeight: 500, textAlign: 'right' }}>Pages</th><th style={{ fontWeight: 500, textAlign: 'right' }}>Status</th></tr></thead>
          <tbody>{docs.map(d => (
            <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px 6px 0', overflowWrap: 'anywhere' }}>{d.name}</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatMinutes(d.stats.ms)}</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.stats.pages}</td>
              <td style={{ textAlign: 'right', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{d.stats.finishedAt ? '✓ Finished' : `${d.kind === 'epub' ? 'Ch.' : 'p.'} ${d.lastPage || 1}`}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p>Nothing yet. Time counts while a document is open and you're reading it (or it's being read aloud).</p>}
      <p style={{ marginTop: 12 }}>Only active reading counts: the window must be in front, with a page turn, scroll or tap in the last two minutes. Statistics stay on this device and are included in backups.</p>
      <div className={styles.actions}><button onClick={onClose}>Close</button></div>
    </Dialog>
  );
}
