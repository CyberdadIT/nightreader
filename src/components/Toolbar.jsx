import React from "react";
import { useStore } from "../store/useStore.js";
import { openFilePicker } from "../utils/platform.js";
import styles from "./Toolbar.module.css";

export default function Toolbar({ onFileLoaded }) {
  const currentPage    = useStore((s) => s.currentPage);
  const totalPages     = useStore((s) => s.totalPages);
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
  const filePath         = useStore((s) => s.filePath);

  async function handleOpen() {
    const file = await openFilePicker();
    if (file) onFileLoaded?.(file);
  }

  function handlePageInput(e) {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) setCurrentPage(val);
  }

  function handleZoomInput(e) {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) setZoom(val / 100);
  }

  function handleBookmark() {
    if (!filePath) return;
    addBookmark({ page: currentPage, filePath, title: `Page ${currentPage}` });
  }

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Reader controls">
      {/* Page navigation */}
      <div className={styles.group}>
        <button
          className={styles.btn}
          onClick={() => setCurrentPage(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          title="Previous page (←)"
        >
          ◀
        </button>
        <input
          className={styles.pageInput}
          type="number"
          min={1}
          max={totalPages || 1}
          value={currentPage}
          onChange={handlePageInput}
          aria-label="Current page"
        />
        <span className={styles.pageOf}>/ {totalPages || "—"}</span>
        <button
          className={styles.btn}
          onClick={() => setCurrentPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          title="Next page (→)"
        >
          ▶
        </button>
      </div>

      <div className={styles.sep} />

      {/* Zoom */}
      <div className={styles.group}>
        <button
          className={styles.btn}
          onClick={() => setZoom(zoom - 0.1)}
          aria-label="Zoom out"
          title="Zoom out (−)"
        >
          −
        </button>
        <input
          className={styles.zoomInput}
          type="number"
          min={50}
          max={300}
          value={Math.round(zoom * 100)}
          onChange={handleZoomInput}
          aria-label="Zoom level"
        />
        <span className={styles.pct}>%</span>
        <button
          className={styles.btn}
          onClick={() => setZoom(zoom + 0.1)}
          aria-label="Zoom in"
          title="Zoom in (+)"
        >
          +
        </button>
        <button
          className={styles.btn}
          onClick={() => setZoom(1.0)}
          aria-label="Reset zoom"
          title="Reset zoom (Ctrl+0)"
        >
          ⊡
        </button>
      </div>

      <div className={styles.sep} />

      {/* Tools */}
      <div className={styles.group}>
        <button
          className={`${styles.btn} ${searchVisible ? styles.active : ""}`}
          onClick={toggleSearch}
          aria-label="Find in document"
          title="Find (Ctrl+F)"
        >
          🔍 Find
        </button>
        <button
          className={`${styles.btn} ${annotMode ? styles.active : ""}`}
          onClick={toggleAnnotMode}
          aria-label="Annotation mode"
          title="Annotate"
        >
          ✏ Annotate
        </button>
        <button
          className={styles.btn}
          onClick={handleBookmark}
          aria-label="Bookmark page"
          title="Bookmark"
        >
          🔖 Mark
        </button>
      </div>

      <div className={styles.sep} />

      {/* View options */}
      <div className={styles.group}>
        <button
          className={`${styles.btn} ${scrollMode ? styles.active : ""}`}
          onClick={toggleScrollMode}
          title="Toggle continuous scroll"
        >
          ☰ Scroll
        </button>
        <button
          className={`${styles.btn} ${invertColors ? styles.active : ""}`}
          onClick={toggleInvert}
          title="Invert colours"
        >
          ◑ Invert
        </button>
        <button
          className={styles.btn}
          onClick={toggleFocusMode}
          title="Focus mode (R)"
        >
          ▭ Focus
        </button>
      </div>

      <div className={styles.spacer} />

      {/* Open file */}
      <button className={`${styles.btn} ${styles.openBtn}`} onClick={handleOpen}>
        📂 Open PDF
      </button>
    </div>
  );
}
