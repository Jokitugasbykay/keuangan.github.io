/**
 * @file Definisi tipe data dan skema entitas Kayla Finance menggunakan JSDoc.
 * Digunakan untuk dokumentasi tipe, type-hinting editor, dan validasi struktur data.
 */

/**
 * @typedef {'bank' | 'ewallet' | 'trading' | 'payment_gateway'} AccountType
 */

/**
 * @typedef {Object} Account
 * @property {string} id
 * @property {string} name
 * @property {string} provider
 * @property {AccountType} account_type
 * @property {'IDR' | 'USD'} currency
 * @property {number} current_balance
 * @property {boolean} is_active
 * @property {string} last_synced_at
 * @property {string} created_at
 * @property {'personal' | 'business'} [ledger]
 */

/**
 * @typedef {'income' | 'expense' | 'transfer' | 'trading'} TransactionType
 */

/**
 * @typedef {'manual' | 'csv_import' | 'mt5' | 'mayar' | 'scan'} TransactionSource
 */

/**
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {string} account_id
 * @property {string} [external_transaction_id]
 * @property {string} [import_hash]
 * @property {string} transaction_date
 * @property {string} description
 * @property {number} amount
 * @property {TransactionType} transaction_type
 * @property {string} [category_id]
 * @property {string} [destination_account_id]
 * @property {string} [transfer_group_id]
 * @property {TransactionSource} source
 * @property {string} [notes]
 * @property {Array<{ id?: string; name: string; qty: number; unit_price: number; subtotal: number }>} [receipt_items]
 * @property {string} created_at
 */

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {'income' | 'expense'} category_type
 * @property {string} [icon]
 * @property {string} [color]
 */

/**
 * @typedef {Object} TradingPosition
 * @property {string} id
 * @property {string} symbol
 * @property {'BUY' | 'SELL'} type
 * @property {number} volume
 * @property {number} open_price
 * @property {number} current_price
 * @property {number} [sl]
 * @property {number} [tp]
 * @property {number} profit
 * @property {string} open_time
 */

/**
 * @typedef {Object} TradingDeal
 * @property {string} id
 * @property {string} trading_account_id
 * @property {string} external_deal_id
 * @property {string} symbol
 * @property {'buy' | 'sell'} deal_type
 * @property {number} volume
 * @property {number} price
 * @property {number} profit
 * @property {number} commission
 * @property {number} swap
 * @property {string} deal_time
 */

/**
 * @typedef {Object} TradingAccount
 * @property {string} id
 * @property {string} account_id
 * @property {string} broker
 * @property {string} mt5_login
 * @property {string} server
 * @property {string} currency
 * @property {number} leverage
 * @property {number} balance
 * @property {number} equity
 * @property {number} floating_profit
 * @property {number} margin
 * @property {number} free_margin
 * @property {number} margin_level
 * @property {string} last_synced_at
 * @property {TradingPosition[]} positions
 * @property {TradingDeal[]} deals
 */

/**
 * @typedef {Object} SyncLog
 * @property {string} id
 * @property {string} source
 * @property {'success' | 'failed' | 'running'} status
 * @property {string} started_at
 * @property {string} completed_at
 * @property {number} records_synced
 * @property {string} [error_message]
 */

/**
 * @typedef {Object} AppSettings
 * @property {string} app_name
 * @property {'IDR' | 'USD'} default_currency
 * @property {'light' | 'dark' | 'system'} [theme]
 * @property {boolean} auto_backup_enabled
 * @property {number} max_backups
 * @property {string} [last_backup_at]
 * @property {number} [usd_to_idr_rate]
 */

/**
 * @typedef {Object} DatabaseSchema
 * @property {Account[]} accounts
 * @property {Transaction[]} transactions
 * @property {Category[]} categories
 * @property {TradingAccount[]} trading_accounts
 * @property {SyncLog[]} sync_logs
 * @property {AppSettings} [settings]
 */

/**
 * @typedef {Object} ScanResult
 * @property {boolean} success
 * @property {Object} [data]
 * @property {'income' | 'expense' | null} data.transaction_type
 * @property {number | null} data.amount
 * @property {string} data.currency
 * @property {string | null} data.date
 * @property {string} data.description
 * @property {string} data.merchant
 * @property {string | null} data.reference_number
 * @property {string | null} data.suggested_account
 * @property {'low' | 'medium' | 'high'} data.confidence
 * @property {string} data.notes
 * @property {string} [ocrEngine]
 * @property {string} [error]
 */

// Export konstanta/helper untuk kompatibilitas impor runtime jika dibutuhkan
export const AccountTypes = ['bank', 'ewallet', 'trading', 'payment_gateway'];
export const TransactionTypes = ['income', 'expense', 'transfer', 'trading'];
export const TransactionSources = ['manual', 'csv_import', 'mt5', 'mayar', 'scan'];

export const Account = {};
export const Transaction = {};
export const Category = {};
export const TradingPosition = {};
export const TradingDeal = {};
export const TradingAccount = {};
export const SyncLog = {};
export const AppSettings = {};
export const DatabaseSchema = {};
export const ScanResult = {};

export default {};
