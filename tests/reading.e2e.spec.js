import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
async function importFile(page,file){const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Import PDF or EPUB'}).click();await(await chooser).setFiles(`tests/fixtures/${file}`);}
async function selectText(page,quote){await page.evaluate(q=>{const root=document.querySelector('[data-text-root]');const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){const start=node.textContent.indexOf(q);if(start>=0){const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+q.length);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));break;}}},quote);await expect(page.getByRole('toolbar',{name:'Selected text actions'})).toBeVisible();}
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByRole('heading',{name:'Your reading library'})).toBeVisible();});
test('PDF notes, export, retained library, search, rotation and spread',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await importFile(page,'reading.pdf');await expect(page.locator('[data-text-root]')).toContainText('NightReader chapter 1');
 await selectText(page,'Learning security');await page.getByRole('button',{name:'Highlight yellow',exact:true}).click();
 await expect(page.locator('[data-decoration="hl-yellow"]').first()).toBeVisible();
 await page.getByRole('button',{name:'☰ Notes',exact:true}).click();
 await page.getByRole('textbox',{name:'Note for page 1'}).fill('My saved study note.');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export Markdown'}).click();const exported=await download;expect(await readFile(await exported.path(),'utf8')).toContain('My saved study note.');
 await page.getByRole('button',{name:'Close panel'}).click();
 await page.getByRole('button',{name:'🔍 Find',exact:true}).click();await page.getByRole('textbox',{name:'Search query'}).fill('Learning security');await expect(page.getByRole('search')).toContainText('1 / 12');await expect(page.locator('[data-decoration="search"]').first()).toBeVisible();
 await page.getByRole('button',{name:'Close search'}).click();
 await page.getByRole('button',{name:'Rotate',exact:true}).click();await expect.poll(()=>page.locator('[data-page="1"]').evaluate(el=>el.clientWidth>el.clientHeight)).toBe(true);
 await page.getByRole('button',{name:'Two pages',exact:true}).click();await expect(page.locator('[data-page]')).toHaveCount(2);
 await page.getByRole('button',{name:'Close reading.pdf',exact:true}).click();await expect(page.getByRole('heading',{name:'Your reading library'})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Continue reading'}).click();await expect(page.locator('[data-text-root]').first()).toContainText('NightReader chapter 1');
 await page.getByRole('button',{name:'☰ Notes',exact:true}).click();await expect(page.getByRole('textbox',{name:'Note for page 1'})).toHaveValue('My saved study note.');expect(errors).toEqual([]);
});
test('EPUB reflow, safe chapter navigation, notes and search',async({page})=>{
 await importFile(page,'reading.epub');await expect(page.locator('.epubChapter')).toContainText('Reading in comfort');expect(await page.evaluate(()=>window.epubAttack)).toBeUndefined();
 await page.getByRole('button',{name:'☰ Notes',exact:true}).click();await page.getByLabel('EPUB font').selectOption('sans');await page.getByRole('slider',{name:'Font size',exact:true}).press('End');await page.getByRole('button',{name:'Close panel'}).click();
 await selectText(page,'Learning security');await page.getByRole('button',{name:'Note',exact:true}).click();await expect(page.locator('[data-decoration="note"]').first()).toBeVisible();
 await page.getByRole('button',{name:'☰ Notes',exact:true}).click();await page.getByRole('textbox',{name:'Note for chapter 1'}).fill('EPUB study note');await page.getByRole('button',{name:'Close panel'}).click();
 await page.getByRole('link',{name:'Next chapter'}).click();await expect(page.locator('.epubChapter')).toContainText('Chapter two');
 await page.getByRole('button',{name:'🔍 Find',exact:true}).click();await page.getByRole('textbox',{name:'Search query'}).fill('Learning security');await expect(page.locator('.epubChapter')).toContainText('Reading in comfort');await expect(page.locator('[data-decoration="search"]').first()).toBeVisible();
});
test('English OCR uses bundled assets and makes scanned text searchable',async({page})=>{
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await importFile(page,'scanned.pdf');await expect(page.locator('[data-page] canvas').first()).toBeVisible();
 await page.getByRole('button',{name:'OCR this page',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'OCR complete'})).toBeVisible({timeout:80000});
 await expect(page.locator('[data-text-root]')).toContainText('Offline OCR');
 await page.getByRole('button',{name:'🔍 Find',exact:true}).click();await page.getByRole('textbox',{name:'Search query'}).fill('Offline OCR');await expect(page.getByRole('search')).toContainText('1 / 1');await expect(page.locator('[data-decoration="search"]').first()).toBeVisible();
 await page.reload();await expect(page.locator('[data-text-root]')).toContainText('Offline OCR');
});
test('scroll mode releases offscreen canvas allocations',async({page})=>{
 await importFile(page,'reading.pdf');await expect(page.locator('[data-text-root]')).toContainText('NightReader chapter 1');await page.getByRole('button',{name:'☰ Scroll',exact:true}).click();
 await expect.poll(()=>page.locator('[data-page] canvas').evaluateAll(nodes=>nodes.filter(n=>n.width>0).length)).toBeLessThan(12);
 await page.getByRole('spinbutton',{name:'Current page'}).fill('12');await expect(page.locator('[data-page="12"]')).toBeInViewport();
 await expect.poll(()=>page.locator('[data-page="1"] canvas').evaluate(c=>c.width)).toBe(0);
});
test('mouse wheel turns pages at the edges and Ctrl+wheel zooms',async({page,isMobile})=>{
 test.skip(isMobile,'Mouse wheel input is desktop only');
 await importFile(page,'reading.pdf');await expect(page.locator('[data-text-root]')).toContainText('NightReader chapter 1');
 const current=page.getByRole('spinbutton',{name:'Current page'}),viewer=page.locator('[data-viewer-scroll]');
 const box=await viewer.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await viewer.evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await page.mouse.wheel(0,120);await expect(current).toHaveValue('2');
 await expect.poll(()=>viewer.evaluate(el=>el.scrollTop)).toBeLessThan(5);
 await page.waitForTimeout(400);await page.mouse.wheel(0,-120);await expect(current).toHaveValue('1');
 await expect.poll(()=>viewer.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(5);
 await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');
 await expect(page.getByLabel('Zoom level')).toHaveValue('110');
});

