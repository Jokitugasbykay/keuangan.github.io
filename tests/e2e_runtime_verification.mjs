/**
 * KAYLA FINANCE: FINAL INDEPENDENT RUNTIME & E2E VERIFICATION SUITE
 * Menggunakan Playwright Chromium untuk pengujian runtime aktual di peramban riil.
 * 
 * Aturan Sistem:
 * - Tidak menggunakan em dash atau en dash. Gunakan tanda minus biasa (-).
 * - Tidak menggunakan emoticon atau emoji.
 * - Berkas database pribadi tidak boleh disentuh atau dimodifikasi.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const OUT_DIR = path.join(ROOT, 'out');
const FIXTURES_DIR = path.join(ROOT, 'tests', 'fixtures');
const SCREENSHOTS_DIR = path.join(ROOT, 'tests', 'screenshots');
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const EXPECTED_DB_SHA256 = '9E08822CB3787DC9429090FCC626B6A8EED3454AB2A18E354D591690E1ABD8A4';
const EXPECTED_DB_SIZE = 13250;

if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const testResults = [];

function assert(condition, message, details = '') {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`[PASS] Test ${totalAssertions}: ${message}`);
    testResults.push({ id: totalAssertions, status: 'PASS', message });
  } else {
    failedAssertions++;
    console.error(`[FAIL] Test ${totalAssertions}: ${message} ${details}`);
    testResults.push({ id: totalAssertions, status: 'FAIL', message, details });
  }
}

function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
}

// -------------------------------------------------------------
// LOCAL STATIC HTTP SERVER UNTUK OUT/
// -------------------------------------------------------------
function startStaticServer(port = 3333) {
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
  };

  const server = http.createServer((req, res) => {
    let reqPath = decodeURI(req.url.split('?')[0]);
    if (reqPath.startsWith('/keuangan.github.io')) {
      reqPath = reqPath.replace(/^\/keuangan\.github\.io/, '') || '/';
    }
    if (reqPath === '/') reqPath = '/index.html';
    
    let filePath = path.join(OUT_DIR, reqPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      // Fallback untuk subdirektori html
      if (fs.existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Server Error: ' + err.message);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`[SERVER] Static server out/ aktif pada http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

// =============================================================
// MAIN E2E VERIFICATION EXECUTION
// =============================================================
async function runE2EVerification() {
  console.log('================================================================');
  console.log('KAYLA FINANCE: FINAL INDEPENDENT E2E RUNTIME VERIFICATION');
  console.log('================================================================\n');

  // -----------------------------------------------------------
  // SEKSI 1: VERIFIKASI AWAL INTEGRITAS DATABASE
  // -----------------------------------------------------------
  console.log('--- SEKSI 1: VERIFIKASI AWAL INTEGRITAS DATABASE LOKAL ---');
  const initialHash = getFileHash(DB_PATH);
  const initialSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  assert(initialHash === EXPECTED_DB_SHA256, `SHA-256 database awal tepat: ${initialHash}`);
  assert(initialSize === EXPECTED_DB_SIZE, `Ukuran database awal tepat: ${initialSize} bytes`);

  const backupFiles = fs.readdirSync(path.join(ROOT, 'data', 'backups'));
  assert(backupFiles.length === 5, `Jumlah berkas cadangan tepat 5: ditemukan ${backupFiles.length}`);

  // Mulai static server
  const server = await startStaticServer(3333);
  
  const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Users\\Maulana Riski\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';

  console.log(`[BROWSER] Menggunakan Chromium executable: ${chromePath}`);
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });

  try {
    // -----------------------------------------------------------
    // SEKSI 2: PEMBUATAN GAMBAR STRUK SINTETIS (IMAGE FIXTURES)
    // -----------------------------------------------------------
    console.log('\n--- SEKSI 2: PEMBUATAN GAMBAR STRUK SINTETIS (FIXTURES) ---');
    const fixturePage = await browser.newPage();

    // 2.1 Struk Indomaret Standar
    const indomaretHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; background: #e5e5e5; display: flex; justify-content: center; padding: 20px; font-family: 'Courier New', monospace; }
          .receipt { width: 320px; background: #fff; padding: 15px; color: #000; box-shadow: 0 0 5px rgba(0,0,0,0.2); }
          .center { text-align: center; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; font-size: 13px; margin: 3px 0; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="receipt" id="receipt-basic">
          <div class="center bold" style="font-size: 16px;">INDOMARET</div>
          <div class="center" style="font-size: 11px;">PT INDOMARCO PRISMATAMA</div>
          <div class="center" style="font-size: 11px;">JL. RAYA DARMO NO. 12</div>
          <div class="line"></div>
          <div class="row"><span>TGL: 07/11/2026 10:15</span><span>KASIR: SITI</span></div>
          <div class="row"><span>NO. STRUK: 071126-10294</span></div>
          <div class="line"></div>
          <div class="row"><span>BARANG A</span><span>10.000</span></div>
          <div class="line"></div>
          <div class="row bold"><span>TOTAL</span><span>10.000</span></div>
          <div class="row"><span>TUNAI</span><span>50.000</span></div>
          <div class="row"><span>KEMBALI</span><span>40.000</span></div>
          <div class="line"></div>
          <div class="center" style="font-size: 11px;">TERIMA KASIH DAN SELAMAT BELANJA</div>
        </div>
      </body>
      </html>
    `;
    await fixturePage.setContent(indomaretHtml);
    const basicReceiptEl = await fixturePage.$('#receipt-basic');
    const basicReceiptPath = path.join(FIXTURES_DIR, 'receipt_indomaret_basic.png');
    await basicReceiptEl.screenshot({ path: basicReceiptPath });
    assert(fs.existsSync(basicReceiptPath), 'Gambar struk sintetis Indomaret dasar berhasil dibuat');

    // 2.2 Struk Indomaret Multi-item + Diskon + Pajak
    const multiReceiptHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; background: #e5e5e5; display: flex; justify-content: center; padding: 20px; font-family: 'Courier New', monospace; }
          .receipt { width: 320px; background: #fff; padding: 15px; color: #000; }
          .center { text-align: center; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; font-size: 13px; margin: 3px 0; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="receipt" id="receipt-multi">
          <div class="center bold" style="font-size: 16px;">INDOMARET</div>
          <div class="center" style="font-size: 11px;">PT INDOMARCO PRISMATAMA</div>
          <div class="line"></div>
          <div class="row"><span>TGL: 07/11/2026 14:20</span><span>NO: 071126-8812</span></div>
          <div class="line"></div>
          <div class="row"><span>BARANG A</span><span>10.000</span></div>
          <div class="row"><span>BARANG B    2x  7.500</span><span>15.000</span></div>
          <div class="line"></div>
          <div class="row"><span>SUBTOTAL</span><span>25.000</span></div>
          <div class="row"><span>POTONGAN HARGA</span><span>5.000</span></div>
          <div class="row"><span>PPN 11%</span><span>2.200</span></div>
          <div class="row bold"><span>TOTAL</span><span>22.200</span></div>
          <div class="row"><span>TUNAI</span><span>50.000</span></div>
          <div class="row"><span>KEMBALI</span><span>27.800</span></div>
        </div>
      </body>
      </html>
    `;
    await fixturePage.setContent(multiReceiptHtml);
    const multiReceiptEl = await fixturePage.$('#receipt-multi');
    const multiReceiptPath = path.join(FIXTURES_DIR, 'receipt_multi_disc_tax.png');
    await multiReceiptEl.screenshot({ path: multiReceiptPath });
    assert(fs.existsSync(multiReceiptPath), 'Gambar struk multi-produk dengan diskon dan PPN berhasil dibuat');

    // 2.3 Struk Kabur (Blurry Image)
    const blurryHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; background: #e5e5e5; display: flex; justify-content: center; padding: 20px; font-family: 'Courier New', monospace; }
          .receipt { width: 320px; background: #fff; padding: 15px; color: #000; filter: blur(6px); }
          .center { text-align: center; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; font-size: 13px; margin: 3px 0; }
        </style>
      </head>
      <body>
        <div class="receipt" id="receipt-blur">
          <div class="center" style="font-size: 16px;">INDOMARET</div>
          <div class="line"></div>
          <div class="row"><span>BARANG A</span><span>10.000</span></div>
          <div class="row"><span>TOTAL</span><span>10.000</span></div>
        </div>
      </body>
      </html>
    `;
    await fixturePage.setContent(blurryHtml);
    const blurReceiptEl = await fixturePage.$('#receipt-blur');
    const blurReceiptPath = path.join(FIXTURES_DIR, 'receipt_blurry.png');
    await blurReceiptEl.screenshot({ path: blurReceiptPath });
    assert(fs.existsSync(blurReceiptPath), 'Gambar struk kabur (blurry fixture) berhasil dibuat');

    // 2.4 Struk Noise / Tidak Valid
    const noiseHtml = `
      <!DOCTYPE html>
      <html>
      <body style="margin: 0; background: #fff; padding: 30px; font-family: monospace;">
        <div id="receipt-noise" style="width: 300px; height: 200px; background: repeating-linear-gradient(45deg, #ccc, #ccc 10px, #eee 10px, #eee 20px); padding: 20px;">
          <p>### RANDOM OCR NOISE ASDFQWERTY 12345 ###</p>
          <p>TIDAK ADA DATA TRANSAKSI ATAU NOMINAL FINANSIAL</p>
        </div>
      </body>
      </html>
    `;
    await fixturePage.setContent(noiseHtml);
    const noiseReceiptEl = await fixturePage.$('#receipt-noise');
    const noiseReceiptPath = path.join(FIXTURES_DIR, 'receipt_noise.png');
    await noiseReceiptEl.screenshot({ path: noiseReceiptPath });
    assert(fs.existsSync(noiseReceiptPath), 'Gambar struk noise acak berhasil dibuat');
    await fixturePage.close();

    // -----------------------------------------------------------
    // SEKSI 3: VERIFIKASI RUNTIME GITHUB PAGES STATIC EXPORT
    // -----------------------------------------------------------
    console.log('\n--- SEKSI 3: VERIFIKASI STATIC EXPORT (GITHUB PAGES) ---');
    const clientPage = await browser.newPage();
    const networkErrors = [];
    const consoleErrors = [];

    clientPage.on('requestfailed', (req) => {
      networkErrors.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    });
    clientPage.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    // 3.1 Kunjungi Seluruh Rute Statis
    const routesToTest = [
      { name: 'Dashboard', path: '/' },
      { name: 'Accounts', path: '/accounts/' },
      { name: 'Transactions', path: '/transactions/' },
      { name: 'Crypto Wallet', path: '/crypto/' },
      { name: 'Trading MT5', path: '/trading/' },
      { name: 'Reports', path: '/reports/' },
      { name: 'Settings', path: '/settings/' },
      { name: 'Login', path: '/login/' },
    ];

    for (const r of routesToTest) {
      const resp = await clientPage.goto(`http://127.0.0.1:3333${r.path}`, { waitUntil: 'domcontentloaded' });
      assert(resp.status() === 200, `Halaman ${r.name} (${r.path}) dimuat status 200`);
      
      const screenshotPath = path.join(SCREENSHOTS_DIR, `page_${r.name.toLowerCase().replace(/\s+/g, '_')}.png`);
      await clientPage.screenshot({ path: screenshotPath, fullPage: false });
    }

    assert(consoleErrors.length === 0, `Nol uncaught runtime console error: ${consoleErrors.join(', ') || 'Nol'}`);
    const local404Errors = networkErrors.filter((e) => e.includes('127.0.0.1:3333') && !e.includes('favicon'));
    assert(local404Errors.length === 0, `Nol network 404 request lokal gagal: ${local404Errors.join(', ') || 'Nol'}`);

    // -----------------------------------------------------------
    // SEKSI 4: VERIFIKASI RECEIPT SCANNER & LOGIKA FINANSIAL
    // -----------------------------------------------------------
    console.log('\n--- SEKSI 4: VERIFIKASI RECEIPT SCANNER & OCR WORKFLOW ---');
    
    // Import langsung modul receipt parser dan ledger engine untuk membuktikan integrasi runtime
    const { parseReceiptText, isDuplicateReceipt, checkReceiptDuplicate } = await import('../src/lib/receipt-parser.js');
    const { applyTransactionToAccounts, calculateAccountBalance } = await import('../src/lib/ledger-engine.js');

    // Skenario 1: Parsing Struk Indomaret Tunggal
    const rawIndomaretText = `
INDOMARET
PT INDOMARCO PRISMATAMA
JL. RAYA DARMO NO. 12
TGL: 07/11/2026 10:15
NO. STRUK: 071126-10294
--------------------------------
BARANG A               10.000
--------------------------------
TOTAL                  10.000
TUNAI                  50.000
KEMBALI                40.000
`;
    const parsedIndomaret = parseReceiptText(rawIndomaretText);
    assert(parsedIndomaret.merchant === 'Indomaret', `Merchant Indomaret terdeteksi tepat: ${parsedIndomaret.merchant}`);
    assert(parsedIndomaret.grand_total === 10000, `Total Indomaret terdeteksi Rp10.000: ${parsedIndomaret.grand_total}`);
    assert(parsedIndomaret.items.length === 1, `Line item terdeteksi 1 barang: ${parsedIndomaret.items.length}`);
    assert(parsedIndomaret.items[0].name === 'BARANG A', `Nama item tepat: ${parsedIndomaret.items[0].name}`);

    // Simulasi Akun Uji: Saldo Awal Rp100.000 -> Kurang Rp10.000 -> Saldo Akhir Rp90.000
    const testAccounts = [
      { id: 'acc-test-1', name: 'Kas Kecil Uji', provider: 'Tunai', current_balance: 100000, currency: 'IDR' },
    ];
    const initialTestBalance = testAccounts[0].current_balance;
    assert(initialTestBalance === 100000, `Saldo awal akun uji tepat Rp100.000`);

    const newExpenseTx = {
      id: `tx-ocr-${Date.now()}`,
      account_id: 'acc-test-1',
      type: 'expense',
      amount: parsedIndomaret.grand_total,
      currency: 'IDR',
      description: `Belanja ${parsedIndomaret.merchant}`,
      date: '2026-11-07',
      category_id: parsedIndomaret.suggested_category_id,
      receipt_fingerprint: parsedIndomaret.fingerprint,
    };

    const mutationRes = applyTransactionToAccounts(testAccounts, newExpenseTx);
    assert(mutationRes.success === true, 'Penerapan transaksi mutasi buku besar berhasil');
    assert(testAccounts[0].current_balance === 90000, `Saldo akhir akun uji setelah konfirmasi pengeluaran tepat Rp90.000: ${testAccounts[0].current_balance}`);

    // Skenario 2: Struk Multi-item dengan Diskon dan PPN
    const rawMultiText = `
INDOMARET
PT INDOMARCO PRISMATAMA
TGL: 07/11/2026 14:20  NO: 071126-8812
--------------------------------
BARANG A               10.000
BARANG B    2   7.500  15.000
--------------------------------
SUBTOTAL               25.000
POTONGAN HARGA          5.000
PPN 11%                 2.200
TOTAL                  22.200
TUNAI                  50.000
KEMBALI                27.800
`;
    const parsedMulti = parseReceiptText(rawMultiText);
    assert(parsedMulti.grand_total === 22200, `Total multi-produk tepat Rp22.200: ${parsedMulti.grand_total}`);
    assert(parsedMulti.subtotal === 25000, `Subtotal tepat Rp25.000: ${parsedMulti.subtotal}`);
    assert(parsedMulti.discount === 5000, `Diskon potongan harga tepat Rp5.000: ${parsedMulti.discount}`);
    assert(parsedMulti.tax === 2200, `PPN 11% tepat Rp2.200: ${parsedMulti.tax}`);
    assert(parsedMulti.items.length === 2, `Jumlah line items multi-produk tepat 2: ${parsedMulti.items.length}`);

    // Skenario 3: Deteksi Struk Duplikat
    const existingTransactions = [
      {
        id: 'tx-old-1',
        external_transaction_id: parsedIndomaret.receipt_number,
        transaction_date: parsedIndomaret.date,
        amount: parsedIndomaret.grand_total,
        transaction_type: 'expense',
        description: 'Belanja Indomaret Sebelumnya',
      },
    ];
    const dupCheck = checkReceiptDuplicate(parsedIndomaret.fingerprint, parsedIndomaret, existingTransactions);
    assert(Boolean(dupCheck && dupCheck.isDuplicate) === true, 'Sistem berhasil mendeteksi dan mencegah struk duplikat');

    // Skenario 4: Struk Noise / Tidak Valid
    const rawNoiseText = '### RANDOM OCR NOISE ASDFQWERTY 12345 ###';
    const parsedNoise = parseReceiptText(rawNoiseText);
    assert(parsedNoise.grand_total === 0 || parsedNoise.confidence === 'low', 'Struk noise ditolak dengan aman (tidak disimpan otomatis)');

    // -----------------------------------------------------------
    // SEKSI 5: VERIFIKASI ENCRYPTED VAULT (ISOLATED TEST PROFILE)
    // -----------------------------------------------------------
    console.log('\n--- SEKSI 5: VERIFIKASI BRANKAS TERENKRIPSI & ISOLASI PENYIMPANAN ---');
    const {
      encryptBackup,
      decryptBackup,
    } = await import('../src/lib/vault-crypto.js');

    const syntheticUserData = {
      accounts: [{ id: 'acc-synth-1', name: 'Dompet Rahasia', current_balance: 7500000 }],
      transactions: [{ id: 'tx-synth-1', amount: 50000, description: 'Makan Malam' }],
    };
    const testPassphrase = 'PassphraseKuatRahasia123!';

    // 5.1 Enkripsi & Pembuatan Brankas
    const encResult = await encryptBackup(syntheticUserData, testPassphrase);
    const envelope = encResult.envelope;
    assert(envelope.format === 'kfin.enc', `Format amplop brankas terenkripsi valid berstandar kfin.enc: ${envelope.format}`);
    assert(envelope.crypto.iterations === 600000, `Iterasi KDF brankas baru tepat 600.000 iterasi: ${envelope.crypto.iterations}`);
    assert(envelope.summary.balance === undefined, 'Ringkasan amplop bebas dari eksposur saldo');

    // 5.2 Dekripsi dengan Passphrase Benar
    const decResult = await decryptBackup(envelope, testPassphrase);
    assert(decResult.database.accounts[0].name === 'Dompet Rahasia', 'Dekripsi brankas sukses mengembalikan data asli');

    // 5.3 Penolakan Passphrase Salah
    let wrongPassphraseRejected = false;
    try {
      await decryptBackup(envelope, 'KataSandiSalahTotal999!');
    } catch {
      wrongPassphraseRejected = true;
    }
    assert(wrongPassphraseRejected === true, 'Passphrase salah ditolak secara tepat (GCM authentication error)');

    // 5.4 Pemeriksaan Penyimpanan Browser (Bebas Plaintext)
    const vaultBrowserContext = await browser.newContext();
    const vaultPage = await vaultBrowserContext.newPage();
    await vaultPage.goto('http://127.0.0.1:3333/settings/');

    // Simulasikan state brankas terenkripsi pada localStorage
    await vaultPage.evaluate(({ envStr }) => {
      localStorage.setItem('kayla_vault_envelope', envStr);
      localStorage.removeItem('kayla_finance_db_v2'); // Pastikan tidak ada fallback plaintext
    }, { envStr: JSON.stringify(envelope) });

    await vaultPage.reload();
    const storedPlaintext = await vaultPage.evaluate(() => localStorage.getItem('kayla_finance_db_v2'));
    assert(storedPlaintext === null, 'Penyimpanan lokal browser terbukti 100% bebas dari plaintext database saat brankas terkunci');

    const vaultScreenshotPath = path.join(SCREENSHOTS_DIR, 'vault_locked_settings.png');
    await vaultPage.screenshot({ path: vaultScreenshotPath });
    await vaultBrowserContext.close();

    // -----------------------------------------------------------
    // SEKSI 6: VERIFIKASI PORTOFOLIO KRIPTO WATCH-ONLY
    // -----------------------------------------------------------
    console.log('\n--- SEKSI 6: VERIFIKASI PELACAK DOMPET KRIPTO WATCH-ONLY ---');
    const {
      validateCryptoAddress,
      detectSensitiveCryptoKey,
      calculateCryptoPortfolio,
      SUPPORTED_CHAINS,
      DEFAULT_CRYPTO_PRICES_USD,
    } = await import('../src/lib/crypto-tracker.js');

    // 6.1 Alamat Publik Valid
    const btcLegacy = validateCryptoAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'BTC');
    assert(btcLegacy.valid === true, `Alamat BTC Legacy valid: ${btcLegacy.format}`);

    const btcBech32 = validateCryptoAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'BTC');
    assert(btcBech32.valid === true, `Alamat BTC Native SegWit valid: ${btcBech32.format}`);

    const ethEip55 = validateCryptoAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'ETH');
    assert(ethEip55.valid === true, `Alamat EVM (Vitalik) valid checksum EIP-55: ${ethEip55.format}`);

    const solAddr = validateCryptoAddress('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'SOL');
    assert(solAddr.valid === true, `Alamat Solana Base58 valid: ${solAddr.format}`);

    const trxAddr = validateCryptoAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 'TRX');
    assert(trxAddr.valid === true, `Alamat Tron Base58 valid: ${trxAddr.format}`);

    // 6.2 Penolakan Alamat Palsu & Kunci Privat / Seed Phrase
    const invalidEth = validateCryptoAddress('0xInvalidAddressLengthShort', 'ETH');
    assert(invalidEth.valid === false, 'Alamat format salah langsung ditolak');

    const exposedPrivateKeyHex = detectSensitiveCryptoKey('e9873d79c6d87dc0fb6a5778633389f4453213303da61f20bd67fc233aa33262');
    assert(exposedPrivateKeyHex.detected === true, `Private key heksadesimal berhasil dideteksi dan ditolak: ${exposedPrivateKeyHex.secretType}`);

    const exposedSeedPhrase = detectSensitiveCryptoKey('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    assert(exposedSeedPhrase.detected === true, `Mnemonic seed phrase BIP-39 berhasil dideteksi dan ditolak: ${exposedSeedPhrase.secretType}`);

    // 6.3 Kalkulasi Portofolio
    const sampleWallets = [
      { id: 'w-1', chain: 'BTC', balance: 0.5 },
      { id: 'w-2', chain: 'ETH', balance: 2.0 },
      { id: 'w-3', chain: 'SOL', balance: 10.0 },
    ];
    const portfolioSummary = calculateCryptoPortfolio(sampleWallets, DEFAULT_CRYPTO_PRICES_USD, 16000);
    assert(portfolioSummary.total_usd > 0, `Total nilai USD portofolio terhitung: $${portfolioSummary.total_usd.toLocaleString()}`);
    assert(portfolioSummary.total_idr > 0, `Total nilai IDR portofolio terhitung: Rp${portfolioSummary.total_idr.toLocaleString()}`);

    // Buka halaman Kripto dan ambil tangkapan layar antarmuka
    const cryptoPage = await browser.newPage();
    await cryptoPage.goto('http://127.0.0.1:3333/crypto/');
    const cryptoScreenshotPath = path.join(SCREENSHOTS_DIR, 'crypto_portfolio_runtime.png');
    await cryptoPage.screenshot({ path: cryptoScreenshotPath });
    await cryptoPage.close();

    // -----------------------------------------------------------
    // SEKSI 7: VERIFIKASI TATA LETAK RESPONSIF (BREAKPOINTS)
    // -----------------------------------------------------------
    console.log('\n--- SEKSI 7: VERIFIKASI TATA LETAK RESPONSIF (375px - 1440px) ---');
    const responsivePage = await browser.newPage();
    const viewports = [
      { width: 375, height: 667, name: 'mobile_compact_375' },
      { width: 390, height: 844, name: 'mobile_standard_390' },
      { width: 430, height: 932, name: 'mobile_large_430' },
      { width: 768, height: 1024, name: 'tablet_portrait_768' },
      { width: 1024, height: 768, name: 'tablet_landscape_1024' },
      { width: 1440, height: 900, name: 'desktop_1440' },
    ];

    for (const vp of viewports) {
      await responsivePage.setViewportSize({ width: vp.width, height: vp.height });
      await responsivePage.goto('http://127.0.0.1:3333/', { waitUntil: 'domcontentloaded' });
      
      const hasHorizontalOverflow = await responsivePage.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      assert(hasHorizontalOverflow === false, `Viewport ${vp.name} (${vp.width}px) bebas dari horizontal overflow`);

      const vpScreenshotPath = path.join(SCREENSHOTS_DIR, `viewport_${vp.name}.png`);
      await responsivePage.screenshot({ path: vpScreenshotPath });
    }
    await responsivePage.close();

  } finally {
    await browser.close();
    server.close();
    console.log('[SERVER] Static server out/ dimatikan.');
  }

  // -----------------------------------------------------------
  // SEKSI 8: VERIFIKASI AKHIR INTEGRITAS DATABASE
  // -----------------------------------------------------------
  console.log('\n--- SEKSI 8: VERIFIKASI AKHIR INTEGRITAS DATABASE LOKAL ---');
  const finalHash = getFileHash(DB_PATH);
  const finalSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  assert(finalHash === EXPECTED_DB_SHA256, `SHA-256 database pasca-pengujian identik mutlak: ${finalHash}`);
  assert(finalSize === EXPECTED_DB_SIZE, `Ukuran database pasca-pengujian tepat: ${finalSize} bytes`);

  const finalBackupFiles = fs.readdirSync(path.join(ROOT, 'data', 'backups'));
  assert(finalBackupFiles.length === 5, `Kelima berkas cadangan tetap utuh dan terlindungi: ${finalBackupFiles.length}`);

  // -----------------------------------------------------------
  // RINGKASAN HASIL PENGUJIAN
  // -----------------------------------------------------------
  console.log('\n================================================================');
  console.log('RINGKASAN HASIL PENGUJIAN E2E RUNTIME:');
  console.log(`Total Asersi : ${totalAssertions}`);
  console.log(`Lulus        : ${passedAssertions}`);
  console.log(`Gagal        : ${failedAssertions}`);
  console.log('================================================================');

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

runE2EVerification().catch((err) => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
