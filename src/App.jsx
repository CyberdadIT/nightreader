import React, { useState, useCallback, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";

import TopBar        from "./components/TopBar.jsx";
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

// Initialise PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default function App() {
  const [pdf,          setPdf]          = useState(null);
  const [outline,      setOutline]      = useState([]);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadError,    setLoadError]    = useState(null);
  const [loading,      setLoading]      = useState(false);

  const setFile        = useStore((s) => s.setFile);
  const setTotalPages  = useStore((s) => s.setTotalPages);
  const addRecentFile  = useStore((s) => s.addRecentFile);
  const setCurrentPage = useStore((s) => s.setCurrentPage);
  const currentPage    = useStore((s) => s.currentPage);
  const focusMode      = useStore((s) => s.focusMode);

  // Load a PDF from an ArrayBuffer
  const loadPdf = useCallback(async (file) => {
    if (!file?.data) return;
    setLoading(true);
    setLoadError(null);
    try {
      const doc = await pdfjsLib.getDocument({ data: file.data }).promise;
      setPdf(doc);
      setTotalPages(doc.numPages);
      setFile(file.path, file.name);
      setCurrentPage(1);
      addRecentFile({
        path: file.path,
        name: file.name,
        date: new Date().toLocaleDateString(),
        lastPage: 1,
      });
      try {
        const ol = await doc.getOutline();
        setOutline(ol ?? []);
      } catch {
        setOutline([]);
      }
    } catch (err) {
      setLoadError(err.message ?? "Could not open this PDF.");
    } finally {
      setLoading(false);
    }
  }, [setFile, setTotalPages, setCurrentPage, addRecentFile]);

  // Drag-and-drop support
  useEffect(() => {
    async function onDrop(e) {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      // Accept any file — PDF.js will error if it's not a PDF
      const data = await file.arrayBuffer();
      loadPdf({ path: file.name, name: file.name, data });
    }
    function onDragOver(e) { e.preventDefault(); }
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDragOver);
    return () => {
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onDragOver);
    };
  }, [loadPdf]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNextPage: () => setCurrentPage(currentPage + 1),
    onPrevPage: () => setCurrentPage(currentPage - 1),
  });

  const appClass = [styles.app, focusMode ? styles.focusMode : ""]
    .filter(Boolean).join(" ");

  return (
    <div className={appClass}>
      <TopBar
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onToggleSettings={() => setSettingsOpen((o) => !o)}
        settingsOpen={settingsOpen}
        onFileLoaded={loadPdf}
      />

      {/* Toolbar always visible so Open PDF button is always accessible */}
      <Toolbar onFileLoaded={loadPdf} />
      {<SearchBar />}

      <div className={styles.body}>
        {pdf && sidebarOpen && !focusMode && (
          <Sidebar pdf={pdf} outline={outline} />
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

          {!pdf && !loading && !loadError && (
            <WelcomeScreen onFileLoaded={loadPdf} />
          )}

          {pdf && <Viewer pdf={pdf} />}
        </div>

        {settingsOpen && !focusMode && (
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        )}
      </div>

      <StatusBar />
    </div>
  );
}
