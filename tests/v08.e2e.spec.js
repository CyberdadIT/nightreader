import { test, expect } from './fixtures.js';
import { readFile } from 'node:fs/promises';

async function importFile(page, file) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import PDF or EPUB' }).click();
  await (await chooser).setFiles(`tests/fixtures/${file}`);
}
async function openPdf(page, file = 'reading.pdf', text = 'NightReader chapter 1') {
  await importFile(page, file);
  await expect(page.locator('[data-text-root]').first()).toContainText(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your reading library' })).toBeVisible();
});

test.describe('Surface Pen and ink', () => {
  // Real pen input through the Chromium DevTools protocol, as WebView2 receives it from a Surface Pen.
  async function pen(page) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', ...extra });
    return {
      async hover(x, y) { await send('mouseMoved', x, y); },
      async stroke(points) {
        const [first, ...rest] = points;
        await send('mouseMoved', first[0], first[1]);
        await send('mousePressed', first[0], first[1], { button: 'left', buttons: 1, clickCount: 1, force: 0.6 });
        for (const [x, y] of rest) await send('mouseMoved', x, y, { button: 'left', buttons: 1, force: 0.7 });
        const last = points[points.length - 1];
        await send('mouseReleased', last[0], last[1], { button: 'left', buttons: 0, clickCount: 1 });
      },
    };
  }
  test('a pen writes without choosing a tool; the eraser end and Ctrl+Z work; strokes go into the PDF copy', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || isMobile, 'Pen input is driven through the Chromium protocol on the desktop layout');
    await openPdf(page);
    const box = await page.locator('[data-page="1"]').boundingBox();
    const p = await pen(page), x = box.x + 120, y = box.y + 300;
    await p.hover(x, y);
    await p.stroke([[x, y], [x + 40, y + 10], [x + 80, y + 30], [x + 120, y + 20]]);
    await expect(page.locator('[data-ink-stroke]')).toHaveCount(1);
    // Text selection still works with the mouse when the pen is away.
    await p.stroke([[x + 300, y], [x + 340, y + 40]]);
    await expect(page.locator('[data-ink-stroke]')).toHaveCount(2);
    // The eraser (the Surface Pen's eraser end can't be emulated here, so the eraser tool).
    await page.getByRole('button', { name: '✒ Ink' }).click();
    await page.getByRole('button', { name: '⌫ Eraser' }).click();
    await p.stroke([[x + 40, y + 10], [x + 42, y + 12]]);
    await expect(page.locator('[data-ink-stroke]')).toHaveCount(1);
    await page.getByRole('button', { name: '⌫ Eraser' }).click();
    await page.keyboard.press('Control+z'); // undo the erase
    await expect(page.locator('[data-ink-stroke]')).toHaveCount(2);
    // Strokes survive a reload (they're saved with the notes).
    await page.reload();
    await expect(page.locator('[data-text-root]').first()).toContainText('NightReader chapter 1');
    await expect(page.locator('[data-ink-stroke]')).toHaveCount(2);

    await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
    await expect(page.getByRole('heading', { name: /2 pen strokes/ })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save annotated PDF copy' }).click();
    const { PDFDocument, PDFName } = await import('pdf-lib');
    const saved = await PDFDocument.load(await readFile(await (await download).path()));
    const annots = saved.getPages()[0].node.Annots().asArray().map(r => saved.context.lookup(r));
    expect(annots.map(a => a.get(PDFName.of('Subtype')).toString())).toEqual(['/Ink', '/Ink']);
  });

  test('the ink tool draws with a mouse; fingers never draw', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Mouse drawing is a desktop feature');
    await openPdf(page);
    await page.getByRole('button', { name: '✒ Ink' }).click();
    await page.getByRole('button', { name: 'Ink red' }).click();
    const box = await page.locator('[data-page="1"]').boundingBox();
    await page.mouse.move(box.x + 100, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 220, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('[data-ink-stroke]')).toHaveAttribute('fill', '#d32f2f');
    await page.getByRole('button', { name: '✒ Ink' }).click(); // tool off: the mouse selects text again
    await expect(page.locator('[data-ink-layer="1"]')).toHaveCSS('pointer-events', 'none');
  });
});

