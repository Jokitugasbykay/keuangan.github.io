-- ============================================================================
-- Migration: 20261106103000_kayla_finance_schema.sql
-- Description: Canonical production schema for Kayla Finance on Supabase / PostgreSQL.
-- Compliance: Supabase CLI migration naming standard (YYYYMMDDHHMMSS_name.sql).
-- Standards: Exact monetary precision NUMERIC(18, 4), ISO 8601 UTC timestamptz,
--            Granular RLS policies per operation, Strict anonymous access revocation.
-- ============================================================================

-- 1. Ekstensi Kriptografi & UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Fungsi Otomatis Pembaruan Timestamp (updated_at)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 3. Tabel Pengaturan Aplikasi (app_settings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  app_name VARCHAR(100) NOT NULL DEFAULT 'Kayla Finance',
  default_currency VARCHAR(3) NOT NULL DEFAULT 'IDR' CHECK (default_currency IN ('IDR', 'USD')),
  theme VARCHAR(10) NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  auto_backup_enabled BOOLEAN NOT NULL DEFAULT true,
  max_backups INTEGER NOT NULL DEFAULT 15,
  usd_to_idr_rate NUMERIC(12, 2) NOT NULL DEFAULT 16250.00,
  last_backup_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT uq_app_settings_user UNIQUE (user_id)
);

CREATE TRIGGER set_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Tabel Akun & Saldo Keuangan (accounts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
  id VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  provider VARCHAR(100) NOT NULL,
  account_type VARCHAR(32) NOT NULL CHECK (account_type IN ('bank', 'ewallet', 'trading', 'payment_gateway')),
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR' CHECK (currency IN ('IDR', 'USD')),
  current_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  ledger VARCHAR(16) NOT NULL DEFAULT 'personal' CHECK (ledger IN ('personal', 'business')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_ledger ON public.accounts (ledger);

-- ----------------------------------------------------------------------------
-- 5. Tabel Kategori Keuangan (categories)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  category_type VARCHAR(16) NOT NULL CHECK (category_type IN ('income', 'expense')),
  icon VARCHAR(64),
  color VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories (user_id);

-- ----------------------------------------------------------------------------
-- 6. Tabel Transaksi Keuangan (transactions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  account_id VARCHAR(64) NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  external_transaction_id VARCHAR(128),
  import_hash VARCHAR(64),
  transaction_date TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(18, 4) NOT NULL CHECK (amount >= 0),
  transaction_type VARCHAR(16) NOT NULL CHECK (transaction_type IN ('income', 'expense', 'transfer', 'trading')),
  category_id VARCHAR(64) REFERENCES public.categories (id) ON DELETE SET NULL,
  destination_account_id VARCHAR(64) REFERENCES public.accounts (id) ON DELETE RESTRICT,
  transfer_group_id VARCHAR(64),
  source VARCHAR(32) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv_import', 'mt5', 'mayar', 'scan')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_account_external
  ON public.transactions (account_id, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_import_hash
  ON public.transactions (account_id, import_hash)
  WHERE import_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON public.transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions (transaction_date);

-- ----------------------------------------------------------------------------
-- 7. Tabel Akun Trading MT5 (trading_accounts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trading_accounts (
  id VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  account_id VARCHAR(64) NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  broker VARCHAR(100) NOT NULL,
  mt5_login VARCHAR(50) NOT NULL,
  server VARCHAR(100) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  leverage INTEGER NOT NULL DEFAULT 100,
  balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  equity NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  floating_profit NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  margin NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  free_margin NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  margin_level NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_trading_accounts_user_id ON public.trading_accounts (user_id);

-- ----------------------------------------------------------------------------
-- 8. Tabel Posisi Terbuka Trading (trading_positions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trading_positions (
  id VARCHAR(64) PRIMARY KEY,
  trading_account_id VARCHAR(64) NOT NULL REFERENCES public.trading_accounts (id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  position_type VARCHAR(10) NOT NULL CHECK (position_type IN ('BUY', 'SELL')),
  volume NUMERIC(10, 4) NOT NULL,
  open_price NUMERIC(18, 5) NOT NULL,
  current_price NUMERIC(18, 5) NOT NULL,
  sl NUMERIC(18, 5),
  tp NUMERIC(18, 5),
  profit NUMERIC(18, 4) NOT NULL,
  open_time TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trading_positions_account ON public.trading_positions (trading_account_id);

-- ----------------------------------------------------------------------------
-- 9. Tabel Riwayat Deals Trading (trading_deals)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trading_deals (
  id VARCHAR(64) PRIMARY KEY,
  trading_account_id VARCHAR(64) NOT NULL REFERENCES public.trading_accounts (id) ON DELETE CASCADE,
  external_deal_id VARCHAR(64) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  deal_type VARCHAR(10) NOT NULL CHECK (deal_type IN ('buy', 'sell')),
  volume NUMERIC(10, 4) NOT NULL,
  price NUMERIC(18, 5) NOT NULL,
  profit NUMERIC(18, 4) NOT NULL,
  commission NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  swap NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  deal_time TIMESTAMPTZ NOT NULL,
  comment TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_trading_deals_external
  ON public.trading_deals (trading_account_id, external_deal_id);

-- ----------------------------------------------------------------------------
-- 10. Tabel Log Sinkronisasi (sync_logs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'running')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  records_synced INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_user_id ON public.sync_logs (user_id);

-- ============================================================================
-- 11. Row Level Security (RLS) - Granular Strict Policies
-- ============================================================================

-- A. Aktifkan RLS pada seluruh tabel
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- B. Granular Policies: app_settings
CREATE POLICY "app_settings_select_policy" ON public.app_settings
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "app_settings_insert_policy" ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "app_settings_update_policy" ON public.app_settings
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "app_settings_delete_policy" ON public.app_settings
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- C. Granular Policies: accounts
CREATE POLICY "accounts_select_policy" ON public.accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "accounts_insert_policy" ON public.accounts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "accounts_update_policy" ON public.accounts
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "accounts_delete_policy" ON public.accounts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- D. Granular Policies: categories
CREATE POLICY "categories_select_policy" ON public.categories
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "categories_insert_policy" ON public.categories
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "categories_update_policy" ON public.categories
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "categories_delete_policy" ON public.categories
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- E. Granular Policies: transactions
CREATE POLICY "transactions_select_policy" ON public.transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "transactions_insert_policy" ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "transactions_update_policy" ON public.transactions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "transactions_delete_policy" ON public.transactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- F. Granular Policies: trading_accounts
CREATE POLICY "trading_accounts_select_policy" ON public.trading_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "trading_accounts_insert_policy" ON public.trading_accounts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "trading_accounts_update_policy" ON public.trading_accounts
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "trading_accounts_delete_policy" ON public.trading_accounts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- G. Granular Policies: trading_positions (Relasi via trading_accounts)
CREATE POLICY "trading_positions_select_policy" ON public.trading_positions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.trading_accounts ta WHERE ta.id = trading_positions.trading_account_id AND ta.user_id = auth.uid())
  );
CREATE POLICY "trading_positions_insert_policy" ON public.trading_positions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.trading_accounts ta WHERE ta.id = trading_positions.trading_account_id AND ta.user_id = auth.uid())
  );
CREATE POLICY "trading_positions_update_policy" ON public.trading_positions
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.trading_accounts ta WHERE ta.id = trading_positions.trading_account_id AND ta.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.trading_accounts ta WHERE ta.id = trading_positions.trading_account_id AND ta.user_id = auth.uid())
  );
CREATE POLICY "trading_positions_delete_policy" ON public.trading_positions
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.trading_accounts ta WHERE ta.id = trading_positions.trading_account_id AND ta.user_id = auth.uid())
  );

-- H. Granular Policies: trading_deals (Relasi via trading_accounts)
CREATE POLICY "trading_deals_select_policy" ON public.trading_deals
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.trading_accounts ta WHERE ta.id = trading_deals.trading_account_id AND ta.user_id = auth.uid())
  );
