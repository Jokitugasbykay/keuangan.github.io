/**
 * @file Utilitas akses data sisi klien (Client-side Data Helper) dengan JSDoc.
 * Menghubungkan antarmuka UI dengan backend Next.js (data/db.json) dan fallback cache offline.
 * Memisahkan secara tegas antara lingkungan Demo Statis (GitHub Pages) dan Server Lokal (data pribadi).
 */

/**
 * @typedef {import('./types').DatabaseSchema} DatabaseSchema
 * @typedef {import('./types').Account} Account
 * @typedef {import('./types').Transaction} Transaction
 * @typedef {import('./types').TransactionType} TransactionType
 */

import defaultDatabase from './default-database.json' with { type: 'json' };
import { isVaultUnlocked, getActiveVaultDatabase, saveToVault } from './vault-storage.js';
import { 
  roundCurrency, 
  validateTransaction, 
  applyTransactionToAccounts, 
  revertTransactionFromAccounts 
} from './ledger-engine.js';

/** Namespace penyimpanan lokal untuk mode server lokal (private database cache) */
export const LOCAL_STORAGE_KEY = 'kayla_finance_db_v2';

/** Namespace penyimpanan lokal terisolasi untuk demo publik statis (GitHub Pages) */
export const DEMO_STORAGE_KEY = 'kayla_finance_demo_v1';

/**
 * Mendapatkan base path aplikasi Next.js jika dikonfigurasi.
 * @returns {string}
 */
export function getBasePath() {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASE_PATH) {
    return process.env.NEXT_PUBLIC_BASE_PATH;
  }
  return '';
}

/**
 * Membentuk URL API lengkap berdasarkan base path.
 * @param {string} path
 * @returns {string}
 */
export function apiUrl(path) {
  const base = getBasePath();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

/**
 * Mendeteksi apakah aplikasi sedang berjalan pada lingkungan export statis / demo publik (GitHub Pages).
 * Pada mode ini, seluruh operasi data dialihkan ke penyimpanan demo lokal browser terisolasi,
 * tanpa melakukan fetch ke endpoint backend privat yang tidak tersedia.
 * @returns {boolean}
 */
export function isStaticDemoMode() {
  if (process.env.NEXT_PUBLIC_IS_STATIC_EXPORT === 'true') {
    return true;
  }
  if (typeof window === 'undefined') {
    return process.env.STATIC_EXPORT === 'true' || process.env.GITHUB_ACTIONS === 'true';
  }
  const base = getBasePath();
  return window.location.hostname.includes('github.io') || !!base;
}

/**
 * Mendapatkan kunci localStorage aktif berdasarkan lingkungan runtime.
 * Menjaga agar data demo publik tidak mencemari atau menimpa cache data pribadi lokal.
 * @returns {string}
 */
export function getActiveStorageKey() {
  return isStaticDemoMode() ? DEMO_STORAGE_KEY : LOCAL_STORAGE_KEY;
}

/**
 * Membaca salinan database lokal secara konsisten untuk initial render bebas mismatch hidrasi React #418.
 * Menghasilkan snapshot data identik pada server (SSR) dan hidrasi awal peramban.
 * Pembaruan dari localStorage atau server API dieksekusi secara aman setelah mount via useEffect.
 * @returns {DatabaseSchema}
 */
export function getCachedDatabase() {
  return defaultDatabase;
}

/**
 * Utilitas pembungkus fetch yang aman terhadap parsing JSON non-JSON/HTML/404.
 * Memeriksa status HTTP dan Content-Type sebelum memanggil .json().
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<{ ok: boolean; status: number; data?: any; error?: string; isHtml?: boolean }>}
 */
export async function safeFetchJson(url, options = {}) {
  try {
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'X-Kayla-CSRF': '1',
      ...(options.headers || {}),
    };
    const res = await fetch(url, {
      ...options,
      headers,
      credentials: options.credentials || 'same-origin',
    });
    const contentType = res.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html');

    // Jika server mengembalikan 401 Unauthorized pada mode privat, alihkan ke login
    if (res.status === 401 && typeof window !== 'undefined' && !isStaticDemoMode()) {
      if (!window.location.pathname.includes('/login')) {
        window.location.href = apiUrl('/login?reason=expired');
      }
    }

    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        status: res.status,
        error: isHtml
          ? `Server mengembalikan halaman HTML (Status ${res.status}). Endpoint API tidak aktif.`
          : `Tipe konten bukan JSON (${contentType || 'tidak ada'}).`,
        isHtml,
      };
    }

    if (!res.ok) {
      try {
        const errJson = await res.json();
        return {
          ok: false,
          status: res.status,
          error: errJson?.error || `HTTP ${res.status}: ${res.statusText}`,
          data: errJson,
        };
      } catch {
        return {
          ok: false,
          status: res.status,
          error: `HTTP ${res.status}: ${res.statusText}`,
        };
      }
    }

    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: 'Koneksi jaringan gagal: ' + String(err),
    };
  }
}

