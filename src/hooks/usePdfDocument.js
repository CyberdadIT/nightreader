import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Point PDF.js at its worker. Vite copies the worker to /public automatically
// when you add it to the optimizeDeps config.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/**
 * usePdfDocument
 * Loads a PDF from an ArrayBuffer and exposes the pdfjs document object,
 * along with loading state and error.
 */
export function usePdfDocument(arrayBuffer) {
  const [pdf, setPdf] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const taskRef = useRef(null);

  useEffect(() => {
    if (!arrayBuffer) {
      setPdf(null);
      return;
    }

    setLoading(true);
    setError(null);

    // Cancel any in-flight load
    taskRef.current?.destroy?.();

    const task = pdfjsLib.getDocument({ data: arrayBuffer });
    taskRef.current = task;

    task.promise
      .then((doc) => {
        setPdf(doc);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortException") {
          setError(err.message ?? "Failed to load PDF");
          setLoading(false);
        }
      });

    return () => {
      task.destroy?.();
    };
  }, [arrayBuffer]);

  return { pdf, loading, error };
}

/**
 * usePdfPage
 * Renders a single PDF page to a canvas element.
 * Returns a ref to attach to the canvas and the page's text content.
 */
export function usePdfPage(pdf, pageNumber, scale = 1.5) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [textContent, setTextContent] = useState(null);
  const [viewport, setViewport] = useState(null);

  const render = useCallback(async () => {
    if (!pdf || !canvasRef.current) return;

    try {
      const page = await pdf.getPage(pageNumber);
      const vp = page.getViewport({ scale });
      setViewport(vp);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      // Device pixel ratio for sharp rendering on HiDPI screens
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${Math.floor(vp.width)}px`;
      canvas.style.height = `${Math.floor(vp.height)}px`;

      ctx.scale(dpr, dpr);

      // Cancel previous render task
      renderTaskRef.current?.cancel();

      const task = page.render({
        canvasContext: ctx,
        viewport: vp,
      });
      renderTaskRef.current = task;

      await task.promise;

      // Extract text content for the text layer (selection + search)
      const content = await page.getTextContent();
      setTextContent(content);
    } catch (err) {
      if (err?.name !== "RenderingCancelledException") {
        console.error("Page render error:", err);
      }
    }
  }, [pdf, pageNumber, scale]);

  useEffect(() => {
    render();
    return () => renderTaskRef.current?.cancel();
  }, [render]);

  return { canvasRef, textLayerRef, textContent, viewport };
}
