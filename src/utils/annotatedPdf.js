// Writes NightReader highlights and notes into a copy of the PDF as standard
// PDF annotations, so they show up in Acrobat, Edge, Chrome and other readers.
// The original file is never modified.
import { loadPdfData } from './storage.js';
import { saveBinaryFile } from './platform.js';

const COLORS = {
  'hl-yellow': [1, 0.87, 0], 'hl-blue': [0.31, 0.76, 0.97], 'hl-pink': [0.96, 0.56, 0.69], 'hl-green': [0.65, 0.84, 0.65],
  underline: [0.9, 0.3, 0.5], strikethrough: [0.85, 0.2, 0.2], note: [0.55, 0.85, 1],
};
const SUBTYPES = { underline: 'Underline', strikethrough: 'StrikeOut' };
const n = v => Number(v.toFixed(2));

/** Drawing commands for the annotation's appearance, in page coordinates. */
function appearance(type, boxes, [r, g, b]) {
  const colour = `${r} ${g} ${b}`;
  if (type === 'underline' || type === 'strikethrough') {
    return boxes.map(q => {
      const h = q.t - q.b, width = Math.max(0.8, h * 0.07), y = type === 'underline' ? q.b + h * 0.08 : q.b + h * 0.45;
      return `${colour} RG ${n(width)} w ${n(q.l)} ${n(y)} m ${n(q.r)} ${n(y)} l S`;
    }).join('\n');
  }
  return `/GS0 gs ${colour} rg\n` + boxes.map(q => `${n(q.l)} ${n(q.b)} ${n(q.r - q.l)} ${n(q.t - q.b)} re f`).join('\n');
}

/** Returns { bytes, written, skipped }. Notes without stored positions are skipped. */
export async function annotatePdf(bytes, annotations) {
  const { PDFDocument, PDFHexString, PDFString } = await import('pdf-lib');
  let doc;
  try { doc = await PDFDocument.load(new Uint8Array(bytes), { updateMetadata: false }); }
  catch (e) {
    if (/encrypt/i.test(e?.message || '')) throw new Error('This PDF is encrypted, so annotations cannot be written into a copy. Use the Markdown or HTML export instead.');
    throw e;
  }
  const pages = doc.getPages(), ctx = doc.context;
  let written = 0, skipped = 0;
  for (const a of annotations) {
    const page = pages[a.page - 1];
    if (!page || !a.pdfRects?.length) { skipped++; continue; }
    const boxes = a.pdfRects.map(([x1, y1, x2, y2]) => ({ l: Math.min(x1, x2), r: Math.max(x1, x2), b: Math.min(y1, y2), t: Math.max(y1, y2) }))
      .filter(q => q.r - q.l > 0.5 && q.t - q.b > 0.5);
    if (!boxes.length) { skipped++; continue; }
    const rect = [Math.min(...boxes.map(q => q.l)), Math.min(...boxes.map(q => q.b)), Math.max(...boxes.map(q => q.r)), Math.max(...boxes.map(q => q.t))].map(n);
    const colour = COLORS[a.type] || COLORS['hl-yellow'];
    const ap = ctx.register(ctx.stream(appearance(a.type, boxes, colour), {
      Type: 'XObject', Subtype: 'Form', BBox: rect,
      Resources: { ExtGState: { GS0: { Type: 'ExtGState', BM: 'Multiply', ca: 0.55 } } },
    }));
    const annot = ctx.obj({
      Type: 'Annot', Subtype: SUBTYPES[a.type] || 'Highlight', F: 4, Rect: rect, C: colour,
      // Quad order per PDF readers in practice: upper-left, upper-right, lower-left, lower-right.
      QuadPoints: boxes.flatMap(q => [q.l, q.t, q.r, q.t, q.l, q.b, q.r, q.b].map(n)),
      T: PDFHexString.fromText('NightReader'), Contents: PDFHexString.fromText(a.note || ''),
      NM: PDFHexString.fromText(`nightreader-${a.id}`), M: PDFString.fromDate(new Date(a.updatedAt || Date.now())),
      AP: { N: ap },
    });
    page.node.addAnnot(ctx.register(annot));
    written++;
  }
  return { bytes: await doc.save(), written, skipped };
}

/** Has anything been typed into this PDF's form fields since it was opened? */
export const formChanged = doc => (doc?.annotationStorage?.size || 0) > 0;

/** The document's bytes, with any form values typed in this session written into them. */
async function currentBytes(tab, doc) {
  if (formChanged(doc)) return doc.saveDocument();
  const original = await loadPdfData(tab.path);
  if (!original) throw new Error('This document is no longer cached. Import the original file again.');
  return original;
}

/** Save "<name> (filled).pdf" with the form values typed in this session. */
export async function saveFilledPdf(tab, doc) {
  if (!formChanged(doc)) throw new Error('Nothing has been filled in yet.');
  return saveBinaryFile(`${tab.name.replace(/\.pdf$/i, '')} (filled).pdf`, await doc.saveDocument(), 'application/pdf');
}

/** Save "<name> (annotated).pdf" (including filled form values). Returns { written: null } if the user cancels. */
export async function saveAnnotatedPdf(tab, annotations, doc) {
  const { bytes, written, skipped } = await annotatePdf(await currentBytes(tab, doc), annotations);
  if (!written) throw new Error('None of these notes have saved positions yet. Highlight the passages again, then save the copy.');
  const saved = await saveBinaryFile(`${tab.name.replace(/\.pdf$/i, '')} (annotated).pdf`, bytes, 'application/pdf');
  return saved ? { written, skipped } : { written: null, skipped };
}
