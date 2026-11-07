import { NextResponse } from 'next/server';
import { 
  ADMIN_EMAIL, 
  verifyPassword, 
  checkRateLimit, 
  recordFailedAttempt, 
  resetRateLimit, 
  createSessionToken,
  isAuthSecretConfigured,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from '@/lib/auth';

/**
 * Endpoint login administrator Kayla Finance dengan proteksi rate limiting gabungan (IP + Akun),
 * mitigasi IP-spoofing, fail-closed AUTH_SECRET, dan cookie HttpOnly.
 * @param {Request} req
 * @returns {Promise<NextResponse>}
 */
export async function POST(req) {
  try {
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const clientIp = (forwardedFor ? forwardedFor.split(',')[0].trim() : (realIp || '127.0.0.1')).trim();

    // 1. Periksa batas percobaan awal berbasis IP
    const ipRateCheck = checkRateLimit(clientIp);
    if (!ipRateCheck.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Terlalu banyak percobaan login gagal dari alamat ini. Silakan coba kembali dalam ${ipRateCheck.retryAfterSeconds} detik.`,
          code: 'RATE_LIMIT_EXCEEDED'
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

    // 3. Periksa proteksi batas percobaan gabungan (IP dan Akun)
    // Menangkal serangan brute force terdistribusi atau dengan manipulasi IP header (IP-spoofing)
    const combinedRateCheck = checkRateLimit(clientIp, normalizedEmail);
    if (!combinedRateCheck.allowed) {
      const isAccountLock = combinedRateCheck.reason === 'account';
      return NextResponse.json(
        { 
          success: false, 
          error: isAccountLock
            ? `Akun dikunci sementara karena terlalu banyak percobaan login yang gagal. Silakan coba kembali dalam ${combinedRateCheck.retryAfterSeconds} detik.`
            : `Terlalu banyak percobaan login gagal. Silakan coba kembali dalam ${combinedRateCheck.retryAfterSeconds} detik.`,
          code: isAccountLock ? 'ACCOUNT_LOCKED' : 'RATE_LIMIT_EXCEEDED',
          retryAfterSeconds: combinedRateCheck.retryAfterSeconds
        },
        { status: 429 }
      );
    }

    const storedHash = process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD;

    // 4. Fail-closed jika AUTH_SECRET atau kredensial admin belum dikonfigurasi dengan aman
    if (!isAuthSecretConfigured() || !storedHash) {
      console.warn('[AUTH] Konfigurasi server belum lengkap: AUTH_SECRET (min 32 karakter) atau ADMIN_PASSWORD_HASH belum disetel.');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Sistem autentikasi server belum dikonfigurasi dengan aman oleh administrator.',
          code: 'AUTH_NOT_CONFIGURED'
        },
        { status: 503 }
      );
    }

    // 5. Verifikasi email dan password (Generic error untuk mencegah user enumeration)
    const emailMatches = normalizedEmail === ADMIN_EMAIL.toLowerCase();
    const passwordMatches = emailMatches && verifyPassword(password, storedHash);

    if (!emailMatches || !passwordMatches) {
      // Catat percobaan gagal ke IP dan akun sekaligus
      recordFailedAttempt(clientIp, normalizedEmail);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Email atau password salah. Silakan coba kembali.' 
        },
        { status: 401 }
      );
    }

    // 6. Login berhasil: reset rate limiter IP dan akun, lalu buat token sesi
    resetRateLimit(clientIp, normalizedEmail);
    const token = createSessionToken(ADMIN_EMAIL);

    const response = NextResponse.json({
      success: true,
      message: 'Autentikasi berhasil.',
      user: { email: ADMIN_EMAIL }
    });

    // 7. Simpan token ke cookie HttpOnly yang aman
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