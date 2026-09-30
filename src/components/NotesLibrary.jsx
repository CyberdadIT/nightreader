import React, { useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { NOTE_TYPES, allTags, ankiFlashcards, filterNotes, parseTags } from '../utils/notes.js';
import { notesMarkdown } from '../utils/export.js';
import { saveTextFile } from '../utils/platform.js';
import styles from './Library.module.css';

const SWATCH = { 'hl-yellow': '#ffdf00', 'hl-blue': '#4fc3f7', 'hl-pink': '#f48fb1', 'hl-green': '#a5d6a7', underline: '#f48fb1', strikethrough: '#ef9a9a', note: '#4fc3f7' };

/** Every highlight and note across the library: search, filter, edit, jump, export. */
export default function NotesLibrary({ onJump }) {
  const annotations = useStore(s => s.annotations), library = useStore(s => s.library);
  const updateAnnotation = useStore(s => s.updateAnnotation);
  const [query, setQuery] = useState(''), [type, setType] = useState(''), [tag, setTag] = useState(''), [message, setMessage] = useState('');
  const notes = useMemo(() => filterNotes(annotations, library, { query, type, tag }), [annotations, library, query, type, tag]);
  const tags = useMemo(() => allTags(annotations), [annotations]);

  async function exportAs(format) {
    try {
      setMessage('');
      if (format === 'anki') {
        await saveTextFile('nightreader-flashcards.txt', ankiFlashcards(notes));
        setMessage(`Exported ${notes.length} flashcards. In Anki, choose File → Import and pick the file.`);
      } else {
        const byDoc = new Map();
        for (const n of notes) byDoc.set(n.filePath, [...(byDoc.get(n.filePath) || []), n]);
        const text = [...byDoc.values()].map(list => notesMarkdown(list[0].document.name, list, list[0].document.kind)).join('\n---\n\n');
        await saveTextFile('nightreader-notes.md', text, 'text/markdown');
      }
    } catch (e) { setMessage(`Export failed: ${e.message}`); }
  }

  let lastDoc = null;
  return (
    <section aria-label="All notes">
      <div className={styles.filters}>
        <input type="search" aria-label="Search notes" placeholder="Search highlights, notes and tags…" value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="Filter note type" value={type} onChange={e => setType(e.target.value)}>{NOTE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="Filter tag" value={tag} onChange={e => setTag(e.target.value)}><option value="">All tags</option>{tags.map(t => <option key={t}>{t}</option>)}</select>
        <button disabled={!notes.length} onClick={() => exportAs('anki')}>Export flashcards (Anki)</button>
        <button disabled={!notes.length} onClick={() => exportAs('md')}>Export Markdown</button>
      </div>
      {message && <p role="status">{message}</p>}
      <p className={styles.footnote} style={{ marginTop: 0 }}>{notes.length} of {annotations.filter(a => library.some(d => d.id === a.filePath)).length} notes</p>
      {!notes.length && <p className={styles.empty}>{annotations.length ? 'No notes match.' : 'Highlights and notes you make while reading appear here.'}</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {notes.map(n => {
          const heading = n.filePath !== lastDoc ? <h2 style={{ fontSize: 15, margin: '14px 0 2px' }}>{n.document.name}</h2> : null;
          lastDoc = n.filePath;
          return (
            <React.Fragment key={n.id}>
              {heading}
              <article className={`${styles.card} ${styles.noteCard}`} style={{ borderLeft: `4px solid ${SWATCH[n.type] || 'var(--border)'}` }}>
                <button onClick={() => onJump(n.filePath, n.page)} title="Open at this passage" style={{ textAlign: 'left', background: 'transparent', border: 0, color: 'var(--text)', padding: 0, font: 'inherit', cursor: 'pointer' }}>
                  “{n.quote.length > 280 ? `${n.quote.slice(0, 280)}…` : n.quote}”
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{n.document.kind === 'epub' ? 'Chapter' : 'Page'} {n.page} · open ›</span>
                </button>
                <textarea className={styles.field} aria-label={`Note on ${n.document.name} ${n.document.kind === 'epub' ? 'chapter' : 'page'} ${n.page}`} rows={2} placeholder="Add a note…" value={n.note || ''} onChange={e => updateAnnotation(n.id, { note: e.target.value })} />
                <TagInput tags={n.tags || []} onChange={next => updateAnnotation(n.id, { tags: next })} label={`Tags for note on page ${n.page}`} />
              </article>
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}

/** Comma-separated tags, saved when the field loses focus or Enter is pressed. */
export function TagInput({ tags, onChange, label }) {
  const [text, setText] = useState(null);
  const commit = () => { if (text !== null) { onChange(parseTags(text)); setText(null); } };
  return <input type="text" aria-label={label} placeholder="Tags, comma separated" value={text ?? tags.join(', ')}
    onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
    className={styles.field} />;
}
