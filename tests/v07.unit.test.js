// Unit tests for the 0.7 additions: backup, opening files from other apps, book styles,
// print ranges, OCR pack verification and "keep mine" on sync.
import { describe, it, expect, beforeEach } from 'vitest';
import { zipSync, strToU8, gzipSync } from 'fflate';
import { useStore } from '../src/store/useStore.js';
import { readBackup, mergeRestore, makeBackup, restoreBackup, BACKUP_FORMAT } from '../src/utils/backup.js';
import { savePdfData, documentId, loadPdfData, listSnapshots } from '../src/utils/storage.js';
import { sniffKind, nameFor } from '../src/utils/mobile.js';
import { scopeSelector, cleanDeclarations, moveInlineStyles, prefixClasses } from '../src/utils/epubStyles.js';
import { printRange, MAX_PRINT_PAGES } from '../src/utils/print.js';
import { verifyOcrPack, OCR_LANGUAGES, ocrPackUrl } from '../src/utils/ocrLanguages.js';
import { runSync, keepNotes } from '../src/utils/syncEngine.js';
import { syncFileText } from '../src/utils/sync.js';

const NOW = Date.now();
const note = (id, extra = {}) => ({ id, filePath: 'a'.repeat(64), page: 1, type: 'note', quote: 'q', note: '', tags: [], createdAt: NOW - 60_000, updatedAt: NOW - 60_000, ...extra });
const backupZip = (data, files = {}) => zipSync({ 'backup.json': strToU8(JSON.stringify({ format: BACKUP_FORMAT, version: 1, ...data })), ...files });
const reset = () => useStore.setState({ library: [], annotations: [], deletedAnnotations: [], bookmarks: [], collections: [], readingPace: {}, readingMode: 'dark' });

describe('backup and restore', () => {
  beforeEach(reset);

  it('rejects files that are not NightReader backups', () => {
    expect(() => readBackup(strToU8('hello'))).toThrow("isn't a NightReader backup");
    expect(() => readBackup(zipSync({ 'other.json': strToU8('{}') }))).toThrow("isn't a NightReader backup");
    expect(() => readBackup(backupZip({ format: 'evil' }))).toThrow("isn't a NightReader backup");
    expect(() => readBackup(backupZip({ version: 9 }))).toThrow('newer NightReader');
  });

  it('ignores unexpected paths inside the zip (no path traversal)', () => {
    const b = readBackup(backupZip({}, { '../../evil.pdf': strToU8('x'), 'documents/../x.pdf': strToU8('x'), 'documents/short.pdf': strToU8('x') }));
    expect(b.documents).toEqual([]);
  });

  it('cleans records: bad ids dropped, future dates clamped', () => {
    const b = readBackup(backupZip({
      library: [{ id: 'not-a-hash', name: 'x' }, { id: 'b'.repeat(64), name: 'Good', kind: 'epub', pageUpdatedAt: 9e15, lastPage: -4 }],
      annotations: [note('n1', { updatedAt: 9e15 }), { junk: true }],
    }));
    expect(b.library).toHaveLength(1);
    expect(b.library[0].pageUpdatedAt).toBeLessThanOrEqual(Date.now());
    expect(b.library[0].lastPage).toBe(1);
    expect(b.annotations).toHaveLength(1);
    expect(b.annotations[0].updatedAt).toBeLessThan(9e15);
  });

  it('merges without deleting: newer copy wins, restored notes lose their deletion records', () => {
    const current = { annotations: [note('keep', { note: 'mine', updatedAt: NOW })], deletedAnnotations: [{ id: 'back', at: NOW - 1000 }], bookmarks: [] };
    const merged = mergeRestore(current, { annotations: [note('keep', { note: 'old' }), note('back')], bookmarks: [] });
    expect(merged.annotations.find(a => a.id === 'keep').note).toBe('mine');
    expect(merged.annotations.map(a => a.id).sort()).toEqual(['back', 'keep']);
    expect(merged.deletedAnnotations).toEqual([]);
    expect(merged).toMatchObject({ added: 1, updated: 0 });
  });

  it('round-trips with documents, refuses a document that does not match its id, snapshots first', async () => {
    const bytes = strToU8('%PDF-1.4 real document');
    const id = await documentId(bytes);
    await savePdfData(id, bytes);
    useStore.setState({ library: [{ id, name: 'Real.pdf', kind: 'pdf', lastPage: 3 }], annotations: [note('n1', { filePath: id })] });
    const { bytes: zip, documents } = await makeBackup({ includeDocuments: true });
    expect(documents).toBe(1);

    reset();
    const before = (await listSnapshots()).length;
    const summary = await restoreBackup(zip);
    expect(summary).toMatchObject({ notesAdded: 1, documentsAdded: 1, rejected: 0, libraryAdded: 1 });
    expect(useStore.getState().library[0]).toMatchObject({ id, needsFile: false, lastPage: 3 });
    expect((await listSnapshots()).length).toBe(before + 1);

    reset();
    const other = 'c'.repeat(64);
    const forged = backupZip({ library: [{ id: other, name: 'Forged.pdf' }] }, { [`documents/${other}.pdf`]: strToU8('%PDF-1.4 something else') });
    const r = await restoreBackup(forged);
    expect(r).toMatchObject({ documentsAdded: 0, rejected: 1 });
    expect(await loadPdfData(other)).toBeUndefined();
    expect(useStore.getState().library[0].needsFile).toBe(true);
  });

  it('restores reading settings only onto a fresh library', async () => {
    useStore.setState({ library: [{ id: 'd'.repeat(64), name: 'x', kind: 'pdf' }], readingMode: 'dark' });
    await restoreBackup(backupZip({ settings: { readingMode: 'sepia' } }));
    expect(useStore.getState().readingMode).toBe('dark');
    reset();
    await restoreBackup(backupZip({ settings: { readingMode: 'sepia' } }));
    expect(useStore.getState().readingMode).toBe('sepia');
  });
});

