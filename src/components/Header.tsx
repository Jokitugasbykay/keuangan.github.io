'use client';

import React from 'react';
import Link from 'next/link';
import { PlusCircle, UploadCloud, RefreshCw } from 'lucide-react';
import { LogoIcon } from '@/components/Logo';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function Header({ title, subtitle, onRefresh, isRefreshing }: HeaderProps) {
  return (
    <header className="h-16 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-4 sm:px-8 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-2.5">
        <Link href="/" className="md:hidden flex items-center" title="Kayla Finance">
          <LogoIcon size={26} />
        </Link>
        <div>
          {title && <h2 className="text-sm sm:text-lg font-bold text-slate-900 tracking-tight">{title}</h2>}
          {subtitle && <p className="text-[11px] sm:text-xs text-slate-500 hidden sm:block">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-xs btn-interactive"
            title="Segarkan Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>
        )}

        <Link
          href="/transactions"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors btn-interactive"
        >
          <UploadCloud className="w-3.5 h-3.5 text-slate-600" />
          <span>Impor Mutasi</span>
        </Link>

        <Link
          href="/transactions?action=new"
          className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs btn-interactive"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Tambah Transaksi</span>
        </Link>
      </div>
    </header>
  );
}
