// Publisher styles for EPUBs, made safe. A book's CSS is untrusted, so:
//  - only typography and layout properties pass (an allowlist);
//  - nothing that loads anything: no url(), image-set(), @import or @font-face;
//  - no position: fixed, so a book can't cover the app's own controls;
//  - every rule is scoped to the chapter container, which also clips its contents;
//  - element ids match the "user-content-" prefix the sanitiser gives them.

const ALLOWED = new Set([
  'color', 'background-color', 'opacity',
  'font-style', 'font-weight', 'font-variant', 'font-size', 'font-family', 'line-height', 'letter-spacing', 'word-spacing',
  'text-align', 'text-align-last', 'text-indent', 'text-transform', 'text-decoration', 'text-decoration-line', 'text-decoration-style',
  'text-decoration-color', 'text-shadow', 'vertical-align', 'white-space', 'word-break', 'overflow-wrap', 'hyphens', 'direction', 'unicode-bidi', 'writing-mode',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-width', 'border-style', 'border-color', 'border-radius', 'border-collapse', 'border-spacing',
  'display', 'float', 'clear', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'box-sizing',
  'position', 'top', 'right', 'bottom', 'left', 'z-index', 'overflow', 'transform', 'transform-origin',
  'list-style-type', 'list-style-position', 'table-layout', 'caption-side', 'empty-cells', 'columns', 'column-count', 'column-gap',
  'page-break-before', 'page-break-after', 'page-break-inside', 'break-before', 'break-after', 'break-inside', 'orphans', 'widows',
]);
const FORBIDDEN_VALUE = /url\s*\(|image-set|element\s*\(|expression|javascript:|@import|\\/i;

/** Keep only safe declarations. Takes a CSSStyleDeclaration; returns "prop: value; …". */
export function cleanDeclarations(style) {
  const out = [];
  for (let i = 0; i < style.length; i++) {
    const prop = style[i], value = style.getPropertyValue(prop).trim();
    if (!ALLOWED.has(prop) || !value || FORBIDDEN_VALUE.test(value)) continue;
    if (prop === 'position' && !/^(static|relative|absolute|sticky)$/.test(value)) continue;
    if (prop === 'z-index' && !(Number(value) <= 10)) continue;
    out.push(`${prop}: ${value}${style.getPropertyPriority(prop) ? ' !important' : ''}`);
  }
  return out.join('; ');
}

/** Split a selector list on top-level commas (not those inside :is(a, b)). */
function splitSelectors(text) {
  const parts = []; let depth = 0, current = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Scope one selector to the chapter: html/body/:root become the container itself. */
export function scopeSelector(selector, scope) {
  let s = selector.replace(/#(-?[_a-zA-Z][\w-]*)/g, '#user-content-$1').replace(/\.(-?[_a-zA-Z][\w-]*)/g, '.bk-$1');
  s = s.replace(/^(?::root|html)(\s+body)?\b/i, scope).replace(/^body\b/i, scope);
  return s.startsWith(scope) ? s : `${scope} ${s}`;
}

function rulesToCss(rules, scope) {
  let css = '';
  for (const rule of rules) {
    if (rule.type === 1 /* STYLE_RULE */) {
      const body = cleanDeclarations(rule.style);
      if (!body) continue;
      const selectors = splitSelectors(rule.selectorText).filter(s => !/[<>]\s*$/.test(s)).map(s => scopeSelector(s, scope));
      if (selectors.length) css += `${selectors.join(', ')} { ${body} }\n`;
    } else if (rule.type === 4 /* MEDIA_RULE */ && !/print/i.test(rule.media.mediaText)) {
      css += rulesToCss(rule.cssRules, scope); // screen styles apply; the media condition is dropped
    }
    // @import, @font-face, @page, @keyframes and anything else: dropped.
  }
  return css;
}

/** Sanitise a book stylesheet and scope it under `scope`. Needs a browser CSS parser. */
export function sanitizeStylesheet(text, scope = '.epubContent') {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(String(text).replace(/@import[^;]*;/gi, ''));
    return rulesToCss(sheet.cssRules, scope);
  } catch { return ''; }
}

/** Apply sanitised inline styles (kept as data-nr-style) through the CSS object model. */
export function applyInlineStyles(root) {
  for (const el of root.querySelectorAll('[data-nr-style]')) {
    const probe = document.createElement('div').style;
    probe.cssText = el.getAttribute('data-nr-style');
    for (const decl of cleanDeclarations(probe).split('; ').filter(Boolean)) {
      const [prop, ...rest] = decl.split(': ');
      const value = rest.join(': ').replace(/ !important$/, '');
      // Never !important inline: the reader's theme layer must still be able to override colours.
      el.style.setProperty(prop, value);
    }
  }
}

/** Book class names get a "bk-" prefix so they can't pick up NightReader's own styles. */
export function prefixClasses(doc) {
  for (const el of doc.querySelectorAll('[class]')) {
    const names = el.getAttribute('class').split(/\s+/).filter(c => /^-?[_a-zA-Z][\w-]*$/.test(c)).map(c => `bk-${c}`);
    if (names.length) el.setAttribute('class', names.join(' ')); else el.removeAttribute('class');
  }
}

/** Turn style="" attributes into sanitised data-nr-style before the HTML sanitiser runs. */
export function moveInlineStyles(doc) {
  for (const el of doc.querySelectorAll('[style]')) {
    const probe = document.createElement('div').style;
    probe.cssText = el.getAttribute('style');
    const clean = cleanDeclarations(probe);
    el.removeAttribute('style');
    if (clean) el.setAttribute('data-nr-style', clean);
  }
}
