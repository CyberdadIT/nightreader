import React, { useRef, useEffect, useCallback, useState } from "react";
import PdfPage from "./PdfPage.jsx";
import { useStore } from "../store/useStore.js";

export default function Viewer({ pdf }) {
  const containerRef = useRef(null);
  const activeTab    = useStore((s) => s.getActiveTab());
  const currentPage  = activeTab?.page ?? 1;
  const totalPages   = activeTab?.totalPages ?? 0;
  const scrollMode   = useStore((s) => s.scrollMode);
  const zoom         = useStore((s) => s.zoom);
  const brightness   = useStore((s) => s.brightness);
  const focusMode    = useStore((s) => s.focusMode);
  const readingMode  = useStore((s) => s.readingMode);
  const annotMode    = useStore((s) => s.annotMode);
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const addAnnotation  = useStore((s) => s.addAnnotation);
  const filePath       = activeTab?.path ?? null;

  const [popup,     setPopup]     = useState(null);
  const [scrollKey, setScrollKey] = useState(0);
  const [copied,    setCopied]    = useState(false);

  const scale = 1.8 * zoom;

  const bgColors = {
    dark: "#0d1117", light: "#e8e4dc",
    sepia: "#e8dfc4", amoled: "#000000", green: "#050f05",
  };

  const hlColors = {
    yellow: "rgba(255,214,0,0.5)", blue:  "rgba(79,195,247,0.5)",
    pink:   "rgba(244,143,177,0.5)", green: "rgba(165,214,167,0.5)",
  };

  // Force re-render pages on scroll mode toggle
  useEffect(() => { setScrollKey((k) => k + 1); }, [scrollMode]);

  // Scroll to page in continuous mode
  useEffect(() => {
    if (!scrollMode || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-page="${currentPage}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentPage, scrollMode, scrollKey]);

  // Track visible page while scrolling
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

  // ── Text selection popup — listen at document level ───────────────────
  useEffect(() => {
    function handleMouseUp(e) {
      // Don't trigger if click is inside the popup itself
      if (e.target.closest("[data-popup-bar]")) return;

      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.toString().trim().length < 1) {
          return; // don't close existing popup on empty click
        }

        const text = sel.toString().trim();
        const range = sel.getRangeAt(0);

        // Find page number from the text layer element
        const node    = range.commonAncestorContainer;
        const pageEl  = (node.nodeType === 1 ? node : node.parentElement)
                        ?.closest("[data-page]");
        const pageNum = pageEl ? Number(pageEl.dataset.page) : currentPage;

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        setPopup({
          x:       rect.left + rect.width / 2,
          y:       rect.top,
          text,
          pageNum,
        });
        setCopied(false);
      }, 20);
    }

    function handleMouseDown(e) {
      // Close popup when clicking outside it
      if (e.target.closest("[data-popup-bar]")) return;
      setPopup(null);
      setCopied(false);
    }

    document.addEventListener("mouseup",   handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mouseup",   handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [currentPage]);

  async function handleCopy() {
    if (!popup) return;
    try {
      await navigator.clipboard.writeText(popup.text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = popup.text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
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
  const popupX = popup ? Math.max(160, Math.min(popup.x, window.innerWidth - 160)) : 0;
  const popupY = popup ? Math.max(10, popup.y - 50) : 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

      {/* Brightness overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: `rgba(0,0,0,${darknessAlpha})`,
        pointerEvents: "none", zIndex: 50,
        transition: "background 0.3s ease",
      }} aria-hidden="true" />

      {/* Annotate mode banner */}
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
          ✏ Select text to copy, highlight or annotate
        </div>
      )}

      {/* Selection toolbar popup */}
      {popup && (
        <div
          data-popup-bar="true"
          style={{
            position:  "fixed",
            left:      `${popupX}px`,
            top:       `${popupY}px`,
            transform: "translateX(-50%)",
            background: "#1c2128",
            border:     "1px solid #30363d",
            borderRadius: "8px",
            padding: "5px 8px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            zIndex: 400,
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            userSelect: "none",
          }}
        >
          {/* Copy button */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleCopy}
            style={{
              background:   copied ? "rgba(165,214,167,0.25)" : "rgba(255,255,255,0.08)",
              border:       "1px solid rgba(255,255,255,0.15)",
              borderRadius: "6px",
              color:        copied ? "#a5d6a7" : "#e6edf3",
              fontSize:     "12px",
              fontWeight:   600,
              cursor:       "pointer",
              padding:      "4px 14px",
              fontFamily:   "sans-serif",
              transition:   "all 0.15s",
              whiteSpace:   "nowrap",
              minWidth:     "80px",
              textAlign:    "center",
            }}
          >
            {copied ? "✓ Copied!" : "⎘ Copy"}
          </button>

          <div style={{ width: "1px", height: "20px", background: "#30363d", flexShrink: 0 }} />

          {/* Highlight colours */}
          {["yellow","blue","pink","green"].map((c) => (
            <button
              key={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyAnnotation(`hl-${c}`)}
              title={`Highlight ${c}`}
              style={{
                width: "22px", height: "22px",
                borderRadius: "50%",
                background: hlColors[c],
                border: "1px solid rgba(255,255,255,0.3)",
                cursor: "pointer",
                flexShrink: 0,
                transition: "transform 0.1s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.25)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            />
          ))}

          <div style={{ width: "1px", height: "20px", background: "#30363d", flexShrink: 0 }} />

          {/* Underline */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAnnotation("underline")}
            title="Underline"
            style={{
              background: "transparent", border: "none",
              color: "#f48fb1", fontSize: "13px",
              cursor: "pointer", padding: "2px 6px",
              fontFamily: "sans-serif",
              textDecoration: "underline",
              textDecorationColor: "#f48fb1",
            }}
          >U</button>

          {/* Strikethrough */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyAnnotation("strikethrough")}
            title="Strikethrough"
            style={{
              background: "transparent", border: "none",
              color: "#ef9a9a", fontSize: "13px",
              cursor: "pointer", padding: "2px 6px",
              fontFamily: "sans-serif",
              textDecoration: "line-through",
            }}
          >S</button>

          <div style={{ width: "1px", height: "20px", background: "#30363d", flexShrink: 0 }} />

          {/* Close */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setPopup(null); window.getSelection()?.removeAllRanges(); }}
            style={{
              background: "transparent", border: "none",
              color: "#8b949e", fontSize: "16px",
              cursor: "pointer", padding: "0 4px", lineHeight: 1,
            }}
          >×</button>
        </div>
      )}

      {/* Page area */}
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
          cursor: "text",
        }}
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
