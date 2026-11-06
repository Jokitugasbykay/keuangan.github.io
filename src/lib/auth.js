import crypto from 'crypto';
import { NextResponse } from 'next/server';

/**
 * Konfigurasi Autentikasi Kayla Finance.
 * Akun administrator tunggal: kaylafisika24@gmail.com.
 * Kredensial rahasia disimpan di environment variable server (misal .env.local).
 */
export const ADMIN_EMAIL = 'kaylafisika24@gmail.com';

const AUTH_SECRET = process.env.AUTH_SECRET || 'kayla_finance_auth_secret_session_key_2026';
export const SESSION_COOKIE_NAME = 'kayla_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 jam

// In-memory sliding rate limiter untuk mitigasi brute-force
const globalForAuth = globalThis;
if (!globalForAuth.__kaylaRateLimitMap) {
  globalForAuth.__kaylaRateLimitMap = new Map();
}
if (!globalForAuth.__kaylaRevokedTokensMap) {
  globalForAuth.__kaylaRevokedTokensMap = new Map();
}

const rateLimitMap = globalForAuth.__kaylaRateLimitMap;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 menit
const RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000; // 15 menit lockout

// Server-side token revocation denylist untuk membatalkan token lama saat logout
// Struktur: tokenSignature -> expiresAt (timestamp ms)
const revokedTokensMap = globalForAuth.__kaylaRevokedTokensMap;

/**
 * Membersihkan token yang sudah kedaluwarsa secara berkala dari denylist.
 */
function cleanupRevokedTokens() {
  const now = Date.now();
  for (const [sig, expiresAt] of revokedTokensMap.entries()) {
    if (expiresAt <= now) {
      revokedTokensMap.delete(sig);
    }
  }
}

/**
 * Menghasilkan hash scrypt aman dari password.
 * Format keluaran: salt:hexHash (64 byte derived key)
 * @param {string} password
 * @returns {string}
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Memverifikasi password terhadap stored hash dengan timing-safe comparison.
 * @param {string} plainPassword
 * @param {string} storedHash
 * @returns {boolean}
 */
export function verifyPassword(plainPassword, storedHash) {
  if (!plainPassword || !storedHash) return false;

  // Format salt:hash
  if (storedHash.includes(':')) {
    const [salt, key] = storedHash.split(':');
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(plainPassword, salt, 64);
    if (keyBuffer.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  }

  // Fallback direct constant-time check jika hash disimpan sebagai plaintext env dev
  const a = Buffer.from(plainPassword);
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Memeriksa status rate limit untuk IP tertentu.
 * @param {string} ip
 * @returns {{ allowed: boolean, remainingAttempts: number, retryAfterSeconds: number }}
 */
export function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry) {
    return { allowed: true, remainingAttempts: RATE_LIMIT_MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }

  // Jika terkunci
  if (entry.lockedUntil && entry.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
  }

  // Jika jendela waktu terlewati, reset
  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.delete(ip);
    return { allowed: true, remainingAttempts: RATE_LIMIT_MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }

  const remainingAttempts = Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - entry.count);
  return { allowed: entry.count < RATE_LIMIT_MAX_ATTEMPTS, remainingAttempts, retryAfterSeconds: 0 };
}

/**
 * Mencatat percobaan login gagal.
 * @param {string} ip
 */
export function recordFailedAttempt(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, firstAttempt: now, lockedUntil: 0 };

  entry.count += 1;
  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    entry.lockedUntil = now + RATE_LIMIT_LOCKOUT_MS;
  }
  rateLimitMap.set(ip, entry);
}

/**
 * Mereset status rate limit saat login berhasil.
 * @param {string} ip
 */
export function resetRateLimit(ip) {
  rateLimitMap.delete(ip);
}

/**
 * Membuat token sesi terenkripsi/terotentikasi HMAC-SHA256 dengan identifier unik (JTI).
 * @param {string} email
 * @returns {string}
 */
export function createSessionToken(email) {
  const jti = crypto.randomBytes(12).toString('hex');
  const payload = {
    email,
    jti,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', AUTH_SECRET).update(payloadStr).digest('base64url');
  return `${payloadStr}.${hmac}`;
}

/**
 * Membatalkan token sesi di server (revocation denylist) saat pengguna logout.
 * Mencegah token lama digunakan kembali meskipun masa berlakunya belum habis.
 * @param {string | null | undefined} token
 */
export function revokeSessionToken(token) {
  if (!token || typeof token !== 'string') return;
  const parts = token.split('.');
  if (parts.length !== 2) return;

  const [payloadStr, signature] = parts;
  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    const expiresAtMs = (payload.exp || Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS) * 1000;
    revokedTokensMap.set(signature, expiresAtMs);
    cleanupRevokedTokens();
  } catch {
    // Abaikan jika payload tidak valid
  }
}

/**
 * Memvalidasi token sesi secara kriptografis dan memeriksa revocation denylist.
 * @param {string | null | undefined} token
 * @returns {{ valid: boolean, email?: string, jti?: string, expired?: boolean, revoked?: boolean, error?: string }}
 */
