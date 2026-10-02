// Link handling for PDF.js's annotation layer: contents links jump inside the
// document, web links open in the browser only after the user confirms.
import { useStore } from '../store/useStore.js';
import { openDocumentLink } from './desktop.js';

/** Page number (1-based) for a PDF destination, or null if it can't be resolved. */
export async function destinationPage(pdf, dest) {
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || !explicit.length) return null;
    const ref = explicit[0];
    const index = typeof ref === 'object' && ref !== null ? await pdf.getPageIndex(ref) : Number.isInteger(ref) ? ref : null;
    return index === null ? null : index + 1;
  } catch { return null; }
}

export function createLinkService(pdf) {
  const go = page => { if (page) useStore.getState().setCurrentPage(page); };
  return {
    externalLinkEnabled: true,
    get pagesCount() { return pdf.numPages; },
    get page() { return useStore.getState().getActiveTab()?.page || 1; },
    set page(n) { go(n); },
    rotation: 0,
    isInPresentationMode: false,
    eventBus: null,
    // No real href: the click handler is the only way a link does anything, so the
    // window itself can never be navigated (middle-click, Ctrl+click, drag included).
    addLinkAttributes(link, url) {
      link.href = '#';
      link.title = String(url);
      link.rel = 'noopener noreferrer nofollow';
      const open = e => { e.preventDefault(); e.stopPropagation(); openDocumentLink(String(url)).catch(() => {}); };
      link.addEventListener('click', open);
      link.addEventListener('auxclick', open);
      link.addEventListener('dragstart', e => e.preventDefault());
    },
    getDestinationHash: () => '#',
    getAnchorUrl: () => '#',
    setHash() {},
    async goToDestination(dest) { go(await destinationPage(pdf, dest)); },
    goToPage(n) { go(n); },
    executeNamedAction(action) {
      const s = useStore.getState(), page = s.getActiveTab()?.page || 1;
      const target = { NextPage: page + 1, PrevPage: page - 1, FirstPage: 1, LastPage: pdf.numPages }[action];
      if (target) go(target);
    },
    executeSetOCGState() {},
  };
}
