import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { lockEnabled, isUnlocked, sealText, unsealText } from '../utils/vault.js';
import { addToLog } from '../utils/stats.js';
export { savePdfData, loadPdfData, deletePdfData } from '../utils/storage.js';
const uid = () => crypto.randomUUID();

// Saved state (library, notes, settings) lives in localStorage. With the app lock on it
// is sealed with the data key before it's written, and nothing is written while locked.
// Writes are coalesced: a burst of changes produces one encryption and one write.
let pendingText = null, writing = null;
function flushSealed(name) {
  if (writing) return writing;
  writing = (async () => {
    try {
      while (pendingText !== null) {
        const text = pendingText; pendingText = null;
        try {
          const sealed = await sealText(text);
          if (lockEnabled() && isUnlocked()) localStorage.setItem(name, sealed);
        } catch (e) {
          if (pendingText === null) pendingText = text; // keep it for the next attempt
          console.error('Could not save NightReader data', e);
          break;
        }
      }
    } finally { writing = null; }
  })();
  return writing;
}
/** Resolves once any pending encrypted save has been written. */
export const whenSaved = async () => { while (writing) await writing; };
export const savedState = {
  getItem: async name => { const raw = localStorage.getItem(name); return raw == null ? null : JSON.parse(await unsealText(raw)); },
  setItem: (name, value) => {
    // Never overwrite saved data with defaults before it has been loaded.
    if (!useStore.persist?.hasHydrated()) return;
    const text = JSON.stringify(value);
    if (!lockEnabled()) { localStorage.setItem(name, text); return; }
    if (!isUnlocked()) return;
    pendingText = text; flushSealed(name);
  },
  removeItem: name => localStorage.removeItem(name),
};
// Make a tab active. In side-by-side view the newly active tab takes the place of
// whichever pane was active, so the other pane stays put.
function activation(s, id) {
  if (!s.split || s.split.left === id || s.split.right === id) return { activeTabId: id };
  const side = s.split.right === s.activeTabId ? 'right' : 'left';
  return { activeTabId: id, split: { ...s.split, [side]: id } };
}
export const useStore = create(persist((set, get) => ({
  tabs: [], activeTabId: null, library: [], collections: [], recentFiles: [],
  openTab(file) {
    const existing = get().tabs.find(t => t.path === file.path);
    if (existing) { set(s => activation(s, existing.id)); return existing.id; }
    const entry = get().library.find(d => d.id === file.path);
    const id = uid();
    set(s => ({ tabs: [...s.tabs, { id, path: file.path, name: file.name, kind: file.kind || 'pdf', page: entry?.lastPage || 1, totalPages: 0, outline: [] }], ...activation(s, id) }));
    return id;
  },
  closeTab(id) {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex(t => t.id === id), rest = tabs.filter(t => t.id !== id);
    const split = get().split;
    const other = split && (split.left === id ? split.right : split.right === id ? split.left : null);
    set({ tabs: rest, split: other ? null : split,
      activeTabId: other || (activeTabId === id ? rest[Math.max(0, idx - 1)]?.id || null : activeTabId) });
  },
  setActiveTab: id => set(s => (s.activeTabId === id ? {} : { ...activation(s, id), searchQuery: '', searchResults: [], selectedMatch: null })),
  // Side-by-side reading: two panes, each showing a tab. null when off.
  split: null,
  toggleSplit() {
    const s = get(), active = s.getActiveTab();
    if (s.split || !active) { set({ split: null }); return; }
    // The other pane starts with the most recent other tab, or the same document again.
    let other = [...s.tabs].reverse().find(t => t.id !== active.id);
    if (!other) {
      other = { ...active, id: uid() };
      set(st => ({ tabs: [...st.tabs, other] }));
    }
    set({ split: { left: active.id, right: other.id } });
  },
  /** Show a library document in one pane (the same document may be open in both). */
  showInPane(side, doc) {
    const s = get(); if (!s.split) return;
    const otherSide = side === 'left' ? 'right' : 'left';
    let tab = s.tabs.find(t => t.path === doc.id && t.id !== s.split[otherSide]);
    if (!tab) {
      tab = { id: uid(), path: doc.id, name: doc.name, kind: doc.kind || 'pdf', page: doc.lastPage || 1, totalPages: 0, outline: [] };
      set(st => ({ tabs: [...st.tabs, tab] }));
    }
    set(st => ({ split: { ...st.split, [side]: tab.id }, activeTabId: tab.id }));
  },
  updateTab: (id, upd) => set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, ...upd } : t) })),
  getActiveTab: () => get().tabs.find(t => t.id === get().activeTabId) || null,
  navigationVersion: 0,
  setCurrentPage(n, fromScroll = false, tabId = null) {
    const tab = tabId ? get().tabs.find(t => t.id === tabId) : get().getActiveTab(); if (!tab || !Number.isFinite(n)) return;
    const page = Math.max(1, Math.min(n, tab.totalPages || 1));
    set(s => ({ navigationVersion: fromScroll ? s.navigationVersion : s.navigationVersion + 1, tabs: s.tabs.map(t => t.id === tab.id ? { ...t, page } : t),
      library: s.library.map(d => d.id === tab.path ? { ...d, lastPage: page, pageUpdatedAt: Date.now() } : d),
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
    const split = s.split && tabs.some(t => t.id === s.split.left) && tabs.some(t => t.id === s.split.right) ? s.split : null;
    return { split, library: s.library.filter(d => d.id !== id), tabs,
      activeTabId: tabs.some(t => t.id === s.activeTabId) ? s.activeTabId : tabs[0]?.id || null,
      annotations: s.annotations.filter(a => a.filePath !== id), bookmarks: s.bookmarks.filter(b => b.filePath !== id),
      recentFiles: s.recentFiles.filter(d => d.path !== id) };
  }),
  // Open a document at a given page, whether or not its tab is already open.
  openAt(docId, page) {
    const doc = get().library.find(d => d.id === docId); if (!doc) return;
    const tab = get().tabs.find(t => t.path === docId);
    if (tab) { set(s => ({ ...activation(s, tab.id), navigationVersion: s.navigationVersion + 1, tabs: s.tabs.map(t => t.id === tab.id ? { ...t, page } : t) })); return; }
    set(s => ({ library: s.library.map(d => d.id === docId ? { ...d, lastPage: page } : d) }));
    get().openTab({ path: docId, name: doc.name, kind: doc.kind });
  },
  addCollection: name => set(s => ({ collections: [...new Set([...s.collections, name.trim()])].filter(Boolean) })),
  migrateDocument(oldPath, id, name, kind) {
    set(s => ({ tabs: s.tabs.map(t => t.path === oldPath ? { ...t, path: id, kind } : t),
      annotations: s.annotations.map(a => a.filePath === oldPath ? { ...a, filePath: id } : a),
      bookmarks: s.bookmarks.map(b => b.filePath === oldPath ? { ...b, filePath: id } : b),
      recentFiles: s.recentFiles.map(d => d.path === oldPath ? { ...d, path: id } : d) }));
    get().upsertDocument({ id, name, kind });
  },
  readingMode: 'dark', font: 'serif', fontSize: 18, lineHeight: 1.8, margin: 32, brightness: 100,
  warmth: 0, warmSchedule: { enabled: false, start: '21:00', end: '07:00' },
  setWarmth: warmth => set({ warmth }), setWarmSchedule: patch => set(s => ({ warmSchedule: { ...s.warmSchedule, ...patch } })),
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
  // Removed bookmarks stay as { deleted: true } records so folder sync can remove them elsewhere too.
  bookmarks: [], addBookmark: bm => set(s => {
    const existing = s.bookmarks.find(b => b.page === bm.page && b.filePath === bm.filePath);
    if (existing && !existing.deleted) return {};
    const rest = s.bookmarks.filter(b => b !== existing);
    return { bookmarks: [...rest, { ...bm, id: existing?.id || uid(), updatedAt: Date.now(), deleted: false }] };
  }),
  removeBookmark: id => set(s => ({ bookmarks: s.bookmarks.map(b => b.id === id ? { ...b, deleted: true, updatedAt: Date.now() } : b) })),
  annotations: [], deletedAnnotations: [],
  addAnnotation: ann => set(s => ({ annotations: [...s.annotations, { tags: [], ...ann, id: uid(), createdAt: Date.now(), updatedAt: Date.now() }] })),
  // Deletions are remembered briefly so folder sync can remove them on other devices too.
  removeAnnotation: id => set(s => ({ annotations: s.annotations.filter(a => a.id !== id), deletedAnnotations: [...s.deletedAnnotations, { id, at: Date.now() }].slice(-1000) })),
  // Undo a deletion: the same note (same id) comes back and its deletion record is dropped.
  // Brings a note back (Undo) or re-dates one that still exists ("Keep mine" on sync), so it wins over older deletions.
  restoreAnnotation: ann => set(s => ({ annotations: s.annotations.some(a => a.id === ann.id)
      ? s.annotations.map(a => a.id === ann.id ? { ...a, updatedAt: Date.now() } : a)
      : [...s.annotations, { ...ann, updatedAt: Date.now() }],
    deletedAnnotations: s.deletedAnnotations.filter(d => d.id !== ann.id) })),
  updateAnnotation: (id, patch) => set(s => ({ annotations: s.annotations.map(a => a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a) })),
  updateAnnotationNote: (id, note) => get().updateAnnotation(id, { note }),
  addRecentFile: file => set(s => ({ recentFiles: [file, ...s.recentFiles.filter(f => f.path !== file.path)].slice(0, 20) })),
  updateRecentFilePage: (path, page) => set(s => ({ recentFiles: s.recentFiles.map(f => f.path === path ? { ...f, lastPage: page } : f) })),
  searchQuery: '', searchVisible: false, searchResults: [], selectedMatch: null,
  setSearchQuery: searchQuery => set({ searchQuery }), toggleSearch: () => set(s => ({ searchVisible: !s.searchVisible, searchQuery: '', searchResults: [], selectedMatch: null })),
  setSearchResults: searchResults => set({ searchResults }), setSelectedMatch: selectedMatch => set({ selectedMatch }),
  ocrVersion: 0, bumpOcrVersion: () => set(s => ({ ocrVersion: s.ocrVersion + 1 })),
  speechRate: 1, speechVoice: '', setSpeechRate: speechRate => set({ speechRate }), setSpeechVoice: speechVoice => set({ speechVoice }),
  speechContinuous: true, setSpeechContinuous: speechContinuous => set({ speechContinuous }),
  // Read-along: the sentence and word being spoken, as offsets into a page's on-screen text (not saved).
  // Handwriting: the ink tool (for mouse and pen), colour and width; a pen draws even without the tool.
  inkTool: null, setInkTool: inkTool => set(s => ({ inkTool: s.inkTool === inkTool ? null : inkTool })),
  inkColor: '#1b1b1b', inkWidth: 1.6, setInk: patch => set(patch),
  penInk: true, setPenInk: penInk => set({ penInk }),
  penNear: false, setPenNear: penNear => set(s => (s.penNear === penNear ? {} : { penNear })),
  // Undo for strokes added or erased in this session (newest last).
  inkHistory: [],
  addInkStroke(ann) {
    const id = uid(), now = Date.now();
    set(s => ({ annotations: [...s.annotations, { tags: [], note: '', ...ann, type: 'ink', id, createdAt: now, updatedAt: now }], inkHistory: [...s.inkHistory, { kind: 'add', id }].slice(-200) }));
    return id;
  },
  eraseInkStroke(id) {
    const ann = get().annotations.find(a => a.id === id && a.type === 'ink'); if (!ann) return;
    get().removeAnnotation(id);
    set(s => ({ inkHistory: [...s.inkHistory, { kind: 'erase', ann }].slice(-200) }));
  },
  undoInk() {
    const last = get().inkHistory.at(-1); if (!last) return false;
    set(s => ({ inkHistory: s.inkHistory.slice(0, -1) }));
    if (last.kind === 'add') get().removeAnnotation(last.id); else get().restoreAnnotation(last.ann);
    return true;
  },
  // Reading statistics (see utils/stats.js): per day, and per document.
  readingLog: {}, docStats: {},
  recordReading(docId, { day, ms = 0, pages = 0, page = 0, total = 0 }) {
    set(s => {
      const old = s.docStats[docId] || { ms: 0, pages: 0 };
      const finished = old.finishedAt || (total > 1 && page >= total ? Date.now() : undefined);
      return {
        readingLog: addToLog(s.readingLog, { day, ms, pages }),
        docStats: { ...s.docStats, [docId]: { ...old, ms: old.ms + ms, pages: old.pages + pages, lastReadAt: Date.now(), ...(finished ? { finishedAt: finished } : {}) } },
      };
    });
  },
  // Flashcard schedules, by note id (see utils/flashcards.js).
  cards: {}, setCardSchedule: (id, schedule) => set(s => ({ cards: { ...s.cards, [id]: schedule } })),
  speechHighlight: true, setSpeechHighlight: speechHighlight => set({ speechHighlight }),
  speechMark: null, setSpeechMark: speechMark => set({ speechMark }),
  // EPUB publisher styles (sanitised); off by default. Fixed-layout books always use them.
  publisherStyles: false, setPublisherStyles: publisherStyles => set({ publisherStyles }),
  ocrLanguage: 'eng', setOcrLanguage: ocrLanguage => set({ ocrLanguage }),
  // Reading pace per document: seconds per PDF page, words per minute for EPUB.
  readingPace: {}, recordPace: (docId, patch) => set(s => ({ readingPace: { ...s.readingPace, [docId]: { ...s.readingPace[docId], ...patch } } })),
  syncFolder: '', lastSyncAt: 0, setSyncFolder: syncFolder => set({ syncFolder, lastSyncAt: 0 }), setLastSyncAt: lastSyncAt => set({ lastSyncAt }),
  autoUpdateCheck: true, lastUpdateCheck: 0, dismissedUpdate: '',
  setAutoUpdateCheck: autoUpdateCheck => set({ autoUpdateCheck }), setUpdateCheck: patch => set(patch),
}), { name: 'nightreader-settings', version: 2, storage: savedState, skipHydration: true,
  migrate: state => ({ ...state, library: state.library || [], collections: state.collections || [] }),
  partialize: s => Object.fromEntries(['tabs','activeTabId','split','library','collections','recentFiles','readingMode','font','fontSize','lineHeight','margin','brightness','bookmarks','annotations','zoom','scrollMode','fitMode','rotation','spread','speechRate','speechVoice','warmth','warmSchedule','deletedAnnotations','speechContinuous','readingPace','syncFolder','lastSyncAt','autoUpdateCheck','lastUpdateCheck','dismissedUpdate','publisherStyles','ocrLanguage','speechHighlight','inkColor','inkWidth','penInk','cards','readingLog','docStats'].map(k => [k, s[k]])),
}));