test.describe('read along', () => {
  test.beforeEach(async ({ page }) => {
    // The test browser has no voices: speech is simulated, reporting each word as real engines do.
    await page.addInitScript(() => {
      window.__spoken = [];
      window.__marks = [];
      class FakeUtterance { constructor(text) { this.text = text; } }
      window.SpeechSynthesisUtterance = FakeUtterance;
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        getVoices: () => [
          { name: 'Microsoft George - English (United Kingdom)', lang: 'en-GB', voiceURI: 'george', localService: true },
          { name: 'Microsoft Hazel - English (United Kingdom)', lang: 'en-GB', voiceURI: 'hazel', localService: true },
        ],
        addEventListener() {}, removeEventListener() {},
        cancel() { clearTimeout(this.t); },
        speak(u) {
          window.__spoken.push({ text: u.text, voice: u.voice?.voiceURI });
          const words = [...u.text.matchAll(/\S+/g)];
          let i = 0;
          const next = () => {
            if (i < words.length) {
              u.onboundary?.({ name: 'word', charIndex: words[i].index, charLength: words[i][0].length });
              const mark = document.querySelector('[data-decoration="speech-word"]');
              if (mark) window.__marks.push(words[i][0]);
              i++; this.t = setTimeout(next, 60);
            } else u.onend?.();
          };
          this.t = setTimeout(next, 30);
        },
      } });
    });
    await page.reload();
  });

  test('highlights the sentence and the word being read, with male and female voices to choose from', async ({ page }) => {
    await openPdf(page);
    const voices = page.getByRole('combobox', { name: 'Speech voice' });
    await expect(voices.locator('option')).toHaveText(['Device default', 'George · British English · male', 'Hazel · British English · female']);
    await voices.selectOption('george');
    await page.getByRole('checkbox', { name: 'Continuous' }).uncheck();
    await page.getByRole('button', { name: 'Read aloud' }).click();
    await expect(page.locator('[data-decoration="speech"]').first()).toBeVisible();
    await expect(page.locator('[data-decoration="speech-word"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Read aloud' })).toBeVisible({ timeout: 15000 });
    expect((await page.evaluate(() => window.__spoken))[0].voice).toBe('george');
    expect((await page.evaluate(() => window.__marks)).length).toBeGreaterThan(5);
    await expect(page.locator('[data-decoration^="speech"]')).toHaveCount(0); // cleared at the end
  });

  test('preview speaks a sample in the chosen voice', async ({ page }) => {
    await openPdf(page);
    await page.getByRole('combobox', { name: 'Speech voice' }).selectOption('hazel');
    await page.getByRole('button', { name: 'Preview voice' }).click();
    await expect.poll(() => page.evaluate(() => window.__spoken.at(-1))).toEqual({ text: 'This is how this voice sounds reading your documents.', voice: 'hazel' });
  });
});

test('search inside every document, then open at the page with the matches shown', async ({ page }) => {
  await openPdf(page);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await importFile(page, 'styled.epub');
  await expect(page.locator('.epubContent')).toContainText('Once upon a time');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('tab', { name: 'Search text' }).click();
  const search = page.getByRole('searchbox', { name: 'Search inside all documents' });
  await search.fill('anchored section');
  const results = page.getByRole('region', { name: 'Search all documents' });
  await expect(results.getByRole('article', { name: 'styled.epub' })).toContainText('Chapter 2');
  await search.fill('NIGHTREADER CHAPTER 7');
  await expect(results.getByRole('article', { name: 'reading.pdf' })).toContainText('Page 7');
  await results.getByRole('button', { name: /Page 7/ }).first().click();
  await expect(page.getByRole('spinbutton', { name: 'Current page' })).toHaveValue('7');
  await expect(page.locator('[data-decoration="search"]').first()).toBeVisible();
});

