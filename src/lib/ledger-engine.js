/**
 * @file Financial Ledger Engine (Buku Besar Keuangan Otoritatif) Kayla Finance.
 * Mengimplementasikan aritmatika presisi berbasis minor units (integer cents/rupiah)
 * untuk mencegah floating-point drift IEEE-754 pada seluruh kalkulasi keuangan.
 */

/**
 * Konfigurasi jumlah digit desimal minor unit per mata uang.
 * IDR: 0 desimal (1 IDR = 1 unit)
 * USD, EUR, SGD, GBP, AUD: 2 desimal (1 USD = 100 cents)
 * JPY: 0 desimal (1 JPY = 1 unit)
 */
export const CURRENCY_DECIMALS = Object.freeze({
  IDR: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
  SGD: 2,
  JPY: 0,
  AUD: 2,
  CNY: 2,
});

/**
 * Mendapatkan jumlah desimal resmi untuk mata uang tertentu.
 * @param {string} [currency='IDR']
 * @returns {number}
 */
export function getCurrencyDecimals(currency = 'IDR') {
  const code = String(currency || 'IDR').trim().toUpperCase();
  return CURRENCY_DECIMALS[code] !== undefined ? CURRENCY_DECIMALS[code] : 2;
}

/**
 * Mengonversi nilai numerik ke minor unit integer.
 * IDR: Math.round(Number(amount))
 * USD: Math.round(Number(amount) * 100)
 *
 * @param {number|string} amount - Nilai nominal transaksi/saldo
 * @param {string} [currency='IDR'] - Kode mata uang
 * @returns {number} Integer minor unit
 */
export function toMinorUnits(amount, currency = 'IDR') {
  const num = Number(amount);
  if (!Number.isFinite(num)) {
    throw new TypeError(`Nilai amount tidak valid untuk konversi minor unit: ${amount}`);
  }
  const decimals = getCurrencyDecimals(currency);
  if (decimals === 0) {
    return Math.round(num);
  }
  const factor = Math.pow(10, decimals);
  // Menggunakan perataan toFixed(8) sebelum pembulatan untuk mengeliminasi ketidaktepatan biner perkalian
  return Math.round(Number((num * factor).toFixed(8)));
}

/**
 * Mengonversi integer minor unit kembali ke nilai desimal standar dengan presisi aman.
 *
 * @param {number|string} minorUnits - Integer minor unit
 * @param {string} [currency='IDR'] - Kode mata uang
 * @returns {number} Nilai floating aman tanpa drift
 */
export function fromMinorUnits(minorUnits, currency = 'IDR') {
  const units = Number(minorUnits);
  if (!Number.isFinite(units)) {
    throw new TypeError(`Nilai minorUnits tidak valid: ${minorUnits}`);
  }
  const decimals = getCurrencyDecimals(currency);
  if (decimals === 0) {
    return Math.round(units);
  }
  const factor = Math.pow(10, decimals);
  return Number((units / factor).toFixed(decimals));
}

/**
 * Membulatkan nilai desimal ke batas resmi mata uang tanpa galat floating point (misal 0.1 + 0.2).
 *
 * @param {number|string} amount - Nilai nominal
 * @param {string} [currency='IDR'] - Kode mata uang
 * @returns {number} Nilai terbulatkan resmi
 */
export function roundCurrency(amount, currency = 'IDR') {
  return fromMinorUnits(toMinorUnits(amount, currency), currency);
}

/**
 * Penjumlahan aritmatika aman berbasis minor unit integer.
 * Menghilangkan galat IEEE-754 seperti 0.1 + 0.2 = 0.30000000000000004.
 *
 * @param {number|string} a
 * @param {number|string} b
 * @param {string} [currency='IDR']
 * @returns {number}
 */
export function addCurrency(a, b, currency = 'IDR') {
  const minorA = toMinorUnits(a, currency);
  const minorB = toMinorUnits(b, currency);
  return fromMinorUnits(minorA + minorB, currency);
}

/**
 * Pengurangan aritmatika aman berbasis minor unit integer.
 * Menghilangkan galat IEEE-754 seperti 0.3 - 0.2 = 0.09999999999999998.
 *
 * @param {number|string} a
 * @param {number|string} b
 * @param {string} [currency='IDR']
 * @returns {number}
 */
