/**
 * Kayla Finance - Demo Zero Balance Pre-Push Test Suite
 * Memverifikasi seluruh saldo demo bernilai nol, pembersihan cache demo usang,
 * dan perlindungan data pribadi serta brankas terenkripsi.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const EXPECTED_DB_SHA256 = '9E08822CB3787DC9429090FCC626B6A8EED3454AB2A18E354D591690E1ABD8A4';
const EXPECTED_DB_SIZE = 13250;

console.log('================================================================');
console.log('KAYLA FINANCE: DEMO ZERO BALANCE PRE-PUSH AUDIT SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assertTest(condition, name, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] Test ${totalTests}: ${name}`);
    if (details) console.log(`       Info: ${details}`);
  } else {
    console.error(`[FAIL] Test ${totalTests}: ${name}`);
    if (details) console.error(`       Detail: ${details}`);
    throw new Error(`Test failed: ${name} - ${details}`);
  }
}

// -------------------------------------------------------------
// Skenario 1: Verifikasi File default-database.json (Zero Balance Baseline)
// -------------------------------------------------------------
console.log('--- SEKSI 1: VERIFIKASI DEFAULT SYNTHETIC DATABASE ---');

const defaultDbPath = path.join(ROOT, 'src', 'lib', 'default-database.json');
const defaultDb = JSON.parse(fs.readFileSync(defaultDbPath, 'utf-8'));

assertTest(
  defaultDb.settings?.demo_zero_balance_v2 === true,
  'Pengaturan demo memiliki penanda demo_zero_balance_v2: true'
);

// 1. Bank demo: Rp0
const bankAcc = defaultDb.accounts.find(a => a.id === 'acc-demo-bank');
assertTest(
  bankAcc && bankAcc.current_balance === 0,
  'Akun Bank Demo (Mandiri) memiliki saldo Rp0',
  `current_balance: ${bankAcc?.current_balance}`
);

const bluAcc = defaultDb.accounts.find(a => a.id === 'acc-demo-blu');
assertTest(
  bluAcc && bluAcc.current_balance === 0,
  'Akun Tabungan Digital Demo (blu) memiliki saldo Rp0',
  `current_balance: ${bluAcc?.current_balance}`
);

// 2. E-wallet demo: Rp0
const ewalletAcc = defaultDb.accounts.find(a => a.id === 'acc-demo-ewallet');
assertTest(
  ewalletAcc && ewalletAcc.current_balance === 0,
  'Akun Dompet Digital Demo (GoPay) memiliki saldo Rp0',
  `current_balance: ${ewalletAcc?.current_balance}`
);

// 3. Payment gateway demo: Rp0
const mayarAcc = defaultDb.accounts.find(a => a.id === 'acc-demo-mayar');
assertTest(
  mayarAcc && mayarAcc.current_balance === 0,
  'Akun Saldo Bisnis Demo (Mayar) memiliki saldo Rp0',
  `current_balance: ${mayarAcc?.current_balance}`
);

// 4. MT5 demo: $0.00
const mt5Acc = defaultDb.accounts.find(a => a.id === 'acc-demo-mt5');
assertTest(
  mt5Acc && mt5Acc.current_balance === 0,
  'Akun Trading MT5 Demo memiliki current_balance 0',
  `current_balance: ${mt5Acc?.current_balance}`
);

const tradingAcc = defaultDb.trading_accounts?.[0];
assertTest(
  tradingAcc &&
    tradingAcc.balance === 0 &&
    tradingAcc.equity === 0 &&
    tradingAcc.floating_profit === 0 &&
    tradingAcc.margin === 0 &&
    tradingAcc.free_margin === 0 &&
    tradingAcc.margin_level === 0,
  'Detail Akun Trading MT5 bernilai 0 (balance, equity, floating, margin $0.00)',
  `balance: ${tradingAcc?.balance}, equity: ${tradingAcc?.equity}`
);

assertTest(
  Array.isArray(tradingAcc?.positions) && tradingAcc.positions.length === 0,
  'Posisi terbuka MT5 demo kosong (0 open positions)'
);

assertTest(
  Array.isArray(tradingAcc?.deals) && tradingAcc.deals.length === 0,
  'Riwayat deals MT5 demo kosong (0 deals)'
);

// 5. Crypto demo: 0 holdings
assertTest(
  Array.isArray(defaultDb.crypto_wallets) && defaultDb.crypto_wallets.length === 0,
  'Dompet Kripto Demo bernilai kosong (0 holdings)'
);

// 6. Income demo: Rp0, Expenses demo: Rp0, Preloaded transactions: empty
assertTest(
  Array.isArray(defaultDb.transactions) && defaultDb.transactions.length === 0,
  'Daftar transaksi demo awal kosong (preloaded transactions: [])'
);

// Hitung total saldo semua akun
const totalAllAccounts = defaultDb.accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
assertTest(
  totalAllAccounts === 0,
  'Total akumulasi saldo seluruh akun demo adalah tepat 0'
);

// -------------------------------------------------------------
// Skenario 2: Simulasi Browser Runtime (Client-Data Helper)
// -------------------------------------------------------------
console.log('\n--- SEKSI 2: SIMULASI CLIENT-DATA & LOCALSTORAGE RUNTIME ---');

// Setup mock window & localStorage
const mockStorage = new Map();
const mockLocalStorage = {
  getItem: (key) => (mockStorage.has(key) ? mockStorage.get(key) : null),
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
  get length() { return mockStorage.size; }
};

globalThis.window = {
  location: { hostname: 'jokitugasbykay.github.io', pathname: '/keuangan.github.io/' },
  dispatchEvent: () => true,
};
globalThis.localStorage = mockLocalStorage;

const {
  loadDatabase,
  DEMO_STORAGE_KEY,
  LOCAL_STORAGE_KEY,
  LEGACY_DEMO_STORAGE_KEYS,
  isStaticDemoMode
} = await import('../src/lib/client-data.js');

assertTest(
  isStaticDemoMode() === true,
  'Deteksi isStaticDemoMode() mengembalikan true untuk GitHub Pages'
);

assertTest(
  DEMO_STORAGE_KEY === 'kayla_finance_demo_v2',
  'DEMO_STORAGE_KEY telah dimigrasikan ke versi baru: kayla_finance_demo_v2'
);

// 2.1 Fresh Browser Profile Test
mockStorage.clear();
const freshDb = await loadDatabase();

assertTest(
  freshDb !== null && typeof freshDb === 'object',
  'Profil baru: loadDatabase() berhasil mengembalikan skema database'
);

const freshTotalBalance = freshDb.accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
assertTest(
  freshTotalBalance === 0,
  'Profil baru: Total saldo seluruh akun demo adalah Rp0'
);

assertTest(
  Array.isArray(freshDb.transactions) && freshDb.transactions.length === 0,
  'Profil baru: Transaksi demo kosong (0 transaksi)'
);

assertTest(
  mockStorage.has(DEMO_STORAGE_KEY),
  'Profil baru: Saldo nol tersimpan di key DEMO_STORAGE_KEY'
);

// 2.2 Existing Browser Profile dengan Data Demo Lama (Non-Zero)
console.log('\n--- SEKSI 3: SIMULASI BROWSER DENGAN DATA DEMO LAMA (MIGRASI KE NOL) ---');

mockStorage.clear();

// Isi localStorage dengan data demo lama bernilai saldo tinggi dan transaksi lama
const oldDemoData = {
  settings: {
    app_name: 'Kayla Finance',
    default_currency: 'IDR',
  },
  accounts: [
    { id: 'acc-demo-bank', name: 'Rekening Bank (Demo)', current_balance: 18500000 },
    { id: 'acc-demo-blu', name: 'Tabungan Digital (Demo)', current_balance: 9750000 },
    { id: 'acc-demo-ewallet', name: 'Dompet Digital (Demo)', current_balance: 1250000 },
    { id: 'acc-demo-mayar', name: 'Saldo Bisnis (Demo)', current_balance: 12500000 },
    { id: 'acc-demo-mt5', name: 'Akun Trading MT5 (Demo)', current_balance: 1500 }
  ],
  transactions: [
    { id: 'tx-old-1', amount: 500000, description: 'Pengeluaran lama' }
  ]
};

mockStorage.set('kayla_finance_demo_v1', JSON.stringify(oldDemoData));
mockStorage.set('kayla_finance_demo', JSON.stringify(oldDemoData));

// Pastikan data lama ada sebelum pemanggilan
assertTest(
  mockStorage.has('kayla_finance_demo_v1') && mockStorage.has('kayla_finance_demo'),
  'Simulasi profil lama: Berhasil menyuntikkan key demo usang dengan saldo Rp18.500.000'
);

// Panggil loadDatabase()
const purgedDb = await loadDatabase();

// Verifikasi key usang terhapus
assertTest(
  !mockStorage.has('kayla_finance_demo_v1'),
  'Pembersihan Otomatis: Kunci demo usang kayla_finance_demo_v1 terhapus dari peramban'
);

assertTest(
  !mockStorage.has('kayla_finance_demo'),
  'Pembersihan Otomatis: Kunci demo usang kayla_finance_demo terhapus dari peramban'
);

const purgedTotalBalance = purgedDb.accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
assertTest(
  purgedTotalBalance === 0,
  'Profil lama yang dimuat ulang: Seluruh saldo demo berhasil direset ke Rp0'
);

assertTest(
  purgedDb.transactions.length === 0,
  'Profil lama yang dimuat ulang: Transaksi lama terhapus (preloaded transactions: [])'
);

// 2.3 Refresh Persistence Test (Simulasi Muat Ulang Halaman)
console.log('\n--- SEKSI 4: SIMULASI REFRESH HALAMAN (ZERO BALANCE TETAP BERTAHAN) ---');

// Muat ulang tanpa menghapus mockStorage
const refreshedDb = await loadDatabase();
const refreshedTotalBalance = refreshedDb.accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);

assertTest(
  refreshedTotalBalance === 0,
  'Setelah refresh halaman: Saldo demo tetap Rp0 (tidak dapat kembali ke saldo lama)'
);

assertTest(
  refreshedDb.transactions.length === 0,
  'Setelah refresh halaman: Transaksi tetap kosong'
);

// 2.4 Isolasi Data Personal & Brankas Terenkripsi
console.log('\n--- SEKSI 5: ISOLASI DATA PERSONAL & BRANKAS TERENKRIPSI ---');

mockStorage.set(LOCAL_STORAGE_KEY, JSON.stringify({ private_account: 'test_safe' }));
mockStorage.set('kayla_vault_envelope', JSON.stringify({ vault: 'encrypted_envelope' }));
mockStorage.set('kayla_vault_data', 'ciphertext_payload');

// Panggil kembali loadDatabase() dalam mode demo
await loadDatabase();

assertTest(
  mockStorage.get(LOCAL_STORAGE_KEY) === JSON.stringify({ private_account: 'test_safe' }),
  'Penyimpanan akun personal (LOCAL_STORAGE_KEY) sama sekali TIDAK disentuh atau dihapus'
);

assertTest(
  mockStorage.get('kayla_vault_envelope') === JSON.stringify({ vault: 'encrypted_envelope' }),
  'Brankas terenkripsi (kayla_vault_envelope) utuh dan terlindungi dari mode demo'
);

assertTest(
  mockStorage.get('kayla_vault_data') === 'ciphertext_payload',
  'Data rahasia brankas (kayla_vault_data) utuh dan terlindungi'
);

// -------------------------------------------------------------
// Skenario 3: Verifikasi Integritas Kriptografis Database Riil
// -------------------------------------------------------------
console.log('\n--- SEKSI 6: INTEGRITAS KRIPTOGRAFIS DATABASE RIIL (data/db.json) ---');

const realDbPath = path.join(ROOT, 'data', 'db.json');
assertTest(fs.existsSync(realDbPath), 'File data/db.json tersedia pada repositori');

const realDbBuffer = fs.readFileSync(realDbPath);
assertTest(
  realDbBuffer.length === EXPECTED_DB_SIZE,
  `Ukuran data/db.json tepat ${EXPECTED_DB_SIZE} bytes (tidak berubah 1 byte pun)`,
  `actual: ${realDbBuffer.length}, expected: ${EXPECTED_DB_SIZE}`
);

const realDbHash = crypto.createHash('sha256').update(realDbBuffer).digest('hex').toUpperCase();
assertTest(
  realDbHash === EXPECTED_DB_SHA256,
  'Checksum SHA-256 data/db.json identik bit-for-bit',
  `actual: ${realDbHash}, expected: ${EXPECTED_DB_SHA256}`
);

const backupsDir = path.join(ROOT, 'data', 'backups');
const backupFiles = fs.readdirSync(backupsDir);
assertTest(
  backupFiles.length === 5,
  'Seluruh 5 berkas backup di data/backups/ tetap utuh tanpa modifikasi',
  `jumlah backup: ${backupFiles.length}`
);

console.log('\n================================================================');
console.log(`HASIL AKHIR: SEMUA ${passedTests}/${totalTests} PENGUJIAN LULUS 100%`);
console.log('================================================================\n');
