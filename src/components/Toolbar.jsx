import React from "react";
import { useStore } from "../store/useStore.js";
import { openFilePicker } from "../utils/platform.js";
import styles from "./Toolbar.module.css";
import { ZOOM_STEPS, stepZoom } from "../utils/navigation.js";

// Zoom steps matching Foxit/Readera behaviour
// Each step is a meaningful jump — not 10% increments
const ZOOM_LABELS = ["50%", "67%", "75%", "80%", "90%", "100%", "110%", "125%", "150%", "175%", "200%", "250%", "300%", "400%"];

export default function Toolbar({ onFileLoaded }) {
  const activeTab      = useStore((s) => s.getActiveTab());
  const currentPage    = activeTab?.page ?? 1;
  const totalPages     = activeTab?.totalPages ?? 0;
  const zoom           = useStore((s) => s.zoom);
  const scrollMode     = useStore((s) => s.scrollMode);
  const annotMode      = useStore((s) => s.annotMode);
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

        <button
          className={styles.btn}
          onClick={() => setZoom(1.0)}
          title="Reset to 100%"
          aria-label="Reset zoom"
          style={{ fontSize: "10px", padding: "4px 6px" }}
        >
          100%
        </button>
        <select className={styles.zoomSelect} aria-label="Page fit" value={fit} onChange={e => setFit(e.target.value)}><option value="width">Fit to width</option><option value="page">Fit to page</option><option value="manual">Custom zoom</option></select>
        <button className={styles.btn} onClick={rotate}>Rotate</button>
        <button className={styles.btn} onClick={toggleSpread} aria-pressed={spread}>Two pages</button>
      </div>}

      <div className={styles.sep} />

      {/* Tools */}
      <div className={styles.group}>
        <button className={`${styles.btn} ${searchVisible ? styles.active : ""}`} onClick={toggleSearch} title="Find (Ctrl+F)">🔍 Find</button>
        <button className={`${styles.btn} ${annotMode ? styles.active : ""}`} onClick={toggleAnnotMode} title="Annotate">✏ Annotate</button>
        <button className={styles.btn} onClick={handleBookmark} title="Bookmark current page">🔖 Mark</button>
      </div>

      <div className={styles.sep} />

      {/* View */}
      <div className={styles.group}>
        {!epub && <button className={`${styles.btn} ${scrollMode ? styles.active : ""}`} onClick={toggleScrollMode} title="Continuous scroll">☰ Scroll</button>}
        <button className={`${styles.btn} ${invertColors ? styles.active : ""}`} onClick={toggleInvert} title="Invert colours">◑ Invert</button>
        <button className={styles.btn} onClick={toggleFocusMode} title="Focus mode (R)">▭ Focus</button>
      </div>

      <div className={styles.spacer} />

      <button className={`${styles.btn} ${styles.openBtn}`} onClick={handleOpen}>Open document</button>
    </div>
  );
}