export function subtractCurrency(a, b, currency = 'IDR') {
  const minorA = toMinorUnits(a, currency);
  const minorB = toMinorUnits(b, currency);
  return fromMinorUnits(minorA - minorB, currency);
}

/**
 * Perkalian aman nominal mata uang dengan pengali skalar.
 *
 * @param {number|string} amount
 * @param {number} factor
 * @param {string} [currency='IDR']
 * @returns {number}
 */
export function multiplyCurrency(amount, factor, currency = 'IDR') {
  const minor = toMinorUnits(amount, currency);
  const resultMinor = Math.round(minor * Number(factor));
  return fromMinorUnits(resultMinor, currency);
}

/**
 * Menghitung saldo murni rekening dari riwayat transaksi jurnal secara otoritatif.
 *
 * Rumus:
 * Saldo Akhir = Opening/Initial Balance
 *   + Total Income (destination == account.id)
 *   - Total Expense (source == account.id)
 *   + Total Transfer Masuk (destination == account.id)
 *   - Total Transfer Keluar (source == account.id)
 *   + Total Adjustment (positif/negatif)
 *   + Total Trading Profit/Loss (destination/source == account.id)
 *
 * Menjamin tidak ada double counting atau kehilangan presisi sen.
 *
 * @param {Object} account - Objek akun rekening
 * @param {string} account.id - ID akun unik
 * @param {string} [account.currency='IDR'] - Mata uang akun
 * @param {number} [account.initial_balance] - Saldo awal akun jika ada
 * @param {Array<Object>} transactions - Seluruh riwayat transaksi jurnal
 * @param {Object} [options={}] - Opsi perhitungan tambahan
 * @param {number} [options.initialBalance] - Override saldo awal
 * @param {string} [options.asOfDate] - Batas tanggal transaksi (ISO string)
 * @param {boolean} [options.returnMinor=false] - Kembalikan dalam bentuk minor units
 * @returns {number} Saldo akhir presisi
 */
export function calculateAccountBalance(account, transactions = [], options = {}) {
  if (!account || typeof account !== 'object' || !account.id) {
    throw new TypeError('Objek account tidak valid atau tidak memiliki id.');
  }

  const currency = account.currency || options.currency || 'IDR';
  const initial = options.initialBalance ?? options.openingBalance ?? account.initial_balance ?? account.opening_balance ?? account.initialBalance ?? 0;
  let balanceMinor = toMinorUnits(initial, currency);

  const asOfTime = options.asOfDate ? new Date(options.asOfDate).getTime() : null;
  const startTime = options.startDate ? new Date(options.startDate).getTime() : null;

  const txList = Array.isArray(transactions) ? transactions : [];

  for (const tx of txList) {
    if (!tx || typeof tx !== 'object') continue;

    // Filter rentang tanggal jika opsi ditentukan
    if (tx.transaction_date) {
      const txTime = new Date(tx.transaction_date).getTime();
      if (asOfTime !== null && txTime > asOfTime) continue;
      if (startTime !== null && txTime < startTime) continue;
    }

    const type = String(tx.transaction_type || tx.type || '').toLowerCase();
    const sourceId = tx.account_id || tx.source_account_id;
    const destId = tx.destination_account_id || tx.target_account_id;
    const rawAmount = Number(tx.amount);

    if (!Number.isFinite(rawAmount)) continue;

    const isSource = sourceId === account.id;
    const isDest = destId === account.id;

    if (!isSource && !isDest) {
      // Transaksi tidak melibatkan akun ini
      continue;
    }

    if (type === 'income') {
      // Income menambah saldo rekening penerima
      // Jika destId terisi dan cocok, atau tidak ada destId tapi sourceId adalah akun ini
      if (isDest || (!destId && isSource)) {
        balanceMinor += toMinorUnits(Math.abs(rawAmount), currency);
      }
    } else if (type === 'expense') {
      // Expense mengurangi saldo rekening sumber
      if (isSource) {
        balanceMinor -= toMinorUnits(Math.abs(rawAmount), currency);
      }
    } else if (type === 'transfer') {
      // Transfer: keluar dari source, masuk ke destination
      if (isSource && isDest) {
        // Transfer ke akun yang sama: net perubahan nol (mencegah double-counting)
        continue;
      }
      if (isSource) {
        // Transfer Keluar
        balanceMinor -= toMinorUnits(Math.abs(rawAmount), currency);
      }
      if (isDest) {
        // Transfer Masuk
        // Jika ada nominal khusus di akun tujuan (misal transfer antar mata uang berlainan)
        const destAmount = tx.destination_amount !== undefined && tx.destination_amount !== null
          ? Number(tx.destination_amount)
          : Math.abs(rawAmount);
        balanceMinor += toMinorUnits(destAmount, currency);
      }
    } else if (type === 'adjustment') {
      // Adjustment dapat bernilai positif (menambah) atau negatif (mengurangi)
      const direction = String(tx.direction || '').toLowerCase();
      let adjMinor = toMinorUnits(Math.abs(rawAmount), currency);

      if (direction === 'debit' || direction === 'decrease' || direction === 'out' || rawAmount < 0) {
        balanceMinor -= adjMinor;
      } else {
        balanceMinor += adjMinor;
      }
    } else if (type === 'trading') {
      // Trading profit atau loss deal
      const profitMinor = toMinorUnits(rawAmount, currency);
      balanceMinor += profitMinor;
    }
  }

  if (options.returnMinor) {
    return balanceMinor;
  }
  return fromMinorUnits(balanceMinor, currency);
}

