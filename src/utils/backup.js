// One-file backup and restore of the library, notes, bookmarks and settings.
// The backup is a .zip: backup.json, plus documents/<id>.<pdf|epub> when the user
// includes documents. A restore never deletes anything on this device: it adds
// what's missing and keeps the newer copy of anything that exists in both.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { useStore } from '../store/useStore.js';
import { cleanAnnotation, cleanBookmark } from './sync.js';
import { cleanCards } from './flashcards.js';
import { cleanLog, mergeLogs } from './stats.js';
import { loadPdfData, savePdfData, documentId, saveSnapshot } from './storage.js';

export const BACKUP_FORMAT = 'nightreader-backup';
const SETTINGS = ['readingMode', 'font', 'fontSize', 'lineHeight', 'margin', 'brightness', 'warmth', 'warmSchedule', 'speechRate', 'speechVoice', 'speechContinuous', 'publisherStyles', 'ocrLanguage'];
const MAX_ENTRY = 300 * 1024 * 1024, MAX_TOTAL = 4 * 1024 * 1024 * 1024, MAX_JSON = 50 * 1024 * 1024;

/** Build the backup zip. Returns { bytes, documents: count, missing: count }. */
export async function makeBackup({ includeDocuments = false } = {}) {
  const s = useStore.getState();
  const data = {
    format: BACKUP_FORMAT, version: 1, createdAt: new Date().toISOString(),
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
    library: s.library.map(({ needsFile, ...d }) => d), collections: s.collections,
    annotations: s.annotations, deletedAnnotations: s.deletedAnnotations, bookmarks: s.bookmarks,
    readingPace: s.readingPace, cards: s.cards, readingLog: s.readingLog, docStats: s.docStats, settings: Object.fromEntries(SETTINGS.map(k => [k, s[k]])),
  };
  const files = { 'backup.json': strToU8(JSON.stringify(data)) };
  let documents = 0, missing = 0;
  if (includeDocuments) {
    for (const doc of s.library) {
      const bytes = await loadPdfData(doc.id).catch(() => null);
      if (!bytes) { missing++; continue; }
      files[`documents/${doc.id}.${doc.kind === 'epub' ? 'epub' : 'pdf'}`] = [new Uint8Array(bytes), { level: 0 }]; // already compressed formats
      documents++;
    }
  }
  return { bytes: zipSync(files, { level: 6 }), documents, missing };
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
function cleanDocument(d) {
  if (!d || typeof d.id !== 'string' || !/^[0-9a-f]{64}$/.test(d.id)) return null;
  return { id: d.id, name: str(d.name, 300) || 'Document', kind: d.kind === 'epub' ? 'epub' : 'pdf', collection: str(d.collection, 80),
    lastPage: Math.max(1, Math.floor(Number(d.lastPage) || 1)), pageUpdatedAt: Math.min(Number(d.pageUpdatedAt) || 0, Date.now()),
    size: Number(d.size) || undefined, protected: !!d.protected, openedAt: Math.min(Number(d.openedAt) || 0, Date.now()) };
}

/** Read and check a backup file. Throws a plain-English error for anything that isn't one. */
export function readBackup(bytes) {
  let total = 0, files;
  try {
    files = unzipSync(new Uint8Array(bytes), { filter(entry) {
      total += entry.originalSize;
      if (entry.originalSize > MAX_ENTRY || total > MAX_TOTAL) throw new Error('too large');
      return entry.name === 'backup.json' || /^documents\/[0-9a-f]{64}\.(pdf|epub)$/.test(entry.name);
    } });
  } catch (e) {
    throw new Error(e.message === 'too large' ? 'This backup is too large to restore safely.' : 'This file isn\'t a NightReader backup.');
  }
  const json = files['backup.json'];
  if (!json || json.length > MAX_JSON) throw new Error('This file isn\'t a NightReader backup.');
  let data;
  try { data = JSON.parse(strFromU8(json)); } catch { throw new Error('This backup is damaged.'); }
  if (data?.format !== BACKUP_FORMAT) throw new Error('This file isn\'t a NightReader backup.');
  if (data.version > 1) throw new Error('This backup was made by a newer NightReader. Update this app to restore it.');
  const documents = Object.entries(files).filter(([name]) => name.startsWith('documents/'))
    .map(([name, data]) => ({ id: name.slice(10, 74), kind: name.endsWith('.epub') ? 'epub' : 'pdf', data }));
  const arr = v => (Array.isArray(v) ? v : []);
  return {
    createdAt: str(data.createdAt, 40),
    library: arr(data.library).map(cleanDocument).filter(Boolean),
    collections: arr(data.collections).filter(c => typeof c === 'string').map(c => c.slice(0, 80)),
    annotations: arr(data.annotations).map(a => cleanAnnotation(a)).filter(Boolean),
    bookmarks: arr(data.bookmarks).map(b => cleanBookmark(b)).filter(Boolean),
    readingPace: data.readingPace && typeof data.readingPace === 'object' ? data.readingPace : {},
    cards: cleanCards(data.cards),
    readingLog: cleanLog(data.readingLog),
    docStats: data.docStats && typeof data.docStats === 'object' ? Object.fromEntries(Object.entries(data.docStats).filter(([id, v]) => /^[0-9a-f]{64}$/.test(id) && v && typeof v === 'object').map(([id, v]) => [id, { ms: Math.max(0, Number(v.ms) || 0), pages: Math.max(0, Math.floor(Number(v.pages) || 0)), ...(Number.isFinite(v.finishedAt) ? { finishedAt: v.finishedAt } : {}), ...(Number.isFinite(v.lastReadAt) ? { lastReadAt: v.lastReadAt } : {}) }])) : {},
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
    documents,
  };
}

const newer = (a, b) => ((a?.updatedAt || 0) >= (b?.updatedAt || 0) ? a : b);

/** Merge a backup's notes and bookmarks into the current ones (pure, for testing). */
export function mergeRestore(current, backup) {
  const notes = new Map(current.annotations.map(a => [a.id, a]));
  let added = 0, updated = 0;
  for (const a of backup.annotations) {
    const mine = notes.get(a.id);
    if (!mine) { notes.set(a.id, a); added++; } else if ((a.updatedAt || 0) > (mine.updatedAt || 0)) { notes.set(a.id, a); updated++; }
  }
  // Restoring brings back notes deleted since the backup: their deletion records go.
  const restoredIds = new Set(backup.annotations.map(a => a.id));
  const marks = new Map(current.bookmarks.map(b => [`${b.filePath}:${b.page}`, b]));
  for (const b of backup.bookmarks) { const key = `${b.filePath}:${b.page}`; marks.set(key, marks.has(key) ? newer(marks.get(key), b) : b); }
  return {
    annotations: [...notes.values()], added, updated,
    deletedAnnotations: current.deletedAnnotations.filter(d => !restoredIds.has(d.id)),
    bookmarks: [...marks.values()],
  };
}

/** Restore a backup into this device. Returns a summary of what changed. */
export async function restoreBackup(bytes) {
  const backup = readBackup(bytes);
  const s = useStore.getState();
  await saveSnapshot('Before restoring a backup', { annotations: s.annotations, bookmarks: s.bookmarks });
  // Documents: each file must match the identity it claims (its SHA-256), so a doctored
  // backup can't slip a different file in under a known document's name.
  let documentsAdded = 0, rejected = 0;
  const stored = new Set(); // only documents that passed the check count as present
  for (const doc of backup.documents) {
    if ((await documentId(doc.data)) !== doc.id) { rejected++; continue; }
    await savePdfData(doc.id, doc.data); documentsAdded++; stored.add(doc.id);
  }
  const library = [...s.library];
  for (const d of backup.library) {
    const i = library.findIndex(x => x.id === d.id);
    const hasFile = stored.has(d.id) || (i >= 0 && !library[i].needsFile);
    if (i < 0) library.push({ ...d, needsFile: !hasFile });
    else library[i] = { ...library[i], needsFile: !hasFile, ...((d.pageUpdatedAt || 0) > (library[i].pageUpdatedAt || 0) ? { lastPage: d.lastPage, pageUpdatedAt: d.pageUpdatedAt } : {}),
      collection: library[i].collection || d.collection };
  }
  const merged = mergeRestore(s, backup);
  const fresh = !s.library.length;
  useStore.setState({
    library, annotations: merged.annotations, deletedAnnotations: merged.deletedAnnotations, bookmarks: merged.bookmarks,
    collections: [...new Set([...s.collections, ...backup.collections])],
    readingPace: { ...backup.readingPace, ...s.readingPace },
    readingLog: mergeLogs(s.readingLog || {}, backup.readingLog),
    docStats: { ...backup.docStats, ...Object.fromEntries(Object.entries(s.docStats || {}).filter(([id, v]) => (v.ms || 0) >= (backup.docStats[id]?.ms || 0))) },
    // Flashcard progress: the more recently studied schedule wins.
    cards: Object.fromEntries([...new Set([...Object.keys(backup.cards || {}), ...Object.keys(s.cards || {})])].map(id => [id, ((backup.cards || {})[id]?.last || 0) > ((s.cards || {})[id]?.last || 0) ? backup.cards[id] : s.cards[id]])),
    // On a new device, reading settings come back too; otherwise this device's settings stay.
    ...(fresh ? Object.fromEntries(SETTINGS.filter(k => backup.settings[k] !== undefined).map(k => [k, backup.settings[k]])) : {}),
  });
  return { notesAdded: merged.added, notesUpdated: merged.updated, documentsAdded, rejected, libraryAdded: backup.library.filter(d => !s.library.some(x => x.id === d.id)).length };
}

/** Bring back notes and bookmarks from an automatic snapshot (same merge rules). */
export async function restoreSnapshot(snapshot) {
  const s = useStore.getState();
  await saveSnapshot('Before restoring a snapshot', { annotations: s.annotations, bookmarks: s.bookmarks });
  const merged = mergeRestore(s, { annotations: (snapshot.annotations || []).map(a => cleanAnnotation(a)).filter(Boolean), bookmarks: (snapshot.bookmarks || []).map(b => cleanBookmark(b)).filter(Boolean) });
  useStore.setState({ annotations: merged.annotations, deletedAnnotations: merged.deletedAnnotations, bookmarks: merged.bookmarks });
  return { notesAdded: merged.added, notesUpdated: merged.updated };
}
