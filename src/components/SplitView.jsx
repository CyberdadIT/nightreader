import React from 'react';
import { useStore } from '../store/useStore.js';
import Viewer from './Viewer.jsx';

/**
 * Side-by-side reading: two panes, each with its own document and page. Clicking or
 * tapping a pane makes it the active one, which the toolbar, keyboard, notes and
 * read aloud then work on. On narrow screens the panes stack.
 */
export default function SplitView({ docs }) {
  const split = useStore(s => s.split), tabs = useStore(s => s.tabs), activeTabId = useStore(s => s.activeTabId);
  const library = useStore(s => s.library);
  const pane = side => {
    const tab = tabs.find(t => t.id === split[side]);
    if (!tab) return null;
    const entry = docs[tab.path], active = tab.id === activeTabId;
    const label = side === 'left' ? 'Left pane' : 'Right pane';
    return (
      <section key={side} aria-label={`${label}: ${tab.name}`} data-pane={side}
        onPointerDownCapture={() => { if (!active) useStore.getState().setActiveTab(tab.id); }}
        onFocusCapture={() => { if (!active) useStore.getState().setActiveTab(tab.id); }}
        style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', borderTop: `2px solid ${active ? 'var(--accent)' : 'transparent'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ color: active ? 'var(--text)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {tab.name} · {tab.kind === 'epub' ? 'chapter' : 'page'} {tab.page}{tab.totalPages ? ` of ${tab.totalPages}` : ''}
          </span>
          <select aria-label={`Document in the ${label.toLowerCase()}`} value={tab.path} style={{ maxWidth: 200, fontSize: 12, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 4px' }}
            onChange={e => { const doc = library.find(d => d.id === e.target.value); if (doc) useStore.getState().showInPane(side, doc); }}>
            {library.filter(d => !d.needsFile).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {entry?.doc ? <Viewer pdf={entry.doc} tabId={tab.id} />
          : <p role="status" style={{ padding: 20, color: 'var(--muted)' }}>{entry?.error || 'Opening…'}</p>}
      </section>
    );
  };
  return (
    <div className="splitView" style={{ flex: 1, minHeight: 0, display: 'flex', gap: 2, background: 'var(--border)' }}>
      {pane('left')}{pane('right')}
    </div>
  );
}
