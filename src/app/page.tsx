'use client';

import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import { DatabaseSchema } from '@/lib/types';
import { loadDatabase } from '@/lib/client-data';
import { 
  TrendingUp, 
  Wallet, 
  CandlestickChart, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Layers, 
  Clock, 
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import Link from 'next/link';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';

const USD_RATE = 16000;

function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(amount);
}

function formatUSD(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount);
}

const PIE_COLORS = ['#059669', '#10b981', '#0284c7', '#6366f1', '#f59e0b', '#64748b'];

export default function DashboardPage() {
  const [data, setData] = useState<DatabaseSchema | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const json = await loadDatabase();
      if (json) setData(json);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex-1 flex flex-col bg-slate-50">
        <Header title="Dashboard Keuangan" subtitle="Memuat data..." />
        <div className="p-8 flex items-center justify-center flex-1">
          <div className="text-slate-500 text-xs animate-pulse">Memuat data keuangan Kayla Finance...</div>
        </div>
      </div>
    );
  }

  // Calculate Totals
  const tradingAcc = data.trading_accounts[0];
  const tradingBalanceIDR = tradingAcc ? tradingAcc.balance * USD_RATE : 0;
  const tradingFloatingIDR = tradingAcc ? tradingAcc.floating_profit * USD_RATE : 0;

  let totalBankEwallet = 0;
  let totalMayar = 0;

  data.accounts.forEach(acc => {
    if (acc.account_type === 'bank' || acc.account_type === 'ewallet') {
      totalBankEwallet += acc.current_balance;
    } else if (acc.account_type === 'payment_gateway') {
      totalMayar += acc.current_balance;
    }
  });

  const netWorthIDR = totalBankEwallet + totalMayar + tradingBalanceIDR + tradingFloatingIDR;

  // Monthly income & expense (Current Month)
  let monthlyIncome = 0;
  let monthlyExpense = 0;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  data.transactions.forEach(t => {
    const txDate = new Date(t.transaction_date);
    const isCurrentMonth = !isNaN(txDate.getTime()) && txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth;
    if (!isCurrentMonth) return;

    if (t.transaction_type === 'income' || t.transaction_type === 'trading') {
      const isUSD = data.accounts.find(a => a.id === t.account_id)?.currency === 'USD';
      monthlyIncome += isUSD ? t.amount * USD_RATE : t.amount;
    } else if (t.transaction_type === 'expense') {
      const isUSD = data.accounts.find(a => a.id === t.account_id)?.currency === 'USD';
      monthlyExpense += isUSD ? t.amount * USD_RATE : t.amount;
    }
  });

  // Chart data: Distribution by Account
  const distributionData = data.accounts.map(acc => {
    const val = acc.currency === 'USD' ? acc.current_balance * USD_RATE : acc.current_balance;
    return {
      name: acc.provider,
      value: Math.max(0, val)
    };
  });

  // Monthly Cashflow data for Bar Chart
  const cashflowData = [
    { bulan: 'Mei', Masuk: 19500000, Keluar: 8200000 },
    { bulan: 'Jun', Masuk: 22100000, Keluar: 9500000 },
    { bulan: 'Jul', Masuk: 18400000, Keluar: 7800000 },
    { bulan: 'Agu', Masuk: 26800000, Keluar: 11200000 },
    { bulan: 'Sep', Masuk: 24500000, Keluar: 9400000 },
    { bulan: 'Okt', Masuk: monthlyIncome, Keluar: monthlyExpense },
  ];

  return (
    <div className="flex-1 flex flex-col bg-slate-50 pb-12">
      <Header 
        title="Dashboard Keuangan" 
        subtitle="Ringkasan posisi aset, arus kas, dan performa trading MT5 terkini" 
        onRefresh={fetchData}
        isRefreshing={loading}
      />

      <main className="p-4 sm:p-8 space-y-6 max-w-7xl">
        {/* Top Metric Cards (FigCraft 01_Dashboard_Desktop) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Net Worth */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between card-interactive">
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

          {/* Card 2: Liquid Cash */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between card-interactive">
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
                Mandiri, blu, BTN, & GoPay
              </div>
            </div>
          </div>

          {/* Card 3: Monthly Cashflow */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between card-interactive">
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

          {/* Card 4: MT5 Trading Snapshot */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between card-interactive">
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
                <span className={`font-semibold ${tradingAcc && tradingAcc.floating_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  Floating: {tradingAcc && tradingAcc.floating_profit >= 0 ? '+' : ''}{formatUSD(tradingAcc?.floating_profit || 0)}
                </span>
                <span className="text-slate-500">({tradingAcc?.positions.length || 0} Posisi)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bar Chart: Cash Flow Trend */}
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

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashflowData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <XAxis dataKey="bulan" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={11} 
                    tickLine={false}
                    tickFormatter={(val) => `${(val / 1000000).toFixed(0)}jt`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(val: any) => [formatIDR(Number(val)), '']}
                  />
                  <Bar dataKey="Masuk" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Keluar" fill="#e11d48" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Donut Chart: Asset Distribution */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Distribusi Saldo Aset</h3>
              <p className="text-xs text-slate-500 mb-4">Alokasi dana per akun terdaftar</p>
            </div>

            <div className="h-44 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(val: any) => [formatIDR(Number(val)), '']}
                  />
                </PieChart>
              </ResponsiveContainer>
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

        {/* Lower Row: Recent Transactions & MT5 Open Positions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Transactions List */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Transaksi Terbaru</h3>
                <p className="text-xs text-slate-500">Mutasi keuangan yang baru saja dicatat sistem</p>
              </div>
              <Link 
                href="/transactions" 
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                Lihat Semua
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {data.transactions.slice(0, 5).map((tx) => {
                const acc = data.accounts.find(a => a.id === tx.account_id);
                const isUSD = acc?.currency === 'USD';
                const isIncome = tx.transaction_type === 'income' || tx.transaction_type === 'trading';

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
                          <span>{new Date(tx.transaction_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                          {tx.source !== 'manual' && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-[10px] text-slate-600 font-semibold uppercase">
                              {tx.source}
                            </span>
                          )}
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
          </div>

          {/* MT5 Active Positions Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <CandlestickChart className="w-4 h-4 text-emerald-600" />
                    Posisi MT5 Terbuka
                  </h3>
                  <p className="text-xs text-slate-500">{tradingAcc?.broker || 'Exness'} • 2 Posisi Aktif</p>
                </div>
                <Link
                  href="/trading"
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold"
                >
                  Detail
                </Link>
              </div>

              {tradingAcc && tradingAcc.positions.length > 0 ? (
                <div className="space-y-2.5">
                  {tradingAcc.positions.map((pos) => (
                    <div key={pos.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{pos.symbol}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            pos.type === 'BUY' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {pos.type} {pos.volume}
                          </span>
                        </div>
                        <span className={`text-xs font-bold ${pos.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {pos.profit >= 0 ? '+' : ''}{formatUSD(pos.profit)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5">
                        <span>Entry: {pos.open_price}</span>
                        <span>Now: {pos.current_price}</span>
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
