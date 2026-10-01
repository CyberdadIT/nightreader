import React, { useState, useEffect, useRef } from "react";
import { useStore } from "../store/useStore.js";
import styles from "./Sidebar.module.css";
import { goToBookLocation } from "./EpubChapter.jsx";

const TABS = ["Pages", "Contents", "Bookmarks"];

export default function Sidebar({ pdf, outline, onClose }) {
  const [tab, setTab]                  = useState(0);
  const [resolvedOutline, setResolved] = useState([]);
  const [thumbnails, setThumbnails]    = useState({});
  const pdfIdRef                       = useRef(null); // track which PDF thumbnails belong to

  const activeTab      = useStore((s) => s.getActiveTab());
  const activeTabId    = useStore((s) => s.activeTabId);
  const currentPage    = activeTab?.page ?? 1;
  const totalPages     = activeTab?.totalPages ?? 0;
  const bookmarks      = useStore((s) => s.bookmarks);
  const filePath       = activeTab?.path ?? null;
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const removeBookmark = useStore((s) => s.removeBookmark);

  const fileBookmarks = bookmarks.filter((b) => b.filePath === filePath && !b.deleted);

  // ── Clear thumbnails and outline when tab/PDF changes ─────────────────
  useEffect(() => {
    // Use the pdf object reference itself as the key
    const pdfKey = pdf ? (pdf._pdfInfo?.fingerprints?.[0] ?? activeTabId) : null;
    if (pdfKey !== pdfIdRef.current) {
      pdfIdRef.current = pdfKey;
      setThumbnails({});   // clear old thumbnails
      setResolved([]);     // clear old TOC
    }
  }, [pdf, activeTabId]);

  // ── Resolve TOC destinations ──────────────────────────────────────────
  useEffect(() => {
    if (pdf?.kind === "epub") { setResolved(outline || []); return; }
    if (!pdf || !outline || outline.length === 0) { setResolved([]); return; }
    let cancelled = false;

    async function resolveItem(item) {
      let pageNum = null;
      try {
        if (item.dest) {
          let dest = item.dest;
          if (typeof dest === "string") dest = await pdf.getDestination(dest);
          if (Array.isArray(dest) && dest[0]) {
            const idx = await pdf.getPageIndex(dest[0]);
            pageNum = idx + 1;
          }
        }
      } catch {}
      const children = item.items
        ? await Promise.all(item.items.map(resolveItem))
        : [];
      return { title: item.title, page: pageNum, items: children };
    }

    Promise.all(outline.map(resolveItem)).then((resolved) => {
      if (!cancelled) setResolved(resolved);
    });

    return () => { cancelled = true; };
  }, [pdf, outline]);

  // ── Render page thumbnails for current PDF ────────────────────────────
  useEffect(() => {
    if (!pdf || pdf.kind === "epub" || tab !== 0) return;
    let cancelled = false;

    async function renderThumbs() {
      const scale = 0.2;
      const limit = Math.min(totalPages, 50);

      for (let i = 1; i <= limit; i++) {
        if (cancelled) break;

        // Skip if already rendered for this PDF
        setThumbnails((prev) => {
          if (prev[i]) return prev; // already done
          return prev;
        });

        // Check outside setState if we already have it
        try {
          const page   = await pdf.getPage(i);
          if (cancelled) break;

          const vp     = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width  = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          const ctx = canvas.getContext("2d");
          await page.render({ canvasContext: ctx, viewport: vp }).promise;

          if (!cancelled) {
            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
            setThumbnails((prev) => {
              // Only add if we haven't been cleared (pdf changed)
              return { ...prev, [i]: dataUrl };
            });
          }
        } catch {}
      }
    }

    // Small delay to let the clear take effect before rendering new thumbs
    const timer = setTimeout(renderThumbs, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pdf, tab, totalPages, activeTabId]); // activeTabId forces re-run on tab switch

  return (
    <aside className={styles.sidebar} aria-label="Document sidebar">
      <button onClick={onClose} style={{padding:8,background:"var(--panel)",color:"var(--text)",border:0}} aria-label="Close sidebar">Close sidebar</button>
      <div className={styles.tabs} role="tablist">
        {TABS.map((label, i) => (
          <button
            key={label}
            role="tab"
            aria-selected={tab === i}
            className={`${styles.tab} ${tab === i ? styles.tabActive : ""}`}
            onClick={() => setTab(i)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.content} role="tabpanel">

        {/* ── Page thumbnails ─────────────────────────────────────────── */}
        {tab === 0 && (
          <div className={styles.thumbGrid}>
            {Array.from({ length: totalPages }, (_, i) => {
              const n     = i + 1;
              const thumb = thumbnails[n];
              return (
                <button
                  type="button"
                  key={n}
                  className={`${styles.thumb} ${currentPage === n ? styles.thumbActive : ""}`}
                  onClick={() => setCurrentPage(n)}
                  aria-label={pdf?.kind === "epub" ? `Go to chapter ${n}` : `Go to page ${n}`}
                  aria-current={currentPage === n ? "page" : undefined}
                >
                  <div className={styles.thumbPreview}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                      />
                    ) : (
                      <div className={styles.thumbPlaceholder}>
                        <div className={styles.thumbLines}>
                          {[100,70,85,100,60,80,90,65].map((w, j) => (
                            <div key={j} className={styles.thumbLine} style={{ width: `${w}%` }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <span className={styles.thumbLabel}>{pdf?.kind === "epub" ? `Chapter ${n}` : n}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Table of Contents ────────────────────────────────────────── */}
        {tab === 1 && (
          <nav className={styles.toc} aria-label="Table of contents">
            {resolvedOutline.length > 0 ? (
              <ul className={styles.tocList}>
                {resolvedOutline.map((item, i) => (
                  <TocItem
                    key={i}
                    item={item}
                    currentPage={currentPage}
                    onNavigate={(page, anchor) => (pdf?.kind === "epub" ? goToBookLocation(page, anchor) : setCurrentPage(page))}
                    unit={pdf?.kind === "epub" ? "chapter" : "page"}
                  />
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>
                {outline?.length > 0
                  ? "Resolving contents…"
                  : "No table of contents in this document."}
              </p>
            )}
          </nav>
        )}

        {/* ── Bookmarks ────────────────────────────────────────────────── */}
        {tab === 2 && (
          <div className={styles.bookmarkList}>
            {fileBookmarks.length > 0 ? (
              fileBookmarks.map((bm) => (
                <div key={bm.id} className={styles.bookmark}>
                  <button
                    type="button"
                    className={styles.bookmarkMain}
                    onClick={() => setCurrentPage(bm.page)}
                  >
                    <span className={styles.bookmarkTitle}>{bm.title}</span>
                    <span className={styles.bookmarkPage}>{pdf?.kind === "epub" ? "Chapter" : "Page"} {bm.page}</span>
                  </button>
                  <button
                    className={styles.bookmarkDelete}
                    onClick={() => removeBookmark(bm.id)}
                    aria-label="Remove bookmark"
                  >×</button>
                </div>
              ))
            ) : (
              <p className={styles.empty}>
                No bookmarks yet. Click Mark in the toolbar while reading.
              </p>
            )}
          </div>
        )}

      </div>
    </aside>
  );
}

function TocItem({ item, currentPage, onNavigate, unit, depth = 0 }) {
  const isActive = item.page === currentPage;
  const hasPage  = item.page !== null && item.page !== undefined;
  return (
    <li>
      {hasPage ? (
        <button
          type="button"
          className={`${styles.tocItem} ${isActive ? styles.tocActive : ""}`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => onNavigate(item.page, item.anchor)}
          aria-current={isActive ? "location" : undefined}
          title={item.title}
        >
          <span className={styles.tocTitle}>{item.title}</span>
          <span className={styles.tocPage} aria-label={`${unit} ${item.page}`}>{item.page}</span>
        </button>
      ) : (
        <span className={`${styles.tocItem} ${styles.tocNoLink}`} style={{ paddingLeft: `${8 + depth * 12}px` }}>
          <span className={styles.tocTitle}>{item.title}</span>
        </span>
      )}
      {item.items?.length > 0 && (
        <ul className={styles.tocList}>
          {item.items.map((child, i) => (
            <TocItem key={i} item={child} currentPage={currentPage} onNavigate={onNavigate} unit={unit} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
