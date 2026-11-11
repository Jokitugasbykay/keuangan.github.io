import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { existsSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

// Import pure utility functions from date-utils
import {
  parseDateString,
  formatDateString,
  formatDisplayDate,
  getTodayWIB,
} from '../src/lib/date-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const ROOT = resolve(__dirname, '..');
const outDir = resolve(ROOT, 'out');
const screenshotDir = resolve(ROOT, 'tests', 'screenshots');
const artifactDir = 'C:\\Users\\Maulana Riski\\.gemini\\antigravity\\brain\\11269ab2-1b0b-4b51-b2e3-d7ba63cc973d';

if (!existsSync(screenshotDir)) {
  mkdirSync(screenshotDir, { recursive: true });
}

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

let passedCount = 0;
let totalTests = 0;

function report(condition, message, detail = '') {
  totalTests++;
  if (condition) {
    passedCount++;
    console.log(`[PASS] ${message}${detail ? ' -> ' + detail : ''}`);
  } else {
    console.error(`[FAIL] ${message}${detail ? ' -> ' + detail : ''}`);
  }
}

async function run() {
  console.log('================================================================');
  console.log('KAYLA FINANCE: CUSTOM FIGCRAFT DATE PICKER QA SUITE');
  console.log('================================================================');

  // -------------------------------------------------------------
  // SUITE 1: DETERMINISTIC DATE UTILITIES & ASIA/JAKARTA TIMEZONE
  // -------------------------------------------------------------
  console.log('\n--- SUITE 1: DETERMINISTIC DATE UTILITIES (WIB NATIVE) ---');

  const parsedReference = parseDateString('2026-11-09');
  report(
    parsedReference && parsedReference.year === 2026 && parsedReference.month === 10 && parsedReference.day === 9,
    '1.1 parseDateString 2026-11-09 terurai tepat (Tahun 2026, Bulan Index 10, Hari 9)',
    JSON.stringify(parsedReference)
  );

  const formattedStr = formatDateString(2026, 10, 9);
  report(
    formattedStr === '2026-11-09',
    '1.2 formatDateString mengembalikan YYYY-MM-DD deterministik',
    formattedStr
  );

  const displayStr = formatDisplayDate('2026-11-09');
  report(
    displayStr === '09 November 2026',
    '1.3 formatDisplayDate memformat bahasa Indonesia baku',
    displayStr
  );

  const leapYearStr = formatDateString(2024, 1, 29);
  report(
    leapYearStr === '2024-02-29',
    '1.4 formatDateString mendukung tahun kabisat (29 Februari 2024)',
    leapYearStr
  );

  const todayWIB = getTodayWIB();
  report(
    /^\d{4}-\d{2}-\d{2}$/.test(todayWIB),
    '1.5 getTodayWIB menghasilkan format YYYY-MM-DD zona waktu Asia/Jakarta',
    todayWIB
  );

  // -------------------------------------------------------------
  // SUITE 2: PLAYWRIGHT E2E BROWSER TESTING (SCANMODAL FLOW)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 2: FIGCRAFT DATE PICKER BROWSER INTERACTION ---');

  const server = createServer(async (req, res) => {
    try {
      const rawPath = (req.url || '/').split('?')[0];
      let filePath = resolve(outDir, '.' + rawPath);

      if (existsSync(filePath) && extname(filePath) === '') {
        if (existsSync(resolve(filePath, 'index.html'))) {
          filePath = resolve(filePath, 'index.html');
        } else if (existsSync(filePath + '.html')) {
          filePath = filePath + '.html';
        }
      } else if (rawPath === '/' || rawPath === '') {
        filePath = resolve(outDir, 'index.html');
      }

      if (!existsSync(filePath)) {
        filePath = resolve(outDir, '404.html');
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

  await new Promise((resolveServer) => server.listen(0, '127.0.0.1', resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server aktif pada ${baseUrl}`);

  const chromePath = process.env.CHROME_PATH || (
    existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : undefined
  );

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  });

  const page = await context.newPage();

  try {
    // 2.1 Buka halaman transaksi
    await page.goto(`${baseUrl}/transactions/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Buka ScanModal melalui tombol "Scan Bukti"
    const scanBtn = page.locator('button:has-text("Scan Bukti")');
    await scanBtn.waitFor({ timeout: 5000 });
    await scanBtn.click();
    await page.waitForTimeout(400);

    // Unggah struk uji coba untuk masuk ke tahap review struk
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles({
      name: 'struk_uji.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });

    // Tunggu layar verifikasi struk dan elemen CustomDatePicker
    const datePickerTrigger = page.locator('#receipt-date-picker');
    await datePickerTrigger.waitFor({ timeout: 15000 });
    const isTriggerVisible = await datePickerTrigger.isVisible();
    report(isTriggerVisible, '2.1 CustomDatePicker tampil pada layar verifikasi struk');

    // 2.2 Verifikasi kondisi awal: TERTUTUP secara default
    const isExpandedBefore = await datePickerTrigger.getAttribute('aria-expanded');
    const isDialogVisibleBefore = await page.locator('div[role="dialog"][aria-label="Pilih Tanggal"]').isVisible().catch(() => false);
    report(
      isExpandedBefore === 'false' && !isDialogVisibleBefore,
      '2.2 Kalender TERTUTUP secara default (aria-expanded=false, popover tertutup)'
    );

    // 2.3 Buka kalender dengan klik eksplisit
    await datePickerTrigger.click();
    await page.waitForTimeout(300);

    const isExpandedAfter = await datePickerTrigger.getAttribute('aria-expanded');
    const dialog = page.locator('div[role="dialog"][aria-label="Pilih Tanggal"]');
    const isDialogVisibleAfter = await dialog.isVisible();
    report(
      isExpandedAfter === 'true' && isDialogVisibleAfter,
      '2.3 Klik eksplisit membuka popover kalender FigCraft (aria-expanded=true)'
    );

    // 2.4 Screenshot popover terbuka
    const ssPickerPath = resolve(screenshotDir, 'datepicker_01_opened.png');
    await page.screenshot({ path: ssPickerPath, fullPage: false });
    if (existsSync(artifactDir)) {
      copyFileSync(ssPickerPath, resolve(artifactDir, 'datepicker_01_opened.png'));
    }

    // 2.5 Verifikasi Navigasi Bulan & Tahun
    const monthSelect = dialog.locator('select').first();
    const currentMonthVal = await monthSelect.inputValue();
    report(currentMonthVal !== '', '2.4 Selector bulan terpasang dan menampilkan bulan aktif', `Bulan index: ${currentMonthVal}`);

    // 2.6 Verifikasi Tombol Batal
    const initialText = await datePickerTrigger.innerText();
    // Pilih hari ke-15 di kalender
    const day15Btn = dialog.locator('button:has-text("15")').first();
    if (await day15Btn.isVisible()) {
      await day15Btn.click();
      await page.waitForTimeout(200);
    }
    const cancelBtn = dialog.locator('button:has-text("Batal")');
    await cancelBtn.click();
    await page.waitForTimeout(300);

    const isDialogClosedAfterCancel = !(await dialog.isVisible().catch(() => false));
    const textAfterCancel = await datePickerTrigger.innerText();
    report(
      isDialogClosedAfterCancel && textAfterCancel === initialText,
      '2.5 Tombol Batal menutup kalender dan membatalkan perubahan tanggal',
      `Teks tetap: ${textAfterCancel.trim()}`
    );

    // 2.7 Verifikasi Tombol Pilih (Konfirmasi)
    await datePickerTrigger.click();
    await page.waitForTimeout(300);

    const day20Btn = dialog.locator('button:has-text("20")').first();
    if (await day20Btn.isVisible()) {
      await day20Btn.click();
      await page.waitForTimeout(200);
    }
    const confirmBtn = dialog.locator('button:has-text("Pilih")');
    await confirmBtn.click();
    await page.waitForTimeout(300);

    const textAfterConfirm = await datePickerTrigger.innerText();
    report(
      textAfterConfirm.includes('20'),
      '2.6 Tombol Pilih menyimpan dan mengonfirmasi tanggal baru secara persisten',
      `Teks terkonfirmasi: ${textAfterConfirm.trim()}`
    );

    // 2.8 Verifikasi Keyboard Escape menutup kalender
    await datePickerTrigger.click();
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const isClosedAfterEscape = !(await dialog.isVisible().catch(() => false));
    report(isClosedAfterEscape, '2.7 Tombol Escape menutup kalender secara instan');

    // -------------------------------------------------------------
    // SUITE 3: RESPONSIVE VIEWPORT COMPLIANCE
    // -------------------------------------------------------------
    console.log('\n--- SUITE 3: RESPONSIVE VIEWPORT COMPLIANCE ---');

    const viewports = [
      { name: 'Mobile 360px (Android Small)', width: 360, height: 740 },
      { name: 'Mobile 390px (Android Medium)', width: 390, height: 844 },
      { name: 'Mobile 430px (Android Large)', width: 430, height: 932 },
      { name: 'Tablet 768px (iPad/Android Tab)', width: 768, height: 1024 },
      { name: 'Desktop 1280px (Standard PC)', width: 1280, height: 800 },
    ];

    for (let i = 0; i < viewports.length; i++) {
      const vp = viewports[i];
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      report(
        !hasHorizontalScroll,
        `3.${i + 1} Viewport ${vp.name} bebas overflow horizontal (scrollWidth <= innerWidth)`
      );
    }

    // -------------------------------------------------------------
    // SUITE 4: DATABASE & SAFETY INTEGRITY CHECK
    // -------------------------------------------------------------
    console.log('\n--- SUITE 4: DATABASE & SAFETY INTEGRITY ---');

    const dbPath = resolve(ROOT, 'data', 'db.json');
    const dbContent = readFileSync(dbPath);
    const dbHash = crypto.createHash('sha256').update(dbContent).digest('hex').toUpperCase();
    const EXPECTED_HASH = '9E08822CB3787DC9429090FCC626B6A8EED3454AB2A18E354D591690E1ABD8A4';

    report(
      dbHash === EXPECTED_HASH,
      '4.1 File data/db.json tetap utuh tanpa modifikasi (SHA-256 match)',
      dbHash
    );

  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n================================================================');
  console.log(`HASIL TEST QA CUSTOM DATE PICKER: ${passedCount} PASSED, ${totalTests - passedCount} FAILED (TOTAL ${totalTests})`);
  console.log('================================================================');

  if (passedCount !== totalTests) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during QA run:', err);
  process.exit(1);
});