/**
 * Rekonsiliasi saldo satu akun antara saldo tersimpan (cachedBalance)
 * dan saldo otoritatif hasil kalkulasi transaksi jurnal (computedBalance).
 *
 * @param {Object} account - Objek akun
 * @param {Array<Object>} transactions - Riwayat transaksi
 * @param {Object} [options={}] - Opsi kalkulasi tambahan
 * @returns {{
 *   accountId: string,
 *   accountName: string,
 *   currency: string,
 *   cachedBalance: number,
 *   computedBalance: number,
 *   isBalanced: boolean,
 *   difference: number
 * }}
 */
export function reconcileAccount(account, transactions = [], options = {}) {
  if (!account || typeof account !== 'object' || !account.id) {
    throw new TypeError('Objek account tidak valid.');
  }

  const currency = account.currency || 'IDR';
  const cachedBalance = roundCurrency(account.current_balance || 0, currency);
  const computedBalance = calculateAccountBalance(account, transactions, options);

  const cachedMinor = toMinorUnits(cachedBalance, currency);
  const computedMinor = toMinorUnits(computedBalance, currency);
  const diffMinor = cachedMinor - computedMinor;

  const isBalanced = diffMinor === 0;
  const difference = fromMinorUnits(diffMinor, currency);

  return {
    accountId: account.id,
    accountName: account.name || account.id,
    currency,
    cachedBalance,
    computedBalance,
    isBalanced,
    difference,
  };
}

/**
 * Rekonsiliasi menyeluruh untuk seluruh akun dalam database terhadap riwayat transaksi.
 * Menghasilkan ringkasan kesehatan buku besar dan daftar diskrepansi saldo jika ditemukan.
 *
 * @param {Object} database - Objek database berisi { accounts, transactions }
 * @param {Object} [options={}] - Opsi rekonsiliasi
 * @returns {{
 *   timestamp: string,
 *   totalAccounts: number,
 *   balancedAccounts: number,
 *   unbalancedAccounts: number,
 *   isAllBalanced: boolean,
 *   accounts: Array<Object>,
 *   discrepancies: Array<Object>,
 *   summary: string
 * }}
 */
