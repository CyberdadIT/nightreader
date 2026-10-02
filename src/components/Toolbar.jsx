import React from "react";
import { useStore } from "../store/useStore.js";
import { INK_COLORS, INK_WIDTHS } from "../utils/ink.js";
import { openFilePicker } from "../utils/platform.js";
import styles from "./Toolbar.module.css";
import { ZOOM_STEPS, stepZoom } from "../utils/navigation.js";

// Zoom steps matching Foxit/Readera behaviour
// Each step is a meaningful jump — not 10% increments
const ZOOM_LABELS = ["50%", "67%", "75%", "80%", "90%", "100%", "110%", "125%", "150%", "175%", "200%", "250%", "300%", "400%"];

export default function Toolbar({ onFileLoaded, onPrint }) {
  const activeTab      = useStore((s) => s.getActiveTab());
  const currentPage    = activeTab?.page ?? 1;
  const totalPages     = activeTab?.totalPages ?? 0;
  const zoom           = useStore((s) => s.zoom);
  const scrollMode     = useStore((s) => s.scrollMode);
  const annotMode      = useStore((s) => s.annotMode);
  const split          = useStore((s) => s.split);
  const invertColors   = useStore((s) => s.invertColors);
  const searchVisible  = useStore((s) => s.searchVisible);

  const setCurrentPage   = useStore((s) => s.setCurrentPage);
  const setZoom          = useStore((s) => s.setZoom);
  const toggleScrollMode = useStore((s) => s.toggleScrollMode);
  const toggleAnnotMode  = useStore((s) => s.toggleAnnotMode);
  const toggleInvert     = useStore((s) => s.toggleInvert);
  const toggleSearch     = useStore((s) => s.toggleSearch);
  const toggleFocusMode  = useStore((s) => s.toggleFocusMode);
  const addBookmark      = useStore((s) => s.addBookmark);

  const fit = useStore(s => s.fitMode);
  const setFit = useStore(s => s.setFitMode);
  const rotate = useStore(s => s.rotate);
  const spread = useStore(s => s.spread);
  const toggleSpread = useStore(s => s.toggleSpread);
  const epub = activeTab?.kind === "epub";
  const step = spread && !epub ? 2 : 1;
  const zoomPct = Math.round(zoom * 100);

  // Jump to next/previous zoom step
  function zoomIn() {
    setZoom(stepZoom(zoom, 1));
  }

  function zoomOut() {
    setZoom(stepZoom(zoom, -1));
  }

  function handleZoomSelect(e) {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) setZoom(val / 100);
  }

  function handlePageInput(e) {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) setCurrentPage(val);
  }

  function handleBookmark() {
    if (!activeTab) return;
    addBookmark({
      page:     currentPage,
      filePath: activeTab.path,
      title:    `Page ${currentPage} — ${activeTab.name}`,
    });
  }

  async function handleOpen() {
    const file = await openFilePicker();
    if (file) onFileLoaded?.(file);
  }

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Reader controls">

      {/* Page navigation */}
      <div className={styles.group}>
        <button className={styles.btn} onClick={() => setCurrentPage(currentPage - step)} disabled={currentPage <= 1} title="Previous page (←)">◀</button>
        <input
          className={styles.pageInput}
          type="number" min={1} max={totalPages || 1}
          value={currentPage}
          onChange={handlePageInput}
          aria-label={epub ? "Current chapter" : "Current page"}
        />
        <span className={styles.pageOf}>/ {totalPages || "—"}</span>
        <button className={styles.btn} onClick={() => setCurrentPage(currentPage + step)} disabled={currentPage >= totalPages} title="Next page (→)">▶</button>
      </div>

      <div className={styles.sep} />

      {/* Zoom controls */}
      {!epub && <div className={styles.group}>
        <button
          className={styles.zoomBtn}
          onClick={zoomOut}
          disabled={zoom <= ZOOM_STEPS[0]}
          title="Zoom out (make text smaller)"
          aria-label="Zoom out"
        >
          A−
        </button>

        {/* Zoom level dropdown — like Foxit's zoom selector */}
        <select
          className={styles.zoomSelect}
          value={ZOOM_STEPS.includes(zoom) ? zoomPct : zoomPct}
          onChange={handleZoomSelect}
          aria-label="Zoom level"
          title="Select zoom level"
        >
          {ZOOM_STEPS.map((s, i) => (
            <option key={s} value={Math.round(s * 100)}>
              {ZOOM_LABELS[i]}
            </option>
          ))}
          {/* Show current value if it's not a standard step */}
          {!ZOOM_STEPS.includes(zoom) && (
            <option value={zoomPct}>{zoomPct}%</option>
          )}
        </select>

        <button
          className={styles.zoomBtn}
          onClick={zoomIn}
          disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          title="Zoom in (make text larger)"
          aria-label="Zoom in"
        >
          A+
        </button>

        <select className={styles.zoomSelect} aria-label="Page fit" value={fit} onChange={e => setFit(e.target.value)}><option value="width">Fit to width</option><option value="page">Fit to page</option><option value="manual">Custom zoom</option></select>
      </div>}

      <div className={styles.sep} />

      {/* Tools used while reading */}
      <div className={styles.group}>
        <button className={`${styles.btn} ${searchVisible ? styles.active : ""}`} onClick={toggleSearch} title="Find (Ctrl+F)">🔍 Find</button>
        <button className={`${styles.btn} ${annotMode ? styles.active : ""}`} onClick={toggleAnnotMode} title="Annotate">✏ Annotate</button>
        <button className={styles.btn} onClick={handleBookmark} title="Bookmark current page">🔖 Mark</button>
        {!epub && <InkControls />}
        <button className={`${styles.btn} ${split ? styles.active : ""}`} aria-pressed={!!split} onClick={() => useStore.getState().toggleSplit()} title="Read two documents (or two places in one) side by side">◫ Side by side</button>
      </div>

      <div className={styles.spacer} />

      {/* Less-used view options live in one menu, so the bar fits a 1366-pixel-wide screen. */}
      <MoreMenu items={[
        ...(!epub ? [
          { label: "Reset zoom to 100%", hint: "Ctrl+0", onSelect: () => setZoom(1.0) },
          { label: "Rotate", onSelect: rotate },
          { label: "Two pages", checked: spread, onSelect: toggleSpread },
          { label: "Continuous scroll", checked: scrollMode, onSelect: toggleScrollMode },
        ] : []),
        { label: "Invert colours", checked: invertColors, onSelect: toggleInvert },
        { label: "Focus mode", hint: "R", onSelect: toggleFocusMode },
        { label: "Print…", hint: "Ctrl+P", onSelect: onPrint },
        { label: "Open document…", onSelect: handleOpen },
      ]} />
    </div>
  );
}

