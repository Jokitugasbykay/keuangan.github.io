import './globals.css';
import Sidebar from '@/components/Sidebar';
import SwipeNavigation from '@/components/SwipeNavigation';

/** @type {import('next').Metadata} */
export const metadata = {
  title: 'Kayla Finance - Personal Finance & Trading Dashboard',
  description: 'Sistem pencatat dan pemantau keuangan pribadi terintegrasi dengan Bank, E-wallet, MT5, dan Mayar.',
};

/** @type {import('next').Viewport} */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

/**
 * Root Layout untuk Kayla Finance dengan Sidebar navigasi dan gesture swipe horizontal.
 * @param {{ children: React.ReactNode }} props
 * @returns {React.ReactElement}
 */
export default function RootLayout({ children }) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="bg-slate-50 text-slate-900 flex min-h-full w-full max-w-full antialiased overflow-x-hidden select-none sm:select-auto">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 w-full overflow-y-auto overflow-x-hidden pb-16 md:pb-0 [scrollbar-gutter:auto] md:[scrollbar-gutter:stable]">
          <SwipeNavigation>
            {children}
          </SwipeNavigation>
        </div>
      </body>
    </html>
  );
}
