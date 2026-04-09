import React from "react";
import { useStore } from "../store/useStore.js";
import { openFilePicker } from "../utils/platform.js";
import styles from "./TopBar.module.css";

export default function TopBar({ onToggleSidebar, onToggleSettings, settingsOpen, onFileLoaded }) {
  const fileName        = useStore((s) => s.fileName);
  const focusMode       = useStore((s) => s.focusMode);
  const toggleFocusMode = useStore((s) => s.toggleFocusMode);

  async function handleOpen() {
    const file = await openFilePicker();
    if (file) onFileLoaded?.(file);
  }

  if (focusMode) {
    return (
      <div className={styles.focusBar}>
        <button className={styles.exitFocus} onClick={toggleFocusMode}>
          ✕ Exit focus
        </button>
      </div>
    );
  }

  return (
    <header className={styles.topbar} role="banner">
      <span className={styles.logo} aria-label="NightReader">☽ NightReader</span>
      <div className={styles.divider} aria-hidden="true" />
      <span className={styles.title} title={fileName ?? ""}>
        {fileName ?? "No document open"}
      </span>
      <div className={styles.divider} aria-hidden="true" />
      <nav className={styles.actions} aria-label="Panel controls">
        <button className={styles.btn} onClick={onToggleSidebar} title="Toggle sidebar">▤ Sidebar</button>
        <button className={`${styles.btn} ${settingsOpen ? styles.btnActive : ""}`} onClick={onToggleSettings} title="Settings & annotations">☰ Notes</button>
        <button className={styles.btn} onClick={toggleFocusMode} title="Focus mode (R)">▭ Focus</button>
        <button className={`${styles.btn} ${styles.openBtn}`} onClick={handleOpen}>📂 Open PDF</button>
      </nav>
    </header>
  );
}