/**
 * Mengambil database aktif sesuai mode lingkungan (Demo Statis vs Server Lokal).
 * 1. Di GitHub Pages: Menggunakan DEMO_STORAGE_KEY (tanpa menyentuh LOCAL_STORAGE_KEY lama).
 * 2. Di Server Lokal: Mengambil langsung dari backend Next.js (data/db.json).
 * @returns {Promise<DatabaseSchema | null>}
 */
export async function loadDatabase() {
  // 0. Periksa apakah Brankas Lokal Terenkripsi (Private Local Vault) sedang terbuka
  if (isVaultUnlocked()) {
    const vaultDb = getActiveVaultDatabase();
    if (vaultDb) return vaultDb;
  }

  const isDemo = isStaticDemoMode();
  const storageKey = getActiveStorageKey();

  // 1. Lingkungan Demo Statis (GitHub Pages)
  if (isDemo && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Gagal membaca cache demo:', e);
    }

    // Inisialisasi awal demo dari defaultDatabase sintetis tanpa menghapus cache lain
    try {
      localStorage.setItem(storageKey, JSON.stringify(defaultDatabase));
    } catch {}

    return defaultDatabase;
  }

  // 2. Lingkungan Server Lokal (Full-stack Next.js)
  const base = getBasePath();
  try {
    const res = await safeFetchJson(`${base}/api/data`, { cache: 'no-store' });
    if (res.ok && res.data) {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(res.data));
        } catch {}
      }
      return res.data;
    }
  } catch {
    // Backend offline / gagal
  }

  // 3. Fallback Offline Server Lokal: Ambil dari cache localStorage lokal
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Gagal membaca cache offline lokal:', e);
    }
  }

  return defaultDatabase;
}

/**
 * Menyimpan database ke penyimpanan lokal yang aktif dan memicu event pembaruan UI.
 * @param {DatabaseSchema} db
 */
export async function saveActiveDatabaseLocally(db) {
  if (typeof window === 'undefined') return;

  // Jika brankas terenkripsi aktif, re-enkripsi dan simpan HANYA ke brankas terenkripsi
  if (isVaultUnlocked()) {
    try {
      const res = await saveToVault(db);
      if (!res?.success) {
        console.error('Gagal menyimpan ke brankas terenkripsi:', res?.error);
      }
    } catch (err) {
      console.error('Pengecualian saat enkripsi dan penyimpanan brankas:', err);
    }
    // Picu event kustom pembaruan UI tanpa menulis plaintext ke localStorage
    window.dispatchEvent(new Event('kayla_db_updated'));
    return;
  }

  // Hanya jika brankas TIDAK aktif, tulis ke storage key biasa (demo / offline cache)
  try {
    const key = getActiveStorageKey();
    localStorage.setItem(key, JSON.stringify(db));
    window.dispatchEvent(new Event('kayla_db_updated'));
  } catch (err) {
    console.warn('Gagal menyimpan database lokal:', err);
  }
}

// ==========================================
// OPERASI AKUN KEUANGAN (ACCOUNTS)
// ==========================================

/**
 * @typedef {Object} NewAccountPayload
 * @property {string} name
 * @property {string} [provider]
 * @property {'bank' | 'ewallet' | 'trading' | 'payment_gateway'} account_type
 * @property {'IDR' | 'USD'} currency
 * @property {number} [current_balance=0]
 * @property {'personal' | 'business'} [ledger='personal']
 */

