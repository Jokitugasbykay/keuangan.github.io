/**
 * Optional touch E2E: build the static `out/` directory, then run:
 *   node tests/swipe_browser_e2e.mjs
 * Starts its own ephemeral local server. No real account data is used.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from 'playwright';

const outDir = resolve(process.cwd(), 'out');
const types = { '.html': 'text/html', '.txt': 'text/plain', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let file = resolve(outDir, `.${pathname}`);
  if (pathname.endsWith('/') || !extname(file)) file = resolve(file, 'index.html');
  if (!file.startsWith(outDir + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = process.env.SWIPE_TEST_URL || `http://127.0.0.1:${server.address().port}/accounts/`;
const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || undefined;
const bundle = process.env.SWIPE_TEST_SERVERLESS_CHROMIUM === '1'
  ? (await import('@sparticuz/chromium')).default
  : null;

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: bundle?.args || ['--no-sandbox'],
});

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();

async function offset(selector) {
  return page.locator(selector).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
}

async function touch(session, type, x, y) {
  await session.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
  });
}

try {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('[data-swipe-viewport]').waitFor();
  await page.locator('[data-swipe-next]').getByText('Portofolio Kripto').waitFor();
  const panelWidth = await page.locator('[data-swipe-viewport]').evaluate((el) => el.clientWidth);
  assert.equal(await offset('[data-swipe-current]'), 0);
  assert.equal(await offset('[data-swipe-next]'), panelWidth);
  if (process.env.SWIPE_TEST_CAPTURE_PREFIX) {
    await page.screenshot({ path: `${process.env.SWIPE_TEST_CAPTURE_PREFIX}_idle.png` });
  }

  const session = await context.newCDPSession(page);
  await touch(session, 'touchStart', 330, 485);
  for (const x of [310, 285, 250, 210]) {
    await touch(session, 'touchMove', x, 485);
    await page.waitForTimeout(20);
  }

  const duringCurrent = await offset('[data-swipe-current]');
  const duringNext = await offset('[data-swipe-next]');
  assert.ok(duringCurrent < -100 && duringCurrent > -145, `current should track finger: ${duringCurrent}`);
  assert.ok(Math.abs((duringNext - duringCurrent) - panelWidth) < 2, `adjacent panel gap changed: ${duringNext}`);
  await page.waitForTimeout(160);
  assert.ok(Math.abs((await offset('[data-swipe-current]')) - duringCurrent) < 1, 'drag moves while finger is held');
  if (process.env.SWIPE_TEST_CAPTURE_PREFIX) {
    await page.screenshot({ path: `${process.env.SWIPE_TEST_CAPTURE_PREFIX}_drag.png` });
  }
  console.log('PASS: panels follow finger 1:1 and remain stationary when finger stops');

  await touch(session, 'touchEnd', 210, 485);
  await page.getByRole('heading', { name: 'Portofolio Kripto' }).waitFor({ timeout: 4000 });
  await page.waitForURL(/\/crypto\/?$/, { timeout: 8000 });
  await page.locator('[data-swipe-current]').waitFor();
  assert.equal(Math.round(await offset('[data-swipe-current]')), 0);
  const titleBox = await page.getByRole('heading', { name: 'Portofolio Aset Kripto Terpadu' }).boundingBox();
  const addWalletBox = await page.getByRole('button', { name: 'Tambah Dompet', exact: true }).boundingBox();
  assert.ok(titleBox && titleBox.x + titleBox.width <= 390, 'crypto title is clipped on mobile');
  assert.ok(addWalletBox && addWalletBox.x + addWalletBox.width <= 390, 'add-wallet button is clipped on mobile');
  if (process.env.SWIPE_TEST_CAPTURE_PREFIX) {
    await page.screenshot({ path: `${process.env.SWIPE_TEST_CAPTURE_PREFIX}_crypto.png` });
  }
  console.log('PASS: swipe completes and header + route agree');

  await touch(session, 'touchStart', 180, 480);
  await touch(session, 'touchMove', 177, 345);
  await page.waitForTimeout(70);
  assert.equal(Math.round(await offset('[data-swipe-current]')), 0);
  await touch(session, 'touchEnd', 177, 345);
  assert.match(page.url(), /\/crypto\/?$/);
  console.log('PASS: vertical scrolling does not activate horizontal swipe');

  await touch(session, 'touchStart', 70, 485);
  for (const x of [95, 140, 205]) {
    await touch(session, 'touchMove', x, 485);
    await page.waitForTimeout(20);
  }
  await touch(session, 'touchEnd', 205, 485);
  await page.waitForURL(/\/accounts\/?$/, { timeout: 8000 });
  console.log('PASS: reverse swipe navigates back to previous tab');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'mobile layout overflows horizontally');

  for (const width of [375, 430, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(180);
    const overflowAtWidth = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflowAtWidth, false, `horizontal overflow at ${width}px`);
    if (width < 768) assert.equal(await page.locator('[data-swipe-viewport]').count(), 1);
    else assert.equal(await page.locator('[data-swipe-viewport]').count(), 0);
  }
  assert.deepEqual(errors, [], `uncaught browser errors: ${errors.join(', ')}`);
  console.log('PASS: responsive widths 375–1024px, no overflow or uncaught page errors');
} finally {
  await context.close();
  await browser.close();
  await new Promise((done) => server.close(done));
}
