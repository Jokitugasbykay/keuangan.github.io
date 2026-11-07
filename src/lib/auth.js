import crypto from 'crypto';
import { NextResponse } from 'next/server';

/**
 * Konfigurasi Autentikasi Kayla Finance.
 * Akun administrator tunggal: kaylafisika24@gmail.com.
 * Kredensial rahasia disimpan di environment variable server (misal .env.local).
 */
export const ADMIN_EMAIL = 'kaylafisika24@gmail.com';

export const MIN_AUTH_SECRET_LENGTH = 32;

/**
 * Memeriksa apakah AUTH_SECRET telah dikonfigurasi dengan aman di environment server.
 * Wajib minimal 32 karakter dan tidak boleh menggunakan fallback default.
 * @returns {boolean}
 */
export function isAuthSecretConfigured() {
  const secret = process.env.AUTH_SECRET;
  return typeof secret === 'string' && secret.trim().length >= MIN_AUTH_SECRET_LENGTH;
}

/**
 * Mengambil AUTH_SECRET dengan pendekatan fail-closed.
 * Melemparkan Error jika AUTH_SECRET belum disetel atau panjangnya kurang dari 32 karakter.
 * @returns {string}
 */
export function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(
      'Konfigurasi server tidak aman: AUTH_SECRET wajib disetel di environment variable dengan minimal 32 karakter.'
    );
  }
  return secret.trim();
}

/**
 * Memeriksa apakah runtime berjalan pada mode demo statis (GitHub Pages).
 * Pada mode demo statis, server autentikasi tidak aktif dan sistem tidak berpura-pura menyediakan sesi server.
 * @returns {boolean}
 */
export function isStaticDemoEnvironment() {
  return process.env.STATIC_EXPORT === 'true' || process.env.GITHUB_ACTIONS === 'true';
}

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
export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 menit
export const RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000; // 15 menit lockout

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
 * Memeriksa status rate limit untuk identifier tertentu (IP atau akun).
 * @param {string} key
 * @returns {{ allowed: boolean, remainingAttempts: number, retryAfterSeconds: number }}
 */
export function checkRateLimitKey(key) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

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
    rateLimitMap.delete(key);
    return { allowed: true, remainingAttempts: RATE_LIMIT_MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }

  const remainingAttempts = Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - entry.count);
  return { allowed: entry.count < RATE_LIMIT_MAX_ATTEMPTS, remainingAttempts, retryAfterSeconds: 0 };
}

/**
 * Mencatat percobaan login gagal untuk identifier tertentu.
 * @param {string} key
 */
export function recordFailedAttemptKey(key) {
  const now = Date.now();
  const entry = rateLimitMap.get(key) || { count: 0, firstAttempt: now, lockedUntil: 0 };

  entry.count += 1;
  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    entry.lockedUntil = now + RATE_LIMIT_LOCKOUT_MS;
  }
  rateLimitMap.set(key, entry);
}

/**
 * Mereset status rate limit untuk identifier tertentu.
 * @param {string} key
 */
export function resetRateLimitKey(key) {
  rateLimitMap.delete(key);
}

/**
 * Memeriksa status rate limit gabungan IP dan Akun.
 * Menghalau serangan brute-force dan bypass pergantian IP (IP spoofing / header rotation).
 * @param {string} ip
 * @param {string | null | undefined} [email=null]
 * @returns {{ allowed: boolean, remainingAttempts: number, retryAfterSeconds: number, reason?: 'ip' | 'account' }}
 */
export function checkRateLimit(ip, email = null) {
  if (ip) {
    const ipKey = ip.startsWith('ip:') ? ip : `ip:${ip}`;
    const ipCheck = checkRateLimitKey(ipKey);
    if (!ipCheck.allowed) {
      return { ...ipCheck, reason: 'ip' };
    }
  }

  if (email && typeof email === 'string') {
    const normEmail = email.trim().toLowerCase();
    const accountKey = normEmail.startsWith('account:') ? normEmail : `account:${normEmail}`;
    const accountCheck = checkRateLimitKey(accountKey);
    if (!accountCheck.allowed) {
      return { ...accountCheck, reason: 'account' };
    }
  }

  const ipKey = ip ? (ip.startsWith('ip:') ? ip : `ip:${ip}`) : null;
  const ipAttempts = ipKey ? checkRateLimitKey(ipKey).remainingAttempts : RATE_LIMIT_MAX_ATTEMPTS;

  const accountKey = (email && typeof email === 'string')
    ? (email.startsWith('account:') ? email.trim().toLowerCase() : `account:${email.trim().toLowerCase()}`)
    : null;
  const accAttempts = accountKey ? checkRateLimitKey(accountKey).remainingAttempts : RATE_LIMIT_MAX_ATTEMPTS;

  return {
    allowed: true,
    remainingAttempts: Math.min(ipAttempts, accAttempts),
    retryAfterSeconds: 0
  };
}

