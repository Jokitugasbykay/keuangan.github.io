/**
 * @file Sistem Penyimpanan Database Lokal JSON (Backend Engine) Kayla Finance dengan JSDoc.
 * Menangani operasi I/O file atomik, validasi skema, kunci mutex transaksi, dan manajemen backup.
 */

import fs from 'fs';
import path from 'path';

/**
 * @typedef {import('./types').DatabaseSchema} DatabaseSchema
 * @typedef {import('./types').Transaction} Transaction
 * @typedef {import('./types').Account} Account
 * @typedef {import('./types').AppSettings} AppSettings
 * @typedef {import('./types').TransactionType} TransactionType
 */

/**
 * Mendapatkan lokasi absolut file database data/db.json.
 * @returns {string}
 */
export function getDbPath() {
  if (process.env.KAYLA_DB_PATH) {
    return path.resolve(process.env.KAYLA_DB_PATH);
  }
  return path.join(process.cwd(), 'data', 'db.json');
}

/**
 * Mendapatkan direktori absolut penyimpanan backup data/backups.
 * @returns {string}
 */
export function getBackupDir() {
  if (process.env.KAYLA_BACKUP_DIR) {
    return path.resolve(process.env.KAYLA_BACKUP_DIR);
  }
  return path.join(process.cwd(), 'data', 'backups');
}

export const DB_PATH = getDbPath();
export const BACKUP_DIR = getBackupDir();

/**
 * Membersihkan path sistem internal dari pesan error untuk keamanan log/respons.
 * @param {unknown} err
 * @returns {string}
 */
