import {describe,it,expect,beforeEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {useStore} from '../src/store/useStore.js';
import {documentId,savePdfData,loadPdfData,saveOcrPage,loadOcrPage,deleteOcrPages} from '../src/utils/storage.js';
import {loadEpub,sanitizeChapter,resolveBookPath} from '../src/utils/epub.js';
import {notesMarkdown,notesHtml} from '../src/utils/export.js';
import {matchingOffsets,fitScale,findQuote} from '../src/utils/annotations.js';
import {splitSpeech} from '../src/utils/speech.js';
import {wheelPageTurn,stepZoom,wheelPixels} from '../src/utils/navigation.js';
describe('Document identity and retained library',()=>{
 beforeEach(()=>useStore.setState({tabs:[],library:[],annotations:[],bookmarks:[],activeTabId:null}));
 it('different bytes get different identities; the same content can be reopened',async()=>{const a=await documentId([1,2]),b=await documentId([2,1]);expect(a).not.toBe(b);expect(await documentId([1,2])).toBe(a);});
 it('closing a tab preserves bytes, notes and reading position',async()=>{const id=await documentId([3,4]);await savePdfData(id,[3,4]);useStore.getState().upsertDocument({id,name:'book.pdf'});const tab=useStore.getState().openTab({path:id,name:'book.pdf'});useStore.getState().updateTab(tab,{totalPages:10});useStore.getState().setCurrentPage(5);useStore.getState().addAnnotation({filePath:id,page:5,quote:'keep me'});useStore.getState().closeTab(tab);expect(Array.from(await loadPdfData(id))).toEqual([3,4]);const reopened=useStore.getState().openTab({path:id,name:'book.pdf'});expect(useStore.getState().getActiveTab().page).toBe(5);expect(useStore.getState().annotations).toHaveLength(1);expect(reopened).toBeTruthy();});
 it('migrates annotations and bookmarks to content-based identity',()=>{useStore.setState({annotations:[{filePath:'old.pdf'}],bookmarks:[{filePath:'old.pdf'}]});useStore.getState().migrateDocument('old.pdf','hash','old.pdf','pdf');expect(useStore.getState().annotations[0].filePath).toBe('hash');expect(useStore.getState().bookmarks[0].filePath).toBe('hash');});
 it('OCR cache removal is scoped to one document',async()=>{await saveOcrPage('a',1,{text:'one'});await saveOcrPage('b',1,{text:'two'});await deleteOcrPages('a');expect(await loadOcrPage('a',1)).toBeUndefined();expect((await loadOcrPage('b',1)).text).toBe('two');});
});
describe('EPUB and annotation safety',()=>{
 it('loads chapters and removes active content and tracking images',async()=>{const book=await loadEpub(readFileSync('tests/fixtures/reading.epub'));expect(book.numPages).toBe(2);expect(book.chapters[0].html).not.toMatch(/script|untrusted.example/);expect(await book.getPageText(1)).toContain('Learning security');expect(book.chapters[0].html).toContain('#book:OEBPS/b.xhtml');book.destroy();});
 it('sanitizes events, forms and executable links',()=>{expect(sanitizeChapter('<p onclick="alert(1)">hello</p><iframe src="https://bad"/><a href="javascript:alert(1)">bad</a>')).not.toMatch(/onclick|iframe|javascript:/);});
 it('resolves local resources without accepting external schemes',()=>{expect(resolveBookPath('a/b.opf','../c.xhtml')).toBe('c.xhtml');expect(resolveBookPath('a/b.opf','https://bad')).toBeNull();});
 it('exports notes without interpreting markup as scripts',()=>{const notes=[{page:2,quote:'<script>alert(1)</script>',note:'my note'}];expect(notesMarkdown('book',notes)).toContain('Page 2');expect(notesHtml('book',notes)).toContain('&lt;script&gt;');expect(notesHtml('book',notes)).not.toContain('<script>');});
 it('finds repeated matches without an empty-query loop',()=>{expect(matchingOffsets('Test test','test')).toEqual([{start:0,end:4},{start:5,end:9}]);expect(matchingOffsets('test','')).toEqual([]);expect(findQuote('same same','same',5)).toBe(5);});
 it('fits a spread and bounds long speech chunks',()=>{expect(fitScale(600,800,300,300,'page')).toBe(.375);expect(fitScale(600,800,300,300,'width')).toBe(.5);const chunks=splitSpeech('A very long sentence '.repeat(100));expect(chunks.every(c=>c.length<=220)).toBe(true);expect(chunks.join(' ')).toContain('long sentence');});
});
describe('Mouse wheel navigation',()=>{
 const view={clientHeight:500,scrollHeight:1500};
 it('scrolls within a page until the edge, then turns the page',()=>{
  expect(wheelPageTurn({...view,deltaY:100,scrollTop:400})).toBe(0);
  expect(wheelPageTurn({...view,deltaY:100,scrollTop:1000})).toBe(1);
  expect(wheelPageTurn({...view,deltaY:-100,scrollTop:400})).toBe(0);
  expect(wheelPageTurn({...view,deltaY:-100,scrollTop:0})).toBe(-1);
 });
 it('turns pages both ways when the whole page fits on screen',()=>{
  const fits={clientHeight:800,scrollHeight:800,scrollTop:0};
  expect(wheelPageTurn({...fits,deltaY:100})).toBe(1);expect(wheelPageTurn({...fits,deltaY:-100})).toBe(-1);
 });
 it('ignores sideways and empty wheel movement',()=>{
  expect(wheelPageTurn({...view,deltaY:10,deltaX:80,scrollTop:1000})).toBe(0);
  expect(wheelPageTurn({...view,deltaY:0,scrollTop:1000})).toBe(0);
 });
 it('steps zoom within bounds and normalises wheel units',()=>{
  expect(stepZoom(1,1)).toBe(1.1);expect(stepZoom(1,-1)).toBe(.9);expect(stepZoom(4,1)).toBe(4);expect(stepZoom(.5,-1)).toBe(.5);expect(stepZoom(1.3,-1)).toBe(1.25);
  expect(wheelPixels({deltaMode:0,deltaY:100},500)).toBe(100);expect(wheelPixels({deltaMode:1,deltaY:3},500)).toBe(48);expect(wheelPixels({deltaMode:2,deltaY:1},500)).toBe(500);
 });
});
