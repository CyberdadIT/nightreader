import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
  await expect(page.locator('[data-text-root]')).toContainText('NightReader chapter 1');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your reading library' })).toBeVisible();
});

test('password-protected PDF asks for the password and retries a wrong one', async ({ page }) => {
  await importFile(page, 'protected.pdf');
  const dialog = page.getByRole('dialog', { name: 'Password required' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('PDF password').fill('wrong');
  await dialog.getByRole('button', { name: 'Open' }).click();
  await expect(dialog.getByRole('alert')).toContainText("didn't work");
  await dialog.getByLabel('PDF password').fill('night123');
  await dialog.getByRole('button', { name: 'Open' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-text-root]')).toContainText('NightReader chapter 1');
});

test('cancelling the password prompt explains how to open the PDF', async ({ page }) => {
  await importFile(page, 'protected.pdf');
  await page.getByRole('dialog', { name: 'Password required' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('alert')).toContainText('password-protected');
});

test('Define shows an offline dictionary entry for a selected word', async ({ page }) => {
  await openPdf(page);
  await selectText(page, 'security');
  await page.getByRole('button', { name: 'Define', exact: true }).click();
  const card = page.getByRole('dialog', { name: 'Definition of security' });
  await expect(card).toContainText('noun');
  await expect(card).toContainText("the state of being free from danger or injury");
  await card.getByRole('button', { name: 'Close definition' }).click();
  await expect(card).toBeHidden();
  await selectText(page, 'Learning security');
  await expect(page.getByRole('button', { name: 'Define', exact: true })).toHaveCount(0);
});

test('notes: tags, library-wide search, jump to passage, Anki and annotated PDF exports', async ({ page }) => {
  await openPdf(page);
  await selectText(page, 'Learning security');
  await page.getByRole('button', { name: 'Highlight yellow', exact: true }).click();
  await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note for page 1' }).fill('Core idea for the exam');
  const tags = page.getByRole('textbox', { name: 'Tags for page 1' });
  await tags.fill('exam, security'); await tags.press('Enter');

  // Anki flashcards for this document.
  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export flashcards (Anki)' }).click();
  const anki = await readFile(await (await download).path(), 'utf8');
  expect(anki).toContain('#separator:tab');
  expect(anki).toMatch(/Learning security\tCore idea for the exam<br><br><small>reading\.pdf, page 1<\/small>\tnightreader reading exam security/);

  // Annotated PDF copy: highlight is a real PDF annotation over the selected words.
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save annotated PDF copy' }).click();
  const pdfBytes = await readFile(await (await download).path());
  await expect(page.getByRole('status').filter({ hasText: 'Saved a copy with 1 annotation' })).toBeVisible();
  const { PDFDocument, PDFName } = await import('pdf-lib');
  const saved = await PDFDocument.load(pdfBytes);
  const annot = saved.context.lookup(saved.getPages()[0].node.Annots().get(0));
  expect(annot.get(PDFName.of('Subtype')).toString()).toBe('/Highlight');
  const [x1, y1, x2, y2] = annot.get(PDFName.of('Rect')).asArray().map(n => n.asNumber());
  // "Learning security" sits on the second line, near the left margin of a US Letter page.
  expect(x1).toBeGreaterThan(40); expect(x1).toBeLessThan(100);
  expect(x2 - x1).toBeGreaterThan(60); expect(y2 - y1).toBeGreaterThan(6); expect(y2 - y1).toBeLessThan(30);
  expect(y1).toBeGreaterThan(600);
  await page.getByRole('button', { name: 'Close panel' }).click();

  // Library-wide notes view: search, filter by tag, jump back to the passage.
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('tab', { name: 'All notes' }).click();
  await page.getByRole('searchbox', { name: 'Search notes' }).fill('exam');
  await expect(page.getByLabel('All notes')).toContainText('Learning security');
  await page.getByRole('combobox', { name: 'Filter tag' }).selectOption('security');
  await expect(page.getByLabel('All notes')).toContainText('1 of 1 notes');
  await page.getByRole('combobox', { name: 'Filter note type' }).selectOption('underline');
  await expect(page.getByLabel('All notes')).toContainText('No notes match.');
  await page.getByRole('combobox', { name: 'Filter note type' }).selectOption('');
  await page.getByRole('button', { name: /Learning security/ }).click();
  await expect(page.locator('[data-text-root]')).toContainText('NightReader chapter 1');
  await expect(page.getByRole('spinbutton', { name: 'Current page' })).toHaveValue('1');
});

test('warm light, extra dimming and time left', async ({ page }) => {
  await openPdf(page);
  await expect(page.locator('[data-time-left]')).toContainText(/\d+% · about .* left/);
  await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
  await page.getByRole('slider', { name: 'Warmth' }).fill('60');
  await expect(page.locator('[data-warm-light]')).toHaveAttribute('data-warm-light', '60');
  await expect(page.getByRole('slider', { name: 'Brightness' })).toHaveAttribute('min', '5');
  // Schedule outside the current time switches warm light off.
  const hour = new Date().getHours(), pad = h => String((h + 24) % 24).padStart(2, '0') + ':00';
  await page.getByRole('checkbox', { name: 'Only in the evening' }).check();
  await page.getByLabel('Warm light starts').fill(pad(hour + 2));
  await page.getByLabel('Warm light ends').fill(pad(hour + 3));
  await expect(page.locator('[data-warm-light]')).toHaveCount(0);
  await page.getByLabel('Warm light starts').fill(pad(hour));
  await expect(page.locator('[data-warm-light]')).toHaveCount(1);
});

test('shortcut list opens with ? and closes with Escape; settings explain desktop-only sync', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Physical keyboard shortcuts are desktop only');
  await openPdf(page);
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard and mouse shortcuts' });
  await expect(help).toContainText('Mouse wheel');
  await page.keyboard.press('ArrowRight'); // must not turn the page behind the dialog
  await expect(page.getByRole('spinbutton', { name: 'Current page' })).toHaveValue('1');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.getByRole('button', { name: 'App settings' }).click();
  const settings = page.getByRole('dialog', { name: 'NightReader settings' });
  await expect(settings).toContainText('Folder sync is available in the Windows app');
  await expect(settings).toContainText('WordNet');
  await settings.getByRole('button', { name: 'Keyboard and mouse shortcuts' }).click();
  await expect(help).toBeVisible();
});

test.describe('read aloud', () => {
  // The test browser has no voices, so speech is simulated: each sentence "finishes" quickly.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__spoken = [];
      class FakeUtterance { constructor(text) { this.text = text; } }
      window.SpeechSynthesisUtterance = FakeUtterance;
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        getVoices: () => [], addEventListener() {}, removeEventListener() {},
        cancel() { clearTimeout(this.t); },
        speak(u) { window.__spoken.push(u.text); this.t = setTimeout(() => u.onend?.(), 40); },
      } });
    });
    await page.reload();
  });

  test('continues from page to page until the end', async ({ page }) => {
    await openPdf(page);
    await page.getByRole('spinbutton', { name: 'Current page' }).fill('10');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Read aloud' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Current page' })).toHaveValue('12', { timeout: 15000 });
    await expect(page.getByRole('status').filter({ hasText: 'Finished reading the document' })).toBeVisible({ timeout: 15000 });
    const spoken = await page.evaluate(() => window.__spoken.join(' '));
    for (const n of [10, 11, 12]) expect(spoken).toContain(`NightReader chapter ${n}`);
  });

  test('sleep timer "end of page" stops without moving on', async ({ page }) => {
    await openPdf(page);
    await page.getByRole('combobox', { name: 'Sleep timer' }).selectOption('end');
    await page.getByRole('button', { name: 'Read aloud' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'stopped at the end of the page' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('spinbutton', { name: 'Current page' })).toHaveValue('1');
    await expect(page.getByRole('button', { name: 'Read aloud' })).toBeVisible();
  });

  test('turning continuous off reads only the current page', async ({ page }) => {
    await openPdf(page);
    await page.getByRole('checkbox', { name: 'Continuous' }).uncheck();
    await page.getByRole('button', { name: 'Read aloud' }).click();
    await expect(page.getByRole('button', { name: 'Read aloud' })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);
    await expect(page.getByRole('spinbutton', { name: 'Current page' })).toHaveValue('1');
  });
});

