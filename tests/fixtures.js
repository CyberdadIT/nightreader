// Every browser test runs against the production build with its Content Security
// Policy, and fails if anything on the page is blocked by that policy.
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  cspViolations: [async ({ page }, use) => {
    const violations = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) violations.push(msg.text());
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', e => console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`));
    });
    await use(violations);
    expect(violations, 'blocked by the Content Security Policy').toEqual([]);
  }, { auto: true }],
});
export { expect };
