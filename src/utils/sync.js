import { cleanInk } from './ink.js';
// Folder sync: reading positions, highlights and notes are merged through a JSON
// file in a folder the user chooses (for example OneDrive). Document files are not
// copied; a document is matched on each device by its content, so the same PDF or
// EPUB picks up its notes wherever it's imported.

export const SYNC_FORMAT = 'nightreader-sync';
export const SYNC_VERSION = 1;
const TOMBSTONE_DAYS = 180, MAX_TOMBSTONES = 2000;
// A shared file can't claim to come from the future: anything later than now (plus
// a little clock skew) counts as "now", so edits made here afterwards still win.
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const notFuture = (t, now) => (Number.isFinite(t) && t > 0 ? Math.min(t, now) : 0);
/** Removing this many notes in one sync waits for the user to confirm. */
export const CONFIRM_REMOVALS = 5;
const TYPES = new Set(['hl-yellow', 'hl-blue', 'hl-pink', 'hl-green', 'underline', 'strikethrough', 'note', 'ink']);

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = v => (Number.isFinite(v) ? v : 0);

/** Accept only well-formed annotations from the shared file; drop anything else. */
export function cleanAnnotation(a, now = Date.now() + CLOCK_SKEW_MS) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || typeof a.filePath !== 'string' || !TYPES.has(a.type)) return null;
  const page = Math.floor(num(a.page));
  if (page < 1) return null;
  if (a.type === 'ink' && !cleanInk(a.ink)) return null;
  const rects = Array.isArray(a.pdfRects)
    ? a.pdfRects.filter(r => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite)).slice(0, 500) : undefined;
  return {
    id: a.id.slice(0, 64), filePath: a.filePath.slice(0, 128), page, type: a.type,
    quote: str(a.quote, 20000), note: str(a.note, 50000),
    tags: Array.isArray(a.tags) ? a.tags.filter(t => typeof t === 'string').map(t => t.slice(0, 60)).slice(0, 20) : [],
    ...(Number.isFinite(a.start) ? { start: a.start } : {}), ...(Number.isFinite(a.end) ? { end: a.end } : {}),
    ...(rects?.length ? { pdfRects: rects } : {}),
    ...(a.type === 'ink' ? { ink: cleanInk(a.ink) } : {}),
    createdAt: notFuture(a.createdAt, now), updatedAt: notFuture(a.updatedAt, now),
  };
}

/** Parse a sync file. Throws on anything that isn't ours, so it is never overwritten by mistake. */
export function parseSyncFile(text, now = Date.now()) {
  const limit = now + CLOCK_SKEW_MS;
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('The sync file is damaged or not a NightReader file. It was left unchanged.'); }
  if (data?.format !== SYNC_FORMAT) throw new Error('The sync file is not a NightReader file. It was left unchanged.');
  if (data.version > SYNC_VERSION) throw new Error('The sync file was written by a newer NightReader. Update this device to keep syncing.');
  return {
    annotations: (Array.isArray(data.annotations) ? data.annotations : []).map(a => cleanAnnotation(a, limit)).filter(Boolean),
    deletedAnnotations: (Array.isArray(data.deletedAnnotations) ? data.deletedAnnotations : [])
      .filter(d => typeof d?.id === 'string' && Number.isFinite(d.at)).map(d => ({ id: d.id.slice(0, 64), at: notFuture(d.at, limit) })),
    documents: Object.fromEntries(Object.entries(data.documents && typeof data.documents === 'object' ? data.documents : {})
      .map(([id, d]) => [id, { ...(d && typeof d === 'object' ? d : {}), pageUpdatedAt: notFuture(d?.pageUpdatedAt, limit) }])),
    bookmarks: (Array.isArray(data.bookmarks) ? data.bookmarks : []).map(b => cleanBookmark(b, limit)).filter(Boolean),
    collections: (Array.isArray(data.collections) ? data.collections : []).filter(c => typeof c === 'string').map(c => c.slice(0, 80)),
  };
}

