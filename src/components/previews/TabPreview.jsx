'use client';

import React, { useState, useEffect } from 'react';
import { loadDatabase, getCachedDatabase } from '@/lib/client-data';
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
  PieChart as PieIcon
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
 * Komponen preview visual interaktif halaman tab Kayla Finance untuk iPhone-style gesture.
 * Menghasilkan representasi visual autentik dari halaman tujuan tanpa efek samping.
 * 
 * @param {{ path: string }} props
 * @returns {React.ReactElement}
 */
export default function TabPreview({ path }) {
  const [data, setData] = useState(() => getCachedDatabase());

  useEffect(() => {
    let active = true;
    loadDatabase().then((db) => {
      if (active && db) {
        setData(db);
      }
    });
    return () => { active = false; };
  }, []);

  const accounts = data?.accounts || [];
  const transactions = data?.transactions || [];
  const tradingAccounts = data?.trading_accounts || [];
  const usdRate = data?.settings?.usd_to_idr_rate || 16250;

  // Total balance calculation
  let totalBalanceIDR = 0;
  accounts.forEach((acc) => {
    if (acc.currency === 'USD') {
      totalBalanceIDR += acc.current_balance * usdRate;
    } else {
      totalBalanceIDR += acc.current_balance;
    }
  });

  const totalUSD = totalBalanceIDR / usdRate;

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
                {formatIDR(18500000)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
                <span>Pengeluaran</span>
              </div>
              <div className="text-sm sm:text-base font-bold text-slate-900">
                {formatIDR(6450000)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                <span>Net Cashflow</span>
              </div>
              <div className="text-sm sm:text-base font-bold text-emerald-700">
                +{formatIDR(12050000)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
                <Wallet className="w-3.5 h-3.5 text-indigo-600" />
                <span>Total Akun</span>
              </div>
              <div className="text-sm sm:text-base font-bold text-slate-900">
                {accounts.length || 6} Akun Aktif
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
              {transactions.slice(0, 3).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {tx.type === 'income' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{tx.description}</div>
                      <div className="text-[10px] text-slate-400">{tx.date}</div>
                    </div>
                  </div>
                  <div className={`text-xs font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatIDR(tx.amount)}
                  </div>
                </div>
              ))}
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
          {/* Header Summary Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Total Saldo Seluruh Rekening
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              {formatIDR(totalBalanceIDR)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Terdiri dari {accounts.length} rekening bank, e-wallet, dan akun MT5
            </div>
          </div>

          {/* Account Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {accounts.map((acc) => (
              <div key={acc.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                      {acc.provider.substring(0, 3).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{acc.name}</div>
                      <div className="text-[10px] text-slate-400">{acc.provider}</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 rounded-full">
                    {acc.currency}
                  </span>
                </div>
                <div className="text-base font-extrabold text-slate-900">
                  {acc.currency === 'USD' ? formatUSD(acc.current_balance) : formatIDR(acc.current_balance)}
                </div>
              </div>
            ))}
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
            {transactions.slice(0, 5).map((tx) => (
              <div key={tx.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {tx.type === 'income' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">{tx.description}</div>
                    <div className="text-[10px] text-slate-400">{tx.date} • {tx.type}</div>
                  </div>
                </div>
                <div className={`text-xs font-extrabold ${tx.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {tx.type === 'income' ? '+' : '-'}{formatIDR(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // 4. TRADING PREVIEW
  if (path === '/trading') {
    const mt5 = tradingAccounts[0] || {
      balance: 1500.0,
      equity: 1545.0,
      margin: 30.0,
      free_margin: 1515.0,
      broker: 'Demo Broker',
      account_number: 'Demo',
      open_positions: [
        { symbol: 'XAUUSD', type: 'buy', lots: 0.05, profit: 45.0 },
        { symbol: 'EURUSD', type: 'sell', lots: 0.10, profit: 35.0 }
      ]
    };

    return (
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pointer-events-none select-none pb-16 md:pb-8">
        <main className="flex-1 p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* MT5 Account Card */}
          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CandlestickChart className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold">{mt5.broker || 'Exness'} (MT5)</span>
              </div>
              <span className="px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                Connected
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
              <span className="text-xs text-emerald-600 font-semibold">+55.55 USD</span>
            </div>
            <div className="space-y-3">
              {(mt5.open_positions || []).map((pos, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${pos.type === 'buy' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {pos.type}
                    </span>
                    <span className="text-xs font-bold text-slate-900">{pos.symbol}</span>
                    <span className="text-[11px] text-slate-500">{pos.lots} lots</span>
                  </div>
                  <div className="text-xs font-bold text-emerald-600">
                    +{formatUSD(pos.profit)}
                  </div>
                </div>
              ))}
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
              {formatIDR(18500000)}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium mb-1">Total Pengeluaran</div>
            <div className="text-base sm:text-lg font-extrabold text-slate-900">
              {formatIDR(6450000)}
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-emerald-600" />
            <span>Alokasi Kategori Terbesar</span>
          </h3>
          <div className="space-y-3">
            {[
              { cat: 'Trading & Investasi', amount: 8500000, pct: 45 },
              { cat: 'Kebutuhan Harian', amount: 3200000, pct: 25 },
              { cat: 'Tagihan & Utilitas', amount: 1500000, pct: 15 },
            ].map((item) => (
              <div key={item.cat} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-800">{item.cat}</span>
                  <span className="font-bold text-slate-900">{formatIDR(item.amount)} ({item.pct}%)</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
