import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';

// Automated accessibility checks (WCAG 2.1 A/AA rules in axe-core) on the main screens.
// Automated checks find roughly a third of real issues; they catch regressions, not everything.
async function importFile(page, file) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import PDF or EPUB' }).click();
  await (await chooser).setFiles(`tests/fixtures/${file}`);
}
async function audit(page, include) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The PDF text layer is transparent text placed over the rendered page so it can be
    // selected; its contrast is the canvas underneath, which axe can't see.
    .exclude('.textLayer').exclude('.annotationLayer');
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  return violations.map(v => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your reading library' })).toBeVisible();
});

test('library screen', async ({ page }) => {
  expect(await audit(page)).toEqual([]);
});

test('reading a PDF with the sidebar and notes panel open', async ({ page, isMobile }) => {
  await importFile(page, 'reading.pdf');
  await expect(page.locator('[data-text-root]').first()).toContainText('NightReader chapter 1');
  await page.getByRole('button', { name: '▤ Sidebar' }).click();
  if (isMobile) { // on a phone the sidebar covers the screen, so check it on its own first
    expect(await audit(page)).toEqual([]);
    await page.getByRole('button', { name: 'Close sidebar' }).click();
  }
  await page.getByRole('button', { name: '☰ Notes', exact: true }).click();
  expect(await audit(page)).toEqual([]);
});

test('reading an EPUB with contents open', async ({ page }) => {
  await importFile(page, 'styled.epub');
  await expect(page.locator('.epubContent')).toContainText('Once upon a time');
  await page.getByRole('button', { name: '▤ Sidebar' }).click();
  await page.getByRole('tab', { name: 'Contents' }).click();
  expect(await audit(page)).toEqual([]);
});

test('settings and shortcut dialogs', async ({ page }) => {
  await page.getByRole('button', { name: 'App settings' }).click();
  const settings = page.getByRole('dialog', { name: 'NightReader settings' });
  await settings.getByText(/Text recognition languages/).click();
  expect(await audit(page, '[role="dialog"]')).toEqual([]);
  await settings.getByRole('button', { name: 'Keyboard, mouse and touch shortcuts' }).click();
  expect(await audit(page, '[role="dialog"]')).toEqual([]);
});

test('library search, flashcards and statistics', async ({ page }) => {
  await importFile(page, 'reading.pdf');
  await expect(page.locator('[data-text-root]').first()).toContainText('NightReader chapter 1');
  await page.getByRole('button', { name: 'Reading statistics' }).click();
  expect(await audit(page, '[role="dialog"]')).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('tab', { name: 'Search text' }).click();
  await page.getByRole('searchbox', { name: 'Search inside all documents' }).fill('chapter 3');
  await expect(page.getByRole('article', { name: 'reading.pdf' })).toBeVisible();
  expect(await audit(page)).toEqual([]);
  await page.getByRole('tab', { name: 'Review flashcards' }).click();
  expect(await audit(page)).toEqual([]);
});

test('side by side and the ink tools', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop layout');
  await importFile(page, 'reading.pdf');
  await expect(page.locator('[data-text-root]').first()).toContainText('NightReader chapter 1');
  await page.getByRole('button', { name: '✒ Ink' }).click();
  await page.getByRole('button', { name: '◫ Side by side' }).click();
  await expect(page.locator('[data-pane]')).toHaveCount(2);
  expect(await audit(page)).toEqual([]);
});

test('lock screen', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('nightreader-lock', JSON.stringify({ v: 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA==', iv: 'AAAAAAAAAAAAAAAA', wrapped: 'AAAA', iterations: 600000 })));
  await page.reload();
  await expect(page.getByRole('form', { name: 'Unlock NightReader' })).toBeVisible();
  expect(await audit(page)).toEqual([]);
});