export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token sesi tidak ditemukan.' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Format token sesi tidak valid.' };
  }

  const [payloadStr, signature] = parts;

  // 1. Periksa apakah token telah di-revoke (logout sebelumnya)
  if (revokedTokensMap.has(signature)) {
    return { valid: false, revoked: true, error: 'Sesi ini telah diakhiri (logout). Silakan login kembali.' };
  }

  // 2. Verifikasi tanda tangan kriptografis HMAC-SHA256
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(payloadStr).digest('base64url');
  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSig);

  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return { valid: false, error: 'Tanda tangan token sesi tidak sah atau telah dimodifikasi.' };
  }

  // 3. Verifikasi payload dan waktu kedaluwarsa
  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return { valid: false, expired: true, email: payload.email, error: 'Sesi Anda telah kedaluwarsa.' };
    }

    if (payload.email !== ADMIN_EMAIL) {
      return { valid: false, error: 'Identitas akun tidak berhak mengakses sistem ini.' };
    }

    return { valid: true, email: payload.email, jti: payload.jti };
  } catch {
    return { valid: false, error: 'Payload data sesi rusak.' };
  }
}

/**
 * Validasi proteksi CSRF untuk operasi mutasi data keuangan (POST, PUT, DELETE, PATCH).
 * Memeriksa header proteksi khusus (X-Requested-With atau X-Kayla-CSRF) serta kesesuaian Origin.
 * @param {Request} req
 * @returns {{ valid: boolean, error?: string }}
 */
export function verifyCsrf(req) {
  const method = req.method ? req.method.toUpperCase() : 'GET';
  // Metode aman (safe methods) tidak memodifikasi state
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { valid: true };
  }

  const requestedWith = req.headers.get('x-requested-with');
  const kaylaCsrf = req.headers.get('x-kayla-csrf');
  const secFetchSite = req.headers.get('sec-fetch-site');

  // Jika browser mengirim Sec-Fetch-Site: cross-site, tolak seketika
  if (secFetchSite === 'cross-site') {
    return { valid: false, error: 'CSRF Protection: Permintaan lintas situs (cross-site) ditolak.' };
  }

  // Permintaan AJAX/fetch sah harus menyertakan custom header
  if (requestedWith === 'XMLHttpRequest' || kaylaCsrf === '1' || req.headers.get('content-type')?.includes('application/json')) {
    return { valid: true };
  }

  // Validasi Origin / Referer
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) {
        return { valid: true };
      }
    } catch {
      // Format URL tidak valid
    }
  }

  return { valid: false, error: 'CSRF Protection: Header keamanan permintaan mutasi tidak ditemukan.' };
}

/**
 * Reusable Session & Authorization Guard untuk Next.js Route Handlers.
 * Pendekatan fail-closed: jika sesi atau otorisasi gagal, langsung menghasilkan NextResponse 401/403.
 * @param {Request} req
 * @returns {{ authenticated: boolean, user?: { email: string, jti?: string }, response?: NextResponse }}
 */
export function requireServerAuth(req) {
  // 1. Ekstrak token dari Cookie atau Header Authorization
  let token = null;

  // Coba dari cookie request
  const cookieHeader = req.headers.get('cookie') || '';
  const cookiesList = cookieHeader.split(';').map(c => c.trim());
  for (const c of cookiesList) {
    if (c.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      token = c.slice(SESSION_COOKIE_NAME.length + 1);
      break;
    }
  }

  // Fallback dari Authorization: Bearer <token>
  if (!token) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { 
          success: false, 
          error: 'Akses ditolak: Anda belum terautentikasi. Silakan masuk terlebih dahulu.',
          code: 'UNAUTHENTICATED'
        },
        { status: 401 }
      )
    };
  }

  // 2. Validasi token sesi secara kriptografis
  const verification = verifySessionToken(token);
  if (!verification.valid) {
    const statusCode = 401;
    const errorCode = verification.revoked 
      ? 'SESSION_REVOKED' 
      : verification.expired 
        ? 'SESSION_EXPIRED' 
        : 'INVALID_TOKEN';

    return {
      authenticated: false,
      response: NextResponse.json(
        { 
          success: false, 
          error: verification.error || 'Akses ditolak: Sesi tidak sah atau telah berakhir.',
          code: errorCode
        },
        { status: statusCode }
      )
    };
  }

  // 3. Validasi CSRF untuk mutasi data keuangan
  const csrfCheck = verifyCsrf(req);
  if (!csrfCheck.valid) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { 
          success: false, 
          error: csrfCheck.error || 'Akses ditolak: Validasi keamanan CSRF gagal.',
          code: 'CSRF_BLOCKED'
        },
        { status: 403 }
      )
    };
  }

  // Berhasil lolos seluruh perimeter keamanan
  return {
    authenticated: true,
    user: { email: verification.email, jti: verification.jti }
  };
}
