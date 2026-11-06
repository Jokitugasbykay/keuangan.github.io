/**
 * Kayla Finance Phase 3 Security Hardening Test Suite.
 * Menjalankan 12 pengujian keamanan otomatis untuk memverifikasi proteksi halaman privat,
 * endpoint API, session lifecycle, token revocation, rate limiting, dan CSRF guard.
 */

import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PORT = 3000;
const HOST = 'localhost';
const BASE_URL = `http://${HOST}:${PORT}`;
const ADMIN_EMAIL = 'kaylafisika24@gmail.com';
const TEST_PASSWORD = 'KaylaSecureTest2026!';
const AUTH_SECRET = process.env.AUTH_SECRET || 'kayla_finance_auth_secret_session_key_2026';

function makeRequest(method, pathUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathUrl, BASE_URL);
    const headers = options.headers || {};
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(rawData);
          } catch {
            // Not JSON
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: rawData,
            json,
          });
        });
      }
    );

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function createForgedToken(email = ADMIN_EMAIL) {
  const payload = {
    email,
    jti: 'forged-jti-12345',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const fakeSig = crypto.createHmac('sha256', 'completely_wrong_secret_attacker').update(payloadStr).digest('base64url');
  return `${payloadStr}.${fakeSig}`;
}

function createExpiredToken(email = ADMIN_EMAIL) {
  const payload = {
    email,
    jti: 'expired-jti-99999',
    iat: Math.floor(Date.now() / 1000) - 7200,
    exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payloadStr).digest('base64url');
  return `${payloadStr}.${sig}`;
}

function createValidToken(email = ADMIN_EMAIL) {
  const payload = {
    email,
    jti: 'valid-test-jti-' + Date.now(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payloadStr).digest('base64url');
  return `${payloadStr}.${sig}`;
}

async function runTests() {
  console.log('====================================================');
  console.log('KAYLA FINANCE: PHASE 3 SECURITY HARDENING TEST SUITE');
  console.log('====================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  function assertTest(condition, name, details = '') {
    if (condition) {
      console.log(`[PASSED] ${name}`);
      passedCount++;
    } else {
      console.error(`[FAILED] ${name} -> ${details}`);
      failedCount++;
    }
  }

  // 1. Akses halaman privat tanpa sesi
  try {
    const res = await makeRequest('GET', '/');
    const isRedirectToLogin = 
      (res.statusCode === 307 || res.statusCode === 308) &&
      res.headers.location &&
      res.headers.location.includes('/login');
    assertTest(
      isRedirectToLogin,
      'Test 1: Akses halaman privat (/) tanpa sesi diarahkan ke /login',
      `Status: ${res.statusCode}, Location: ${res.headers.location}`
    );
  } catch (err) {
    assertTest(false, 'Test 1: Akses halaman privat (/) tanpa sesi diarahkan ke /login', err.message);
  }

  // 2. Akses halaman privat dengan sesi valid
  try {
    const validToken = createValidToken();
    const res = await makeRequest('GET', '/', {
      headers: {
        Cookie: `kayla_session=${validToken}`,
      },
    });
    assertTest(
      res.statusCode === 200,
      'Test 2: Akses halaman privat (/) dengan sesi valid menghasilkan HTTP 200',
      `Status: ${res.statusCode}`
    );
  } catch (err) {
    assertTest(false, 'Test 2: Akses halaman privat dengan sesi valid', err.message);
  }

  // 3. Akses API tanpa cookie
  try {
    const res = await makeRequest('GET', '/api/data');
    assertTest(
      res.statusCode === 401 && res.json?.success === false,
      'Test 3: Akses API (/api/data) tanpa cookie ditolak (HTTP 401)',
      `Status: ${res.statusCode}, Body: ${res.body}`
    );
  } catch (err) {
    assertTest(false, 'Test 3: Akses API tanpa cookie', err.message);
  }

  // 4. Akses API menggunakan cookie palsu
  try {
    const forgedToken = createForgedToken();
    const res = await makeRequest('GET', '/api/data', {
      headers: {
        Cookie: `kayla_session=${forgedToken}`,
      },
    });
    assertTest(
      res.statusCode === 401,
      'Test 4: Akses API menggunakan cookie palsu/tanda tangan salah ditolak (HTTP 401)',
      `Status: ${res.statusCode}, Body: ${res.body}`
    );
  } catch (err) {
    assertTest(false, 'Test 4: Akses API menggunakan cookie palsu', err.message);
  }

  // 5. Akses API menggunakan sesi kedaluwarsa
  try {
    const expiredToken = createExpiredToken();
    const res = await makeRequest('GET', '/api/data', {
      headers: {
        Cookie: `kayla_session=${expiredToken}`,
      },
    });
    assertTest(
      res.statusCode === 401,
      'Test 5: Akses API menggunakan sesi kedaluwarsa ditolak (HTTP 401)',
      `Status: ${res.statusCode}, Body: ${res.body}`
    );
  } catch (err) {
    assertTest(false, 'Test 5: Akses API menggunakan sesi kedaluwarsa', err.message);
  }

  // 6. Login dengan password salah
  try {
    const res = await makeRequest('POST', '/api/auth/login', {
      body: {
        email: ADMIN_EMAIL,
        password: 'WrongPassword123!',
      },
    });
    assertTest(
      res.statusCode === 401 && res.json?.success === false,
      'Test 6: Login dengan password salah ditolak (HTTP 401)',
      `Status: ${res.statusCode}, Body: ${res.body}`
    );
  } catch (err) {
    assertTest(false, 'Test 6: Login dengan password salah', err.message);
  }

  // 7. Login dengan password benar menggunakan kredensial pengujian
  let activeSessionCookie = '';
  let activeToken = '';
  try {
    const res = await makeRequest('POST', '/api/auth/login', {
      body: {
        email: ADMIN_EMAIL,
        password: TEST_PASSWORD,
      },
    });

    const setCookie = res.headers['set-cookie'];
    const hasHttpOnly = setCookie && setCookie.some(c => c.includes('kayla_session') && c.includes('HttpOnly'));
    if (setCookie) {
      const sessionPart = setCookie.find(c => c.includes('kayla_session='));
      if (sessionPart) {
        activeSessionCookie = sessionPart.split(';')[0];
        activeToken = activeSessionCookie.replace('kayla_session=', '');
      }
    }

    assertTest(
      res.statusCode === 200 && res.json?.success === true && hasHttpOnly,
      'Test 7: Login dengan password benar berhasil dan menerbitkan cookie HttpOnly',
      `Status: ${res.statusCode}, Set-Cookie: ${JSON.stringify(setCookie)}`
    );
  } catch (err) {
    assertTest(false, 'Test 7: Login dengan password benar', err.message);
  }

  // 8. Logout dan percobaan penggunaan ulang sesi lama (Server-Side Revocation)
  try {
    // Jalankan logout dengan token aktif
    const logoutRes = await makeRequest('POST', '/api/auth/logout', {
      headers: {
        Cookie: activeSessionCookie,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const logoutOk = logoutRes.statusCode === 200 && logoutRes.json?.success === true;

    // Sekarang coba gunakan kembali token lama yang baru saja di-logout
    const reuseRes = await makeRequest('GET', '/api/data', {
      headers: {
        Cookie: activeSessionCookie,
      },
    });

    const reuseRejected = reuseRes.statusCode === 401;

    assertTest(
      logoutOk && reuseRejected,
      'Test 8: Logout membatalkan token di server dan menolak penggunaan ulang sesi lama',
      `Logout Status: ${logoutRes.statusCode}, Reuse Status: ${reuseRes.statusCode}`
    );
  } catch (err) {
    assertTest(false, 'Test 8: Logout dan penggunaan ulang sesi lama', err.message);
  }

  // 9. CSRF pada endpoint mutasi
  try {
    const validToken = createValidToken();
    // Kirim request mutasi tanpa custom header dengan Sec-Fetch-Site: cross-site
    const csrfRes = await makeRequest('POST', '/api/transactions', {
      headers: {
        Cookie: `kayla_session=${validToken}`,
        'Sec-Fetch-Site': 'cross-site',
      },
      body: {
        account_id: 'acc-test',
        amount: 100000,
        transaction_type: 'expense',
      },
    });

    assertTest(
      csrfRes.statusCode === 403,
      'Test 9: Permintaan mutasi lintas situs (CSRF) ditolak (HTTP 403)',
      `Status: ${csrfRes.statusCode}, Body: ${csrfRes.body}`
    );
  } catch (err) {
    assertTest(false, 'Test 9: CSRF pada endpoint mutasi', err.message);
  }

  // 10. Akses langsung ke endpoint backup tanpa autentikasi
  try {
    const listRes = await makeRequest('GET', '/api/backup?action=list');
    const dlRes = await makeRequest('GET', '/api/backup?action=download&filename=test.json');
    const postRes = await makeRequest('POST', '/api/backup', { body: { action: 'create' } });

    const allRejected = listRes.statusCode === 401 && dlRes.statusCode === 401 && postRes.statusCode === 401;
    assertTest(
      allRejected,
      'Test 10: Seluruh aksi endpoint backup (list, download, create) ditolak tanpa sesi (HTTP 401)',
      `List: ${listRes.statusCode}, DL: ${dlRes.statusCode}, Create: ${postRes.statusCode}`
    );
  } catch (err) {
    assertTest(false, 'Test 10: Akses langsung ke endpoint backup', err.message);
  }

  // 11. Akses langsung ke endpoint database tanpa autentikasi
  try {
    const getRes = await makeRequest('GET', '/api/data');
    const postRes = await makeRequest('POST', '/api/data', { body: { action: 'backup' } });
    const accRes = await makeRequest('POST', '/api/accounts', { body: { name: 'Test' } });
    const setRes = await makeRequest('PUT', '/api/settings', { body: { theme: 'dark' } });

    const allRejected = getRes.statusCode === 401 && postRes.statusCode === 401 && accRes.statusCode === 401 && setRes.statusCode === 401;
    assertTest(
      allRejected,
      'Test 11: Seluruh operasi baca/tulis database (/api/data, /api/accounts, /api/settings) ditolak tanpa sesi (HTTP 401)',
      `Data: ${getRes.statusCode}, POST: ${postRes.statusCode}, Accounts: ${accRes.statusCode}, Settings: ${setRes.statusCode}`
    );
  } catch (err) {
    assertTest(false, 'Test 11: Akses langsung ke endpoint database', err.message);
  }

  // 12. Static export demo tidak mengandung data pribadi
  try {
    const publicDataExists = fs.existsSync(path.join(process.cwd(), 'public', 'data'));
    const publicDbExists = fs.existsSync(path.join(process.cwd(), 'public', 'demo-db.json'));
    const publicRealDbExists = fs.existsSync(path.join(process.cwd(), 'public', 'data', 'db.json'));
    
    // Periksa default-database.json
    const defaultDbRaw = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'default-database.json'), 'utf-8');
    const isSyntheticOnly = defaultDbRaw.includes('acc-demo-bank') && !defaultDbRaw.includes('13250');

    assertTest(
      !publicDataExists && !publicDbExists && !publicRealDbExists && isSyntheticOnly,
      'Test 12: Struktur berkas publik & demo bebas dari data keuangan pribadi',
      `public/data: ${publicDataExists}, demo-db.json: ${publicDbExists}, isSynthetic: ${isSyntheticOnly}`
    );
  } catch (err) {
    assertTest(false, 'Test 12: Static export demo tidak mengandung data pribadi', err.message);
  }

  console.log('\n----------------------------------------------------');
  console.log(`HASIL AKHIR: ${passedCount}/12 PASSED, ${failedCount} FAILED`);
  console.log('----------------------------------------------------');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests();
