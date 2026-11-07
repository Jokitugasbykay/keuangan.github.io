import { NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'kayla_session';
const ADMIN_EMAIL = 'kaylafisika24@gmail.com';
const MIN_AUTH_SECRET_LENGTH = 32;

/**
 * Mengambil AUTH_SECRET untuk Edge Runtime dengan pendekatan fail-closed.
 * Mengembalikan null jika AUTH_SECRET belum disetel atau kurang dari 32 karakter.
 * @returns {string | null}
 */
function getEdgeAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length < MIN_AUTH_SECRET_LENGTH) {
    return null;
  }
  return secret.trim();
}

/**
 * Perbandingan waktu-konstan (constant-time comparison) berbasis bitwise XOR untuk Edge Runtime.
 * Mencegah serangan timing attack pada verifikasi tanda tangan kriptografis token sesi.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqualEdge(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const lenA = a.length;
  const lenB = b.length;
  let mismatch = lenA === lenB ? 0 : 1;
  const maxLen = Math.max(lenA, lenB);
  for (let i = 0; i < maxLen; i++) {
    const codeA = i < lenA ? a.charCodeAt(i) : 0;
    const codeB = i < lenB ? b.charCodeAt(i) : 0;
    mismatch |= (codeA ^ codeB);
  }
  return mismatch === 0;
}

/**
 * Validasi CSRF murni berbasis Web API untuk Edge Runtime.
 * Menolak mutasi cross-site dan memastikan Origin/Referer cocok dengan Host server.
 * Menolak bypass yang hanya mengandalkan Content-Type application/json.
 * @param {import('next/server').NextRequest} request
 * @returns {NextResponse | null} null jika valid, NextResponse 403 jika ditolak
 */
function validateCsrfEdge(request) {
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite === 'cross-site') {
    return NextResponse.json(
      { success: false, error: 'Akses ditolak: Permintaan lintas situs (cross-site) ditolak.', code: 'CSRF_BLOCKED' },
      { status: 403 }
    );
  }

  const hostHeader = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase().trim();
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const requestedWith = request.headers.get('x-requested-with');
  const kaylaCsrf = request.headers.get('x-kayla-csrf');

  // 1. Jika Origin ada, wajib cocok dengan Host
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (!hostHeader || originHost !== hostHeader) {
        return NextResponse.json(
          { success: false, error: 'Akses ditolak: Header Origin tidak cocok dengan Host server.', code: 'CSRF_BLOCKED' },
          { status: 403 }
        );
      }
      return null;
    } catch {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Format header Origin tidak valid.', code: 'CSRF_BLOCKED' },
        { status: 403 }
      );
    }
  }

  // 2. Jika Origin tidak ada namun Referer ada, wajib cocok dengan Host
  if (referer) {
    try {
      const refererHost = new URL(referer).host.toLowerCase();
      if (!hostHeader || refererHost !== hostHeader) {
        return NextResponse.json(
          { success: false, error: 'Akses ditolak: Header Referer tidak cocok dengan Host server.', code: 'CSRF_BLOCKED' },
          { status: 403 }
        );
      }
      return null;
    } catch {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Format header Referer tidak valid.', code: 'CSRF_BLOCKED' },
        { status: 403 }
      );
    }
  }

  // 3. Jika Origin dan Referer tidak ada (non-browser client), wajib memiliki custom header.
  // Content-Type application/json TIDAK BOLEH menjadi alasan bypass tanpa header keamanan.
  if (requestedWith === 'XMLHttpRequest' || kaylaCsrf === '1') {
    return null;
  }

  return NextResponse.json(
    { success: false, error: 'Akses ditolak: Validasi keamanan CSRF / Same-Origin gagal.', code: 'CSRF_BLOCKED' },
    { status: 403 }
  );
}

/**
 * Verifikasi token sesi kriptografis murni berbasis Web Crypto API (100% Edge Runtime native).
 * Pendekatan fail-closed: gagal jika AUTH_SECRET belum disetel atau kurang dari 32 karakter.
 * Menggunakan perbandingan waktu-konstan timingSafeEqualEdge untuk mencegah timing attacks.
 * @param {string | null | undefined} token
 * @returns {Promise<{ valid: boolean, email?: string, expired?: boolean, error?: string }>}
 */
export async function verifySessionTokenEdge(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token sesi tidak ditemukan.' };
  }

  const authSecret = getEdgeAuthSecret();
  if (!authSecret) {
    return {
      valid: false,
      error: 'Sistem autentikasi server tidak aktif: AUTH_SECRET belum dikonfigurasi atau kurang dari 32 karakter.'
    };
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
      enc.encode(authSecret),
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

    // Perbandingan waktu-konstan bitwise XOR untuk mencegah timing attack
    if (!timingSafeEqualEdge(signature, expectedSig)) {
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
    // Khusus endpoint logout: wajib lolos verifikasi CSRF jika metode mutasi (POST)
    if (pathname.startsWith('/api/auth/logout') && request.method === 'POST') {
      const csrfError = validateCsrfEdge(request);
      if (csrfError) {
        return csrfError;
      }
    }

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
      const csrfError = validateCsrfEdge(request);
      if (csrfError) {
        return csrfError;
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