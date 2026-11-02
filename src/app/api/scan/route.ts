import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';

// Supported MIME types for vision & video processing
const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/3gpp',
  'video/mpeg',
];
const MAX_BASE64_SIZE = 35 * 1024 * 1024; // 35MB limit

function sanitizePath(msg: string): string {
  return msg
    .replace(/[A-Za-z]:\\[^ \r\n\t"']+/g, '[system-path]')
    .replace(/(?:\/[a-zA-Z0-9_.-]+){2,}/g, '[system-path]');
}

function getFileExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'video/mp4':
    case 'video/x-m4v':
      return '.mp4';
    case 'video/webm':
      return '.webm';
    case 'video/quicktime':
      return '.mov';
    case 'video/3gpp':
      return '.3gp';
    default:
      return mimeType.startsWith('video/') ? '.mp4' : '.jpg';
  }
}

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

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return NextResponse.json({ success: false, error: 'Data gambar atau video tidak ditemukan.' }, { status: 400 });
  }

  if (!mimeType || !SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json({
      success: false,
      error: 'Format berkas tidak didukung. Format yang diterima: foto bukti (JPG, PNG, WebP) atau video transfer (MP4, WebM, MOV).',
    }, { status: 400 });
  }

  if (imageBase64.length > MAX_BASE64_SIZE * 1.4) {
    return NextResponse.json({
      success: false,
      error: 'Ukuran berkas terlalu besar. Batas maksimal adalah 25 MB.',
    }, { status: 413 });
  }

  const pythonPath = getPythonExecutablePath();
  const scriptPath = path.join(process.cwd(), 'connector', 'ocr_parser.py');

  if (!existsSync(scriptPath)) {
    return NextResponse.json({
      success: false,
      error: 'Skrip mesin OCR tidak ditemukan di sistem.',
    }, { status: 500 });
  }

  const tempExt = getFileExtension(mimeType);
  const tempFileName = `temp_scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${tempExt}`;
  const tempDir = path.join(process.cwd(), 'data', 'temp');
  const tempFilePath = path.join(tempDir, tempFileName);

  try {
    await fs.mkdir(tempDir, { recursive: true });

    const buffer = Buffer.from(imageBase64, 'base64');
    await fs.writeFile(tempFilePath, buffer);

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
            reject(new Error(stderr || error.message));
          } else {
            resolve(stdout.trim());
          }
        }
      );
    });

    let parsed: ScanResult;
    try {
      parsed = JSON.parse(ocrOutput);
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Format data keluaran OCR tidak dapat dibaca.',
      }, { status: 500 });
    }

    if (!parsed.success || !parsed.data) {
      return NextResponse.json({
        success: false,
        error: parsed.error ? sanitizePath(parsed.error) : 'Gagal mengekstrak data dari bukti transaksi.',
      }, { status: 422 });
    }

    if (transactionType && (!parsed.data.transaction_type || parsed.data.confidence === 'low')) {
      parsed.data.transaction_type = transactionType as 'income' | 'expense';
    }

    parsed.ocrEngine = 'RapidOCR ONNX (Lokal, Bebas API Key)';

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    let msg = err instanceof Error ? err.message : 'Kesalahan sistem OCR lokal.';
    if (msg.includes('cannot identify image file') || msg.includes('cannot read file')) {
      msg = 'Format berkas gambar tidak dapat dibaca atau berkas mengalami kerusakan.';
    } else {
      msg = sanitizePath(msg);
    }
    return NextResponse.json({
      success: false,
      error: `OCR Lokal gagal: ${msg}`,
    }, { status: 500 });
  } finally {
    try {
      if (existsSync(tempFilePath)) {
        await fs.unlink(tempFilePath);
      }
    } catch {}
  }
}
