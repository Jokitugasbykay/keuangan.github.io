import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { 
  getDatabase, 
  createBackup, 
  listBackups, 
  restoreBackup, 
  getBackupDir, 
  sanitizeError,
  withDbLock 
} from '@/lib/db';
import { requireServerAuth } from '@/lib/auth';

/**
 * Endpoint GET untuk backup: list daftar cadangan, unduh file tertentu, atau ekspor database aktif.
 * Wajib autentikasi sesi administrator.
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function GET(req) {
  const auth = requireServerAuth(req);
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'list') {
      const backups = listBackups();
      return NextResponse.json({ success: true, backups });
    }

    if (action === 'download') {
      const filename = searchParams.get('filename');
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return NextResponse.json({ success: false, error: 'Nama berkas tidak valid.' }, { status: 400 });
      }

      const backupDir = getBackupDir();
      const filePath = path.join(backupDir, filename);
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ success: false, error: 'Berkas cadangan tidak ditemukan.' }, { status: 404 });
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return new NextResponse(fileContent, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Default: Ekspor database aktif saat ini
    const db = getDatabase();
    const jsonString = JSON.stringify(db, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    return new NextResponse(jsonString, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="kayla-finance-backup-${dateStr}.json"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
  }
}

/**
 * Endpoint POST untuk backup: membuat cadangan baru atau memulihkan database dari JSON.
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function POST(req) {
  const auth = requireServerAuth(req);
  if (!auth.authenticated) return auth.response;

  return withDbLock(async () => {
    try {
      const body = await req.json();
      const action = body.action || 'create';

      if (action === 'create') {
        const result = createBackup(body.reason || 'manual_user');
        if (!result.success) {
          return NextResponse.json({ success: false, error: 'Gagal membuat salinan cadangan lokal.' }, { status: 500 });
        }
        return NextResponse.json({
          success: true,
          message: 'Cadangan berhasil dibuat di data/backups/',
          backup: result,
        });
      }

      if (action === 'restore') {
        let jsonContent = '';

        if (body.filename) {
          const filename = String(body.filename);
          if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return NextResponse.json({ success: false, error: 'Nama berkas tidak valid.' }, { status: 400 });
          }
          const backupDir = getBackupDir();
          const targetPath = path.join(backupDir, filename);
          if (!fs.existsSync(targetPath)) {
            return NextResponse.json({ success: false, error: 'Berkas cadangan tidak ditemukan.' }, { status: 404 });
          }
          jsonContent = fs.readFileSync(targetPath, 'utf-8');
        } else if (body.jsonString) {
          jsonContent = String(body.jsonString);
        } else if (body.data && typeof body.data === 'object') {
          jsonContent = JSON.stringify(body.data);
        } else {
          return NextResponse.json({
            success: false,
            error: 'Data pemulihan tidak disediakan (gunakan "filename", "jsonString", atau "data").',
          }, { status: 400 });
        }

        const restoreResult = restoreBackup(jsonContent);
        if (!restoreResult.success) {
          return NextResponse.json({
            success: false,
            error: restoreResult.message + (restoreResult.error ? ` Detail: ${restoreResult.error}` : ''),
          }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          message: restoreResult.message,
          count: restoreResult.count,
        });
      }

      return NextResponse.json({ success: false, error: `Aksi "${action}" tidak dikenali.` }, { status: 400 });
    } catch (error) {
      return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
    }
  });
}
