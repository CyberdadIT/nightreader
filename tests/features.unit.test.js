import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { useStore } from '../src/store/useStore.js';
import { compareVersions, checkForUpdate, updateCheckDue } from '../src/utils/updates.js';
import { inTimeWindow, effectiveWarmth, warmLayerColor } from '../src/utils/nightlight.js';
import { timeLeft, formatDuration, paceFor, pdfPageSample, epubWpmSample, blendPace } from '../src/utils/pace.js';
import { candidates, define, isSingleWord } from '../src/utils/dictionary.js';
import { filterNotes, ankiFlashcards, parseTags, allTags } from '../src/utils/notes.js';
import { mergeSync, parseSyncFile, cleanAnnotation, syncFileText } from '../src/utils/sync.js';
import { annotatePdf } from '../src/utils/annotatedPdf.js';

const at = (h, m = 0) => new Date(2026, 8, 30, h, m);
const json = body => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

describe('Update check', () => {
  it('compares versions numerically, ignoring a leading v and pre-release tags', () => {
    expect(compareVersions('v0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.6.0', 'v0.6.0')).toBe(0);
    expect(compareVersions('0.6.0-beta.1', '0.6.0')).toBe(0);
    expect(compareVersions('0.5.9', '0.6')).toBe(-1);
  });
  it('reports an available release, the current one, or none published', async () => {
    const release = { tag_name: 'v0.7.0', html_url: 'https://github.com/CyberdadIT/nightreader/releases/tag/v0.7.0' };
    expect(await checkForUpdate('0.6.0', () => json(release))).toMatchObject({ status: 'available', version: '0.7.0', url: release.html_url });
    expect((await checkForUpdate('0.7.0', () => json(release))).status).toBe('current');
    expect((await checkForUpdate('0.6.0', () => Promise.resolve({ ok: false, status: 404 }))).status).toBe('none');
    await expect(checkForUpdate('0.6.0', () => Promise.resolve({ ok: false, status: 403 }))).rejects.toThrow('403');
  });
  it('checks automatically at most once a day', () => {
    expect(updateCheckDue(0)).toBe(true);
    expect(updateCheckDue(Date.now() - 3600e3)).toBe(false);
    expect(updateCheckDue(Date.now() - 25 * 3600e3)).toBe(true);
  });
});

describe('Warm light', () => {
  it('handles schedules that run past midnight', () => {
    expect(inTimeWindow(at(22), '21:00', '07:00')).toBe(true);
    expect(inTimeWindow(at(6, 59), '21:00', '07:00')).toBe(true);
    expect(inTimeWindow(at(7), '21:00', '07:00')).toBe(false);
    expect(inTimeWindow(at(13), '09:00', '17:00')).toBe(true);
    expect(inTimeWindow(at(13), '10:00', '10:00')).toBe(false);
  });
  it('applies warmth always, or only inside the schedule', () => {
    expect(effectiveWarmth(60, { enabled: false }, at(12))).toBe(60);
    expect(effectiveWarmth(60, { enabled: true, start: '21:00', end: '07:00' }, at(12))).toBe(0);
    expect(effectiveWarmth(60, { enabled: true, start: '21:00', end: '07:00' }, at(23))).toBe(60);
    expect(warmLayerColor(0)).toBe('rgb(255, 255, 255)');
    expect(warmLayerColor(100)).toBe('rgb(255, 170, 90)');
  });
});

describe('Reading pace and time left', () => {
  it('ignores glances and breaks, and smooths samples', () => {
    expect(pdfPageSample(2)).toBeNull(); expect(pdfPageSample(1200)).toBeNull(); expect(pdfPageSample(45)).toBe(45);
    expect(epubWpmSample(1000, 10)).toBeNull(); expect(epubWpmSample(2300, 600)).toBe(230);
    expect(blendPace(undefined, 50)).toBe(50); expect(blendPace(100, 50)).toBe(85);
  });
  it('estimates time left for PDFs and EPUBs', () => {
    expect(timeLeft({ kind: 'pdf', page: 10, total: 20, secondsPerPage: 60 }).book).toBe(630);
    const epub = timeLeft({ kind: 'epub', page: 2, total: 3, wpm: 200, chapterWords: [1000, 2000, 4000] });
    expect(epub.chapter).toBe(600); expect(epub.book).toBe(1800);
    expect(formatDuration(20)).toBe('under a minute'); expect(formatDuration(600)).toBe('10 min'); expect(formatDuration(3900)).toBe('1 h 5 min');
  });
  it('falls back to the pace from other documents', () => {
    const pace = { a: { secondsPerPage: 40 }, b: { secondsPerPage: 80 } };
    expect(paceFor(pace, 'a', 'secondsPerPage', 60)).toBe(40);
    expect(paceFor(pace, 'c', 'secondsPerPage', 60)).toBe(60);
    expect(paceFor({}, 'c', 'secondsPerPage', 60)).toBe(60);
  });
});

