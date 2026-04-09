import React, { useState, useCallback, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";

import TopBar        from "./components/TopBar.jsx";
import TabBar        from "./components/TabBar.jsx";
import Toolbar       from "./components/Toolbar.jsx";
import SearchBar     from "./components/SearchBar.jsx";
import Sidebar       from "./components/Sidebar.jsx";
import Viewer        from "./components/Viewer.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import StatusBar     from "./components/StatusBar.jsx";
import WelcomeScreen from "./components/WelcomeScreen.jsx";

import { useStore } from "./store/useStore.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";
import styles from "./App.module.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default function App() {
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadError,    setLoadError]    = useState(null);
  const [loading,      setLoading]      = useState(false);

  // All loaded PDF documents keyed by tab id
  const pdfDocsRef = useRef({});

  const tabs           = useStore((s) => s.tabs);
  const activeTabId    = useStore((s) => s.activeTabId);
  const activeTab      = useStore((s) => s.getActiveTab());
  const openTab        = useStore((s) => s.openTab);
  const updateTab      = useStore((s) => s.updateTab);
  const closeTab       = useStore((s) => s.closeTab);
  const addRecentFile  = useStore((s) => s.addRecentFile);
  const updateRecentFilePage = useStore((s) => s.updateRecentFilePage);
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const focusMode      = useStore((s) => s.focusMode);

  // Active PDF document object
  const activePdf = activeTabId ? pdfDocsRef.current[activeTabId] : null;
  const activeOutline = activeTab?.outline ?? [];

  // ── Load a PDF file into a new or existing tab ───────────────────────
  const loadPdf = useCallback(async (file) => {
    if (!file?.data) return;
    setLoading(true);
    setLoadError(null);
    try {
      const doc = await pdfjsLib.getDocument({ data: file.data }).promise;
      const id  = openTab(file);

      // Store the live pdfjs document object (not serialisable, kept in ref)
      pdfDocsRef.current[id] = doc;

      // Update tab metadata
      updateTab(id, { totalPages: doc.numPages, page: 1, pdfDoc: null });

      // Add to recent files
      addRecentFile({
        path:     file.path,
        name:     file.name,
        date:     new Date().toLocaleDateString(),
        lastPage: 1,
        data:     file.data, // keep data for reopening from recent list
      });

      // Load TOC outline
      try {
        const ol = await doc.getOutline();
        updateTab(id, { outline: ol ?? [] });
      } catch {
        updateTab(id, { outline: [] });
      }
    } catch (err) {
      setLoadError(err.message ?? "Could not open this PDF.");
    } finally {
      setLoading(false);
    }
  }, [openTab, updateTab, addRecentFile]);

  // ── When active tab changes, restore reading position ─────────────────
  // (position is already saved in the tab object, nothing extra needed)

  // ── Save reading position when page changes ────────────────────────────
  useEffect(() => {
    if (!activeTab) return;
    updateRecentFilePage(activeTab.path, activeTab.page);
  }, [activeTab?.page, activeTab?.path]);

  // ── Clean up closed tab PDF docs from memory ──────────────────────────
  useEffect(() => {
    const activeIds = new Set(tabs.map((t) => t.id));
    Object.keys(pdfDocsRef.current).forEach((id) => {
      if (!activeIds.has(id)) {
        pdfDocsRef.current[id]?.destroy?.();
        delete pdfDocsRef.current[id];
      }
    });
  }, [tabs]);

  // ── Drag and drop ─────────────────────────────────────────────────────
  useEffect(() => {
    async function onDrop(e) {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      for (const file of files) {
        const data = await file.arrayBuffer();
        loadPdf({ path: file.name, name: file.name, data });
      }
    }
    function onDragOver(e) { e.preventDefault(); }
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDragOver);
    return () => {
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onDragOver);
    };
  }, [loadPdf]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useKeyboardShortcuts({
    onNextPage: () => activeTab && setCurrentPage((activeTab.page ?? 1) + 1),
    onPrevPage: () => activeTab && setCurrentPage((activeTab.page ?? 1) - 1),
  });

  const appClass = [styles.app, focusMode ? styles.focusMode : ""]
    .filter(Boolean).join(" ");

  const hasPdf = activePdf != null;

  return (
    <div className={appClass}>
      <TopBar
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onToggleSettings={() => setSettingsOpen((o) => !o)}
        settingsOpen={settingsOpen}
        onFileLoaded={loadPdf}
      />

      {/* Tab bar — shown when at least one PDF is open */}
      <TabBar onFileLoaded={loadPdf} />

      <Toolbar onFileLoaded={loadPdf} />
      <SearchBar />

      <div className={styles.body}>
        {hasPdf && sidebarOpen && !focusMode && (
          <Sidebar pdf={activePdf} outline={activeOutline} />
        )}

        <div className={styles.main}>
          {loading && (
            <div className={styles.loadingOverlay} role="status" aria-live="polite">
              <div className={styles.spinner} aria-hidden="true" />
              <p>Opening document…</p>
            </div>
          )}

          {loadError && (
            <div className={styles.errorBox} role="alert">
              <p>⚠ {loadError}</p>
              <button onClick={() => setLoadError(null)}>Dismiss</button>
            </div>
          )}

          {!hasPdf && !loading && !loadError && (
            <WelcomeScreen onFileLoaded={loadPdf} />
          )}

          {hasPdf && <Viewer pdf={activePdf} />}
        </div>

        {settingsOpen && !focusMode && (
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        )}
      </div>

      <StatusBar />
    </div>
  );
}
