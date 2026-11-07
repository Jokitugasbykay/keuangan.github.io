/**
 * Navigasi tab utama Kayla Finance.
 * Urutan alami navigasi: Dashboard -> Transaksi -> Rekening -> Kripto -> Trading MT5 -> Laporan.
 */

export const MAIN_TABS = [
  '/',
  '/transactions',
  '/accounts',
  '/crypto',
  '/trading',
  '/reports',
];

export const TAB_NAMES = {
  '/': 'Dashboard',
  '/transactions': 'Transaksi',
  '/accounts': 'Rekening',
  '/crypto': 'Kripto',
  '/trading': 'Trading MT5',
  '/reports': 'Laporan',
  '/settings': 'Pengaturan',
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

/**
 * Dapatkan indeks tab saat ini dalam navigasi utama.
 * @param {string | null | undefined} rawPath
 * @returns {number} Indeks tab atau -1 jika bukan tab utama
 */
export function getTabIndex(rawPath) {
  const p = normalizePath(rawPath);
  return MAIN_TABS.indexOf(p);
}

/**
 * Dapatkan rute tab berikutnya.
 * @param {string | null | undefined} rawPath
 * @returns {string | null} Rute tab berikutnya atau null jika sudah di tab terakhir
 */
export function getNextTab(rawPath) {
  const idx = getTabIndex(rawPath);
  if (idx !== -1 && idx < MAIN_TABS.length - 1) {
    return MAIN_TABS[idx + 1];
  }
  return null;
}

/**
 * Dapatkan rute tab sebelumnya.
 * @param {string | null | undefined} rawPath
 * @returns {string | null} Rute tab sebelumnya atau null jika sudah di tab pertama
 */
export function getPreviousTab(rawPath) {
  const idx = getTabIndex(rawPath);
  if (idx > 0) {
    return MAIN_TABS[idx - 1];
  }
  return null;
}
