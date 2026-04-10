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

import { useStore, savePdfData, loadPdfData } from "./store/useStore.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";
import styles from "./App.module.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default function App() {
  const [sidebarOpen,    setSidebarOpen]    = useState(true);
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [loadError,      setLoadError]      = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);

  const pdfDocsRef     = useRef({});
  const hasRestoredRef = useRef(false);

  const tabs                 = useStore((s) => s.tabs);
  const activeTabId          = useStore((s) => s.activeTabId);
  const activeTab            = useStore((s) => s.getActiveTab());
  const openTab              = useStore((s) => s.openTab);
  const updateTab            = useStore((s) => s.updateTab);
  const setActiveTab         = useStore((s) => s.setActiveTab);
  const addRecentFile        = useStore((s) => s.addRecentFile);
  const updateRecentFilePage = useStore((s) => s.updateRecentFilePage);
  const setCurrentPage       = useStore((s) => s.setCurrentPage);
  const focusMode            = useStore((s) => s.focusMode);

  const activePdf     = activeTabId ? pdfDocsRef.current[activeTabId] : null;
  const activeOutline = activeTab?.outline ?? [];

  // ── Safe copy — prevents ArrayBuffer detachment issues ───────────────
  function safeCopy(data) {
    if (data instanceof Uint8Array) {
      // Copy the underlying buffer so original stays valid
      const copy = new Uint8Array(data.length);
      copy.set(data);
      return copy;
    }
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data.slice(0));
    }
    if (data && typeof data === "object" && !ArrayBuffer.isView(data)) {
      const vals = Object.values(data);
      if (vals.length > 0 && typeof vals[0] === "number") {
        return new Uint8Array(vals);
      }
    }
    return null;
  }

  // ── Load PDF bytes into a tab ─────────────────────────────────────────
  const loadPdfIntoTab = useCallback(async (tabId, rawData) => {
    // Always work with a fresh copy to avoid detachment
    const bytes = safeCopy(rawData);
    if (!bytes) throw new Error("Invalid PDF data format");

    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    pdfDocsRef.current[tabId] = doc;
    updateTab(tabId, { totalPages: doc.numPages });

    try {
      const ol = await doc.getOutline();
      updateTab(tabId, { outline: ol ?? [] });
    } catch {
      updateTab(tabId, { outline: [] });
    }

    return doc;
  }, [updateTab]);

  // ── Open PDF (user initiated) ─────────────────────────────────────────
  const loadPdf = useCallback(async (file) => {
    if (!file?.data) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Switch to existing tab if already open
      const existing = useStore.getState().tabs.find((t) => t.path === file.path);
      if (existing && pdfDocsRef.current[existing.id]) {
        setActiveTab(existing.id);
        setLoading(false);
        return;
      }

      // Make a copy BEFORE anything else touches the ArrayBuffer
      const dataCopy = safeCopy(file.data);
      if (!dataCopy) throw new Error("Could not read PDF data");

      const id = openTab(file);

      // Load into PDF.js using a fresh copy
      await loadPdfIntoTab(id, safeCopy(dataCopy));

      // Save a separate copy to IndexedDB for session restore
      await savePdfData(file.path, safeCopy(dataCopy));

      addRecentFile({
        path:     file.path,
        name:     file.name,
        date:     new Date().toLocaleDateString(),
        lastPage: 1,
      });
    } catch (err) {
      setLoadError(err.message ?? "Could not open this PDF.");
    } finally {
      setLoading(false);
    }
  }, [openTab, loadPdfIntoTab, addRecentFile, setActiveTab]);

  // ── Session restore on startup ────────────────────────────────────────
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    async function restoreSession() {
      const savedTabs = useStore.getState().tabs;
      if (savedTabs.length === 0) { setSessionLoading(false); return; }

      let anyRestored = false;

      for (const tab of savedTabs) {
        try {
          const stored = await loadPdfData(tab.path);
          if (!stored) continue;

          // Make a fresh copy from storage
          const bytes = safeCopy(stored);
          if (!bytes) continue;

          // Validate it's actually a PDF (%PDF header)
          if (bytes[0] !== 0x25 || bytes[1] !== 0x50) continue;

          // Load using yet another copy so storage data stays intact
          await loadPdfIntoTab(tab.id, safeCopy(bytes));
          anyRestored = true;
        } catch (err) {
          console.warn(`Could not restore "${tab.name}":`, err);
        }
      }

      // Clean up tabs that couldn't be restored
      const currentTabs = useStore.getState().tabs;
      for (const tab of currentTabs) {
        if (!pdfDocsRef.current[tab.id]) {
          useStore.getState().closeTab(tab.id);
        }
      }

      setSessionLoading(false);
    }

    restoreSession();
  }, [loadPdfIntoTab]);

  // ── Save reading position ─────────────────────────────────────────────
  useEffect(() => {
    if (!activeTab) return;
    updateRecentFilePage(activeTab.path, activeTab.page);
  }, [activeTab?.page, activeTab?.path]);

  // ── Clean up closed docs ──────────────────────────────────────────────
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
      for (const file of Array.from(e.dataTransfer?.files ?? [])) {
        const data = await file.arrayBuffer();
        await loadPdf({ path: file.name, name: file.name, data });
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

  const appClass = [styles.app, focusMode ? styles.focusMode : ""].filter(Boolean).join(" ");
  const hasPdf   = activePdf != null;

  if (sessionLoading) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#0d1117",
        flexDirection: "column", gap: "16px",
      }}>
        <div style={{
          width: "36px", height: "36px",
          border: "3px solid #30363d", borderTopColor: "#4fc3f7",
          borderRadius: "50%", animation: "spin 0.8s linear infinite",
        }} />
        <p style={{ fontSize: "13px", color: "#8b949e", fontFamily: "sans-serif" }}>
          Restoring your session…
        </p>
      </div>
    );
  }

  return (
    <div className={appClass}>
      <TopBar
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onToggleSettings={() => setSettingsOpen((o) => !o)}
        settingsOpen={settingsOpen}
        onFileLoaded={loadPdf}
      />
      <TabBar onFileLoaded={loadPdf} />
      <Toolbar onFileLoaded={loadPdf} />
      <SearchBar pdf={activePdf} />
      <div className={styles.body}>
        {hasPdf && sidebarOpen && !focusMode && (
          <Sidebar pdf={activePdf} outline={activeOutline} />
        )}
        <div className={styles.main}>
          {loading && (
            <div className={styles.loadingOverlay} role="status">
              <div className={styles.spinner} />
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
