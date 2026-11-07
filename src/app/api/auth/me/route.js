import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { 
  verifySessionToken, 
  SESSION_COOKIE_NAME, 
  isAuthSecretConfigured,
  isStaticDemoEnvironment 
} from '@/lib/auth';

/**
 * Memeriksa status sesi aktif administrator.
 * Fail-closed jika AUTH_SECRET belum disetel di server,
 * dan membedakan dengan tegas lingkungan demo statis (GitHub Pages).
 * @param {Request} [req]
 * @returns {Promise<NextResponse>}
 */
export async function GET(req) {
  try {
    // 1. Bedakan mode demo statis
    if (isStaticDemoEnvironment()) {
      return NextResponse.json(
        { 
          authenticated: false, 
          isDemo: true,
          message: 'Mode demo statis (GitHub Pages): Sesi server autentikasi tidak tersedia.' 
        },
        { status: 200 }
      );
    }

    // 2. Fail-closed jika konfigurasi server belum lengkap
    if (!isAuthSecretConfigured()) {
      return NextResponse.json(
        { 
          authenticated: false, 
          code: 'AUTH_NOT_CONFIGURED',
          message: 'Sistem autentikasi server belum dikonfigurasi (AUTH_SECRET kurang dari 32 karakter).' 
        },
        { status: 503 }
      );
    }

    let token = null;

    // Coba baca dari cookieStore Next.js
    try {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
      if (sessionCookie && sessionCookie.value) {
        token = sessionCookie.value;
      }
    } catch {
      // Abaikan jika cookieStore tidak tersedia di luar konteks request Next
    }

    // Fallback: periksa Cookie header langsung jika req tersedia
    if (!token && req && req.headers) {
      const cookieHeader = req.headers.get('cookie') || '';
      const cookiesList = cookieHeader.split(';').map(c => c.trim());
      for (const c of cookiesList) {
        if (c.startsWith(`${SESSION_COOKIE_NAME}=`)) {
          token = c.slice(SESSION_COOKIE_NAME.length + 1);
          break;
        }
      }
    }

    // Fallback: periksa Authorization: Bearer <token>
    if (!token && req && req.headers) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }

    if (!token) {
      return NextResponse.json(
        { authenticated: false, message: 'Tidak ada sesi aktif.' },
        { status: 401 }
      );
    }

    const verification = verifySessionToken(token);

    if (!verification.valid) {
      return NextResponse.json(
        { 
          authenticated: false, 
          expired: !!verification.expired,
          revoked: !!verification.revoked,
          message: verification.revoked
            ? 'Sesi telah dibatalkan (logout).'
            : verification.expired 
              ? 'Sesi telah kedaluwarsa.' 
              : (verification.error || 'Token sesi tidak valid.') 
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      user: { email: verification.email }
    });
  } catch (err) {
    console.error('[AUTH_ME_ERROR]', err);
    return NextResponse.json(
      { authenticated: false, error: 'Gagal memverifikasi sesi.' },
      { status: 500 }
    );
  }
}