test('side by side: two documents, each pane keeps its own page, the clicked pane is active', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Side by side is for wide screens (it stacks on phones)');
  await openPdf(page);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await importFile(page, 'styled.epub');
  await expect(page.locator('.epubContent')).toContainText('Once upon a time');
  await page.getByRole('button', { name: '◫ Side by side' }).click();
  const left = page.locator('[data-pane="left"]'), right = page.locator('[data-pane="right"]');
  await expect(left).toContainText('styled.epub');
  await expect(right.locator('[data-text-root]').first()).toContainText('NightReader chapter 1');
  // Turn pages in the right pane only.
  await right.locator('[data-viewer-scroll]').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(right).toContainText('page 3 of 12');
  await expect(left).toContainText('chapter 1 of 2');
  // The left pane becomes active when clicked; keys now turn its chapters.
  await left.locator('[data-viewer-scroll]').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('ArrowRight');
  await expect(left).toContainText('chapter 2 of 2');
  await expect(right).toContainText('page 3 of 12');
  // Same document in both panes, at different places.
  await left.getByRole('combobox', { name: 'Document in the left pane' }).selectOption({ label: 'reading.pdf' });
  await expect(left.locator('[data-text-root]').first()).toContainText('NightReader chapter');
  await page.getByRole('button', { name: '◫ Side by side' }).click();
  await expect(page.locator('[data-pane]')).toHaveCount(0);
});

