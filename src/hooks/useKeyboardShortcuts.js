import { useEffect } from "react";
import { useStore } from "../store/useStore.js";

/**
 * Global keyboard shortcuts for NightReader.
 * Only active when no text input is focused.
 */
export function useKeyboardShortcuts({ onNextPage, onPrevPage }) {
  const toggleSearch = useStore((s) => s.toggleSearch);
  const toggleFocusMode = useStore((s) => s.toggleFocusMode);
  const setZoom = useStore((s) => s.setZoom);
  const zoom = useStore((s) => s.zoom);

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
          e.preventDefault();
          onNextPage?.();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          onPrevPage?.();
          break;
        case "f":
        case "F":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleSearch();
          }
          break;
        case "r":
        case "R":
          toggleFocusMode();
          break;
        case "+":
        case "=":
          setZoom(zoom + 0.1);
          break;
        case "-":
          setZoom(zoom - 0.1);
          break;
        case "0":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoom(1.0);
          }
          break;
        case "Escape":
          // Handled by individual components
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNextPage, onPrevPage, toggleSearch, toggleFocusMode, setZoom, zoom]);
}
