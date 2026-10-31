import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import SwipeNavigation from '@/components/SwipeNavigation';

export const metadata: Metadata = {
  title: 'Kayla Finance - Personal Finance & Trading Dashboard',
  description: 'Sistem pencatat dan pemantau keuangan pribadi terintegrasi dengan Bank, E-wallet, MT5, dan Mayar.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="bg-slate-50 text-slate-900 flex min-h-screen antialiased">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto pb-16 md:pb-0">
          <SwipeNavigation>
            {children}
          </SwipeNavigation>
        </div>
      </body>
    </html>
  );
}