test.describe('app lock', () => {
  const PASS = 'correct horse battery';
  async function addNote(page, text) {
    await openPdf(page);
    await page.evaluate(q => {
      const root = document.querySelector('[data-text-root]'), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node; while ((node = walker.nextNode())) { const i = node.textContent.indexOf(q); if (i >= 0) { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + q.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange')); break; } }
    }, 'Learning security');
    await page.getByRole('button', { name: 'Highlight yellow', exact: true }).click();
    await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
    await page.getByRole('textbox', { name: 'Note for page 1' }).fill(text);
    await page.getByRole('button', { name: 'Close panel' }).click();
  }
  const storedRecord = page => page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('nightreader');
    open.onsuccess = () => { const tx = open.result.transaction('pdf_files'); const req = tx.objectStore('pdf_files').getAll(); req.onsuccess = () => resolve(req.result.map(v => (v && v.nrEnc === 1 ? 'sealed' : 'plain'))); };
  }));

  test('encrypts stored data, asks for the passphrase, locks on demand, and turns off again', async ({ page }) => {
    test.setTimeout(150_000);
    await addNote(page, 'Secret study note');
    expect(await storedRecord(page)).toEqual(['plain']);
    await page.getByRole('button', { name: 'App settings' }).click();
    const settings = page.getByRole('dialog', { name: 'NightReader settings' });
    await settings.getByRole('button', { name: 'Turn on app lock…' }).click();
    await settings.getByLabel('New passphrase', { exact: true }).fill(PASS);
    await settings.getByLabel('Repeat the new passphrase').fill(PASS);
    await settings.getByRole('button', { name: 'Turn on and encrypt' }).click();
    await expect(settings.getByRole('status')).toContainText('App lock is on', { timeout: 30000 });
    // Nothing readable is left in storage.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('nightreader-settings'))).toContain('"nrEnc":1');
    expect(await page.evaluate(() => localStorage.getItem('nightreader-settings'))).not.toContain('Secret study note');
    expect(await storedRecord(page)).toEqual(['sealed']);

    await page.reload();
    const lock = page.getByRole('form', { name: 'Unlock NightReader' });
    await expect(lock).toBeVisible();
    await lock.getByLabel('Passphrase').fill('wrong passphrase');
    await lock.getByRole('button', { name: 'Unlock' }).click();
    await expect(lock.getByRole('alert')).toContainText('not right');
    await lock.getByLabel('Passphrase').fill(PASS);
    await lock.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.locator('[data-text-root]').first()).toContainText('NightReader chapter 1');
    await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Note for page 1' })).toHaveValue('Secret study note');
    await page.getByRole('button', { name: 'Close panel' }).click();

    await page.getByRole('button', { name: 'Lock now' }).click();
    await expect(page.getByRole('form', { name: 'Unlock NightReader' })).toBeVisible();
    await page.getByLabel('Passphrase').fill(PASS);
    await page.getByRole('button', { name: 'Unlock' }).click();

    await page.getByRole('button', { name: 'App settings' }).click();
    await settings.getByRole('button', { name: 'Turn off…' }).click();
    await settings.getByLabel('Current passphrase').fill(PASS);
    await settings.getByRole('button', { name: 'Turn off and decrypt' }).click();
    await expect(settings.getByRole('status')).toContainText('App lock is off', { timeout: 30000 });
    expect(await storedRecord(page)).toEqual(['plain']);
    await page.reload();
    await expect(page.locator('[data-text-root]').first()).toContainText('NightReader chapter 1');
  });

  test('locks itself after the chosen time without use', async ({ page }) => {
    await page.clock.install();
    await page.reload();
    await page.getByRole('button', { name: 'App settings' }).click();
    const settings = page.getByRole('dialog', { name: 'NightReader settings' });
    await settings.getByLabel('Lock after').selectOption('1');
    await settings.getByRole('button', { name: 'Turn on app lock…' }).click();
    await settings.getByLabel('New passphrase', { exact: true }).fill(PASS);
    await settings.getByLabel('Repeat the new passphrase').fill(PASS);
    await settings.getByRole('button', { name: 'Turn on and encrypt' }).click();
    await expect(settings.getByRole('status')).toContainText('App lock is on', { timeout: 30000 });
    await page.reload();
    await page.getByLabel('Passphrase').fill(PASS);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('heading', { name: 'Your reading library' })).toBeVisible();
    await page.clock.runFor(75_000);
    await expect(page.getByRole('form', { name: 'Unlock NightReader' })).toBeVisible();
  });

  test('forgotten passphrase: start again after typing DELETE', async ({ page }) => {
    await page.getByRole('button', { name: 'App settings' }).click();
    const settings = page.getByRole('dialog', { name: 'NightReader settings' });
    await settings.getByRole('button', { name: 'Turn on app lock…' }).click();
    await settings.getByLabel('New passphrase', { exact: true }).fill(PASS);
    await settings.getByLabel('Repeat the new passphrase').fill(PASS);
    await settings.getByRole('button', { name: 'Turn on and encrypt' }).click();
    await expect(settings.getByRole('status')).toContainText('App lock is on', { timeout: 30000 });
    await page.reload();
    await page.getByRole('button', { name: 'Forgot the passphrase?' }).click();
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await page.getByRole('button', { name: 'Delete everything and start again' }).click();
    await expect(page.getByRole('heading', { name: 'Your reading library' })).toBeVisible();
  });
});