export function reconcileAllAccounts(database, options = {}) {
  if (!database || typeof database !== 'object') {
    throw new TypeError('Objek database tidak valid untuk rekonsiliasi buku besar.');
  }

  const accounts = Array.isArray(database.accounts) ? database.accounts : [];
  const transactions = Array.isArray(database.transactions) ? database.transactions : [];

  const accountResults = accounts.map((acc) => reconcileAccount(acc, transactions, options));
  const discrepancies = accountResults.filter((res) => !res.isBalanced);
  const isAllBalanced = discrepancies.length === 0;

  const summary = isAllBalanced
    ? `Seluruh ${accounts.length} akun buku besar seimbang (reconciled).`
    : `Ditemukan ${discrepancies.length} akun dengan perbedaan saldo dari total ${accounts.length} akun.`;

  return {
    timestamp: new Date().toISOString(),
    totalAccounts: accounts.length,
    balancedAccounts: accounts.length - discrepancies.length,
    unbalancedAccounts: discrepancies.length,
    isAllBalanced,
    accounts: accountResults,
    discrepancies,
    summary,
  };
}

/**
 * Menghitung total finansial terpadu dari database:
 * - Net Worth per mata uang (IDR, USD) dan estimasi terpadu berbasis kurs.
 * - Total Income, Expense, Net Income, dan Transfer (terisolasi tanpa double counting).
 * DILARANG menghitung transaksi transfer sebagai Income atau Expense.
 *
 * @param {Object} database - Objek database berisi { accounts, transactions, settings }
 * @param {Object} [filters={}] - Filter opsional
 * @param {string} [filters.startDate] - Batas awal tanggal transaksi
 * @param {string} [filters.endDate] - Batas akhir tanggal transaksi
 * @param {string} [filters.ledger] - Filter personal atau business
 * @param {string} [filters.accountId] - Filter transaksi pada akun tertentu
 * @returns {Object} Laporan totalitas finansial presisi
 */
