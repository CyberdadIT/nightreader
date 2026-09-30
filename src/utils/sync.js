// Folder sync: reading positions, highlights and notes are merged through a JSON
// file in a folder the user chooses (for example OneDrive). Document files are not
// copied; a document is matched on each device by its content, so the same PDF or
// EPUB picks up its notes wherever it's imported.

export const SYNC_FORMAT = 'nightreader-sync';
export const SYNC_VERSION = 1;
const TOMBSTONE_DAYS = 180, MAX_TOMBSTONES = 2000;
const TYPES = new Set(['hl-yellow', 'hl-blue', 'hl-pink', 'hl-green', 'underline', 'strikethrough', 'note']);

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = v => (Number.isFinite(v) ? v : 0);

/** Accept only well-formed annotations from the shared file; drop anything else. */
export function cleanAnnotation(a) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || typeof a.filePath !== 'string' || !TYPES.has(a.type)) return null;
  const page = Math.floor(num(a.page));
  if (page < 1) return null;
  const rects = Array.isArray(a.pdfRects)
    ? a.pdfRects.filter(r => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite)).slice(0, 500) : undefined;
  return {
    id: a.id.slice(0, 64), filePath: a.filePath.slice(0, 128), page, type: a.type,
    quote: str(a.quote, 20000), note: str(a.note, 50000),
    tags: Array.isArray(a.tags) ? a.tags.filter(t => typeof t === 'string').map(t => t.slice(0, 60)).slice(0, 20) : [],
    ...(Number.isFinite(a.start) ? { start: a.start } : {}), ...(Number.isFinite(a.end) ? { end: a.end } : {}),
    ...(rects?.length ? { pdfRects: rects } : {}),
    createdAt: num(a.createdAt), updatedAt: num(a.updatedAt),
  };
}

/** Parse a sync file. Throws on anything that isn't ours, so it is never overwritten by mistake. */
export function parseSyncFile(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('The sync file is damaged or not a NightReader file. It was left unchanged.'); }
  if (data?.format !== SYNC_FORMAT) throw new Error('The sync file is not a NightReader file. It was left unchanged.');
  if (data.version > SYNC_VERSION) throw new Error('The sync file was written by a newer NightReader. Update this device to keep syncing.');
  return {
    documents: data.documents && typeof data.documents === 'object' ? data.documents : {},
    annotations: (Array.isArray(data.annotations) ? data.annotations : []).map(cleanAnnotation).filter(Boolean),
    deletedAnnotations: (Array.isArray(data.deletedAnnotations) ? data.deletedAnnotations : [])
      .filter(d => typeof d?.id === 'string' && Number.isFinite(d.at)).map(d => ({ id: d.id.slice(0, 64), at: d.at })),
    collections: (Array.isArray(data.collections) ? data.collections : []).filter(c => typeof c === 'string').map(c => c.slice(0, 80)),
  };
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
  const r = remote || { documents: {}, annotations: [], deletedAnnotations: [], collections: [] };
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
    library, annotations, deletedAnnotations: tombstones,
    collections: [...new Set([...local.collections, ...r.collections])],
    file: { format: SYNC_FORMAT, version: SYNC_VERSION, documents, annotations, deletedAnnotations: tombstones,
      collections: [...new Set([...local.collections, ...r.collections])] },
  };
}

/** Stable text for comparing and writing (updatedAt excluded so unchanged data isn't rewritten). */
export const syncFileText = file => JSON.stringify(file, null, 1);
