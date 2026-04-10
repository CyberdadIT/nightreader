import React, { useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { useStore } from "../store/useStore.js";

export default function PdfPage({ pdf, pageNumber, scale = 1.5 }) {
  const canvasRef     = useRef(null);
  const textLayerRef  = useRef(null);
  const overlayRef    = useRef(null);
  const renderTaskRef = useRef(null);

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

        const vp  = page.getViewport({ scale });
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

        // Size overlay
        if (overlayRef.current) {
          overlayRef.current.style.width  = `${w}px`;
          overlayRef.current.style.height = `${h}px`;
        }

        // Build text layer using PDF.js v4 approach
        const textDiv = textLayerRef.current;
        if (textDiv) {
          // Clear previous content
          textDiv.innerHTML = "";
          textDiv.style.width  = `${w}px`;
          textDiv.style.height = `${h}px`;

          const textContent = await page.getTextContent();
          if (cancelled) return;

          // PDF.js v4 TextLayer
          try {
            const { TextLayer } = await import("pdfjs-dist");
            const textLayer = new TextLayer({
              textContentSource: textContent,
              container:         textDiv,
              viewport:          vp,
            });
            await textLayer.render();
          } catch (e) {
            // Fallback: manual text item placement
            const items = textContent.items;
            const transform = vp.transform;

            items.forEach((item) => {
              if (!item.str) return;
              const span = document.createElement("span");
              span.textContent = item.str;

              const tx = pdfjsLib.Util.transform(transform, item.transform);
              const angle = Math.atan2(tx[1], tx[0]);
              const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
              const left = tx[4];
              const top  = tx[5] - fontHeight;

              span.style.cssText = `
                position: absolute;
                left: ${left}px;
                top: ${top}px;
                font-size: ${fontHeight}px;
                font-family: sans-serif;
                transform-origin: 0% 0%;
                transform: rotate(${angle}rad);
                white-space: pre;
                color: transparent;
                cursor: text;
                user-select: text;
                -webkit-user-select: text;
              `;
              textDiv.appendChild(span);
            });
          }
        }
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
        position:     "relative",
        display:      "block",
        width:        "fit-content",
        margin:       `0 auto ${margin / 2}px`,
        borderRadius: "4px",
        boxShadow:    "0 4px 24px rgba(0,0,0,0.6)",
        flexShrink:   0,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", filter: finalFilter, transition: "filter 0.3s ease" }}
      />

      {/* Dark mode overlay */}
      <div
        ref={overlayRef}
        style={{
          position: "absolute", top: 0, left: 0,
          pointerEvents: "none",
          background: overlayColors[readingMode] || overlayColors.dark,
          transition: "background 0.3s ease",
          zIndex: 1,
        }}
      />

      {/* Text layer — uses pdfjs-dist CSS class naming */}
      <div
        ref={textLayerRef}
        className="textLayer"
        style={{
          position:        "absolute",
          top:             0,
          left:            0,
          lineHeight:      1,
          textSizeAdjust:  "none",
          zIndex:          2,
          // Critical: must NOT be overflow:hidden
          overflow:        "visible",
          // Must allow selection
          userSelect:      "text",
          WebkitUserSelect: "text",
          cursor:          "text",
        }}
        aria-label={`Page ${pageNumber} text`}
      />

      <span style={{
        position: "absolute", bottom: "6px", right: "10px",
        fontSize: "10px", fontFamily: "monospace",
        color: "rgba(255,255,255,0.3)",
        pointerEvents: "none", userSelect: "none", zIndex: 3,
      }}>
        {pageNumber}
      </span>
    </div>
  );
}
