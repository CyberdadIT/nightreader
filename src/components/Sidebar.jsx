import React, { useState, useEffect } from "react";
import { useStore } from "../store/useStore.js";
import styles from "./Sidebar.module.css";

const TABS = ["Pages", "Contents", "Bookmarks"];

export default function Sidebar({ pdf, outline }) {
  const [tab, setTab] = useState(0);
  const [resolvedOutline, setResolvedOutline] = useState([]);

  const currentPage    = useStore((s) => s.currentPage);
  const totalPages     = useStore((s) => s.totalPages);
  const bookmarks      = useStore((s) => s.bookmarks);
  const filePath       = useStore((s) => s.filePath);
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const removeBookmark = useStore((s) => s.removeBookmark);

  const fileBookmarks = bookmarks.filter((b) => b.filePath === filePath);

  // Resolve PDF.js outline destinations to actual page numbers
  useEffect(() => {
    if (!pdf || !outline || outline.length === 0) {
      setResolvedOutline([]);
      return;
    }

    async function resolveItem(item) {
      let pageNum = null;
      try {
        if (item.dest) {
          let dest = item.dest;
          // dest can be a string (named dest) or array (explicit dest)
          if (typeof dest === "string") {
            dest = await pdf.getDestination(dest);
          }
          if (Array.isArray(dest) && dest[0]) {
            const pageRef = dest[0];
            const pageIndex = await pdf.getPageIndex(pageRef);
            pageNum = pageIndex + 1; // convert 0-based to 1-based
          }
        }
      } catch (e) {
        // silently ignore unresolvable destinations
      }

      const children = item.items
        ? await Promise.all(item.items.map(resolveItem))
        : [];

      return { title: item.title, page: pageNum, items: children };
    }

    Promise.all(outline.map(resolveItem)).then(setResolvedOutline);
  }, [pdf, outline]);

  return (
    <aside className={styles.sidebar} aria-label="Document sidebar">
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
        {tab === 0 && (
          <div className={styles.thumbGrid}>
            {Array.from({ length: totalPages }, (_, i) => {
              const n = i + 1;
              return (
                <div
                  key={n}
                  className={`${styles.thumb} ${currentPage === n ? styles.thumbActive : ""}`}
                  onClick={() => setCurrentPage(n)}
                  role="button"
                  aria-label={`Go to page ${n}`}
                >
                  <div className={styles.thumbPreview}>
                    <div className={styles.thumbLines}>
                      {[100, 70, 85, 100, 60, 80, 90, 65].map((w, j) => (
                        <div key={j} className={styles.thumbLine} style={{ width: `${w}%` }} />
                      ))}
                    </div>
                  </div>
                  <span className={styles.thumbLabel}>{n}</span>
                </div>
              );
            })}
          </div>
        )}

        {tab === 1 && (
          <div className={styles.toc}>
            {resolvedOutline.length > 0 ? (
              resolvedOutline.map((item, i) => (
                <TocItem
                  key={i}
                  item={item}
                  currentPage={currentPage}
                  onNavigate={setCurrentPage}
                />
              ))
            ) : (
              <p className={styles.empty}>
                {outline && outline.length > 0
                  ? "Resolving table of contents…"
                  : "No table of contents in this document."}
              </p>
            )}
          </div>
        )}

        {tab === 2 && (
          <div className={styles.bookmarkList}>
            {fileBookmarks.length > 0 ? (
              fileBookmarks.map((bm) => (
                <div key={bm.id} className={styles.bookmark}>
                  <div
                    className={styles.bookmarkMain}
                    onClick={() => setCurrentPage(bm.page)}
                    role="button"
                  >
                    <span className={styles.bookmarkTitle}>{bm.title}</span>
                    <span className={styles.bookmarkPage}>Page {bm.page}</span>
                  </div>
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

function TocItem({ item, currentPage, onNavigate, depth = 0 }) {
  const isActive = item.page === currentPage;
  const hasPage  = item.page !== null && item.page !== undefined;

  return (
    <>
      <div
        className={`${styles.tocItem} ${isActive ? styles.tocActive : ""} ${!hasPage ? styles.tocNoLink : ""}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={() => hasPage && onNavigate(item.page)}
        role={hasPage ? "button" : undefined}
        title={hasPage ? `Go to page ${item.page}` : item.title}
      >
        <span className={styles.tocTitle}>{item.title}</span>
        {hasPage && (
          <span className={styles.tocPage}>{item.page}</span>
        )}
      </div>
      {item.items?.map((child, i) => (
        <TocItem
          key={i}
          item={child}
          currentPage={currentPage}
          onNavigate={onNavigate}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
