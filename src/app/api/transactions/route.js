import { NextResponse } from 'next/server';
import { 
  getDatabase, 
  saveDatabase, 
  withDbLock, 
  validateTransactionInput, 
  sanitizeError 
} from '@/lib/db';

/**
 * @typedef {import('@/lib/types').Transaction} Transaction
 */

/**
 * Tambah transaksi baru (Pemasukan, Pengeluaran, Transfer, Trading).
 * Beroperasi atomik menggunakan mutex lock di backend untuk mencegah race condition.
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function POST(req) {
  return withDbLock(async () => {
    try {
      const data = await req.json();
      const db = getDatabase();

      const validation = validateTransactionInput(data, db.accounts);
      if (!validation.valid) {
        return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
      }

      const parsedAmount = Number(data.amount);
      const sourceAcc = db.accounts.find((a) => a.id === data.account_id);
      if (!sourceAcc) {
        return NextResponse.json({ success: false, error: 'Akun sumber tidak ditemukan.' }, { status: 404 });
      }

      // Validasi konsistensi transfer
      let destAcc = null;
      if (data.transaction_type === 'transfer') {
        destAcc = db.accounts.find((a) => a.id === data.destination_account_id);
        if (!destAcc) {
          return NextResponse.json({ success: false, error: 'Akun tujuan transfer tidak ditemukan.' }, { status: 404 });
        }
        if (destAcc.id === sourceAcc.id) {
          return NextResponse.json({ success: false, error: 'Akun tujuan transfer tidak boleh sama dengan akun sumber.' }, { status: 400 });
        }
      }

      const txDate = data.transaction_date ? new Date(data.transaction_date).toISOString() : new Date().toISOString();
      /** @type {Transaction} */
      const newTx = {
        id: `tx-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        account_id: data.account_id,
        transaction_date: txDate,
        description: data.description.trim(),
        amount: parsedAmount,
        transaction_type: data.transaction_type,
        category_id: data.category_id || undefined,
        destination_account_id: data.transaction_type === 'transfer' ? data.destination_account_id : undefined,
        transfer_group_id: data.transaction_type === 'transfer' ? `trf-${Date.now()}` : undefined,
        source: data.source || 'manual',
        external_transaction_id: data.external_transaction_id || undefined,
        notes: data.notes || '',
        created_at: new Date().toISOString(),
      };

      // Simpan snapshot saldo awal untuk verifikasi atomik
      const initialSourceBalance = sourceAcc.current_balance;
      const initialDestBalance = destAcc ? destAcc.current_balance : null;

      try {
        if (newTx.transaction_type === 'income' || newTx.transaction_type === 'trading') {
          sourceAcc.current_balance += newTx.amount;
        } else if (newTx.transaction_type === 'expense') {
          sourceAcc.current_balance -= newTx.amount;
        } else if (newTx.transaction_type === 'transfer' && destAcc) {
          sourceAcc.current_balance -= newTx.amount;
          destAcc.current_balance += newTx.amount;
        }

        sourceAcc.last_synced_at = new Date().toISOString();
        if (destAcc) destAcc.last_synced_at = new Date().toISOString();

        db.transactions.unshift(newTx);

        const saved = saveDatabase(db);
        if (!saved) {
          // Rollback in-memory state jika penulisan disk gagal
          sourceAcc.current_balance = initialSourceBalance;
          if (destAcc && initialDestBalance !== null) destAcc.current_balance = initialDestBalance;
          db.transactions.shift();
          return NextResponse.json({ success: false, error: 'Gagal menulis data transaksi ke database lokal.' }, { status: 500 });
        }

        return NextResponse.json({ success: true, transaction: newTx, current_balance: sourceAcc.current_balance });
      } catch (mutateErr) {
        sourceAcc.current_balance = initialSourceBalance;
        if (destAcc && initialDestBalance !== null) destAcc.current_balance = initialDestBalance;
        if (db.transactions[0]?.id === newTx.id) db.transactions.shift();
        throw mutateErr;
      }
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

      // Merge data yang ingin diperbarui
      const updatedTxInput = {
        account_id: data.account_id || existingTx.account_id,
        transaction_type: data.transaction_type || existingTx.transaction_type,
        amount: data.amount !== undefined ? Number(data.amount) : existingTx.amount,
        description: data.description !== undefined ? data.description : existingTx.description,
        category_id: data.category_id !== undefined ? data.category_id : existingTx.category_id,
        destination_account_id: data.destination_account_id !== undefined ? data.destination_account_id : existingTx.destination_account_id,
        transaction_date: data.transaction_date || existingTx.transaction_date,
        notes: data.notes !== undefined ? data.notes : existingTx.notes,
        source: existingTx.source,
      };

      const validation = validateTransactionInput(updatedTxInput, db.accounts);
      if (!validation.valid) {
        return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
      }

      // Pre-validasi akun sumber dan tujuan baru sebelum melakukan mutasi apapun
      const newSourceAcc = db.accounts.find((a) => a.id === updatedTxInput.account_id);
      if (!newSourceAcc) {
        return NextResponse.json({ success: false, error: 'Akun sumber baru tidak ditemukan.' }, { status: 404 });
      }

      let newDestAcc = null;
      if (updatedTxInput.transaction_type === 'transfer') {
        newDestAcc = db.accounts.find((a) => a.id === updatedTxInput.destination_account_id);
        if (!newDestAcc) {
          return NextResponse.json({ success: false, error: 'Akun tujuan transfer tidak ditemukan.' }, { status: 404 });
        }
        if (newDestAcc.id === newSourceAcc.id) {
          return NextResponse.json({ success: false, error: 'Akun tujuan transfer tidak boleh sama dengan akun sumber.' }, { status: 400 });
        }
      }

      const oldSourceAcc = db.accounts.find((a) => a.id === existingTx.account_id);
      const oldDestAcc = existingTx.destination_account_id ? db.accounts.find((a) => a.id === existingTx.destination_account_id) : null;

      // Ambil snapshot saldo seluruh akun terkait untuk rollback jika penulisan gagal
      /** @type {Map<string, number>} */
      const balanceSnapshots = new Map();
      if (oldSourceAcc) balanceSnapshots.set(oldSourceAcc.id, oldSourceAcc.current_balance);
      if (oldDestAcc) balanceSnapshots.set(oldDestAcc.id, oldDestAcc.current_balance);
      balanceSnapshots.set(newSourceAcc.id, newSourceAcc.current_balance);
      if (newDestAcc) balanceSnapshots.set(newDestAcc.id, newDestAcc.current_balance);

      const rollbackAllBalances = () => {
        balanceSnapshots.forEach((bal, accId) => {
          const acc = db.accounts.find((a) => a.id === accId);
          if (acc) acc.current_balance = bal;
        });
      };

      try {
        // 1. Rollback saldo dari transaksi lama
        if (oldSourceAcc) {
          if (existingTx.transaction_type === 'income' || existingTx.transaction_type === 'trading') {
            oldSourceAcc.current_balance -= existingTx.amount;
          } else if (existingTx.transaction_type === 'expense') {
            oldSourceAcc.current_balance += existingTx.amount;
          } else if (existingTx.transaction_type === 'transfer' && oldDestAcc) {
            oldSourceAcc.current_balance += existingTx.amount;
            oldDestAcc.current_balance -= existingTx.amount;
          }
        }

        // 2. Terapkan saldo untuk transaksi baru
        if (updatedTxInput.transaction_type === 'income' || updatedTxInput.transaction_type === 'trading') {
          newSourceAcc.current_balance += updatedTxInput.amount;
        } else if (updatedTxInput.transaction_type === 'expense') {
          newSourceAcc.current_balance -= updatedTxInput.amount;
        } else if (updatedTxInput.transaction_type === 'transfer' && newDestAcc) {
          newSourceAcc.current_balance -= updatedTxInput.amount;
          newDestAcc.current_balance += updatedTxInput.amount;
        }

        /** @type {Transaction} */
        const updatedTx = {
          ...existingTx,
          account_id: updatedTxInput.account_id,
          transaction_type: updatedTxInput.transaction_type,
          amount: updatedTxInput.amount,
          description: updatedTxInput.description.trim(),
          category_id: updatedTxInput.category_id || undefined,
          destination_account_id: updatedTxInput.transaction_type === 'transfer' ? updatedTxInput.destination_account_id : undefined,
          transaction_date: new Date(updatedTxInput.transaction_date).toISOString(),
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
 * Hapus transaksi dan kembalikan saldo akun secara konsisten.
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function DELETE(req) {
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
      const sourceAcc = db.accounts.find((a) => a.id === existingTx.account_id);
      const destAcc = existingTx.destination_account_id ? db.accounts.find((a) => a.id === existingTx.destination_account_id) : null;

      const initialSourceBalance = sourceAcc ? sourceAcc.current_balance : null;
      const initialDestBalance = destAcc ? destAcc.current_balance : null;

      // Hapus transaksi dari daftar
      const [deletedTx] = db.transactions.splice(txIndex, 1);

      try {
        // Rollback saldo akun
        if (sourceAcc) {
          if (deletedTx.transaction_type === 'income' || deletedTx.transaction_type === 'trading') {
            sourceAcc.current_balance -= deletedTx.amount;
          } else if (deletedTx.transaction_type === 'expense') {
            sourceAcc.current_balance += deletedTx.amount;
          } else if (deletedTx.transaction_type === 'transfer' && destAcc) {
            sourceAcc.current_balance += deletedTx.amount;
            destAcc.current_balance -= deletedTx.amount;
          }
          sourceAcc.last_synced_at = new Date().toISOString();
        }

        const saved = saveDatabase(db);
        if (!saved) {
          // Revert in-memory jika simpan gagal
          if (sourceAcc && initialSourceBalance !== null) sourceAcc.current_balance = initialSourceBalance;
          if (destAcc && initialDestBalance !== null) destAcc.current_balance = initialDestBalance;
          db.transactions.splice(txIndex, 0, deletedTx);
          return NextResponse.json({ success: false, error: 'Gagal menyimpan database setelah penghapusan.' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Transaksi berhasil dihapus.' });
      } catch (mutateErr) {
        if (sourceAcc && initialSourceBalance !== null) sourceAcc.current_balance = initialSourceBalance;
        if (destAcc && initialDestBalance !== null) destAcc.current_balance = initialDestBalance;
        db.transactions.splice(txIndex, 0, deletedTx);
        throw mutateErr;
      }
    } catch (error) {
      return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
    }
  });
}
