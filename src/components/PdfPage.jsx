import React, { useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { useStore } from "../store/useStore.js";

export default function PdfPage({ pdf, pageNumber, scale = 1.5 }) {
  const canvasRef       = useRef(null);
  const textLayerRef    = useRef(null);
  const overlayRef      = useRef(null);
  const renderTaskRef   = useRef(null);
  // Store raw text items so Viewer can use them for smart selection
  const textItemsRef    = useRef([]);

  const readingMode  = useStore((s) => s.readingMode);
  const invertColors = useStore((s) => s.invertColors);
  const margin       = useStore((s) => s.margin);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;

    async function renderPage() {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const vp     = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;

        canvas.width        = Math.floor(vp.width  * dpr);
        canvas.height       = Math.floor(vp.height * dpr);
        canvas.style.width  = `${Math.floor(vp.width)}px`;
        canvas.style.height = `${Math.floor(vp.height)}px`;
        ctx.scale(dpr, dpr);

        renderTaskRef.current?.cancel();
        const task = page.render({ canvasContext: ctx, viewport: vp });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;

        const w = Math.floor(vp.width);
        const h = Math.floor(vp.height);

        if (overlayRef.current) {
          overlayRef.current.style.width  = `${w}px`;
          overlayRef.current.style.height = `${h}px`;
        }

        // ── Build selectable text layer ──────────────────────────────────
        const textDiv = textLayerRef.current;
        if (!textDiv) return;
        textDiv.innerHTML = "";
        textDiv.style.width  = `${w}px`;
        textDiv.style.height = `${h}px`;

        const textContent = await page.getTextContent();
        if (cancelled) return;

        // Store items for use by the selection popup
        textItemsRef.current = textContent.items;

        // Use PDF.js v4 TextLayer
        try {
          const { TextLayer } = await import("pdfjs-dist");
          const tl = new TextLayer({
            textContentSource: textContent,
            container: textDiv,
            viewport: vp,
          });
          await tl.render();
          if (cancelled) return;
        } catch (_e) {
          // Fallback: manual span placement with correct widths
          textContent.items.forEach((item) => {
            if (!item.str?.trim()) return;
            const span = document.createElement("span");
            span.textContent = item.str;
            const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
            const angle = Math.atan2(tx[1], tx[0]);
            const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
            span.style.cssText = `
              position:absolute;left:${tx[4]}px;top:${tx[5] - fontHeight}px;
              font-size:${fontHeight}px;
              ${item.width ? `width:${item.width * scale}px;` : ""}
              font-family:sans-serif;transform-origin:0% 0%;
              transform:rotate(${angle}rad);white-space:pre;
            `;
            textDiv.appendChild(span);
          });
        }

        // ── Place link overlays from annotation layer ────────────────────
        const annotations = await page.getAnnotations();
        if (cancelled) return;
        annotations.forEach((annot) => {
          if (annot.subtype !== "Link" || !annot.url) return;
          const [x1, y1, x2, y2] = annot.rect;
          const [ax1, ay1] = pdfjsLib.Util.applyTransform([x1, y1], vp.transform);
          const [ax2, ay2] = pdfjsLib.Util.applyTransform([x2, y2], vp.transform);
          const a = document.createElement("a");
          a.href  = annot.url;
          a.title = annot.url;
          a.setAttribute("data-pdf-link", "true");
          a.style.cssText = `
            position:absolute;
            left:${Math.min(ax1,ax2)}px;top:${Math.min(ay1,ay2)}px;
            width:${Math.abs(ax2-ax1)}px;height:${Math.abs(ay2-ay1)}px;
            cursor:pointer;z-index:5;display:block;
          `;
          textDiv.appendChild(a);
        });

      } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
          console.error(`Page ${pageNumber} render error:`, err);
        }
      }
    }

    renderPage();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdf, pageNumber, scale]);

  const overlayColors = {
    dark:   "rgba(10,14,20,0.55)",  light:  "rgba(0,0,0,0)",
    sepia:  "rgba(112,66,20,0.25)", amoled: "rgba(0,0,0,0.78)",
    green:  "rgba(0,30,0,0.65)",
  };
  const canvasFilters = {
    dark:   "brightness(0.85) contrast(1.05)", light:  "none",
    sepia:  "sepia(0.5) brightness(0.95)",     amoled: "brightness(0.35) contrast(1.2)",
    green:  "brightness(0.6) contrast(1.1) hue-rotate(90deg)",
  };
  const finalFilter = invertColors
    ? "invert(1) hue-rotate(180deg)"
    : (canvasFilters[readingMode] || "none");

  return (
    <div
      data-page={pageNumber}
      style={{
        position: "relative", display: "block",
        width: "fit-content", margin: `0 auto ${margin / 2}px`,
        borderRadius: "4px", boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
        flexShrink: 0,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", filter: finalFilter, transition: "filter 0.3s ease" }}
      />
      <div ref={overlayRef} style={{
        position: "absolute", top: 0, left: 0,
        pointerEvents: "none",
        background: overlayColors[readingMode] || overlayColors.dark,
        transition: "background 0.3s ease", zIndex: 1,
      }} />
      {/* Text layer — spans are the only pointer-events targets */}
      <div
        ref={textLayerRef}
        className="textLayer"
        style={{
          position: "absolute", top: 0, left: 0,
          lineHeight: 1, zIndex: 2, overflow: "visible",
        }}
        aria-label={`Page ${pageNumber} text`}
      />
      <span style={{
        position: "absolute", bottom: "6px", right: "10px",
        fontSize: "10px", fontFamily: "monospace",
        color: "rgba(255,255,255,0.3)",
        pointerEvents: "none", userSelect: "none", zIndex: 3,
      }}>{pageNumber}</span>
    </div>
  );
}
