import React, { useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { TextLayer } from "pdfjs-dist";
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

        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;

        canvas.width  = Math.floor(vp.width  * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width  = `${Math.floor(vp.width)}px`;
        canvas.style.height = `${Math.floor(vp.height)}px`;
        ctx.scale(dpr, dpr);

        renderTaskRef.current?.cancel();
        const renderTask = page.render({ canvasContext: ctx, viewport: vp });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (cancelled) return;

        // Set overlay size to match canvas exactly
        if (overlayRef.current) {
          overlayRef.current.style.width  = `${Math.floor(vp.width)}px`;
          overlayRef.current.style.height = `${Math.floor(vp.height)}px`;
        }

        // Text layer — transparent spans for selection only
        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          textLayerDiv.innerHTML = "";
          textLayerDiv.style.width  = `${Math.floor(vp.width)}px`;
          textLayerDiv.style.height = `${Math.floor(vp.height)}px`;
          const textContent = await page.getTextContent();
          if (cancelled) return;
          const textLayer = new TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: vp,
          });
          await textLayer.render();
        }
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
          console.error(`Page render error p${pageNumber}:`, err);
        }
      }
    }

    renderPage();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdf, pageNumber, scale]);

  // Dark mode overlay colour and opacity per mode
  // This sits ON TOP of the canvas tinting it dark without removing text readability
  const overlayColors = {
    dark:   "rgba(10, 14, 20, 0.55)",
    light:  "rgba(0,0,0,0)",           // no overlay in light mode
    sepia:  "rgba(112, 66, 20, 0.25)", // warm brown tint
    amoled: "rgba(0, 0, 0, 0.78)",     // very dark — OLED style
    green:  "rgba(0, 30, 0, 0.65)",    // green night vision tint
  };

  const overlayColor = overlayColors[readingMode] || overlayColors.dark;

  // Canvas-level filter per mode
  const canvasFilters = {
    dark:   "brightness(0.85) contrast(1.05)",
    light:  "none",
    sepia:  "sepia(0.5) brightness(0.95)",
    amoled: "brightness(0.35) contrast(1.2)",
    green:  "brightness(0.6) contrast(1.1) hue-rotate(90deg)",
  };

  const canvasFilter = canvasFilters[readingMode] || "none";

  // Combine with invert if toggled
  const finalFilter = invertColors
    ? `invert(1) hue-rotate(180deg)`
    : canvasFilter;

  const wrapperStyle = {
    position: "relative",
    display: "block",          // block not inline-block — fixes scroll mode gaps
    width: "fit-content",
    margin: `0 auto ${margin / 2}px`,
    borderRadius: "4px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
    overflow: "hidden",
    userSelect: "text",
    flexShrink: 0,
  };

  return (
    <div data-page={pageNumber} style={wrapperStyle}>
      {/* The actual PDF canvas */}
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          filter: finalFilter,
          transition: "filter 0.3s ease",
        }}
      />

      {/* Dark mode colour overlay — sits above canvas, below text layer */}
      <div
        ref={overlayRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
          background: overlayColor,
          transition: "background 0.3s ease",
          zIndex: 1,
        }}
      />

      {/* Transparent text layer for selection/search — sits on top */}
      <div
        ref={textLayerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          overflow: "hidden",
          lineHeight: 1,
          textSizeAdjust: "none",
          forcedColorAdjust: "none",
          zIndex: 2,
        }}
        aria-label={`Page ${pageNumber} text`}
      />

      {/* Page number badge */}
      <span style={{
        position: "absolute",
        bottom: "6px",
        right: "10px",
        fontSize: "10px",
        fontFamily: "monospace",
        color: "rgba(255,255,255,0.3)",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 3,
      }}>
        {pageNumber}
      </span>
    </div>
  );
}
