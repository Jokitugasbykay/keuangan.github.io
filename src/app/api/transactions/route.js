import { NextResponse } from 'next/server';
import { 
  getDatabase, 
  saveDatabase, 
  withDbLock, 
  sanitizeError 
} from '@/lib/db';
import { requireServerAuth } from '@/lib/auth';
import { 
  validateTransaction, 
  applyTransactionToAccounts, 
  revertTransactionFromAccounts 
} from '@/lib/ledger-engine';

/**
 * @typedef {import('@/lib/types').Transaction} Transaction
 */

/**
 * Tambah transaksi baru (Pemasukan, Pengeluaran, Transfer, Trading).
 * Beroperasi atomik menggunakan mutex lock di backend untuk mencegah race condition.
 * Kalkulasi saldo menggunakan Financial Ledger Engine berbasis minor units untuk mencegah drift IEEE-754.
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function POST(req) {
  const auth = requireServerAuth(req);
  if (!auth.authenticated) return auth.response;

  return withDbLock(async () => {
    try {
      const data = await req.json();
      const db = getDatabase();

      // Dukung baik transaction_type maupun legacy type, transaction_date maupun date
      const txType = data.transaction_type || data.type;
      const txDate = data.transaction_date || data.date ? new Date(data.transaction_date || data.date).toISOString() : new Date().toISOString();
      const parsedAmount = Number(data.amount);

      if (isNaN(parsedAmount) || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return NextResponse.json({ success: false, error: 'Nominal transaksi harus berupa angka positif lebih dari 0.' }, { status: 400 });
      }

      const normalizedInput = {
        ...data,
        account_id: data.account_id,
        transaction_type: txType,
        transaction_date: txDate,
        amount: parsedAmount,
      };

      const validation = validateTransaction(normalizedInput, db.accounts);
      if (!validation.valid) {
        return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
      }

      const sourceAcc = db.accounts.find((a) => a.id === normalizedInput.account_id);
      if (!sourceAcc) {
        return NextResponse.json({ success: false, error: 'Akun sumber tidak valid atau tidak ditemukan.' }, { status: 400 });
      }

      let destAcc = null;
      if (normalizedInput.transaction_type === 'transfer') {
        destAcc = db.accounts.find((a) => a.id === normalizedInput.destination_account_id);
        if (!destAcc) {
          return NextResponse.json({ success: false, error: 'Akun tujuan transfer tidak valid atau tidak ditemukan.' }, { status: 400 });
        }
        if (destAcc.id === sourceAcc.id) {
          return NextResponse.json({ success: false, error: 'Akun tujuan transfer tidak boleh sama dengan akun sumber.' }, { status: 400 });
        }
      }

      /** @type {Transaction} */
      const newTx = {
        id: `tx-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        account_id: normalizedInput.account_id,
        transaction_date: txDate,
        date: txDate,
        description: String(normalizedInput.description || '').trim(),
        amount: parsedAmount,
        transaction_type: txType,
        type: txType,
        category_id: normalizedInput.category_id || undefined,
        destination_account_id: txType === 'transfer' ? normalizedInput.destination_account_id : undefined,
        transfer_group_id: txType === 'transfer' ? `trf-${Date.now()}` : undefined,
        source: normalizedInput.source || 'manual',
        external_transaction_id: normalizedInput.external_transaction_id || undefined,
        receipt_items: Array.isArray(normalizedInput.receipt_items) ? normalizedInput.receipt_items : undefined,
        notes: normalizedInput.notes || '',
        created_at: new Date().toISOString(),
      };

      // Terapkan mutasi saldo atomik dengan minor units
      const applyResult = applyTransactionToAccounts(db.accounts, newTx);
      if (!applyResult.success) {
        return NextResponse.json({ success: false, error: applyResult.error || 'Gagal menerapkan kalkulasi saldo.' }, { status: 400 });
      }

      sourceAcc.last_synced_at = new Date().toISOString();
      if (destAcc) destAcc.last_synced_at = new Date().toISOString();

      db.transactions.unshift(newTx);

      const saved = saveDatabase(db);
      if (!saved) {
        // Rollback mutasi saldo
        revertTransactionFromAccounts(db.accounts, newTx);
        if (db.transactions[0]?.id === newTx.id) db.transactions.shift();
        return NextResponse.json({ success: false, error: 'Gagal menulis data transaksi ke database lokal.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, transaction: newTx, current_balance: sourceAcc.current_balance });
    } catch (error) {
      return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
    }
  });
}

/**
 * Edit transaksi yang ada.
 * Membalik efek saldo lama, memvalidasi perubahan, dan menerapkan efek saldo baru secara konsisten.
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function PUT(req) {
  const auth = requireServerAuth(req);
  if (!auth.authenticated) return auth.response;

  return withDbLock(async () => {
    try {
      const data = await req.json();
      if (!data.id) {
        return NextResponse.json({ success: false, error: 'ID transaksi wajib disertakan.' }, { status: 400 });
      }

      const db = getDatabase();
      const txIndex = db.transactions.findIndex((t) => t.id === data.id);
      if (txIndex === -1) {
        return NextResponse.json({ success: false, error: 'Transaksi tidak ditemukan.' }, { status: 404 });
      }

      const existingTx = db.transactions[txIndex];

      const txType = data.transaction_type || data.type || existingTx.transaction_type || existingTx.type;
      const txDate = data.transaction_date || data.date || existingTx.transaction_date || existingTx.date;
      const parsedAmount = data.amount !== undefined ? Number(data.amount) : existingTx.amount;

      if (isNaN(parsedAmount) || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return NextResponse.json({ success: false, error: 'Nominal transaksi harus berupa angka positif lebih dari 0.' }, { status: 400 });
      }

      const updatedTxInput = {
        account_id: data.account_id || existingTx.account_id,
        transaction_type: txType,
        amount: parsedAmount,
        description: data.description !== undefined ? data.description : existingTx.description,
        category_id: data.category_id !== undefined ? data.category_id : existingTx.category_id,
        destination_account_id: data.destination_account_id !== undefined ? data.destination_account_id : existingTx.destination_account_id,
        transaction_date: txDate ? new Date(txDate).toISOString() : new Date().toISOString(),
        notes: data.notes !== undefined ? data.notes : existingTx.notes,
        source: existingTx.source,
      };

      const validation = validateTransaction(updatedTxInput, db.accounts);
      if (!validation.valid) {
        return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
      }

      const newSourceAcc = db.accounts.find((a) => a.id === updatedTxInput.account_id);
      if (!newSourceAcc) {
        return NextResponse.json({ success: false, error: 'Akun sumber baru tidak valid atau tidak ditemukan.' }, { status: 400 });
      }

      let newDestAcc = null;
      if (updatedTxInput.transaction_type === 'transfer') {
        newDestAcc = db.accounts.find((a) => a.id === updatedTxInput.destination_account_id);
        if (!newDestAcc) {
          return NextResponse.json({ success: false, error: 'Akun tujuan transfer tidak valid atau tidak ditemukan.' }, { status: 400 });
        }
        if (newDestAcc.id === newSourceAcc.id) {
          return NextResponse.json({ success: false, error: 'Akun tujuan transfer tidak boleh sama dengan akun sumber.' }, { status: 400 });
        }
      }

      // Ambil snapshot saldo seluruh akun terkait untuk rollback jika gagal
      const balanceSnapshots = new Map();
      db.accounts.forEach((acc) => balanceSnapshots.set(acc.id, acc.current_balance));
      const rollbackAllBalances = () => {
        balanceSnapshots.forEach((bal, accId) => {
          const acc = db.accounts.find((a) => a.id === accId);
          if (acc) acc.current_balance = bal;
        });
      };

      try {
        // 1. Rollback saldo dari transaksi lama dengan minor units
        revertTransactionFromAccounts(db.accounts, existingTx);

        // 2. Terapkan saldo untuk transaksi baru dengan minor units
        const applyRes = applyTransactionToAccounts(db.accounts, updatedTxInput);
        if (!applyRes.success) {
          rollbackAllBalances();
          return NextResponse.json({ success: false, error: applyRes.error || 'Gagal menerapkan saldo baru.' }, { status: 400 });
        }

        /** @type {Transaction} */
        const updatedTx = {
          ...existingTx,
          account_id: updatedTxInput.account_id,
          transaction_type: updatedTxInput.transaction_type,
          type: updatedTxInput.transaction_type,
          amount: updatedTxInput.amount,
          description: String(updatedTxInput.description).trim(),
          category_id: updatedTxInput.category_id || undefined,
          destination_account_id: updatedTxInput.transaction_type === 'transfer' ? updatedTxInput.destination_account_id : undefined,
          transaction_date: new Date(updatedTxInput.transaction_date).toISOString(),
          date: new Date(updatedTxInput.transaction_date).toISOString(),
          notes: updatedTxInput.notes || '',
        };

        db.transactions[txIndex] = updatedTx;

        const saved = saveDatabase(db);
        if (!saved) {
          rollbackAllBalances();
          db.transactions[txIndex] = existingTx;
          return NextResponse.json({ success: false, error: 'Gagal memperbarui database JSON lokal.' }, { status: 500 });
        }

        return NextResponse.json({ success: true, transaction: updatedTx });
      } catch (mutateErr) {
        rollbackAllBalances();
        db.transactions[txIndex] = existingTx;
        throw mutateErr;
      }
    } catch (error) {
      return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
    }
  });
}

/**
 * Hapus transaksi dan kembalikan saldo akun secara konsisten menggunakan Financial Ledger Engine.
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function DELETE(req) {
  const auth = requireServerAuth(req);
  if (!auth.authenticated) return auth.response;

  return withDbLock(async () => {
    try {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');
      if (!id) {
        return NextResponse.json({ success: false, error: 'ID transaksi wajib disertakan.' }, { status: 400 });
      }

      const db = getDatabase();
      const txIndex = db.transactions.findIndex((t) => t.id === id);
      if (txIndex === -1) {
        return NextResponse.json({ success: false, error: 'Transaksi tidak ditemukan.' }, { status: 404 });
      }

      const existingTx = db.transactions[txIndex];

      // Ambil snapshot saldo seluruh akun terkait untuk rollback jika gagal
      const balanceSnapshots = new Map();
      db.accounts.forEach((acc) => balanceSnapshots.set(acc.id, acc.current_balance));
      const rollbackAllBalances = () => {
        balanceSnapshots.forEach((bal, accId) => {
          const acc = db.accounts.find((a) => a.id === accId);
          if (acc) acc.current_balance = bal;
        });
      };

      // Hapus transaksi dari daftar
      const [deletedTx] = db.transactions.splice(txIndex, 1);

      try {
        // Rollback saldo akun dengan minor units
        revertTransactionFromAccounts(db.accounts, deletedTx);

        const sourceAcc = db.accounts.find((a) => a.id === deletedTx.account_id);
        if (sourceAcc) sourceAcc.last_synced_at = new Date().toISOString();

        const saved = saveDatabase(db);
        if (!saved) {
          rollbackAllBalances();
          db.transactions.splice(txIndex, 0, deletedTx);
          return NextResponse.json({ success: false, error: 'Gagal menyimpan database setelah penghapusan.' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Transaksi berhasil dihapus.' });
      } catch (mutateErr) {
        rollbackAllBalances();
        db.transactions.splice(txIndex, 0, deletedTx);
        throw mutateErr;
      }
    } catch (error) {
      return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
    }
  });
}
