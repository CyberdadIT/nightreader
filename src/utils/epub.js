import { unzipSync, strFromU8 } from 'fflate';
import DOMPurify from 'dompurify';
const MAX_ENTRY = 24 * 1024 * 1024, MAX_TOTAL = 120 * 1024 * 1024;
const elements = (node, name) => [...node.getElementsByTagName('*')].filter(n => n.localName === name);
function xml(text) {
  const result = new DOMParser().parseFromString(text, 'application/xml');
  if (elements(result, 'parsererror').length) throw new Error('Invalid EPUB metadata.');
  return result;
}
export function resolveBookPath(base, href) {
  if (!href || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return null;
  return decodeURIComponent(new URL(href, `https://book.invalid/${base}`).pathname.slice(1));
}
export function sanitizeChapter(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p','div','span','h1','h2','h3','h4','h5','h6','strong','em','b','i','u','s','blockquote','ol','ul','li','br','hr','table','thead','tbody','tr','td','th','pre','code','img','a','sup','sub','figure','figcaption'],
    ALLOWED_ATTR: ['id','href','src','alt','title','colspan','rowspan'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:blob:|#)/i,
  });
}
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
  const urls = [], chapters = [];
  const resourceUrls = new Map();
  for (const ref of refs) {
    const item = manifest.get(ref.getAttribute('idref'));
    if (!item) continue;
    const path = resolveBookPath(root, item.getAttribute('href'));
    if (!path) continue;
    const parsed = new DOMParser().parseFromString(text(path), 'text/html');
    // No active content, remote media, publisher CSS, or embedded frames.
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
    chapters.push({ path, html: body, text: clean.textContent || '', title: parsed.querySelector('h1,h2,h3,title')?.textContent?.trim() || `Chapter ${chapters.length + 1}` });
  }
  if (!chapters.length) { urls.forEach(URL.revokeObjectURL); throw new Error('This EPUB has no readable chapters.'); }
  return { kind:'epub', numPages:chapters.length, chapters,
    outline: chapters.map((c,i) => ({title:c.title,page:i+1,items:[]})),
    getPageText: async n => chapters[n-1]?.text || '',
    destroy: () => urls.forEach(URL.revokeObjectURL),
  };
}
