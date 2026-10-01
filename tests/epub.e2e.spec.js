import { test, expect } from './fixtures.js';

async function importFile(page, file) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import PDF or EPUB' }).click();
  await (await chooser).setFiles(`tests/fixtures/${file}`);
}
const style = (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your reading library' })).toBeVisible();
});

test('publisher styles are off by default, sanitised and scoped when turned on', async ({ page }) => {
  const external = [];
  page.on('request', r => { if (r.url().includes('evil.example')) external.push(r.url()); });
  await importFile(page, 'styled.epub');
  const chapter = page.locator('.epubContent');
  await expect(chapter).toContainText('Once upon a time');
  const dropcap = chapter.locator('.bk-dropcap');
  await expect(dropcap).toHaveCount(1); // book classes are prefixed
  expect(await style(dropcap, 'fontWeight')).not.toBe('700');

  await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
  await page.getByLabel("Use the book's own styles").check();
  await page.getByRole('button', { name: 'Close panel' }).click();

  await expect.poll(() => style(dropcap, 'fontWeight')).toBe('700');
  expect(await style(dropcap, 'letterSpacing')).toBe('3px');
  // Dark theme: the book's colours give way to the reader's.
  expect(await style(dropcap, 'color')).not.toBe('rgb(200, 0, 0)');
  // No fixed overlay, no remote images, no @import / @font-face.
  const banner = chapter.locator('.bk-banner');
  expect(await style(banner, 'position')).not.toBe('fixed');
  expect(await style(banner, 'backgroundImage')).toBe('none');
  const inline = chapter.getByText('Inline styled paragraph');
  expect(await style(inline, 'position')).toBe('static');
  expect(await style(inline, 'backgroundImage')).toBe('none');
  // A book's ".toolbar" class can't reach the app's own styles, and the app's toolbar is untouched.
  await expect(chapter.getByText('Hidden by app class?')).toBeHidden(); // display:none from the book applies inside the book…
  await expect(page.getByRole('button', { name: '🔍 Find', exact: true })).toBeVisible(); // …and nowhere else

  // Light mode shows the publisher's colour.
  await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect.poll(() => style(dropcap, 'color')).toBe('rgb(200, 0, 0)');

  // Turning styles off removes them again, including inline ones.
  await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
  await page.getByLabel("Use the book's own styles").uncheck();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect.poll(() => style(chapter.locator('.bk-dropcap'), 'fontWeight')).not.toBe('700');
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  expect(external).toEqual([]);
});

test('EPUB contents is keyboard-navigable and jumps to anchors', async ({ page }) => {
  await importFile(page, 'styled.epub');
  await expect(page.locator('.epubContent')).toContainText('Once upon a time');
  await page.getByRole('button', { name: '▤ Sidebar' }).click();
  await page.getByRole('tab', { name: 'Contents' }).click();
  const toc = page.getByRole('navigation', { name: 'Table of contents' });
  const entry = toc.getByRole('button', { name: /The anchored section/ });
  await entry.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.epubContent')).toContainText('Second chapter');
  await expect(page.locator('#user-content-target')).toBeInViewport();
});

test('right-to-left fixed-layout book scales to fit and turns pages the other way', async ({ page }) => {
  await importFile(page, 'rtl-fixed.epub');
  const content = page.locator('.epubContent');
  await expect(content).toContainText('صفحة 1');
  await expect(content).toHaveAttribute('dir', 'rtl');
  // Drawn at its own 600×800 page size with its own styles, scaled to the viewer.
  const box = await page.locator('.epubFixed').boundingBox();
  expect(Math.abs(box.width / box.height - 600 / 800)).toBeLessThan(0.02);
  expect(await style(content.locator('.bk-page'), 'backgroundColor')).toBe('rgb(250, 240, 200)');
  await page.locator('[data-viewer-scroll]').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowLeft'); // forward in a right-to-left book
  await expect(content).toContainText('صفحة 2');
  await page.keyboard.press('ArrowRight');
  await expect(content).toContainText('صفحة 1');
});