export function sanitizeError(err) {
  if (!err) return 'Terjadi kesalahan sistem internal.';
  const str = err instanceof Error ? err.message : String(err);
  return str
    .replace(/[A-Za-z]:\\[^ \r\n\t"']+/g, '[system-path]')
    .replace(/(?:\/[a-zA-Z0-9_.-]+){2,}/g, '[system-path]');
}

/** @type {AppSettings} */
export const DEFAULT_SETTINGS = {
  app_name: 'Kayla Finance',
  default_currency: 'IDR',
  theme: 'light',
  auto_backup_enabled: true,
  max_backups: 15,
  last_backup_at: new Date().toISOString(),
  usd_to_idr_rate: 16250,
};

/** @type {DatabaseSchema} */
export const INITIAL_DATA = {
  settings: DEFAULT_SETTINGS,
  accounts: [
    {
      id: 'acc-demo-1',
      name: 'Rekening Bank (Demo)',
      provider: 'Mandiri',
      account_type: 'bank',
      currency: 'IDR',
      current_balance: 18500000,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'acc-demo-2',
      name: 'Tabungan Digital (Demo)',
      provider: 'blu',
      account_type: 'bank',
      currency: 'IDR',
      current_balance: 9750000,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'acc-demo-3',
      name: 'Tabungan Cadangan (Demo)',
      provider: 'BTN',
      account_type: 'bank',
      currency: 'IDR',
      current_balance: 5000000,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'acc-demo-4',
      name: 'Dompet Digital (Demo)',
      provider: 'GoPay',
      account_type: 'ewallet',
      currency: 'IDR',
      current_balance: 1250000,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'acc-demo-5',
      name: 'Saldo Bisnis (Demo)',
      provider: 'Mayar',
      account_type: 'payment_gateway',
      currency: 'IDR',
      current_balance: 12500000,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'acc-demo-6',
      name: 'Akun Trading MT5 (Demo)',
      provider: 'Exness',
      account_type: 'trading',
      currency: 'USD',
      current_balance: 1500.0,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
  ],
  categories: [
    { id: 'cat-inc-trading', name: 'Trading Profit MT5', category_type: 'income', icon: 'TrendingUp', color: '#10b981' },
    { id: 'cat-inc-mayar', name: 'Pendapatan Bisnis Mayar', category_type: 'income', icon: 'DollarSign', color: '#6366f1' },
    { id: 'cat-inc-salary', name: 'Gaji Pokok & Bonus', category_type: 'income', icon: 'Briefcase', color: '#3b82f6' },
    { id: 'cat-inc-invest', name: 'Investasi & Dividen', category_type: 'income', icon: 'PieChart', color: '#8b5cf6' },
    { id: 'cat-exp-food', name: 'Makanan & Kuliner', category_type: 'expense', icon: 'Utensils', color: '#f59e0b' },
    { id: 'cat-exp-transport', name: 'Transportasi & Bensin', category_type: 'expense', icon: 'Car', color: '#ec4899' },
    { id: 'cat-exp-bills', name: 'Tagihan & Utilitas', category_type: 'expense', icon: 'Zap', color: '#ef4444' },
    { id: 'cat-exp-shopping', name: 'Belanja Kebutuhan', category_type: 'expense', icon: 'ShoppingBag', color: '#14b8a6' },
    { id: 'cat-exp-entertainment', name: 'Hiburan & Liburan', category_type: 'expense', icon: 'Film', color: '#06b6d4' },
    { id: 'cat-exp-business', name: 'Operasional Bisnis', category_type: 'expense', icon: 'Layers', color: '#64748b' },
  ],
  transactions: [
    {
      id: 'tx-001',
      account_id: 'acc-demo-5',
      transaction_date: new Date(Date.now() - 2 * 3600000).toISOString(),
      description: 'Pembayaran Invoice Jasa #INV-8891 via Mayar',
      amount: 4500000,
      transaction_type: 'income',
      category_id: 'cat-inc-mayar',
      source: 'mayar',
      notes: 'Klien Jasa Desain Demo',
      created_at: new Date().toISOString(),
    },
    {
      id: 'tx-002',
      account_id: 'acc-demo-6',
      transaction_date: new Date(Date.now() - 5 * 3600000).toISOString(),
      description: 'Profit Close Order XAUUSD (Buy 0.05)',
      amount: 85.0,
      transaction_type: 'trading',
      category_id: 'cat-inc-trading',
      source: 'mt5',
      notes: 'Sesuai strategi retest H4 Kaystrade',
      created_at: new Date().toISOString(),
    },
    {
      id: 'tx-003',
      account_id: 'acc-demo-1',
      transaction_date: new Date(Date.now() - 12 * 3600000).toISOString(),
      description: 'Gaji Bulanan Perusahaan Demo Solusi',
      amount: 18000000,
      transaction_type: 'income',
      category_id: 'cat-inc-salary',
      source: 'manual',
      created_at: new Date().toISOString(),
    },
    {
      id: 'tx-004',
      account_id: 'acc-demo-2',
      transaction_date: new Date(Date.now() - 24 * 3600000).toISOString(),
      description: 'Transfer ke Dompet Digital (Demo)',
      amount: 500000,
      transaction_type: 'transfer',
      destination_account_id: 'acc-demo-4',
      transfer_group_id: 'trf-001',
      source: 'manual',
      notes: 'Topup saldo GoPay',
      created_at: new Date().toISOString(),
    },
    {
      id: 'tx-005',
      account_id: 'acc-demo-4',
      transaction_date: new Date(Date.now() - 28 * 3600000).toISOString(),
      description: 'Makan Malam Sushi Tei',
      amount: 285000,
      transaction_type: 'expense',
      category_id: 'cat-exp-food',
      source: 'manual',
      created_at: new Date().toISOString(),
    },
    {
      id: 'tx-006',
      account_id: 'acc-demo-1',
      transaction_date: new Date(Date.now() - 48 * 3600000).toISOString(),
      description: 'Tagihan Listrik PLN & Internet Wi-Fi',
      amount: 1450000,
      transaction_type: 'expense',
      category_id: 'cat-exp-bills',
      source: 'csv_import',
      created_at: new Date().toISOString(),
    },
    {
      id: 'tx-007',
      account_id: 'acc-demo-3',
      transaction_date: new Date(Date.now() - 72 * 3600000).toISOString(),
      description: 'Biaya Langganan Server Cloud Hosting',
      amount: 650000,
      transaction_type: 'expense',
      category_id: 'cat-exp-business',
      source: 'manual',
      created_at: new Date().toISOString(),
    },
  ],
  trading_accounts: [
    {
      id: 'ta-001',
      account_id: 'acc-demo-6',
      broker: 'Exness (SC) Ltd',
      mt5_login: '******',
      server: 'Exness-Real20',
      currency: 'USD',
      leverage: 500,
      balance: 1500.0,
      equity: 2580.5,
      floating_profit: 130.5,
      margin: 45.0,
      free_margin: 2535.5,
      margin_level: 5734.4,
      last_synced_at: new Date().toISOString(),
      positions: [
        {
          id: 'pos-101',
          symbol: 'XAUUSD',
          type: 'BUY',
          volume: 0.05,
          open_price: 2735.4,
          current_price: 2752.4,
          sl: 2728.0,
          tp: 2765.0,
          profit: 85.0,
          open_time: new Date(Date.now() - 4 * 3600000).toISOString(),
        },
        {
          id: 'pos-102',
          symbol: 'EURUSD',
          type: 'SELL',
          volume: 0.1,
          open_price: 1.0825,
          current_price: 1.078,
          sl: 1.086,
          tp: 1.074,
          profit: 45.5,
          open_time: new Date(Date.now() - 8 * 3600000).toISOString(),
        },
      ],
      deals: [
        {
          id: 'deal-001',
          trading_account_id: 'ta-001',
          external_deal_id: '98471203',
          symbol: 'XAUUSD',
          deal_type: 'buy',
          volume: 0.05,
          price: 2722.5,
          profit: 110.0,
          commission: -1.75,
          swap: 0,
          deal_time: new Date(Date.now() - 24 * 3600000).toISOString(),
        },
        {
          id: 'deal-002',
          trading_account_id: 'ta-001',
          external_deal_id: '98472411',
          symbol: 'GBPUSD',
          deal_type: 'sell',
          volume: 0.1,
          price: 1.298,
          profit: -35.0,
          commission: -3.5,
          swap: -0.45,
          deal_time: new Date(Date.now() - 36 * 3600000).toISOString(),
        },
        {
          id: 'deal-003',
          trading_account_id: 'ta-001',
          external_deal_id: '98473522',
          symbol: 'USDCAD',
          deal_type: 'buy',
          volume: 0.08,
          price: 1.385,
          profit: 62.4,
          commission: -2.8,
          swap: 0,
          deal_time: new Date(Date.now() - 52 * 3600000).toISOString(),
        },
      ],
    },
  ],
  sync_logs: [
    {
      id: 'log-001',
      source: 'MT5 Connector (Local)',
      status: 'success',
      started_at: new Date(Date.now() - 300000).toISOString(),
      completed_at: new Date(Date.now() - 298000).toISOString(),
      records_synced: 2,
    },
    {
      id: 'log-002',
      source: 'Mayar Webhook / API',
      status: 'success',
      started_at: new Date(Date.now() - 7200000).toISOString(),
      completed_at: new Date(Date.now() - 7198000).toISOString(),
      records_synced: 1,
    },
    {
      id: 'log-003',
      source: 'CSV Import (Mandiri)',
      status: 'success',
      started_at: new Date(Date.now() - 86400000).toISOString(),
      completed_at: new Date(Date.now() - 86395000).toISOString(),
      records_synced: 14,
    },
  ],
};

// -----------------------------------------------------------------------------
// Antrean Mutex Dalam Proses untuk Mencegah Race Condition Saat Tulis Simultan
// -----------------------------------------------------------------------------
let dbQueue = Promise.resolve();

/**
 * Menjalankan operasi dengan penguncian mutex serial untuk mencegah race condition.
 * @template T
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
export function withDbLock(fn) {
  const resultPromise = dbQueue.then(async () => {
    return await fn();
  });
  dbQueue = resultPromise.catch(() => {});
  return resultPromise;
}

// -----------------------------------------------------------------------------
// Validasi Skema Database dan Migrasi Data
// -----------------------------------------------------------------------------

/**
 * Memvalidasi apakah objek JSON memenuhi struktur DatabaseSchema.
 * @param {unknown} raw
 * @returns {{ valid: boolean; errors: string[]; data?: DatabaseSchema }}
 */
export function validateDatabaseSchema(raw) {
  const errors = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Format data harus berupa objek JSON.'] };
  }

  const obj = /** @type {Record<string, any>} */ (raw);

  if (!Array.isArray(obj.accounts)) {
    errors.push('Daftar akun ("accounts") harus berupa array.');
  }
  if (!Array.isArray(obj.transactions)) {
    errors.push('Daftar transaksi ("transactions") harus berupa array.');
  }
  if (!Array.isArray(obj.categories)) {
    errors.push('Daftar kategori ("categories") harus berupa array.');
  }
  if (!Array.isArray(obj.trading_accounts)) {
    errors.push('Daftar akun trading ("trading_accounts") harus berupa array.');
  }
  if (!Array.isArray(obj.sync_logs)) {
    errors.push('Daftar log sinkronisasi ("sync_logs") harus berupa array.');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const accounts = obj.accounts.map((acc, index) => {
    const a = acc || {};
    if (!a.id || typeof a.id !== 'string') errors.push(`Akun ke-${index} tidak memiliki id yang valid.`);
    if (!a.name || typeof a.name !== 'string') errors.push(`Akun ke-${index} tidak memiliki nama.`);
    const balance = Number(a.current_balance);
    if (isNaN(balance)) errors.push(`Akun ke-${index} memiliki saldo yang tidak valid.`);
    return {
      id: String(a.id),
      name: String(a.name),
      provider: String(a.provider || a.name),
      account_type: a.account_type || 'bank',
      currency: a.currency === 'USD' ? 'USD' : 'IDR',
      current_balance: balance || 0,
      is_active: a.is_active !== false,
      last_synced_at: String(a.last_synced_at || new Date().toISOString()),
      created_at: String(a.created_at || new Date().toISOString()),
      ledger: a.ledger === 'business' ? 'business' : 'personal',
    };
  });

  const transactions = obj.transactions.map((tx, index) => {
    const t = tx || {};
    const amount = Number(t.amount);
    if (!t.id) errors.push(`Transaksi ke-${index} tidak memiliki id.`);
    if (!t.account_id) errors.push(`Transaksi ke-${index} tidak memiliki account_id.`);
    if (isNaN(amount) || amount < 0) errors.push(`Transaksi ke-${index} memiliki nominal tidak valid.`);
    return {
      id: String(t.id),
      account_id: String(t.account_id),
      external_transaction_id: t.external_transaction_id ? String(t.external_transaction_id) : undefined,
      import_hash: t.import_hash ? String(t.import_hash) : undefined,
      transaction_date: String(t.transaction_date || new Date().toISOString()),
      description: String(t.description || 'Transaksi'),
      amount: amount || 0,
      transaction_type: t.transaction_type || 'expense',
      category_id: t.category_id ? String(t.category_id) : undefined,
      destination_account_id: t.destination_account_id ? String(t.destination_account_id) : undefined,
      transfer_group_id: t.transfer_group_id ? String(t.transfer_group_id) : undefined,
      source: t.source || 'manual',
      notes: t.notes ? String(t.notes) : undefined,
      created_at: String(t.created_at || new Date().toISOString()),
    };
  });

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  /** @type {DatabaseSchema} */
  const cleanData = {
    settings: {
      ...DEFAULT_SETTINGS,
      ...(obj.settings && typeof obj.settings === 'object' ? obj.settings : {}),
    },
    accounts,
    transactions,
    categories: obj.categories,
    trading_accounts: obj.trading_accounts,
    sync_logs: obj.sync_logs,
  };

  return { valid: true, errors: [], data: cleanData };
}

// -----------------------------------------------------------------------------
// Operasi Baca Database Utama
// -----------------------------------------------------------------------------

/**
 * Membaca data database dari file lokal data/db.json.
 * Jika file belum ada, sistem akan membuat file awal secara otomatis.
 * @returns {DatabaseSchema}
 */
export function getDatabase() {
  const currentDbPath = getDbPath();
  const dataDir = path.dirname(currentDbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(currentDbPath)) {
    fs.writeFileSync(currentDbPath, JSON.stringify(INITIAL_DATA, null, 2), 'utf-8');
    return INITIAL_DATA;
  }

  try {
    const fileContent = fs.readFileSync(currentDbPath, 'utf-8');
    if (!fileContent.trim()) {
      fs.writeFileSync(currentDbPath, JSON.stringify(INITIAL_DATA, null, 2), 'utf-8');
      return INITIAL_DATA;
    }

    const parsed = JSON.parse(fileContent);
    const validated = validateDatabaseSchema(parsed);

    if (!validated.valid || !validated.data) {
      console.warn('Peringatan: Skema basis data memerlukan perbaikan migrasi.', validated.errors);
      /** @type {DatabaseSchema} */
      const migrated = {
        settings: parsed.settings || DEFAULT_SETTINGS,
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : INITIAL_DATA.accounts,
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        categories: Array.isArray(parsed.categories) ? parsed.categories : INITIAL_DATA.categories,
        trading_accounts: Array.isArray(parsed.trading_accounts) ? parsed.trading_accounts : INITIAL_DATA.trading_accounts,
        sync_logs: Array.isArray(parsed.sync_logs) ? parsed.sync_logs : [],
      };
      saveDatabase(migrated);
      return migrated;
    }

    if (!validated.data.settings) {
      validated.data.settings = DEFAULT_SETTINGS;
      saveDatabase(validated.data);
    }

    return validated.data;
  } catch (error) {
    console.error('CRITICAL: Gagal membaca database JSON:', error);
    const backupPath = `${currentDbPath}.corrupted.${Date.now()}`;
    try {
      if (fs.existsSync(currentDbPath)) {
        fs.copyFileSync(currentDbPath, backupPath);
        console.warn(`Salinan berkas korup disimpan di: ${backupPath}`);
      }
    } catch (e) {
      console.error('Gagal membuat salinan darurat:', e);
    }
    throw new Error('Integritas data db.json bermasalah. Cadangan otomatis telah dibuat untuk pemulihan.');
  }
}

// -----------------------------------------------------------------------------
// Operasi Tulis Database Atomik dengan Retry Loop
// -----------------------------------------------------------------------------

/**
 * Menyimpan data ke file lokal data/db.json secara aman dan atomik.
 * @param {DatabaseSchema} data
 * @returns {boolean}
 */
export function saveDatabase(data) {
  try {
    const currentDbPath = getDbPath();
    const dataDir = path.dirname(currentDbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const validated = validateDatabaseSchema(data);
    if (!validated.valid || !validated.data) {
      console.error('Gagal menyimpan: data tidak memenuhi skema validasi.', validated.errors);
      return false;
    }

    const jsonString = JSON.stringify(validated.data, null, 2);
    const tempPath = `${currentDbPath}.tmp.${process.pid}.${Date.now()}.${Math.floor(Math.random() * 100000)}`;

    const fd = fs.openSync(tempPath, 'w');
    fs.writeFileSync(fd, jsonString, 'utf-8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
      try {
        fs.renameSync(tempPath, currentDbPath);
        break;
      } catch (renameErr) {
        attempts++;
        if (attempts >= maxAttempts) {
          fs.copyFileSync(tempPath, currentDbPath);
          fs.unlinkSync(tempPath);
          break;
        }
        const waitTill = Date.now() + 20;
        while (Date.now() < waitTill) {}
      }
    }

    return true;
  } catch (error) {
    console.error('Error saat menyimpan database JSON:', error);
    return false;
  }
}

// -----------------------------------------------------------------------------
// Sistem Backup Otomatis & Pemulihan (Disimpan di data/backups/)
// -----------------------------------------------------------------------------

/**
 * Membuat file cadangan (backup) JSON baru di folder data/backups.
 * @param {string} [reason='manual'] Alasan pembuatan backup
 * @returns {{ success: boolean; filename: string; path: string; count: number }}
 */
export function createBackup(reason = 'manual') {
  try {
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const db = getDatabase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeReason = reason.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `backup-${timestamp}-${safeReason}.json`;
    const targetPath = path.join(backupDir, filename);

    fs.writeFileSync(targetPath, JSON.stringify(db, null, 2), 'utf-8');

    if (db.settings) {
      db.settings.last_backup_at = new Date().toISOString();
      saveDatabase(db);
    }

    rotateBackups(db.settings?.max_backups || 15);

    return {
      success: true,
      filename,
      path: targetPath,
      count: db.transactions.length,
    };
  } catch (error) {
    console.error('Gagal membuat backup otomatis:', error);
    return { success: false, filename: '', path: '', count: 0 };
  }
}

/**
 * Mendapatkan daftar file backup yang tersedia di data/backups.
 * @returns {Array<{ filename: string; size: number; createdAt: string; reason: string; isProtected: boolean }>}
 */
export function listBackups() {
  try {
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) {
      return [];
    }

    const files = fs.readdirSync(backupDir);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const fullPath = path.join(backupDir, file);
        const stats = fs.statSync(fullPath);
        const isProtected = /protection|safety|pre-restore|pre-reset|audit/i.test(file);

        let reason = 'cadangan';
        if (file.includes('snapshot')) reason = 'snapshot_keamanan';
        else if (file.includes('pre-restore')) reason = 'keamanan_sebelum_pemulihan';
        else if (file.includes('pre-reset')) reason = 'keamanan_sebelum_reset';
        else if (file.includes('pre-csv-import')) reason = 'keamanan_sebelum_impor';
        else if (file.includes('manual_user')) reason = 'manual_pengguna';
        else if (file.includes('manual_settings')) reason = 'pengaturan_manual';
        else {
          const parts = file.replace('.json', '').split('-');
          reason = parts.length > 7 ? parts.slice(7).join('-') : 'backup';
        }

        return {
          filename: file,
          size: stats.size,
          createdAt: stats.mtime.toISOString(),
          reason,
          isProtected,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('Gagal mengambil daftar backup:', error);
    return [];
  }
}

/**
 * Merotasi backup lama agar tidak memenuhi ruang penyimpanan.
 * @param {number} [maxKeep=15]
 */
function rotateBackups(maxKeep = 15) {
  try {
    const backupDir = getBackupDir();
    const backups = listBackups();
    // PENTING: Jangan pernah hapus backup pengaman/snapshot (isProtected = true)
    const rotatableBackups = backups.filter((b) => !b.isProtected);
    if (rotatableBackups.length > maxKeep) {
      const toDelete = rotatableBackups.slice(maxKeep);
      for (const item of toDelete) {
        const fullPath = path.join(backupDir, item.filename);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }
  } catch (e) {
    console.warn('Gagal merotasi berkas backup lama:', e);
  }
}

/**
 * Memulihkan database dari string JSON backup yang tervalidasi.
 * @param {string} jsonString
 * @returns {{ success: boolean; message: string; count?: number; error?: string }}
 */
export function restoreBackup(jsonString) {
  try {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      return { success: false, message: 'Berkas cadangan bukan JSON yang valid.', error: 'Invalid JSON syntax.' };
    }

    const validation = validateDatabaseSchema(parsed);
    if (!validation.valid || !validation.data) {
      return {
        success: false,
        message: 'Validasi berkas cadangan gagal. Database aktif tidak ditimpa.',
        error: validation.errors.join(', '),
      };
    }

    // Buat snapshot pengaman dari database aktif sebelum melakukan pemulihan
    createBackup('pre-restore-safety');

    const saved = saveDatabase(validation.data);
    if (!saved) {
      return { success: false, message: 'Gagal menulis berkas database saat pemulihan.', error: 'Write failed.' };
    }

    return {
      success: true,
      message: `Pemulihan berhasil. Sebanyak ${validation.data.transactions.length} transaksi dan ${validation.data.accounts.length} akun dipulihkan.`,
      count: validation.data.transactions.length,
    };
  } catch (err) {
    return { success: false, message: 'Terjadi kesalahan sistem saat pemulihan.', error: sanitizeError(err) };
  }
}

// -----------------------------------------------------------------------------
// Validasi Input Transaksi Tunggal
// -----------------------------------------------------------------------------

/**
 * @typedef {Object} TransactionInput
 * @property {string} account_id
 * @property {TransactionType} transaction_type
 * @property {number} amount
 * @property {string} description
 * @property {string} [category_id]
 * @property {string} [destination_account_id]
 * @property {string} [transaction_date]
 * @property {import('./types').TransactionSource} [source]
 * @property {string} [notes]
 * @property {string} [external_transaction_id]
 */

/**
 * Memvalidasi payload transaksi yang masuk sebelum disimpan ke database.
 * @param {TransactionInput} input
 * @param {Account[]} accounts
 * @returns {{ valid: boolean; error?: string }}
 */
export function validateTransactionInput(input, accounts) {
  if (!input.account_id || typeof input.account_id !== 'string') {
    return { valid: false, error: 'Akun sumber transaksi wajib dipilih.' };
  }

  const sourceAccount = accounts.find((a) => a.id === input.account_id);
  if (!sourceAccount) {
    return { valid: false, error: `Akun sumber (${input.account_id}) tidak ditemukan di sistem.` };
  }

  if (!input.description || typeof input.description !== 'string' || !input.description.trim()) {
    return { valid: false, error: 'Deskripsi transaksi wajib diisi.' };
  }

  const amount = Number(input.amount);
  if (isNaN(amount) || !isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'Nominal transaksi harus berupa angka positif lebih dari 0.' };
  }

  const validTypes = ['income', 'expense', 'transfer', 'trading'];
  if (!validTypes.includes(input.transaction_type)) {
    return { valid: false, error: 'Jenis transaksi tidak valid.' };
  }

  if (input.transaction_type === 'transfer') {
    if (!input.destination_account_id) {
      return { valid: false, error: 'Akun tujuan transfer wajib dipilih.' };
    }
    if (input.destination_account_id === input.account_id) {
      return { valid: false, error: 'Akun tujuan tidak boleh sama dengan akun sumber.' };
    }
    const destAccount = accounts.find((a) => a.id === input.destination_account_id);
    if (!destAccount) {
      return { valid: false, error: 'Akun tujuan transfer tidak ditemukan di sistem.' };
    }
  }

  if (input.transaction_date) {
    const parsedDate = new Date(input.transaction_date);
    if (isNaN(parsedDate.getTime())) {
      return { valid: false, error: 'Format tanggal transaksi tidak valid.' };
    }
  }

  return { valid: true };
}
