import { test, expect } from './fixtures.js';
import { readFile, writeFile } from 'node:fs/promises';

async function importFile(page, file) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import PDF or EPUB' }).click();
  await (await chooser).setFiles(`tests/fixtures/${file}`);
}
async function selectText(page, quote) {
  await page.evaluate(q => {
    const root = document.querySelector('[data-text-root]');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const start = node.textContent.indexOf(q);
      if (start >= 0) {
        const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + q.length);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        document.dispatchEvent(new Event('selectionchange')); break;
      }
    }
  }, quote);
  await expect(page.getByRole('toolbar', { name: 'Selected text actions' })).toBeVisible();
}
async function openPdf(page) {
  await importFile(page, 'reading.pdf');
  await expect(page.locator('[data-text-root]').first()).toContainText('NightReader chapter 1');
}
async function highlightAndNote(page, text) {
  await openPdf(page);
  await selectText(page, 'Learning security');
  await page.getByRole('button', { name: 'Highlight yellow', exact: true }).click();
  await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note for page 1' }).fill(text);
  await page.getByRole('button', { name: 'Close panel' }).click();
}
async function openSettings(page) {
  await page.getByRole('button', { name: 'App settings' }).click();
  return page.getByRole('dialog', { name: 'NightReader settings' });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your reading library' })).toBeVisible();
});

test('PDF links: internal links jump, web links ask first; forms fill and save a copy', async ({ page }) => {
  await importFile(page, 'links-form.pdf');
  const current = page.getByRole('spinbutton', { name: 'Current page' });
  const layer = page.locator('.annotationLayer').first();
  await expect(layer.locator('a[title]').first()).toBeAttached();

  // External link: the browser build asks with confirm(); declining opens nothing.
  const popups = [];
  page.on('popup', p => popups.push(p));
  page.once('dialog', d => { expect(d.message()).toContain('example.com'); d.dismiss(); });
  await layer.locator('a[title*="example.com"]').click();
  await page.waitForTimeout(300);
  expect(popups).toHaveLength(0);

  // Form fields are real inputs; values are kept and written into a saved copy.
  await layer.locator('input[type="text"]').first().fill('Ada Lovelace');
  await layer.locator('input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save filled form copy' }).click();
  const { PDFDocument } = await import('pdf-lib');
  const saved = await PDFDocument.load(await readFile(await (await download).path()));
  expect(saved.getForm().getTextField('name').getText()).toBe('Ada Lovelace');
  expect(saved.getForm().getCheckBox('agree').isChecked()).toBe(true);
  await page.getByRole('button', { name: 'Close panel' }).click();

  // Internal link goes to page 3 without leaving the app.
  await layer.locator('a:not([title])').first().click();
  await expect(current).toHaveValue('3');
  expect(page.url()).toMatch(/127\.0\.0\.1:1420\/?$/);
});

test('print: chosen pages are prepared as images and only they print', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones print through the share sheet');
  await page.addInitScript(() => {
    window.__printed = [];
    window.print = () => {
      const root = document.getElementById('print-root');
      window.__printed.push({ images: root?.querySelectorAll('img').length || 0, printing: document.body.classList.contains('printing') });
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await page.reload();
  await openPdf(page);
  await page.keyboard.press('Control+p');
  const dialog = page.getByRole('dialog', { name: 'Print' });
  await dialog.getByRole('radio', { name: /^Pages/ }).check();
  await dialog.getByRole('spinbutton', { name: 'First page' }).fill('2');
  await dialog.getByRole('spinbutton', { name: 'Last page' }).fill('4');
  await dialog.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20000 });
  expect(await page.evaluate(() => window.__printed)).toEqual([{ images: 3, printing: true }]);
  await expect(page.locator('#print-root')).toHaveCount(0);
  await expect(page.locator('body.printing')).toHaveCount(0);
});

