import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { ensureIndexed, searchLibrary } from '../utils/libraryIndex.js';
import { loadDocument } from '../utils/documents.js';
import styles from './Library.module.css';

/** Search the text of every document in the library, then open at the page. */
export default function LibrarySearch({ onJump }) {
  const library = useStore(s => s.library);
  const [query, setQuery] = useState(''), [results, setResults] = useState(null);
  const [indexing, setIndexing] = useState(null), [busy, setBusy] = useState(false);
  const generation = useRef(0), cancelled = useRef(false);

  // Bring the index up to date when this view opens (new documents since last time).
  useEffect(() => {
    cancelled.current = false;
    ensureIndexed(useStore.getState().library, {
      loadDocument,
      isCancelled: () => cancelled.current,
      onProgress: (done, total, name) => setIndexing(total && done < total ? { done, total, name } : null),
    }).catch(() => setIndexing(null)).finally(() => { if (!cancelled.current) setIndexing(null); });
    return () => { cancelled.current = true; };
  }, [library.length]);

  useEffect(() => {
    const run = ++generation.current;
    if (query.trim().length < 2) { setResults(null); return; }
    setBusy(true);
    const timer = setTimeout(async () => {
      const found = await searchLibrary(query, useStore.getState().library).catch(() => []);
      if (run === generation.current) { setResults(found); setBusy(false); }
    }, 220);
    return () => clearTimeout(timer);
  }, [query, indexing === null]);

  function open(docId, page) {
    onJump(docId, page);
    // Show the matches inside the document too.
    useStore.setState({ searchVisible: true, searchQuery: query.trim() });
  }

  const total = results?.reduce((sum, r) => sum + r.count, 0) || 0;
  const protectedCount = library.filter(d => d.protected).length;
  return (
    <section aria-label="Search all documents">
      <div className={styles.filters}>
        <input type="search" aria-label="Search inside all documents" placeholder="Search inside every document…" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
      </div>
      <p role="status" className={styles.footnote} style={{ marginTop: 0 }}>
        {indexing ? `Preparing search: ${indexing.done + 1} of ${indexing.total} (${indexing.name})…`
          : busy ? 'Searching…'
          : results ? (total ? `${total} match${total === 1 ? '' : 'es'} in ${results.length} document${results.length === 1 ? '' : 's'}` : 'No matches.')
          : 'Type at least 2 characters. Search works offline; text stays on this device.'}
        {protectedCount > 0 && ` Password-protected PDFs aren't searched.`}
      </p>
      <div style={{ display: 'grid', gap: 14 }}>
        {results?.map(({ doc, hits, count }) => (
          <article key={doc.id} className={styles.card} aria-label={doc.name}>
            <h2 style={{ fontSize: 15, marginBottom: 6 }}>{doc.name} <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>· {count} match{count === 1 ? '' : 'es'}</span></h2>
            <ul style={{ listStyle: 'none', display: 'grid', gap: 6 }}>
              {hits.map((h, i) => (
                <li key={i}>
                  <button onClick={() => open(doc.id, h.page)} style={{ textAlign: 'left', background: 'transparent', border: 0, color: 'var(--text)', padding: 0, font: 'inherit', cursor: 'pointer', fontSize: 13, lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>{doc.kind === 'epub' ? 'Chapter' : 'Page'} {h.page} · </span>
                    {h.before}<mark style={{ background: 'rgba(255,153,0,.45)', color: 'inherit', borderRadius: 2 }}>{h.match}</mark>{h.after}
                  </button>
                </li>
              ))}
            </ul>
            {count > hits.length && <p className={styles.footnote} style={{ margin: '6px 0 0' }}>Open the document to see all {count}.</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