test('password-protected backup: unreadable without the password, restores with it', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  await openPdf(page);
  await page.getByRole('button', { name: 'App settings' }).click();
  const settings = page.getByRole('dialog', { name: 'NightReader settings' });
  await settings.getByRole('checkbox', { name: /Protect the backup with a password/ }).check();
  await settings.getByLabel('Backup password').fill('backup password 1');
  const download = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Save backup…' }).click();
  const file = info.outputPath('backup.nrbackup');
  await (await download).saveAs(file);
  const bytes = await readFile(file);
  expect(bytes.subarray(0, 7).toString()).toBe('NRENC1\n');
  expect(bytes.includes(Buffer.from('reading.pdf'))).toBe(false);

  const other = await (await browser.newContext({ ...info.project.use })).newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'App settings' }).click();
  const s2 = other.getByRole('dialog', { name: 'NightReader settings' });
  const chooser = other.waitForEvent('filechooser');
  await s2.getByRole('button', { name: 'Restore from backup…' }).click();
  await (await chooser).setFiles(file);
  await expect(s2.getByRole('status')).toContainText('password-protected');
  await s2.getByLabel('Password of the backup to restore').fill('not it at all');
  await s2.getByRole('button', { name: 'Restore from backup…' }).click();
  await expect(s2.getByRole('status')).toContainText('Wrong password');
  await s2.getByLabel('Password of the backup to restore').fill('backup password 1');
  await s2.getByRole('button', { name: 'Restore from backup…' }).click();
  await expect(s2.getByRole('status')).toContainText('1 library entry');
});

test('flashcards: notes become cards, answers schedule them', async ({ page }) => {
  await openPdf(page);
  await page.evaluate(q => {
    const root = document.querySelector('[data-text-root]'), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node; while ((node = walker.nextNode())) { const i = node.textContent.indexOf(q); if (i >= 0) { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + q.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange')); break; } }
  }, 'Learning security');
  await page.getByRole('button', { name: 'Highlight yellow', exact: true }).click();
  await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note for page 1' }).fill('Practice beats theory');
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('tab', { name: 'Review flashcards' }).click();
  const review = page.getByRole('region', { name: 'Flashcard review' });
  await expect(review.getByRole('status')).toContainText('0 due · 1 new');
  await review.getByRole('button', { name: 'Start review' }).click();
  await expect(review.getByRole('article', { name: 'Flashcard' })).toContainText('Learning security');
  await page.keyboard.press('Space');
  await expect(review.getByLabel('Answer')).toHaveText('Practice beats theory');
  await expect(review.getByRole('button', { name: /Good · 1 day/ })).toBeVisible();
  await page.keyboard.press('3');
  await expect(review.getByRole('status')).toContainText('Session complete');
  await review.getByRole('button', { name: 'Back' }).click();
  await expect(review.getByRole('status')).toContainText('0 due · 0 new · 1 later');
});

test('reading statistics count active reading time and pages', async ({ page }) => {
  await page.clock.install();
  await page.reload();
  await openPdf(page);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('PageDown'); await page.clock.runFor(16_000); }
  await page.getByRole('button', { name: 'Reading statistics' }).click();
  const stats = page.getByRole('dialog', { name: 'Reading statistics' });
  await expect(stats).toContainText('3 pages');
  await expect(stats.getByRole('table').last()).toContainText('reading.pdf');
  await expect(stats.getByRole('group', { name: /minutes read per day/ })).toBeVisible();
});

test('the More menu works from the keyboard and the toolbar fits on one row at Surface Pro 4 size', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop layout');
  await page.setViewportSize({ width: 1368, height: 912 });
  await openPdf(page);
  const toolbar = page.getByRole('toolbar', { name: 'Reader controls' });
  const oneRow = async () => (await toolbar.boundingBox()).height < 50;
  expect(await oneRow()).toBe(true);
  await page.getByRole('button', { name: '✒ Ink' }).click(); // ink options open
  expect(await oneRow()).toBe(true);
  await page.getByRole('button', { name: '✒ Ink' }).click();
  const more = page.getByRole('button', { name: 'More ▾' });
  await more.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'More view options' });
  await expect(menu.getByRole('menuitem', { name: /Reset zoom/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Rotate' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
  await more.click();
  await menu.getByRole('menuitemcheckbox', { name: /Two pages/ }).click();
  await expect(page.locator('[data-page]')).toHaveCount(2);
  await more.click();
  await expect(menu.getByRole('menuitemcheckbox', { name: /Two pages/ })).toHaveAttribute('aria-checked', 'true');
});
