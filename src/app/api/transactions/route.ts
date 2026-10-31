import { NextResponse } from 'next/server';
import { getDatabase, saveDatabase } from '@/lib/db';
import { Transaction } from '@/lib/types';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const db = getDatabase();

    const parsedAmount = Number(data.amount);
    if (!data.account_id || !data.description || isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Nominal transaksi harus berupa angka positif lebih dari 0, serta akun dan deskripsi wajib diisi.' },
        { status: 400 }
      );
    }

    const sourceAcc = db.accounts.find(a => a.id === data.account_id);
    if (!sourceAcc) {
      return NextResponse.json(
        { success: false, error: 'Akun sumber transaksi tidak ditemukan.' },
        { status: 404 }
      );
    }

    const newTx: Transaction = {
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      account_id: data.account_id,
      transaction_date: data.transaction_date || new Date().toISOString(),
      description: data.description,
      amount: parsedAmount,
      transaction_type: data.transaction_type,
      category_id: data.category_id || undefined,
      destination_account_id: data.destination_account_id || undefined,
      transfer_group_id: data.transaction_type === 'transfer' ? `trf-${Date.now()}` : undefined,
      source: data.source || 'manual',
      notes: data.notes || '',
      created_at: new Date().toISOString(),
    };

    // Update account balances
    if (newTx.transaction_type === 'income' || newTx.transaction_type === 'trading') {
      sourceAcc.current_balance += newTx.amount;
    } else if (newTx.transaction_type === 'expense') {
      sourceAcc.current_balance -= newTx.amount;
    } else if (newTx.transaction_type === 'transfer') {
      if (!newTx.destination_account_id || newTx.destination_account_id === newTx.account_id) {
        return NextResponse.json(
          { success: false, error: 'Akun tujuan transfer tidak valid.' },
          { status: 400 }
        );
      }
      const destAcc = db.accounts.find(a => a.id === newTx.destination_account_id);
      if (!destAcc) {
        return NextResponse.json(
          { success: false, error: 'Akun tujuan transfer tidak ditemukan.' },
          { status: 404 }
        );
      }
      sourceAcc.current_balance -= newTx.amount;
      destAcc.current_balance += newTx.amount;
    }

    db.transactions.unshift(newTx);
    saveDatabase(db);

    return NextResponse.json({ success: true, transaction: newTx });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const db = getDatabase();
    const txIndex = db.transactions.findIndex(t => t.id === id);
    if (txIndex === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [deletedTx] = db.transactions.splice(txIndex, 1);

    // Rollback balance if appropriate
    const sourceAcc = db.accounts.find(a => a.id === deletedTx.account_id);
    if (sourceAcc) {
      if (deletedTx.transaction_type === 'income' || deletedTx.transaction_type === 'trading') {
        sourceAcc.current_balance -= deletedTx.amount;
      } else if (deletedTx.transaction_type === 'expense') {
        sourceAcc.current_balance += deletedTx.amount;
      } else if (deletedTx.transaction_type === 'transfer') {
        sourceAcc.current_balance += deletedTx.amount;
        if (deletedTx.destination_account_id) {
          const destAcc = db.accounts.find(a => a.id === deletedTx.destination_account_id);
          if (destAcc) {
            destAcc.current_balance -= deletedTx.amount;
          }
        }
      }
    }

    saveDatabase(db);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
