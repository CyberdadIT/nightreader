// Regression tests for the 0.6 security review findings. Each block names its finding.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { useStore } from '../src/store/useStore.js';
import { mergeSync, parseSyncFile, syncFileText } from '../src/utils/sync.js';
import { runSync } from '../src/utils/syncEngine.js';
import { listSnapshots } from '../src/utils/storage.js';
import { sanitizeChapter } from '../src/utils/epub.js';
import { isTauri } from '../src/utils/platform.js';
import { safeReleaseUrl, checkForUpdate, RELEASES_PAGE } from '../src/utils/updates.js';
import { notesMarkdown } from '../src/utils/export.js';
import { CSP } from '../csp.config.js';

const NOW = Date.now();
const file = data => JSON.stringify({ format: 'nightreader-sync', version: 1, documents: {}, annotations: [], deletedAnnotations: [], collections: [], ...data });
const note = (id, extra = {}) => ({ id, filePath: 'd1', page: 1, type: 'note', quote: 'q', note: '', tags: [], updatedAt: NOW - 60_000, ...extra });

describe('M2 · tampered sync file with future timestamps', () => {
  it('treats future timestamps as now, so later edits on this device win', () => {
    const remote = parseSyncFile(file({ annotations: [note('planted', { note: 'from the future', updatedAt: 9e15 })] }), NOW);
    expect(remote.annotations[0].updatedAt).toBeLessThanOrEqual(NOW + 5 * 60_000);
    const local = { library: [], collections: [], deletedAnnotations: [], annotations: [note('planted', { note: 'my edit', updatedAt: NOW + 6 * 60_000 })] };
    expect(mergeSync(local, remote, NOW).annotations[0].note).toBe('my edit');
  });
  it('clamps deletion records and reading positions too', () => {
    const remote = parseSyncFile(file({ deletedAnnotations: [{ id: 'x', at: 9e15 }], documents: { d1: { name: 'a.pdf', lastPage: 1, pageUpdatedAt: 9e15 } } }), NOW);
    expect(remote.deletedAnnotations[0].at).toBeLessThanOrEqual(NOW + 5 * 60_000);
    expect(remote.documents.d1.pageUpdatedAt).toBeLessThanOrEqual(NOW + 5 * 60_000);
  });
  describe('removing several notes at once', () => {
    beforeEach(() => useStore.setState({ library: [{ id: 'd1', name: 'a.pdf', kind: 'pdf', lastPage: 1 }], collections: [], bookmarks: [], deletedAnnotations: [],
      annotations: Array.from({ length: 6 }, (_, i) => note(`n${i}`)) }));
    const tombstones = file({ deletedAnnotations: Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, at: NOW })) });
    it('waits for the user before removing five or more notes, and changes nothing meanwhile', async () => {
      let written = null;
      const result = await runSync({ readRemote: async () => tombstones, writeRemote: async t => { written = t; } });
      expect(result.status).toBe('confirm');
      expect(result.removed).toHaveLength(6);
      expect(useStore.getState().annotations).toHaveLength(6);
      expect(written).toBeNull();
    });
    it('snapshots the notes before removing them once approved', async () => {
      const before = (await listSnapshots()).length;
      const result = await runSync({ readRemote: async () => tombstones, writeRemote: async () => {}, approveRemovals: true });
      expect(result.status).toBe('ok');
      expect(useStore.getState().annotations).toHaveLength(0);
      const snapshots = await listSnapshots();
      expect(snapshots.length).toBe(before + 1);
      expect(snapshots[0].annotations).toHaveLength(6);
    });
  });
});

describe('L3 · password-protected PDFs', () => {
  it('keeps notes on protected documents out of the sync file', () => {
    const local = { library: [{ id: 'secret', name: 'payslip.pdf', protected: true }, { id: 'open', name: 'book.pdf' }], collections: [], deletedAnnotations: [],
      annotations: [note('a', { filePath: 'secret', quote: 'Salary 1,234' }), note('b', { filePath: 'open' })],
      bookmarks: [{ id: 'm', filePath: 'secret', page: 2, updatedAt: NOW }] };
    const merged = mergeSync(local, null, NOW);
    expect(merged.annotations).toHaveLength(2);
    expect(merged.file.annotations.map(a => a.id)).toEqual(['b']);
    expect(merged.file.bookmarks).toEqual([]);
    expect(syncFileText(merged.file)).not.toContain('Salary');
  });
});

