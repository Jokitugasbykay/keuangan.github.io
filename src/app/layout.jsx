import './globals.css';
import Sidebar from '@/components/Sidebar';
import SwipeNavigation from '@/components/SwipeNavigation';

/** @type {import('next').Metadata} */
export const metadata = {
  title: 'Kayla Finance - Personal Finance & Trading Dashboard',
  description: 'Sistem pencatat dan pemantau keuangan pribadi terintegrasi dengan Bank, E-wallet, MT5, dan Mayar.',
};

/**
 * Root Layout untuk Kayla Finance dengan Sidebar navigasi dan gesture swipe horizontal.
 * @param {{ children: React.ReactNode }} props
 * @returns {React.ReactElement}
 */
export default function RootLayout({ children }) {
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
