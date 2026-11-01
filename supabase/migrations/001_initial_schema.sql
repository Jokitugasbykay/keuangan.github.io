-- Kayla Finance — initial schema (Supabase / PostgreSQL)
-- Amount convention: amount is always POSITIVE; direction is given by transaction_type
--   income | trading  => increase balance
--   expense           => decrease balance
--   transfer          => decrease source, increase destination (pair via transfer_group_id)
-- All timestamps stored in UTC (timestamptz).

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name varchar(255) not null,
  provider varchar(100),
  account_type varchar(32) not null check (account_type in ('bank', 'ewallet', 'trading', 'payment_gateway')),
  currency varchar(8) not null default 'IDR' check (currency in ('IDR', 'USD')),
  current_balance numeric(18, 4) not null default 0,
  ledger varchar(16) not null default 'personal' check (ledger in ('personal', 'business')),
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_accounts_user_id on public.accounts (user_id);
create index if not exists idx_accounts_ledger on public.accounts (ledger);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name varchar(120) not null,
  category_type varchar(16) not null check (category_type in ('income', 'expense')),
  icon varchar(64),
  color varchar(32)
);

create index if not exists idx_categories_user_id on public.categories (user_id);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  external_transaction_id varchar(128),
  import_hash varchar(64),
  transaction_date timestamptz not null,
  description text not null,
  amount numeric(18, 4) not null check (amount >= 0),
  transaction_type varchar(16) not null check (transaction_type in ('income', 'expense', 'transfer', 'trading')),
  category_id uuid references public.categories (id) on delete set null,
  destination_account_id uuid references public.accounts (id) on delete set null,
  transfer_group_id uuid,
  source varchar(32) not null default 'manual' check (source in ('manual', 'csv_import', 'mt5', 'mayar', 'scan')),
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

-- Dedup: same external id per account only once
create unique index if not exists uq_transactions_account_external
  on public.transactions (account_id, external_transaction_id)
  where external_transaction_id is not null;

-- Dedup CSV imports via content hash
create unique index if not exists uq_transactions_import_hash
  on public.transactions (account_id, import_hash)
  where import_hash is not null;

create index if not exists idx_transactions_user_id on public.transactions (user_id);
create index if not exists idx_transactions_account_id on public.transactions (account_id);
create index if not exists idx_transactions_date on public.transactions (transaction_date);
create index if not exists idx_transactions_account_date on public.transactions (account_id, transaction_date);

-- ---------------------------------------------------------------------------
-- trading_accounts
-- ---------------------------------------------------------------------------
create table if not exists public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  broker varchar(120),
  mt5_login varchar(32),
  server varchar(120),
  currency varchar(8) default 'USD',
  leverage integer,
  balance numeric(18, 4) not null default 0,
  equity numeric(18, 4) not null default 0,
  floating_profit numeric(18, 4) not null default 0,
  margin numeric(18, 4) default 0,
  free_margin numeric(18, 4) default 0,
  margin_level numeric(18, 4) default 0,
  last_synced_at timestamptz
);

create index if not exists idx_trading_accounts_user_id on public.trading_accounts (user_id);

-- ---------------------------------------------------------------------------
-- trading_deals
-- ---------------------------------------------------------------------------
create table if not exists public.trading_deals (
  id uuid primary key default gen_random_uuid(),
  trading_account_id uuid not null references public.trading_accounts (id) on delete cascade,
  external_deal_id varchar(64) not null,
  symbol varchar(32),
  deal_type varchar(8) check (deal_type in ('buy', 'sell')),
  volume numeric(18, 4),
  price numeric(18, 8),
  profit numeric(18, 4),
  commission numeric(18, 4) default 0,
  swap numeric(18, 4) default 0,
  deal_time timestamptz not null
);

create unique index if not exists uq_trading_deals_external
  on public.trading_deals (trading_account_id, external_deal_id);

create index if not exists idx_trading_deals_time on public.trading_deals (deal_time);

-- ---------------------------------------------------------------------------
-- exchange_rates (for net worth IDR/USD)
-- ---------------------------------------------------------------------------
create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency varchar(8) not null,
  quote_currency varchar(8) not null,
  rate numeric(18, 8) not null check (rate > 0),
  as_of timestamptz not null default timezone('utc', now()),
  source varchar(64) default 'manual',
  unique (base_currency, quote_currency, as_of)
);

create index if not exists idx_exchange_rates_pair_asof
  on public.exchange_rates (base_currency, quote_currency, as_of desc);

-- ---------------------------------------------------------------------------
-- sync_logs
-- ---------------------------------------------------------------------------
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source varchar(120) not null,
  status varchar(16) not null check (status in ('success', 'failed', 'running')),
  started_at timestamptz not null,
  completed_at timestamptz,
  records_synced integer default 0,
  error_message text
);

create index if not exists idx_sync_logs_user_id on public.sync_logs (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.trading_accounts enable row level security;
alter table public.trading_deals enable row level security;
alter table public.sync_logs enable row level security;
-- exchange_rates may be shared read; write restricted via service role if needed
alter table public.exchange_rates enable row level security;

-- Policies: owner-only (user_id = auth.uid())
create policy accounts_owner on public.accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy categories_owner on public.categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy transactions_owner on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy trading_accounts_owner on public.trading_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy sync_logs_owner on public.sync_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Deals: access via parent trading_account ownership
create policy trading_deals_owner on public.trading_deals
  for all using (
    exists (
      select 1 from public.trading_accounts ta
      where ta.id = trading_deals.trading_account_id and ta.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.trading_accounts ta
      where ta.id = trading_deals.trading_account_id and ta.user_id = auth.uid()
    )
  );

-- Exchange rates: authenticated users can read; writes via service role
create policy exchange_rates_read on public.exchange_rates
  for select to authenticated using (true);
