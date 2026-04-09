import React from "react";
import { openFilePicker } from "../utils/platform.js";
import { useStore } from "../store/useStore.js";
import styles from "./WelcomeScreen.module.css";

export default function WelcomeScreen({ onFileLoaded }) {
  const recentFiles = useStore((s) => s.recentFiles);

  async function handleOpen() {
    const file = await openFilePicker();
    if (file) onFileLoaded?.(file);
  }

  async function handleRecentFile(f) {
    // If we have the data cached, open directly
    if (f.data) {
      onFileLoaded?.({ path: f.path, name: f.name, data: f.data });
    } else {
      // Otherwise open file picker
      handleOpen();
    }
  }

  return (
    <div className={styles.screen} role="main">
      <div className={styles.hero}>
        <div className={styles.logoMark}>☽</div>
        <h1 className={styles.name}>NightReader</h1>
        <p className={styles.tagline}>A distraction-free PDF reader built for night owls.</p>
        <button className={styles.openBtn} onClick={handleOpen}>Open a PDF</button>
        <p className={styles.hint}>or drag &amp; drop files anywhere — open multiple PDFs as tabs</p>
      </div>

      {recentFiles.length > 0 && (
        <div className={styles.recent}>
          <h2 className={styles.recentTitle}>Recent files</h2>
          <div className={styles.recentList}>
            {recentFiles.slice(0, 8).map((f) => (
              <div
                key={f.path}
                className={styles.recentItem}
                onClick={() => handleRecentFile(f)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && handleRecentFile(f)}
              >
                <span className={styles.recentIcon}>📄</span>
                <div>
                  <span className={styles.recentName}>{f.name}</span>
                  <span className={styles.recentMeta}>
                    {f.lastPage && f.lastPage > 1 ? `Last read: page ${f.lastPage}` : ""}
                    {f.date ? ` · ${f.date}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.shortcuts}>
        <h2 className={styles.shortcutsTitle}>Keyboard shortcuts</h2>
        <div className={styles.shortcutGrid}>
          {[
            ["← / →",   "Previous / Next page"],
            ["Ctrl+F",   "Find in document"],
            ["+ / −",    "Zoom in / out"],
            ["R",        "Focus mode"],
            ["Ctrl+0",   "Reset zoom"],
            ["Esc",      "Close search"],
          ].map(([key, desc]) => (
            <React.Fragment key={key}>
              <kbd className={styles.key}>{key}</kbd>
              <span className={styles.desc}>{desc}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
