import { escapeHtml } from './export.js';

export const NOTE_TYPES = [
  ['', 'All types'], ['hl-yellow', 'Yellow highlight'], ['hl-blue', 'Blue highlight'], ['hl-pink', 'Pink highlight'],
  ['hl-green', 'Green highlight'], ['underline', 'Underline'], ['strikethrough', 'Strikethrough'], ['note', 'Note'],
];

/** "exam, OT security ,  exam" → ["exam", "OT security"] */
export const parseTags = text => [...new Set(String(text || '').split(',').map(t => t.trim()).filter(Boolean))].slice(0, 20);

export const allTags = annotations => [...new Set(annotations.flatMap(a => a.tags || []))].sort((a, b) => a.localeCompare(b));

/** Filter annotations across the library, newest document first, then by page. */
export function filterNotes(annotations, library, { query = '', type = '', tag = '' } = {}) {
  const names = new Map(library.map(d => [d.id, d]));
  const q = query.trim().toLowerCase();
  return annotations
    .filter(a => names.has(a.filePath) && a.type !== 'ink')
    .filter(a => !type || a.type === type)
    .filter(a => !tag || (a.tags || []).includes(tag))
    .filter(a => !q || [a.quote, a.note, names.get(a.filePath).name, ...(a.tags || [])].some(v => String(v || '').toLowerCase().includes(q)))
    .map(a => ({ ...a, document: names.get(a.filePath) }))
    .sort((a, b) => (b.document.openedAt || 0) - (a.document.openedAt || 0) || a.document.name.localeCompare(b.document.name) || a.page - b.page);
}

const field = text => escapeHtml(String(text || '').replace(/\t/g, ' ')).replace(/\r?\n/g, '<br>');
const tagSafe = text => String(text).trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_:-]/gu, '');

/**
 * Anki import file (File → Import in Anki): front is the passage, back is your
 * note and where it came from. Tags carry over, plus the book name.
 */
export function ankiFlashcards(notes) {
  const lines = ['#separator:tab', '#html:true', '#tags column:3'];
  for (const a of notes) {
    const where = `${a.document?.name || 'Document'}, ${a.document?.kind === 'epub' ? 'chapter' : 'page'} ${a.page}`;
    const back = [a.note ? field(a.note) : '', `<small>${field(where)}</small>`].filter(Boolean).join('<br><br>');
    const tags = ['nightreader', tagSafe((a.document?.name || '').replace(/\.(pdf|epub)$/i, '')), ...(a.tags || []).map(tagSafe)].filter(Boolean);
    lines.push([field(a.quote), back, [...new Set(tags)].join(' ')].join('\t'));
  }
  return lines.join('\n') + '\n';
}
