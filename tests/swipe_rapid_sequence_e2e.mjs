/**
 * Regression: two rapid right swipes must move across two adjacent tabs.
 * Run against a dev server: SWIPE_TEST_URL=http://127.0.0.1:3000/accounts/ node tests/swipe_rapid_sequence_e2e.mjs
 * SWIPE_TEST_BROWSER_PATH optionally points to a local Chromium executable.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const outDir = resolve(import.meta.dirname, '../out');
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let file = resolve(outDir, `.${pathname}`);
  if (pathname.endsWith('/') || !extname(file)) file = resolve(file, 'index.html');
  if (!file.startsWith(outDir + sep)) return response.writeHead(403).end();
  try {
    const content = await readFile(file);
    const type = extname(file) === '.js' ? 'text/javascript'
      : extname(file) === '.css' ? 'text/css'
      : extname(file) === '.html' ? 'text/html'
      : 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type }).end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = process.env.SWIPE_TEST_URL || `http://127.0.0.1:${server.address().port}/accounts/`;
const executablePath = process.env.SWIPE_TEST_BROWSER_PATH;
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox', '--disable-setuid-sandbox',
    ...(process.platform === 'linux' && executablePath ? ['--single-process', '--no-zygote'] : [])],
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  async function reset() {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-swipe-viewport]').waitFor({ timeout: 20000 });
    await page.locator('[data-swipe-previous]').waitFor();
    await page.locator('[data-swipe-next]').waitFor();
    assert.match(new URL(page.url()).pathname, /\/accounts\/?$/);
  }

  const session = await context.newCDPSession(page);
  async function touch(type, x, y) {
    await session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  }
  async function swipe(direction, short = false, verifySecond = false) {
    const origin = direction === 'right' ? 55 : 290;
    const steps = short ? [origin + (direction === 'right' ? 15 : -15), origin + (direction === 'right' ? 30 : -30)]
      : direction === 'right' ? [100, 160, 230, 300] : [250, 200, 145, 70];
    await touch('touchStart', origin, 420);
    for (const x of steps) {
      await touch('touchMove', x, 420);
      await page.waitForTimeout(15);
      if (verifySecond && x === 160) {
        const result = await page.evaluate(() => {
          const getX = selector => new DOMMatrixReadOnly(
            getComputedStyle(document.querySelector(selector)).transform
          ).m41;
          return {
            first: getX('[data-swipe-previous]'),
            second: getX('[data-swipe-second]'),
            width: document.querySelector('[data-swipe-viewport]').clientWidth,
          };
        });
        assert.ok(Math.abs(result.first - 105) < 3,
          `First preview should follow second finger 1:1 (${result.first})`);
        assert.ok(Math.abs(result.second - (-result.width + 105)) < 3,
          `Second preview should follow second finger 1:1 (${result.second})`);
        assert.equal(await page.locator('nav[aria-label="Navigasi Bawah Mobile"] a[aria-current="page"]').getAttribute('href'),
          '/transactions', 'Bottom navigation must highlight the previewed first tab');
        await page.screenshot({ path: resolve(import.meta.dirname, 'screenshots', 'rapid_second_swipe_mid_drag.png') });
      }
    }
    if (short) await page.waitForTimeout(120);
    await touch('touchEnd', steps.at(-1), 420);
  }

  await reset();
  await swipe('right');
  // A real user can start the next swipe before the first snap/route commit finishes.
  await page.waitForTimeout(50);
  await swipe('right', false, true);
  await page.waitForTimeout(2200);

  const finalPath = new URL(page.url()).pathname;
  console.log(`Two rapid right swipes: /accounts => ${finalPath}`);
  if (errors.length) console.warn('Browser errors:', errors.slice(0, 4));
  assert.equal(finalPath.replace(/\/+$/, '') || '/', '/', 'Should land on Dashboard, not Transactions');
  console.log('PASS: two rapid right swipes land on Dashboard');

  await reset();
  await swipe('right');
  await page.waitForTimeout(170);
  await swipe('right');
  await page.waitForTimeout(2200);
  assert.equal(new URL(page.url()).pathname.replace(/\/+$/, '') || '/', '/',
    'Two right swipes with a short pause should also reach Dashboard');
  console.log('PASS: two right swipes with a short pause land on Dashboard');

  await reset();
  await swipe('right');
  await page.waitForTimeout(240);
  await swipe('right');
  await page.waitForTimeout(2200);
  assert.equal(new URL(page.url()).pathname.replace(/\/+$/, '') || '/', '/',
    'Two right swipes overlapping a route transition should reach Dashboard');
  console.log('PASS: two right swipes during route transition land on Dashboard');

  await reset();
  await swipe('right');
  await page.waitForTimeout(50);
  await swipe('right', true); // Under the distance / velocity threshold.
  await page.waitForTimeout(1800);
  assert.match(new URL(page.url()).pathname, /\/transactions\/?$/,
    'Canceling the second swipe must still finish the first');
  console.log('PASS: canceled second swipe preserves first navigation');

  await reset();
  await swipe('right');
  await page.waitForTimeout(50);
  await touch('touchStart', 55, 420);
  await page.waitForTimeout(35);
  await touch('touchEnd', 55, 420);
  await page.waitForTimeout(1500);
  assert.match(new URL(page.url()).pathname, /\/transactions\/?$/,
    'A tap during the snap must not leave the first navigation stuck');
  console.log('PASS: a tap during snap does not freeze navigation');

  await reset();
  await swipe('right');
  await page.waitForTimeout(50);
  await swipe('left');
  await page.waitForTimeout(1100);
  assert.match(new URL(page.url()).pathname, /\/accounts\/?$/,
    'A reverse second swipe should return to the original tab');
  console.log('PASS: reversing the second swipe returns to Accounts');

  await reset();
  await swipe('left');
  await page.waitForTimeout(50);
  await swipe('left');
  await page.waitForTimeout(2200);
  assert.match(new URL(page.url()).pathname, /\/trading\/?$/,
    'Two left swipes from Accounts should reach Trading via Crypto');
  console.log('PASS: two rapid left swipes land on Trading');
} finally {
  await browser.close();
  server.close();
}
