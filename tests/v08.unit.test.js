// Unit tests for 0.8: read-along alignment, ink, flashcards, statistics, library
// search, voices, and the app lock's encryption.
import { describe, it, expect, beforeEach } from 'vitest';
import { alignChunk, compact, wordOnScreen } from '../src/utils/speechAlign.js';
import { cleanInk, outlinePath, simplify, touchesStroke, inkBounds, MAX_POINTS } from '../src/utils/ink.js';
import { cleanAnnotation } from '../src/utils/sync.js';
import { schedule, dueCards, cardNotes, describeGap, reviewCounts, cleanCards } from '../src/utils/flashcards.js';
import { addToLog, lastDays, streak, totals, dayKey, formatMinutes, cleanLog, mergeLogs } from '../src/utils/stats.js';
import { fold, searchLibrary } from '../src/utils/libraryIndex.js';
import { saveTextIndex, savePdfData, loadPdfData, resealAll, saveSnapshot, listSnapshots } from '../src/utils/storage.js';
import { voiceGender, voiceLabel, wordLengthAt } from '../src/utils/speech.js';
import * as vault from '../src/utils/vault.js';
import { useStore } from '../src/store/useStore.js';

const DAY = 86_400_000;

describe('read-along alignment', () => {
  const screen = 'NightReader chapter 1Learning security through   practical reading.\nThis passage is ready.';
  it('finds a spoken sentence despite different spacing and case', () => {
    const a = alignChunk(screen, 'learning security through practical reading.');
    expect(screen.slice(a.start, a.end)).toBe('Learning security through   practical reading.');
  });
  it('maps a spoken word to its place on screen', () => {
    const chunk = 'Learning security through practical reading.';
    const a = alignChunk(screen, chunk);
    const w = wordOnScreen(a, chunk.indexOf('practical'), 'practical'.length);
    expect(screen.slice(w.start, w.end)).toBe('practical');
  });
  it('searches from the reading position so repeated sentences are found in order', () => {
    const text = 'Again. Middle. Again.';
    const first = alignChunk(text, 'Again.');
    const second = alignChunk(compact(text), 'Again.', first.end);
    expect(first.start).toBe(0);
    expect(second.start).toBe(15);
  });
  it('returns null when the sentence is not on screen', () => {
    expect(alignChunk(screen, 'Nothing like this')).toBeNull();
  });
  it('estimates word length when the engine reports only a start', () => {
    expect(wordLengthAt('Hello, world.', 0)).toBe(5);
    expect(wordLengthAt('Hello, world.', 7)).toBe(5);
  });
});

