import React, { useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { outlinePath, simplify, touchesStroke } from '../utils/ink.js';

/**
 * Handwriting over a PDF page. It only takes input while the ink tool is on, or while
 * a pen is in range (a Surface Pen hovering over the screen); otherwise it lets clicks,
 * text selection and touch scrolling through to the page underneath.
 * - Pen: draws, with pressure. The eraser end (or the eraser tool) removes strokes.
 * - Mouse: draws only with the ink tool on.
 * - Finger: never draws; with the ink tool on it scrolls the page (palm-friendly).
 */
export default function InkLayer({ pageNumber, viewport, filePath, scrollRoot }) {
  const annotations = useStore(s => s.annotations);
  const tool = useStore(s => s.inkTool), penNear = useStore(s => s.penNear), penInk = useStore(s => s.penInk);
  const color = useStore(s => s.inkColor), width = useStore(s => s.inkWidth);
  const strokes = useMemo(() => annotations.filter(a => a.type === 'ink' && a.filePath === filePath && a.page === pageNumber && a.ink), [annotations, filePath, pageNumber]);
  const svgRef = useRef(null), action = useRef(null);
  const [live, setLive] = useState(null);
  const active = Boolean(tool) || (penInk && penNear);
  if (!viewport) return null;
  const scale = viewport.scale;

  const pdfPoint = ev => {
    const r = svgRef.current.getBoundingClientRect();
    const [x, y] = viewport.convertToPdfPoint(ev.clientX - r.left, ev.clientY - r.top);
    const pressure = ev.pointerType === 'pen' ? (ev.pressure || 0.5) : 0.5;
    return [x, y, pressure];
  };
  const toScreen = points => points.map(([x, y, p]) => [...viewport.convertToViewportPoint(x, y), p]);

  function eraseAt(point) {
    const radius = 6 / scale;
    for (const s of strokes) if (touchesStroke(s.ink, point, radius)) useStore.getState().eraseInkStroke(s.id);
  }
  function down(e) {
    if (e.pointerType === 'touch') {
      if (!tool) return;
      action.current = { kind: 'pan', x: e.clientX, y: e.clientY, id: e.pointerId };
      e.currentTarget.setPointerCapture(e.pointerId); return;
    }
    if (e.pointerType === 'mouse' && (!tool || e.button !== 0)) return;
    const erasing = tool === 'eraser' || (e.buttons & 32) !== 0 || e.button === 5;
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = pdfPoint(e);
    action.current = { kind: erasing ? 'erase' : 'draw', id: e.pointerId, points: [point] };
    if (erasing) eraseAt(point); else setLive([point]);
  }
  function move(e) {
    const a = action.current; if (!a || a.id !== e.pointerId) return;
    if (a.kind === 'pan') {
      scrollRoot?.current?.scrollBy(a.x - e.clientX, a.y - e.clientY);
      a.x = e.clientX; a.y = e.clientY; return;
    }
    const events = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const point = pdfPoint(ev);
      if (a.kind === 'erase') eraseAt(point); else a.points.push(point);
    }
    if (a.kind === 'draw') setLive([...a.points]);
  }
  function up(e) {
    const a = action.current; if (!a || a.id !== e.pointerId) return;
    action.current = null; setLive(null);
    if (a.kind !== 'draw' || !a.points.length) return;
    useStore.getState().addInkStroke({ filePath, page: pageNumber, ink: { points: simplify(a.points, 0.3 / scale + 0.2), color, width } });
  }

  return (
    <svg ref={svgRef} data-ink-layer={pageNumber} aria-hidden="true" width={viewport.width} height={viewport.height}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { action.current = null; setLive(null); }}
      style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: active ? 'auto' : 'none', touchAction: active ? 'none' : 'auto',
        cursor: tool === 'eraser' ? 'cell' : active ? 'crosshair' : undefined }}>
      {strokes.map(s => (
        <path key={s.id} data-ink-stroke={s.id} d={outlinePath(toScreen(s.ink.points), s.ink.width * scale)} fill={s.ink.color} fillOpacity={s.ink.color === '#f9a825' ? 0.55 : 1} />
      ))}
      {live && <path d={outlinePath(toScreen(live), width * scale)} fill={color} fillOpacity={color === '#f9a825' ? 0.55 : 1} />}
    </svg>
  );
}
