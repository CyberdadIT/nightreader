import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { GRADES, cardNotes, describeGap, dueCards, reviewCounts, schedule } from '../utils/flashcards.js';
import styles from './Library.module.css';

/**
 * Review your notes as flashcards. Space or Enter shows the answer; 1–4 grade it.
 * The queue is fixed when a session starts, and "Again" brings a card back at the end.
 */
export default function FlashcardReview({ onJump }) {
  const annotations = useStore(s => s.annotations), library = useStore(s => s.library), cards = useStore(s => s.cards);
  const notes = useMemo(() => cardNotes(annotations, library), [annotations, library]);
  const [docId, setDocId] = useState(''), [queue, setQueue] = useState(null), [shown, setShown] = useState(false), [done, setDone] = useState(0);
  const counts = useMemo(() => reviewCounts(notes.filter(n => !docId || n.filePath === docId), cards), [notes, cards, docId]);
  const docs = useMemo(() => library.filter(d => notes.some(n => n.filePath === d.id)), [library, notes]);
  const card = queue?.[0];

  function start() { setQueue(dueCards(notes, cards, { docId })); setShown(false); setDone(0); }
  function answer(grade) {
    if (!card) return;
    const next = schedule(cards[card.id], grade);
    useStore.getState().setCardSchedule(card.id, next);
    setQueue(q => (grade === 1 ? [...q.slice(1), q[0]] : q.slice(1)));
    setShown(false); setDone(d => d + 1);
  }
  useEffect(() => {
    if (!card) return;
    const onKey = e => {
      if (e.target.closest('input, textarea, select')) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setShown(true); }
      else if (shown && /^[1-4]$/.test(e.key)) { e.preventDefault(); answer(Number(e.key)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!notes.length) {
    return <section aria-label="Flashcard review"><p className={styles.empty}>Flashcards come from your notes: highlight a passage and add a note to it, and it becomes a card (passage on the front, your note on the back).</p></section>;
  }
  if (!queue) {
    return (
      <section aria-label="Flashcard review">
        <div className={styles.filters}>
          <select aria-label="Cards from" value={docId} onChange={e => setDocId(e.target.value)}>
            <option value="">All documents</option>{docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <p role="status">{counts.due} due · {counts.fresh} new · {counts.later} later · {counts.total} cards</p>
        <button className={styles.primaryButton} disabled={!counts.due && !counts.fresh} onClick={start}>{counts.due || counts.fresh ? 'Start review' : 'Nothing due — come back later'}</button>
        <p className={styles.footnote}>Each answer sets when the card comes back: Again in 10 minutes, then gaps grow (1 day, 4 days, a couple of weeks…) as you keep remembering it. Up to 20 new cards per session.</p>
      </section>
    );
  }
  if (!card) {
    return (
      <section aria-label="Flashcard review">
        <p role="status">Session complete: {done} answer{done === 1 ? '' : 's'}. Well done.</p>
        <button onClick={() => setQueue(null)}>Back</button>
      </section>
    );
  }
  const where = `${card.document.name} · ${card.document.kind === 'epub' ? 'chapter' : 'page'} ${card.page}`;
  return (
    <section aria-label="Flashcard review">
      <p className={styles.footnote} style={{ marginTop: 0 }}>{queue.length} left · {done} done</p>
      <article className={styles.card} aria-label="Flashcard" style={{ maxWidth: 720, fontSize: 16, lineHeight: 1.6 }}>
        <p className={styles.flashFront}>“{card.quote}”</p>
        <p className={styles.footnote}>{where}</p>
        {shown ? <>
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '12px 0' }} />
          <p className={styles.flashFront} style={{ whiteSpace: 'pre-wrap' }} aria-label="Answer">{card.note}</p>
          <div role="group" aria-label="How well did you remember?" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {GRADES.map(([grade, label]) => {
              const next = schedule(cards[card.id], grade);
              return <button key={grade} onClick={() => answer(grade)} aria-keyshortcuts={String(grade)}>{label} <small style={{ color: 'var(--muted)' }}>· {describeGap(next.due - Date.now())}</small></button>;
            })}
          </div>
        </> : <button className={styles.primaryButton} style={{ marginTop: 12 }} onClick={() => setShown(true)} aria-keyshortcuts="Space">Show answer</button>}
      </article>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => onJump(card.filePath, card.page)}>Open passage</button>
        <button onClick={() => setQueue(null)}>End session</button>
      </div>
    </section>
  );
}
