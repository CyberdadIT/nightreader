import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── IndexedDB helpers ─────────────────────────────────────────────────────
const DB_NAME    = "nightreader";
const DB_STORE   = "pdf_files";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(DB_STORE);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function savePdfData(path, data) {
  try {
    // Always store as Uint8Array — works reliably across all browsers
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const db  = await openDB();
    const tx  = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(bytes, path);
    return new Promise((res) => { tx.oncomplete = () => res(true); tx.onerror = () => res(false); });
  } catch { return false; }
}

export async function loadPdfData(path) {
  try {
    const db  = await openDB();
    const tx  = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(path);
    return new Promise((res) => {
      req.onsuccess = () => {
        const result = req.result;
        if (!result) return res(null);
        // Ensure we always return a Uint8Array regardless of how it was stored
        if (result instanceof Uint8Array) return res(result);
        if (result instanceof ArrayBuffer) return res(new Uint8Array(result));
        // Handle plain object edge case (can happen with some serialisers)
        if (typeof result === "object" && result !== null) {
          try {
            const values = Object.values(result);
            if (values.length > 0 && typeof values[0] === "number") {
              return res(new Uint8Array(values));
            }
          } catch {}
        }
        res(null);
      };
      req.onerror = () => res(null);
    });
  } catch { return null; }
}

export async function deletePdfData(path) {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(path);
  } catch {}
}

// ── Zustand store ─────────────────────────────────────────────────────────
export const useStore = create(
  persist(
    (set, get) => ({

      // ── Tabs ───────────────────────────────────────────────────────────
      tabs:        [],
      activeTabId: null,

      openTab: (file) => {
        const existing = get().tabs.find((t) => t.path === file.path);
        if (existing) { set({ activeTabId: existing.id }); return existing.id; }
        const id = `tab_${Date.now()}`;
        set((s) => ({
          tabs: [...s.tabs, { id, path: file.path, name: file.name, page: 1, totalPages: 0, outline: [] }],
          activeTabId: id,
        }));
        return id;
      },

      closeTab: (id) => {
        const { tabs, activeTabId } = get();
        const idx     = tabs.findIndex((t) => t.id === id);
        const newTabs = tabs.filter((t) => t.id !== id);
        let newActive = activeTabId;
        if (activeTabId === id) {
          newActive = newTabs.length > 0 ? newTabs[Math.max(0, idx - 1)].id : null;
        }
        const closedTab = tabs.find((t) => t.id === id);
        if (closedTab) deletePdfData(closedTab.path);
        set({ tabs: newTabs, activeTabId: newActive });
      },

      setActiveTab:  (id)      => set({ activeTabId: id }),
      updateTab:     (id, upd) => set((s) => ({
        tabs: s.tabs.map((t) => t.id === id ? { ...t, ...upd } : t),
      })),
      getActiveTab: () => {
        const { tabs, activeTabId } = get();
        return tabs.find((t) => t.id === activeTabId) ?? null;
      },

      setCurrentPage: (n) => {
        const { tabs, activeTabId } = get();
        const tab = tabs.find((t) => t.id === activeTabId);
        if (!tab) return;
        const clamped = Math.max(1, Math.min(n, tab.totalPages || 1));
        set((s) => ({
          tabs: s.tabs.map((t) => t.id === activeTabId ? { ...t, page: clamped } : t),
        }));
      },

      // ── Display settings ──────────────────────────────────────────────
      readingMode: "dark", font: "serif", fontSize: 15, lineHeight: 1.9,
      margin: 48, brightness: 100, hlColor: "yellow",
      annotMode: false, invertColors: false, focusMode: false,
      zoom: 1.0, scrollMode: false,

      setReadingMode:   (m) => set({ readingMode: m }),
      setFont:          (f) => set({ font: f }),
      setFontSize:      (n) => set({ fontSize: n }),
      setLineHeight:    (n) => set({ lineHeight: n }),
      setMargin:        (n) => set({ margin: n }),
      setBrightness:    (n) => set({ brightness: n }),
      setHlColor:       (c) => set({ hlColor: c }),
      toggleAnnotMode:  ()  => set((s) => ({ annotMode:    !s.annotMode    })),
      toggleInvert:     ()  => set((s) => ({ invertColors: !s.invertColors })),
      toggleFocusMode:  ()  => set((s) => ({ focusMode:    !s.focusMode    })),
      setZoom:          (z) => set({ zoom: Math.max(0.5, Math.min(4.0, z)) }),
      toggleScrollMode: ()  => set((s) => ({ scrollMode:   !s.scrollMode   })),

      // ── Bookmarks ─────────────────────────────────────────────────────
      bookmarks: [],
      addBookmark: (bm) => set((s) => ({
        bookmarks: s.bookmarks.find((b) => b.page === bm.page && b.filePath === bm.filePath)
          ? s.bookmarks : [...s.bookmarks, { ...bm, id: Date.now() }],
      })),
      removeBookmark: (id) =>
        set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),

      // ── Annotations ───────────────────────────────────────────────────
      annotations: [],
      addAnnotation: (ann) =>
        set((s) => ({ annotations: [...s.annotations, { ...ann, id: Date.now() }] })),
      removeAnnotation: (id) =>
        set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),
      updateAnnotationNote: (id, note) =>
        set((s) => ({
          annotations: s.annotations.map((a) => a.id === id ? { ...a, note } : a),
        })),

      // ── Recent files ──────────────────────────────────────────────────
      recentFiles: [],
      addRecentFile: (file) => set((s) => {
        const filtered = s.recentFiles.filter((f) => f.path !== file.path);
        return { recentFiles: [{ ...file }, ...filtered].slice(0, 20) };
      }),
      updateRecentFilePage: (path, page) => set((s) => ({
        recentFiles: s.recentFiles.map((f) => f.path === path ? { ...f, lastPage: page } : f),
      })),

      // ── Search ────────────────────────────────────────────────────────
      searchQuery: "", searchVisible: false,
      setSearchQuery: (q) => set({ searchQuery: q }),
      toggleSearch:   ()  => set((s) => ({ searchVisible: !s.searchVisible })),
    }),
    {
      name: "nightreader-settings",
      partialize: (s) => ({
        readingMode: s.readingMode, font: s.font, fontSize: s.fontSize,
        lineHeight: s.lineHeight, margin: s.margin, brightness: s.brightness,
        bookmarks: s.bookmarks, annotations: s.annotations,
        recentFiles: s.recentFiles, zoom: s.zoom, scrollMode: s.scrollMode,
        tabs: s.tabs.map(({ pdfDoc, ...rest }) => rest),
        activeTabId: s.activeTabId,
      }),
    }
  )
);