test.describe('touch screen (Surface-sized tablet)', () => {
  test.use({ hasTouch: true, viewport: { width: 1440, height: 960 } });
  // Real touch events through the Chromium DevTools protocol, as WebView2 on Windows receives them.
  async function touch(page) {
    const cdp = await page.context().newCDPSession(page);
    const box = await page.locator('[data-viewer-scroll]').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    return {
      cx, cy,
      async swipe(dx, dy) {
        await send('touchStart', [{ x: cx - dx / 2, y: cy - dy / 2 }]);
        for (let i = 1; i <= 8; i++) { await send('touchMove', [{ x: cx - dx / 2 + dx * i / 8, y: cy - dy / 2 + dy * i / 8 }]); await page.waitForTimeout(20); }
        await send('touchEnd', []);
      },
      async pinch(from, to) {
        await send('touchStart', [{ x: cx - from, y: cy, id: 1 }, { x: cx + from, y: cy, id: 2 }]);
        for (let i = 1; i <= 10; i++) { const d = from + (to - from) * i / 10; await send('touchMove', [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }]); await page.waitForTimeout(100); }
        await send('touchEnd', []);
      },
    };
  }
  test('swipes turn pages, never leave the app, and pinch zooms the page not the window', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Touch is driven through the Chromium protocol');
    let navigations = 0;
    await openPdf(page);
    page.on('framenavigated', f => { if (f === page.mainFrame()) navigations++; });
    const current = page.getByRole('spinbutton', { name: 'Current page' }), viewer = page.locator('[data-viewer-scroll]');
    const t = await touch(page);
    await t.swipe(-500, 0); await expect(current).toHaveValue('2');
    await t.swipe(-500, 0); await expect(current).toHaveValue('3');
    await t.swipe(500, 0); await expect(current).toHaveValue('2');
    await expect.poll(() => viewer.evaluate(el => el.scrollTop)).toBeLessThan(5);
    await t.swipe(-40, 0); await page.waitForTimeout(300); await expect(current).toHaveValue('2');
    await viewer.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await t.swipe(0, -400); await expect(current).toHaveValue('3');
    await t.swipe(0, 400); await expect(current).toHaveValue('2');
    await expect.poll(() => viewer.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(5);
    await t.pinch(100, 250);
    await expect.poll(() => page.getByLabel('Zoom level').inputValue().then(Number)).toBeGreaterThan(150);
    expect(await page.evaluate(() => visualViewport.scale)).toBe(1);
    await expect(page.getByLabel('Page fit')).toHaveValue('manual');
    expect(navigations).toBe(0);
  });
});
