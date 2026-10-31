'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/Logo';
import { 
  LayoutDashboard, 
  WalletCards, 
  ArrowLeftRight, 
  CandlestickChart, 
  BarChart3, 
  Settings, 
  ShieldCheck 
} from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Akun & Saldo', href: '/accounts', icon: WalletCards },
  { name: 'Transaksi', href: '/transactions', icon: ArrowLeftRight },
  { name: 'Trading MT5', href: '/trading', icon: CandlestickChart },
  { name: 'Laporan', href: '/reports', icon: BarChart3 },
  { name: 'Pengaturan', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col justify-between shrink-0 h-screen sticky top-0 z-30">
        <div>
          {/* Brand Logo & Title (Twin Pillar K) */}
          <div className="h-16 flex items-center px-6 border-b border-slate-200">
            <Link href="/" className="hover:opacity-95 transition-opacity">
              <Logo size={32} showSubtitle={true} />
            </Link>
          </div>

          {/* Nav Items */}
          <nav className="p-4 space-y-1">
            <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              Menu Utama
            </div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 active:scale-[0.99] ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-800 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-700' : 'text-slate-500'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* System Status Card */}
        <div className="p-4 border-t border-slate-200">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Sistem Aktif
              </span>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Penyimpanan lokal di data/db.json. MT5 & Mayar terintegrasi.
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar (FigCraft 07_Dashboard_Mobile) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 h-16 flex items-center justify-around px-2 shadow-lg">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-3 text-[10px] font-medium transition-all duration-150 active:scale-95 ${
                isActive ? 'text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 mb-1 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span>{item.name.replace(' & Saldo', '').replace('Trading ', '')}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
