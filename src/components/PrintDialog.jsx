import React, { useRef, useState } from 'react';
import Dialog, { dialogStyles as styles } from './Dialog.jsx';
import { useStore } from '../store/useStore.js';
import { MAX_PRINT_PAGES, canPrintHere, printEpub, printPdf, printRange, sharePdfForPrinting } from '../utils/print.js';

export default function PrintDialog({ doc, onClose }) {
  const tab = useStore(s => s.getActiveTab());
  const epub = doc?.kind === 'epub', unit = epub ? 'chapter' : 'page', total = doc?.numPages || 1;
  const [mode, setMode] = useState('current'), [from, setFrom] = useState(tab?.page || 1), [to, setTo] = useState(Math.min(total, (tab?.page || 1) + 9));
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const cancelled = useRef(false);

  if (!canPrintHere()) {
    return (
      <Dialog title="Print" onClose={onClose}>
        {epub ? <p>Printing books isn't available on phones yet.</p> : <>
          <p>Phones print through the share sheet. Choose Print there.</p>
          <div className={styles.actions}>
            <button onClick={onClose}>Cancel</button>
            <button className={styles.primary} onClick={async () => { try { await sharePdfForPrinting(tab); onClose(); } catch (e) { setStatus(e.message); } }}>Share to print</button>
          </div>
          {status && <p className={styles.error} role="alert">{status}</p>}
        </>}
      </Dialog>
    );
  }

  async function print() {
    const range = printRange({ mode, current: tab?.page, from, to, total });
    setBusy(true); cancelled.current = false;
    try {
      if (epub) await printEpub(doc, range);
      else await printPdf(doc, range, (n, count) => setStatus(`Preparing page ${n} of ${count}…`), () => cancelled.current);
      onClose();
    } catch (e) { setStatus(`Couldn't print: ${e.message}`); setBusy(false); }
  }

  const label = { current: `This ${unit} (${tab?.page || 1})`, range: `${epub ? 'Chapters' : 'Pages'}`, all: `Whole ${epub ? 'book' : 'document'} (${total} ${unit}s${total > MAX_PRINT_PAGES ? `, first ${MAX_PRINT_PAGES}` : ''})` };
  return (
    <Dialog title="Print" onClose={() => { cancelled.current = true; onClose(); }}>
      <fieldset style={{ border: 0, display: 'grid', gap: 8 }} disabled={busy}>
        <legend className="sr-only">What to print</legend>
        {['current', 'range', 'all'].map(m => (
          <label key={m} className={styles.row} style={{ margin: 0, fontSize: 14 }}>
            <input type="radio" name="print-mode" checked={mode === m} onChange={() => setMode(m)} /> {label[m]}
            {m === 'range' && <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="number" aria-label={`First ${unit}`} min={1} max={total} value={from} onChange={e => { setFrom(e.target.value); setMode('range'); }} style={{ width: 72 }} />
              to
              <input type="number" aria-label={`Last ${unit}`} min={1} max={total} value={to} onChange={e => { setTo(e.target.value); setMode('range'); }} style={{ width: 72 }} />
            </span>}
          </label>
        ))}
      </fieldset>
      {!epub && <p style={{ marginTop: 10 }}>Pages print as they appear on paper (no dark mode), with any form values you've filled in.</p>}
      {status && <p role="status">{status}</p>}
      <div className={styles.actions}>
        <button onClick={() => { cancelled.current = true; onClose(); }}>Cancel</button>
        <button className={styles.primary} onClick={print} disabled={busy}>{busy ? 'Preparing…' : 'Print'}</button>
      </div>
    </Dialog>
  );
}
