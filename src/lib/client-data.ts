import { DatabaseSchema, Transaction, TransactionType } from './types';

export const LOCAL_STORAGE_KEY = 'kayla_finance_db_v1';

/**
 * Base path for assets and static files (empty locally, /keuangan.github.io on Pages).
 * Next.js Link components get basePath automatically; fetch() does not.
 */
export function getBasePath(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASE_PATH) {
    return process.env.NEXT_PUBLIC_BASE_PATH;
  }
  return '';
}

/** Prefix an absolute app path for fetch when basePath is set. */
export function apiUrl(path: string): string {
  const base = getBasePath();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

/**
 * Mengambil database aktif dari localStorage jika tersedia,
 * atau memuat dari server API / file statis publik db.json.
 */
export async function loadDatabase(): Promise<DatabaseSchema | null> {
  const base = getBasePath();

  // 1. Cek penyimpanan lokal di peramban jika pengguna sudah mencatat transaksi
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DatabaseSchema;
        if (Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Gagal membaca database dari localStorage:', e);
    }
  }

  // 2. Coba API server lokal Next.js
  try {
    const apiRes = await fetch(`${base}/api/data`);
    if (apiRes.ok) {
      const data = (await apiRes.json()) as DatabaseSchema;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        } catch {}
      }
      return data;
    }
  } catch {
    // API server tidak aktif (misal di GitHub Pages statis)
  }

  // 3. Fallback ke berkas statis public/data/db.json
  try {
    const staticRes = await fetch(`${base}/data/db.json`);
    if (staticRes.ok) {
      const data = (await staticRes.json()) as DatabaseSchema;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        } catch {}
      }
      return data;
    }
  } catch (e) {
    console.error('Gagal memuat database dari sumber statis:', e);
  }

  return null;
}

export interface NewTransactionPayload {
  account_id: string;
  transaction_type: TransactionType;
  amount: number;
  description: string;
  category_id?: string;
  destination_account_id?: string;
  notes?: string;
  source?: 'manual' | 'csv_import' | 'mt5' | 'mayar' | 'scan';
  external_transaction_id?: string;
  transaction_date?: string;
}

/**
 * Menyimpan transaksi baru (Pemasukan, Pengeluaran, Transfer, atau Trading).
 * Bekerja secara otomatis di lingkungan Server lokal maupun hosting statis (GitHub Pages).
 * Selalu memperbarui saldo akun dan mencatat transaksi ke dalam berkas JSON / localStorage.
 */
export async function saveTransactionClient(
  payload: NewTransactionPayload
): Promise<{ success: boolean; transaction?: Transaction; error?: string }> {
  const numAmount = Number(payload.amount);
  if (!payload.account_id || !payload.description || isNaN(numAmount) || numAmount <= 0) {
    return {
      success: false,
      error: 'Nominal transaksi harus lebih dari 0, akun dan deskripsi wajib diisi.',
    };
  }

  const base = getBasePath();
  const txDate = payload.transaction_date ? new Date(payload.transaction_date).toISOString() : new Date().toISOString();

  const newTx: Transaction = {
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

  // 1. Coba simpan ke server backend lokal jika aktif
  let serverSaved = false;
  try {
    const res = await fetch(`${base}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      serverSaved = true;
    }
  } catch {
    // Server backend tidak tersedia (misal di GitHub Pages), lanjut simpan ke penyimpanan lokal
  }

  // 2. Selalu perbarui penyimpanan lokal (localStorage / json cache)
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

      currentDb.transactions.unshift(newTx);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentDb));
      window.dispatchEvent(new Event('kayla_db_updated'));
    } catch (err) {
      console.warn('Gagal menyimpan transaksi ke localStorage:', err);
    }
  }

  return { success: true, transaction: newTx };
}

/**
 * Menghapus transaksi dan mengembalikan saldo rekening yang sesuai.
 */
export async function deleteTransactionClient(id: string): Promise<boolean> {
  const base = getBasePath();

  // 1. Coba hapus via server jika aktif
  try {
    await fetch(`${base}/api/transactions?id=${id}`, { method: 'DELETE' });
  } catch {}

  // 2. Hapus dari penyimpanan lokal
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
 * Mengunduh seluruh basis data transaksi ke dalam berkas JSON (.json).
 */
export async function exportDatabaseToJson(): Promise<void> {
  const db = await loadDatabase();
  if (!db) {
    alert('Tidak ada data transaksi yang dapat diekspor.');
    return;
  }

  const jsonStr = JSON.stringify(db, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kayla-finance-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Mengimpor basis data dari berkas JSON.
 */
export async function importDatabaseFromJson(jsonString: string): Promise<{ success: boolean; error?: string; count?: number }> {
  try {
    const parsed = JSON.parse(jsonString) as DatabaseSchema;
    if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.transactions)) {
      return { success: false, error: 'Format berkas JSON tidak sesuai struktur Kayla Finance.' };
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
      window.dispatchEvent(new Event('kayla_db_updated'));
    }

    return { success: true, count: parsed.transactions.length };
  } catch (err) {
    return { success: false, error: 'Gagal memproses berkas JSON: ' + String(err) };
  }
}
