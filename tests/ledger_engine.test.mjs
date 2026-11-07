/**
 * Test Suite: Financial Ledger Engine Verification
 * Memverifikasi ketahanan matematis dan keandalan buku besar otoritatif Kayla Finance:
 * 1. Presisi aritmatika IEEE-754 (akumulasi 1000x 0.01 USD = 10.00 USD tanpa drift, 0.1 + 0.2 = 0.3)
 * 2. Validasi transaksi ketat (angka negatif, NaN, tanggal invalid, akun tiada, transfer ke diri sendiri)
 * 3. Kalkulasi saldo rekening murni (opening balance + income - expense + transfer in - transfer out + adj)
 * 4. Isolasi transfer ketat (transfer tidak boleh masuk ke income/expense umum)
 * 5. Rekonsiliasi akun & database (deteksi cached != computed)
 * 6. Mutasi memori atomik & revert balance
 * 7. Multi-currency (IDR & USD) serta estimasi Net Worth terpadu
 */

import { register } from 'node:module';
import assert from 'node:assert/strict';

// Daftarkan ESM loader untuk resolusi alias @/ jika diperlukan
try {
  register('./loader.mjs', import.meta.url);
} catch {
  // Loader opsional jika dieksekusi langsung
}

import {
  toMinorUnits,
  fromMinorUnits,
  roundCurrency,
  addCurrency,
  subtractCurrency,
  multiplyCurrency,
  calculateAccountBalance,
  reconcileAccount,
  reconcileAllAccounts,
  calculateFinancialTotals,
  validateTransaction,
  applyTransactionToAccounts,
  revertTransactionFromAccounts,
} from '../src/lib/ledger-engine.js';

let passedTests = 0;
let failedTests = 0;

