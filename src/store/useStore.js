import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export { savePdfData, loadPdfData, deletePdfData } from '../utils/storage.js';
const uid = () => crypto.randomUUID();
export const useStore = create(persist((set, get) => ({
  tabs: [], activeTabId: null, library: [], collections: [], recentFiles: [],
  openTab(file) {
    const existing = get().tabs.find(t => t.path === file.path);
    if (existing) { set({ activeTabId: existing.id }); return existing.id; }
    const entry = get().library.find(d => d.id === file.path);
    const id = uid();
    set(s => ({ tabs: [...s.tabs, { id, path: file.path, name: file.name, kind: file.kind || 'pdf', page: entry?.lastPage || 1, totalPages: 0, outline: [] }], activeTabId: id }));
    return id;
  },
  closeTab(id) {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex(t => t.id === id), rest = tabs.filter(t => t.id !== id);
    set({ tabs: rest, activeTabId: activeTabId === id ? rest[Math.max(0, idx - 1)]?.id || null : activeTabId });
  },
  setActiveTab: id => set({ activeTabId: id, searchQuery: '', searchResults: [], selectedMatch: null }),
  updateTab: (id, upd) => set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, ...upd } : t) })),
  getActiveTab: () => get().tabs.find(t => t.id === get().activeTabId) || null,
  navigationVersion: 0,
  setCurrentPage(n, fromScroll = false) {
    const tab = get().getActiveTab(); if (!tab || !Number.isFinite(n)) return;
    const page = Math.max(1, Math.min(n, tab.totalPages || 1));
    set(s => ({ navigationVersion: fromScroll ? s.navigationVersion : s.navigationVersion + 1, tabs: s.tabs.map(t => t.id === tab.id ? { ...t, page } : t),
      library: s.library.map(d => d.id === tab.path ? { ...d, lastPage: page } : d),
      recentFiles: s.recentFiles.map(d => d.path === tab.path ? { ...d, lastPage: page } : d) }));
  },
  upsertDocument: doc => set(s => {
    const old = s.library.find(d => d.id === doc.id);
    const entry = { collection: '', lastPage: 1, ...old, ...doc, openedAt: Date.now() };
    return { library: [entry, ...s.library.filter(d => d.id !== doc.id)] };
  }),
  updateDocument: (id, patch) => set(s => ({ library: s.library.map(d => d.id === id ? { ...d, ...patch } : d) })),
  removeDocument: id => set(s => {
    const tabs = s.tabs.filter(t => t.path !== id);
    return { library: s.library.filter(d => d.id !== id), tabs,
      activeTabId: tabs.some(t => t.id === s.activeTabId) ? s.activeTabId : tabs[0]?.id || null,
      annotations: s.annotations.filter(a => a.filePath !== id), bookmarks: s.bookmarks.filter(b => b.filePath !== id),
      recentFiles: s.recentFiles.filter(d => d.path !== id) };
  }),
  addCollection: name => set(s => ({ collections: [...new Set([...s.collections, name.trim()])].filter(Boolean) })),
  migrateDocument(oldPath, id, name, kind) {
    set(s => ({ tabs: s.tabs.map(t => t.path === oldPath ? { ...t, path: id, kind } : t),
      annotations: s.annotations.map(a => a.filePath === oldPath ? { ...a, filePath: id } : a),
      bookmarks: s.bookmarks.map(b => b.filePath === oldPath ? { ...b, filePath: id } : b),
      recentFiles: s.recentFiles.map(d => d.path === oldPath ? { ...d, path: id } : d) }));
    get().upsertDocument({ id, name, kind });
  },
  readingMode: 'dark', font: 'serif', fontSize: 18, lineHeight: 1.8, margin: 32, brightness: 100,
  hlColor: 'yellow', annotMode: false, invertColors: false, focusMode: false, zoom: 1,
  scrollMode: false, fitMode: 'width', rotation: 0, spread: false,
  setReadingMode: readingMode => set({ readingMode }), setFont: font => set({ font }),
  setFontSize: fontSize => set({ fontSize }), setLineHeight: lineHeight => set({ lineHeight }),
  setMargin: margin => set({ margin }), setBrightness: brightness => set({ brightness }),
  setHlColor: hlColor => set({ hlColor }), toggleAnnotMode: () => set(s => ({ annotMode: !s.annotMode })),
  toggleInvert: () => set(s => ({ invertColors: !s.invertColors })), toggleFocusMode: () => set(s => ({ focusMode: !s.focusMode })),
  setZoom: z => set({ zoom: Math.max(.25, Math.min(4, z)), fitMode: 'manual' }),
  setFitMode: fitMode => set({ fitMode }), rotate: () => set(s => ({ rotation: (s.rotation + 90) % 360 })),
  toggleScrollMode: () => set(s => ({ scrollMode: !s.scrollMode, spread: false })),
  toggleSpread: () => set(s => ({ spread: !s.spread, scrollMode: false })),
  bookmarks: [], addBookmark: bm => set(s => ({ bookmarks: s.bookmarks.some(b => b.page === bm.page && b.filePath === bm.filePath) ? s.bookmarks : [...s.bookmarks, { ...bm, id: uid() }] })),
  removeBookmark: id => set(s => ({ bookmarks: s.bookmarks.filter(b => b.id !== id) })),
  annotations: [], addAnnotation: ann => set(s => ({ annotations: [...s.annotations, { ...ann, id: uid() }] })),
  removeAnnotation: id => set(s => ({ annotations: s.annotations.filter(a => a.id !== id) })),
  updateAnnotationNote: (id, note) => set(s => ({ annotations: s.annotations.map(a => a.id === id ? { ...a, note } : a) })),
  addRecentFile: file => set(s => ({ recentFiles: [file, ...s.recentFiles.filter(f => f.path !== file.path)].slice(0, 20) })),
  updateRecentFilePage: (path, page) => set(s => ({ recentFiles: s.recentFiles.map(f => f.path === path ? { ...f, lastPage: page } : f) })),
  searchQuery: '', searchVisible: false, searchResults: [], selectedMatch: null,
  setSearchQuery: searchQuery => set({ searchQuery }), toggleSearch: () => set(s => ({ searchVisible: !s.searchVisible, searchQuery: '', searchResults: [], selectedMatch: null })),
  setSearchResults: searchResults => set({ searchResults }), setSelectedMatch: selectedMatch => set({ selectedMatch }),
  ocrVersion: 0, bumpOcrVersion: () => set(s => ({ ocrVersion: s.ocrVersion + 1 })),
  speechRate: 1, speechVoice: '', setSpeechRate: speechRate => set({ speechRate }), setSpeechVoice: speechVoice => set({ speechVoice }),
}), { name: 'nightreader-settings', version: 2,
  migrate: state => ({ ...state, library: state.library || [], collections: state.collections || [] }),
  partialize: s => Object.fromEntries(['tabs','activeTabId','library','collections','recentFiles','readingMode','font','fontSize','lineHeight','margin','brightness','bookmarks','annotations','zoom','scrollMode','fitMode','rotation','spread','speechRate','speechVoice'].map(k => [k, s[k]])),
}));
