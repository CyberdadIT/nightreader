import React, { useState, useEffect } from "react";
import { useStore } from "../store/useStore.js";
import styles from "./StatusBar.module.css";

export default function StatusBar() {
  const currentPage  = useStore((s) => s.currentPage);
  const totalPages   = useStore((s) => s.totalPages);
  const readingMode  = useStore((s) => s.readingMode);
  const focusMode    = useStore((s) => s.focusMode);
  const [time, setTime] = useState("");

  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  if (focusMode) return null;

  const pct = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const remaining = totalPages > 0 ? totalPages - currentPage : 0;
  const modeLabel = {
    dark: "☽ Dark",
    light: "☀ Light",
    sepia: "☕ Sepia",
    amoled: "⬛ AMOLED",
    green: "▣ Matrix",
  }[readingMode] ?? readingMode;

  return (
    <footer className={styles.bar} role="status" aria-label="Reading status">
      <span className={styles.item}>{modeLabel}</span>
      <span className={styles.sep}>|</span>
      <span className={styles.item}>
        Page {currentPage}{totalPages > 0 ? ` of ${totalPages}` : ""}
      </span>
      <span className={styles.sep}>|</span>
      <div className={styles.progress} aria-label={`${pct}% read`} title={`${pct}% read`}>
        <div className={styles.progressBar} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.spacer} />
      {remaining > 0 && (
        <span className={styles.item}>~{remaining * 3} min left</span>
      )}
      {time && (
        <>
          <span className={styles.sep}>|</span>
          <span className={styles.item}>{time}</span>
        </>
      )}
    </footer>
  );
}
