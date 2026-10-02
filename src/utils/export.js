// Markdown viewers often render raw HTML, so angle brackets and ampersands from a
// document's text are written as entities: they display the same and can't run.
export const escapeMarkdownHtml = value => String(value || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
export function notesMarkdown(name, notes, kind = 'pdf') {
  const position = kind === 'epub' ? 'Chapter' : 'Page';
  const ordered = [...notes].sort((a,b) => a.page-b.page);
  return `# Notes: ${escapeMarkdownHtml(name)}\n\n` + ordered.map(a => `## ${position} ${a.page}\n\n> ${escapeMarkdownHtml(a.quote).replace(/\r?\n/g, '\n> ')}\n\n${escapeMarkdownHtml(a.note)}\n`).join('\n');
}
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function notesHtml(name, notes, kind) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(name)} — notes</title><style>body{font:16px/1.6 system-ui;max-width:800px;margin:40px auto;padding:20px}blockquote{border-left:3px solid #555;padding-left:16px}section{break-inside:avoid}p{white-space:pre-wrap}@media print{body{margin:0}}</style></head><body><h1>${escapeHtml(name)}</h1>${[...notes].sort((a,b)=>a.page-b.page).map(a=>`<section><h2>${kind==='epub'?'Chapter':'Page'} ${a.page}</h2><blockquote>${escapeHtml(a.quote||'')}</blockquote><p>${escapeHtml(a.note||'')}</p></section>`).join('')}</body></html>`;
}
