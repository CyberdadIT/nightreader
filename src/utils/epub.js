import { unzipSync, strFromU8 } from 'fflate';
import DOMPurify from 'dompurify';
import { moveInlineStyles, prefixClasses, sanitizeStylesheet } from './epubStyles.js';
const MAX_ENTRY = 24 * 1024 * 1024, MAX_TOTAL = 120 * 1024 * 1024;
const elements = (node, name) => [...node.getElementsByTagName('*')].filter(n => n.localName === name);
function xml(text) {
  const result = new DOMParser().parseFromString(text, 'application/xml');
  if (elements(result, 'parsererror').length) throw new Error('Invalid EPUB metadata.');
  return result;
}
// Parsing is inert, but Chromium still checks a <base href> against the app's CSP
// (base-uri 'none') and reports a violation. A book has no business setting one: drop it first.
export const parseBookHtml = html => new DOMParser().parseFromString(String(html).replace(/<base\b[^>]*>/gi, ''), 'text/html');
export function resolveBookPath(base, href) {
  if (!href || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return null;
  return decodeURIComponent(new URL(href, `https://book.invalid/${base}`).pathname.slice(1));
}
export function sanitizeChapter(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p','div','span','h1','h2','h3','h4','h5','h6','strong','em','b','i','u','s','blockquote','ol','ul','li','br','hr','table','thead','tbody','tr','td','th','pre','code','img','a','sup','sub','figure','figcaption'],
    ALLOWED_ATTR: ['id','href','src','alt','title','colspan','rowspan','class','dir','lang','data-nr-style'],
    ALLOW_DATA_ATTR: false,
    // Prefix every id/name with "user-content-" so a book can't shadow page globals (DOM clobbering).
    SANITIZE_NAMED_PROPS: true,
    ALLOWED_URI_REGEXP: /^(?:blob:|#)/i,
  });
}
const textDirection = v => (/^(rtl|ltr|auto)$/i.test(v || '') ? v.toLowerCase() : '');
const languageTag = v => (/^[a-z]{2,3}(-[a-z0-9]{1,8})*$/i.test(v || '') ? v : '');
export async function loadEpub(data) {
  let total = 0;
  const files = unzipSync(new Uint8Array(data), { filter(entry) {
    total += entry.originalSize;
    if (entry.originalSize > MAX_ENTRY || total > MAX_TOTAL) throw new Error('EPUB is too large to unpack safely.');
    return true;
  } });
  const text = name => {
    if (!files[name]) throw new Error(`Missing EPUB resource: ${name}`);
    return strFromU8(files[name]);
  };
  if (files['META-INF/encryption.xml']) throw new Error('Encrypted EPUB resources are not supported. Use a DRM-free EPUB.');
  const container = xml(text('META-INF/container.xml'));
  const root = elements(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!root) throw new Error('This file has no EPUB package.');
  const opf = xml(text(root));
  const manifest = new Map(elements(opf, 'item').map(item => [item.getAttribute('id'), item]));
  const refs = elements(opf, 'itemref').filter(ref => ref.getAttribute('linear') !== 'no');
  const spine = elements(opf, 'spine')[0];
  const rtl = spine?.getAttribute('page-progression-direction') === 'rtl';
  const fixedLayout = elements(opf, 'meta').some(m => m.getAttribute('property') === 'rendition:layout' && m.textContent.trim() === 'pre-paginated');
  const urls = [], chapters = [];
  const resourceUrls = new Map(), sheets = new Map();
  // A book's stylesheets are untrusted: sanitised and scoped once, applied only if the reader turns publisher styles on.
  const sheet = (key, text) => { if (!sheets.has(key)) sheets.set(key, sanitizeStylesheet(text)); return key; };
  for (const ref of refs) {
    const item = manifest.get(ref.getAttribute('idref'));
    if (!item) continue;
    const path = resolveBookPath(root, item.getAttribute('href'));
    if (!path) continue;
    const parsed = parseBookHtml(text(path));
    const chapterSheets = [];
    parsed.querySelectorAll('style').forEach((st, i) => chapterSheets.push(sheet(`${path}#style${i}`, st.textContent)));
    parsed.querySelectorAll('link[rel~="stylesheet"]').forEach(link => {
      const css = resolveBookPath(path, link.getAttribute('href'));
      if (css && files[css]) chapterSheets.push(sheet(css, strFromU8(files[css])));
    });
    const [vw, vh] = ['width', 'height'].map(k => Number((parsed.querySelector('meta[name="viewport"]')?.getAttribute('content') || '').match(new RegExp(`${k}\\s*=\\s*(\\d+)`))?.[1]) || 0);
    moveInlineStyles(parsed);
    prefixClasses(parsed);
    // No active content, remote media, raw publisher CSS, or embedded frames.
    parsed.querySelectorAll('script,style,link,iframe,object,embed,video,audio,form').forEach(n => n.remove());
    parsed.querySelectorAll('img').forEach(img => {
      const resource = resolveBookPath(path, img.getAttribute('src'));
      const mime = ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'})[resource?.split('.').pop()?.toLowerCase()];
      if (!resource || !files[resource] || !mime) { img.remove(); return; }
      if (!resourceUrls.has(resource)) {
        const url = URL.createObjectURL(new Blob([files[resource]], {type:mime}));
        resourceUrls.set(resource, url); urls.push(url);
      }
      img.setAttribute('src', resourceUrls.get(resource));
    });
    // Retain internal destinations for chapter navigation, remove external URLs.
    parsed.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href') || '';
      const dest = resolveBookPath(path, href);
      if (dest) a.setAttribute('href', `#book:${dest}${href.includes('#') ? '#' + href.split('#')[1] : ''}`);
      else a.removeAttribute('href');
    });
    const body = sanitizeChapter(parsed.body.innerHTML);
    const clean = document.createElement('div'); clean.innerHTML = body;
    chapters.push({ path, html: body, text: clean.textContent || '', sheets: chapterSheets, viewport: vw && vh ? { width: vw, height: vh } : null,
      dir: textDirection(parsed.body.getAttribute('dir') || parsed.documentElement.getAttribute('dir')) || (rtl ? 'rtl' : ''),
      lang: languageTag(parsed.documentElement.getAttribute('lang') || parsed.documentElement.getAttribute('xml:lang')),
      title: parsed.querySelector('h1,h2,h3,title')?.textContent?.trim() || `Chapter ${chapters.length + 1}` });
  }
  if (!chapters.length) { urls.forEach(URL.revokeObjectURL); throw new Error('This EPUB has no readable chapters.'); }
  const outline = bookContents(files, root, opf, manifest, chapters);
  return { kind:'epub', numPages:chapters.length, chapters, rtl, fixedLayout, styles: sheets,
    outline: outline.length ? outline : chapters.map((c,i) => ({title:c.title,page:i+1,items:[]})),
    getPageText: async n => chapters[n-1]?.text || '',
    destroy: () => urls.forEach(URL.revokeObjectURL),
  };
}

