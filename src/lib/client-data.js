/**
 * @file Utilitas akses data sisi klien (Client-side Data Helper) dengan JSDoc.
 * Menghubungkan antarmuka UI dengan backend Next.js (data/db.json) dan fallback cache localStorage offline.
 */

/**
 * @typedef {import('./types').DatabaseSchema} DatabaseSchema
 * @typedef {import('./types').Transaction} Transaction
 * @typedef {import('./types').TransactionType} TransactionType
 */

import defaultDatabase from './default-database.json';

export const LOCAL_STORAGE_KEY = 'kayla_finance_db_v2';

/**
 * Membaca salinan database lokal secara sinkron dari cache offline (localStorage) atau default schema.
 * Berguna untuk perenderan preview instan tanpa jeda asynchronous dan bebas mismatch hidrasi.
 * @returns {DatabaseSchema}
 */
export function getCachedDatabase() {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions) && parsed.transactions.length > 0) {
          return parsed;
        }
      }
    } catch {}
  }
  return defaultDatabase;
}

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
 * Mengambil database aktif dari backend Next.js (data/db.json).
 * Menyimpan salinan ke cache offline peramban dan menggunakan cache hanya jika server tidak dapat diakses.
 * @returns {Promise<DatabaseSchema | null>}
 */
export async function loadDatabase() {
  const base = getBasePath();
  const isGitHubPages = typeof window !== 'undefined' && (window.location.hostname.includes('github.io') || !!base);

  // 1. Cek cache offline localStorage terlebih dahulu untuk respon instan
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions) && parsed.transactions.length > 0) {
          // Jika di lingkungan GitHub Pages (statis), gunakan cache langsung tanpa request backend yang 404
          if (isGitHubPages) {
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Gagal membaca database dari cache localStorage:', e);
    }
  }

  // 2. Ambil langsung dari backend lokal data/db.json (khusus local server / full-stack)
  if (!isGitHubPages) {
    try {
      const apiRes = await fetch(`${base}/api/data`, { cache: 'no-store' });
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
          } catch {}
        }
        return data;
      }
    } catch {
      // Backend offline / tidak terjangkau
    }
  }

  // 3. Fallback offline: Ambil dari cache localStorage peramban
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions) && parsed.transactions.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Gagal membaca database dari cache localStorage:', e);
    }
  }

  // 4. Fallback berkas statis jika dibuka pada lingkungan export (misal GitHub Pages)
  try {
    const staticRes = await fetch(`${base}/demo-db.json`);
    if (staticRes.ok) {
      const data = await staticRes.json();
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        } catch {}
      }
      return data;
    }
  } catch {}

  try {
    const staticRes = await fetch(`${base}/data/db.json`);
    if (staticRes.ok) {
      const data = await staticRes.json();
      return data;
    }
  } catch {}

  return defaultDatabase;
}

/**
 * @typedef {Object} NewTransactionPayload
 * @property {string} account_id
 * @property {TransactionType} transaction_type
 * @property {number} amount
 * @property {string} description
 * @property {string} [category_id]
 * @property {string} [destination_account_id]
 * @property {string} [notes]
 * @property {'manual' | 'csv_import' | 'mt5' | 'mayar' | 'scan'} [source]
 * @property {string} [external_transaction_id]
 * @property {string} [transaction_date]
 */

/**
 * Menyimpan transaksi baru melalui API backend lokal.
 * Operasi dilakukan secara atomik di backend dengan mutex lock dan validasi skema.
 * @param {NewTransactionPayload} payload
 * @returns {Promise<{ success: boolean; transaction?: Transaction; error?: string }>}
 */
