/**
 * Test Suite: Security Hardening & Authentication Verification
 * Memverifikasi seluruh perbaikan keamanan pada Kayla Finance:
 * 1. Fail-closed AUTH_SECRET enforcement (minimal 32 karakter, nol fallback default)
 * 2. Constant-time comparison Edge Runtime (timingSafeEqualEdge bitwise XOR)
 * 3. Proteksi CSRF & Same-Origin (tidak dapat di-bypass oleh Content-Type application/json)
 * 4. Rate Limiter anti-IP-spoofing (kombinasi IP dan Account-level lockout)
 * 5. Proteksi CSRF pada endpoint logout
 * 6. Penegasan batasan mode demo statis (GitHub Pages)
 */

import { register } from 'node:module';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Registrasi loader untuk resolusi next/server dan path alias @/
register('./loader.mjs', import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

const VALID_TEST_SECRET = 'kayla_finance_super_secure_auth_secret_key_2026_at_least_32_chars';
const TEST_PASSWORD = 'KaylaSecurePassword2026!';

class MockRequest {
  constructor(url, options = {}) {
    this.url = url;
    this.method = (options.method || 'GET').toUpperCase();
    this._headers = new Map();
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        this._headers.set(k.toLowerCase(), String(v));
      }
    }
    this._body = options.body;
  }

  get headers() {
    return {
      get: (key) => this._headers.get(key.toLowerCase()) || null,
      has: (key) => this._headers.has(key.toLowerCase()),
    };
  }

  async json() {
    if (this._body === undefined || this._body === null) {
      throw new Error('No body');
    }
    return typeof this._body === 'string' ? JSON.parse(this._body) : this._body;
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('KAYLA FINANCE: SECURITY HARDENING VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  // Load modul aplikasi setelah module loader aktif
  const {
    ADMIN_EMAIL,
    isAuthSecretConfigured,
    getAuthSecret,
    isStaticDemoEnvironment,
    hashPassword,
    verifyPassword,
    checkRateLimit,
    recordFailedAttempt,
    resetRateLimit,
    createSessionToken,
    verifySessionToken,
    verifyCsrf,
    SESSION_COOKIE_NAME,
  } = await import('../src/lib/auth.js');

  const {
    timingSafeEqualEdge,
    verifySessionTokenEdge,
  } = await import('../src/middleware.js');

  const { POST: loginRoute } = await import('../src/app/api/auth/login/route.js');
  const { POST: logoutRoute } = await import('../src/app/api/auth/logout/route.js');
  const { GET: meRoute } = await import('../src/app/api/auth/me/route.js');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, extra = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} -> ${extra}`);
      failed++;
    }
  }

  // Simpan nilai env asli untuk pemulihan setelah test
  const originalEnvSecret = process.env.AUTH_SECRET;
  const originalAdminPass = process.env.ADMIN_PASSWORD_HASH;
  const originalStaticExport = process.env.STATIC_EXPORT;

  // -------------------------------------------------------------
  // SEKSI 1: AUTH_SECRET Fail-Closed Enforcement
  // -------------------------------------------------------------
  console.log('\n--- SEKSI 1: AUTH_SECRET FAIL-CLOSED ENFORCEMENT ---');

  // 1.1 Unset AUTH_SECRET
  delete process.env.AUTH_SECRET;
  assert(
    isAuthSecretConfigured() === false,
    'Test 1.1: isAuthSecretConfigured() bernilai false saat AUTH_SECRET belum disetel'
  );

  let throwOnUnset = false;
  try {
    getAuthSecret();
  } catch (err) {
    throwOnUnset = err.message.includes('AUTH_SECRET');
  }
  assert(
    throwOnUnset,
    'Test 1.2: getAuthSecret() melemparkan error jika AUTH_SECRET belum disetel (fail-closed)'
  );

  const verifyUnset = verifySessionToken('payload.signature');
  assert(
    verifyUnset.valid === false && verifyUnset.error.includes('AUTH_SECRET belum dikonfigurasi'),
    'Test 1.3: verifySessionToken() gagal tutup (fail-closed) jika AUTH_SECRET belum disetel'
  );

  let createThrowsUnset = false;
  try {
    createSessionToken(ADMIN_EMAIL);
  } catch {
    createThrowsUnset = true;
  }
  assert(
    createThrowsUnset,
    'Test 1.4: createSessionToken() gagal tutup jika AUTH_SECRET belum disetel'
  );

  // 1.5 AUTH_SECRET kurang dari 32 karakter
  process.env.AUTH_SECRET = 'short_secret_only_24_ch!';
  assert(
    isAuthSecretConfigured() === false,
    'Test 1.5: isAuthSecretConfigured() bernilai false jika AUTH_SECRET < 32 karakter'
  );

  const verifyShort = verifySessionToken('payload.signature');
  assert(
    verifyShort.valid === false && verifyShort.error.includes('kurang dari 32 karakter'),
    'Test 1.6: verifySessionToken() gagal tutup jika AUTH_SECRET < 32 karakter'
  );

  // 1.7 AUTH_SECRET valid (>= 32 karakter)
  process.env.AUTH_SECRET = VALID_TEST_SECRET;
  assert(
    isAuthSecretConfigured() === true && getAuthSecret() === VALID_TEST_SECRET,
    'Test 1.7: isAuthSecretConfigured() bernilai true jika AUTH_SECRET >= 32 karakter'
  );

  const validToken = createSessionToken(ADMIN_EMAIL);
  const verifyValid = verifySessionToken(validToken);
  assert(
    verifyValid.valid === true && verifyValid.email === ADMIN_EMAIL,
    'Test 1.8: createSessionToken() dan verifySessionToken() berfungsi saat secret aman disetel'
  );

  // 1.9 Pastikan hardcoded HMAC fallback secret lama telah dihapus dari seluruh berkas kode src/
  function scanDirForOldSecret(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const clean = scanDirForOldSecret(fullPath);
        if (!clean) return false;
      } else if (ent.isFile() && (ent.name.endsWith('.js') || ent.name.endsWith('.jsx') || ent.name.endsWith('.ts') || ent.name.endsWith('.tsx'))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('kayla_finance_auth_secret_session_key_2026')) {
          return false;
        }
      }
    }
    return true;
  }
  const cleanOfOldSecret = scanDirForOldSecret(srcDir);
  assert(
    cleanOfOldSecret,
    'Test 1.9: Seluruh berkas di src/ bersih dari hardcoded fallback secret lama'
  );

  // -------------------------------------------------------------
  // SEKSI 2: Constant-Time Comparison Edge Runtime (timingSafeEqualEdge)
  // -------------------------------------------------------------
  console.log('\n--- SEKSI 2: CONSTANT-TIME COMPARISON (EDGE RUNTIME) ---');

  const sigA = 'abcdef1234567890abcdef1234567890';
  const sigB = 'abcdef1234567890abcdef1234567890';
  const sigDiffFirst = 'Xbcdef1234567890abcdef1234567890';
  const sigDiffLast = 'abcdef1234567890abcdef123456789X';
  const sigDiffLen = 'abcdef1234567890abcdef1234567890_extra';

  assert(
    timingSafeEqualEdge(sigA, sigB) === true,
    'Test 2.1: timingSafeEqualEdge mengembalikan true untuk string identik'
  );

  assert(
    timingSafeEqualEdge(sigA, sigDiffFirst) === false && timingSafeEqualEdge(sigA, sigDiffLast) === false,
    'Test 2.2: timingSafeEqualEdge mengembalikan false untuk string sama panjang beda 1 karakter'
  );

  assert(
    timingSafeEqualEdge(sigA, sigDiffLen) === false,
    'Test 2.3: timingSafeEqualEdge mengembalikan false untuk string berbeda panjang'
  );

  assert(
    timingSafeEqualEdge(null, sigA) === false &&
    timingSafeEqualEdge(sigA, undefined) === false &&
    timingSafeEqualEdge(12345, '12345') === false,
    'Test 2.4: timingSafeEqualEdge menangani input null, undefined, atau non-string tanpa throwing'
  );

  assert(
    timingSafeEqualEdge('', '') === true,
    'Test 2.5: timingSafeEqualEdge mengembalikan true untuk dua string kosong'
  );

  // Verifikasi Edge Runtime Session Token
  const edgeCheckValid = await verifySessionTokenEdge(validToken);
  assert(
    edgeCheckValid.valid === true && edgeCheckValid.email === ADMIN_EMAIL,
    'Test 2.6: verifySessionTokenEdge berhasil memverifikasi token sah'
  );

  const [pl, originalSig] = validToken.split('.');
  const tamperedSig = originalSig.slice(0, -1) + (originalSig.endsWith('a') ? 'b' : 'a');
  const tamperedToken = `${pl}.${tamperedSig}`;
  const edgeCheckTampered = await verifySessionTokenEdge(tamperedToken);
  assert(
    edgeCheckTampered.valid === false && edgeCheckTampered.error.includes('Tanda tangan'),
    'Test 2.7: verifySessionTokenEdge menolak tanda tangan yang dimodifikasi (timing attack safe)'
  );

  // -------------------------------------------------------------
  // SEKSI 3: Proteksi CSRF & Same-Origin Guard
  // -------------------------------------------------------------
  console.log('\n--- SEKSI 3: CSRF & SAME-ORIGIN GUARD ---');

  // 3.1 Metode aman (GET, HEAD, OPTIONS)
  const safeGetReq = new MockRequest('http://localhost:3000/api/data', { method: 'GET' });
  assert(
    verifyCsrf(safeGetReq).valid === true,
    'Test 3.1: Safe methods (GET, HEAD, OPTIONS) diizinkan tanpa batasan CSRF'
  );

  // 3.2 Sec-Fetch-Site: cross-site ditolak seketika
  const crossSiteReq = new MockRequest('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'sec-fetch-site': 'cross-site',
      'content-type': 'application/json',
      'x-requested-with': 'XMLHttpRequest',
    },
  });
  assert(
    verifyCsrf(crossSiteReq).valid === false,
    'Test 3.2: Sec-Fetch-Site: cross-site ditolak seketika pada operasi mutasi (POST)'
  );

  // 3.3 Matching Origin
  const matchingOriginReq = new MockRequest('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'origin': 'http://localhost:3000',
      'content-type': 'application/json',
    },
  });
  assert(
    verifyCsrf(matchingOriginReq).valid === true,
    'Test 3.3: Permintaan mutasi dengan Origin cocok dengan Host diizinkan'
  );

  // 3.4 Mismatched Origin (serangan CSRF cross-origin)
  const evilOriginReq = new MockRequest('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'origin': 'https://evil-attacker-site.com',
      'content-type': 'application/json',
    },
  });
  assert(
    verifyCsrf(evilOriginReq).valid === false,
    'Test 3.4: Permintaan mutasi dengan Origin tidak cocok ditolak (CSRF block)'
  );

  // 3.5 Content-Type application/json TIDAK BOLEH membypass mismatched origin
  const bypassAttemptReq = new MockRequest('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'origin': 'https://attacker.org',
      'content-type': 'application/json; charset=utf-8',
      'x-requested-with': 'XMLHttpRequest',
    },
  });
  const bypassCheck = verifyCsrf(bypassAttemptReq);
  assert(
    bypassCheck.valid === false && bypassCheck.error.includes('Header Origin tidak cocok'),
    'Test 3.5: Content-Type application/json TIDAK DAPAT membypass verifikasi Origin/Host'
  );

  // 3.6 Matching Referer
  const matchingRefererReq = new MockRequest('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'referer': 'http://localhost:3000/transactions/new',
      'content-type': 'application/json',
    },
  });
  assert(
    verifyCsrf(matchingRefererReq).valid === true,
    'Test 3.6: Permintaan dengan Referer cocok (tanpa Origin) diizinkan'
  );

  // 3.7 Mismatched Referer
  const evilRefererReq = new MockRequest('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'referer': 'https://phishing.com/attack.html',
      'content-type': 'application/json',
    },
  });
  assert(
    verifyCsrf(evilRefererReq).valid === false,
    'Test 3.7: Permintaan dengan Referer tidak cocok ditolak'
  );

  // 3.8 Custom header X-Requested-With (permintaan AJAX murni tanpa Origin/Referer)
  const ajaxCustomReq = new MockRequest('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'x-requested-with': 'XMLHttpRequest',
    },
  });
  assert(
    verifyCsrf(ajaxCustomReq).valid === true,
    'Test 3.8: Permintaan non-browser tanpa Origin/Referer diterima jika menyertakan X-Requested-With'
  );

  // 3.9 Custom header X-Kayla-CSRF: 1
  const kaylaCsrfReq = new MockRequest('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'x-kayla-csrf': '1',
    },
  });
  assert(
    verifyCsrf(kaylaCsrfReq).valid === true,
    'Test 3.9: Permintaan non-browser tanpa Origin/Referer diterima jika menyertakan X-Kayla-CSRF: 1'
  );

  // 3.10 Request tanpa Origin, tanpa Referer, dan hanya Content-Type application/json ditolak
  const nakedJsonReq = new MockRequest('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'content-type': 'application/json',
    },
  });
  assert(
    verifyCsrf(nakedJsonReq).valid === false,
    'Test 3.10: Permintaan mutasi dengan hanya Content-Type application/json tanpa header keamanan ditolak'
  );

  // -------------------------------------------------------------
  // SEKSI 4: Rate Limiting & Account-Level Lockout (Anti-IP-Spoofing)
  // -------------------------------------------------------------
  console.log('\n--- SEKSI 4: RATE LIMITING & ANTI-IP-SPOOFING ---');

  const testIp = '198.51.100.1';
  const targetAccount = 'kaylafisika24@gmail.com';

  // Bersihkan state rate limiter sebelum pengujian
  resetRateLimit(testIp, targetAccount);

  const initialCheck = checkRateLimit(testIp, targetAccount);
  assert(
    initialCheck.allowed === true && initialCheck.remainingAttempts === 5,
    'Test 4.1: Status awal rate limiter mengizinkan 5 percobaan'
  );

  // Simulasikan serangan brute force: 5 percobaan gagal dari IP yang sama
  for (let i = 0; i < 5; i++) {
    recordFailedAttempt(testIp, targetAccount);
  }

  const ipLockedCheck = checkRateLimit(testIp, targetAccount);
  assert(
    ipLockedCheck.allowed === false && ipLockedCheck.remainingAttempts === 0,
    'Test 4.2: 5 percobaan gagal berturut-turut mengunci IP dan akun'
  );

  // Reset untuk uji coba rotasi IP (IP-spoofing attack)
  resetRateLimit(null, targetAccount);

  // Skenario IP-spoofing: Penyerang menggunakan 5 IP palsu berbeda untuk brute-force akun yang sama
  const spoofedIps = [
    '203.0.113.1',
    '203.0.113.2',
    '203.0.113.3',
    '203.0.113.4',
    '203.0.113.5',
  ];

  for (const fakeIp of spoofedIps) {
    resetRateLimit(fakeIp, null); // Pastikan IP baru belum terkunci
    recordFailedAttempt(fakeIp, targetAccount);
  }

  // Percobaan ke-6 dari IP ke-6 yang sama sekali baru:
  const freshIp = '203.0.113.99';
  resetRateLimit(freshIp, null); // IP segar belum pernah request

  const accountLockedCheck = checkRateLimit(freshIp, targetAccount);
  assert(
    accountLockedCheck.allowed === false && accountLockedCheck.reason === 'account',
    'Test 4.3: Serangan rotasi IP (IP spoofing) berhasil dihalau oleh Account-Level Lockout'
  );

  // Bersihkan rate limit akun
  resetRateLimit(null, targetAccount);
  const clearedCheck = checkRateLimit(freshIp, targetAccount);
  assert(
    clearedCheck.allowed === true,
    'Test 4.4: resetRateLimit() berhasil memulihkan akses setelah lockout diselesaikan'
  );

  // -------------------------------------------------------------
  // SEKSI 5: Proteksi CSRF & Revocation pada Endpoint Logout
  // -------------------------------------------------------------
  console.log('\n--- SEKSI 5: LOGOUT ENDPOINT HARDENING ---');

  // Siapkan token sesi valid untuk pengujian logout
  process.env.AUTH_SECRET = VALID_TEST_SECRET;
  const sessionTokenForLogout = createSessionToken(ADMIN_EMAIL);

  // 5.1 POST /api/auth/logout dengan Sec-Fetch-Site: cross-site ditolak 403
  const csrfLogoutReq = new MockRequest('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'sec-fetch-site': 'cross-site',
      'cookie': `${SESSION_COOKIE_NAME}=${sessionTokenForLogout}`,
    },
  });
  const csrfLogoutRes = await logoutRoute(csrfLogoutReq);
  const csrfLogoutJson = await csrfLogoutRes.json();
  assert(
    csrfLogoutRes.status === 403 && csrfLogoutJson.code === 'CSRF_BLOCKED',
    'Test 5.1: Logout dengan Sec-Fetch-Site cross-site ditolak (HTTP 403)'
  );

  // 5.2 POST /api/auth/logout dengan Origin beda ditolak 403
  const evilLogoutReq = new MockRequest('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'origin': 'https://evil-logout-attacker.com',
      'cookie': `${SESSION_COOKIE_NAME}=${sessionTokenForLogout}`,
    },
  });
  const evilLogoutRes = await logoutRoute(evilLogoutReq);
  assert(
    evilLogoutRes.status === 403,
    'Test 5.2: Logout dengan Origin lintas situs ditolak (HTTP 403)'
  );

  // 5.3 POST /api/auth/logout dengan Same-Origin sah berhasil 200 dan membatalkan token
  const validLogoutReq = new MockRequest('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers: {
      'host': 'localhost:3000',
      'origin': 'http://localhost:3000',
      'cookie': `${SESSION_COOKIE_NAME}=${sessionTokenForLogout}`,
    },
  });
  const validLogoutRes = await logoutRoute(validLogoutReq);
  const validLogoutJson = await validLogoutRes.json();
  assert(
    validLogoutRes.status === 200 && validLogoutJson.success === true,
    'Test 5.3: Logout dengan Same-Origin sah berhasil diproses (HTTP 200)'
  );

  // 5.4 Token yang telah di-logout ditolak pada verifikasi berikutnya (Server-Side Revocation)
  const reusedCheck = verifySessionToken(sessionTokenForLogout);
  assert(
    reusedCheck.valid === false && reusedCheck.revoked === true,
    'Test 5.4: Token yang telah di-logout seketika ditolak oleh server revocation denylist'
  );

  // -------------------------------------------------------------
  // SEKSI 6: Demo Mode (GitHub Pages) Distinction
  // -------------------------------------------------------------
  console.log('\n--- SEKSI 6: DEMO MODE (GITHUB PAGES) DISTINCTION ---');

  process.env.STATIC_EXPORT = 'true';
  assert(
    isStaticDemoEnvironment() === true,
    'Test 6.1: isStaticDemoEnvironment() bernilai true pada mode static export'
  );

  let demoCreateThrows = false;
  try {
    createSessionToken(ADMIN_EMAIL);
  } catch (err) {
    demoCreateThrows = err.message.includes('demo statis');
  }
  assert(
    demoCreateThrows,
    'Test 6.2: createSessionToken() menolak pembuatan token server pada mode demo statis'
  );

  const meDemoRes = await meRoute();
  const meDemoJson = await meDemoRes.json();
  assert(
    meDemoJson.authenticated === false && meDemoJson.isDemo === true,
    'Test 6.3: Endpoint /api/auth/me menegaskan mode demo statis dan tidak memalsukan autentikasi server'
  );

  // Pulihkan STATIC_EXPORT
  delete process.env.STATIC_EXPORT;

  // -------------------------------------------------------------
  // SEKSI 7: Login Route Integration Test (Password Hash, Rate Limit, Fail-Closed)
  // -------------------------------------------------------------
  console.log('\n--- SEKSI 7: LOGIN ROUTE INTEGRATION ---');

  process.env.AUTH_SECRET = VALID_TEST_SECRET;
  process.env.ADMIN_PASSWORD_HASH = hashPassword(TEST_PASSWORD);

  // 7.1 Login gagal dengan password salah
  const badLoginReq = new MockRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'host': 'localhost:3000', 'x-forwarded-for': '127.0.0.1' },
    body: { email: ADMIN_EMAIL, password: 'WrongPassword!' },
  });
  const badLoginRes = await loginRoute(badLoginReq);
  assert(
    badLoginRes.status === 401,
    'Test 7.1: Login dengan password salah mengembalikan HTTP 401'
  );

  // 7.2 Login berhasil dengan password benar
  resetRateLimit('127.0.0.1', ADMIN_EMAIL);
  const goodLoginReq = new MockRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'host': 'localhost:3000', 'x-forwarded-for': '127.0.0.1' },
    body: { email: ADMIN_EMAIL, password: TEST_PASSWORD },
  });
  const goodLoginRes = await loginRoute(goodLoginReq);
  const goodLoginJson = await goodLoginRes.json();
  assert(
    goodLoginRes.status === 200 && goodLoginJson.success === true,
    'Test 7.2: Login dengan password benar mengembalikan HTTP 200 dan menerbitkan cookie sesi'
  );

  // 7.3 Fail-closed saat ADMIN_PASSWORD_HASH tidak ada
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_PASSWORD;
  const noConfigLoginReq = new MockRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'host': 'localhost:3000' },
    body: { email: ADMIN_EMAIL, password: TEST_PASSWORD },
  });
  const noConfigLoginRes = await loginRoute(noConfigLoginReq);
  const noConfigJson = await noConfigLoginRes.json();
  assert(
    noConfigLoginRes.status === 503 && noConfigJson.code === 'AUTH_NOT_CONFIGURED',
    'Test 7.3: Login gagal-tutup (HTTP 503) jika kredensial admin server belum disetel'
  );

  // Pulihkan environment variable asli
  if (originalEnvSecret) {
    process.env.AUTH_SECRET = originalEnvSecret;
  } else {
    delete process.env.AUTH_SECRET;
  }
  if (originalAdminPass) {
    process.env.ADMIN_PASSWORD_HASH = originalAdminPass;
  } else {
    delete process.env.ADMIN_PASSWORD_HASH;
  }
  if (originalStaticExport) {
    process.env.STATIC_EXPORT = originalStaticExport;
  } else {
    delete process.env.STATIC_EXPORT;
  }

  console.log('\n================================================================');
  console.log(`HASIL AKHIR TEST SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('[FATAL_ERROR]', err);
  process.exit(1);
});