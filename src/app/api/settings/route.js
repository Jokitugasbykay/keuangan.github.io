import { NextResponse } from 'next/server';
import { getDatabase, saveDatabase, withDbLock, DEFAULT_SETTINGS } from '@/lib/db';

/**
 * @typedef {import('@/lib/types').AppSettings} AppSettings
 */

/**
 * Mengambil pengaturan aplikasi dari database lokal.
 * @returns {Promise<NextResponse>}
 */
export async function GET() {
  try {
    const db = getDatabase();
    return NextResponse.json({
      success: true,
      settings: db.settings || DEFAULT_SETTINGS,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * Memperbarui pengaturan aplikasi di database lokal.
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function PUT(req) {
  return withDbLock(async () => {
    try {
      const data = await req.json();
      const db = getDatabase();

      const currentSettings = db.settings || DEFAULT_SETTINGS;
      /** @type {AppSettings} */
      const updatedSettings = {
        ...currentSettings,
        ...(data.app_name !== undefined ? { app_name: String(data.app_name).trim() } : {}),
        ...(data.default_currency !== undefined ? { default_currency: data.default_currency === 'USD' ? 'USD' : 'IDR' } : {}),
        ...(data.theme !== undefined ? { theme: data.theme } : {}),
        ...(data.auto_backup_enabled !== undefined ? { auto_backup_enabled: Boolean(data.auto_backup_enabled) } : {}),
        ...(data.max_backups !== undefined ? { max_backups: Math.max(3, Math.min(50, Number(data.max_backups) || 15)) } : {}),
        ...(data.usd_to_idr_rate !== undefined ? { usd_to_idr_rate: Number(data.usd_to_idr_rate) || 16250 } : {}),
      };

      db.settings = updatedSettings;
      const saved = saveDatabase(db);
      if (!saved) {
        return NextResponse.json({ success: false, error: 'Gagal memperbarui pengaturan lokal.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, settings: updatedSettings });
    } catch (error) {
      return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
  });
}
