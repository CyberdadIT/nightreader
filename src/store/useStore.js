import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useStore = create(
  persist(
    (set, get) => ({

      // ── Tabs — multiple open PDFs ─────────────────────────────────────────
      // Each tab: { id, path, name, page, totalPages, pdfDoc (runtime only) }
      tabs: [],
      activeTabId: null,

      openTab: (file) => {
        const existing = get().tabs.find((t) => t.path === file.path);
        if (existing) {
          // Switch to already-open tab
          set({ activeTabId: existing.id });
          return existing.id;
        }
        const id = `tab_${Date.now()}`;
        const newTab = {
          id,
          path:       file.path,
          name:       file.name,
          page:       1,
          totalPages: 0,
          pdfDoc:     null,
          outline:    [],
        };
        set((s) => ({ tabs: [...s.tabs, newTab], activeTabId: id }));
        return id;
      },

      closeTab: (id) => {
        const { tabs, activeTabId } = get();
        const idx      = tabs.findIndex((t) => t.id === id);
        const newTabs  = tabs.filter((t) => t.id !== id);
        let newActive  = activeTabId;

        if (activeTabId === id) {
          // Switch to nearest remaining tab
          if (newTabs.length > 0) {
            newActive = newTabs[Math.max(0, idx - 1)].id;
          } else {
            newActive = null;
          }
        }
        set({ tabs: newTabs, activeTabId: newActive });
      },

      setActiveTab: (id) => set({ activeTabId: id }),

      updateTab: (id, updates) =>
        set((s) => ({
          tabs: s.tabs.map((t) => t.id === id ? { ...t, ...updates } : t),
        })),

      // Helper — get active tab object
      getActiveTab: () => {
        const { tabs, activeTabId } = get();
        return tabs.find((t) => t.id === activeTabId) ?? null;
      },

      // ── Per-tab page navigation ───────────────────────────────────────────
      setCurrentPage: (n) => {
        const { tabs, activeTabId } = get();
        const tab = tabs.find((t) => t.id === activeTabId);
        if (!tab) return;
        const clamped = Math.max(1, Math.min(n, tab.totalPages || 1));
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === activeTabId ? { ...t, page: clamped } : t
          ),
        }));
      },

      // ── Display settings (global, not per-tab) ────────────────────────────
      readingMode:  "dark",
      font:         "serif",
      fontSize:     15,
      lineHeight:   1.9,
      margin:       48,
      brightness:   100,
      hlColor:      "yellow",
      annotMode:    false,
      invertColors: false,
      focusMode:    false,
      zoom:         1.0,
      scrollMode:   false,

      setReadingMode:  (m) => set({ readingMode: m }),
      setFont:         (f) => set({ font: f }),
      setFontSize:     (n) => set({ fontSize: n }),
      setLineHeight:   (n) => set({ lineHeight: n }),
      setMargin:       (n) => set({ margin: n }),
      setBrightness:   (n) => set({ brightness: n }),
      setHlColor:      (c) => set({ hlColor: c }),
      toggleAnnotMode: ()  => set((s) => ({ annotMode: !s.annotMode })),
      toggleInvert:    ()  => set((s) => ({ invertColors: !s.invertColors })),
      toggleFocusMode: ()  => set((s) => ({ focusMode: !s.focusMode })),
      setZoom:         (z) => set({ zoom: Math.max(0.5, Math.min(3.0, z)) }),
      toggleScrollMode:()  => set((s) => ({ scrollMode: !s.scrollMode })),

      // ── Bookmarks ─────────────────────────────────────────────────────────
      bookmarks: [],
      addBookmark: (bm) =>
        set((s) => ({
          bookmarks: s.bookmarks.find(
            (b) => b.page === bm.page && b.filePath === bm.filePath
          )
            ? s.bookmarks
            : [...s.bookmarks, { ...bm, id: Date.now() }],
        })),
      removeBookmark: (id) =>
        set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),

      // ── Annotations ───────────────────────────────────────────────────────
      annotations: [],
      addAnnotation:        (ann) =>
        set((s) => ({ annotations: [...s.annotations, { ...ann, id: Date.now() }] })),
      removeAnnotation:     (id) =>
        set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),
      updateAnnotationNote: (id, note) =>
        set((s) => ({
          annotations: s.annotations.map((a) =>
            a.id === id ? { ...a, note } : a
          ),
        })),

      // ── Recent files ──────────────────────────────────────────────────────
      recentFiles: [],
      addRecentFile: (file) =>
        set((s) => {
          const filtered = s.recentFiles.filter((f) => f.path !== file.path);
          return { recentFiles: [file, ...filtered].slice(0, 20) };
        }),
      updateRecentFilePage: (path, page) =>
        set((s) => ({
          recentFiles: s.recentFiles.map((f) =>
            f.path === path ? { ...f, lastPage: page } : f
          ),
        })),

      // ── Search ────────────────────────────────────────────────────────────
      searchQuery:   "",
      searchVisible: false,
      setSearchQuery: (q) => set({ searchQuery: q }),
      toggleSearch:   ()  => set((s) => ({ searchVisible: !s.searchVisible })),

      // Legacy compatibility helpers (used by some components)
      get filePath()  { return get().getActiveTab()?.path  ?? null; },
      get fileName()  { return get().getActiveTab()?.name  ?? null; },
      get totalPages(){ return get().getActiveTab()?.totalPages ?? 0; },
      get currentPage(){ return get().getActiveTab()?.page ?? 1; },
    }),
    {
      name: "nightreader-settings",
      partialize: (s) => ({
        readingMode:  s.readingMode,
        font:         s.font,
        fontSize:     s.fontSize,
        lineHeight:   s.lineHeight,
        margin:       s.margin,
        brightness:   s.brightness,
        bookmarks:    s.bookmarks,
        annotations:  s.annotations,
        recentFiles:  s.recentFiles,
        zoom:         s.zoom,
        scrollMode:   s.scrollMode,
        // Persist tab list (without pdfDoc which can't be serialised)
        tabs: s.tabs.map(({ pdfDoc, ...rest }) => rest),
        activeTabId: s.activeTabId,
      }),
    }
  )
);