describe('voices', () => {
  it('labels gender from the platform, or from well-known voice names', () => {
    expect(voiceGender({ name: 'Anything', gender: 'male' })).toBe('male');
    expect(voiceGender({ name: 'Microsoft George - English (United Kingdom)' })).toBe('male');
    expect(voiceGender({ name: 'Microsoft Hazel Desktop' })).toBe('female');
    expect(voiceGender({ name: 'en-gb-x-gbd-local' })).toBe('');
    expect(voiceLabel({ name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB', localService: false })).toMatch(/^Ryan Online \(Natural\) · .* · male · online$/);
  });
});

describe('ink', () => {
  it('cleans strokes from sync files and backups', () => {
    expect(cleanInk(null)).toBeNull();
    expect(cleanInk({ points: [] })).toBeNull();
    const ink = cleanInk({ points: [[1.234, 2.345, 0.77], [NaN, 1], [3, 4], 'x'], color: 'red; behavior:url(x)', width: 999 });
    expect(ink).toEqual({ points: [[1.2, 2.3, 0.77], [3, 4, 0.5]], color: '#1b1b1b', width: 20 });
    const many = cleanInk({ points: Array.from({ length: MAX_POINTS + 50 }, (_, i) => [i, i, 0.5]) });
    expect(many.points).toHaveLength(MAX_POINTS);
  });
  it('sync keeps valid ink annotations and drops broken ones', () => {
    const base = { id: 'i1', filePath: 'f', page: 2, type: 'ink', updatedAt: 1, createdAt: 1 };
    expect(cleanAnnotation({ ...base, ink: { points: [[1, 2, 0.5]], color: '#d32f2f', width: 1.6 } }).ink.color).toBe('#d32f2f');
    expect(cleanAnnotation({ ...base, ink: { points: 'nope' } })).toBeNull();
  });
  it('builds outlines, hit-tests the eraser and pads bounds', () => {
    expect(outlinePath([[10, 10, 0.5]], 2)).toBe('M9,10a1,1 0 1,0 2,0a1,1 0 1,0 -2,0Z');
    expect(outlinePath([[0, 0, 0.5], [10, 0, 0.5], [20, 0, 1]], 2)).toMatch(/^M.*Z$/);
    const ink = { points: [[0, 0], [100, 0]], width: 2 };
    expect(touchesStroke(ink, [50, 2], 2)).toBe(true);
    expect(touchesStroke(ink, [50, 10], 2)).toBe(false);
    expect(inkBounds(ink)[0]).toBeLessThan(0);
    expect(simplify([[0, 0], [0.1, 0], [5, 0]], 1)).toEqual([[0, 0], [5, 0]]);
  });
});

describe('flashcards', () => {
  const now = Date.UTC(2026, 9, 2);
  it('Again comes back in 10 minutes; Good grows the gap; Easy grows it faster', () => {
    const again = schedule(undefined, 1, now);
    expect(again.due - now).toBe(10 * 60_000);
    let card = schedule(undefined, 3, now);
    expect(card.interval).toBe(1);
    card = schedule(card, 3, now); expect(card.interval).toBe(4);
    card = schedule(card, 3, now); expect(card.interval).toBe(10);
    const easy = schedule(schedule(schedule(undefined, 4, now), 4, now), 4, now);
    expect(easy.interval).toBeGreaterThan(card.interval);
    const lapsed = schedule(card, 1, now);
    expect(lapsed).toMatchObject({ reps: 0, lapses: 1 });
    expect(lapsed.ease).toBeLessThan(card.ease);
  });
  it('cards are notes with a passage and a note; due first, then new', () => {
    const library = [{ id: 'd' }];
    const notes = cardNotes([
      { id: 'a', filePath: 'd', type: 'hl-yellow', quote: 'Q1', note: 'A1', createdAt: 1 },
      { id: 'b', filePath: 'd', type: 'hl-yellow', quote: 'Q2', note: '', createdAt: 2 },
      { id: 'c', filePath: 'd', type: 'ink', quote: 'x', note: 'y' },
      { id: 'e', filePath: 'gone', type: 'note', quote: 'Q', note: 'A' },
      { id: 'f', filePath: 'd', type: 'note', quote: 'Q3', note: 'A3', createdAt: 0 },
    ], library);
    expect(notes.map(n => n.id)).toEqual(['a', 'f']);
    const cards = { a: { due: now - 1 } };
    expect(dueCards(notes, cards, { now }).map(n => n.id)).toEqual(['a', 'f']);
    expect(reviewCounts(notes, { a: { due: now + DAY } }, now)).toEqual({ due: 0, fresh: 1, later: 1, total: 2 });
    expect(describeGap(10 * 60_000)).toBe('10 min');
    expect(describeGap(4 * DAY)).toBe('4 days');
    expect(cleanCards({ x: { reps: -3, ease: 99, interval: 'x', due: 5 } }).x).toMatchObject({ reps: 0, ease: 5, interval: 0, due: 5 });
  });
});

describe('reading statistics', () => {
  const now = new Date(2026, 9, 2, 20, 0).getTime();
  it('logs time and pages per day and keeps a streak', () => {
    let log = {};
    for (let i = 0; i < 3; i++) log = addToLog(log, { day: dayKey(now - i * DAY), ms: 5 * 60_000, pages: 2 });
    log = addToLog(log, { day: dayKey(now - 5 * DAY), ms: 10 * 60_000 });
    expect(streak(log, now)).toBe(3);
    expect(totals(log)).toEqual({ ms: 25 * 60_000, pages: 6, days: 4 });
    expect(lastDays(log, 7, now).map(d => d.ms / 60_000)).toEqual([0, 10, 0, 0, 5, 5, 5]);
    expect(formatMinutes(125 * 60_000)).toBe('2 h 05 min');
  });
  it("yesterday's streak still counts before reading today", () => {
    const log = addToLog({}, { day: dayKey(now - DAY), ms: 120_000 });
    expect(streak(log, now)).toBe(1);
  });
  it('cleans and merges logs from backups without double counting', () => {
    expect(cleanLog({ '2026-10-02': { ms: 9e12, pages: -1 }, bad: {} })).toEqual({ '2026-10-02': { ms: 86_400_000, pages: 0 } });
    expect(mergeLogs({ '2026-10-02': { ms: 5, pages: 1 } }, { '2026-10-02': { ms: 3, pages: 4 } })).toEqual({ '2026-10-02': { ms: 5, pages: 4 } });
  });
});

describe('library search', () => {
  it('ignores case and accents', () => {
    expect(fold('Café ÉTÉ')).toBe('cafe ete');
  });
  it('finds matches with snippets, best documents first, never protected ones', async () => {
    await saveTextIndex('a'.repeat(64), { v: 1, pages: ['nothing here', 'The café opens early. The CAFE closes late.'] });
    await saveTextIndex('b'.repeat(64), { v: 1, pages: ['one cafe'] });
    await saveTextIndex('c'.repeat(64), { v: 1, pages: ['secret cafe'] });
    const library = [{ id: 'b'.repeat(64), name: 'B' }, { id: 'a'.repeat(64), name: 'A' }, { id: 'c'.repeat(64), name: 'C', protected: true }];
    const results = await searchLibrary('cafe', library);
    expect(results.map(r => [r.doc.name, r.count])).toEqual([['A', 2], ['B', 1]]);
    expect(results[0].hits[0]).toMatchObject({ page: 2, match: 'café' });
    expect(results[0].hits[1].match).toBe('CAFE');
    expect(await searchLibrary('c', library)).toEqual([]);
  });
});

describe('app lock encryption', () => {
  beforeEach(() => { localStorage.clear(); vault.forgetKey(); });

  it('wraps a data key with the passphrase and only that passphrase unwraps it', async () => {
    const info = await vault.createLock('long enough phrase', 5);
    expect(info).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256', iterations: 600_000 });
    expect(JSON.stringify(info)).not.toContain('long enough phrase');
    vault.saveLockInfo(info); vault.forgetKey();
    expect(await vault.unlock('wrong phrase here')).toBe(false);
    expect(vault.isUnlocked()).toBe(false);
    expect(await vault.unlock('long enough phrase')).toBe(true);
    await vault.changePassphrase('long enough phrase', 'a different phrase');
    vault.forgetKey();
    expect(await vault.unlock('long enough phrase')).toBe(false);
    expect(await vault.unlock('a different phrase')).toBe(true);
    await expect(vault.createLock('short')).rejects.toThrow('at least 8');
  }, 30_000);

  it('seals records with fresh IVs and refuses to open them without the key', async () => {
    vault.saveLockInfo(await vault.createLock('long enough phrase', 5));
    const a = await vault.seal({ note: 'secret' }), b = await vault.seal({ note: 'secret' });
    expect(vault.isSealed(a)).toBe(true);
    expect(a.iv).not.toEqual(b.iv);
    expect(await vault.unseal(a)).toEqual({ note: 'secret' });
    const text = await vault.sealText('{"state":{"notes":"secret"}}');
    expect(text).not.toContain('secret');
    expect(await vault.unsealText(text)).toBe('{"state":{"notes":"secret"}}');
    a.data = new Uint8Array(a.data).map((x, i) => (i === 0 ? x ^ 1 : x)).buffer; // tamper
    await expect(vault.unseal(a)).rejects.toThrow();
    vault.forgetKey();
    await expect(vault.unseal(b)).rejects.toThrow('locked');
  }, 30_000);

  it('turning the lock on seals stored documents and snapshots; turning it off opens them', async () => {
    await savePdfData('d'.repeat(64), new TextEncoder().encode('%PDF secret'));
    await saveSnapshot('test', { annotations: [{ id: 'x', note: 'secret' }] });
    vault.saveLockInfo(await vault.createLock('long enough phrase', 5));
    await resealAll(true);
    const raw = await new Promise(resolve => { const o = indexedDB.open('nightreader'); o.onsuccess = () => { const r = o.result.transaction('pdf_files').objectStore('pdf_files').get('d'.repeat(64)); r.onsuccess = () => resolve(r.result); }; });
    expect(vault.isSealed(raw)).toBe(true);
    expect(new TextDecoder().decode(await loadPdfData('d'.repeat(64)))).toBe('%PDF secret');
    expect((await listSnapshots())[0].annotations[0].note).toBe('secret');
    await resealAll(false); vault.removeLock();
    expect(new TextDecoder().decode(await loadPdfData('d'.repeat(64)))).toBe('%PDF secret');
  }, 30_000);

  it('saved state is never written while locked, and is sealed while unlocked', async () => {
    await useStore.persist.rehydrate();
    localStorage.setItem('nightreader-settings', 'previous');
    vault.saveLockInfo(await vault.createLock('long enough phrase', 5));
    vault.forgetKey();
    useStore.setState({ readingMode: 'sepia' });
    expect(localStorage.getItem('nightreader-settings')).toBe('previous');
    await vault.unlock('long enough phrase');
    useStore.setState({ readingMode: 'light' });
    await new Promise(r => setTimeout(r, 50));
    const stored = localStorage.getItem('nightreader-settings');
    expect(stored).toContain('"nrEnc":1');
    expect(JSON.parse(await vault.unsealText(stored)).state.readingMode).toBe('light');
  }, 30_000);

  it('handles large saved state, never writes plaintext while locked, and keeps an unfinished marker', async () => {
    vault.saveLockInfo({ ...(await vault.createLock('long enough phrase', 5)), pending: true });
    const big = JSON.stringify({ notes: 'x'.repeat(400_000) });
    expect(await vault.unsealText(await vault.sealText(big))).toBe(big);
    await vault.changePassphrase('long enough phrase', 'another long phrase');
    expect(vault.lockInfo().pending).toBe(true);
    vault.setPending(false);
    expect(vault.lockInfo().pending).toBeUndefined();
    vault.forgetKey();
    await expect(vault.seal({ note: 'secret' })).rejects.toThrow('locked');
  }, 30_000);

  it('password-protected backups round-trip and reject a wrong password', async () => {
    const data = new TextEncoder().encode('zip bytes');
    const sealed = await vault.encryptBackup(data, 'backup password');
    expect(vault.isEncryptedBackup(sealed)).toBe(true);
    expect(new TextDecoder().decode(await vault.decryptBackup(sealed, 'backup password'))).toBe('zip bytes');
    await expect(vault.decryptBackup(sealed, 'nope nope nope')).rejects.toThrow('Wrong password');
    await expect(vault.decryptBackup(sealed.slice(0, 20), 'backup password')).rejects.toThrow('damaged');
  }, 30_000);
});
