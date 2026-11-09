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
  ScanLine,
  UploadCloud,
  Download,
  FileJson,
  PlusCircle,
  Clock,
  Settings,
  ShieldCheck,
  Inbox,
  Lock,
  Unlock,
  KeyRound
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

const PIE_COLORS = ['#059669', '#10b981', '#0284c7', '#6366f1', '#f59e0b', '#64748b'];

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

  // MT5 calculations
  const tradingAcc = tradingAccounts[0] || null;
  const tradingPositions = Array.isArray(tradingAcc?.positions) ? tradingAcc.positions :
    Array.isArray(tradingAcc?.open_positions) ? tradingAcc.open_positions : [];
  const tradingFloatingProfit = tradingAcc ? (Number(tradingAcc.floating_profit) || 0) : 0;
  const tradingBalanceIDR = tradingAcc ? (Number(tradingAcc.balance) || 0) * usdRate : 0;
  const tradingFloatingIDR = tradingFloatingProfit * usdRate;

  // Liquid cash calculations
  let totalBankEwallet = 0;
  let totalMayar = 0;
  accounts.forEach((acc) => {
    const bal = Number(acc.current_balance) || 0;
    const rate = acc.currency === 'USD' ? usdRate : 1;
    if (acc.account_type === 'bank' || acc.account_type === 'ewallet') {
      totalBankEwallet += bal * rate;
    } else if (acc.account_type === 'payment_gateway') {
      totalMayar += bal * rate;
    }
  });

  // Net worth IDR matching page.jsx
  const netWorthIDR = totalBankEwallet + totalMayar + tradingBalanceIDR + tradingFloatingIDR;

  // Current month income & expense matching page.jsx
  let monthlyIncome = 0;
  let monthlyExpense = 0;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  transactions.forEach((t) => {
    const txDate = new Date(t.transaction_date || t.date || t.created_at);
    const isCurrentMonth = !isNaN(txDate.getTime()) && txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth;
    if (!isCurrentMonth) return;

    const acc = accounts.find((a) => a.id === t.account_id);
    const isUSD = acc?.currency === 'USD';
    const rate = isUSD ? usdRate : 1;
    const amt = (Number(t.amount) || 0) * rate;

    const txType = (t.transaction_type || t.type || '').toLowerCase();
    if (txType === 'income' || txType === 'trading') {
      monthlyIncome += amt;
    } else if (txType === 'expense') {
      monthlyExpense += amt;
    }
  });

  // All-time totals for reports
  let allTimeIncome = 0;
  let allTimeExpense = 0;
  const categoryTotals = {};
  transactions.forEach((tx) => {
    const txType = String(tx.transaction_type || tx.type || '').toLowerCase();
    const acc = accounts.find((a) => a.id === tx.account_id);
    const rate = acc?.currency === 'USD' ? usdRate : 1;
    const amount = (Number(tx.amount) || 0) * rate;

    if (txType === 'income' || txType === 'trading') {
      allTimeIncome += amount;
    } else if (txType === 'expense') {
      allTimeExpense += amount;
      const cat = (data?.categories || []).find((c) => c.id === tx.category_id);
      const name = cat?.name || 'Pengeluaran Lain';
      categoryTotals[name] = (categoryTotals[name] || 0) + amount;
    }
  });
  const topCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  // Distribution data for dashboard asset donut chart
  const distributionData = accounts.map((acc) => {
    const val = (Number(acc.current_balance) || 0) * (acc.currency === 'USD' ? usdRate : 1);
    return {
      name: acc.provider || acc.name,
      value: Math.max(0, val),
    };
  });

  // Cashflow 6 months data for dashboard bar chart matching page.jsx
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const cashflowData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const label = `${monthNames[mo]}${yr !== currentYear ? ' ' + String(yr).slice(-2) : ''}`;

    let masuk = 0;
    let keluar = 0;
    transactions.forEach((t) => {
      const txD = new Date(t.transaction_date || t.date || t.created_at);
      if (!isNaN(txD.getTime()) && txD.getFullYear() === yr && txD.getMonth() === mo) {
        const acc = accounts.find((a) => a.id === t.account_id);
        const rate = acc?.currency === 'USD' ? usdRate : 1;
        const amt = (Number(t.amount) || 0) * rate;
        const txType = (t.transaction_type || t.type || '').toLowerCase();
        if (txType === 'income' || txType === 'trading') {
          masuk += amt;
        } else if (txType === 'expense') {
          keluar += amt;
        }
      }
    });

    cashflowData.push({
      bulan: label,
      Masuk: masuk,
      Keluar: keluar,
    });
  }

  // 1. DASHBOARD PREVIEW (Identik dengan src/app/page.jsx)
  if (path === '/' || path === '') {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pointer-events-none select-none pb-16 md:pb-8">
        <main className="flex-1 p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Top Metric Cards (4 Kartu Putih Elegan FigCraft) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Kekayaan Bersih */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">Total Kekayaan Bersih</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {formatIDR(netWorthIDR)}
                </div>
                <div className="mt-1.5 text-xs text-emerald-700 font-medium">
                  Termasuk MT5 ({formatUSD(tradingAcc?.balance || 0)})
                </div>
              </div>
            </div>

            {/* Card 2: Kas Likuid (Bank & E-Wallet) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">Kas Likuid (Bank & E-Wallet)</span>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {formatIDR(totalBankEwallet)}
                </div>
                <div className="mt-1.5 text-xs text-slate-500">
                  Akun bank operasional & harian
                </div>
              </div>
            </div>

            {/* Card 3: Pemasukan Bulan Ini */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">Pemasukan Bulan Ini</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-emerald-600 tracking-tight">
                  +{formatIDR(monthlyIncome)}
                </div>
                <div className="mt-1.5 text-xs text-rose-600 font-medium">
                  -{formatIDR(monthlyExpense)} pengeluaran
                </div>
              </div>
            </div>

            {/* Card 4: MT5 Trading Equity */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">MT5 Trading Equity</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <CandlestickChart className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {formatUSD(tradingAcc ? tradingAcc.equity : 0)}
                </div>
                <div className="mt-1.5 text-xs flex items-center gap-1.5">
                  <span className={`font-semibold ${tradingFloatingProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    Floating: {tradingFloatingProfit >= 0 ? '+' : ''}{formatUSD(tradingFloatingProfit)}
                  </span>
                  <span className="text-slate-500">({tradingPositions.length} Posisi)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Baris Grafik */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tren Arus Kas */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Tren Arus Kas (6 Bulan Terakhir)</h3>
                  <p className="text-xs text-slate-500">Perbandingan perputaran pemasukan dan pengeluaran bulanan</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block"></span>
                    <span className="text-slate-600 font-medium">Pemasukan</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-600 inline-block"></span>
                    <span className="text-slate-600 font-medium">Pengeluaran</span>
                  </div>
                </div>
              </div>

              <div className="h-64 w-full flex items-end justify-between gap-2 pt-6 px-2 border-b border-slate-100">
                {cashflowData.map((d, i) => {
                  const maxVal = Math.max(1, ...cashflowData.map(c => Math.max(c.Masuk, c.Keluar)));
                  const hMasuk = Math.max(4, Math.round((d.Masuk / maxVal) * 160));
                  const hKeluar = Math.max(4, Math.round((d.Keluar / maxVal) * 160));
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <div className="flex items-end gap-1 w-full justify-center">
                        <div style={{ height: `${d.Masuk > 0 ? hMasuk : 4}px` }} className="w-3 sm:w-5 bg-emerald-600 rounded-t-xs" />
                        <div style={{ height: `${d.Keluar > 0 ? hKeluar : 4}px` }} className="w-3 sm:w-5 bg-rose-600 rounded-t-xs" />
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1">{d.bulan}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Donut Chart: Distribusi Saldo Aset */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">Distribusi Saldo Aset</h3>
                <p className="text-xs text-slate-500 mb-4">Alokasi dana per akun terdaftar</p>
              </div>

              <div className="h-44 w-full flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-8 border-emerald-600 border-t-emerald-400 border-r-sky-500 border-l-amber-500 flex items-center justify-center text-xs text-slate-400 font-medium">
                  {distributionData.length} Akun
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100 text-xs">
                {distributionData.slice(0, 6).map((item, idx) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}></span>
                    <span className="text-slate-700 truncate">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Baris Bawah: Transaksi Terbaru & Posisi MT5 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Transaksi Terbaru */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Transaksi Terbaru</h3>
                  <p className="text-xs text-slate-500">Mutasi keuangan yang baru saja dicatat sistem</p>
                </div>
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  Lihat Semua
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
              {transactions && transactions.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {transactions.slice(0, 5).map((tx) => {
                    const acc = accounts.find((a) => a.id === tx.account_id);
                    const isUSD = acc?.currency === 'USD';
                    const txType = (tx.transaction_type || tx.type || '').toLowerCase();
                    const isIncome = txType === 'income' || txType === 'trading';

                    return (
                      <div key={tx.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {isIncome ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="text-xs sm:text-sm font-medium text-slate-900 line-clamp-1">{tx.description}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>{acc?.provider || 'Akun'}</span>
                              <span>•</span>
                              <span>{tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : ''}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xs sm:text-sm font-bold ${isIncome ? 'text-emerald-600' : 'text-slate-900'}`}>
                            {isIncome ? '+' : '-'}{isUSD ? formatUSD(tx.amount) : formatIDR(tx.amount)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 text-center flex flex-col items-center justify-center text-slate-400">
                  <p className="text-xs mb-3">Belum ada transaksi tercatat.</p>
                </div>
              )}
            </div>

            {/* Posisi MT5 Terbuka */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <CandlestickChart className="w-4 h-4 text-emerald-600" />
                      Posisi MT5 Terbuka
                    </h3>
                    <p className="text-xs text-slate-500">{tradingAcc?.broker || 'Exness'} • {tradingPositions.length} Posisi Aktif</p>
                  </div>
                  <span className="text-xs text-emerald-700 font-semibold">Detail</span>
                </div>

                {tradingPositions.length > 0 ? (
                  <div className="space-y-2.5">
                    {tradingPositions.slice(0, 3).map((pos, idx) => (
                      <div key={pos.id || idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{pos.symbol}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              pos.type === 'BUY' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {pos.type} {pos.volume}
                            </span>
                          </div>
                          <span className={`text-xs font-bold ${Number(pos.profit) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {Number(pos.profit) >= 0 ? '+' : ''}{formatUSD(pos.profit)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Tidak ada posisi trading terbuka saat ini.
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Pembaruan:
                </span>
                <span>{new Date(tradingAcc?.last_synced_at || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
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
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">Daftar Akun Terdaftar</h3>
              <p className="text-xs text-slate-500">Total {accounts.length} akun aktif dan terintegrasi</p>
            </div>
            <span className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">
              <Plus className="w-4 h-4" />
              <span>Tambah Akun</span>
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
          {/* Action buttons bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg shrink-0">
              <ScanLine className="w-4 h-4" />
              <span>Scan Bukti</span>
            </span>
            <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg shrink-0">
              <UploadCloud className="w-4 h-4 text-slate-600" />
              <span>Impor CSV</span>
            </span>
            <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg shrink-0">
              <Download className="w-4 h-4 text-slate-600" />
              <span>Ekspor JSON</span>
            </span>
            <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg shrink-0">
              <FileJson className="w-4 h-4 text-slate-600" />
              <span>Impor JSON</span>
            </span>
            <span className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg shrink-0">
              <Plus className="w-4 h-4" />
              <span>Catat Transaksi</span>
            </span>
          </div>

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
            {transactions.slice(0, 6).map((tx, idx) => {
              const txType = (tx.transaction_type || tx.type || 'expense').toLowerCase();
              const txDate = tx.transaction_date || tx.date || '';
              const isIncome = txType === 'income';
              const isTransfer = txType === 'transfer';
              return (
                <div key={tx.id || idx} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isIncome ? 'bg-emerald-50 text-emerald-600' : isTransfer ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {isIncome ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{tx.description || tx.notes || 'Transaksi'}</div>
                      <div className="text-[10px] text-slate-400">
                        {txDate ? `${new Date(txDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} • ` : ''}{txType}
                      </div>
                    </div>
                  </div>
                  <div className={`text-xs font-extrabold ${isIncome ? 'text-emerald-600' : isTransfer ? 'text-blue-600' : 'text-slate-900'}`}>
                    {isIncome ? '+' : isTransfer ? '' : '-'}{formatIDR(tx.amount)}
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

  // 5. TRADING PREVIEW (Identik dengan src/app/trading/page.jsx)
  if (path === '/trading') {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pointer-events-none select-none pb-16 md:pb-8">
        <main className="flex-1 p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Account Meta Bar (Putih Elegan) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
                <CandlestickChart className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">{tradingAcc?.broker || 'Exness Terminal'}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                    Read-Only MT5 API
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-1">
                  <span>Login: {tradingAcc?.mt5_login || '******'}</span>
                  <span>•</span>
                  <span>Server: {tradingAcc?.server || 'Terminal'}</span>
                  <span>•</span>
                  <span>Leverage: 1:{tradingAcc?.leverage || 100}</span>
                  <span>•</span>
                  <span>Currency: USD</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg shadow-xs">
                <Clock className="w-3.5 h-3.5" />
                <span>Sinkron MT5 Sekarang</span>
              </span>
            </div>
          </div>

          {/* 6 Key Financial Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-[11px] text-slate-500 font-medium">Balance</span>
              <div className="text-base sm:text-lg font-bold text-slate-900 mt-1">{formatUSD(tradingAcc?.balance || 0)}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-[11px] text-slate-500 font-medium">Equity</span>
              <div className="text-base sm:text-lg font-bold text-emerald-600 mt-1">{formatUSD(tradingAcc?.equity || 0)}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-[11px] text-slate-500 font-medium">Floating P&L</span>
              <div className={`text-base sm:text-lg font-bold mt-1 ${tradingFloatingProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {tradingFloatingProfit >= 0 ? '+' : ''}{formatUSD(tradingFloatingProfit)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-[11px] text-slate-500 font-medium">Margin Dipakai</span>
              <div className="text-base sm:text-lg font-bold text-slate-700 mt-1">{formatUSD(tradingAcc?.margin || 0)}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-[11px] text-slate-500 font-medium">Free Margin</span>
              <div className="text-base sm:text-lg font-bold text-slate-900 mt-1">{formatUSD(tradingAcc?.free_margin || 0)}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-[11px] text-slate-500 font-medium">Margin Level</span>
              <div className="text-base sm:text-lg font-bold text-emerald-700 mt-1">
                {tradingAcc?.margin_level ? `${Number(tradingAcc.margin_level).toFixed(0)}%` : '0%'}
              </div>
            </div>
          </div>

          {/* Open Positions Card */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  <span>Posisi Trading Aktif (Open Positions)</span>
                </h3>
                <p className="text-xs text-slate-500">Total {tradingPositions.length} posisi aktif di pasar</p>
              </div>
            </div>
            <div className="space-y-3 p-4">
              {tradingPositions.map((pos, idx) => {
                const posType = String(pos.type || 'buy').toLowerCase();
                const isBuy = posType === 'buy' || posType === '0';
                const profitNum = Number(pos.profit) || 0;
                return (
                  <div key={pos.ticket || pos.id || idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${isBuy ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {isBuy ? 'BUY' : 'SELL'}
                      </span>
                      <span className="text-xs font-bold text-slate-900">{pos.symbol || 'SYMBOL'}</span>
                      <span className="text-[11px] text-slate-500">{pos.lots ?? pos.volume ?? 0} lots</span>
                    </div>
                    <div className={`text-xs font-bold ${profitNum >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {profitNum >= 0 ? '+' : ''}{formatUSD(profitNum)}
                    </div>
                  </div>
                );
              })}
              {tradingPositions.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">Tidak ada posisi trading terbuka saat ini.</div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 6. SETTINGS PREVIEW
  if (path === '/settings') {
    return (
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pointer-events-none select-none pb-16 md:pb-8">
        <main className="flex-1 p-4 sm:p-8 space-y-6 max-w-5xl w-full mx-auto">
          {/* Brankas Terenkripsi Lokal */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Brankas Terenkripsi Lokal (Private Local Vault)</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Aktif
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enkripsi AES-256-GCM terotentikasi di sisi klien dengan turunan kunci PBKDF2-SHA256 (600.000 iterasi).
                </p>
              </div>
            </div>
          </div>

          {/* Preferensi Umum */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Preferensi Aplikasi</h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Mata Uang Utama:</span>
                <span className="font-semibold text-slate-800">IDR (Rupiah)</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Kurs Konversi USD/IDR:</span>
                <span className="font-semibold text-slate-800">Rp {usdRate.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 7. REPORTS PREVIEW (Identik dengan src/app/reports/page.jsx)
  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen pointer-events-none select-none pb-16 md:pb-8">
      <main className="flex-1 p-4 sm:p-8 space-y-6 max-w-7xl w-full mx-auto">
        {/* Header Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-medium">Semua Periode</span>
            <span className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-medium">Semua Akun</span>
          </div>
          <span className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg shadow-xs">
            <Download className="w-4 h-4" />
            <span>Ekspor Laporan (CSV)</span>
          </span>
        </div>

        {/* Top 3 Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <span className="text-xs font-medium text-slate-500">Total Akumulasi Pemasukan</span>
            <div className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1">
              +{formatIDR(allTimeIncome)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">Termasuk Mayar, Gaji, dan Trading MT5</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <span className="text-xs font-medium text-slate-500">Total Akumulasi Pengeluaran</span>
            <div className="text-xl sm:text-2xl font-bold text-rose-600 mt-1">
              -{formatIDR(allTimeExpense)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">Pengeluaran pribadi & operasional</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <span className="text-xs font-medium text-slate-500">Net Surplus Tabungan Bersih</span>
            <div className={`text-xl sm:text-2xl font-bold mt-1 ${allTimeIncome - allTimeExpense >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
              {formatIDR(allTimeIncome - allTimeExpense)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">Selisih pemasukan dan pengeluaran</p>
          </div>
        </div>

        {/* Breakdown by Category & Arus Kas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Rincian Transaksi per Kategori</h3>
            <p className="text-xs text-slate-500 mb-5">Pengelompokan dana berdasarkan pos pengeluaran dan pemasukan</p>
            <div className="space-y-4">
              {topCategories.map(([name, amount], idx) => (
                <div key={name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-700 font-semibold">{name}</span>
                    <span className="font-bold text-slate-900">{formatIDR(amount)}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{ width: `${allTimeExpense > 0 ? Math.min(100, Math.round((amount / allTimeExpense) * 100)) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {topCategories.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-xs">Belum ada data pengeluaran.</div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Struktur Arus Kas</h3>
              <p className="text-xs text-slate-500 mb-4">Perbandingan proporsi pemasukan versus pengeluaran</p>
            </div>
            <div className="h-44 flex items-center justify-center">
              <div className="w-32 h-32 rounded-full border-8 border-emerald-600 border-t-rose-500 flex items-center justify-center text-xs text-slate-400 font-medium">
                Rasio Kas
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100 flex justify-between text-xs font-semibold text-slate-700">
              <span>Arus Bersih:</span>
              <span className={allTimeIncome >= allTimeExpense ? 'text-emerald-700' : 'text-rose-600'}>
                {formatIDR(allTimeIncome - allTimeExpense)}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
});

export default TabPreview;
