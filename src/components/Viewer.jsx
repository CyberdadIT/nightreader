import React, { useRef, useEffect, useCallback } from "react";
import PdfPage from "./PdfPage.jsx";
import { useStore } from "../store/useStore.js";

export default function Viewer({ pdf }) {
  const containerRef   = useRef(null);
  const activeTab      = useStore((s) => s.getActiveTab());
  const currentPage    = activeTab?.page ?? 1;
  const totalPages     = activeTab?.totalPages ?? 0;
  const scrollMode     = useStore((s) => s.scrollMode);
  const zoom           = useStore((s) => s.zoom);
  const brightness     = useStore((s) => s.brightness);
  const focusMode      = useStore((s) => s.focusMode);
  const readingMode    = useStore((s) => s.readingMode);
  const setCurrentPage = useStore((s) => s.setCurrentPage);

  const scale = 1.8 * zoom; // 1.8 base gives sharper text at 100%

  const bgColors = {
    dark:   "#0d1117",
    light:  "#e8e4dc",
    sepia:  "#e8dfc4",
    amoled: "#000000",
    green:  "#050f05",
  };

  // Scroll to current page in continuous mode
  useEffect(() => {
    if (!scrollMode || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-page="${currentPage}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentPage, scrollMode]);

  // Track visible page while scrolling
  const onScroll = useCallback(() => {
    if (!scrollMode || !containerRef.current) return;
    const container    = containerRef.current;
    const containerTop = container.getBoundingClientRect().top;
    const pages        = container.querySelectorAll("[data-page]");
    let bestPage = currentPage;
    let bestDist = Infinity;
    pages.forEach((el) => {
      const dist = Math.abs(el.getBoundingClientRect().top - containerTop);
      if (dist < bestDist) { bestDist = dist; bestPage = Number(el.dataset.page); }
    });
    if (bestPage !== currentPage) setCurrentPage(bestPage);
  }, [scrollMode, currentPage, setCurrentPage]);

  if (!pdf) return null;

  const darknessAlpha = ((100 - brightness) / 100) * 0.85;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `rgba(0,0,0,${darknessAlpha})`,
        pointerEvents: "none", zIndex: 50,
        transition: "background 0.3s ease",
      }} aria-hidden="true" />

      <div
        ref={containerRef}
        onScroll={onScroll}
        style={{
          flex: 1, overflowY: "auto", overflowX: "auto",
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: focusMode ? "40px 32px" : "24px 16px 40px",
          gap: "16px",
          background: bgColors[readingMode] || bgColors.dark,
          transition: "background 0.25s ease, padding 0.25s ease",
        }}
      >
        {scrollMode
          ? Array.from({ length: totalPages }, (_, i) => (
              <PdfPage key={i + 1} pdf={pdf} pageNumber={i + 1} scale={scale} />
            ))
          : <PdfPage pdf={pdf} pageNumber={currentPage} scale={scale} />
        }
      </div>
    </div>
  );
}
