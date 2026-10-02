import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { useStore } from '../store/useStore.js';
import TextDecorations from './TextDecorations.jsx';
import { applyInlineStyles } from '../utils/epubStyles.js';

/** Jump to a chapter (1-based) and, once it has rendered, to an anchor inside it. */
export function goToBookLocation(page, anchor) {
  useStore.getState().setCurrentPage(page);
  if (!anchor) return;
  const id = `user-content-${anchor}`;
  let tries = 0;
  const seek = () => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: 'start' });
    else if (++tries < 10) setTimeout(seek, 50);
  };
  setTimeout(seek, 30);
}

/**
 * Publisher stylesheets go in through the CSS object model (adoptedStyleSheets) rather than
 * <style> tags, inside the "book" cascade layer. They were sanitised and scoped to
 * .epubContent when the book was opened, so they can't reach the rest of the app.
 */
function useBookStyles(book, chapter, enabled) {
  useEffect(() => {
    if (!enabled || !chapter?.sheets?.length || typeof CSSStyleSheet === 'undefined') return;
    const css = chapter.sheets.map(key => book.styles?.get(key) || '').join('\n');
    if (!css.trim()) return;
    const sheet = new CSSStyleSheet();
    try { sheet.replaceSync(`@layer book {\n${css}\n}`); } catch { return; }
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return () => { document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== sheet); };
  }, [book, chapter, enabled]);
}

export default function EpubChapter({ book, page, available }) {
  const ref = useRef(null), [ready, setReady] = useState(false);
  const font = useStore(s => s.font), size = useStore(s => s.fontSize), line = useStore(s => s.lineHeight), margin = useStore(s => s.margin), mode = useStore(s => s.readingMode);
  const publisherStyles = useStore(s => s.publisherStyles), zoom = useStore(s => s.zoom);
  const chapter = book.chapters[page - 1];
  const html = chapter?.html || '';
  const fixed = Boolean(book.fixedLayout && chapter?.viewport);
  const styled = publisherStyles || fixed;
  useBookStyles(book, chapter, styled);

  // Inline styles were kept aside as data-nr-style; they only apply with publisher styles on.
  // The content is keyed on `styled`, so turning them off rebuilds it without them.
  useLayoutEffect(() => { if (styled && ref.current) applyInlineStyles(ref.current); }, [html, styled]);
  useEffect(() => { setReady(true); }, [html]);

  const light = mode === 'light' || mode === 'sepia';
  const themed = styled && !fixed && mode !== 'light';
  const onClick = e => {
    const link = e.target.closest('a'); const href = link?.getAttribute('href');
    if (!href?.startsWith('#')) return;
    e.preventDefault();
    if (href.startsWith('#book:')) {
      const [path, anchor] = href.slice(6).split('#');
      const index = book.chapters.findIndex(c => c.path === path);
      if (index >= 0) goToBookLocation(index + 1, anchor);
    } else {
      document.getElementById(`user-content-${href.slice(1)}`)?.scrollIntoView({ block: 'start' });
    }
  };
  const content = (
    <div ref={ref} key={styled ? 'styled' : 'plain'} data-text-root data-page-number={page}
      className={`epubContent${themed ? ' nr-themed' : ''}`} dir={chapter?.dir || undefined} lang={chapter?.lang || undefined}
      onClick={onClick} dangerouslySetInnerHTML={{ __html: html }}
      style={fixed
        ? { width: chapter.viewport.width, height: chapter.viewport.height, transformOrigin: '0 0' }
        : { fontFamily: `var(--font-${font === 'mono' ? 'mono' : font === 'sans' ? 'sans' : 'serif'})`, fontSize: size, lineHeight: line }} />
  );

  if (fixed) {
    // Fixed-layout (pre-paginated) books are drawn at their own page size and scaled to fit.
    const { width: vw, height: vh } = chapter.viewport;
    const fit = Math.min((available?.width || vw) / vw, (available?.height || vh) / vh) || 1;
    const scale = Math.max(0.1, fit * zoom);
    return (
      <article className="epubChapter epubFixed" data-page={page} style={{ position: 'relative', width: vw * scale, height: vh * scale, flex: 'none', boxShadow: '0 2px 12px rgba(0,0,0,.35)' }}>
        {React.cloneElement(content, { style: { ...content.props.style, transform: `scale(${scale})` } })}
        {/* Highlights sit outside the scaled page so their measurements stay in screen pixels. */}
        <TextDecorations rootRef={ref} ready={ready} page={page} layoutKey={`fixed:${scale}:${page}`} docPath={book.documentId} />
      </article>
    );
  }

  return (
    <article className="epubChapter" data-page={page} style={{ position: 'relative', width: '100%', maxWidth: 850, background: light ? (mode === 'sepia' ? '#f0e6c8' : '#fafafa') : '#161b22', color: light ? '#222' : '#e6edf3', padding: margin, borderRadius: 8 }}>
      <div style={{ position: 'relative' }}>
        {content}
        <TextDecorations rootRef={ref} ready={ready} page={page} layoutKey={`${size}:${line}:${margin}:${font}:${page}:${styled}`} docPath={book.documentId} />
      </div>
    </article>
  );
}