CREATE POLICY "trading_deals_insert_policy" ON public.trading_deals
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.trading_accounts ta WHERE ta.id = trading_deals.trading_account_id AND ta.user_id = auth.uid())
  );
CREATE POLICY "trading_deals_update_policy" ON public.trading_deals
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.trading_accounts ta WHERE ta.id = trading_deals.trading_account_id AND ta.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.trading_accounts ta WHERE ta.id = trading_deals.trading_account_id AND ta.user_id = auth.uid())
  );
CREATE POLICY "trading_deals_delete_policy" ON public.trading_deals
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.trading_accounts ta WHERE ta.id = trading_deals.trading_account_id AND ta.user_id = auth.uid())
  );

-- I. Granular Policies: sync_logs
CREATE POLICY "sync_logs_select_policy" ON public.sync_logs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "sync_logs_insert_policy" ON public.sync_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "sync_logs_update_policy" ON public.sync_logs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "sync_logs_delete_policy" ON public.sync_logs
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================================
-- 12. Isolasi Mutlak Peran Anonim (anon) & Hak Akses Minimal
-- ============================================================================

-- Cabut seluruh izin akses dari role anon di schema public
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

-- Pastikan tabel atau fungsi baru otomatis mencabut izin dari anon
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon;

-- Berikan izin hanya untuk authenticated dan service_role
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

GRANT ALL ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;