function runTest(testName, testFn) {
  try {
    testFn();
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${testName}`);
    console.error(`       Pesan: ${err.message}`);
    failedTests++;
  }
}

console.log('================================================================');
console.log('KAYLA FINANCE: FINANCIAL LEDGER ENGINE TEST SUITE');
console.log('================================================================\n');

// -------------------------------------------------------------
// SEKSI 1: PRESISI ARITMATIKA & KONVERSI MINOR UNIT (IEEE-754)
// -------------------------------------------------------------
console.log('--- SEKSI 1: PRESISI ARITMATIKA & MINOR UNITS ---');

runTest('1.1: 0.1 + 0.2 USD menghasilkan 0.30 USD tepat tanpa floating point drift', () => {
  const nativeSum = 0.1 + 0.2; // Native JS: 0.30000000000000004
  assert.notStrictEqual(nativeSum, 0.3, 'Native JS float arithmetic harus memiliki drift');

  const safeSum = addCurrency(0.1, 0.2, 'USD');
  assert.strictEqual(safeSum, 0.3, 'addCurrency harus mengembalikan tepat 0.3');
});

runTest('1.2: 0.3 - 0.2 USD menghasilkan 0.10 USD tepat tanpa floating point drift', () => {
  const nativeDiff = 0.3 - 0.2; // Native JS: 0.09999999999999998
  assert.notStrictEqual(nativeDiff, 0.1, 'Native JS float arithmetic harus memiliki drift');

  const safeDiff = subtractCurrency(0.3, 0.2, 'USD');
  assert.strictEqual(safeDiff, 0.1, 'subtractCurrency harus mengembalikan tepat 0.1');
});

runTest('1.3: Akumulasi 1000x transaksi 0.01 USD menghasilkan tepat 10.00 USD tanpa drift', () => {
  let balance = 0;
  for (let i = 0; i < 1000; i++) {
    balance = addCurrency(balance, 0.01, 'USD');
  }
  assert.strictEqual(balance, 10.0, 'Akumulasi 1000x 0.01 USD harus tepat 10.00 USD');
});

runTest('1.4: Pengurangan berulang 1000x transaksi 0.01 USD dari 10.00 USD menghasilkan tepat 0.00 USD', () => {
  let balance = 10.0;
  for (let i = 0; i < 1000; i++) {
    balance = subtractCurrency(balance, 0.01, 'USD');
  }
  assert.strictEqual(balance, 0, 'Pengurangan 1000x 0.01 USD harus tepat 0');
});

runTest('1.5: toMinorUnits dan fromMinorUnits roundtrip IDR (faktor 1)', () => {
  const val = 1250000;
  const minor = toMinorUnits(val, 'IDR');
  assert.strictEqual(minor, 1250000);
  const back = fromMinorUnits(minor, 'IDR');
  assert.strictEqual(back, 1250000);
});

runTest('1.6: toMinorUnits dan fromMinorUnits roundtrip USD (faktor 100)', () => {
  const val = 1500.25;
  const minor = toMinorUnits(val, 'USD');
  assert.strictEqual(minor, 150025);
  const back = fromMinorUnits(minor, 'USD');
  assert.strictEqual(back, 1500.25);
});

runTest('1.7: roundCurrency membulatkan nominal IDR menjadi integer tanpa desimal', () => {
  assert.strictEqual(roundCurrency(15499.8, 'IDR'), 15500);
  assert.strictEqual(roundCurrency(15499.2, 'IDR'), 15499);
});

runTest('1.8: roundCurrency mempertahankan batas 2 desimal pada USD', () => {
  assert.strictEqual(roundCurrency(19.999, 'USD'), 20.0);
  assert.strictEqual(roundCurrency(19.994, 'USD'), 19.99);
});

runTest('1.9: multiplyCurrency menghitung perkalian nominal secara presisi', () => {
  const total = multiplyCurrency(10.5, 3, 'USD');
  assert.strictEqual(total, 31.5);
});

runTest('1.10: toMinorUnits melemparkan TypeError pada input invalid', () => {
  assert.throws(() => toMinorUnits('invalid', 'IDR'), /TypeError/);
  assert.throws(() => toMinorUnits(NaN, 'USD'), /TypeError/);
  assert.throws(() => toMinorUnits(Infinity, 'USD'), /TypeError/);
});

// -------------------------------------------------------------
// SEKSI 2: VALIDASI TRANSAKSI KETAT
// -------------------------------------------------------------
console.log('\n--- SEKSI 2: VALIDASI TRANSAKSI KETAT ---');

const mockAccounts = [
  { id: 'acc-bank', name: 'Bank Mandiri', currency: 'IDR', current_balance: 10000000 },
  { id: 'acc-ewallet', name: 'GoPay', currency: 'IDR', current_balance: 500000 },
  { id: 'acc-trading', name: 'MT5 USD', currency: 'USD', current_balance: 1500.0 },
];

runTest('2.1: Transaksi sah lolos validasi', () => {
  const tx = {
    account_id: 'acc-bank',
    amount: 500000,
    transaction_date: '2026-11-01T10:00:00.000Z',
    transaction_type: 'income',
  };
  const res = validateTransaction(tx, mockAccounts);
  assert.strictEqual(res.valid, true);
});

runTest('2.2: Penolakan transaksi dengan nominal <= 0', () => {
  const txZero = {
    account_id: 'acc-bank',
    amount: 0,
    transaction_date: '2026-11-01T10:00:00.000Z',
    transaction_type: 'income',
  };
  assert.strictEqual(validateTransaction(txZero, mockAccounts).valid, false);

  const txNegative = { ...txZero, amount: -15000 };
  assert.strictEqual(validateTransaction(txNegative, mockAccounts).valid, false);
});

runTest('2.3: Penolakan nominal NaN atau non-finite', () => {
  const txNaN = {
    account_id: 'acc-bank',
    amount: 'bukan-angka',
    transaction_date: '2026-11-01T10:00:00.000Z',
    transaction_type: 'expense',
  };
  assert.strictEqual(validateTransaction(txNaN, mockAccounts).valid, false);
});

runTest('2.4: Penolakan format tanggal tidak valid', () => {
  const txDate = {
    account_id: 'acc-bank',
    amount: 50000,
    transaction_date: '2026-99-99-invalid',
    transaction_type: 'expense',
  };
  assert.strictEqual(validateTransaction(txDate, mockAccounts).valid, false);
});

runTest('2.5: Penolakan jenis transaksi di luar daftar sah', () => {
  const txType = {
    account_id: 'acc-bank',
    amount: 50000,
    transaction_date: '2026-11-01T10:00:00.000Z',
    transaction_type: 'gambling_unsupported',
  };
  assert.strictEqual(validateTransaction(txType, mockAccounts).valid, false);
});

runTest('2.6: Penolakan jika akun sumber tidak terdaftar', () => {
  const txAcc = {
    account_id: 'acc-hantu',
    amount: 50000,
    transaction_date: '2026-11-01T10:00:00.000Z',
    transaction_type: 'expense',
  };
  const res = validateTransaction(txAcc, mockAccounts);
  assert.strictEqual(res.valid, false);
  assert.match(res.error, /tidak ditemukan/);
});

runTest('2.7: Penolakan transfer jika tidak menyertakan destination_account_id', () => {
  const txTrf = {
    account_id: 'acc-bank',
    amount: 250000,
    transaction_date: '2026-11-01T10:00:00.000Z',
    transaction_type: 'transfer',
  };
  const res = validateTransaction(txTrf, mockAccounts);
  assert.strictEqual(res.valid, false);
  assert.match(res.error, /tujuan/);
});

runTest('2.8: Penolakan transfer ke akun yang sama (source === destination)', () => {
  const txSame = {
    account_id: 'acc-bank',
    destination_account_id: 'acc-bank',
    amount: 250000,
    transaction_date: '2026-11-01T10:00:00.000Z',
    transaction_type: 'transfer',
  };
  const res = validateTransaction(txSame, mockAccounts);
  assert.strictEqual(res.valid, false);
  assert.match(res.error, /tidak boleh sama/);
});

runTest('2.9: Penolakan transfer jika akun tujuan tidak terdaftar', () => {
  const txNoDest = {
    account_id: 'acc-bank',
    destination_account_id: 'acc-tidak-ada',
    amount: 250000,
    transaction_date: '2026-11-01T10:00:00.000Z',
    transaction_type: 'transfer',
  };
  const res = validateTransaction(txNoDest, mockAccounts);
  assert.strictEqual(res.valid, false);
});

// -------------------------------------------------------------
// SEKSI 3: KALKULASI SALDO REKENING OTORITATIF
// -------------------------------------------------------------
console.log('\n--- SEKSI 3: KALKULASI SALDO OTORITATIF ---');

runTest('3.1: Saldo awal dihitung dengan benar tanpa transaksi', () => {
  const acc = { id: 'acc-bank', currency: 'IDR', initial_balance: 5000000 };
  const bal = calculateAccountBalance(acc, []);
  assert.strictEqual(bal, 5000000);
});

runTest('3.2: Transaksi Income menambah saldo rekening', () => {
  const acc = { id: 'acc-bank', currency: 'IDR', initial_balance: 1000000 };
  const txs = [
    { account_id: 'acc-bank', amount: 500000, transaction_type: 'income' },
    { destination_account_id: 'acc-bank', amount: 250000, transaction_type: 'income' },
  ];
  const bal = calculateAccountBalance(acc, txs);
  assert.strictEqual(bal, 1750000);
});

runTest('3.3: Transaksi Expense memotong saldo rekening secara tepat', () => {
  const acc = { id: 'acc-bank', currency: 'IDR', initial_balance: 1000000 };
  const txs = [
    { account_id: 'acc-bank', amount: 150000, transaction_type: 'expense' },
    { account_id: 'acc-bank', amount: 50000, transaction_type: 'expense' },
  ];
  const bal = calculateAccountBalance(acc, txs);
  assert.strictEqual(bal, 800000);
});

runTest('3.4: Transaksi Transfer Keluar mengurangi saldo akun sumber', () => {
  const acc = { id: 'acc-bank', currency: 'IDR', initial_balance: 1000000 };
  const txs = [
    { account_id: 'acc-bank', destination_account_id: 'acc-ewallet', amount: 300000, transaction_type: 'transfer' },
  ];
  const bal = calculateAccountBalance(acc, txs);
  assert.strictEqual(bal, 700000);
});

runTest('3.5: Transaksi Transfer Masuk menambah saldo akun tujuan', () => {
  const acc = { id: 'acc-ewallet', currency: 'IDR', initial_balance: 200000 };
  const txs = [
    { account_id: 'acc-bank', destination_account_id: 'acc-ewallet', amount: 300000, transaction_type: 'transfer' },
  ];
  const bal = calculateAccountBalance(acc, txs);
  assert.strictEqual(bal, 500000);
});

runTest('3.6: Transfer ke akun sendiri tidak menghasilkan perubahan saldo (anti double-counting)', () => {
  const acc = { id: 'acc-bank', currency: 'IDR', initial_balance: 1000000 };
  const txs = [
    { account_id: 'acc-bank', destination_account_id: 'acc-bank', amount: 100000, transaction_type: 'transfer' },
  ];
  const bal = calculateAccountBalance(acc, txs);
  assert.strictEqual(bal, 1000000);
});

runTest('3.7: Transaksi Adjustment arah debit memotong saldo', () => {
  const acc = { id: 'acc-bank', currency: 'IDR', initial_balance: 1000000 };
  const txs = [
    { account_id: 'acc-bank', amount: 25000, transaction_type: 'adjustment', direction: 'debit' },
  ];
  const bal = calculateAccountBalance(acc, txs);
  assert.strictEqual(bal, 975000);
});

runTest('3.8: Transaksi Adjustment arah credit menambah saldo', () => {
  const acc = { id: 'acc-bank', currency: 'IDR', initial_balance: 1000000 };
  const txs = [
    { account_id: 'acc-bank', amount: 50000, transaction_type: 'adjustment', direction: 'credit' },
  ];
  const bal = calculateAccountBalance(acc, txs);
  assert.strictEqual(bal, 1050000);
});

runTest('3.9: Transaksi Trading profit deal menambah saldo rekening USD', () => {
  const acc = { id: 'acc-trading', currency: 'USD', initial_balance: 1000.0 };
  const txs = [
    { account_id: 'acc-trading', amount: 45.5, transaction_type: 'trading' },
  ];
  const bal = calculateAccountBalance(acc, txs);
  assert.strictEqual(bal, 1045.5);
});

runTest('3.10: Transaksi Trading loss deal memotong saldo rekening USD', () => {
  const acc = { id: 'acc-trading', currency: 'USD', initial_balance: 1000.0 };
  const txs = [
    { account_id: 'acc-trading', amount: -20.25, transaction_type: 'trading' },
  ];
  const bal = calculateAccountBalance(acc, txs);
  assert.strictEqual(bal, 979.75);
});

runTest('3.11: Filter rentang tanggal asOfDate membatasi transaksi yang dihitung', () => {
  const acc = { id: 'acc-bank', currency: 'IDR', initial_balance: 1000000 };
  const txs = [
    { account_id: 'acc-bank', amount: 500000, transaction_type: 'income', transaction_date: '2026-10-01T00:00:00Z' },
    { account_id: 'acc-bank', amount: 200000, transaction_type: 'income', transaction_date: '2026-11-15T00:00:00Z' },
  ];
  const bal = calculateAccountBalance(acc, txs, { asOfDate: '2026-10-31T23:59:59Z' });
  assert.strictEqual(bal, 1500000);
});

// -------------------------------------------------------------
// SEKSI 4: MUTASI MEMORI ATOMIK & REVERT
// -------------------------------------------------------------
console.log('\n--- SEKSI 4: MUTASI MEMORI ATOMIK & REVERT ---');

runTest('4.1: applyTransactionToAccounts mutasi income berhasil', () => {
  const accounts = [
    { id: 'acc-1', currency: 'IDR', current_balance: 100000 },
  ];
  const tx = {
    account_id: 'acc-1',
    amount: 50000,
    transaction_type: 'income',
    transaction_date: '2026-11-01T00:00:00Z',
  };
  const res = applyTransactionToAccounts(accounts, tx);
  assert.strictEqual(res.success, true);
  assert.strictEqual(accounts[0].current_balance, 150000);
});

runTest('4.2: revertTransactionFromAccounts mengembalikan saldo income', () => {
  const accounts = [
    { id: 'acc-1', currency: 'IDR', current_balance: 150000 },
  ];
  const tx = {
    account_id: 'acc-1',
    amount: 50000,
    transaction_type: 'income',
    transaction_date: '2026-11-01T00:00:00Z',
  };
  const res = revertTransactionFromAccounts(accounts, tx);
  assert.strictEqual(res.success, true);
  assert.strictEqual(accounts[0].current_balance, 100000);
});

runTest('4.3: applyTransactionToAccounts mutasi expense berhasil', () => {
  const accounts = [
    { id: 'acc-1', currency: 'IDR', current_balance: 100000 },
  ];
  const tx = {
    account_id: 'acc-1',
    amount: 30000,
    transaction_type: 'expense',
    transaction_date: '2026-11-01T00:00:00Z',
  };
  const res = applyTransactionToAccounts(accounts, tx);
  assert.strictEqual(res.success, true);
  assert.strictEqual(accounts[0].current_balance, 70000);
});

runTest('4.4: revertTransactionFromAccounts mengembalikan saldo expense', () => {
  const accounts = [
    { id: 'acc-1', currency: 'IDR', current_balance: 70000 },
  ];
  const tx = {
    account_id: 'acc-1',
    amount: 30000,
    transaction_type: 'expense',
    transaction_date: '2026-11-01T00:00:00Z',
  };
  const res = revertTransactionFromAccounts(accounts, tx);
  assert.strictEqual(res.success, true);
  assert.strictEqual(accounts[0].current_balance, 100000);
});

runTest('4.5: applyTransactionToAccounts mutasi transfer mengubah kedua akun secara atomik', () => {
  const accounts = [
    { id: 'acc-src', currency: 'IDR', current_balance: 1000000 },
    { id: 'acc-dst', currency: 'IDR', current_balance: 200000 },
  ];
  const tx = {
    account_id: 'acc-src',
    destination_account_id: 'acc-dst',
    amount: 400000,
    transaction_type: 'transfer',
    transaction_date: '2026-11-01T00:00:00Z',
  };
  const res = applyTransactionToAccounts(accounts, tx);
  assert.strictEqual(res.success, true);
  assert.strictEqual(accounts[0].current_balance, 600000);
  assert.strictEqual(accounts[1].current_balance, 600000);
});

runTest('4.6: revertTransactionFromAccounts membalikkan transfer kedua akun secara presisi', () => {
  const accounts = [
    { id: 'acc-src', currency: 'IDR', current_balance: 600000 },
    { id: 'acc-dst', currency: 'IDR', current_balance: 600000 },
  ];
  const tx = {
    account_id: 'acc-src',
    destination_account_id: 'acc-dst',
    amount: 400000,
    transaction_type: 'transfer',
    transaction_date: '2026-11-01T00:00:00Z',
  };
  const res = revertTransactionFromAccounts(accounts, tx);
  assert.strictEqual(res.success, true);
  assert.strictEqual(accounts[0].current_balance, 1000000);
  assert.strictEqual(accounts[1].current_balance, 200000);
});

runTest('4.7: Fail-safe atomik: jika akun tujuan transfer tidak valid, saldo sumber tidak termutasi', () => {
  const accounts = [
    { id: 'acc-src', currency: 'IDR', current_balance: 1000000 },
  ];
  const tx = {
    account_id: 'acc-src',
    destination_account_id: 'acc-hilang',
    amount: 400000,
    transaction_type: 'transfer',
    transaction_date: '2026-11-01T00:00:00Z',
  };
  const res = applyTransactionToAccounts(accounts, tx);
  assert.strictEqual(res.success, false);
  assert.strictEqual(accounts[0].current_balance, 1000000);
});

// -------------------------------------------------------------
// SEKSI 5: REKONSILIASI BUKU BESAR
// -------------------------------------------------------------
console.log('\n--- SEKSI 5: REKONSILIASI BUKU BESAR ---');

runTest('5.1: reconcileAccount mengembalikan isBalanced: true jika cached == computed', () => {
  const account = { id: 'acc-1', name: 'Tabungan Utama', currency: 'IDR', current_balance: 1500000, initial_balance: 1000000 };
  const txs = [
    { account_id: 'acc-1', amount: 500000, transaction_type: 'income' },
  ];
  const res = reconcileAccount(account, txs);
  assert.strictEqual(res.isBalanced, true);
  assert.strictEqual(res.difference, 0);
  assert.strictEqual(res.computedBalance, 1500000);
});

runTest('5.2: reconcileAccount mendeteksi selisih (discrepancy) jika saldo menyimpang', () => {
  const account = { id: 'acc-1', name: 'Tabungan Utama', currency: 'IDR', current_balance: 2000000, initial_balance: 1000000 };
  const txs = [
    { account_id: 'acc-1', amount: 500000, transaction_type: 'income' },
  ];
  // cached: 2000000, computed: 1500000 -> discrepancy: 500000
  const res = reconcileAccount(account, txs);
  assert.strictEqual(res.isBalanced, false);
  assert.strictEqual(res.difference, 500000);
  assert.strictEqual(res.computedBalance, 1500000);
});

runTest('5.3: reconcileAllAccounts menghasilkan laporan menyeluruh dan daftar perbedaan', () => {
  const database = {
    accounts: [
      { id: 'acc-1', name: 'Bank A', currency: 'IDR', current_balance: 1500000, initial_balance: 1000000 },
      { id: 'acc-2', name: 'Bank B', currency: 'IDR', current_balance: 9999999, initial_balance: 500000 }, // Tidak seimbang
    ],
    transactions: [
      { account_id: 'acc-1', amount: 500000, transaction_type: 'income' },
      { account_id: 'acc-2', amount: 100000, transaction_type: 'income' }, // Seharusnya 600000
    ],
  };

  const report = reconcileAllAccounts(database);
  assert.strictEqual(report.totalAccounts, 2);
  assert.strictEqual(report.balancedAccounts, 1);
  assert.strictEqual(report.unbalancedAccounts, 1);
  assert.strictEqual(report.isAllBalanced, false);
  assert.strictEqual(report.discrepancies.length, 1);
  assert.strictEqual(report.discrepancies[0].accountId, 'acc-2');
});

runTest('5.4: reconcileAllAccounts melaporkan isAllBalanced: true jika semua akun sinkron', () => {
  const database = {
    accounts: [
      { id: 'acc-1', name: 'Bank A', currency: 'IDR', current_balance: 1500000, initial_balance: 1000000 },
      { id: 'acc-2', name: 'Bank B', currency: 'IDR', current_balance: 600000, initial_balance: 500000 },
    ],
    transactions: [
      { account_id: 'acc-1', amount: 500000, transaction_type: 'income' },
      { account_id: 'acc-2', amount: 100000, transaction_type: 'income' },
    ],
  };

  const report = reconcileAllAccounts(database);
  assert.strictEqual(report.isAllBalanced, true);
  assert.strictEqual(report.discrepancies.length, 0);
});

// -------------------------------------------------------------
// SEKSI 6: MULTI-CURRENCY & TOTALITAS FINANSIAL
// -------------------------------------------------------------
console.log('\n--- SEKSI 6: MULTI-CURRENCY & TOTALITAS FINANSIAL ---');

runTest('6.1: Isolasi Transfer: transfer tidak dihitung ke dalam Total Income atau Total Expense', () => {
  const database = {
    accounts: [
      { id: 'acc-1', currency: 'IDR', current_balance: 1000000 },
      { id: 'acc-2', currency: 'IDR', current_balance: 500000 },
    ],
    transactions: [
      { account_id: 'acc-1', amount: 300000, transaction_type: 'income' },
      { account_id: 'acc-1', amount: 100000, transaction_type: 'expense' },
      { account_id: 'acc-1', destination_account_id: 'acc-2', amount: 200000, transaction_type: 'transfer' },
    ],
  };

  const totals = calculateFinancialTotals(database);
  assert.strictEqual(totals.totalIncomeIDR, 300000, 'Income IDR harus tepat 300000 tanpa transfer');
  assert.strictEqual(totals.totalExpenseIDR, 100000, 'Expense IDR harus tepat 100000 tanpa transfer');
  assert.strictEqual(totals.totalTransferIDR, 200000, 'Transfer IDR harus tercatat 200000');
  assert.strictEqual(totals.netIncomeIDR, 200000, 'Net income IDR (300000 - 100000) = 200000');
});

runTest('6.2: Pemisahan totalitas mata uang IDR dan USD secara independen', () => {
  const database = {
    accounts: [
      { id: 'acc-idr', currency: 'IDR', current_balance: 10000000 },
      { id: 'acc-usd', currency: 'USD', current_balance: 1500.0 },
    ],
    transactions: [
      { account_id: 'acc-idr', amount: 5000000, transaction_type: 'income' },
      { account_id: 'acc-usd', amount: 150.0, transaction_type: 'income' },
    ],
  };

  const totals = calculateFinancialTotals(database);
  assert.strictEqual(totals.totalIncomeIDR, 5000000);
  assert.strictEqual(totals.totalIncomeUSD, 150.0);
  assert.strictEqual(totals.totalBalanceIDR, 10000000);
  assert.strictEqual(totals.totalBalanceUSD, 1500.0);
});

runTest('6.3: Net Worth IDR dan USD dihitung murni dari saldo rekening', () => {
  const database = {
    accounts: [
      { id: 'acc-1', currency: 'IDR', current_balance: 15000000 },
      { id: 'acc-2', currency: 'IDR', current_balance: 5000000 },
      { id: 'acc-3', currency: 'USD', current_balance: 2000.0 },
    ],
    transactions: [],
  };

  const totals = calculateFinancialTotals(database);
  assert.strictEqual(totals.totalBalanceIDR, 20000000);
  assert.strictEqual(totals.totalBalanceUSD, 2000.0);
});

runTest('6.4: Estimasi Net Worth terpadu berbasis kurs USD to IDR', () => {
  const database = {
    settings: {
      usd_to_idr_rate: 16000,
    },
    accounts: [
      { id: 'acc-1', currency: 'IDR', current_balance: 16000000 },
      { id: 'acc-2', currency: 'USD', current_balance: 1000.0 }, // 1000 * 16000 = 16000000 IDR
    ],
    transactions: [],
  };

  const totals = calculateFinancialTotals(database);
  // Total IDR: 16000000 + 16000000 = 32000000
  assert.strictEqual(totals.netWorthIDR, 32000000);
  // Total USD: 1000 + (16000000 / 16000) = 2000 USD
  assert.strictEqual(totals.netWorthUSD, 2000.0);
});

runTest('6.5: Filter ledger personal vs business pada total finansial', () => {
  const database = {
    accounts: [
      { id: 'acc-p', currency: 'IDR', current_balance: 5000000, ledger: 'personal' },
      { id: 'acc-b', currency: 'IDR', current_balance: 10000000, ledger: 'business' },
    ],
    transactions: [
      { account_id: 'acc-p', amount: 1000000, transaction_type: 'income' },
      { account_id: 'acc-b', amount: 5000000, transaction_type: 'income' },
    ],
  };

  const personalTotals = calculateFinancialTotals(database, { ledger: 'personal' });
  assert.strictEqual(personalTotals.totalBalanceIDR, 5000000);
  assert.strictEqual(personalTotals.totalIncomeIDR, 1000000);

  const businessTotals = calculateFinancialTotals(database, { ledger: 'business' });
  assert.strictEqual(businessTotals.totalBalanceIDR, 10000000);
  assert.strictEqual(businessTotals.totalIncomeIDR, 5000000);
});

console.log('\n================================================================');
console.log(`HASIL AKHIR TEST SUITE: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL ${passedTests + failedTests})`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