test('deleting a note can be undone', async ({ page }) => {
  await highlightAndNote(page, 'Keep this thought');
  await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
  await page.getByRole('button', { name: 'Delete annotation' }).click();
  await expect(page.getByRole('textbox', { name: 'Note for page 1' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('textbox', { name: 'Note for page 1' })).toHaveValue('Keep this thought');
});

test('backup and restore bring notes and documents to a fresh device', async ({ page, browser }, info) => {
  await highlightAndNote(page, 'Backed-up note');
  const settings = await openSettings(page);
  await settings.getByRole('checkbox', { name: /Include the documents/ }).check();
  const download = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Save backup…' }).click();
  const file = info.outputPath('backup.zip');
  await (await download).saveAs(file);
  await expect(settings.getByRole('status')).toContainText('1 document');

  const fresh = await browser.newContext({ ...info.project.use });
  const other = await fresh.newPage();
  await other.goto('/');
  const otherSettings = await openSettings(other);
  const chooser = other.waitForEvent('filechooser');
  await otherSettings.getByRole('button', { name: 'Restore from backup…' }).click();
  await (await chooser).setFiles(file);
  await expect(otherSettings.getByRole('status')).toContainText('1 new note');
  await expect(otherSettings.getByRole('status')).toContainText('1 document');
  await otherSettings.getByRole('button', { name: 'Close' }).click();
  await other.getByRole('button', { name: 'Continue reading' }).first().click();
  await expect(other.locator('[data-text-root]').first()).toContainText('NightReader chapter 1');
  await other.getByRole('button', { name: '☰ Notes', exact: true }).click();
  await expect(other.getByRole('textbox', { name: 'Note for page 1' })).toHaveValue('Backed-up note');

  // A doctored backup (document bytes that don't match their id) is refused, not imported.
  const { unzipSync, zipSync } = await import('fflate');
  const parts = unzipSync(new Uint8Array(await readFile(file)));
  const name = Object.keys(parts).find(n => n.startsWith('documents/'));
  parts[name] = new TextEncoder().encode('%PDF-1.4 not the real document');
  const bad = info.outputPath('bad.zip'); await writeFile(bad, zipSync(parts));
  const third = await (await browser.newContext({ ...info.project.use })).newPage();
  await third.goto('/');
  const thirdSettings = await openSettings(third);
  const c3 = third.waitForEvent('filechooser');
  await thirdSettings.getByRole('button', { name: 'Restore from backup…' }).click();
  await (await c3).setFiles(bad);
  await expect(thirdSettings.getByRole('status')).toContainText("didn't match their records");
  await fresh.close();
});

test('phone-style sync file: create, merge on another device, deletions need approval', async ({ page, browser }, info) => {
  await highlightAndNote(page, 'Synced note');
  let settings = await openSettings(page);
  let download = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Create a new sync file' }).click();
  const syncFile = info.outputPath('nightreader-sync.json');
  await (await download).saveAs(syncFile);
  expect(JSON.parse(await readFile(syncFile, 'utf8')).format).toBeTruthy();

  // Second device: same document, opens the sync file and gets the note.
  const ctx = await browser.newContext({ ...info.project.use });
  const other = await ctx.newPage();
  await other.goto('/');
  await openPdf(other);
  let otherSettings = await openSettings(other);
  let chooser = other.waitForEvent('filechooser');
  download = other.waitForEvent('download');
  await otherSettings.getByRole('button', { name: 'Open sync file…' }).click();
  await (await chooser).setFiles(syncFile);
  await expect(otherSettings.getByRole('status')).toContainText('Merged');
  await (await download).saveAs(syncFile);
  await otherSettings.getByRole('button', { name: 'Close' }).click();
  await other.getByRole('button', { name: '☰ Notes', exact: true }).click();
  await expect(other.getByRole('textbox', { name: 'Note for page 1' })).toHaveValue('Synced note');
  await ctx.close();

  // Several notes deleted elsewhere: nothing is removed until the user answers.
  const id = (await page.evaluate(() => JSON.parse(localStorage.getItem('nightreader-settings')).state.annotations[0].filePath));
  const now = Date.now();
  const extra = Array.from({ length: 5 }, (_, i) => ({ id: `extra-${i}`, filePath: id, page: 1, type: 'note', quote: `Extra ${i}`, start: 0, note: `Extra note ${i}`, createdAt: now - 60_000, updatedAt: now - 60_000 }));
  await page.evaluate(notes => {
    const saved = JSON.parse(localStorage.getItem('nightreader-settings'));
    saved.state.annotations.push(...notes);
    localStorage.setItem('nightreader-settings', JSON.stringify(saved));
  }, extra);
  await page.reload();
  const data = JSON.parse(await readFile(syncFile, 'utf8'));
  data.deletedAnnotations = [...(data.deletedAnnotations || []), ...extra.map(a => ({ id: a.id, at: now }))];
  await writeFile(syncFile, JSON.stringify(data));
  settings = await openSettings(page);
  chooser = page.waitForEvent('filechooser');
  await settings.getByRole('button', { name: 'Open sync file…' }).click();
  await (await chooser).setFiles(syncFile);
  const question = settings.getByRole('alertdialog', { name: 'Sync wants to remove notes' });
  await expect(question).toContainText('5 notes');
  download = page.waitForEvent('download');
  await question.getByRole('button', { name: 'Keep mine' }).click();
  await expect(settings.getByRole('status')).toContainText('Merged');
  const kept = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(kept.annotations.filter(a => a.id.startsWith('extra-'))).toHaveLength(5);
});

test('OCR language packs that fail their checksum are refused', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ status: 200, contentType: 'application/gzip', body: Buffer.from('not a language pack') }));
  const settings = await openSettings(page);
  await settings.getByText(/Text recognition languages/).click();
  await settings.getByRole('button', { name: 'Download French' }).click();
  await expect(settings.getByRole('status')).toContainText("didn't match its checksum");
  await expect(settings.getByRole('button', { name: 'Download French' })).toBeVisible();
});

test('error details can be copied and cleared', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('nightreader-errors', JSON.stringify([{ at: new Date().toISOString(), where: 'test', message: 'Boom', stack: '', version: '0.7.0' }])));
  const settings = await openSettings(page);
  await expect(settings).toContainText('1 problem recorded');
  await settings.getByRole('button', { name: 'Clear log' }).click();
  await expect(settings).toContainText('No problems recorded.');
});
