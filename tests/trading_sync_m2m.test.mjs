import { register } from 'node:module';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Registrasi loader untuk resolusi next/server dan path alias @/
register('./loader.mjs', import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('[TEST] Menjalankan Pengujian MT5 Connector & Sync API...');

// Test 1: Verifikasi tidak ada em dash, en dash, atau emoji di file target
const targetFiles = [
  path.join(ROOT, 'connector', 'mt5_sync.py'),
  path.join(ROOT, 'src', 'app', 'api', 'trading', 'sync', 'route.js'),
  path.join(ROOT, 'src', 'app', 'trading', 'page.jsx'),
];

const dashRegex = /[\u2013\u2014]/g;
const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

for (const filePath of targetFiles) {
  assert(fs.existsSync(filePath), `File harus ada: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf8');
  const dashMatches = content.match(dashRegex);
  const emojiMatches = content.match(emojiRegex);

  assert.strictEqual(
    dashMatches,
    null,
    `File ${path.basename(filePath)} mengandung em dash atau en dash!`
  );
  assert.strictEqual(
    emojiMatches,
    null,
    `File ${path.basename(filePath)} mengandung karakter emoji!`
  );
}
console.log('PASS: Verifikasi kepatuhan karakter (bebas em dash, en dash, dan emoji) sukses.');

// Test 2: Verifikasi python connector mengirim header X-MT5-Sync-Key dan membaca env MT5_SYNC_KEY
const pythonConnectorContent = fs.readFileSync(path.join(ROOT, 'connector', 'mt5_sync.py'), 'utf8');
assert(pythonConnectorContent.includes('X-MT5-Sync-Key'), 'Python connector wajib mengirim header X-MT5-Sync-Key');
assert(pythonConnectorContent.includes('MT5_SYNC_KEY'), 'Python connector wajib membaca env MT5_SYNC_KEY');
assert(pythonConnectorContent.includes('kayla-finance-mt5-dev-sync-key'), 'Python connector wajib memiliki fallback key aman untuk testing');
assert(pythonConnectorContent.includes('ticket'), 'Python connector wajib memuat ticket dalam schema');
console.log('PASS: Verifikasi konfigurasi connector mt5_sync.py sukses.');

// Backup pristine db.json to guarantee bit-for-bit integrity
const dbJsonPath = path.join(ROOT, 'data', 'db.json');
const originalDbBytes = fs.existsSync(dbJsonPath) ? fs.readFileSync(dbJsonPath) : null;

try {
// Test 3: Verifikasi API Route Handlers
const { POST } = await import('../src/app/api/trading/sync/route.js');

// 3.1: Permintaan M2M dengan header X-MT5-Sync-Key yang valid
{
  const mockPayload = {
    broker: 'Test Broker Ltd',
    login: '999888',
    server: 'Test-Server',
    currency: 'USD',
    leverage: 500,
    balance: 5000,
    equity: 5200,
    floating_profit: 200,
    margin: 100,
    free_margin: 5100,
    margin_level: 5200,
    positions: [
      {
        ticket: 1001,
        symbol: 'XAUUSD',
        type: 'BUY',
        volume: 0.1,
        open_price: 2700.0,
        current_price: 2710.0,
        sl: 2690.0,
        tp: 2730.0,
        profit: 100.0,
      },
    ],
    deals: [
      {
        ticket: 2001,
        symbol: 'EURUSD',
        type: 'sell',
        deal_type: 'sell',
        volume: 0.2,
        open_price: 1.085,
        current_price: 1.08,
        price: 1.08,
        sl: 0,
        tp: 0,
        profit: 50.0,
        commission: -1.5,
        swap: 0,
      },
    ],
  };

  const req = new Request('http://localhost:3000/api/trading/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MT5-Sync-Key': 'kayla-finance-mt5-dev-sync-key',
    },
    body: JSON.stringify(mockPayload),
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 200, `Respon harus 200, didapat: ${res.status}`);
  const json = await res.json();
  assert.strictEqual(json.success, true, 'Sinkronisasi M2M harus sukses');
  assert.strictEqual(json.tradingAccount.balance, 5000);
  assert.strictEqual(json.tradingAccount.positions.length, 1);
  assert.strictEqual(json.tradingAccount.positions[0].ticket, 1001);
  assert.strictEqual(json.tradingAccount.positions[0].symbol, 'XAUUSD');
  assert.strictEqual(json.tradingAccount.positions[0].type, 'BUY');
  assert.strictEqual(json.tradingAccount.positions[0].volume, 0.1);
  assert.strictEqual(json.tradingAccount.positions[0].profit, 100.0);
  assert.strictEqual(json.tradingAccount.deals.length, 1);
  assert.strictEqual(json.tradingAccount.deals[0].ticket, 2001);
  assert.strictEqual(json.tradingAccount.deals[0].symbol, 'EURUSD');
}
console.log('PASS: Sinkronisasi M2M dengan X-MT5-Sync-Key valid sukses.');

// 3.2: Permintaan M2M dengan header X-MT5-Sync-Key SALAH wajib ditolak (401)
{
  const req = new Request('http://localhost:3000/api/trading/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MT5-Sync-Key': 'kunci-palsu-salah-total',
    },
    body: JSON.stringify({ balance: 100 }),
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 401, 'Kunci salah wajib ditolak status 401');
  const json = await res.json();
  assert.strictEqual(json.success, false);
  assert.strictEqual(json.code, 'INVALID_SYNC_KEY');
}
console.log('PASS: Penolakan 401 pada X-MT5-Sync-Key salah terverifikasi.');

// 3.3: Permintaan tanpa X-MT5-Sync-Key dan tanpa sesi web wajib ditolak (401)
{
  const req = new Request('http://localhost:3000/api/trading/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ balance: 100 }),
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 401, 'Permintaan tanpa otentikasi apapun wajib ditolak status 401');
}
console.log('PASS: Proteksi unauthenticated fallback ke sesi web terverifikasi.');

// 3.4: Null-safety: payload dengan positions dan deals null/undefined
{
  const req = new Request('http://localhost:3000/api/trading/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MT5-Sync-Key': 'kayla-finance-mt5-dev-sync-key',
    },
    body: JSON.stringify({
      broker: 'Empty Check Broker',
      balance: 1200,
      positions: null,
      deals: undefined,
    }),
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 200, 'Payload dengan positions/deals kosong tidak boleh crash');
  const json = await res.json();
  assert.strictEqual(json.success, true);
  assert(Array.isArray(json.tradingAccount.positions));
  assert(Array.isArray(json.tradingAccount.deals));
}
console.log('PASS: Null-safety positions dan deals null/undefined terverifikasi.');

// 3.5: Mode Demo Statis: tidak boleh melempar HTTP 500
{
  process.env.STATIC_EXPORT = 'true';
  const req = new Request('http://localhost:3000/api/trading/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ balance: 3000 }),
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 200, 'Mode demo statis tidak boleh melempar HTTP 500');
  const json = await res.json();
  assert.strictEqual(json.success, true);
  assert.strictEqual(json.demo, true);
  delete process.env.STATIC_EXPORT;
}
console.log('PASS: Penanganan mode demo statis bebas HTTP 500 terverifikasi.');

// Test 4: Verifikasi src/app/trading/page.jsx tidak menulis plaintext ke localStorage
const tradingPageContent = fs.readFileSync(path.join(ROOT, 'src', 'app', 'trading', 'page.jsx'), 'utf8');
assert(!tradingPageContent.includes("localStorage.setItem('kayla_finance_db_v2'"), 'Halaman trading dilarang menulis langsung ke kayla_finance_db_v2');
assert(tradingPageContent.includes('saveActiveDatabaseLocally'), 'Halaman trading wajib menggunakan saveActiveDatabaseLocally untuk brankas/demo storage');
assert(tradingPageContent.includes('isStaticDemoMode'), 'Halaman trading wajib mengecek isStaticDemoMode');
console.log('PASS: Verifikasi penyimpanan brankas/demo storage di trading/page.jsx sukses.');
} finally {
  if (originalDbBytes !== null) {
    fs.writeFileSync(dbJsonPath, originalDbBytes);
  }
}

console.log('SEMUA PENGUJIAN AGENT 11 BERHASIL 100%!');