/**
 * Menambahkan akun baru secara aman.
 * Pada mode demo statis, perubahan disimpan di DEMO_STORAGE_KEY.
 * Pada mode server lokal, data dikirim ke API backend /api/accounts.
 * @param {NewAccountPayload} payload
 * @returns {Promise<{ success: boolean; account?: Account; error?: string }>}
 */
export async function saveAccountClient(payload) {
  if (!payload.name?.trim()) {
    return { success: false, error: 'Nama akun wajib diisi.' };
  }

  const bal = Number(payload.current_balance);
  if (isNaN(bal) || !Number.isFinite(bal) || bal < 0) {
    return { success: false, error: 'Saldo awal harus berupa angka valid dan tidak boleh bernilai negatif.' };
  }
  const currency = payload.currency === 'USD' ? 'USD' : 'IDR';
  const roundedBalance = roundCurrency(bal, currency);

  // Mode Brankas Terenkripsi atau Demo Statis: Simpan langsung di browser
  if (isVaultUnlocked() || isStaticDemoMode()) {
    const currentDb = (await loadDatabase()) || defaultDatabase;
    /** @type {Account} */
    const newAccount = {
      id: `acc-${isVaultUnlocked() ? 'vault' : 'demo'}-${Date.now()}`,
      name: payload.name.trim(),
      provider: payload.provider?.trim() || payload.name.trim(),
      account_type: payload.account_type || 'bank',
      currency,
      current_balance: roundedBalance,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      ledger: payload.ledger || 'personal',
    };

    currentDb.accounts = [newAccount, ...(currentDb.accounts || [])];
    await saveActiveDatabaseLocally(currentDb);
    return { success: true, account: newAccount };
  }

  // Mode Server Lokal: Kirim ke backend
  const res = await safeFetchJson(apiUrl('/api/accounts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, currency, current_balance: roundedBalance }),
  });

  if (res.ok && res.data?.success) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kayla_db_updated'));
    }
    return { success: true, account: res.data.account };
  }

  return { success: false, error: res.error || res.data?.error || 'Gagal menambahkan akun.' };
}

/**
 * Memperbarui akun keuangan yang ada.
 * @param {string} id
 * @param {Partial<Account>} payload
 * @returns {Promise<{ success: boolean; account?: Account; error?: string }>}
 */
export async function updateAccountClient(id, payload) {
  if (!id) {
    return { success: false, error: 'ID akun wajib disertakan.' };
  }

  const updatedPayload = { ...payload };
  if (payload.current_balance !== undefined) {
    const bal = Number(payload.current_balance);
    if (isNaN(bal) || !Number.isFinite(bal) || bal < 0) {
      return { success: false, error: 'Nominal saldo tidak valid atau tidak boleh bernilai negatif.' };
    }
    updatedPayload.current_balance = bal;
  }

  // Mode Brankas Terenkripsi atau Demo Statis: Update langsung di browser storage
  if (isVaultUnlocked() || isStaticDemoMode()) {
    const currentDb = (await loadDatabase()) || defaultDatabase;
    const accIndex = (currentDb.accounts || []).findIndex((a) => a.id === id);
    if (accIndex === -1) {
      return { success: false, error: 'Akun tidak ditemukan.' };
    }

    const targetAccount = currentDb.accounts[accIndex];
    if (updatedPayload.current_balance !== undefined) {
      updatedPayload.current_balance = roundCurrency(updatedPayload.current_balance, targetAccount.currency);
    }

    currentDb.accounts[accIndex] = {
      ...targetAccount,
      ...updatedPayload,
      last_synced_at: new Date().toISOString(),
    };

    await saveActiveDatabaseLocally(currentDb);
    return { success: true, account: currentDb.accounts[accIndex] };
  }

  // Mode Server Lokal: Kirim ke backend
  const res = await safeFetchJson(apiUrl('/api/accounts'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updatedPayload }),
  });

  if (res.ok && res.data?.success) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kayla_db_updated'));
    }
    return { success: true, account: res.data.account };
  }

  return { success: false, error: res.error || res.data?.error || 'Gagal memperbarui akun.' };
}

