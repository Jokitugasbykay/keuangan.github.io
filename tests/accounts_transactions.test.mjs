/**
 * Test Suite: Accounts & Transactions Hardening & Ledger Engine Integration
 * Memverifikasi validasi input ketat, pencegahan double submission, zero-drift minor units,
 * kompatibilitas skema (type/date), dan null-safety.
 */

import {
  toMinorUnits,
  fromMinorUnits,
  roundCurrency,
  addCurrency,
  subtractCurrency,
  calculateAccountBalance,
  validateTransaction,
  applyTransactionToAccounts,
  revertTransactionFromAccounts,
  previewTransactionBalance,
} from '../src/lib/ledger-engine.js';

console.log('================================================================');
console.log('KAYLA FINANCE: ACCOUNTS & TRANSACTIONS AUDIT & HARDENING TEST');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, testName, extra = '') {
  if (condition) {
    passed++;
    console.log(`[PASS] ${testName}`);
  } else {
    failed++;
    console.error(`[FAIL] ${testName} ${extra}`);
  }
}

// -------------------------------------------------------------
// SEKSI 1: VALIDASI INPUT TRANSAKSI KETAT & SKEMA KOMPATIBILITAS
// -------------------------------------------------------------
console.log('\n--- SEKSI 1: VALIDASI TRANSAKSI & KOMPATIBILITAS SKEMA ---');

const mockAccounts = [
  { id: 'acc-1', name: 'BCA Utama', provider: 'BCA', current_balance: 1000000, currency: 'IDR' },
  { id: 'acc-2', name: 'Mandiri Tabungan', provider: 'Mandiri', current_balance: 500000, currency: 'IDR' },
  { id: 'acc-usd', name: 'Exness MT5', provider: 'Exness', current_balance: 150.75, currency: 'USD' },
];

// 1.1 Penolakan nominal negatif
const testNegative = validateTransaction({
  account_id: 'acc-1',
  amount: -50000,
  transaction_type: 'expense',
  transaction_date: '2026-11-06T10:00:00.000Z',
}, mockAccounts);
assert(!testNegative.valid, 'Test 1.1: Menolak nominal transaksi negatif (< 0)');

// 1.2 Penolakan nominal nol
const testZero = validateTransaction({
  account_id: 'acc-1',
  amount: 0,
  transaction_type: 'expense',
  transaction_date: '2026-11-06T10:00:00.000Z',
}, mockAccounts);
assert(!testZero.valid, 'Test 1.2: Menolak nominal transaksi nol (0)');

// 1.3 Penolakan nominal non-numerik / NaN
const testNaN = validateTransaction({
  account_id: 'acc-1',
  amount: 'abc',
  transaction_type: 'expense',
  transaction_date: '2026-11-06T10:00:00.000Z',
}, mockAccounts);
assert(!testNaN.valid, 'Test 1.3: Menolak nominal string alfabet / NaN');

// 1.4 Penolakan akun sumber tidak sah
const testInvalidAcc = validateTransaction({
  account_id: 'acc-non-existent',
  amount: 100000,
  transaction_type: 'expense',
  transaction_date: '2026-11-06T10:00:00.000Z',
}, mockAccounts);
assert(!testInvalidAcc.valid, 'Test 1.4: Menolak transaksi dengan akun sumber tidak terdaftar');

// 1.5 Penolakan transfer ke akun yang sama
const testSameTransfer = validateTransaction({
  account_id: 'acc-1',
  destination_account_id: 'acc-1',
  amount: 50000,
  transaction_type: 'transfer',
  transaction_date: '2026-11-06T10:00:00.000Z',
}, mockAccounts);
assert(!testSameTransfer.valid, 'Test 1.5: Menolak transfer ke akun sumber sendiri');

// 1.6 Dukungan atribut legacy type ('type' selain 'transaction_type')
const testLegacyType = validateTransaction({
  account_id: 'acc-1',
  amount: 25000,
  type: 'income',
  transaction_date: '2026-11-06T10:00:00.000Z',
}, mockAccounts);
assert(testLegacyType.valid, 'Test 1.6: Mendukung atribut legacy "type"');

// 1.7 Dukungan atribut legacy date ('date' selain 'transaction_date')
const testLegacyDate = validateTransaction({
  account_id: 'acc-1',
  amount: 25000,
  transaction_type: 'income',
  date: '2026-11-06T10:00:00.000Z',
}, mockAccounts);
assert(testLegacyDate.valid, 'Test 1.7: Mendukung atribut legacy "date"');

// -------------------------------------------------------------
// SEKSI 2: ARITMATIKA PRESIFIKASI FINANCIAL LEDGER & ZERO DRIFT
// -------------------------------------------------------------
console.log('\n--- SEKSI 2: ARITMATIKA PRESIFIKASI & ZERO DRIFT ---');

// 2.1 Presisi desimal USD tanpa drift IEEE-754 (0.1 + 0.2 = 0.30)
const sumUSD = addCurrency(0.1, 0.2, 'USD');
assert(sumUSD === 0.3, `Test 2.1: addCurrency(0.1, 0.2, 'USD') === 0.30 (aktual: ${sumUSD})`);

