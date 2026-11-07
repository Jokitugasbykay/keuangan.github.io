import { NextResponse } from 'next/server';
import { getDatabase, saveDatabase, withDbLock, sanitizeError } from '@/lib/db';
import { requireServerAuth } from '@/lib/auth';
import { roundCurrency } from '@/lib/ledger-engine';

/**
 * @typedef {import('@/lib/types').Account} Account
 * @typedef {import('@/lib/types').AccountType} AccountType
 */

const VALID_ACCOUNT_TYPES = ['bank', 'ewallet', 'trading', 'payment_gateway'];

/**
 * Menambahkan akun baru ke database lokal (wajib autentikasi sesi + CSRF).
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function POST(req) {
  const auth = requireServerAuth(req);
  if (!auth.authenticated) return auth.response;

  return withDbLock(async () => {
    try {
      const data = await req.json();
      if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
        return NextResponse.json({ success: false, error: 'Nama akun wajib diisi.' }, { status: 400 });
      }

      const accType = VALID_ACCOUNT_TYPES.includes(data.account_type) ? data.account_type : 'bank';
      const currency = data.currency === 'USD' ? 'USD' : 'IDR';
      const balance = Number(data.current_balance);

      if (isNaN(balance) || !Number.isFinite(balance) || balance < 0) {
        return NextResponse.json({ success: false, error: 'Saldo awal harus berupa angka valid dan tidak boleh bernilai negatif.' }, { status: 400 });
      }

      const roundedBalance = roundCurrency(balance, currency);
      const db = getDatabase();

      /** @type {Account} */
      const newAccount = {
        id: `acc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: data.name.trim(),
        provider: (typeof data.provider === 'string' && data.provider.trim()) ? data.provider.trim() : data.name.trim(),
        account_type: accType,
        currency,
        current_balance: roundedBalance,
        is_active: true,
        last_synced_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        ledger: data.ledger === 'business' ? 'business' : 'personal',
      };

      db.accounts.push(newAccount);
      const saved = saveDatabase(db);
      if (!saved) {
        db.accounts.pop();
        return NextResponse.json({ success: false, error: 'Gagal menyimpan akun ke database lokal.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, account: newAccount });
    } catch (error) {
      return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
    }
  });
}

/**
 * Memperbarui data akun (nama, provider, status aktif, saldo, atau ledger).
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
        return NextResponse.json({ success: false, error: 'ID akun wajib disertakan.' }, { status: 400 });
      }

      const db = getDatabase();
      const account = db.accounts.find((a) => a.id === data.id);
      if (!account) {
        return NextResponse.json({ success: false, error: 'Akun tidak ditemukan.' }, { status: 404 });
      }

      const prevSnapshot = { ...account };

      if (data.name !== undefined) {
        if (typeof data.name !== 'string' || !data.name.trim()) {
          return NextResponse.json({ success: false, error: 'Nama akun tidak boleh kosong.' }, { status: 400 });
        }
        account.name = data.name.trim();
      }
      if (data.provider !== undefined) {
        account.provider = (typeof data.provider === 'string' && data.provider.trim()) ? data.provider.trim() : account.name;
      }
      if (data.current_balance !== undefined) {
        const bal = Number(data.current_balance);
        if (isNaN(bal) || !Number.isFinite(bal) || bal < 0) {
          return NextResponse.json({ success: false, error: 'Nominal saldo tidak valid atau tidak boleh bernilai negatif.' }, { status: 400 });
        }
        account.current_balance = roundCurrency(bal, account.currency);
      }
      if (data.is_active !== undefined) account.is_active = Boolean(data.is_active);
      if (data.ledger !== undefined) account.ledger = data.ledger === 'business' ? 'business' : 'personal';
      account.last_synced_at = new Date().toISOString();

      const saved = saveDatabase(db);
      if (!saved) {
        Object.assign(account, prevSnapshot);
        return NextResponse.json({ success: false, error: 'Gagal memperbarui akun di database lokal.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, account });
    } catch (error) {
      return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
    }
  });
}

/**
 * Hapus akun dengan proteksi integritas: akun yang memiliki transaksi atau terhubung ke MT5 dilarang dihapus.
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
        return NextResponse.json({ success: false, error: 'ID akun wajib disertakan.' }, { status: 400 });
      }

      const db = getDatabase();
      const accIndex = db.accounts.findIndex((a) => a.id === id);
      if (accIndex === -1) {
        return NextResponse.json({ success: false, error: 'Akun tidak ditemukan.' }, { status: 404 });
      }

      // Lindungi dari penghapusan akun yang memiliki riwayat transaksi
      const hasTransactions = db.transactions.some(
        (t) => t.account_id === id || t.destination_account_id === id
      );

      if (hasTransactions) {
        return NextResponse.json(
          {
            success: false,
            error: 'Akun ini memiliki riwayat transaksi dan tidak dapat dihapus demi menjaga integritas data keuangan. Anda dapat menonaktifkannya melalui opsi status aktif/nonaktif.',
          },
          { status: 400 }
        );
      }

      // Lindungi dari penghapusan akun yang terhubung ke MT5
      const hasTrading = db.trading_accounts.some((ta) => ta.account_id === id);
      if (hasTrading) {
        return NextResponse.json(
          {
            success: false,
            error: 'Akun ini terhubung dengan sistem trading MT5 dan tidak dapat dihapus.',
          },
          { status: 400 }
        );
      }

      const [deletedAcc] = db.accounts.splice(accIndex, 1);
      const saved = saveDatabase(db);
      if (!saved) {
        db.accounts.splice(accIndex, 0, deletedAcc);
        return NextResponse.json({ success: false, error: 'Gagal menyimpan perubahan ke database lokal.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Akun berhasil dihapus.' });
    } catch (error) {
      return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
    }
  });
}
