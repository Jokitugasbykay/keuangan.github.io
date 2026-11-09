'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/Logo';
import { normalizePath } from '@/lib/navigation';
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  WalletCards, 
  Coins, 
  CandlestickChart, 
  BarChart3, 
  Settings, 
  ShieldCheck 
} from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Dashboard', shortName: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Transaksi', shortName: 'Transaksi', href: '/transactions', icon: ArrowLeftRight },
  { name: 'Rekening', shortName: 'Rekening', href: '/accounts', icon: WalletCards },
  { name: 'Kripto', shortName: 'Kripto', href: '/crypto', icon: Coins },
  { name: 'Trading MT5', shortName: 'Trading', href: '/trading', icon: CandlestickChart },
  { name: 'Laporan', shortName: 'Laporan', href: '/reports', icon: BarChart3 },
  { name: 'Pengaturan', shortName: 'Setelan', href: '/settings', icon: Settings },
];

/**
 * Komponen navigasi samping (desktop) dan bilah navigasi bawah (mobile).
 * @returns {React.ReactElement}
 */
export default function Sidebar() {
  const pathname = usePathname();
  const currentPath = normalizePath(pathname);
  const [swipeTarget, setSwipeTarget] = useState(null);

  useEffect(() => {
    const onSwipeTarget = (event) => setSwipeTarget(event.detail || null);
    window.addEventListener('kayla:swipe-route', onSwipeTarget);
    return () => window.removeEventListener('kayla:swipe-route', onSwipeTarget);
  }, []);

  useEffect(() => setSwipeTarget(null), [currentPath]);
  const displayedPath = swipeTarget || currentPath;

  // Sembunyikan seluruh sidebar desktop dan navigasi mobile saat berada di halaman login
  if (currentPath === '/login' || pathname?.includes('/login')) {
    return null;
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col justify-between shrink-0 h-screen sticky top-0 z-30">
        <div>
          {/* Brand Logo & Title (Twin Pillar K) */}
          <div className="h-16 flex items-center px-6 border-b border-slate-200">
            <Link href="/" prefetch={false} className="hover:opacity-95 transition-opacity">
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
              const isActive = displayedPath === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  prefetch={false}
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
      <nav 
        aria-label="Navigasi Bawah Mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 h-16 flex items-center justify-between px-1.5 sm:px-2 shadow-lg select-none"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = displayedPath === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              prefetch={false}
              className={`flex-1 flex flex-col items-center justify-center py-1 px-0.5 min-w-0 text-[9.5px] sm:text-[10px] font-medium transition-all duration-150 active:scale-95 ${
                isActive ? 'text-emerald-700 font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 mb-0.5 sm:mb-1 shrink-0 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="truncate w-full text-center leading-tight">{item.shortName || item.name}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