describe('Offline dictionary', () => {
  const files = letter => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(readFileSync(`public/dictionary/${letter}.json`, 'utf8'))) });
  const fetchLocal = url => files(url.match(/dictionary\/(.+)\.json$/)[1]);
  it('finds base forms for regular and irregular words', () => {
    expect(candidates('Running')).toContain('run');
    expect(candidates('stopped')).toContain('stop');
    expect(candidates('went')).toContain('go');
    expect(candidates('studies')).toContain('study');
    expect(candidates('children')).toContain('child');
    expect(candidates('“security,”')[0]).toBe('security');
  });
  it('looks words up in the bundled WordNet data', async () => {
    const dog = await define('dogs', fetchLocal);
    expect(dog.lemma).toBe('dog');
    expect(dog.senses[0]).toMatchObject({ pos: 'noun' });
    expect(dog.senses[0].definition).toMatch(/Canis/);
    expect((await define('went', fetchLocal)).lemma).toBe('go');
    expect(await define('constructor', fetchLocal)).not.toBeNull();
    expect(await define('qzxvbnm', fetchLocal)).toBeNull();
  });
  it('offers lookup only for single words', () => {
    expect(isSingleWord('security')).toBe(true); expect(isSingleWord("don't")).toBe(true);
    expect(isSingleWord('two words')).toBe(false); expect(isSingleWord('42')).toBe(false);
  });
});

describe('Notes across the library and flashcards', () => {
  const library = [{ id: 'd1', name: 'OT Security.pdf', kind: 'pdf', openedAt: 2 }, { id: 'd2', name: 'Novel.epub', kind: 'epub', openedAt: 1 }];
  const notes = [
    { id: 'n1', filePath: 'd1', page: 4, type: 'hl-yellow', quote: 'Purdue model levels', note: 'Level 3.5 is the DMZ', tags: ['exam'] },
    { id: 'n2', filePath: 'd1', page: 2, type: 'underline', quote: 'IEC 62443 zones', note: '', tags: ['exam', 'standards'] },
    { id: 'n3', filePath: 'd2', page: 1, type: 'note', quote: 'It was a dark\tnight', note: 'Opening <line>', tags: [] },
    { id: 'n4', filePath: 'gone', page: 1, type: 'note', quote: 'orphan', note: '' },
  ];
  it('searches, filters and orders notes from every document', () => {
    expect(filterNotes(notes, library).map(n => n.id)).toEqual(['n2', 'n1', 'n3']);
    expect(filterNotes(notes, library, { query: 'dmz' }).map(n => n.id)).toEqual(['n1']);
    expect(filterNotes(notes, library, { type: 'underline' }).map(n => n.id)).toEqual(['n2']);
    expect(filterNotes(notes, library, { tag: 'exam' }).map(n => n.id)).toEqual(['n2', 'n1']);
    expect(filterNotes(notes, library, { query: 'novel' }).map(n => n.id)).toEqual(['n3']);
    expect(allTags(notes)).toEqual(['exam', 'standards']);
    expect(parseTags(' exam, OT security ,exam,, ')).toEqual(['exam', 'OT security']);
  });
  it('writes an Anki import file with escaped fields and tags', () => {
    const text = ankiFlashcards(filterNotes(notes, library));
    const lines = text.trim().split('\n');
    expect(lines.slice(0, 3)).toEqual(['#separator:tab', '#html:true', '#tags column:3']);
    expect(lines).toHaveLength(6);
    for (const line of lines.slice(3)) expect(line.split('\t')).toHaveLength(3);
    expect(text).toContain('Opening &lt;line&gt;');
    expect(text).toContain('Novel.epub, chapter 1');
    expect(lines[3].split('\t')[2]).toBe('nightreader OT_Security exam standards');
  });
});