/** Bookmarks sync too: one per page per document. */
export function cleanBookmark(b, now = Date.now() + CLOCK_SKEW_MS) {
  if (!b || typeof b !== 'object' || typeof b.id !== 'string' || typeof b.filePath !== 'string') return null;
  const page = Math.floor(num(b.page));
  if (page < 1) return null;
  return { id: b.id.slice(0, 64), filePath: b.filePath.slice(0, 128), page, title: str(b.title, 300), updatedAt: notFuture(b.updatedAt, now), deleted: !!b.deleted };
}

const docRecord = d => ({
  name: str(d.name, 300), kind: d.kind === 'epub' ? 'epub' : 'pdf',
  lastPage: Math.max(1, Math.floor(num(d.lastPage)) || 1), pageUpdatedAt: num(d.pageUpdatedAt), collection: str(d.collection, 80),
});

/**
 * Merge this device's state with the sync file. Newest edit wins for each note and
 * each reading position; a deletion wins over any edit made before it.
 */
export function mergeSync(local, remote, now = Date.now()) {
  const r = { documents: {}, annotations: [], deletedAnnotations: [], collections: [], bookmarks: [], ...remote };
  // Deletions from both sides, forgotten after six months.
  const deleted = new Map();
  for (const d of [...local.deletedAnnotations, ...r.deletedAnnotations]) {
    if (now - d.at < TOMBSTONE_DAYS * 864e5 && (deleted.get(d.id) || 0) < d.at) deleted.set(d.id, d.at);
  }
  const notes = new Map();
  for (const a of [...local.annotations, ...r.annotations]) {
    const current = notes.get(a.id);
    if (!current || (a.updatedAt || 0) > (current.updatedAt || 0)) notes.set(a.id, a);
  }
  const annotations = [...notes.values()].filter(a => !(deleted.get(a.id) >= (a.updatedAt || 0)));
  const kept = new Set(annotations.map(a => a.id));
  const removed = local.annotations.filter(a => !kept.has(a.id));
  // Bookmarks: newest record per document page wins; a removal is a record with deleted: true.
  const marks = new Map();
  for (const b of [...(local.bookmarks || []), ...r.bookmarks]) {
    const key = `${b.filePath}:${b.page}`, current = marks.get(key);
    if (!current || (b.updatedAt || 0) > (current.updatedAt || 0)) marks.set(key, b);
  }
  const bookmarks = [...marks.values()];
  // Notes on password-protected PDFs quote their text, so they stay on this device.
  const protectedDocs = new Set(local.library.filter(d => d.protected).map(d => d.id));

  const documents = {};
  for (const [id, d] of Object.entries(r.documents)) if (typeof id === 'string' && id.length <= 128) documents[id] = docRecord(d || {});
  const library = local.library.map(doc => {
    const theirs = documents[doc.id];
    const newer = theirs && theirs.pageUpdatedAt > (doc.pageUpdatedAt || 0);
    const merged = newer ? { ...doc, lastPage: theirs.lastPage, pageUpdatedAt: theirs.pageUpdatedAt } : doc;
    if (!merged.collection && theirs?.collection) merged.collection = theirs.collection;
    documents[doc.id] = docRecord(merged);
    return merged;
  });
  const tombstones = [...deleted].map(([id, at]) => ({ id, at })).sort((a, b) => a.at - b.at).slice(-MAX_TOMBSTONES);
  return {
    library, annotations, deletedAnnotations: tombstones, bookmarks, removed,
    collections: [...new Set([...local.collections, ...r.collections])],
    file: { format: SYNC_FORMAT, version: SYNC_VERSION, documents,
      annotations: annotations.filter(a => !protectedDocs.has(a.filePath)), deletedAnnotations: tombstones,
      bookmarks: bookmarks.filter(b => !protectedDocs.has(b.filePath)),
      collections: [...new Set([...local.collections, ...r.collections])] },
  };
}

/** Stable text for comparing and writing (updatedAt excluded so unchanged data isn't rewritten). */
export const syncFileText = file => JSON.stringify(file, null, 1);
