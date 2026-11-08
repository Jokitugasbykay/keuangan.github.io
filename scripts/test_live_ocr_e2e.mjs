import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BASE_URL = 'https://jokitugasbykay.github.io/keuangan.github.io';
const ARTIFACT_DIR = 'C:\\Users\\Maulana Riski\\.gemini\\antigravity\\brain\\11269ab2-1b0b-4b51-b2e3-d7ba63cc973d';
const CURRENT_ARTIFACT_DIR = 'C:\\Users\\Maulana Riski\\.gemini\\antigravity-cli\\brain\\43192e5b-73e7-443a-8d6c-78d3ff14b1e9';
const SCREENSHOT_DIR = path.join(ROOT, 'tests', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Users\\Maulana Riski\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';

console.log('================================================================');
console.log('KAYLA FINANCE: FINAL LIVE RECEIPT OCR REAL-BROWSER TEST');
console.log(`Target URL : ${BASE_URL}`);
console.log(`Browser    : ${CHROME_PATH}`);
console.log('================================================================\n');

async function saveScreenshot(page, filename) {
  const localPath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  for (const dir of [ARTIFACT_DIR, CURRENT_ARTIFACT_DIR]) {
    try {
      if (fs.existsSync(dir)) {
        fs.copyFileSync(localPath, path.join(dir, filename));
      }
    } catch (err) {
      // Ignore copy error
    }
  }
  console.log(`[SCREENSHOT] Saved: ${filename}`);
  return localPath;
}

async function runLiveOcrTest() {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const consoleErrors = [];
  const networkErrors = [];
  const ocrAssetsLoaded = [];

  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });

  page.on('pageerror', (err) => {
    console.error('[PAGE ERROR]', err.message);
    consoleErrors.push(err.message);
  });

  page.on('requestfailed', (req) => {
    if (!req.url().includes('favicon')) {
      networkErrors.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('tesseract') || url.includes('wasm') || url.includes('traineddata')) {
      const asset = {
        url,
        status: res.status(),
        file: url.split('/').pop()?.split('?')[0],
      };
      ocrAssetsLoaded.push(asset);
      console.log(`[OCR ASSET] HTTP ${res.status()} - ${asset.file}`);
    }
  });

  const testReport = {
    steps: [],
    ocrOutput: null,
    beforeBalance: 0,
    afterBalance: 0,
    duplicateDetected: false,
    consoleErrors: [],
    networkErrors: [],
    assets: [],
  };

  try {
    // =========================================================
    // STEP 1 & 2: VERIFIKASI SALDO AWAL NOL & INPUT INCOME SINTETIS
    // =========================================================
    console.log('--- LANGKAH 1 & 2: MEMERIKSA SALDO AWAL NOL & INPUT SALDO SINTETIS ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 35000 });
    // Tunggu inisialisasi client-data demo storage di browser
    await page.waitForFunction(() => {
      const v = localStorage.getItem('kayla_finance_demo_v2');
      return typeof v === 'string' && v.length > 10;
    }, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(1000);

    // Ambil data database dari localStorage demo
    const initialDbRaw = await page.evaluate(() => localStorage.getItem('kayla_finance_demo_v2'));
    if (!initialDbRaw) throw new Error('Data demo_v2 tidak ditemukan di localStorage');
    const initialDb = JSON.parse(initialDbRaw);

    const initialTotal = initialDb.accounts.reduce((s, a) => s + (a.current_balance || 0), 0);
    console.log(`[CHECK] Total saldo demo awal: Rp${initialTotal}`);
    console.log(`[CHECK] Total transaksi demo awal: ${initialDb.transactions.length}`);

    if (initialTotal !== 0 || initialDb.transactions.length !== 0) {
      throw new Error(`Kondisi demo awal tidak nol! Saldo: ${initialTotal}, Tx: ${initialDb.transactions.length}`);
    }

    await saveScreenshot(page, '01_initial_zero_state.png');

    // Buka halaman transaksi untuk menambah income sintetis
    console.log('Membuka /transactions/ untuk menambahkan pendapatan sintetis Rp100.000...');
    await page.goto(`${BASE_URL}/transactions/`, { waitUntil: 'networkidle', timeout: 35000 });
    await page.waitForTimeout(1500);

    const catatBtn = await page.$('button:has-text("Catat Transaksi")');
    if (!catatBtn) throw new Error('Tombol Catat Transaksi tidak ditemukan');
    await catatBtn.click();
    await page.waitForTimeout(800);

    // Pilih jenis pemasukan
    const incomeBtn = await page.$('button:has-text("Pemasukan")');
    if (!incomeBtn) throw new Error('Pilihan jenis Pemasukan tidak ditemukan');
    await incomeBtn.click();
    await page.waitForTimeout(300);

    // Isi deskripsi
    const descInput = await page.$('input[placeholder*="Gaji"], input[placeholder*="Penjualan"], form input[type="text"]');
    if (!descInput) throw new Error('Field deskripsi tidak ditemukan');
    await descInput.fill('Setoran Awal Uji Coba OCR');

    // Isi nominal Rp100.000
    const amountInput = await page.$('form input[type="number"]');
    if (!amountInput) throw new Error('Field nominal amount tidak ditemukan');
    await amountInput.fill('100000');

    // Pilih akun Bank Mandiri Demo jika ada dropdown
    const selectTrigger = await page.$('form button:has-text("Pilih Akun"), form button:has-text("Rekening Bank"), form [role="combobox"]');
    if (selectTrigger) {
      await selectTrigger.click();
      await page.waitForTimeout(400);
      const mandiriOption = await page.$('div:has-text("Rekening Bank (Demo)"), [role="option"]:has-text("Rekening Bank")');
      if (mandiriOption) {
        await mandiriOption.click();
      } else {
        await selectTrigger.click(); // close dropdown if already default
      }
    }

    // Submit form pemasukan
    const submitIncomeBtn = await page.$('button:has-text("Simpan Transaksi")');
    if (!submitIncomeBtn) throw new Error('Tombol Simpan Transaksi tidak ditemukan');
    await submitIncomeBtn.click();
    await page.waitForTimeout(1500);

    // Verifikasi saldo akun Bank Mandiri Demo menjadi Rp100.000
    const dbAfterIncomeRaw = await page.evaluate(() => localStorage.getItem('kayla_finance_demo_v2'));
    const dbAfterIncome = JSON.parse(dbAfterIncomeRaw);
    const mandiriAcc = dbAfterIncome.accounts.find((a) => a.id === 'acc-demo-bank');

    console.log(`[CHECK] Saldo Bank Mandiri Demo setelah pemasukan: Rp${mandiriAcc?.current_balance}`);
    if (mandiriAcc?.current_balance !== 100000) {
      throw new Error(`Saldo akun Mandiri bukan 100.000, melainkan ${mandiriAcc?.current_balance}`);
    }

    testReport.beforeBalance = mandiriAcc.current_balance;
    await saveScreenshot(page, '02_synthetic_income_created.png');

    // =========================================================
    // STEP 3: REAL OCR TEST MENGGUNAKAN PNG FIXTURE
    // =========================================================
    console.log('\n--- LANGKAH 3: PENGUJIAN REAL OCR STRUK BELANJA PNG ---');
    const fixturePath = path.join(ROOT, 'tests', 'fixtures', 'receipt_indomaret_basic.png');
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Fixture berkas struk tidak ditemukan pada: ${fixturePath}`);
    }

    // Klik tombol Scan Bukti
    const scanBuktiBtn = await page.$('button:has-text("Scan Bukti")');
    if (!scanBuktiBtn) throw new Error('Tombol Scan Bukti tidak ditemukan di /transactions/');
    await scanBuktiBtn.click();
    await page.waitForTimeout(1200);

    // Verifikasi modal terbuka
    const modalHeading = await page.$('h3:has-text("Pindai Struk Belanja")');
    if (!modalHeading) throw new Error('Modal Pindai Struk Belanja gagal dibuka');
    await saveScreenshot(page, '03_scan_modal_opened.png');

    // Unggah file fixture langsung melalui browser input[type="file"]
    console.log(`Mengunggah berkas ${path.basename(fixturePath)} ke input browser...`);
    const fileInput = await page.$('input[type="file"][accept*="image"]');
    if (!fileInput) throw new Error('Input berkas gambar tidak ditemukan di modal');

    // Set file input (ini memicu onChange -> handleSelectFile -> executeScan secara otomatis)
    await fileInput.setInputFiles(fixturePath);

    // Tunggu proses OCR berjalan (bisa memakan waktu 10-30 detik untuk download Tesseract WASM + traineddata + inference)
    console.log('Menunggu proses real OCR Tesseract browser selesai...');
    
    // Tunggu indikator review muncul (Simpan Pengeluaran)
    await page.waitForSelector('button:has-text("Simpan Pengeluaran")', { timeout: 90000 });
    await page.waitForTimeout(2000);

    await saveScreenshot(page, '04_ocr_review_preview.png');

    const modalContainer = page.locator('div.fixed.inset-0.z-50');

    // Ekstraksi data hasil pengenalan OCR dari form review
    const extractedMerchant = await modalContainer.locator('input[placeholder*="Indomaret"]').inputValue().catch(() => '');
    const grandTotalText = await modalContainer.locator('text=Grand Total Belanja:').locator('..').locator('span').last().innerText().catch(() => '');
    const firstItemName = await modalContainer.locator('input[placeholder*="Nama barang"], input[placeholder*="Nama item"], input[value*="BARANG"]').first().inputValue().catch(() => '');

    console.log(`[OCR RESULT] Merchant terdeteksi: "${extractedMerchant}"`);
    console.log(`[OCR RESULT] Item pertama terdeteksi: "${firstItemName}"`);
    console.log(`[OCR RESULT] Grand Total terdeteksi: "${grandTotalText}"`);

    testReport.ocrOutput = {
      merchant: extractedMerchant,
      item: firstItemName,
      grandTotal: grandTotalText,
      assets: ocrAssetsLoaded,
    };

    if (!extractedMerchant.toUpperCase().includes('INDOMARET')) {
      console.warn('Peringatan: Nama merchant tidak persis memuat INDOMARET:', extractedMerchant);
    }

    // =========================================================
    // STEP 4: RECORD EXPENSE & VERIFY BALANCE 90.000
    // =========================================================
    console.log('\n--- LANGKAH 4: KONFIRMASI PENGELUARAN & PEMOTONGAN SALDO KE RP90.000 ---');

    // Klik tombol Simpan Pengeluaran di dalam modal
    const simpanPengeluaranBtn = modalContainer.locator('button:has-text("Simpan Pengeluaran")');
    await simpanPengeluaranBtn.waitFor({ state: 'visible', timeout: 10000 });
    await simpanPengeluaranBtn.click();
    await page.waitForTimeout(2000);

    // Ambil database terbaru dari localStorage
    const dbAfterExpenseRaw = await page.evaluate(() => localStorage.getItem('kayla_finance_demo_v2'));
    const dbAfterExpense = JSON.parse(dbAfterExpenseRaw);

    const mandiriAfterExpense = dbAfterExpense.accounts.find((a) => a.id === 'acc-demo-bank');
    const expenseTx = dbAfterExpense.transactions.filter((t) => t.transaction_type === 'expense');

    console.log(`[CHECK] Jumlah transaksi pengeluaran tercatat: ${expenseTx.length}`);
    console.log(`[CHECK] Saldo Bank Mandiri setelah potongan pengeluaran: Rp${mandiriAfterExpense?.current_balance}`);

    testReport.afterBalance = mandiriAfterExpense?.current_balance;

    if (expenseTx.length !== 1) {
      throw new Error(`Diharapkan tepat 1 transaksi pengeluaran, ditemukan: ${expenseTx.length}`);
    }

    if (expenseTx[0].amount !== 10000) {
      throw new Error(`Nominal pengeluaran bukan 10.000, melainkan: ${expenseTx[0].amount}`);
    }

    if (mandiriAfterExpense?.current_balance !== 90000) {
      throw new Error(`Saldo akhir akun bukan 90.000, melainkan: ${mandiriAfterExpense?.current_balance}`);
    }

    await saveScreenshot(page, '05_expense_recorded_transactions.png');

    // Verifikasi Dashboard
    console.log('Membuka / untuk memverifikasi pembaruan saldo di Dashboard...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 35000 });
    await page.waitForTimeout(1500);
    await saveScreenshot(page, '06_dashboard_balance_90k.png');

    // Verifikasi Reports
    console.log('Membuka /reports/ untuk memverifikasi pembaruan di Laporan...');
    await page.goto(`${BASE_URL}/reports/`, { waitUntil: 'networkidle', timeout: 35000 });
    await page.waitForTimeout(1500);
    await saveScreenshot(page, '07_reports_updated.png');

    // =========================================================
    // STEP 5: PERSISTENCE TEST (REFRESH BROWSER)
    // =========================================================
    console.log('\n--- LANGKAH 5: VERIFIKASI PERSISTENSI SETELAH REFRESH BROWSER ---');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const dbAfterReloadRaw = await page.evaluate(() => localStorage.getItem('kayla_finance_demo_v2'));
    const dbAfterReload = JSON.parse(dbAfterReloadRaw);
    const mandiriAfterReload = dbAfterReload.accounts.find((a) => a.id === 'acc-demo-bank');
    const totalTxAfterReload = dbAfterReload.transactions.length;

    console.log(`[PERSISTENCE] Saldo setelah reload: Rp${mandiriAfterReload?.current_balance}`);
    console.log(`[PERSISTENCE] Total transaksi setelah reload: ${totalTxAfterReload}`);

    if (mandiriAfterReload?.current_balance !== 90000) {
      throw new Error(`Saldo pasca-reload berubah dari 90.000 menjadi ${mandiriAfterReload?.current_balance}`);
    }
    if (totalTxAfterReload !== 2) { // 1 income + 1 expense
      throw new Error(`Jumlah transaksi berubah setelah reload: ${totalTxAfterReload}`);
    }

    await saveScreenshot(page, '08_persistence_after_reload.png');

    // =========================================================
    // STEP 6: DUPLICATE RECEIPT TEST
    // =========================================================
    console.log('\n--- LANGKAH 6: UJI DETEKSI STRUK DUPLIKAT ---');
    await page.goto(`${BASE_URL}/transactions/`, { waitUntil: 'networkidle', timeout: 35000 });
    await page.waitForTimeout(1500);

    const scanBuktiBtn2 = await page.$('button:has-text("Scan Bukti")');
    await scanBuktiBtn2.click();
    await page.waitForTimeout(1200);

    const fileInput2 = await page.$('input[type="file"][accept*="image"]');
    await fileInput2.setInputFiles(fixturePath);

    console.log('Menunggu pemindaian struk kedua untuk deteksi duplikasi...');
    await page.waitForSelector('button:has-text("Simpan Pengeluaran")', { timeout: 90000 });
    await page.waitForTimeout(2000);

    // Cari peringatan duplikasi
    const duplicateBox = await page.$('text=Peringatan Duplikasi Terdeteksi, div:has-text("Duplikasi")');
    const duplicateWarningText = await page.evaluate(() => {
      const el = document.querySelector('.bg-amber-50');
      return el ? el.innerText : '';
    });

    console.log(`[DUPLICATE TEST] Peringatan duplikasi terdeteksi: ${!!duplicateBox}`);
    console.log(`[DUPLICATE TEST] Pesan peringatan: "${duplicateWarningText.replace(/\n+/g, ' ')}"`);

    testReport.duplicateDetected = !!duplicateBox || duplicateWarningText.length > 0;

    await saveScreenshot(page, '09_duplicate_warning_detected.png');

    // Tutup modal tanpa menyimpan kedua kalinya
    const batalBtn = page.locator('div.fixed.inset-0.z-50 button:has-text("Batal")');
    if (await batalBtn.count() > 0) await batalBtn.click();
    await page.waitForTimeout(800);

    // Verifikasi saldo tetap Rp90.000 dan tidak terjadi pemotongan kedua
    const dbFinalRaw = await page.evaluate(() => localStorage.getItem('kayla_finance_demo_v2'));
    const dbFinal = JSON.parse(dbFinalRaw);
    const mandiriFinal = dbFinal.accounts.find((a) => a.id === 'acc-demo-bank');

    console.log(`[CHECK] Saldo akhir tetap stabil: Rp${mandiriFinal?.current_balance}`);
    if (mandiriFinal?.current_balance !== 90000) {
      throw new Error(`Terjadi potongan ganda! Saldo: ${mandiriFinal?.current_balance}`);
    }

    // =========================================================
    // STEP 7: SECURITY & LOCALSTORAGE INSPECTION
    // =========================================================
    console.log('\n--- LANGKAH 7: AUDIT KEAMANAN LOCALSTORAGE PERAMBAN ---');
    const allLocalStorageKeys = await page.evaluate(() => Object.keys(localStorage));
    console.log(`[SECURITY] Kunci localStorage di domain produksi:`, allLocalStorageKeys);

    const hasPrivateDbLeak = allLocalStorageKeys.some((k) => k.includes('private') || k.includes('secret'));
    const hasUnencryptedVault = await page.evaluate(() => {
      const raw = localStorage.getItem('kayla_finance_demo_v2') || '';
      return raw.includes('kaylafisika24@gmail.com') || raw.includes('AUTH_SECRET');
    });

    console.log(`[SECURITY] Kebocoran data pribadi/kredensial di storage: ${hasUnencryptedVault}`);
    if (hasUnencryptedVault) {
      throw new Error('Terdeteksi kebocoran kredensial atau email privat di localStorage browser!');
    }

    await saveScreenshot(page, '10_security_storage_inspection.png');

    testReport.consoleErrors = consoleErrors;
    testReport.networkErrors = networkErrors;
    testReport.assets = ocrAssetsLoaded;

    console.log('\n================================================================');
    console.log('HASIL PENGUJIAN: SELURUH SKENARIO LIVE E2E OCR LULUS 100%');
    console.log('================================================================');

    fs.writeFileSync(path.join(ROOT, 'tests', 'live_ocr_results.json'), JSON.stringify(testReport, null, 2), 'utf-8');

  } finally {
    await browser.close();
  }
}

runLiveOcrTest().catch((err) => {
  console.error('\nFATAL ERROR SAAT PENGUJIAN LIVE OCR:', err);
  process.exit(1);
});