/**
 * The book's own table of contents: EPUB 3 navigation document, else EPUB 2 NCX.
 * Each entry: { title, page (chapter number), anchor, items: [nested entries] }.
 */
export function bookContents(files, root, opf, manifest, chapters) {
  const pageFor = (base, href) => {
    const [file, anchor] = String(href || '').split('#');
    const path = file ? resolveBookPath(base, file) : base;
    const index = chapters.findIndex(c => c.path === path);
    return index < 0 ? null : { page: index + 1, anchor: anchor ? decodeURIComponent(anchor) : '' };
  };
  const tidy = t => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  try {
    const navItem = [...manifest.values()].find(i => (i.getAttribute('properties') || '').split(/\s+/).includes('nav'));
    const navPath = navItem && resolveBookPath(root, navItem.getAttribute('href'));
    if (navPath && files[navPath]) {
      const doc = parseBookHtml(strFromU8(files[navPath]));
      const navs = [...doc.querySelectorAll('nav')];
      const toc = navs.find(n => (n.getAttribute('epub:type') || n.getAttribute('type') || '').includes('toc')) || navs[0];
      const walk = ol => [...(ol?.children || [])].filter(li => li.localName === 'li').map(li => {
        const link = li.querySelector(':scope > a, :scope > span');
        const target = link?.localName === 'a' ? pageFor(navPath, link.getAttribute('href')) : null;
        return { title: tidy(link?.textContent), page: target?.page ?? null, anchor: target?.anchor || '', items: walk(li.querySelector(':scope > ol')) };
      }).filter(e => e.title);
      const items = walk(toc?.querySelector('ol'));
      if (items.length) return items;
    }
    const ncxId = elements(opf, 'spine')[0]?.getAttribute('toc');
    const ncxPath = ncxId && manifest.get(ncxId) && resolveBookPath(root, manifest.get(ncxId).getAttribute('href'));
    if (ncxPath && files[ncxPath]) {
      const ncx = xml(strFromU8(files[ncxPath]));
      const walk = parent => [...parent.children].filter(n => n.localName === 'navPoint').map(point => {
        const label = [...point.children].find(n => n.localName === 'navLabel');
        const content = [...point.children].find(n => n.localName === 'content');
        const target = pageFor(ncxPath, content?.getAttribute('src'));
        return { title: tidy(label?.textContent), page: target?.page ?? null, anchor: target?.anchor || '', items: walk(point) };
      }).filter(e => e.title);
      const navMap = elements(ncx, 'navMap')[0];
      if (navMap) return walk(navMap);
    }
  } catch { /* fall back to chapter titles */ }
  return [];
}
