import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore.js";
import styles from "./SearchBar.module.css";

/**
 * SearchBar
 * Sits below the toolbar when search is active.
 * Uses PDF.js PDFFindController under the hood (wired in App.jsx via the
 * eventBus). Falls back to basic text matching in the current page.
 */
export default function SearchBar({ onSearch, onPrev, onNext, matchCount = 0, currentMatch = 0 }) {
  const inputRef = useRef(null);
  const searchVisible = useStore((s) => s.searchVisible);
  const toggleSearch  = useStore((s) => s.toggleSearch);
  const [query, setQuery] = useState("");

  // Focus the input when search opens
  useEffect(() => {
    if (searchVisible) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [searchVisible]);

  if (!searchVisible) return null;

  function handleKeyDown(e) {
    if (e.key === "Escape") toggleSearch();
    if (e.key === "Enter") {
      e.shiftKey ? onPrev?.() : onNext?.();
    }
  }

  function handleChange(e) {
    setQuery(e.target.value);
    onSearch?.(e.target.value);
  }

  return (
    <div className={styles.bar} role="search" aria-label="Find in document">
      <input
        ref={inputRef}
        className={styles.input}
        type="search"
        placeholder="Find in document…"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label="Search query"
      />
      <span className={styles.count} aria-live="polite">
        {query.length > 1
          ? matchCount > 0
            ? `${currentMatch} / ${matchCount}`
            : "No results"
          : ""}
      </span>
      <button
        className={styles.btn}
        onClick={onPrev}
        aria-label="Previous match"
        disabled={matchCount === 0}
      >
        ▲
      </button>
      <button
        className={styles.btn}
        onClick={onNext}
        aria-label="Next match"
        disabled={matchCount === 0}
      >
        ▼
      </button>
      <button
        className={styles.btn}
        onClick={toggleSearch}
        aria-label="Close search"
      >
        ✕
      </button>
    </div>
  );
}
