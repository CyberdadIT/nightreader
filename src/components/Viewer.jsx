import React, { useRef, useEffect, useCallback, useState } from "react";
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
  const annotMode      = useStore((s) => s.annotMode);
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const addAnnotation  = useStore((s) => s.addAnnotation);
  const filePath       = activeTab?.path ?? null;

  const [popup,     setPopup]     = useState(null);
  const [scrollKey, setScrollKey] = useState(0);
  const [copied,    setCopied]    = useState(false);

  // Track mouse-down position to detect intentional drag vs click
  const dragStartRef = useRef(null);

  const scale = 1.8 * zoom;

  const bgColors = {
    dark: "#0d1117", light: "#e8e4dc",
    sepia: "#e8dfc4", amoled: "#000000", green: "#050f05",
  };
  const hlColors = {
    yellow: "rgba(255,214,0,0.5)", blue: "rgba(79,195,247,0.5)",
    pink: "rgba(244,143,177,0.5)", green: "rgba(165,214,167,0.5)",
  };

  useEffect(() => { setScrollKey((k) => k + 1); }, [scrollMode]);

  useEffect(() => {
    if (!scrollMode || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-page="${currentPage}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentPage, scrollMode, scrollKey]);

  const onScroll = useCallback(() => {
    if (!scrollMode || !containerRef.current) return;
    const container    = containerRef.current;
    const containerTop = container.getBoundingClientRect().top;
    const pages        = container.querySelectorAll("[data-page]");
    let bestPage = currentPage, bestDist = Infinity;
    pages.forEach((el) => {
      const dist = Math.abs(el.getBoundingClientRect().top - containerTop);
      if (dist < bestDist) { bestDist = dist; bestPage = Number(el.dataset.page); }
    });
    if (bestPage !== currentPage) setCurrentPage(bestPage);
  }, [scrollMode, currentPage, setCurrentPage]);

  // ── Link click handler ────────────────────────────────────────────────
  useEffect(() => {
    function handleLinkClick(e) {
      const link = e.target.closest("a[href]");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href) return;
      if (href.startsWith("http") || href.startsWith("mailto:")) {
        e.preventDefault();
        e.stopPropagation();
        window.open(href, "_blank", "noopener,noreferrer");
      }
    }
    document.addEventListener("click", handleLinkClick, true);
    return () => document.removeEventListener("click", handleLinkClick, true);
  }, []);

  // ── Smart text selection ──────────────────────────────────────────────
  // Problem: PDF.js spans are absolutely positioned with CSS transforms.
  // The browser's drag-select treats the entire textLayer div as one block
  // and selects everything from start to end, ignoring the visual lines.
  //
  // Solution: on mouseup, we look at ONLY the spans whose bounding boxes
  // overlap with the user's drag rectangle. We then read text only from
  // those spans. This gives a selection that matches what you can see.
  useEffect(() => {
    function handleMouseDown(e) {
      if (e.target.closest("[data-popup-bar]")) return;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      setPopup(null);
      setCopied(false);
    }

    function handleMouseUp(e) {
      if (e.target.closest("[data-popup-bar]")) return;
      const start = dragStartRef.current;
      if (!start) return;

      const end = { x: e.clientX, y: e.clientY };
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);

      // Ignore clicks (no meaningful drag)
      if (dx < 4 && dy < 4) return;

      // Build a selection rectangle from drag start to end
      const selRect = {
        left:   Math.min(start.x, end.x),
        right:  Math.max(start.x, end.x),
        top:    Math.min(start.y, end.y),
        bottom: Math.max(start.y, end.y),
      };

      // Find the page the drag happened on
      const pageEl = e.target.closest("[data-page]") ||
        document.elementFromPoint(
          (start.x + end.x) / 2,
          (start.y + end.y) / 2
        )?.closest("[data-page]");
      const pageNum = pageEl ? Number(pageEl.dataset.page) : currentPage;

      // Collect all text spans on that page
      const textLayer = pageEl?.querySelector(".textLayer");
      if (!textLayer) return;

      const spans = Array.from(textLayer.querySelectorAll("span"));

      // Keep only spans whose bounding rect overlaps the drag selection rect
      // Add a small vertical tolerance (4px) to catch spans on the same line
      const TOLERANCE = 4;
      const hitSpans = spans.filter((span) => {
        const r = span.getBoundingClientRect();
        return (
          r.right  >= selRect.left   - TOLERANCE &&
          r.left   <= selRect.right  + TOLERANCE &&
          r.bottom >= selRect.top    - TOLERANCE &&
          r.top    <= selRect.bottom + TOLERANCE &&
          r.width  > 0 && r.height > 0
        );
      });

      if (hitSpans.length === 0) return;

      // Sort spans by their visual position (top first, then left)
      hitSpans.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        if (Math.abs(ra.top - rb.top) > 4) return ra.top - rb.top;
        return ra.left - rb.left;
      });

      // Join their text, collapsing extra whitespace
      const text = hitSpans
        .map((s) => s.textContent)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!text) return;

      // Show popup centered above the drag selection
      const midX = (selRect.left + selRect.right)  / 2;
      const topY =  selRect.top;

      setPopup({ x: midX, y: topY, text, pageNum });
      setCopied(false);

      // Also clear the browser's built-in selection (which grabbed too much)
      window.getSelection()?.removeAllRanges();
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup",   handleMouseUp);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup",   handleMouseUp);
    };
  }, [currentPage]);

  async function handleCopy() {
    if (!popup) return;
    try {
      await navigator.clipboard.writeText(popup.text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = popup.text;
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0;";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => { setPopup(null); setCopied(false); }, 900);
  }

  function applyAnnotation(type) {
    if (!popup || !filePath) return;
    addAnnotation({ filePath, page: popup.pageNum, quote: popup.text, type, note: "" });
    setPopup(null);
    window.getSelection()?.removeAllRanges();
  }

  if (!pdf) return null;

  const darknessAlpha = ((100 - brightness) / 100) * 0.85;
  const popupX = popup
    ? Math.max(160, Math.min(popup.x, window.innerWidth - 160))
    : 0;
  const popupY = popup ? Math.max(10, popup.y - 52) : 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

      {/* Brightness overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: `rgba(0,0,0,${darknessAlpha})`,
        pointerEvents: "none", zIndex: 50,
        transition: "background 0.3s ease",
      }} aria-hidden="true" />

      {annotMode && (
        <div style={{
          position: "absolute", top: "8px", left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(79,195,247,0.12)",
          border: "1px solid rgba(79,195,247,0.35)",
          borderRadius: "20px", padding: "4px 16px",
          fontSize: "11px", color: "#4fc3f7",
          zIndex: 60, pointerEvents: "none",
          fontFamily: "sans-serif", whiteSpace: "nowrap",
        }}>
          ✏ Drag over text to copy, highlight or annotate
        </div>
      )}

      {/* Selection popup */}
      {popup && (
        <div
          data-popup-bar="true"
          style={{
            position: "fixed",
            left: `${popupX}px`, top: `${popupY}px`,
            transform: "translateX(-50%)",
            background: "#1c2128", border: "1px solid #30363d",
            borderRadius: "8px", padding: "5px 8px",
            display: "flex", alignItems: "center", gap: "5px",
            zIndex: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            userSelect: "none",
          }}
        >
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleCopy}
            style={{
              background:   copied ? "rgba(165,214,167,0.25)" : "rgba(255,255,255,0.08)",
              border:       "1px solid rgba(255,255,255,0.15)",
              borderRadius: "6px", color: copied ? "#a5d6a7" : "#e6edf3",
              fontSize: "12px", fontWeight: 600, cursor: "pointer",
              padding: "4px 14px", fontFamily: "sans-serif",
              whiteSpace: "nowrap", minWidth: "80px", textAlign: "center",
            }}
          >
            {copied ? "✓ Copied!" : "⎘ Copy"}
          </button>

          <div style={{ width: "1px", height: "20px", background: "#30363d", flexShrink: 0 }} />

          {["yellow","blue","pink","green"].map((c) => (
            <button key={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyAnnotation(`hl-${c}`)}
              title={`Highlight ${c}`}
              style={{
                width: "22px", height: "22px", borderRadius: "50%",
                background: hlColors[c], border: "1px solid rgba(255,255,255,0.3)",
                cursor: "pointer", flexShrink: 0, transition: "transform 0.1s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.25)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            />
          ))}

          <div style={{ width: "1px", height: "20px", background: "#30363d", flexShrink: 0 }} />

          <button onMouseDown={(e) => e.preventDefault()} onClick={() => applyAnnotation("underline")}
            style={{ background: "transparent", border: "none", color: "#f48fb1", fontSize: "14px", cursor: "pointer", padding: "2px 6px", fontFamily: "sans-serif", textDecoration: "underline", textDecorationColor: "#f48fb1" }}>U</button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => applyAnnotation("strikethrough")}
            style={{ background: "transparent", border: "none", color: "#ef9a9a", fontSize: "14px", cursor: "pointer", padding: "2px 6px", fontFamily: "sans-serif", textDecoration: "line-through" }}>S</button>

          <div style={{ width: "1px", height: "20px", background: "#30363d", flexShrink: 0 }} />

          <button onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setPopup(null); window.getSelection()?.removeAllRanges(); }}
            style={{ background: "transparent", border: "none", color: "#8b949e", fontSize: "18px", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Scrollable page area */}
      <div
        ref={containerRef}
        data-viewer-scroll="true"
        onScroll={onScroll}
        style={{
          flex: 1, overflowY: "auto", overflowX: "auto",
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: focusMode ? "40px 32px" : "24px 16px 40px",
          gap: "16px",
          background: bgColors[readingMode] || bgColors.dark,
          transition: "background 0.25s ease, padding 0.25s ease",
          cursor: "crosshair",
          outline: "none",
        }}
        tabIndex={-1}
      >
        {scrollMode
          ? Array.from({ length: totalPages }, (_, i) => (
              <PdfPage key={`${scrollKey}-${i+1}`} pdf={pdf} pageNumber={i+1} scale={scale} />
            ))
          : <PdfPage key={`${scrollKey}-${currentPage}`} pdf={pdf} pageNumber={currentPage} scale={scale} />
        }
      </div>
    </div>
  );
}
