import { NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'kayla_session';
const ADMIN_EMAIL = 'kaylafisika24@gmail.com';
const AUTH_SECRET = process.env.AUTH_SECRET || 'kayla_finance_auth_secret_session_key_2026';

/**
 * Verifikasi token sesi kriptografis murni berbasis Web Crypto API (100% Edge Runtime native).
 * @param {string | null | undefined} token
 * @returns {Promise<{ valid: boolean, email?: string, expired?: boolean, error?: string }>}
 */
async function verifySessionTokenEdge(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token sesi tidak ditemukan.' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Format token sesi tidak valid.' };
  }

  const [payloadStr, signature] = parts;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(AUTH_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(payloadStr));
    const bytes = new Uint8Array(sigBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const expectedSig = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    if (signature !== expectedSig) {
      return { valid: false, error: 'Tanda tangan token sesi tidak sah.' };
    }

    // Periksa apakah token telah di-revoke (logout sebelumnya)
    if (globalThis.__kaylaRevokedTokensMap && globalThis.__kaylaRevokedTokensMap.has(signature)) {
      return { valid: false, revoked: true, error: 'Sesi ini telah diakhiri (logout). Silakan login kembali.' };
    }

    const jsonStr = atob(payloadStr.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(jsonStr);
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return { valid: false, expired: true, error: 'Sesi Anda telah kedaluwarsa.' };
    }

    if (payload.email !== ADMIN_EMAIL) {
      return { valid: false, error: 'Subjek sesi tidak sah.' };
    }

    return { valid: true, email: payload.email };
  } catch {
    return { valid: false, error: 'Format payload sesi rusak.' };
  }
}

/**
 * Middleware Penjaga Keamanan Kayla Finance (Next.js Server Guard).
 * Mencegat seluruh permintaan tanpa sesi aktif ke halaman privat maupun endpoint API data.
 * @param {import('next/server').NextRequest} request
 */
export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // 1. Rute publik yang dikecualikan dari pemeriksaan sesi
  if (
    pathname === '/login' ||
    pathname === '/login/' ||
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/logout') ||
    pathname.startsWith('/api/auth/me') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.svg'
  ) {
    // Jika pengguna sudah memiliki sesi valid dan membuka /login, alihkan ke Dashboard
    if (pathname === '/login' || pathname === '/login/') {
      const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
      if (sessionCookie && sessionCookie.value) {
        const check = await verifySessionTokenEdge(sessionCookie.value);
        if (check.valid) {
          return NextResponse.redirect(new URL('/', request.url));
        }
      }
    }
    return NextResponse.next();
  }

  // 2. Proteksi Endpoint API Data Privat (/api/*)
  if (pathname.startsWith('/api/')) {
    let token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }

    if (!token) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Akses ditolak: Autentikasi sesi privat diperlukan.',
          code: 'UNAUTHENTICATED'
        },
        { status: 401 }
      );
    }

    const verification = await verifySessionTokenEdge(token);
    if (!verification.valid) {
      return NextResponse.json(
        { 
          success: false, 
          error: verification.error || 'Akses ditolak: Sesi tidak sah atau telah berakhir.',
          code: verification.expired ? 'SESSION_EXPIRED' : 'INVALID_SESSION'
        },
        { status: 401 }
      );
    }

    // Validasi CSRF untuk mutasi data keuangan
    const method = request.method ? request.method.toUpperCase() : 'GET';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const requestedWith = request.headers.get('x-requested-with');
      const kaylaCsrf = request.headers.get('x-kayla-csrf');
      const secFetchSite = request.headers.get('sec-fetch-site');

      if (secFetchSite === 'cross-site') {
        return NextResponse.json(
          { success: false, error: 'Akses ditolak: Permintaan lintas situs (cross-site) ditolak.', code: 'CSRF_BLOCKED' },
          { status: 403 }
        );
      }

      if (requestedWith !== 'XMLHttpRequest' && kaylaCsrf !== '1' && !request.headers.get('content-type')?.includes('application/json')) {
        return NextResponse.json(
          { success: false, error: 'Akses ditolak: Header keamanan permintaan mutasi tidak ditemukan.', code: 'CSRF_BLOCKED' },
          { status: 403 }
        );
      }
    }

    return NextResponse.next();
  }

  // 3. Proteksi Halaman Web Privat (/, /accounts, /transactions, /trading, /reports, /settings)
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!sessionCookie || !sessionCookie.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('reason', 'unauthenticated');
    return NextResponse.redirect(loginUrl);
  }

  const verification = await verifySessionTokenEdge(sessionCookie.value);
  if (!verification.valid) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('reason', verification.expired ? 'expired' : 'unauthenticated');
    return NextResponse.redirect(loginUrl);
  }

  // Sesi terverifikasi sah
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)',
  ],
};
