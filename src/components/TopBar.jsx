import React from "react";
import { useStore } from "../store/useStore.js";
import { openFilePicker } from "../utils/platform.js";
import styles from "./TopBar.module.css";

export default function TopBar({ onToggleSidebar, onToggleSettings, settingsOpen, onFileLoaded }) {
  const activeTab       = useStore((s) => s.getActiveTab());
  const fileName        = activeTab?.name ?? null;
  const focusMode       = useStore((s) => s.focusMode);
  const toggleFocusMode = useStore((s) => s.toggleFocusMode);

  async function handleOpen() {
    const file = await openFilePicker();
    if (file) onFileLoaded?.(file);
  }

  if (focusMode) {
    return (
      <div className={styles.focusBar}>
        <button className={styles.exitFocus} onClick={toggleFocusMode}>✕ Exit focus</button>
      </div>
    );
  }

  return (
    <header className={styles.topbar} role="banner">
      <span className={styles.logo}>☽ NightReader</span>
      <div className={styles.divider} />
      <span className={styles.title} title={fileName ?? ""}>
        {fileName ?? "No document open"}
      </span>
      <div className={styles.divider} />
      <nav className={styles.actions}>
        <button className={styles.btn} onClick={onToggleSidebar} title="Toggle sidebar">▤ Sidebar</button>
        <button className={`${styles.btn} ${settingsOpen ? styles.btnActive : ""}`} onClick={onToggleSettings} title="Settings">☰ Notes</button>
        <button className={styles.btn} onClick={toggleFocusMode} title="Focus mode (R)">▭ Focus</button>
        <button className={`${styles.btn} ${styles.openBtn}`} onClick={handleOpen}>📂 Open PDF</button>
      </nav>
    </header>
  );
}