export function calculateFinancialTotals(database, filters = {}) {
  if (!database || typeof database !== 'object') {
    throw new TypeError('Objek database tidak valid.');
  }

  const accounts = Array.isArray(database.accounts) ? database.accounts : [];
  const transactions = Array.isArray(database.transactions) ? database.transactions : [];
  const settings = database.settings || {};

  const usdToIdrRate = Number(settings.usd_to_idr_rate || settings.exchange_rate || 16000);

  // 1. Akumulasi Saldo Bersih Akun (Net Worth)
  let totalBalanceIDRMinor = 0;
  let totalBalanceUSDMinor = 0;

  const accountsById = new Map();

  for (const acc of accounts) {
    if (!acc || typeof acc !== 'object') continue;
    accountsById.set(acc.id, acc);

    if (acc.is_active === false) continue;
    if (filters.ledger && acc.ledger && acc.ledger !== filters.ledger) continue;
    if (filters.accountId && acc.id !== filters.accountId) continue;

    const curr = (acc.currency || 'IDR').toUpperCase();
    const balMinor = toMinorUnits(acc.current_balance || 0, curr);

    if (curr === 'USD') {
      totalBalanceUSDMinor += balMinor;
    } else {
      totalBalanceIDRMinor += balMinor;
    }
  }

  const totalBalanceIDR = fromMinorUnits(totalBalanceIDRMinor, 'IDR');
  const totalBalanceUSD = fromMinorUnits(totalBalanceUSDMinor, 'USD');

  // Estimasi Net Worth Terpadu
  const usdInIdrMinor = toMinorUnits(totalBalanceUSD * usdToIdrRate, 'IDR');
  const estimatedNetWorthIDR = fromMinorUnits(totalBalanceIDRMinor + usdInIdrMinor, 'IDR');

  const idrInUsdMinor = toMinorUnits(totalBalanceIDR / (usdToIdrRate || 16000), 'USD');
  const estimatedNetWorthUSD = fromMinorUnits(totalBalanceUSDMinor + idrInUsdMinor, 'USD');

  // 2. Akumulasi Riwayat Transaksi (Income, Expense, Transfer terisolasi)
  let incomeIDRMinor = 0;
  let expenseIDRMinor = 0;
  let transferIDRMinor = 0;

  let incomeUSDMinor = 0;
  let expenseUSDMinor = 0;
  let transferUSDMinor = 0;

  const startTime = filters.startDate ? new Date(filters.startDate).getTime() : null;
  const endTime = filters.endDate ? new Date(filters.endDate).getTime() : null;

  let matchingTransactionCount = 0;

  for (const tx of transactions) {
    if (!tx || typeof tx !== 'object') continue;

    if (tx.transaction_date) {
      const txTime = new Date(tx.transaction_date).getTime();
      if (startTime !== null && txTime < startTime) continue;
      if (endTime !== null && txTime > endTime) continue;
    }

    if (filters.accountId) {
      const isSrc = tx.account_id === filters.accountId;
      const isDst = tx.destination_account_id === filters.accountId;
      if (!isSrc && !isDst) continue;
    }

    const type = String(tx.transaction_type || tx.type || '').toLowerCase();
    const rawAmount = Number(tx.amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) continue;

    // Menentukan mata uang transaksi berdasarkan akun terkait
    const acc = accountsById.get(tx.account_id);
    if (filters.ledger && acc && acc.ledger && acc.ledger !== filters.ledger) continue;

    const curr = (tx.currency || (acc ? acc.currency : 'IDR') || 'IDR').toUpperCase();
    const isUSD = curr === 'USD';
    const amountMinor = toMinorUnits(rawAmount, curr);

    matchingTransactionCount++;

    if (type === 'income') {
      if (isUSD) incomeUSDMinor += amountMinor;
      else incomeIDRMinor += amountMinor;
    } else if (type === 'expense') {
      if (isUSD) expenseUSDMinor += amountMinor;
      else expenseIDRMinor += amountMinor;
    } else if (type === 'trading') {
      // Trading deal dicatat sebagai pemasukan jika positif
      if (rawAmount >= 0) {
        if (isUSD) incomeUSDMinor += amountMinor;
        else incomeIDRMinor += amountMinor;
      } else {
        if (isUSD) expenseUSDMinor += amountMinor;
        else expenseIDRMinor += amountMinor;
      }
    } else if (type === 'transfer') {
      // ISOLASI KETAT: Transfer dicatat pada totalTransfer saja,
      // TIDAK BOLEH menambah income atau expense umum!
      if (isUSD) transferUSDMinor += amountMinor;
      else transferIDRMinor += amountMinor;
    }
  }

  const totalIncomeIDR = fromMinorUnits(incomeIDRMinor, 'IDR');
  const totalExpenseIDR = fromMinorUnits(expenseIDRMinor, 'IDR');
  const totalTransferIDR = fromMinorUnits(transferIDRMinor, 'IDR');
  const netIncomeIDR = fromMinorUnits(incomeIDRMinor - expenseIDRMinor, 'IDR');

  const totalIncomeUSD = fromMinorUnits(incomeUSDMinor, 'USD');
  const totalExpenseUSD = fromMinorUnits(expenseUSDMinor, 'USD');
  const totalTransferUSD = fromMinorUnits(transferUSDMinor, 'USD');
  const netIncomeUSD = fromMinorUnits(incomeUSDMinor - expenseUSDMinor, 'USD');

  return {
    netWorth: {
      totalBalanceIDR,
      totalBalanceUSD,
      estimatedTotalIDR: estimatedNetWorthIDR,
      estimatedTotalUSD: estimatedNetWorthUSD,
      usdToIdrRate,
    },
    // Properti kenyamanan tingkat atas
    totalBalanceIDR,
    totalBalanceUSD,
    netWorthIDR: estimatedNetWorthIDR,
    netWorthUSD: estimatedNetWorthUSD,
    usdToIdrRate,

    // Rincian Arus Kas IDR
    totalIncomeIDR,
    totalExpenseIDR,
    totalTransferIDR,
    netIncomeIDR,

    // Rincian Arus Kas USD
    totalIncomeUSD,
    totalExpenseUSD,
    totalTransferUSD,
    netIncomeUSD,

    transactions: {
      idr: {
        income: totalIncomeIDR,
        expense: totalExpenseIDR,
        net: netIncomeIDR,
        transfer: totalTransferIDR,
      },
      usd: {
        income: totalIncomeUSD,
        expense: totalExpenseUSD,
        net: netIncomeUSD,
        transfer: totalTransferUSD,
      },
    },
    transactionCount: matchingTransactionCount,
  };
}

