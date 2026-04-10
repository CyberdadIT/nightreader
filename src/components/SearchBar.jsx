import React, { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../store/useStore.js";
import styles from "./SearchBar.module.css";

/**
 * SearchBar — wired directly to PDF.js find API.
 * PDF.js exposes pdf.findController which handles text search,
 * highlighting matches, and navigation between them.
 */
export default function SearchBar({ pdf }) {
  const inputRef      = useRef(null);
  const searchVisible = useStore((s) => s.searchVisible);
  const toggleSearch  = useStore((s) => s.toggleSearch);

  const [query,        setQuery]        = useState("");
  const [matchCount,   setMatchCount]   = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [searching,    setSearching]    = useState(false);

  // Focus input when search opens
  useEffect(() => {
    if (searchVisible) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // Clear search state when closed
      setQuery("");
      setMatchCount(0);
      setCurrentMatch(0);
    }
  }, [searchVisible]);

  // ── PDF.js text search ────────────────────────────────────────────────
  const doSearch = useCallback(async (searchQuery, direction = "forward") => {
    if (!pdf || !searchQuery.trim()) {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    setSearching(true);
    try {
      // PDF.js doesn't expose findController directly on the doc object
      // so we do our own text search across all pages
      const total = pdf.numPages;
      const results = [];

      for (let pageNum = 1; pageNum <= total; pageNum++) {
        try {
          const page    = await pdf.getPage(pageNum);
          const content = await page.getTextContent();
          const text    = content.items.map((item) => item.str).join(" ");
          const lower   = text.toLowerCase();
          const q       = searchQuery.toLowerCase();
          let idx = lower.indexOf(q);
          while (idx !== -1) {
            results.push({ page: pageNum, index: idx });
            idx = lower.indexOf(q, idx + 1);
          }
        } catch {}
      }

      setMatchCount(results.length);
      if (results.length > 0) setCurrentMatch(1);
      else setCurrentMatch(0);

      // Store results for navigation
      inputRef.current._results   = results;
      inputRef.current._resultIdx = 0;

      // Navigate to first result
      if (results.length > 0) {
        navigateToResult(results, 0);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setSearching(false);
    }
  }, [pdf]);

  function navigateToResult(results, idx) {
    if (!results || results.length === 0) return;
    const result = results[idx];
    if (!result) return;
    // Jump to the page containing the match
    useStore.getState().setCurrentPage(result.page);
    setCurrentMatch(idx + 1);
  }

  function handleNext() {
    const results = inputRef.current?._results;
    if (!results || results.length === 0) return;
    const next = ((inputRef.current._resultIdx ?? 0) + 1) % results.length;
    inputRef.current._resultIdx = next;
    navigateToResult(results, next);
  }

  function handlePrev() {
    const results = inputRef.current?._results;
    if (!results || results.length === 0) return;
    const prev = ((inputRef.current._resultIdx ?? 0) - 1 + results.length) % results.length;
    inputRef.current._resultIdx = prev;
    navigateToResult(results, prev);
  }

  function handleChange(e) {
    const val = e.target.value;
    setQuery(val);
    if (val.length >= 2) {
      doSearch(val);
    } else {
      setMatchCount(0);
      setCurrentMatch(0);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") { toggleSearch(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      e.shiftKey ? handlePrev() : handleNext();
    }
  }

  if (!searchVisible) return null;

  return (
    <div className={styles.bar} role="search" aria-label="Find in document">
      <input
        ref={inputRef}
        className={styles.input}
        type="search"
        placeholder="Find in document… (type 2+ characters)"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label="Search query"
      />

      <span className={styles.count} aria-live="polite">
        {searching ? "Searching…" :
         query.length >= 2
           ? matchCount > 0
             ? `${currentMatch} / ${matchCount}`
             : "No results"
           : ""}
      </span>

      <button
        className={styles.btn}
        onClick={handlePrev}
        aria-label="Previous match"
        disabled={matchCount === 0}
        title="Previous match (Shift+Enter)"
      >▲</button>

      <button
        className={styles.btn}
        onClick={handleNext}
        aria-label="Next match"
        disabled={matchCount === 0}
        title="Next match (Enter)"
      >▼</button>

      <button
        className={styles.btn}
        onClick={toggleSearch}
        aria-label="Close search"
        title="Close (Esc)"
      >✕</button>
    </div>
  );
}
