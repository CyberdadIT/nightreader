import React, { useState, useEffect, useMemo } from "react";
import { useStore } from "../store/useStore.js";
import { countWords, formatDuration, paceFor, timeLeft, DEFAULT_SECONDS_PER_PAGE, DEFAULT_WPM } from "../utils/pace.js";
import styles from "./StatusBar.module.css";

export default function StatusBar({ doc }) {
  const activeTab    = useStore((s) => s.getActiveTab());
  const currentPage  = activeTab?.page ?? 1;
  const totalPages   = activeTab?.totalPages ?? 0;
  const readingMode  = useStore((s) => s.readingMode);
  const focusMode    = useStore((s) => s.focusMode);
  const tabs         = useStore((s) => s.tabs);
  const readingPace  = useStore((s) => s.readingPace);
  const [time, setTime] = useState("");
  const chapterWords = useMemo(() => doc?.kind === "epub" ? (doc.chapters || []).map(c => countWords(c.text)) : [], [doc]);

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
  const epub = activeTab?.kind === "epub";
  const left = doc && activeTab ? timeLeft({
    kind: epub ? "epub" : "pdf", page: currentPage, total: totalPages, chapterWords,
    secondsPerPage: paceFor(readingPace, activeTab.path, "secondsPerPage", DEFAULT_SECONDS_PER_PAGE),
    wpm: paceFor(readingPace, activeTab.path, "wpm", DEFAULT_WPM),
  }) : null;
  const leftText = !left ? "" : epub
    ? `about ${formatDuration(left.chapter)} left in chapter · ${formatDuration(left.book)} in book`
    : `about ${formatDuration(left.book)} left`;
  const remaining = totalPages > 0 ? totalPages - currentPage : 0;
  const modeLabel = {
    dark: "☽ Dark", light: "☀ Light", sepia: "☕ Sepia",
    amoled: "⬛ AMOLED", green: "▣ Matrix",
  }[readingMode] ?? readingMode;

  return (
    <footer className={styles.bar} role="status">
      <span className={styles.item}>{modeLabel}</span>
      <span className={styles.sep}>|</span>
      <span className={styles.item}>
        {activeTab?.kind === "epub" ? "Chapter" : "Page"} {currentPage}{totalPages > 0 ? ` of ${totalPages}` : ""}
      </span>
      {tabs.length > 1 && (
        <>
          <span className={styles.sep}>|</span>
          <span className={styles.item}>{tabs.length} tabs open</span>
        </>
      )}
      <span className={styles.sep}>|</span>
      <div className={styles.progress} title={`${pct}% read`}>
        <div className={styles.progressBar} style={{ width: `${pct}%` }} />
      </div>
      {totalPages > 0 && <span className={styles.item} data-time-left title="Based on your reading pace">{pct}% · {leftText}</span>}
      <div className={styles.spacer} />

      {time && (
        <>
          <span className={styles.sep}>|</span>
          <span className={styles.item}>{time}</span>
        </>
      )}
    </footer>
  );
}
