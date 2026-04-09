import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * NightReader global store
 * Persisted to localStorage (web/Capacitor) or via Tauri plugin-store on desktop.
 */
export const useStore = create(
  persist(
    (set, get) => ({
      // ── Document ─────────────────────────────────────────────────────────
      filePath: null,
      fileName: null,
      totalPages: 0,
      currentPage: 1,
      zoom: 1.0,           // 1.0 = 100 %
      scrollMode: false,   // false = single page, true = continuous
      setFile: (path, name) => set({ filePath: path, fileName: name, currentPage: 1 }),
      setTotalPages: (n) => set({ totalPages: n }),
      setCurrentPage: (n) => set({ currentPage: Math.max(1, Math.min(n, get().totalPages || 1)) }),
      setZoom: (z) => set({ zoom: Math.max(0.5, Math.min(3.0, z)) }),
      toggleScrollMode: () => set((s) => ({ scrollMode: !s.scrollMode })),

      // ── Display settings ─────────────────────────────────────────────────
      readingMode: "dark",       // dark | light | sepia | amoled | green
      font: "serif",             // serif | sans | mono
      fontSize: 15,              // px, applies to text layer
      lineHeight: 1.9,
      margin: 48,                // px
      brightness: 100,           // 0-100
      hlColor: "yellow",         // yellow | blue | pink | green
      annotMode: false,
      invertColors: false,
      focusMode: false,

      setReadingMode: (m) => set({ readingMode: m }),
      setFont: (f) => set({ font: f }),
      setFontSize: (n) => set({ fontSize: n }),
      setLineHeight: (n) => set({ lineHeight: n }),
      setMargin: (n) => set({ margin: n }),
      setBrightness: (n) => set({ brightness: n }),
      setHlColor: (c) => set({ hlColor: c }),
      toggleAnnotMode: () => set((s) => ({ annotMode: !s.annotMode })),
      toggleInvert: () => set((s) => ({ invertColors: !s.invertColors })),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

      // ── Bookmarks ─────────────────────────────────────────────────────────
      bookmarks: [],
      addBookmark: (bm) =>
        set((s) => ({
          bookmarks: s.bookmarks.find((b) => b.page === bm.page && b.filePath === bm.filePath)
            ? s.bookmarks
            : [...s.bookmarks, { ...bm, id: Date.now() }],
        })),
      removeBookmark: (id) =>
        set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),

      // ── Annotations ───────────────────────────────────────────────────────
      annotations: [],
      addAnnotation: (ann) =>
        set((s) => ({ annotations: [...s.annotations, { ...ann, id: Date.now() }] })),
      removeAnnotation: (id) =>
        set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),
      updateAnnotationNote: (id, note) =>
        set((s) => ({
          annotations: s.annotations.map((a) => (a.id === id ? { ...a, note } : a)),
        })),

      // ── Recent files ──────────────────────────────────────────────────────
      recentFiles: [],
      addRecentFile: (file) =>
        set((s) => {
          const filtered = s.recentFiles.filter((f) => f.path !== file.path);
          return { recentFiles: [file, ...filtered].slice(0, 20) };
        }),

      // ── Search ────────────────────────────────────────────────────────────
      searchQuery: "",
      searchVisible: false,
      setSearchQuery: (q) => set({ searchQuery: q }),
      toggleSearch: () => set((s) => ({ searchVisible: !s.searchVisible })),
    }),
    {
      name: "nightreader-settings",
      // Only persist settings, not transient UI state
      partialize: (s) => ({
        readingMode: s.readingMode,
        font: s.font,
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        margin: s.margin,
        brightness: s.brightness,
        bookmarks: s.bookmarks,
        annotations: s.annotations,
        recentFiles: s.recentFiles,
        zoom: s.zoom,
        scrollMode: s.scrollMode,
      }),
    }
  )
);