/**
 * A small menu button (WAI-ARIA menu pattern): arrow keys move between items,
 * Escape or a click outside closes it, and focus returns to the button.
 */
function MoreMenu({ items }) {
  const [open, setOpen] = React.useState(false);
  const button = React.useRef(null), menu = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    menu.current?.querySelector("[role^=menuitem]")?.focus();
    const close = e => { if (!menu.current?.contains(e.target) && !button.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  function onKey(e) {
    const list = [...menu.current.querySelectorAll("[role^=menuitem]")], i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); list.at(-1)?.focus(); }
    else if (e.key === "Escape" || e.key === "Tab") { e.stopPropagation(); setOpen(false); if (e.key === "Escape") button.current?.focus(); }
  }
  return (
    <div style={{ position: "relative" }}>
      <button ref={button} className={`${styles.btn} ${open ? styles.active : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} title="More view options">More ▾</button>
      {open && (
        <div ref={menu} role="menu" aria-label="More view options" onKeyDown={onKey} className={styles.menu}>
          {items.map(item => (
            <button key={item.label} role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={item.checked === undefined ? undefined : !!item.checked}
              tabIndex={-1} className={styles.menuItem} onClick={() => { setOpen(false); item.onSelect?.(); }}>
              <span aria-hidden="true" style={{ width: 14, display: "inline-block" }}>{item.checked ? "✓" : ""}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.hint && <span className={styles.menuHint}>{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


/** Pen tool: draw with a mouse or pen, choose colour and thickness, erase, undo. */
function InkControls() {
  const tool = useStore(s => s.inkTool), color = useStore(s => s.inkColor), width = useStore(s => s.inkWidth);
  const { setInkTool, setInk, undoInk } = useStore.getState();
  return <>
    <button className={`${styles.btn} ${tool === "pen" ? styles.active : ""}`} aria-pressed={tool === "pen"} onClick={() => setInkTool("pen")} title="Draw with the mouse or pen. A Surface Pen writes anyway when it touches the page.">✒ Ink</button>
    {tool && <span role="group" aria-label="Ink options" style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {INK_COLORS.map(([value, name]) => <button key={value} aria-label={`Ink ${name.toLowerCase()}`} aria-pressed={color === value && tool === "pen"} onClick={() => { setInk({ inkColor: value }); if (tool !== "pen") setInkTool("pen"); }}
        style={{ width: 22, height: 22, borderRadius: 11, background: value, border: color === value ? "2px solid var(--accent)" : "1px solid var(--border)", padding: 0 }} />)}
      <select aria-label="Ink thickness" className={styles.zoomSelect} value={width} onChange={e => setInk({ inkWidth: Number(e.target.value) })}>
        {INK_WIDTHS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select>
      <button className={`${styles.btn} ${tool === "eraser" ? styles.active : ""}`} aria-pressed={tool === "eraser"} onClick={() => setInkTool("eraser")} title="Erase strokes (or turn the Surface Pen over)">⌫ Eraser</button>
      <button className={styles.btn} onClick={() => undoInk()} title="Undo the last stroke (Ctrl+Z)">↶ Undo</button>
    </span>}
  </>;
}