export async function saveTransactionClient(payload) {
  const numAmount = Number(payload.amount);
  if (!payload.account_id || !payload.description || isNaN(numAmount) || numAmount <= 0) {
    return {
      success: false,
      error: 'Nominal transaksi harus berupa angka positif lebih dari 0, akun dan deskripsi wajib diisi.',
    };
  }

  const base = getBasePath();

  // Kirim ke backend untuk validasi dan penulisan atomik
  try {
    const res = await fetch(`${base}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const resJson = await res.json();
    if (!res.ok || !resJson.success) {
      return {
        success: false,
        error: resJson.error || 'Gagal menyimpan transaksi di database lokal.',
      };
    }

    // Perbarui cache lokal dan beri sinyal pembaruan tampilan
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kayla_db_updated'));
    }

    return { success: true, transaction: resJson.transaction };
  } catch {
    // Mode offline mandiri jika server tidak aktif
    const txDate = payload.transaction_date ? new Date(payload.transaction_date).toISOString() : new Date().toISOString();
    /** @type {Transaction} */
    const fallbackTx = {
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      account_id: payload.account_id,
      transaction_date: txDate,
      description: payload.description,
      amount: numAmount,
      transaction_type: payload.transaction_type,
      category_id: payload.category_id || undefined,
      destination_account_id: payload.transaction_type === 'transfer' ? payload.destination_account_id : undefined,
      transfer_group_id: payload.transaction_type === 'transfer' ? `trf-${Date.now()}` : undefined,
      source: payload.source || 'manual',
      external_transaction_id: payload.external_transaction_id || undefined,
      notes: payload.notes || '',
      created_at: new Date().toISOString(),
    };

    if (typeof window !== 'undefined') {
      try {
        const currentDb = (await loadDatabase()) || {
          accounts: [],
          transactions: [],
          categories: [],
          trading_accounts: [],
          sync_logs: [],
        };

        const sourceAcc = currentDb.accounts.find((a) => a.id === payload.account_id);
        if (sourceAcc) {
          if (payload.transaction_type === 'income' || payload.transaction_type === 'trading') {
            sourceAcc.current_balance += numAmount;
          } else if (payload.transaction_type === 'expense') {
            sourceAcc.current_balance -= numAmount;
          } else if (payload.transaction_type === 'transfer' && payload.destination_account_id) {
            const destAcc = currentDb.accounts.find((a) => a.id === payload.destination_account_id);
            if (destAcc) {
              sourceAcc.current_balance -= numAmount;
              destAcc.current_balance += numAmount;
            }
          }
        }

        currentDb.transactions.unshift(fallbackTx);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentDb));
        window.dispatchEvent(new Event('kayla_db_updated'));
      } catch (err) {
        console.warn('Gagal menyimpan ke cache offline:', err);
      }
    }

    return { success: true, transaction: fallbackTx };
  }
}

/**
 * Edit transaksi yang ada melalui API backend lokal.
 * @param {string} id
 * @param {Partial<NewTransactionPayload>} payload
 * @returns {Promise<{ success: boolean; transaction?: Transaction; error?: string }>}
 */
export async function updateTransactionClient(id, payload) {
  const base = getBasePath();

  try {
    const res = await fetch(`${base}/api/transactions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...payload }),
    });

    const resJson = await res.json();
    if (!res.ok || !resJson.success) {
      return { success: false, error: resJson.error || 'Gagal memperbarui transaksi.' };
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kayla_db_updated'));
    }

    return { success: true, transaction: resJson.transaction };
  } catch (error) {
    return { success: false, error: 'Koneksi ke backend gagal: ' + String(error) };
  }
}

/**
 * Menghapus transaksi dan mengembalikan saldo rekening yang sesuai.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteTransactionClient(id) {
  const base = getBasePath();

  try {
    const res = await fetch(`${base}/api/transactions?id=${id}`, { method: 'DELETE' });
    const resJson = await res.json();
    if (res.ok && resJson.success) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('kayla_db_updated'));
      }
      return true;
    }
  } catch {}

  // Fallback cache lokal
  if (typeof window !== 'undefined') {
    try {
      const currentDb = await loadDatabase();
      if (!currentDb) return false;

      const txIndex = currentDb.transactions.findIndex((t) => t.id === id);
      if (txIndex !== -1) {
        const [deletedTx] = currentDb.transactions.splice(txIndex, 1);
        const sourceAcc = currentDb.accounts.find((a) => a.id === deletedTx.account_id);

        if (sourceAcc) {
          if (deletedTx.transaction_type === 'income' || deletedTx.transaction_type === 'trading') {
            sourceAcc.current_balance -= deletedTx.amount;
          } else if (deletedTx.transaction_type === 'expense') {
            sourceAcc.current_balance += deletedTx.amount;
          } else if (deletedTx.transaction_type === 'transfer' && deletedTx.destination_account_id) {
            const destAcc = currentDb.accounts.find((a) => a.id === deletedTx.destination_account_id);
            if (destAcc) {
              sourceAcc.current_balance += deletedTx.amount;
              destAcc.current_balance -= deletedTx.amount;
            }
          }
        }

        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentDb));
        window.dispatchEvent(new Event('kayla_db_updated'));
        return true;
      }
    } catch (e) {
      console.error(e);
    }
  }

  return false;
}

/**
 * Mengunduh database lengkap langsung dari backend data/db.json.
 * @returns {Promise<void>}
 */
export async function exportDatabaseToJson() {
  const base = getBasePath();
  try {
    window.location.href = `${base}/api/backup`;
  } catch {
    const db = await loadDatabase();
    if (!db) {
      alert('Tidak ada data yang dapat diekspor.');
      return;
    }
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kayla-finance-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/**
 * Mengimpor dan memulihkan database dari berkas JSON melalui backend lokal.
 * @param {string} jsonString
 * @returns {Promise<{ success: boolean; error?: string; count?: number; message?: string }>}
 */
export async function importDatabaseFromJson(jsonString) {
  const base = getBasePath();

  try {
    const res = await fetch(`${base}/api/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', jsonString }),
    });

    const resJson = await res.json();
    if (!res.ok || !resJson.success) {
      return {
        success: false,
        error: resJson.error || 'Gagal memulihkan database dari berkas JSON.',
      };
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('kayla_db_updated'));
    }

    return {
      success: true,
      count: resJson.count,
      message: resJson.message,
    };
  } catch (err) {
    return {
      success: false,
      error: 'Gagal menghubungi server pemulihan: ' + String(err),
    };
  }
}
