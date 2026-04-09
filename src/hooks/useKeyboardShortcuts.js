import { useEffect } from "react";
import { useStore } from "../store/useStore.js";

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];

export function useKeyboardShortcuts({ onNextPage, onPrevPage }) {
  const toggleSearch    = useStore((s) => s.toggleSearch);
  const toggleFocusMode = useStore((s) => s.toggleFocusMode);
  const setZoom         = useStore((s) => s.setZoom);
  const zoom            = useStore((s) => s.zoom);
  const searchVisible   = useStore((s) => s.searchVisible);
  const toggleSearch2   = useStore((s) => s.toggleSearch);

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
          if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); onNextPage?.(); }
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); onPrevPage?.(); }
          break;
        case " ":
          e.preventDefault();
          onNextPage?.();
          break;
        case "f":
        case "F":
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); toggleSearch(); }
          break;
        case "r":
        case "R":
          if (!e.ctrlKey && !e.metaKey) toggleFocusMode();
          break;
        case "+":
        case "=": {
          // Zoom in to next step
          const next = ZOOM_STEPS.find((s) => s > zoom + 0.01);
          setZoom(next ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]);
          break;
        }
        case "-": {
          // Zoom out to previous step
          const prev = [...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.01);
          setZoom(prev ?? ZOOM_STEPS[0]);
          break;
        }
        case "0":
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(1.0); }
          break;
        case "Escape":
          if (searchVisible) toggleSearch2();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNextPage, onPrevPage, toggleSearch, toggleFocusMode, setZoom, zoom, searchVisible, toggleSearch2]);
}
