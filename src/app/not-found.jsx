'use client';

import React from 'react';
import Link from 'next/link';
import { Home } from 'lucide-react';
import Logo from '@/components/Logo';

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] p-6 text-center select-none">
      <div className="mb-6">
        <Logo size={48} showSubtitle={false} />
      </div>
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-2xl mb-4 border border-emerald-100 shadow-xs">
        404
      </div>
      <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mb-2">
        Halaman Tidak Ditemukan
      </h1>
      <p className="text-xs sm:text-sm text-slate-500 max-w-sm mb-6 leading-relaxed">
        Halaman yang Anda tuju tidak tersedia atau telah dipindahkan ke navigasi lain.
      </p>
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-xs btn-interactive"
        >
          <Home className="w-4 h-4" />
          <span>Kembali ke Dashboard</span>
        </Link>
      </div>
    </div>
  );
}
