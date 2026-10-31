export type AccountType = 'bank' | 'ewallet' | 'trading' | 'payment_gateway';

export interface Account {
  id: string;
  name: string;
  provider: string; // e.g., 'Mandiri', 'blu by BCA', 'BTN', 'Mayar', 'GoPay', 'MT5 Exness'
  account_type: AccountType;
  currency: 'IDR' | 'USD';
  current_balance: number;
  is_active: boolean;
  last_synced_at: string;
  created_at: string;
}

export type TransactionType = 'income' | 'expense' | 'transfer' | 'trading';
export type TransactionSource = 'manual' | 'csv_import' | 'mt5' | 'mayar';

export interface Transaction {
  id: string;
  account_id: string;
  external_transaction_id?: string;
  transaction_date: string;
  description: string;
  amount: number;
  transaction_type: TransactionType;
  category_id?: string;
  destination_account_id?: string; // used when transfer
  transfer_group_id?: string;
  source: TransactionSource;
  notes?: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  category_type: 'income' | 'expense';
  icon?: string;
  color?: string;
}

export interface TradingPosition {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  open_price: number;
  current_price: number;
  sl?: number;
  tp?: number;
  profit: number;
  open_time: string;
}

export interface TradingDeal {
  id: string;
  trading_account_id: string;
  external_deal_id: string;
  symbol: string;
  deal_type: 'buy' | 'sell';
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  deal_time: string;
}

export interface TradingAccount {
  id: string;
  account_id: string;
  broker: string;
  mt5_login: string;
  server: string;
  currency: string;
  leverage: number;
  balance: number;
  equity: number;
  floating_profit: number;
  margin: number;
  free_margin: number;
  margin_level: number;
  last_synced_at: string;
  positions: TradingPosition[];
  deals: TradingDeal[];
}

export interface SyncLog {
  id: string;
  source: string;
  status: 'success' | 'failed' | 'running';
  started_at: string;
  completed_at: string;
  records_synced: number;
  error_message?: string;
}

export interface DatabaseSchema {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  trading_accounts: TradingAccount[];
  sync_logs: SyncLog[];
}