/**
 * Validasi ketat untuk transaksi keuangan baru atau yang dimodifikasi.
 * Memeriksa:
 * - amount: angka positif berhingga (> 0)
 * - transaction_date: format tanggal sah
 * - transaction_type: tipe transaksi sah ('income', 'expense', 'transfer', 'adjustment', 'trading')
 * - account_id: akun sumber terdaftar
 * - destination_account_id: akun tujuan terdaftar dan berbeda dari akun sumber (khusus transfer)
 *
 * @param {Object} tx - Objek transaksi yang akan divalidasi
 * @param {Array<Object>} [accounts=[]] - Daftar akun yang tersedia di sistem
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateTransaction(tx, accounts = []) {
  if (!tx || typeof tx !== 'object') {
    return { valid: false, error: 'Data transaksi tidak boleh kosong.' };
  }

  // 1. Validasi nominal transaksi (amount)
  if (tx.amount === undefined || tx.amount === null || tx.amount === '') {
    return { valid: false, error: 'Nominal transaksi wajib diisi.' };
  }
  const amount = Number(tx.amount);
  if (isNaN(amount) || !Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'Nominal transaksi harus berupa angka positif lebih dari 0.' };
  }

  // 2. Validasi tanggal transaksi (dukung transaction_date maupun format legacy date)
  const txDate = tx.transaction_date || tx.date;
  if (!txDate) {
    return { valid: false, error: 'Tanggal transaksi wajib diisi.' };
  }
  const parsedDate = new Date(txDate);
  if (isNaN(parsedDate.getTime())) {
    return { valid: false, error: 'Format tanggal transaksi tidak valid.' };
  }

  // 3. Validasi jenis transaksi (dukung transaction_type maupun format legacy type)
  const validTypes = ['income', 'expense', 'transfer', 'adjustment', 'trading'];
  const type = String(tx.transaction_type || tx.type || '').toLowerCase();
  if (!validTypes.includes(type)) {
    return {
      valid: false,
      error: `Jenis transaksi '${tx.transaction_type || tx.type}' tidak sah. Jenis yang didukung: ${validTypes.join(', ')}.`,
    };
  }

  // 4. Validasi akun sumber
  if (!tx.account_id || typeof tx.account_id !== 'string' || !tx.account_id.trim()) {
    return { valid: false, error: 'Akun transaksi wajib dipilih.' };
  }

  const accountList = Array.isArray(accounts) ? accounts : [];
  if (accountList.length > 0) {
    const sourceAcc = accountList.find((a) => a && a.id === tx.account_id);
    if (!sourceAcc) {
      return { valid: false, error: `Akun sumber (${tx.account_id}) tidak ditemukan di sistem.` };
    }
  }

  // 5. Validasi khusus transaksi transfer
  if (type === 'transfer') {
    if (!tx.destination_account_id || typeof tx.destination_account_id !== 'string' || !tx.destination_account_id.trim()) {
      return { valid: false, error: 'Akun tujuan transfer wajib dipilih.' };
    }
    if (tx.destination_account_id === tx.account_id) {
      return { valid: false, error: 'Akun tujuan transfer tidak boleh sama dengan akun sumber.' };
    }
    if (accountList.length > 0) {
      const destAcc = accountList.find((a) => a && a.id === tx.destination_account_id);
      if (!destAcc) {
        return { valid: false, error: `Akun tujuan transfer (${tx.destination_account_id}) tidak ditemukan di sistem.` };
      }
    }
  }

  return { valid: true };
}

/**
 * Memperbarui saldo (current_balance) akun-akun yang terdampak secara atomik dan presisi.
 * Jika salah satu akun tidak ditemukan atau validasi gagal, tidak ada perubahan yang diterapkan.
 *
 * @param {Array<Object>} accounts - Daftar akun
 * @param {Object} transaction - Transaksi yang akan diterapkan
 * @returns {{ success: boolean, updatedAccounts: Array<Object>, error?: string }}
 */
