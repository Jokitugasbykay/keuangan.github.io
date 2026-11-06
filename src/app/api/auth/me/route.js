import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';

/**
 * Memeriksa status sesi aktif administrator.
 * @returns {Promise<NextResponse>}
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json(
        { authenticated: false, message: 'Tidak ada sesi aktif.' },
        { status: 401 }
      );
    }

    const verification = verifySessionToken(sessionCookie.value);

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
              : 'Token sesi tidak valid.' 
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
