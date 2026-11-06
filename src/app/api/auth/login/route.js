import { NextResponse } from 'next/server';
import { 
  ADMIN_EMAIL, 
  verifyPassword, 
  checkRateLimit, 
  recordFailedAttempt, 
  resetRateLimit, 
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from '@/lib/auth';

/**
 * Endpoint login administrator Kayla Finance dengan proteksi rate limiting dan cookie HttpOnly.
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function POST(req) {
  try {
    const forwardedFor = req.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';

    // 1. Periksa batas percobaan (Rate Limiting)
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Terlalu banyak percobaan login gagal. Silakan coba kembali dalam ${rateCheck.retryAfterSeconds} detik.` 
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Format permintaan tidak valid.' },
        { status: 400 }
      );
    }

    const { email, password } = body;

    // 2. Validasi input dasar
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Email dan password wajib diisi.' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const storedHash = process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD;

    if (!storedHash) {
      console.warn('[AUTH] Kredensial server belum dikonfigurasi di environment variable (ADMIN_PASSWORD_HASH atau ADMIN_PASSWORD).');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Sistem autentikasi server belum dikonfigurasi oleh administrator.',
          code: 'AUTH_NOT_CONFIGURED'
        },
        { status: 503 }
      );
    }

    // 3. Verifikasi email dan password (Generic error untuk mencegah user enumeration)
    const emailMatches = normalizedEmail === ADMIN_EMAIL.toLowerCase();
    const passwordMatches = emailMatches && verifyPassword(password, storedHash);

    if (!emailMatches || !passwordMatches) {
      recordFailedAttempt(clientIp);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Email atau password salah. Silakan coba kembali.' 
        },
        { status: 401 }
      );
    }

    // 4. Login berhasil: reset rate limiter dan buat token sesi
    resetRateLimit(clientIp);
    const token = createSessionToken(ADMIN_EMAIL);

    const response = NextResponse.json({
      success: true,
      message: 'Autentikasi berhasil.',
      user: { email: ADMIN_EMAIL }
    });

    // 5. Simpan token ke cookie HttpOnly yang aman
    const isProd = process.env.NODE_ENV === 'production';
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (err) {
    console.error('[AUTH_ERROR]', err);
    return NextResponse.json(
      { success: false, error: 'Terjadi kendala internal server saat memproses login.' },
      { status: 500 }
    );
  }
}
