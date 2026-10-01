import { test, expect } from './fixtures.js';
// Regression for the 0.6 review's hostile-EPUB proof of concept: scripts, event handlers,
// remote resources, <base>, meta refresh, mXSS and DOM clobbering, with publisher styles on.
test('hostile EPUB: nothing runs, loads or navigates, even with publisher styles on', async ({ page }) => {
  const outside = [];
  page.on('request', r => { const u = new URL(r.url()); if (!['127.0.0.1'].includes(u.hostname) && !u.protocol.startsWith('blob') && !u.protocol.startsWith('data')) outside.push(r.url()); });
  await page.goto('/');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('nightreader-settings') || '{"state":{},"version":2}'); s.state.publisherStyles = true; localStorage.setItem('nightreader-settings', JSON.stringify(s)); });
  await page.reload();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import PDF or EPUB' }).click();
  await (await chooser).setFiles('tests/fixtures/hostile.epub');
  await expect(page.locator('.epubContent')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => [window.epubAttack, window.pwned, document.querySelectorAll('.epubContent script, .epubContent iframe, .epubContent [onerror], .epubContent style, .epubContent link, .epubContent base, .epubContent meta').length])).toEqual([undefined, undefined, 0]);
  expect(await page.evaluate(() => document.adoptedStyleSheets.map(s => [...s.cssRules].map(r => r.cssText).join('\n')).join('\n'))).not.toMatch(/url\(|evil/);
  expect(outside).toEqual([]);
  expect(page.url()).toMatch(/127\.0\.0\.1:1420\/?$/);
});
