import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';

// Supported MIME types for vision processing
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];
const MAX_BASE64_SIZE = 12 * 1024 * 1024; // ~12MB limit

export interface ScanResult {
  success: boolean;
  data?: {
    transaction_type: 'income' | 'expense' | null;
    amount: number | null;
    currency: string;
    date: string | null;
    description: string;
    merchant: string;
    reference_number: string | null;
    suggested_account: string | null;
    confidence: 'low' | 'medium' | 'high';
    notes: string;
  };
  ocrEngine?: string;
  error?: string;
}

/**
 * Cari path executable Python lokal yang valid:
 * 1. .venv lokal proyek (d:\PENCATAT KEUAGAN\.venv\Scripts\python.exe)
 * 2. uv python environment
 * 3. python standar di sistem
 */
function getPythonExecutablePath(): string {
  const projectVenv = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
  if (existsSync(projectVenv)) {
    return projectVenv;
  }

  const uvPython = path.join(
    os.homedir(),
    'AppData',
    'Roaming',
    'uv',
    'python',
    'cpython-3.11-windows-x86_64-none',
    'python.exe'
  );
  if (existsSync(uvPython)) {
    return uvPython;
  }

  return 'python';
}

export async function POST(req: NextRequest): Promise<NextResponse<ScanResult>> {
  let body: { imageBase64?: string; mimeType?: string; transactionType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Request body tidak valid.' }, { status: 400 });
  }

  const { imageBase64, mimeType, transactionType } = body;

  // Validasi input
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return NextResponse.json({ success: false, error: 'Data gambar tidak ditemukan.' }, { status: 400 });
  }

  if (!mimeType || !SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json({
      success: false,
      error: `Format gambar tidak didukung. Format yang diterima: ${SUPPORTED_MIME_TYPES.join(', ')}.`,
    }, { status: 400 });
  }

  if (imageBase64.length > MAX_BASE64_SIZE * 1.4) {
    return NextResponse.json({
      success: false,
      error: 'Ukuran file terlalu besar. Maksimal 10 MB.',
    }, { status: 413 });
  }

  // Tentukan path python dan skrip OCR
  const pythonPath = getPythonExecutablePath();
  const scriptPath = path.join(process.cwd(), 'connector', 'ocr_parser.py');

  if (!existsSync(scriptPath)) {
    return NextResponse.json({
      success: false,
      error: 'Skrip connector/ocr_parser.py tidak ditemukan di direktori proyek.',
    }, { status: 500 });
  }

  // Tulis berkas sementara untuk dibaca oleh engine OCR
  const tempExt = mimeType === 'image/png' ? '.png' : '.jpg';
  const tempFileName = `temp_scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${tempExt}`;
  const tempDir = path.join(process.cwd(), 'data', 'temp');
  const tempFilePath = path.join(tempDir, tempFileName);

  try {
    // Pastikan folder temp ada
    await fs.mkdir(tempDir, { recursive: true });

    // Decode base64 dan simpan sementara
    const buffer = Buffer.from(imageBase64, 'base64');
    await fs.writeFile(tempFilePath, buffer);

    // Jalankan OCR lokal Python via execFile
    const ocrOutput = await new Promise<string>((resolve, reject) => {
      execFile(
        pythonPath,
        [scriptPath, tempFilePath],
        {
          timeout: 45000,
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            console.error('[OCR Error]', error, stderr);
            reject(new Error(stderr || error.message));
          } else {
            resolve(stdout.trim());
          }
        }
      );
    });

    // Parse hasil JSON dari script Python
    let parsed: ScanResult;
    try {
      parsed = JSON.parse(ocrOutput);
    } catch {
      console.error('[OCR Output Parse Error]', ocrOutput);
      return NextResponse.json({
        success: false,
        error: 'Format data keluaran OCR tidak dapat dibaca.',
      }, { status: 500 });
    }

    if (!parsed.success || !parsed.data) {
      return NextResponse.json({
        success: false,
        error: parsed.error || 'Gagal mengekstrak data dari bukti transaksi.',
      }, { status: 422 });
    }

    // Sesuaikan transaction_type jika user memberikan hint awal dan hasil OCR ambigu
    if (transactionType && (!parsed.data.transaction_type || parsed.data.confidence === 'low')) {
      parsed.data.transaction_type = transactionType as 'income' | 'expense';
    }

    parsed.ocrEngine = 'RapidOCR ONNX (Lokal, Bebas API Key)';

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    console.error('[api/scan failure]', err);
    const msg = err instanceof Error ? err.message : 'Kesalahan sistem OCR lokal.';
    return NextResponse.json({
      success: false,
      error: `OCR Lokal gagal: ${msg}`,
    }, { status: 500 });
  } finally {
    // Selalu hapus file sementara untuk menjaga privasi
    try {
      if (existsSync(tempFilePath)) {
        await fs.unlink(tempFilePath);
      }
    } catch (cleanErr) {
      console.error('[Cleanup Error]', cleanErr);
    }
  }
}
