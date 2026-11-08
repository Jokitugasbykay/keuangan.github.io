'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlusCircle, UploadCloud, RefreshCw, Coins } from 'lucide-react';
import { LogoIcon } from '@/components/Logo';
import { normalizePath } from '@/lib/navigation';
import { loadDatabase } from '@/lib/client-data';

/**
 * Metadata default per rute aplikasi Kayla Finance
 */
const PAGE_META = {
  '/': {
    title: 'Dashboard Keuangan',
    subtitle: 'Ringkasan posisi aset, arus kas, dan performa trading MT5 terkini',
  },
  '/transactions': {
    title: 'Riwayat & Pencatatan Transaksi',
    subtitle: 'Pencatatan manual, filter multi-akun, dan parser mutasi CSV/Excel',
  },
  '/accounts': {
    title: 'Akun & Saldo Keuangan',
    subtitle: 'Manajemen rekening bank, e-wallet, payment gateway, dan MT5',
  },
  '/crypto': {
    title: 'Portofolio Kripto',
    subtitle: 'Pemantauan aset digital kripto, saldo koin, dan valuasi portofolio real-time',
  },
  '/trading': {
    title: 'MetaTrader 5 (MT5) Dashboard',
    subtitle: 'Pemantauan posisi aktif, ekuitas, dan riwayat deal trading Kaystrade',
  },
  '/reports': {
    title: 'Laporan Keuangan & Analisa',
    subtitle: 'Breakdown arus kas per pos kategori, rasio tabungan, dan ekspor laporan mutasi',
  },
  '/settings': {
    title: 'Pengaturan Sistem',
    subtitle: 'Preferensi aplikasi, backup otomatis, dan manajemen kategori data',
  },
};

/**
 * @typedef {Object} HeaderProps
 * @property {string} [title]
 * @property {string} [subtitle]
 * @property {() => void} [onRefresh]
 * @property {boolean} [isRefreshing=false]
 * @property {string | null} [routeOverride]
 */

/**
 * Komponen Header statis aplikasi Kayla Finance.
 * Ditempatkan pada Application Shell di luar viewport gesture sehingga posisinya
 * selalu stabil di bagian atas layar dan tidak pernah ikut bergeser secara horizontal.
 * 
 * @param {HeaderProps} props
 * @returns {React.ReactElement}
 */
export default function Header({ title, subtitle, onRefresh, isRefreshing = false, routeOverride = null }) {
  const pathname = usePathname();
  const currentPath = normalizePath(routeOverride || pathname);
  const currentMeta = PAGE_META[currentPath] || PAGE_META['/'];
  const displayTitle = title || currentMeta.title;
  const displaySubtitle = subtitle || currentMeta.subtitle;

  const [localRefreshing, setLocalRefreshing] = useState(false);
  const activeRefreshing = isRefreshing || localRefreshing;

  const handleRefreshClick = async () => {
    if (activeRefreshing) return;
    if (onRefresh) {
      onRefresh();
      return;
    }
    setLocalRefreshing(true);
    try {
      await loadDatabase();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('kayla_db_updated'));
      }
    } catch {}
    setTimeout(() => {
      setLocalRefreshing(false);
    }, 600);
  };

  return (
    <header className="h-16 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-4 sm:px-8 flex items-center justify-between sticky top-0 z-20 shrink-0 w-full select-none">
      <div className="flex items-center gap-2.5">
        <Link href="/" prefetch={false} className="md:hidden flex items-center" title="Kayla Finance">
          <LogoIcon size={26} />
        </Link>
        <div>
          <h2 className="text-sm sm:text-lg font-bold text-slate-900 tracking-tight transition-opacity duration-150">
            {displayTitle}
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block">
            {displaySubtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={handleRefreshClick}
          disabled={activeRefreshing}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-xs btn-interactive"
          title="Segarkan Data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${activeRefreshing ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
          <span className="hidden sm:inline">Segarkan</span>
        </button>

        <Link
          href="/crypto"
          prefetch={false}
          className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors shadow-xs btn-interactive ${
            currentPath === '/crypto'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold'
              : 'text-slate-700 bg-slate-50 border-slate-200 hover:bg-slate-100'
          }`}
          title="Portofolio Kripto"
        >
          <Coins className={`w-3.5 h-3.5 ${currentPath === '/crypto' ? 'text-emerald-700' : 'text-emerald-600'}`} />
          <span>Kripto</span>
        </Link>

        <Link
          href="/transactions"
          prefetch={false}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors btn-interactive"
        >
          <UploadCloud className="w-3.5 h-3.5 text-slate-600" />
          <span>Impor Mutasi</span>
        </Link>

        <Link
          href="/transactions?action=new"
          prefetch={false}
          className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs btn-interactive"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Tambah Transaksi</span>
        </Link>
      </div>
    </header>
  );
}
