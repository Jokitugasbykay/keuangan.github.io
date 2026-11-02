import { NextResponse } from 'next/server';
import { getDatabase, saveDatabase, withDbLock, createBackup, sanitizeError, validateDatabaseSchema } from '@/lib/db';

/**
 * Mengambil database lengkap dari data/db.json.
 * @returns {Promise<NextResponse>}
 */
export async function GET() {
  try {
    const db = getDatabase();
    return NextResponse.json(db);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Gagal membaca database JSON: ' + sanitizeError(error) },
      { status: 500 }
    );
  }
}

/**
 * Memproses aksi pencadangan, reset transaksi, atau pembaruan skema database.
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function POST(req) {
  return withDbLock(async () => {
    try {
      const body = await req.json();

      if (body.action === 'backup') {
        const backupResult = createBackup(body.reason || 'manual_api');
        return NextResponse.json(backupResult);
      }

      if (body.action === 'reset') {
        // Buat backup sebelum reset
        createBackup('pre-reset-safety');
        const currentDb = getDatabase();
        // Reset hanya transaksi, pertahankan akun dan kategori
        currentDb.transactions = [];
        const saved = saveDatabase(currentDb);
        if (!saved) {
          return NextResponse.json({ success: false, error: 'Gagal mereset transaksi.' }, { status: 500 });
        }
        return NextResponse.json({ success: true, message: 'Transaksi direset dan backup telah dibuat.' });
      }

      // Update data jika mengirim skema valid
      const currentDb = getDatabase();
      const updated = { ...currentDb, ...body };
      const validation = validateDatabaseSchema(updated);
      if (!validation.valid || !validation.data) {
        return NextResponse.json({ success: false, error: 'Format data tidak valid.', details: validation.errors }, { status: 400 });
      }

      const saved = saveDatabase(validation.data);
      if (!saved) {
        return NextResponse.json({ success: false, error: 'Gagal memperbarui database.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: validation.data });
    } catch (error) {
      return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
    }
  });
}