describe('Folder sync', () => {
  const doc = (id, lastPage, pageUpdatedAt) => ({ id, name: `${id}.pdf`, kind: 'pdf', lastPage, pageUpdatedAt, collection: '' });
  const note = (id, updatedAt, extra = {}) => ({ id, filePath: 'd1', page: 1, type: 'hl-yellow', quote: 'q', note: '', tags: [], updatedAt, ...extra });
  const local = extra => ({ library: [doc('d1', 5, 100)], annotations: [], deletedAnnotations: [], collections: [], ...extra });

  it('keeps the newest reading position and newest version of each note', () => {
    const remote = parseSyncFile(syncFileText({ format: 'nightreader-sync', version: 1,
      documents: { d1: { name: 'd1.pdf', lastPage: 9, pageUpdatedAt: 200 }, d9: { name: 'phone-only.pdf', lastPage: 3, pageUpdatedAt: 50 } },
      annotations: [note('a', 300, { note: 'from phone' }), note('b', 10)], deletedAnnotations: [], collections: ['Exams'] }));
    const merged = mergeSync(local({ annotations: [note('a', 200, { note: 'from PC' }), note('c', 5)] }), remote);
    expect(merged.library[0].lastPage).toBe(9);
    expect(merged.annotations.find(a => a.id === 'a').note).toBe('from phone');
    expect(merged.annotations.map(a => a.id).sort()).toEqual(['a', 'b', 'c']);
    expect(merged.collections).toEqual(['Exams']);
    expect(merged.file.documents.d9.name).toBe('phone-only.pdf');
  });
  it('lets a deletion win over older edits but not newer ones', () => {
    const merged = mergeSync(local({ annotations: [note('old', 100), note('edited', 900)] }),
      { documents: {}, annotations: [], collections: [], deletedAnnotations: [{ id: 'old', at: 500 }, { id: 'edited', at: 500 }] }, 1000);
    expect(merged.annotations.map(a => a.id)).toEqual(['edited']);
    expect(merged.deletedAnnotations.map(d => d.id).sort()).toEqual(['edited', 'old']);
  });
  it('refuses files that are not NightReader sync files, so they are never overwritten', () => {
    expect(() => parseSyncFile('not json')).toThrow('left unchanged');
    expect(() => parseSyncFile('{"hello":1}')).toThrow('not a NightReader file');
    expect(() => parseSyncFile('{"format":"nightreader-sync","version":99}')).toThrow('newer NightReader');
  });
  it('drops malformed or oversized annotations from the shared file', () => {
    expect(cleanAnnotation({ id: 'x', filePath: 'd1', page: 1, type: 'script' })).toBeNull();
    expect(cleanAnnotation({ id: 'x', filePath: 'd1', page: 0, type: 'note' })).toBeNull();
    const cleaned = cleanAnnotation({ id: 'x', filePath: 'd1', page: 2, type: 'note', quote: 'a'.repeat(30000), pdfRects: [[1, 2, 3, 4], ['bad'], [1, 2]], tags: ['ok', 5], evil: '<img>' });
    expect(cleaned.quote).toHaveLength(20000);
    expect(cleaned.pdfRects).toEqual([[1, 2, 3, 4]]);
    expect(cleaned.tags).toEqual(['ok']);
    expect(cleaned).not.toHaveProperty('evil');
  });
  it('writes the same text when nothing changed, so the file is not rewritten', () => {
    const first = mergeSync(local({ annotations: [note('a', 1)] }), null);
    const again = mergeSync(local({ annotations: [note('a', 1)] }), parseSyncFile(syncFileText(first.file)));
    expect(syncFileText(again.file)).toBe(syncFileText(first.file));
  });
});

describe('Store changes for sync and tags', () => {
  beforeEach(() => useStore.setState({ annotations: [], deletedAnnotations: [] }));
  it('timestamps notes and remembers deletions', () => {
    useStore.getState().addAnnotation({ filePath: 'd1', page: 1, type: 'note', quote: 'q' });
    const [a] = useStore.getState().annotations;
    expect(a.updatedAt).toBeGreaterThan(0); expect(a.tags).toEqual([]);
    useStore.getState().updateAnnotation(a.id, { tags: ['exam'] });
    expect(useStore.getState().annotations[0].tags).toEqual(['exam']);
    useStore.getState().removeAnnotation(a.id);
    expect(useStore.getState().deletedAnnotations[0].id).toBe(a.id);
  });
});

describe('Annotated PDF copy', () => {
  it('writes highlight, underline and strike-out annotations with appearances and skips notes without positions', async () => {
    const { PDFDocument, PDFName } = await import('pdf-lib');
    const bytes = readFileSync('tests/fixtures/reading.pdf');
    const { bytes: out, written, skipped } = await annotatePdf(bytes, [
      { id: '1', page: 1, type: 'hl-yellow', note: 'Key idea', pdfRects: [[72, 720, 300, 705]] },
      { id: '2', page: 2, type: 'underline', pdfRects: [[72, 720, 200, 706]] },
      { id: '3', page: 2, type: 'strikethrough', pdfRects: [[72, 690, 200, 676]] },
      { id: '4', page: 1, type: 'note', quote: 'legacy note' },
    ]);
    expect(written).toBe(3); expect(skipped).toBe(1);
    const doc = await PDFDocument.load(out);
    const subtypes = doc.getPages().flatMap(p => (p.node.Annots()?.asArray() || []).map(ref => doc.context.lookup(ref)))
      .map(a => [a.get(PDFName.of('Subtype')).toString(), !!a.get(PDFName.of('AP'))]);
    expect(subtypes).toEqual([['/Highlight', true], ['/Underline', true], ['/StrikeOut', true]]);
  });
  it('explains that encrypted PDFs cannot be annotated in a copy', async () => {
    await expect(annotatePdf(readFileSync('tests/fixtures/protected.pdf'), [])).rejects.toThrow('encrypted');
  });
});