export function applyTransactionToAccounts(accounts, transaction) {
  if (!Array.isArray(accounts)) {
    throw new TypeError('Parameter accounts harus berupa array.');
  }
  const validation = validateTransaction(transaction, accounts);
  if (!validation.valid) {
    return { success: false, updatedAccounts: accounts, error: validation.error };
  }

  const type = String(transaction.transaction_type || transaction.type || '').toLowerCase();
  const rawAmount = Number(transaction.amount);

  const sourceIndex = accounts.findIndex((a) => a && a.id === transaction.account_id);
  if (sourceIndex === -1) {
    return { success: false, updatedAccounts: accounts, error: `Akun sumber ${transaction.account_id} tidak ditemukan.` };
  }

  const sourceAccount = accounts[sourceIndex];
  const sourceCurrency = sourceAccount.currency || 'IDR';

  if (type === 'income') {
    // Menambah saldo akun sumber (atau destination jika ada)
    sourceAccount.current_balance = addCurrency(sourceAccount.current_balance || 0, rawAmount, sourceCurrency);
    return { success: true, updatedAccounts: [sourceAccount] };
  }

  if (type === 'expense') {
    // Mengurangi saldo akun sumber
    sourceAccount.current_balance = subtractCurrency(sourceAccount.current_balance || 0, rawAmount, sourceCurrency);
    return { success: true, updatedAccounts: [sourceAccount] };
  }

  if (type === 'transfer') {
    const destIndex = accounts.findIndex((a) => a && a.id === transaction.destination_account_id);
    if (destIndex === -1) {
      return { success: false, updatedAccounts: accounts, error: `Akun tujuan transfer ${transaction.destination_account_id} tidak ditemukan.` };
    }
    const destAccount = accounts[destIndex];
    const destCurrency = destAccount.currency || 'IDR';

    const destAmount = transaction.destination_amount !== undefined && transaction.destination_amount !== null
      ? Number(transaction.destination_amount)
      : rawAmount;

    // Mutasi atomik kedua akun
    sourceAccount.current_balance = subtractCurrency(sourceAccount.current_balance || 0, rawAmount, sourceCurrency);
    destAccount.current_balance = addCurrency(destAccount.current_balance || 0, destAmount, destCurrency);

    return { success: true, updatedAccounts: [sourceAccount, destAccount] };
  }

  if (type === 'adjustment') {
    const direction = String(transaction.direction || '').toLowerCase();
    if (direction === 'debit' || direction === 'decrease' || direction === 'out') {
      sourceAccount.current_balance = subtractCurrency(sourceAccount.current_balance || 0, rawAmount, sourceCurrency);
    } else {
      sourceAccount.current_balance = addCurrency(sourceAccount.current_balance || 0, rawAmount, sourceCurrency);
    }
    return { success: true, updatedAccounts: [sourceAccount] };
  }

  if (type === 'trading') {
    sourceAccount.current_balance = addCurrency(sourceAccount.current_balance || 0, rawAmount, sourceCurrency);
    return { success: true, updatedAccounts: [sourceAccount] };
  }

  return { success: true, updatedAccounts: [] };
}

/**
 * Mengembalikan saldo (revert) akun-akun terdampak ketika transaksi dihapus atau diedit.
 *
 * @param {Array<Object>} accounts - Daftar akun
 * @param {Object} transaction - Transaksi yang akan dibatalkan efek saldonya
 * @returns {{ success: boolean, updatedAccounts: Array<Object>, error?: string }}
 */