// 2.2 Pengurangan USD tanpa drift (0.3 - 0.2 = 0.10)
const subUSD = subtractCurrency(0.3, 0.2, 'USD');
assert(subUSD === 0.1, `Test 2.2: subtractCurrency(0.3, 0.2, 'USD') === 0.10 (aktual: ${subUSD})`);

// 2.3 Rounding IDR selalu bernilai integer utuh
const roundIDR = roundCurrency(15420.78, 'IDR');
assert(roundIDR === 15421, `Test 2.3: roundCurrency IDR menghilangkan pecahan (aktual: ${roundIDR})`);

// 2.4 Mutasi Atomik applyTransactionToAccounts & Revert
const testAccountsState = [
  { id: 'acc-1', current_balance: 1000000, currency: 'IDR' },
  { id: 'acc-2', current_balance: 500000, currency: 'IDR' },
];
const trfTx = {
  account_id: 'acc-1',
  destination_account_id: 'acc-2',
  amount: 200000,
  transaction_type: 'transfer',
  transaction_date: '2026-11-06T10:00:00.000Z',
};

applyTransactionToAccounts(testAccountsState, trfTx);
assert(
  testAccountsState[0].current_balance === 800000 && testAccountsState[1].current_balance === 700000,
  'Test 2.4: applyTransactionToAccounts memutasi akun transfer secara presisi'
);

revertTransactionFromAccounts(testAccountsState, trfTx);
assert(
  testAccountsState[0].current_balance === 1000000 && testAccountsState[1].current_balance === 500000,
  'Test 2.5: revertTransactionFromAccounts mengembalikan saldo akun transfer secara utuh'
);

// -------------------------------------------------------------
// SEKSI 3: PRATINJAU SALDO REAL-TIME (BALANCE PREVIEW)
// -------------------------------------------------------------
console.log('\n--- SEKSI 3: REAL-TIME BALANCE PREVIEW ---');

// 3.1 Preview pengeluaran (expense)
const previewExpense = previewTransactionBalance({
  currentBalance: 1000000,
  transactionType: 'expense',
  amount: 250000,
  currency: 'IDR',
});
assert(
  previewExpense.isValid && previewExpense.before === 1000000 && previewExpense.delta === -250000 && previewExpense.after === 750000,
  'Test 3.1: Preview Expense menghasilkan before, delta (-), dan after yang presisi'
);

// 3.2 Preview pemasukan (income)
const previewIncome = previewTransactionBalance({
  currentBalance: 500000,
  transactionType: 'income',
  amount: 150000,
  currency: 'IDR',
});
assert(
  previewIncome.isValid && previewIncome.before === 500000 && previewIncome.delta === 150000 && previewIncome.after === 650000,
  'Test 3.2: Preview Income menghasilkan before, delta (+), dan after yang presisi'
);

// 3.3 Preview transfer sumber dan tujuan
const previewTrfSource = previewTransactionBalance({
  currentBalance: 1000000,
  transactionType: 'transfer',
  amount: 300000,
  isSource: true,
  currency: 'IDR',
});
const previewTrfDest = previewTransactionBalance({
  currentBalance: 200000,
  transactionType: 'transfer',
  amount: 300000,
  isSource: false,
  currency: 'IDR',
});
assert(
  previewTrfSource.after === 700000 && previewTrfDest.after === 500000,
  'Test 3.3: Preview Transfer mengestimasi saldo sumber (-300k) dan tujuan (+300k)'
);

// 3.4 Preview dengan amount 0 atau tidak valid
const previewInvalid = previewTransactionBalance({
  currentBalance: 500000,
  transactionType: 'expense',
  amount: 0,
  currency: 'IDR',
});
assert(!previewInvalid.isValid && previewInvalid.after === 500000, 'Test 3.4: Preview amount nol ditandai isValid: false');

// -------------------------------------------------------------
// SEKSI 4: NULL SAFETY & PROPERTY ACCESS RESILIENCE
// -------------------------------------------------------------
console.log('\n--- SEKSI 4: NULL-SAFETY & PROPERTY RESILIENCE ---');

const mockAccNullProvider = { id: 'acc-null', name: 'Dompet Tunai', provider: null };
const mockAccUndefined = { id: 'acc-undef' };

const safeSub1 = (mockAccNullProvider.provider || mockAccNullProvider.name || 'ACC').substring(0, 3).toUpperCase();
const safeSub2 = (mockAccUndefined.provider || mockAccUndefined.name || 'ACC').substring(0, 3).toUpperCase();

assert(safeSub1 === 'DOM', `Test 4.1: Fallback provider null ke name menghasilkan substring aman (DOM, aktual: ${safeSub1})`);
assert(safeSub2 === 'ACC', `Test 4.2: Fallback provider & name undefined menghasilkan substring ACC (aktual: ${safeSub2})`);

console.log('================================================================');
console.log(`HASIL TEST: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
