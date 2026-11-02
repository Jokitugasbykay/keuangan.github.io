/**
 * Navigasi tab utama Kayla Finance.
 * Urutan alami navigasi: Dashboard -> Akun -> Transaksi -> MT5 -> Laporan.
 */

export const MAIN_TABS = [
  '/',
  '/accounts',
  '/transactions',
  '/trading',
  '/reports',
];

export const TAB_NAMES = {
  '/': 'Dashboard',
  '/accounts': 'Akun & Saldo',
  '/transactions': 'Transaksi',
  '/trading': 'MT5 Trading',
  '/reports': 'Laporan',
};

/**
 * Normalisasi pathname agar kompatibel dengan trailingSlash: true dan basePath GitHub Pages.
 * @param {string | null | undefined} rawPath
 * @returns {string} Pathname ternormalisasi tanpa trailing slash (contoh: '/' atau '/accounts')
 */
export function normalizePath(rawPath) {
  if (!rawPath) return '/';
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  let path = rawPath;

  // Hapus basePath jika ada di awal pathname (khusus deployment GitHub Pages)
  if (basePath && path.startsWith(basePath)) {
    path = path.slice(basePath.length);
  }

  // Hapus trailing slash kecuali jika hanya '/'
  path = path.replace(/\/+$/, '');
  return path || '/';
}