export function revertTransactionFromAccounts(accounts, transaction) {
  if (!Array.isArray(accounts)) {
    throw new TypeError('Parameter accounts harus berupa array.');
  }
  if (!transaction || typeof transaction !== 'object') {
    return { success: false, updatedAccounts: accounts, error: 'Transaksi tidak valid.' };
  }

  const type = String(transaction.transaction_type || transaction.type || '').toLowerCase();
  const rawAmount = Number(transaction.amount);
  if (!Number.isFinite(rawAmount)) {
    return { success: false, updatedAccounts: accounts, error: 'Nominal transaksi tidak valid untuk pembatalan.' };
  }

  const sourceIndex = accounts.findIndex((a) => a && a.id === transaction.account_id);
  if (sourceIndex === -1) {
    return { success: false, updatedAccounts: accounts, error: `Akun sumber ${transaction.account_id} tidak ditemukan.` };
  }

  const sourceAccount = accounts[sourceIndex];
  const sourceCurrency = sourceAccount.currency || 'IDR';

  if (type === 'income') {
    // Membalikkan income: mengurangi saldo yang telah ditambahkan
    sourceAccount.current_balance = subtractCurrency(sourceAccount.current_balance || 0, rawAmount, sourceCurrency);
    return { success: true, updatedAccounts: [sourceAccount] };
  }

  if (type === 'expense') {
    // Membalikkan expense: menambahkan kembali saldo yang telah dipotong
    sourceAccount.current_balance = addCurrency(sourceAccount.current_balance || 0, rawAmount, sourceCurrency);
    return { success: true, updatedAccounts: [sourceAccount] };
  }

  if (type === 'transfer') {
    const destIndex = accounts.findIndex((a) => a && a.id === transaction.destination_account_id);
    if (destIndex === -1) {
      return { success: false, updatedAccounts: accounts, error: `Akun tujuan ${transaction.destination_account_id} tidak ditemukan.` };
    }
    const destAccount = accounts[destIndex];
    const destCurrency = destAccount.currency || 'IDR';

    const destAmount = transaction.destination_amount !== undefined && transaction.destination_amount !== null
      ? Number(transaction.destination_amount)
      : rawAmount;

    // Membalikkan transfer atomik: kembalikan saldo ke source, tarik kembali dari destination
    sourceAccount.current_balance = addCurrency(sourceAccount.current_balance || 0, rawAmount, sourceCurrency);
    destAccount.current_balance = subtractCurrency(destAccount.current_balance || 0, destAmount, destCurrency);

    return { success: true, updatedAccounts: [sourceAccount, destAccount] };
  }

  if (type === 'adjustment') {
    const direction = String(transaction.direction || '').toLowerCase();
    if (direction === 'debit' || direction === 'decrease' || direction === 'out') {
      sourceAccount.current_balance = addCurrency(sourceAccount.current_balance || 0, rawAmount, sourceCurrency);
    } else {
      sourceAccount.current_balance = subtractCurrency(sourceAccount.current_balance || 0, rawAmount, sourceCurrency);
    }
    return { success: true, updatedAccounts: [sourceAccount] };
  }

  if (type === 'trading') {
    sourceAccount.current_balance = subtractCurrency(sourceAccount.current_balance || 0, rawAmount, sourceCurrency);
    return { success: true, updatedAccounts: [sourceAccount] };
  }

  return { success: true, updatedAccounts: [] };
}

/**
 * Menghitung estimasi saldo sebelum dan sesudah mutasi untuk pratinjau real-time.
 * @param {Object} params
 * @param {number} params.currentBalance - Saldo saat ini
 * @param {string} params.transactionType - 'income' | 'expense' | 'transfer' | 'trading'
 * @param {number|string} params.amount - Nominal mutasi
 * @param {boolean} [params.isSource=true] - Apakah akun bertindak sebagai sumber
 * @param {string} [params.currency='IDR'] - Kode mata uang akun
 * @returns {{ before: number, delta: number, after: number, isValid: boolean }}
 */
export function previewTransactionBalance({
  currentBalance = 0,
  transactionType = 'expense',
  amount = 0,
  isSource = true,
  currency = 'IDR'
}) {
  const curBal = Number(currentBalance);
  const numAmount = Number(amount);
  const validCurBal = Number.isFinite(curBal) ? curBal : 0;

  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return {
      before: roundCurrency(validCurBal, currency),
      delta: 0,
      after: roundCurrency(validCurBal, currency),
      isValid: false
    };
  }

  const type = String(transactionType).toLowerCase();
  const balMinor = toMinorUnits(validCurBal, currency);
  const amtMinor = toMinorUnits(numAmount, currency);
  let deltaMinor = 0;

  if (type === 'income' || type === 'trading') {
    deltaMinor = amtMinor;
  } else if (type === 'expense') {
    deltaMinor = -amtMinor;
  } else if (type === 'transfer') {
    deltaMinor = isSource ? -amtMinor : amtMinor;
  }

  const afterMinor = balMinor + deltaMinor;
  return {
    before: fromMinorUnits(balMinor, currency),
    delta: fromMinorUnits(deltaMinor, currency),
    after: fromMinorUnits(afterMinor, currency),
    isValid: true
  };
}