/**
 * Menghapus akun keuangan jika tidak memiliki catatan transaksi terkait.
 * @param {string} id
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function deleteAccountClient(id) {
  if (!id) {
    return { success: false, error: 'ID akun wajib disertakan.' };
  }

  // Mode Brankas Terenkripsi atau Demo Statis: Validasi relasi dan hapus dari browser storage
  if (isVaultUnlocked() || isStaticDemoMode()) {
    const currentDb = (await loadDatabase()) || defaultDatabase;
    const hasTransactions = (currentDb.transactions || []).some(
      (tx) => tx.account_id === id || tx.destination_account_id === id
    );

    if (hasTransactions) {
      return {
        success: false,
        error: 'Akun ini memiliki riwayat transaksi aktif. Hapus atau pindahkan transaksi terkait terlebih dahulu.',
      };
    }

    currentDb.accounts = (currentDb.accounts || []).filter((a) => a.id !== id);
    await saveActiveDatabaseLocally(currentDb);
    return { success: true };
  }

  // Mode Server Lokal: Kirim ke backend
  const res = await safeFetchJson(apiUrl(`/api/accounts?id=${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });

  if (res.ok && res.data?.success) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kayla_db_updated'));
    }
    return { success: true };
  }

  return { success: false, error: res.error || res.data?.error || 'Gagal menghapus akun.' };
}

/**
 * Mengubah status aktif/nonaktif suatu akun.
 * @param {Account} account
 * @returns {Promise<{ success: boolean; account?: Account; error?: string }>}
 */
export async function toggleAccountClient(account) {
  return updateAccountClient(account.id, { is_active: !account.is_active });
}

// ==========================================
// OPERASI TRANSAKSI KEUANGAN (TRANSACTIONS)
// ==========================================

/**
 * @typedef {Object} NewTransactionPayload
 * @property {string} account_id
 * @property {TransactionType} transaction_type
 * @property {number} amount
 * @property {string} description
 * @property {string} [category_id]
 * @property {string} [destination_account_id]
 * @property {string} [notes]
 * @property {Array<{ id?: string; name: string; qty: number; unit_price: number; subtotal: number }>} [receipt_items]
 * @property {'manual' | 'csv_import' | 'mt5' | 'mayar' | 'scan'} [source]
 * @property {string} [external_transaction_id]
 * @property {string} [transaction_date]
 */

/**
 * Menyimpan transaksi baru melalui API backend lokal atau demo storage.
 * @param {NewTransactionPayload} payload
 * @returns {Promise<{ success: boolean; transaction?: Transaction; error?: string }>}
 */
