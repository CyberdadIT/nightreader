import { useEffect } from "react";
import { useStore } from "../store/useStore.js";

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];

export function useKeyboardShortcuts({ onNextPage, onPrevPage }) {
  const toggleSearch    = useStore((s) => s.toggleSearch);
  const toggleFocusMode = useStore((s) => s.toggleFocusMode);
  const setZoom         = useStore((s) => s.setZoom);
  const zoom            = useStore((s) => s.zoom);
  const searchVisible   = useStore((s) => s.searchVisible);
  const scrollMode      = useStore((s) => s.scrollMode);

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Find the scrollable viewer container
      const viewerEl = document.querySelector("[data-viewer-scroll]");

      switch (e.key) {

        // ── Arrow Up / Down: scroll within page, only change page at edges ──
        case "ArrowDown": {
          if (e.ctrlKey || e.metaKey) break;
          if (viewerEl) {
            const atBottom = viewerEl.scrollTop + viewerEl.clientHeight >= viewerEl.scrollHeight - 8;
            if (!atBottom) {
              // Still content below — scroll down within the page
              e.preventDefault();
              viewerEl.scrollBy({ top: 120, behavior: "smooth" });
            } else {
              // At the bottom — go to next page
              e.preventDefault();
              onNextPage?.();
              viewerEl.scrollTo({ top: 0, behavior: "instant" });
            }
          }
          break;
        }

        case "ArrowUp": {
          if (e.ctrlKey || e.metaKey) break;
          if (viewerEl) {
            const atTop = viewerEl.scrollTop <= 8;
            if (!atTop) {
              // Still content above — scroll up within the page
              e.preventDefault();
              viewerEl.scrollBy({ top: -120, behavior: "smooth" });
            } else {
              // At the top — go to previous page
              e.preventDefault();
              onPrevPage?.();
              // Scroll to bottom of previous page
              setTimeout(() => {
                if (viewerEl) viewerEl.scrollTo({ top: viewerEl.scrollHeight, behavior: "instant" });
              }, 50);
            }
          }
          break;
        }

        // ── Page Down / Right arrow: always go to next page ──────────────
        case "ArrowRight":
        case "PageDown":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            onNextPage?.();
            if (viewerEl) viewerEl.scrollTo({ top: 0, behavior: "instant" });
          }
          break;

        // ── Page Up / Left arrow: always go to previous page ─────────────
        case "ArrowLeft":
        case "PageUp":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            onPrevPage?.();
            if (viewerEl) viewerEl.scrollTo({ top: 0, behavior: "instant" });
          }
          break;

        // ── Space: scroll down a screenful, next page at bottom ───────────
        case " ": {
          e.preventDefault();
          if (viewerEl) {
            const atBottom = viewerEl.scrollTop + viewerEl.clientHeight >= viewerEl.scrollHeight - 8;
            if (!atBottom) {
              viewerEl.scrollBy({ top: viewerEl.clientHeight - 60, behavior: "smooth" });
            } else {
              onNextPage?.();
              viewerEl.scrollTo({ top: 0, behavior: "instant" });
            }
          }
          break;
        }

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
          const next = ZOOM_STEPS.find((s) => s > zoom + 0.01);
          setZoom(next ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]);
          break;
        }

        case "-": {
          const prev = [...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.01);
          setZoom(prev ?? ZOOM_STEPS[0]);
          break;
        }

        case "0":
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(1.0); }
          break;

        case "Escape":
          if (searchVisible) toggleSearch();
          break;

        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNextPage, onPrevPage, toggleSearch, toggleFocusMode, setZoom, zoom, searchVisible, scrollMode]);
}
