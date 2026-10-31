import fs from 'fs';
import path from 'path';
import { DatabaseSchema } from './types';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

const INITIAL_DATA: DatabaseSchema = {
  accounts: [
    {
      id: 'acc-mandiri',
      name: 'Rekening Utama Mandiri',
      provider: 'Mandiri',
      account_type: 'bank',
      currency: 'IDR',
      current_balance: 28500000,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'acc-blu',
      name: 'Tabungan blu by BCA',
      provider: 'blu',
      account_type: 'bank',
      currency: 'IDR',
      current_balance: 14750000,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'acc-btn',
      name: 'Bank BTN Operasional',
      provider: 'BTN',
      account_type: 'bank',
      currency: 'IDR',
      current_balance: 9200000,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'acc-gopay',
      name: 'GoPay Daily',
      provider: 'GoPay',
      account_type: 'ewallet',
      currency: 'IDR',
      current_balance: 1350000,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'acc-mayar',
      name: 'Mayar - Saldo Bisnis',
      provider: 'Mayar',
      account_type: 'payment_gateway',
      currency: 'IDR',
      current_balance: 21500000,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'acc-mt5',
      name: 'MT5 Trading Account (Exness)',
      provider: 'Exness',
      account_type: 'trading',
      currency: 'USD',
      current_balance: 2450.00,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    }
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
      account_id: 'acc-mayar',
      transaction_date: new Date(Date.now() - 2 * 3600000).toISOString(),
      description: 'Pembayaran Invoice Jasa #INV-8891 via Mayar',
      amount: 4500000,
      transaction_type: 'income',
      category_id: 'cat-inc-mayar',
      source: 'mayar',
      notes: 'Klien Web Development Batch 2',
      created_at: new Date().toISOString(),
    },
    {
      id: 'tx-002',
      account_id: 'acc-mt5',
      transaction_date: new Date(Date.now() - 5 * 3600000).toISOString(),
      description: 'Profit Close Order XAUUSD (Buy 0.05)',
      amount: 85.00,
      transaction_type: 'trading',
      category_id: 'cat-inc-trading',
      source: 'mt5',
      notes: 'Sesuai strategi retest H4 Kaystrade',
      created_at: new Date().toISOString(),
    },
    {
      id: 'tx-003',
      account_id: 'acc-mandiri',
      transaction_date: new Date(Date.now() - 12 * 3600000).toISOString(),
      description: 'Gaji Bulanan PT Digital Solusi',
      amount: 18000000,
      transaction_type: 'income',
      category_id: 'cat-inc-salary',
      source: 'manual',
      created_at: new Date().toISOString(),
    },
    {
      id: 'tx-004',
      account_id: 'acc-blu',
      transaction_date: new Date(Date.now() - 24 * 3600000).toISOString(),
      description: 'Transfer ke GoPay Daily',
      amount: 500000,
      transaction_type: 'transfer',
      destination_account_id: 'acc-gopay',
      transfer_group_id: 'trf-001',
      source: 'manual',
      notes: 'Topup saldo GoPay',
      created_at: new Date().toISOString(),
    },
    {
      id: 'tx-005',
      account_id: 'acc-gopay',
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
      account_id: 'acc-mandiri',
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
      account_id: 'acc-btn',
      transaction_date: new Date(Date.now() - 72 * 3600000).toISOString(),
      description: 'Biaya Langganan Server Cloud Hosting',
      amount: 650000,
      transaction_type: 'expense',
      category_id: 'cat-exp-business',
      source: 'manual',
      created_at: new Date().toISOString(),
    }
  ],
  trading_accounts: [
    {
      id: 'ta-001',
      account_id: 'acc-mt5',
      broker: 'Exness (SC) Ltd',
      mt5_login: '108****',
      server: 'Exness-Real20',
      currency: 'USD',
      leverage: 500,
      balance: 2450.00,
      equity: 2580.50,
      floating_profit: 130.50,
      margin: 45.00,
      free_margin: 2535.50,
      margin_level: 5734.4,
      last_synced_at: new Date().toISOString(),
      positions: [
        {
          id: 'pos-101',
          symbol: 'XAUUSD',
          type: 'BUY',
          volume: 0.05,
          open_price: 2735.40,
          current_price: 2752.40,
          sl: 2728.00,
          tp: 2765.00,
          profit: 85.00,
          open_time: new Date(Date.now() - 4 * 3600000).toISOString(),
        },
        {
          id: 'pos-102',
          symbol: 'EURUSD',
          type: 'SELL',
          volume: 0.10,
          open_price: 1.0825,
          current_price: 1.0780,
          sl: 1.0860,
          tp: 1.0740,
          profit: 45.50,
          open_time: new Date(Date.now() - 8 * 3600000).toISOString(),
        }
      ],
      deals: [
        {
          id: 'deal-001',
          trading_account_id: 'ta-001',
          external_deal_id: '98471203',
          symbol: 'XAUUSD',
          deal_type: 'buy',
          volume: 0.05,
          price: 2722.50,
          profit: 110.00,
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
          volume: 0.10,
          price: 1.2980,
          profit: -35.00,
          commission: -3.50,
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
          price: 1.3850,
          profit: 62.40,
          commission: -2.80,
          swap: 0,
          deal_time: new Date(Date.now() - 52 * 3600000).toISOString(),
        }
      ]
    }
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
    }
  ]
};

export function getDatabase(): DatabaseSchema {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(INITIAL_DATA, null, 2), 'utf-8');
    return INITIAL_DATA;
  }

  try {
    const fileContent = fs.readFileSync(DB_PATH, 'utf-8');
    if (!fileContent.trim()) {
      return INITIAL_DATA;
    }
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('CRITICAL: Gagal membaca database JSON:', error);
    // Jika file ada tapi rusak, buat backup darurat agar tidak tertimpa
    const backupPath = `${DB_PATH}.corrupted.${Date.now()}`;
    try {
      fs.copyFileSync(DB_PATH, backupPath);
      console.warn(`Backup berkas korup disimpan di: ${backupPath}`);
    } catch (e) {
      console.error('Gagal membuat salinan cadangan:', e);
    }
    throw new Error('Integritas data db.json bermasalah. Cadangan otomatis telah dibuat untuk pemulihan.');
  }
}

export function saveDatabase(data: DatabaseSchema): boolean {
  try {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Atomic write menggunakan berkas sementara (.tmp) lalu rename
    const tempPath = `${DB_PATH}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, DB_PATH);
    return true;
  } catch (error) {
    console.error('Error saving database:', error);
    return false;
  }
}
