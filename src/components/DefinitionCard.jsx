import React, { useEffect, useState } from 'react';
import { define } from '../utils/dictionary.js';

/** Floating card with offline dictionary definitions for a selected word. */
export default function DefinitionCard({ word, x, y, onClose }) {
  const [result, setResult] = useState({ loading: true });
  useEffect(() => {
    let cancelled = false;
    setResult({ loading: true });
    define(word)
      .then(found => { if (!cancelled) setResult({ found }); })
      .catch(e => { if (!cancelled) setResult({ error: e.message }); });
    return () => { cancelled = true; };
  }, [word]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const width = Math.min(360, window.innerWidth - 16);
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  const height = Math.min(320, window.innerHeight - 16);
  const top = Math.max(8, Math.min(y + 60, window.innerHeight - height - 8));
  const { found } = result;
  return (
    <section role="dialog" aria-label={`Definition of ${word}`} className="definitionCard"
      style={{ position: 'fixed', left, top, width, maxHeight: height, overflow: 'auto', zIndex: 310, padding: '12px 14px',
        background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 28px #000a', fontSize: 13, lineHeight: 1.5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: 16 }}>{found?.lemma || word}</strong>
        <button onClick={onClose} aria-label="Close definition" style={{ background: 'transparent', border: 0, color: 'var(--muted)', fontSize: 16 }}>✕</button>
      </div>
      {result.loading && <p style={{ color: 'var(--muted)' }}>Looking up…</p>}
      {result.error && <p role="alert">{result.error}</p>}
      {!result.loading && !result.error && !found && <p style={{ color: 'var(--muted)' }}>No definition found for “{word}”.</p>}
      {found && found.lemma !== found.word && <p style={{ color: 'var(--muted)', marginBottom: 6 }}>Base form of “{found.word}”</p>}
      {found && <ol style={{ paddingLeft: 18 }}>
        {found.senses.map((s, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            <em style={{ color: 'var(--accent)' }}>{s.pos}</em> {s.definition}
            {s.example && <div style={{ color: 'var(--muted)' }}>“{s.example}”</div>}
            {s.synonyms?.length > 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Also: {s.synonyms.join(', ')}</div>}
          </li>
        ))}
      </ol>}
      <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 6 }}>Offline dictionary: WordNet © Princeton University</p>
    </section>
  );
}
