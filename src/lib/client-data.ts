import { DatabaseSchema, Transaction, TransactionType } from './types';

export const LOCAL_STORAGE_KEY = 'kayla_finance_db_v1';

export function getBasePath(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASE_PATH) {
    return process.env.NEXT_PUBLIC_BASE_PATH;
  }
  return '';
}

export function apiUrl(path: string): string {
  const base = getBasePath();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

/**
 * Mengambil database aktif dari backend Next.js (data/db.json).
 * Menyimpan salinan ke cache offline peramban dan menggunakan cache hanya jika server tidak dapat diakses.
 */
export async function loadDatabase(): Promise<DatabaseSchema | null> {
  const base = getBasePath();

  // 1. Prioritas utama: Ambil langsung dari backend lokal data/db.json
  try {
    const apiRes = await fetch(`${base}/api/data`, { cache: 'no-store' });
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
    // Backend offline / tidak terjangkau
  }

  // 2. Fallback offline: Ambil dari cache localStorage peramban
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
      console.warn('Gagal membaca database dari cache localStorage:', e);
    }
  }

  // 3. Fallback berkas statis jika dibuka pada lingkungan export
  try {
    const staticRes = await fetch(`${base}/data/db.json`);
    if (staticRes.ok) {
      const data = (await staticRes.json()) as DatabaseSchema;
      return data;
    }
  } catch {}

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
 * Menyimpan transaksi baru melalui API backend lokal.
 * Operasi dilakukan secara atomik di backend dengan mutex lock dan validasi skema.
 */
export async function saveTransactionClient(
  payload: NewTransactionPayload
): Promise<{ success: boolean; transaction?: Transaction; error?: string }> {
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
    const fallbackTx: Transaction = {
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
 */
export async function updateTransactionClient(
  id: string,
  payload: Partial<NewTransactionPayload>
): Promise<{ success: boolean; transaction?: Transaction; error?: string }> {
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
 */
export async function deleteTransactionClient(id: string): Promise<boolean> {
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
 */
export async function exportDatabaseToJson(): Promise<void> {
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
 */
export async function importDatabaseFromJson(
  jsonString: string
): Promise<{ success: boolean; error?: string; count?: number; message?: string }> {
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