describe('files opened from other apps (Android/iOS)', () => {
  it('recognises PDF and EPUB from their bytes, not the name', () => {
    expect(sniffKind(strToU8('%PDF-1.7\n...'))).toBe('pdf');
    const epub = zipSync({ mimetype: [strToU8('application/epub+zip'), { level: 0 }], 'a.xhtml': strToU8('<p/>') });
    expect(sniffKind(epub)).toBe('epub');
    expect(sniffKind(zipSync({ 'a.txt': strToU8('x') }))).toBeNull();
    expect(sniffKind(strToU8('<html>'))).toBeNull();
  });
  it('names files sensibly, even from opaque content URIs', () => {
    expect(nameFor('file:///var/mobile/Inbox/Report%20Q3.pdf', 'pdf')).toBe('Report Q3.pdf');
    expect(nameFor('content://com.android.providers.downloads/document/1234', 'pdf')).toBe('Shared document.pdf');
    expect(nameFor('content://x/book.pdf', 'epub')).toBe('Shared book.epub');
  });
});

describe('publisher styles (EPUB CSS)', () => {
  it('scopes selectors to the chapter and renames ids and classes', () => {
    expect(scopeSelector('p', '.epubContent')).toBe('.epubContent p');
    expect(scopeSelector('body', '.epubContent')).toBe('.epubContent');
    expect(scopeSelector('html body p.note', '.epubContent')).toBe('.epubContent p.bk-note');
    expect(scopeSelector(':root .x', '.epubContent')).toBe('.epubContent .bk-x');
    expect(scopeSelector('#intro > a', '.epubContent')).toBe('.epubContent #user-content-intro > a');
    // A selector aimed at the app's own interface still only matches inside the book.
    expect(scopeSelector('.toolbar button', '.epubContent')).toBe('.epubContent .bk-toolbar button');
  });
  it('keeps typography, drops anything that loads or escapes', () => {
    const style = document.createElement('div').style;
    style.cssText = 'color: red; font-weight: bold; background: url(https://evil.example/x.png); position: fixed; z-index: 99999; cursor: pointer; behavior: url(x.htc)';
    const clean = cleanDeclarations(style);
    expect(clean).toContain('color: red');
    expect(clean).toContain('font-weight: bold');
    expect(clean).not.toMatch(/url|fixed|99999|cursor|behavior/);
  });
  it('moves inline styles aside and prefixes classes', () => {
    const doc = new DOMParser().parseFromString('<p class="a b$ c" style="color: blue; position: fixed">x</p><span style="background-image: url(x)">y</span>', 'text/html');
    moveInlineStyles(doc); prefixClasses(doc);
    const [p, span] = doc.body.children;
    expect(p.getAttribute('style')).toBeNull();
    expect(p.getAttribute('data-nr-style')).toBe('color: blue');
    expect(p.getAttribute('class')).toBe('bk-a bk-c');
    expect(span.hasAttribute('data-nr-style')).toBe(false);
  });
});

