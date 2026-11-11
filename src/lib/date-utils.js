/**
 * Utilitas Tanggal & Waktu FigCraft Kayla Finance
 * Zona Waktu Standar: Asia/Jakarta (WIB, UTC+7)
 * Mencegah pergeseran tanggal akibat konversi UTC (Date shifting bug prevention).
 */

/**
 * Daftar nama bulan dalam Bahasa Indonesia
 */
export const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/**
 * Singkatan nama hari dalam Bahasa Indonesia (Minggu s/d Sabtu)
 */
export const INDONESIAN_DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/**
 * Mendapatkan tanggal hari ini dalam format YYYY-MM-DD zona waktu Asia/Jakarta (WIB)
 * @returns {string}
 */
export function getTodayWIB() {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

/**
 * Mem-parsing string tanggal YYYY-MM-DD secara deterministik tanpa konversi UTC
 * @param {string} str
 * @returns {{ year: number, month: number, day: number } | null}
 */
export function parseDateString(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { year: y, month: m - 1, day: d };
}

/**
 * Memformat komponen tahun, bulan (0-11), dan tanggal menjadi YYYY-MM-DD
 * @param {number} year
 * @param {number} monthIndex
 * @param {number} day
 * @returns {string}
 */
export function formatDateString(year, monthIndex, day) {
  const y = String(year).padStart(4, '0');
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Memformat string YYYY-MM-DD menjadi format tampilan yang mudah dibaca (e.g. "09 November 2026")
 * @param {string} str
 * @returns {string}
 */
export function formatDisplayDate(str) {
  const parsed = parseDateString(str);
  if (!parsed) return str || '';
  const { year, month, day } = parsed;
  const dayStr = String(day).padStart(2, '0');
  const monthName = INDONESIAN_MONTHS[month] || '';
  return `${dayStr} ${monthName} ${year}`;
}