export async function saveTransactionClient(payload) {
  const txType = payload.transaction_type || payload.type || 'expense';
  const numAmount = Number(payload.amount);
  if (!payload.account_id || !payload.description || isNaN(numAmount) || !Number.isFinite(numAmount) || numAmount <= 0) {
    return {
      success: false,
      error: 'Nominal transaksi harus berupa angka positif lebih dari 0, akun dan deskripsi wajib diisi.',
    };
  }

  const txDate = (payload.transaction_date || payload.date) 
    ? new Date(payload.transaction_date || payload.date).toISOString() 
    : new Date().toISOString();

  /** @type {Transaction} */
  const fallbackTx = {
    id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    account_id: payload.account_id,
    transaction_date: txDate,
    date: txDate,
    description: String(payload.description).trim(),
    amount: numAmount,
    transaction_type: txType,
    type: txType,
    category_id: payload.category_id || undefined,
    destination_account_id: txType === 'transfer' ? payload.destination_account_id : undefined,
    transfer_group_id: txType === 'transfer' ? `trf-${Date.now()}` : undefined,
    source: payload.source || 'manual',
    external_transaction_id: payload.external_transaction_id || undefined,
    receipt_items: Array.isArray(payload.receipt_items) ? payload.receipt_items : undefined,
    notes: payload.notes || '',
    created_at: new Date().toISOString(),
  };

  // 1. Mode Brankas Terenkripsi atau Demo Statis: Update langsung di browser storage
  if (isVaultUnlocked() || isStaticDemoMode()) {
    const currentDb = (await loadDatabase()) || defaultDatabase;
    const validation = validateTransaction(fallbackTx, currentDb.accounts);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    const applyRes = applyTransactionToAccounts(currentDb.accounts, fallbackTx);
    if (!applyRes.success) {
      return { success: false, error: applyRes.error || 'Gagal menghitung mutasi saldo.' };
    }
    currentDb.transactions = [fallbackTx, ...(currentDb.transactions || [])];
    await saveActiveDatabaseLocally(currentDb);
    return { success: true, transaction: fallbackTx };
  }

  // 2. Mode Server Lokal: Kirim ke backend
  const base = getBasePath();
  const res = await safeFetchJson(`${base}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.ok && res.data?.success) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kayla_db_updated'));
    }
    return { success: true, transaction: res.data.transaction };
  }

  // Fallback offline lokal jika server mati
  const currentDb = (await loadDatabase()) || defaultDatabase;
  const applyRes = applyTransactionToAccounts(currentDb.accounts, fallbackTx);
  if (!applyRes.success) {
    return { success: false, error: applyRes.error || 'Gagal menerapkan transaksi ke akun lokal.' };
  }
  currentDb.transactions = [fallbackTx, ...(currentDb.transactions || [])];
  await saveActiveDatabaseLocally(currentDb);

  return { success: true, transaction: fallbackTx };
}

/**
 * Edit transaksi yang ada.
 * @param {string} id
 * @param {Partial<NewTransactionPayload>} payload
 * @returns {Promise<{ success: boolean; transaction?: Transaction; error?: string }>}
 */
export async function updateTransactionClient(id, payload) {
  if (isVaultUnlocked() || isStaticDemoMode()) {
    const currentDb = (await loadDatabase()) || defaultDatabase;
    const txIndex = (currentDb.transactions || []).findIndex((t) => t.id === id);
    if (txIndex === -1) return { success: false, error: 'Transaksi tidak ditemukan.' };

    const existingTx = currentDb.transactions[txIndex];
    const txType = payload.transaction_type || payload.type || existingTx.transaction_type || existingTx.type;
    const txDate = payload.transaction_date || payload.date || existingTx.transaction_date || existingTx.date;
    const numAmount = payload.amount !== undefined ? Number(payload.amount) : existingTx.amount;

    if (isNaN(numAmount) || !Number.isFinite(numAmount) || numAmount <= 0) {
      return { success: false, error: 'Nominal transaksi harus berupa angka positif lebih dari 0.' };
    }

    const updatedTx = {
      ...existingTx,
      ...payload,
      transaction_type: txType,
      type: txType,
      amount: numAmount,
      transaction_date: txDate ? new Date(txDate).toISOString() : existingTx.transaction_date,
      date: txDate ? new Date(txDate).toISOString() : existingTx.date,
      description: payload.description !== undefined ? String(payload.description).trim() : existingTx.description,
      destination_account_id: txType === 'transfer' ? (payload.destination_account_id ?? existingTx.destination_account_id) : undefined,
    };

    const validation = validateTransaction(updatedTx, currentDb.accounts);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Rollback efek saldo lama, lalu terapkan efek saldo baru
    revertTransactionFromAccounts(currentDb.accounts, existingTx);
    const applyRes = applyTransactionToAccounts(currentDb.accounts, updatedTx);
    if (!applyRes.success) {
      // Revert rollback jika gagal
      applyTransactionToAccounts(currentDb.accounts, existingTx);
      return { success: false, error: applyRes.error || 'Gagal menerapkan pembaruan saldo akun.' };
    }

    currentDb.transactions[txIndex] = updatedTx;
    await saveActiveDatabaseLocally(currentDb);
    return { success: true, transaction: currentDb.transactions[txIndex] };
  }

  const base = getBasePath();
  const res = await safeFetchJson(`${base}/api/transactions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...payload }),
  });

  if (res.ok && res.data?.success) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kayla_db_updated'));
    }
    return { success: true, transaction: res.data.transaction };
  }

  return { success: false, error: res.error || res.data?.error || 'Gagal memperbarui transaksi.' };
}

