'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Header from '@/components/Header';
import CustomSelect, { SelectOption } from '@/components/CustomSelect';
import { DatabaseSchema } from '@/lib/types';
import { 
  Download, 
  Calendar 
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(amount);
}

const COLORS = ['#059669', '#10b981', '#0284c7', '#6366f1', '#f59e0b', '#ec4899', '#64748b', '#ef4444'];

export default function ReportsPage() {
  const [data, setData] = useState<DatabaseSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>('all');

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/data');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Aggregations
  const stats = useMemo(() => {
    if (!data) return { totalIncome: 0, totalExpense: 0, netSavings: 0, byCategory: [] };

    let totalIncome = 0;
    let totalExpense = 0;
    const catMap: Record<string, { name: string; amount: number; type: string }> = {};

    const filtered = data.transactions.filter(tx => {
      if (period === 'all') return true;
      const txDate = new Date(tx.transaction_date);
      const now = new Date();
      if (period === 'this_month') {
        return txDate.getFullYear() === now.getFullYear() && txDate.getMonth() === now.getMonth();
      }
      if (period === 'last_month') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return txDate.getFullYear() === lastMonth.getFullYear() && txDate.getMonth() === lastMonth.getMonth();
      }
      if (period === 'this_year') {
        return txDate.getFullYear() === now.getFullYear();
      }
      return true;
    });

    filtered.forEach(tx => {
      const isIncome = tx.transaction_type === 'income' || tx.transaction_type === 'trading';
      const isExpense = tx.transaction_type === 'expense';
      const acc = data.accounts.find(a => a.id === tx.account_id);
      const rate = acc?.currency === 'USD' ? 16000 : 1;
      const amountIDR = tx.amount * rate;

      if (isIncome) totalIncome += amountIDR;
      if (isExpense) totalExpense += amountIDR;

      if (tx.category_id) {
        const cat = data.categories.find(c => c.id === tx.category_id);
        const catName = cat?.name || 'Lain-lain';
        if (!catMap[catName]) {
          catMap[catName] = { name: catName, amount: 0, type: tx.transaction_type };
        }
        catMap[catName].amount += amountIDR;
      }
    });

    const byCategory = Object.values(catMap).sort((a, b) => b.amount - a.amount);

    return {
      totalIncome,
      totalExpense,
      netSavings: totalIncome - totalExpense,
      byCategory,
    };
  }, [data, period]);

  // CSV Export function
  const exportToCSV = () => {
    if (!data?.transactions) return;
    const headers = ['ID', 'Tanggal', 'Akun', 'Jenis', 'Nominal', 'Deskripsi', 'Kategori', 'Sumber', 'Catatan'];
    const rows = data.transactions.map(t => {
      const acc = data.accounts.find(a => a.id === t.account_id);
      const cat = data.categories.find(c => c.id === t.category_id);
      return [
        t.id,
        new Date(t.transaction_date).toISOString().split('T')[0],
        `"${acc?.name || t.account_id}"`,
        t.transaction_type,
        t.amount,
        `"${t.description.replace(/"/g, '""')}"`,
        `"${cat?.name || ''}"`,
        t.source,
        `"${(t.notes || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `laporan-keuangan-kayla-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 pb-12">
      <Header
        title="Laporan Keuangan & Analisa"
        subtitle="Breakdown arus kas per pos kategori, rasio tabungan, dan ekspor laporan mutasi"
        onRefresh={fetchData}
        isRefreshing={loading}
      />

      <main className="p-4 sm:p-8 space-y-6 max-w-7xl">
        {/* Header Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="w-full sm:w-[220px]">
            <CustomSelect
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'all', label: 'Semua Periode', subLabel: 'Seluruh Data' },
                { value: 'this_month', label: 'Bulan Ini' },
                { value: 'last_month', label: 'Bulan Lalu' },
                { value: 'this_year', label: 'Tahun 2026' },
              ]}
              size="sm"
            />
          </div>

          <button
            onClick={exportToCSV}
            className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs btn-interactive"
          >
            <Download className="w-4 h-4" />
            <span>Ekspor Laporan (CSV)</span>
          </button>
        </div>

        {/* Top 3 Summaries (FigCraft 05_Reports_Desktop) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs card-interactive">
            <span className="text-xs font-medium text-slate-500">Total Akumulasi Pemasukan</span>
            <div className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1">
              +{formatIDR(stats.totalIncome)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">Termasuk Mayar, Gaji, dan Trading MT5</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs card-interactive">
            <span className="text-xs font-medium text-slate-500">Total Akumulasi Pengeluaran</span>
            <div className="text-xl sm:text-2xl font-bold text-rose-600 mt-1">
              -{formatIDR(stats.totalExpense)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">Pengeluaran pribadi & operasional</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs card-interactive">
            <span className="text-xs font-medium text-slate-500">Net Surplus Tabungan Bersih</span>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
              {formatIDR(stats.netSavings)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">Selisih pemasukan dan pengeluaran</p>
          </div>
        </div>

        {/* Breakdown by Category & Pie Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Rincian Transaksi per Kategori</h3>
            <p className="text-xs text-slate-500 mb-5">Pengelompokan dana berdasarkan pos pengeluaran dan pemasukan</p>

            <div className="space-y-4">
              {stats.byCategory.map((cat, idx) => (
                <div key={cat.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-700 font-semibold">{cat.name}</span>
                    <span className="font-bold text-slate-900">{formatIDR(cat.amount)}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ 
                        width: `${Math.min(100, (cat.amount / (stats.totalIncome || 1)) * 100)}%`,
                        backgroundColor: COLORS[idx % COLORS.length]
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Struktur Arus Kas</h3>
              <p className="text-xs text-slate-500 mb-4">Proporsi alokasi pengeluaran dan simpanan</p>
            </div>

            <div className="h-60 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.byCategory.slice(0, 6)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="amount"
                  >
                    {stats.byCategory.slice(0, 6).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(val: any) => [formatIDR(Number(val)), '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-4 border-t border-slate-100 text-xs">
              {stats.byCategory.slice(0, 6).map((item, idx) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                  <span className="text-slate-700 truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
