'use client';

import React, { useState, useEffect } from 'react';
import { loadDatabase, getCachedDatabase } from '@/lib/client-data';
import { calculateCryptoPortfolio, DEFAULT_CRYPTO_PRICES_USD } from '@/lib/crypto-tracker';
import { 
  Building2, 
  Smartphone, 
  CandlestickChart, 
  CreditCard, 
  TrendingUp, 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowRight,
  Search,
  Activity,
  Layers,
  Coins,
  PieChart as PieIcon,
  CheckCircle2,
  Plus,
  Edit3,
} from 'lucide-react';

/**
 * Format IDR
 * @param {number} amount
 * @returns {string}
 */
function formatIDR(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(amount || 0);
}

/**
 * Format USD
 * @param {number} amount
 * @returns {string}
 */
function formatUSD(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount || 0);
}

/**
 * Komponen preview visual interaktif halaman tab Kayla Finance untuk mobile gesture.
 * Menghasilkan representasi visual autentik dari halaman tujuan tanpa efek samping.
 * Menggunakan React.memo untuk mencegah re-render saat gesture swipe aktif.
 * 
 * @param {{ path: string }} props
 * @returns {React.ReactElement}
 */
const TabPreview = React.memo(function TabPreview({ path }) {
  const [data, setData] = useState(() => getCachedDatabase());

  useEffect(() => {
    let active = true;
    const refresh = () => {
      loadDatabase().then((db) => {
        if (active && db) setData(db);
      }).catch(() => {});
    };
    refresh();
    window.addEventListener('kayla_db_updated', refresh);
    window.addEventListener('kayla_crypto_updated', refresh);
    return () => {
      active = false;
      window.removeEventListener('kayla_db_updated', refresh);
      window.removeEventListener('kayla_crypto_updated', refresh);
    };
  }, []);

  const accounts = data?.accounts || [];
  const transactions = data?.transactions || [];
  const tradingAccounts = data?.trading_accounts || [];
  const usdRate = Number(data?.settings?.usd_to_idr_rate) || 16250;
  const cryptoWallets = Array.isArray(data?.crypto_wallets) ? data.crypto_wallets : [];
  const cryptoPortfolio = calculateCryptoPortfolio(cryptoWallets, DEFAULT_CRYPTO_PRICES_USD, usdRate);

  const totals = transactions.reduce((sum, tx) => {
    const type = String(tx.transaction_type || tx.type || '').toLowerCase();
    const account = accounts.find((acc) => acc.id === tx.account_id);
    const amount = (Number(tx.amount) || 0) * (account?.currency === 'USD' ? usdRate : 1);
    if (type === 'income' || type === 'trading') sum.income += amount;
    if (type === 'expense') sum.expense += amount;
    return sum;
  }, { income: 0, expense: 0 });
  const categoryTotals = transactions.filter((tx) => (tx.transaction_type || tx.type) === 'expense').reduce((map, tx) => {
    const category = (data?.categories || []).find((c) => c.id === tx.category_id);
    const name = category?.name || 'Pengeluaran Lain';
    const account = accounts.find((acc) => acc.id === tx.account_id);
    const amount = (Number(tx.amount) || 0) * (account?.currency === 'USD' ? usdRate : 1);
    map[name] = (map[name] || 0) + amount;
    return map;
  }, {});
  const topCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Total balance calculation
  let totalBalanceIDR = 0;
  accounts.forEach((acc) => {
    const bal = Number(acc?.current_balance) || 0;
    if (acc?.currency === 'USD') {
      totalBalanceIDR += bal * usdRate;
    } else {
      totalBalanceIDR += bal;
    }
  });

  const totalUSD = usdRate > 0 ? totalBalanceIDR / usdRate : 0;

  // 1. DASHBOARD PREVIEW
  if (path === '/' || path === '') {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pointer-events-none select-none pb-16 md:pb-8">
        <main className="flex-1 p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Balance Card Preview */}
          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Total Kekayaan Bersih
              </span>
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                Live Data
              </span>
            </div>
            <div className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-2">
              {formatIDR(totalBalanceIDR)}
            </div>
            <div className="text-sm font-medium text-slate-400 mb-6">
              ≈ {formatUSD(totalUSD)}
            </div>
            <div className="grid grid-cols-4 gap-2 pt-4 border-t border-slate-800/80">
              {['Kirim', 'Tarik', 'Top Up', 'Scan QR'].map((action) => (
                <div key={action} className="bg-slate-800/80 rounded-xl py-2 px-1 text-center text-[11px] font-semibold text-slate-200">
                  {action}
                </div>
              ))}
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                <span>Pemasukan</span>
              </div>
              <div className="text-sm sm:text-base font-bold text-slate-900">
                {formatIDR(totals.income)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
                <span>Pengeluaran</span>
              </div>
              <div className="text-sm sm:text-base font-bold text-slate-900">
                {formatIDR(totals.expense)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                <span>Net Cashflow</span>
              </div>
              <div className="text-sm sm:text-base font-bold text-emerald-700">
                {formatIDR(totals.income - totals.expense)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
                <Wallet className="w-3.5 h-3.5 text-indigo-600" />
                <span>Total Akun</span>
              </div>
              <div className="text-sm sm:text-base font-bold text-slate-900">
                {accounts.length} Akun Aktif
              </div>
            </div>
          </div>

          {/* Recent Transactions List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Transaksi Terbaru</h3>
              <span className="text-xs text-emerald-600 font-medium">Lihat Semua</span>
            </div>
            <div className="space-y-3">
              {transactions.slice(0, 3).map((tx, idx) => {
                const txType = (tx.transaction_type || tx.type || 'expense').toLowerCase();
                const txDate = tx.transaction_date || tx.date || '';
                const isIncome = txType === 'income';
                return (
                  <div key={tx.id || idx} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {isIncome ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-900">{tx.description || tx.notes || 'Transaksi'}</div>
                        <div className="text-[10px] text-slate-400">{txDate}</div>
                      </div>
                    </div>
                    <div className={`text-xs font-bold ${isIncome ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {isIncome ? '+' : '-'}{formatIDR(tx.amount)}
                    </div>
                  </div>
                );
              })}
              {transactions.length === 0 && (
                <div className="py-4 text-center text-xs text-slate-400">Belum ada transaksi tercatat.</div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 2. ACCOUNTS PREVIEW
  if (path === '/accounts') {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pointer-events-none select-none pb-16 md:pb-8">
        <main className="flex-1 p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">Daftar Akun Terdaftar</h3>
              <p className="text-xs text-slate-500">Total {accounts.length} akun aktif dan terintegrasi</p>
            </div>
            <span className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">
              <Plus className="w-4 h-4" /> Tambah Akun
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {accounts.map((acc, idx) => {
              const TypeIcon = acc.account_type === 'ewallet' ? Smartphone : acc.account_type === 'trading' ? CandlestickChart : Building2;
              return (
                <div key={acc.id || idx} className="bg-white border rounded-xl p-5 flex flex-col justify-between shadow-xs border-slate-200">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                          <TypeIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center flex-wrap gap-1.5">
                            <h4 className="text-sm font-semibold text-slate-900 leading-tight">{acc.name || 'Akun'}</h4>
                            <span className="px-1.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600">{acc.ledger === 'business' ? 'Bisnis' : 'Pribadi'}</span>
                          </div>
                          <span className="text-[11px] text-slate-500">{acc.account_type || 'Akun'} • {acc.provider || acc.name || 'Akun'}</span>
                        </div>
                      </div>
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    </div>
                    <div className="mt-5">
                      <span className="text-[11px] text-slate-500 font-medium">Saldo Terkini</span>
                      <div className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">
                        {acc.currency === 'USD' ? formatUSD(acc.current_balance) : formatIDR(acc.current_balance)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="text-[11px]">Sinkron: {acc.last_synced_at ? new Date(acc.last_synced_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-'}</span>
                    <span className="flex items-center gap-1 font-semibold text-emerald-700"><Edit3 className="w-3.5 h-3.5" /> Edit & Saldo</span>
                  </div>
                </div>
              );
            })}
            {accounts.length === 0 && (
              <div className="col-span-full py-8 text-center text-xs text-slate-400">Belum ada akun rekening terdaftar.</div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // 3. TRANSACTIONS PREVIEW
  if (path === '/transactions') {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pointer-events-none select-none pb-16 md:pb-8">
        <main className="flex-1 p-4 sm:p-8 space-y-4 max-w-7xl w-full mx-auto">
          {/* Search and Filters Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200/80">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-400">Cari transaksi...</span>
            </div>
            <div className="flex gap-1">
              <span className="px-2.5 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 rounded-lg">Semua</span>
              <span className="px-2.5 py-1 text-xs font-medium text-slate-500 bg-slate-50 rounded-lg">Pemasukan</span>
              <span className="px-2.5 py-1 text-xs font-medium text-slate-500 bg-slate-50 rounded-lg">Pengeluaran</span>
            </div>
          </div>

          {/* Transactions List */}
          <div className="space-y-2.5">
            {transactions.slice(0, 5).map((tx, idx) => {
              const txType = (tx.transaction_type || tx.type || 'expense').toLowerCase();
              const txDate = tx.transaction_date || tx.date || '';
              const isIncome = txType === 'income';
              return (
                <div key={tx.id || idx} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {isIncome ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{tx.description || tx.notes || 'Transaksi'}</div>
                      <div className="text-[10px] text-slate-400">
                        {txDate ? `${txDate} • ` : ''}{txType}
                      </div>
                    </div>
                  </div>
                  <div className={`text-xs font-extrabold ${isIncome ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {isIncome ? '+' : '-'}{formatIDR(tx.amount)}
                  </div>
                </div>
              );
            })}
            {transactions.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400">Belum ada transaksi untuk ditampilkan.</div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // 4. CRYPTO PORTFOLIO PREVIEW
  if (path === '/crypto') {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pointer-events-none select-none pb-16 md:pb-8">
        <main className="flex-1 p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          <div className="space-y-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                <Coins className="w-5 h-5" />
              </span>
              <h2 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">Portofolio Aset Kripto Terpadu</h2>
            </div>
            <p className="text-xs text-slate-500">Pelacakan non-kustodian Watch-Only multi-chain dengan valuasi USD dan IDR real-time.</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700">Perbarui Harga</span>
              <span className="px-3.5 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white">Tambah Dompet</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
              <span>Total Nilai Portofolio Kripto</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">IDR & USD</span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {formatIDR(cryptoPortfolio.total_idr)}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-slate-500 mt-1">
              ≈ {formatUSD(cryptoPortfolio.total_usd)} <span className="text-slate-300">|</span> <span className="text-[11px] text-slate-400">Kurs Rp {usdRate.toLocaleString('id-ID')}/USD</span>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-500">Unrealized PnL:</span>
              <span className="font-bold text-emerald-600">{formatUSD(cryptoPortfolio.total_unrealized_pnl_usd)} ({cryptoPortfolio.total_unrealized_pnl_percentage.toFixed(2)}%)</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-3">
              <span>Aset Terbesar & Jumlah Dompet</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">Statistik</span>
            </div>
            <div className="text-base font-medium text-slate-400">
              {cryptoPortfolio.allocation_by_asset[0]?.symbol || 'Belum ada aset'}
            </div>
            <p className="text-xs text-slate-500 mt-1">Tersebar di {cryptoWallets.length} dompet pengawasan aktif</p>
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>Metode Pelacakan:</span>
              <span className="font-semibold text-slate-700">Watch-Only Non-Kustodian</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500">Status Data Pasar</span>
              <span className="text-[10px] font-semibold text-emerald-700">Estimasi Harga</span>
            </div>
            <div className="text-xs text-slate-400">Harga tersedia dari data lokal yang terakhir dimuat.</div>
          </div>

          {cryptoWallets.length > 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">Dompet Terdaftar</h3>
                <span className="text-xs text-slate-400">{cryptoWallets.length} Dompet</span>
              </div>
              <div className="space-y-3">
                {cryptoPortfolio.wallets.map((asset, idx) => (
                  <div key={asset.id || idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        {String(asset.asset_symbol || 'COIN').substring(0, 3)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">{asset.label || asset.asset_symbol}</div>
                        <div className="text-[10px] text-slate-400">{asset.balance} {asset.asset_symbol}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-900">{formatUSD(asset.value_usd)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 text-center text-xs text-slate-400">
              Belum ada dompet kripto terdaftar.
            </div>
          )}
        </main>
      </div>
    );
  }

  // 5. TRADING PREVIEW
  if (path === '/trading') {
    const rawMt5 = tradingAccounts[0] || {};
    const activePositions = Array.isArray(rawMt5.positions) ? rawMt5.positions :
      Array.isArray(rawMt5.open_positions) ? rawMt5.open_positions : [];
    const totalFloatingProfit = activePositions.reduce((sum, p) => sum + (Number(p.profit) || 0), 0);
    const isFloatingProfit = totalFloatingProfit >= 0;

    const mt5 = {
      balance: rawMt5.balance ?? 0,
      equity: rawMt5.equity ?? 0,
      margin: rawMt5.margin ?? 0,
      free_margin: rawMt5.free_margin ?? 0,
      broker: rawMt5.broker || 'MT5',
      account_number: rawMt5.account_number || '',
      positions: activePositions,
      open_positions: activePositions,
    };

    return (
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pointer-events-none select-none pb-16 md:pb-8">
        <main className="flex-1 p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* MT5 Account Card */}
          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CandlestickChart className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold">{mt5.broker} (MT5)</span>
              </div>
              <span className="px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                {tradingAccounts.length ? 'Akun Tersedia' : 'Belum Ada Akun'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Balance</div>
                <div className="text-lg sm:text-xl font-bold">{formatUSD(mt5.balance)}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Equity</div>
                <div className="text-lg sm:text-xl font-bold text-emerald-400">{formatUSD(mt5.equity)}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Margin</div>
                <div className="text-lg sm:text-xl font-bold">{formatUSD(mt5.margin)}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Free Margin</div>
                <div className="text-lg sm:text-xl font-bold text-slate-200">{formatUSD(mt5.free_margin)}</div>
              </div>
            </div>
          </div>

          {/* Open Positions Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                <span>Posisi Terbuka (Open Trades)</span>
              </h3>
              <span className={`text-xs font-semibold ${isFloatingProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                {isFloatingProfit ? '+' : ''}{formatUSD(totalFloatingProfit)}
              </span>
            </div>
            <div className="space-y-3">
              {(mt5.positions || mt5.open_positions || []).map((pos, idx) => {
                const posType = String(pos.type || 'buy').toLowerCase();
                const isBuy = posType === 'buy' || posType === '0';
                const profitNum = Number(pos.profit) || 0;
                const isPosProfit = profitNum >= 0;
                return (
                  <div key={pos.ticket || pos.id || idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${isBuy ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {isBuy ? 'BUY' : 'SELL'}
                      </span>
                      <span className="text-xs font-bold text-slate-900">{pos.symbol || 'SYMBOL'}</span>
                      <span className="text-[11px] text-slate-500">{pos.lots ?? pos.volume ?? 0} lots</span>
                    </div>
                    <div className={`text-xs font-bold ${isPosProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isPosProfit ? '+' : ''}{formatUSD(profitNum)}
                    </div>
                  </div>
                );
              })}
              {activePositions.length === 0 && (
                <div className="py-5 text-center text-xs text-slate-500">Tidak ada posisi terbuka.</div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 5. REPORTS PREVIEW
  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pointer-events-none select-none pb-16 md:pb-8">
      <main className="flex-1 p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium mb-1">Total Pemasukan</div>
            <div className="text-base sm:text-lg font-extrabold text-emerald-700">
              {formatIDR(totals.income)}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium mb-1">Total Pengeluaran</div>
            <div className="text-base sm:text-lg font-extrabold text-slate-900">
              {formatIDR(totals.expense)}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-emerald-600" />
            <span>Alokasi Kategori Terbesar</span>
          </h3>
          <div className="space-y-3">
            {topCategories.map(([name, amount]) => (
              <div key={name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-800">{name}</span>
                  <span className="font-bold text-slate-900">{formatIDR(amount)} ({totals.expense > 0 ? Math.round(amount / totals.expense * 100) : 0}%)</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${totals.expense > 0 ? amount / totals.expense * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {topCategories.length === 0 && (
              <div className="py-5 text-center text-xs text-slate-500">Belum ada data pengeluaran.</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
});

export default TabPreview;