/**
 * Menghapus transaksi dan mengembalikan saldo rekening yang sesuai.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteTransactionClient(id) {
  if (isVaultUnlocked() || isStaticDemoMode()) {
    const currentDb = (await loadDatabase()) || defaultDatabase;
    const txIndex = (currentDb.transactions || []).findIndex((t) => t.id === id);
    if (txIndex !== -1) {
      const [deletedTx] = currentDb.transactions.splice(txIndex, 1);
      revertTransactionFromAccounts(currentDb.accounts, deletedTx);
      await saveActiveDatabaseLocally(currentDb);
      return true;
    }
    return false;
  }

  const base = getBasePath();
  const res = await safeFetchJson(`${base}/api/transactions?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  if (res.ok && res.data?.success) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kayla_db_updated'));
    }
    return true;
  }

  // Fallback offline lokal
  const currentDb = (await loadDatabase()) || defaultDatabase;
  const txIndex = (currentDb.transactions || []).findIndex((t) => t.id === id);
  if (txIndex !== -1) {
    const [deletedTx] = currentDb.transactions.splice(txIndex, 1);
    revertTransactionFromAccounts(currentDb.accounts, deletedTx);
    await saveActiveDatabaseLocally(currentDb);
    return true;
  }

  return false;
}

/**
 * Mengimpor transaksi massal dari data teks CSV.
 * @param {string} accountId
 * @param {string} csvData
 * @returns {Promise<{ success: boolean; importedCount?: number; duplicatesSkipped?: number; error?: string }>}
 */
export async function importCsvTransactionsClient(accountId, csvData) {
  if (!accountId || !csvData?.trim()) {
    return { success: false, error: 'Data CSV dan akun tujuan wajib diisi.' };
  }

  // 1. Mode Server Lokal: Kirim ke backend jika tersedia
  if (!isVaultUnlocked() && !isStaticDemoMode()) {
    const res = await safeFetchJson(apiUrl('/api/transactions/import'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, csvData }),
    });

    if (res.ok && res.data?.success) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('kayla_db_updated'));
      }
      return {
        success: true,
        importedCount: res.data.importedCount,
        duplicatesSkipped: res.data.duplicatesSkipped,
      };
    }
  }

  // 2. Mode Demo Statis atau Fallback Offline: Parser CSV Sisi Klien
  try {
    const lines = csvData.trim().split(/\r?\n/);
    if (lines.length < 2) {
      return { success: false, error: 'Berkas CSV kosong atau tidak memiliki header baris pertama.' };
    }

    const currentDb = (await loadDatabase()) || defaultDatabase;
    const account = (currentDb.accounts || []).find((a) => a.id === accountId);
    if (!account) {
      return { success: false, error: 'Akun tujuan tidak ditemukan dalam database.' };
    }

    const existingExternalIds = new Set(
      (currentDb.transactions || [])
        .filter((t) => t.account_id === accountId && t.external_transaction_id)
        .map((t) => t.external_transaction_id)
    );

    /** @type {Transaction[]} */
    const importedTransactions = [];
    let duplicatesSkipped = 0;
    let balanceDelta = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 3) continue;

      const rawDate = cols[0];
      const desc = cols[1];
      const rawAmount = cols[2];
      const rawType = cols[3]?.toLowerCase() || '';
      const refNo = cols[4] || `imp-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`;

      if (existingExternalIds.has(refNo)) {
        duplicatesSkipped++;
        continue;
      }

      const numAmount = Math.abs(parseFloat(rawAmount.replace(/[^0-9.-]+/g, '')) || 0);
      if (numAmount === 0 || isNaN(numAmount)) continue;

      /** @type {TransactionType} */
      let txType = 'expense';
      const isDebit = rawType.includes('db') || rawType.includes('debit') || rawType.includes('keluar');
      const isCredit = rawType.includes('cr') || rawType.includes('in') || rawType.includes('kredit') || rawType.includes('masuk');
      if (isCredit) {
        txType = 'income';
      } else if (isDebit) {
        txType = 'expense';
      } else {
        txType = parseFloat(rawAmount) < 0 ? 'expense' : 'income';
      }

      let parsedDateStr = new Date().toISOString();
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) parsedDateStr = d.toISOString();
      }

      const newTx = {
        id: `tx-import-${Date.now()}-${i}`,
        account_id: accountId,
        transaction_date: parsedDateStr,
        date: parsedDateStr,
        description: desc || 'Impor Mutasi Rekening',
        amount: numAmount,
        transaction_type: txType,
        type: txType,
        source: 'csv_import',
        external_transaction_id: refNo,
        notes: `Diimpor via CSV (${cols[4] ? 'Ref: ' + cols[4] : 'Baris ' + i})`,
        created_at: new Date().toISOString(),
      };

      importedTransactions.push(newTx);
      applyTransactionToAccounts(currentDb.accounts, newTx);
    }

    currentDb.transactions = [...importedTransactions, ...(currentDb.transactions || [])];
    await saveActiveDatabaseLocally(currentDb);

    return {
      success: true,
      importedCount: importedTransactions.length,
      duplicatesSkipped,
    };
  } catch (err) {
    return { success: false, error: 'Gagal memproses data CSV: ' + String(err) };
  }
}

