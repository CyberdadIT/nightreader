import React from 'react';
import { logError, errorReport } from '../utils/errorLog.js';
import { useStore } from '../store/useStore.js';

/**
 * If any part of the interface crashes, show a way back instead of a blank window.
 * Notes and documents are untouched: they live in storage, not in the crashed view.
 */
export default class ErrorBoundary extends React.Component {
  state = { error: null, copied: false };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) { logError(error, (info?.componentStack || '').trim().split('\n')[0] || 'interface'); }

  backToLibrary = () => {
    // The open document is the most likely cause, so close its tab before trying again.
    const { activeTabId, closeTab } = useStore.getState();
    if (activeTabId) closeTab(activeTabId);
    this.setState({ error: null, copied: false });
  };

  copy = async () => {
    try { await navigator.clipboard.writeText(errorReport()); this.setState({ copied: true }); } catch { /* clipboard unavailable */ }
  };

  render() {
    if (!this.state.error) return this.props.children;
    const button = { padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 };
    return (
      <div role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)', color: 'var(--text)' }}>
        <div style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 22, marginBottom: 10 }}>NightReader hit a problem</h1>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginBottom: 6 }}>Your library and notes are safe. Going back to the library closes the document that was open; reloading starts the app again.</p>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18, fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>{String(this.state.error?.message || this.state.error).slice(0, 200)}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={{ ...button, background: 'var(--accent)', color: '#041018', borderColor: 'var(--accent)', fontWeight: 600 }} onClick={this.backToLibrary}>Back to library</button>
            <button style={button} onClick={() => window.location.reload()}>Reload</button>
            <button style={button} onClick={this.copy}>{this.state.copied ? 'Copied' : 'Copy error details'}</button>
          </div>
        </div>
      </div>
    );
  }
}