/**
 * Mencatat percobaan login gagal untuk IP dan Akun sekaligus.
 * @param {string} ip
 * @param {string | null | undefined} [email=null]
 */
export function recordFailedAttempt(ip, email = null) {
  if (ip) {
    const ipKey = ip.startsWith('ip:') ? ip : `ip:${ip}`;
    recordFailedAttemptKey(ipKey);
  }
  if (email && typeof email === 'string') {
    const normEmail = email.trim().toLowerCase();
    const accountKey = normEmail.startsWith('account:') ? normEmail : `account:${normEmail}`;
    recordFailedAttemptKey(accountKey);
  }
}

/**
 * Mereset status rate limit untuk IP dan Akun saat login berhasil.
 * @param {string} ip
 * @param {string | null | undefined} [email=null]
 */
export function resetRateLimit(ip, email = null) {
  if (ip) {
    const ipKey = ip.startsWith('ip:') ? ip : `ip:${ip}`;
    resetRateLimitKey(ipKey);
  }
  if (email && typeof email === 'string') {
    const normEmail = email.trim().toLowerCase();
    const accountKey = normEmail.startsWith('account:') ? normEmail : `account:${normEmail}`;
    resetRateLimitKey(accountKey);
  }
}

/**
 * Membuat token sesi terenkripsi/terotentikasi HMAC-SHA256 dengan identifier unik (JTI).
 * @param {string} email
 * @returns {string}
 */
export function createSessionToken(email) {
  if (isStaticDemoEnvironment()) {
    throw new Error('Sesi autentikasi server tidak didukung pada lingkungan demo statis.');
  }
  const secret = getAuthSecret();
  const jti = crypto.randomBytes(12).toString('hex');
  const payload = {
    email,
    jti,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url');
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
 * Pendekatan fail-closed: gagal tutup jika AUTH_SECRET belum disetel atau kurang dari 32 karakter.
 * @param {string | null | undefined} token
 * @returns {{ valid: boolean, email?: string, jti?: string, expired?: boolean, revoked?: boolean, error?: string }}
 */
export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token sesi tidak ditemukan.' };
  }

  // Fail-closed jika AUTH_SECRET belum disetel atau kurang dari 32 karakter
  if (!isAuthSecretConfigured()) {
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

  // 1. Periksa apakah token telah di-revoke (logout sebelumnya)
  if (revokedTokensMap.has(signature)) {
    return { valid: false, revoked: true, error: 'Sesi ini telah diakhiri (logout). Silakan login kembali.' };
  }

  // 2. Verifikasi tanda tangan kriptografis HMAC-SHA256
  const secret = getAuthSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url');
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
 * Memeriksa kecocokan Origin dan Host server, menolak permintaan cross-site,
 * dan memastikan Content-Type application/json TIDAK dapat membypass pemeriksaan Origin/Host.
 * @param {Request} req
 * @returns {{ valid: boolean, error?: string }}
 */
export function verifyCsrf(req) {
  const method = req.method ? req.method.toUpperCase() : 'GET';
  // Metode aman (safe methods) tidak memodifikasi state
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { valid: true };
  }

  const secFetchSite = req.headers.get('sec-fetch-site');

  // Jika browser mengirim Sec-Fetch-Site: cross-site, tolak seketika
  if (secFetchSite === 'cross-site') {
    return { valid: false, error: 'CSRF Protection: Permintaan lintas situs (cross-site) ditolak.' };
  }

  const hostHeader = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').toLowerCase().trim();
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const requestedWith = req.headers.get('x-requested-with');
  const kaylaCsrf = req.headers.get('x-kayla-csrf');

  // 1. Jika Origin ada, wajib cocok dengan Host
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (!hostHeader || originHost !== hostHeader) {
        return { valid: false, error: 'CSRF Protection: Header Origin tidak cocok dengan Host server.' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'CSRF Protection: Format header Origin tidak valid.' };
    }
  }

  // 2. Jika Origin tidak ada namun Referer ada, wajib cocok dengan Host
  if (referer) {
    try {
      const refererHost = new URL(referer).host.toLowerCase();
      if (!hostHeader || refererHost !== hostHeader) {
        return { valid: false, error: 'CSRF Protection: Header Referer tidak cocok dengan Host server.' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'CSRF Protection: Format header Referer tidak valid.' };
    }
  }

  // 3. Jika Origin dan Referer tidak ada (misalnya panggilan API terprogram/curl/non-browser),
  // wajib menyertakan custom anti-CSRF header (X-Requested-With atau X-Kayla-CSRF).
  // Catatan penting: Content-Type application/json saja TIDAK diizinkan membypass Origin/Host check.
  if (requestedWith === 'XMLHttpRequest' || kaylaCsrf === '1') {
    return { valid: true };
  }

  return {
    valid: false,
    error: 'CSRF Protection: Header keamanan permintaan mutasi (Origin / Referer / X-Kayla-CSRF) tidak valid.'
  };
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