// ==========================================
// OPERASI PENGATURAN & BACKUP (SETTINGS & BACKUP)
// ==========================================

/**
 * Menyimpan preferensi pengaturan aplikasi.
 * @param {Record<string, any>} payload
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function saveSettingsClient(payload) {
  if (isVaultUnlocked() || isStaticDemoMode()) {
    const currentDb = (await loadDatabase()) || defaultDatabase;
    currentDb.settings = {
      ...(currentDb.settings || {}),
      ...payload,
    };
    await saveActiveDatabaseLocally(currentDb);
    return { success: true };
  }

  const base = getBasePath();
  const res = await safeFetchJson(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.ok && res.data?.success) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kayla_db_updated'));
    }
    return { success: true };
  }

  return { success: false, error: res.error || res.data?.error || 'Gagal menyimpan pengaturan.' };
}

/**
 * Mengambil daftar file backup dari backend lokal.
 * Pada mode demo statis, mengembalikan array kosong tanpa melakukan request 404.
 * @returns {Promise<any[]>}
 */
export async function getBackupsListClient() {
  if (isVaultUnlocked() || isStaticDemoMode()) {
    return [];
  }

  const base = getBasePath();
  const res = await safeFetchJson(`${base}/api/backup?action=list`);
  if (res.ok && res.data?.success && Array.isArray(res.data.backups)) {
    return res.data.backups;
  }
  return [];
}

/**
 * Membuat cadangan data manual.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function createBackupClient() {
  if (isVaultUnlocked() || isStaticDemoMode()) {
    // Di mode demo statis, ekspor database demo ke JSON file
    await exportDatabaseToJson();
    return { success: true };
  }

  const base = getBasePath();
  const res = await safeFetchJson(`${base}/api/backup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', reason: 'manual_user' }),
  });

  if (res.ok && res.data?.success) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kayla_db_updated'));
    }
    return { success: true };
  }

  return { success: false, error: res.error || res.data?.error || 'Gagal membuat cadangan data.' };
}

/**
 * Mengunduh database lengkap sebagai berkas JSON lokal.
 * Bekerja secara universal di browser untuk mode demo maupun server.
 * @returns {Promise<void>}
 */
export async function exportDatabaseToJson() {
  const isDemo = isStaticDemoMode();
  const base = getBasePath();

  if (!isVaultUnlocked() && !isDemo && typeof window !== 'undefined') {
    // Mode server lokal: unduh langsung dari endpoint backend
    window.location.href = `${base}/api/backup`;
    return;
  }

  // Mode demo statis atau fallback: buat file JSON dari snapshot browser
  const db = (await loadDatabase()) || defaultDatabase;
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kayla-finance-${isVaultUnlocked() ? 'vault' : isDemo ? 'demo' : 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Mengimpor dan memulihkan database dari berkas JSON.
 * @param {string} jsonString
 * @returns {Promise<{ success: boolean; error?: string; count?: number; message?: string }>}
 */
export async function importDatabaseFromJson(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.transactions)) {
      return { success: false, error: 'Struktur berkas JSON tidak valid (membutuhkan accounts & transactions).' };
    }

    if (isVaultUnlocked() || isStaticDemoMode()) {
      await saveActiveDatabaseLocally(parsed);
      return {
        success: true,
        count: (parsed.transactions || []).length,
        message: 'Database demo berhasil dipulihkan dari berkas JSON.',
      };
    }

    const base = getBasePath();
    const res = await safeFetchJson(`${base}/api/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', jsonString }),
    });

    if (res.ok && res.data?.success) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('kayla_db_updated'));
      }
      return {
        success: true,
        count: res.data.count,
        message: res.data.message,
      };
    }

    return {
      success: false,
      error: res.error || res.data?.error || 'Gagal memulihkan database.',
    };
  } catch (err) {
    return {
      success: false,
      error: 'Format JSON rusak atau tidak dapat dibaca: ' + String(err),
    };
  }
}