describe('Bookmarks sync', () => {
  it('keeps the newest record per page, including removals', () => {
    const local = { library: [], collections: [], deletedAnnotations: [], annotations: [],
      bookmarks: [{ id: 'b1', filePath: 'd1', page: 5, title: 'p5', updatedAt: NOW - 1000 }] };
    const remote = parseSyncFile(file({ bookmarks: [{ id: 'b1', filePath: 'd1', page: 5, title: 'p5', deleted: true, updatedAt: NOW }, { id: 'b2', filePath: 'd1', page: 9, title: 'p9', updatedAt: NOW }] }), NOW);
    const merged = mergeSync(local, remote, NOW);
    expect(merged.bookmarks.find(b => b.page === 5).deleted).toBe(true);
    expect(merged.bookmarks.find(b => b.page === 9).deleted).toBe(false);
  });
});

describe('L2 · DOM clobbering from EPUB element IDs', () => {
  it('prefixes book IDs so they cannot shadow page globals', () => {
    const html = sanitizeChapter('<div id="__TAURI_INTERNALS__">x</div><a id="isTauri">y</a><p id="intro">z</p>');
    expect(html).toContain('id="user-content-intro"');
    expect(html).not.toMatch(/id="__TAURI_INTERNALS__"/);
  });
  it('does not mistake a clobbered element for the Tauri bridge', () => {
    const el = document.createElement('div'); el.id = '__TAURI_INTERNALS__'; document.body.append(el);
    try { expect(isTauri()).toBe(false); } finally { el.remove(); }
  });
});

describe('L6 · update link', () => {
  it('only opens this project\'s release pages', () => {
    expect(safeReleaseUrl('https://github.com/CyberdadIT/nightreader/releases/tag/v0.7.0')).toBe('https://github.com/CyberdadIT/nightreader/releases/tag/v0.7.0');
    for (const bad of ['https://evil.example/releases/', 'https://github.com/someone-else/nightreader/releases/tag/v1', 'http://github.com/CyberdadIT/nightreader/releases/x',
      'https://user:pw@github.com/CyberdadIT/nightreader/releases/x', 'javascript:alert(1)', null]) expect(safeReleaseUrl(bad)).toBe(RELEASES_PAGE);
  });
  it('applies the check to API responses', async () => {
    const res = await checkForUpdate('0.1.0', () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ tag_name: 'v9.0.0', html_url: 'https://evil.example/' }) }));
    expect(res.url).toBe(RELEASES_PAGE);
  });
});

describe('L7 · Markdown export', () => {
  it('writes HTML from a document as harmless text', () => {
    const md = notesMarkdown('<b>Book</b>', [{ page: 1, quote: '<img src=x onerror=alert(1)>', note: 'a & b <script>' }]);
    expect(md).not.toMatch(/<img|<script|<b>/);
    expect(md).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('M1, L1 · desktop configuration', () => {
  const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  const caps = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8'));
  it('uses the same Content Security Policy as the other builds', () => {
    expect(conf.app.security.csp).toEqual(CSP);
  });
  it('allows no JavaScript eval, plugins, frames or base-URL changes', () => {
    expect(CSP['script-src']).not.toMatch(/'unsafe-eval'|'unsafe-inline'|\*/);
    for (const d of ['object-src', 'frame-src', 'base-uri', 'form-action']) expect(CSP[d]).toBe("'none'");
    expect(CSP['default-src']).toBe("'self'");
  });
  it('lets the page open only the project release pages', () => {
    expect(caps.permissions).not.toContain('opener:default');
    const opener = caps.permissions.find(p => typeof p === 'object' && p.identifier === 'opener:allow-open-url');
    expect(opener.allow).toEqual([{ url: 'https://github.com/CyberdadIT/nightreader/*' }]);
    expect(caps.permissions.filter(p => typeof p === 'string' && p.startsWith('opener:'))).toEqual([]);
  });
});
