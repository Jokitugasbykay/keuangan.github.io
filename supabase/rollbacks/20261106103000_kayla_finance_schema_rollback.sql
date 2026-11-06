-- ============================================================================
-- Rollback: 20261106103000_kayla_finance_schema_rollback.sql
-- Description: Rollback script for 20261106103000_kayla_finance_schema.sql
-- Location: supabase/rollbacks/ (Isolated from migrations directory)
-- ============================================================================

-- 1. Hapus Kebijakan RLS (Granular Policies)
DROP POLICY IF EXISTS "sync_logs_delete_policy" ON public.sync_logs;
DROP POLICY IF EXISTS "sync_logs_update_policy" ON public.sync_logs;
DROP POLICY IF EXISTS "sync_logs_insert_policy" ON public.sync_logs;
DROP POLICY IF EXISTS "sync_logs_select_policy" ON public.sync_logs;

DROP POLICY IF EXISTS "trading_deals_delete_policy" ON public.trading_deals;
DROP POLICY IF EXISTS "trading_deals_update_policy" ON public.trading_deals;
DROP POLICY IF EXISTS "trading_deals_insert_policy" ON public.trading_deals;
DROP POLICY IF EXISTS "trading_deals_select_policy" ON public.trading_deals;

DROP POLICY IF EXISTS "trading_positions_delete_policy" ON public.trading_positions;
DROP POLICY IF EXISTS "trading_positions_update_policy" ON public.trading_positions;
DROP POLICY IF EXISTS "trading_positions_insert_policy" ON public.trading_positions;
DROP POLICY IF EXISTS "trading_positions_select_policy" ON public.trading_positions;

DROP POLICY IF EXISTS "trading_accounts_delete_policy" ON public.trading_accounts;
DROP POLICY IF EXISTS "trading_accounts_update_policy" ON public.trading_accounts;
DROP POLICY IF EXISTS "trading_accounts_insert_policy" ON public.trading_accounts;
DROP POLICY IF EXISTS "trading_accounts_select_policy" ON public.trading_accounts;

DROP POLICY IF EXISTS "transactions_delete_policy" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update_policy" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_policy" ON public.transactions;
DROP POLICY IF EXISTS "transactions_select_policy" ON public.transactions;

DROP POLICY IF EXISTS "categories_delete_policy" ON public.categories;
DROP POLICY IF EXISTS "categories_update_policy" ON public.categories;
DROP POLICY IF EXISTS "categories_insert_policy" ON public.categories;
DROP POLICY IF EXISTS "categories_select_policy" ON public.categories;

DROP POLICY IF EXISTS "accounts_delete_policy" ON public.accounts;
DROP POLICY IF EXISTS "accounts_update_policy" ON public.accounts;
DROP POLICY IF EXISTS "accounts_insert_policy" ON public.accounts;
DROP POLICY IF EXISTS "accounts_select_policy" ON public.accounts;

DROP POLICY IF EXISTS "app_settings_delete_policy" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_update_policy" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_insert_policy" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_select_policy" ON public.app_settings;

-- 2. Hapus Trigger & Fungsi
DROP TRIGGER IF EXISTS set_app_settings_updated_at ON public.app_settings;
DROP FUNCTION IF EXISTS public.handle_updated_at();

-- 3. Hapus Tabel dalam Urutan Dependensi Terbalik (Foreign Key Dependency Safe)
DROP TABLE IF EXISTS public.sync_logs CASCADE;
DROP TABLE IF EXISTS public.trading_deals CASCADE;
DROP TABLE IF EXISTS public.trading_positions CASCADE;
DROP TABLE IF EXISTS public.trading_accounts CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.accounts CASCADE;
DROP TABLE IF EXISTS public.app_settings CASCADE;
