const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');

const PAGES = [
  { name: 'index', url: '/' },
  { name: 'playlist', url: '/playlist.html' },
  { name: 'profile', url: '/profile.html' },
  { name: 'scoreboard', url: '/scoreboard.html' },
  { name: 'rules', url: '/rules.html' },
];

test.describe('UI smoke screenshots', () => {
  test('capture key pages (mobile)', async ({ page }) => {
    const outDir = path.resolve(process.cwd(), 'artifacts', 'screenshots');
    fs.mkdirSync(outDir, { recursive: true });

    for (const item of PAGES) {
      await page.goto(item.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: path.join(outDir, `${item.name}.png`),
        fullPage: true,
      });
    }
  });
});