describe('print range', () => {
  it('handles current page, ranges, reversed and out-of-range input', () => {
    expect(printRange({ mode: 'current', current: 4, total: 10 })).toEqual({ first: 4, last: 4 });
    expect(printRange({ mode: 'range', from: 8, to: 3, total: 10 })).toEqual({ first: 3, last: 8 });
    expect(printRange({ mode: 'range', from: -5, to: 'x', total: 10 })).toEqual({ first: 1, last: 1 });
    expect(printRange({ mode: 'range', from: 2, to: 99, total: 10 })).toEqual({ first: 2, last: 10 });
    expect(printRange({ mode: 'all', total: 1000 })).toEqual({ first: 1, last: MAX_PRINT_PAGES });
  });
});

describe('OCR language packs', () => {
  it('pins every pack to a version and a SHA-256', () => {
    for (const lang of OCR_LANGUAGES.filter(l => !l.bundled)) {
      expect(lang.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(lang.size).toBeGreaterThan(100_000);
      expect(ocrPackUrl(lang.code)).toMatch(new RegExp(`^https://cdn\\.jsdelivr\\.net/npm/@tesseract\\.js-data/${lang.code}@1\\.0\\.0/`));
    }
  });
  it('refuses data that does not match, gzipped or not, and unknown languages', async () => {
    await expect(verifyOcrPack('fra', strToU8('fake'))).rejects.toThrow("didn't match its checksum");
    await expect(verifyOcrPack('fra', gzipSync(strToU8('fake')))).rejects.toThrow("didn't match its checksum");
    await expect(verifyOcrPack('fra', new Uint8Array([0x1f, 0x8b, 1, 2, 3]))).rejects.toThrow('damaged');
    await expect(verifyOcrPack('../../x', strToU8('x'))).rejects.toThrow('Unknown');
    await expect(verifyOcrPack('eng', strToU8('x'))).rejects.toThrow('Unknown');
  });
});

describe('sync: "Keep mine"', () => {
  beforeEach(reset);
  it('keeps notes that another device deleted, and they win the next sync', async () => {
    const notes = Array.from({ length: 5 }, (_, i) => note(`n${i}`));
    useStore.setState({ annotations: notes });
    const remote = syncFileText({ format: 'nightreader-sync', version: 1, documents: {}, annotations: [], collections: [], bookmarks: [],
      deletedAnnotations: notes.map(n => ({ id: n.id, at: NOW - 1000 })) });
    let written = null;
    const io = { readRemote: async () => remote, writeRemote: async t => { written = t; } };
    const first = await runSync(io);
    expect(first.status).toBe('confirm');
    expect(useStore.getState().annotations).toHaveLength(5);
    keepNotes(first.removed);
    const second = await runSync(io);
    expect(second.status).toBe('ok');
    expect(useStore.getState().annotations).toHaveLength(5);
    expect(JSON.parse(written).annotations).toHaveLength(5);
  });
});

describe('crash screen', () => {
  it('catches a crash, logs it, and "Back to library" closes the document and recovers', async () => {
    const React = (await import('react')).default;
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    const { default: ErrorBoundary } = await import('../src/components/ErrorBoundary.jsx');
    const { readErrors, clearErrors } = await import('../src/utils/errorLog.js');
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    clearErrors();
    let broken = true;
    const Child = () => { if (broken) throw new Error('Bad page'); return React.createElement('p', null, 'All good'); };
    useStore.setState({ tabs: [{ id: 't1', path: 'x', name: 'x.pdf', page: 1 }], activeTabId: 't1' });
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host, { onUncaughtError: () => {}, onCaughtError: () => {} });
    await act(async () => { root.render(React.createElement(ErrorBoundary, null, React.createElement(Child))); });
    expect(host.textContent).toContain('NightReader hit a problem');
    expect(host.textContent).toContain('Bad page');
    expect(readErrors()[0].message).toBe('Bad page');
    broken = false;
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Back to library').click(); });
    expect(useStore.getState().tabs).toHaveLength(0);
    expect(host.textContent).toContain('All good');
    root.unmount();
  });
});
