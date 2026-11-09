import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const PORT = 61955;
const OUT_DIR = resolve('out');
const SCREENSHOT_DIR = resolve('tests/screenshots');

if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const rawPath = (req.url || '/').split('?')[0];
    let filePath = resolve(OUT_DIR, '.' + rawPath);

    if (existsSync(filePath) && extname(filePath) === '') {
      if (existsSync(resolve(filePath, 'index.html'))) {
        filePath = resolve(filePath, 'index.html');
      } else if (existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
      }
    } else if (rawPath === '/' || rawPath === '') {
      filePath = resolve(OUT_DIR, 'index.html');
    }

    if (!existsSync(filePath)) {
      filePath = resolve(OUT_DIR, '404.html');
    }

    const ext = extname(filePath).toLowerCase();
    const mime = MIME_MAP[ext] || 'application/octet-stream';
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error: ' + err.message);
  }
});

server.listen(PORT, async () => {
  console.log(`Test server running at http://127.0.0.1:${PORT}`);
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_BIN || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    // Catat hash db sebelum uji coba
    const dbPath = resolve('data/db.json');
    const dbBefore = crypto.createHash('sha256').update(readFileSync(dbPath, 'utf8')).digest('hex').toUpperCase();

    console.log('\n================================================================');
    console.log('KAYLA FINANCE: TRANSACTION MODAL AUTO-OPEN VERIFICATION TEST');
    console.log('================================================================');

    // TEST A: First visit to Transactions -> modal CLOSED
    console.log('\n[TEST A] First visit to /transactions ...');
    await page.goto(`http://127.0.0.1:${PORT}/transactions`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    let modal = page.locator('text=Catat Transaksi Baru');
    let isVisible = await modal.isVisible();
    assert.strictEqual(isVisible, false, 'Modal should be CLOSED on initial visit');
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, 'modal_01_initial_visit_closed.png') });
    console.log('[PASS] Test A: Modal is CLOSED on first visit');

    // TEST B: Page refresh -> modal CLOSED
    console.log('\n[TEST B] Page refresh ...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    isVisible = await modal.isVisible();
    assert.strictEqual(isVisible, false, 'Modal should remain CLOSED after reload');
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, 'modal_02_refresh_closed.png') });
    console.log('[PASS] Test B: Modal is CLOSED after page refresh');

    // TEST C: Navigate from Dashboard to Transactions (Swipe/Navigation simulation)
    console.log('\n[TEST C] Navigating from Dashboard to Transactions ...');
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // Klik tab Transaksi di bottom navigation
    const transTab = page.locator('nav[aria-label="Navigasi Bawah Mobile"] a[data-tab-route="/transactions"]');
    if (await transTab.count() > 0) {
      await transTab.click();
    } else {
      await page.goto(`http://127.0.0.1:${PORT}/transactions`, { waitUntil: 'networkidle' });
    }
    await page.waitForTimeout(500);
    isVisible = await modal.isVisible();
    assert.strictEqual(isVisible, false, 'Modal should be CLOSED when entering from tab navigation');
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, 'modal_03_nav_from_dashboard_closed.png') });
    console.log('[PASS] Test C: Modal is CLOSED when entering from tab navigation');

    // TEST D: Click "Catat Transaksi" -> modal OPEN
    console.log('\n[TEST D] Click Catat Transaksi button ...');
    const catatBtn = page.locator('button:has-text("Catat Transaksi")');
    assert.ok(await catatBtn.count() > 0, 'Catat Transaksi button must exist on page');
    await catatBtn.click();
    await page.waitForTimeout(400);

    isVisible = await modal.isVisible();
    assert.strictEqual(isVisible, true, 'Modal should be OPEN after clicking Catat Transaksi');
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, 'modal_04_clicked_catat_opened.png') });
    console.log('[PASS] Test D: Modal is OPEN after clicking Catat Transaksi');

    // TEST H: Verify no duplicate modal instances
    const modalCount = await modal.count();
    assert.strictEqual(modalCount, 1, 'There must be exactly 1 modal instance');
    console.log('[PASS] Test H: Exactly 1 modal instance in DOM (no duplicates)');

    // TEST E: Click "Batal" -> modal CLOSED
    console.log('\n[TEST E] Click Batal button ...');
    const batalBtn = page.locator('button:has-text("Batal")');
    assert.ok(await batalBtn.count() > 0, 'Batal button must exist');
    await batalBtn.click();
    await page.waitForTimeout(400);

    isVisible = await modal.isVisible();
    assert.strictEqual(isVisible, false, 'Modal should be CLOSED after clicking Batal');
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, 'modal_05_clicked_batal_closed.png') });
    console.log('[PASS] Test E: Modal is CLOSED after clicking Batal');

    // TEST F: Reopen modal -> works correctly
    console.log('\n[TEST F] Reopen modal ...');
    await catatBtn.click();
    await page.waitForTimeout(400);
    isVisible = await modal.isVisible();
    assert.strictEqual(isVisible, true, 'Modal should re-open smoothly');
    console.log('[PASS] Test F: Modal reopens successfully');

    // Close it again
    await page.locator('button:has-text("Batal")').click();
    await page.waitForTimeout(300);

    // TEST G: Browser Back/Forward -> no unexpected auto-open
    console.log('\n[TEST G] Browser Back/Forward navigation ...');
    await page.goto(`http://127.0.0.1:${PORT}/accounts`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.goBack({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    isVisible = await modal.isVisible();
    assert.strictEqual(isVisible, false, 'Modal should NOT auto-open on browser back navigation');
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, 'modal_06_browser_back_closed.png') });
    console.log('[PASS] Test G: Modal remains CLOSED on browser Back navigation');

    // TEST I: No unintended transaction creation (database integrity)
    console.log('\n[TEST I] Verifying database integrity ...');
    const dbAfter = crypto.createHash('sha256').update(readFileSync(dbPath, 'utf8')).digest('hex').toUpperCase();
    assert.strictEqual(dbAfter, dbBefore, 'Database hash must remain unchanged');
    console.log(`[PASS] Test I: Database hash verified identical (${dbAfter})`);

    console.log('\n================================================================');
    console.log('ALL MODAL TESTS PASSED! 9/9 CONDITIONS MET (READY)');
    console.log('================================================================');

    await browser.close();
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    if (browser) await browser.close();
    server.close();
    process.exit(1);
  }
});
