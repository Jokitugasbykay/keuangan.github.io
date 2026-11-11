/**
 * @file Mesin Parser Bukti Struk Belanja & Faktur (Receipt Parser Engine)
 * Kayla Finance - Modul Cerdas Ekstraksi dan Kategorisasi Struk Belanja
 *
 * Aturan Sistem:
 * - Tidak menggunakan em dash atau en dash. Gunakan tanda minus biasa (-).
 * - Tidak menggunakan emoticon atau emoji.
 * - Kompatibel di browser dan Node.js.
 */

import crypto from 'crypto';

// ============================================================================
// 1. KATEGORI STRUK BELANJA & PEMETAAN KATEGORI RESMI
// ============================================================================

export const RECEIPT_CATEGORIES = Object.freeze({
  GROCERIES: 'Groceries / Belanja Harian',
  FNB: 'Makanan & Minuman (F&B)',
  HEALTH_BEAUTY: 'Kesehatan & Kecantikan',
  HOUSEHOLD: 'Kebutuhan Rumah Tangga',
  OTHER: 'Lain-lain / Hiburan',
});

export const CATEGORY_ID_MAP = Object.freeze({
  [RECEIPT_CATEGORIES.GROCERIES]: 'cat-exp-shopping',
  [RECEIPT_CATEGORIES.FNB]: 'cat-exp-food',
  [RECEIPT_CATEGORIES.HEALTH_BEAUTY]: 'cat-exp-shopping',
  [RECEIPT_CATEGORIES.HOUSEHOLD]: 'cat-exp-shopping',
  [RECEIPT_CATEGORIES.OTHER]: 'cat-exp-entertainment',
});

const INDO_MONTHS = {
  januari: 1, jan: 1, februari: 2, feb: 2, maret: 3, mar: 3,
  april: 4, apr: 4, mei: 5, may: 5, juni: 6, jun: 6,
  juli: 7, jul: 7, agustus: 8, agu: 8, ags: 8, aug: 8,
  september: 9, sep: 9, oktober: 10, okt: 10, oct: 10,
  november: 11, nov: 11, desember: 12, des: 12, dec: 12,
};

const KNOWN_MERCHANTS = [
  { pattern: /indomaret/i, name: 'Indomaret', defaultCategory: RECEIPT_CATEGORIES.GROCERIES },
  { pattern: /alfamidi/i, name: 'Alfamidi', defaultCategory: RECEIPT_CATEGORIES.GROCERIES },
  { pattern: /alfamart/i, name: 'Alfamart', defaultCategory: RECEIPT_CATEGORIES.GROCERIES },
  { pattern: /super\s*indo/i, name: 'Superindo', defaultCategory: RECEIPT_CATEGORIES.GROCERIES },
  { pattern: /transmart|carrefour/i, name: 'Transmart', defaultCategory: RECEIPT_CATEGORIES.GROCERIES },
  { pattern: /hypermart/i, name: 'Hypermart', defaultCategory: RECEIPT_CATEGORIES.GROCERIES },
  { pattern: /lotte\s*mart/i, name: 'Lotte Mart', defaultCategory: RECEIPT_CATEGORIES.GROCERIES },
  { pattern: /hero\s*supermarket/i, name: 'Hero Supermarket', defaultCategory: RECEIPT_CATEGORIES.GROCERIES },
  { pattern: /farmers\s*market|ranch\s*market/i, name: 'Farmers Market', defaultCategory: RECEIPT_CATEGORIES.GROCERIES },
  { pattern: /starbucks/i, name: 'Starbucks', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /kopi\s*kenangan/i, name: 'Kopi Kenangan', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /janji\s*jiwa/i, name: 'Janji Jiwa', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /fore\s*coffee/i, name: 'Fore Coffee', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /point\s*coffee/i, name: 'Point Coffee', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /mcdonald|mcd\b/i, name: "McDonald's", defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /kfc|kentucky/i, name: 'KFC', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /pizza\s*hut|phd\b/i, name: 'Pizza Hut', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /burger\s*king/i, name: 'Burger King', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /hokben|hoka/i, name: 'HokBen', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /solaria/i, name: 'Solaria', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /bakmi\s*gm/i, name: 'Bakmi GM', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /subway/i, name: 'Subway', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /yoshinoya/i, name: 'Yoshinoya', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /j\.?co/i, name: 'J.CO Donuts', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /chatime/i, name: 'Chatime', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /mixue/i, name: 'Mixue', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /lawson/i, name: 'Lawson', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /family\s*mart/i, name: 'FamilyMart', defaultCategory: RECEIPT_CATEGORIES.FNB },
  { pattern: /circle\s*k/i, name: 'Circle K', defaultCategory: RECEIPT_CATEGORIES.GROCERIES },
  { pattern: /guardian/i, name: 'Guardian Pharmacy', defaultCategory: RECEIPT_CATEGORIES.HEALTH_BEAUTY },
  { pattern: /watsons/i, name: 'Watsons', defaultCategory: RECEIPT_CATEGORIES.HEALTH_BEAUTY },
  { pattern: /kimia\s*farma/i, name: 'Kimia Farma', defaultCategory: RECEIPT_CATEGORIES.HEALTH_BEAUTY },
  { pattern: /century/i, name: 'Century Pharmacy', defaultCategory: RECEIPT_CATEGORIES.HEALTH_BEAUTY },
  { pattern: /k-?24/i, name: 'Apotek K-24', defaultCategory: RECEIPT_CATEGORIES.HEALTH_BEAUTY },
  { pattern: /ace\s*hardware/i, name: 'Ace Hardware', defaultCategory: RECEIPT_CATEGORIES.HOUSEHOLD },
  { pattern: /gramedia/i, name: 'Gramedia', defaultCategory: RECEIPT_CATEGORIES.OTHER },
  { pattern: /pertamina|spbu/i, name: 'Pertamina SPBU', defaultCategory: RECEIPT_CATEGORIES.OTHER },
  { pattern: /shell/i, name: 'Shell SPBU', defaultCategory: RECEIPT_CATEGORIES.OTHER },
];

// ============================================================================
// 2. UTILITAS NOMINAL & PEMBERSIHAN MATA UANG
// ============================================================================

/**
 * Membersihkan format teks angka Indonesia atau internasional menjadi float.
 * Mendukung angka negatif (diskon -1.739), format akuntansi kurung ((1.739)),
 * serta pemisah ribuan dan desimal konteks Indonesia / internasional.
 * Mendukung format:
 * - 25.000.000 (ribuan titik)
 * - 25,000,000 (ribuan koma)
 * - 25,000,000.00 (ribuan koma, desimal titik)
 * - 25.000.000,00 (ribuan titik, desimal koma)
 * - 17.387 / 1.739 / 15.648
 *
 * @param {string | number} rawVal
 * @returns {number | null}
 */
export function cleanCurrencyAmount(rawVal) {
  if (typeof rawVal === 'number') {
    return isNaN(rawVal) ? null : Math.abs(rawVal);
  }
  if (!rawVal || typeof rawVal !== 'string') return null;

  let s = rawVal.trim();
  if (!s) return null;

  // Format accounting dalam kurung: (1.739) -> 1.739
  const parenMatch = s.match(/^\(([^)]+)\)$/);
  if (parenMatch) {
    s = parenMatch[1].trim();
  }

  // Hapus spasi di antara digit dan pemisah (contoh: '25.000. 000' atau '25,000, 000.00')
  s = s.replace(/(\d)\s+([.,])\s*(\d)/g, '$1$2$3');

  // Hapus simbol mata uang dan karakter non-angka kecuali , . -
  s = s.replace(/[^0-9,.-]/g, '').trim();
  if (!s || s === '-' || s === '.' || s === ',') return null;

  // Catat dan bersihkan tanda minus awalan
  if (s.startsWith('-')) {
    s = s.slice(1).trim();
  }

  // Format dengan koma dan titik: tentukan mana ribuan dan mana desimal
  if (s.includes('.') && s.includes(',')) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Format Indonesia / Eropa: 25.000.000,00
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Format US / Internasional: 25,000,000.00
      s = s.replace(/,/g, '');
    }
  } else if (s.includes('.') && !s.includes(',')) {
    const parts = s.split('.');
    if (parts.length > 2) {
      // 25.000.000 -> ribuan
      s = s.replace(/\./g, '');
    } else if (parts[1].length === 3) {
      // 17.387 -> ribuan
      s = s.replace(/\./g, '');
    } else if (parts[1].length === 2) {
      // 150.00 -> desimal
      // Biarkan titik sebagai desimal standar
    } else {
      s = s.replace(/\./g, '');
    }
  } else if (s.includes(',') && !s.includes('.')) {
    const parts = s.split(',');
    if (parts.length > 2) {
      // 25,000,000 -> ribuan
      s = s.replace(/,/g, '');
    } else if (parts[1].length === 3) {
      // 17,387 -> ribuan
      s = s.replace(/,/g, '');
    } else if (parts[1].length === 2) {
      // 150,00 -> desimal
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }

  const val = parseFloat(s);
  return (!isNaN(val) && val >= 0) ? Math.abs(val) : null;
}

/**
 * Mengekstrak nilai persentase numerik (contoh: '10%' -> 10, '10.00%' -> 10, '10,00%' -> 10).
 * @param {string | number} rawVal
 * @returns {number | null}
 */
export function cleanPercentage(rawVal) {
  if (typeof rawVal === 'number') {
    return isNaN(rawVal) || rawVal < 0 ? null : rawVal;
  }
  if (!rawVal || typeof rawVal !== 'string') return null;
  const match = rawVal.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (match) {
    const numStr = match[1].replace(',', '.');
    const p = parseFloat(numStr);
    return (!isNaN(p) && p >= 0 && p <= 100) ? p : null;
  }
  return null;
}

// ============================================================================
// 3. KATEGORISASI ITEM BELANJA
// ============================================================================

const ITEM_CATEGORY_KEYWORDS = [
  {
    category: RECEIPT_CATEGORIES.GROCERIES,
    keywords: [
      'indomie', 'sedaap', 'sarimi', 'beras', 'minyak goreng', 'minyak', 'gula pasir',
      'gulaku', 'gula merah', 'bayam', 'pisang', 'daging ayam', 'daging sapi', 'daging',
      'sayur', 'buah', 'telur', 'sunco', 'bimoli', 'filma', 'ultra milk', 'aqua',
      'le minerale', 'air mineral', 'kecap', 'saus', 'garam', 'bumbu',
    ],
  },
  {
    category: RECEIPT_CATEGORIES.FNB,
    keywords: [
      'kopi', 'coffee', 'latte', 'macchiato', 'croissant', 'toast', 'burger', 'flurry',
      'pa-nas', 'perkedel', 'ayam', 'nasi', 'mie', 'noodle', 'tea', 'teh', 'boba', 'cake',
      'roti', 'snack', 'chitato', 'chiki', 'soda', 'coca', 'fanta', 'sprite', 'juice', 'jus',
      'minuman', 'makanan', 'pizza', 'donut', 'sari roti',
    ],
  },
  {
    category: RECEIPT_CATEGORIES.HEALTH_BEAUTY,
    keywords: [
      'hansaplast', 'aqua protect', 'plaster', 'perban', 'betadine', 'antiseptik', 'kasa', 'kapas',
      'paracetamol', 'panadol', 'bodrex', 'tolak angin', 'obat', 'vitamin', 'suplemen', 'masker',
      'lifebuoy', 'dettol', 'biore', 'shampoo', 'sabun', 'soap', 'pasta gigi', 'pepsodent',
      'sensodyne', 'sunscreen', 'skincare', 'garnier', 'wardah', 'facial', 'lotion',
    ],
  },
  {
    category: RECEIPT_CATEGORIES.HOUSEHOLD,
    keywords: [
      'sunlight', 'mama lemon', 'rinso', 'daia', 'downy', 'molto', 'softergent',
      'soklin', 'pewangi', 'detergen', 'pembersih', 'super pell', 'baygon', 'hit',
      'tissue', 'tisu', 'lampu', 'baterai',
    ],
  },
];

/**
 * Mengategorikan nama item belanja ke salah satu dari 5 kategori Kayla Finance.
 * @param {string} itemName
 * @returns {{ category: string; category_id: string }}
 */
export function categorizeItem(itemName = '') {
  const text = (itemName || '').toLowerCase();

  for (const group of ITEM_CATEGORY_KEYWORDS) {
    for (const kw of group.keywords) {
      if (text.includes(kw)) {
        return {
          category: group.category,
          category_id: CATEGORY_ID_MAP[group.category],
        };
      }
    }
  }

  // Fallback ke OTHER
  return {
    category: RECEIPT_CATEGORIES.OTHER,
    category_id: CATEGORY_ID_MAP[RECEIPT_CATEGORIES.OTHER],
  };
}

// ============================================================================
// 4. EKSTRAKSI TANGGAL & WAKTU
// ============================================================================

/**
 * Mengekstrak tanggal (YYYY-MM-DD) dan waktu (HH:MM[:SS]) dari teks struk.
 * @param {string} text
 * @returns {{ date: string | null; time: string | null }}
 */
export function extractDateTime(text = '') {
  if (!text) return { date: null, time: null };

  let date = null;
  let time = null;

  // 1. Ekstraksi Waktu: HH:MM:SS atau HH:MM
  const timeMatch = text.match(/\b([012]?\d:[0-5]\d(?::[0-5]\d)?)\b/);
  if (timeMatch) {
    time = timeMatch[1];
  }

  // 2. Format tanggal teks Indonesia: 06 November 2026 atau 6 Nov 2026
  const monthNames = Object.keys(INDO_MONTHS).join('|');
  const indDateRegex = new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})\\s+(\\d{4}|\\d{2})\\b`, 'i');
  const indMatch = text.match(indDateRegex);
  if (indMatch) {
    const day = parseInt(indMatch[1], 10);
    const month = INDO_MONTHS[indMatch[2].toLowerCase()] || 1;
    let year = parseInt(indMatch[3], 10);
    if (year < 100) year += 2000;
    date = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  // 3. Format DD.MM.YY atau DD.MM.YYYY
  if (!date) {
    const dotMatch = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
    if (dotMatch) {
      let day = parseInt(dotMatch[1], 10);
      let month = parseInt(dotMatch[2], 10);
      let year = parseInt(dotMatch[3], 10);
      if (year < 100) year += 2000;
      date = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }

  // 4. Format DD/MM/YYYY atau DD-MM-YYYY
  if (!date) {
    const slashMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/);
    if (slashMatch) {
      let day = parseInt(slashMatch[1], 10);
      let month = parseInt(slashMatch[2], 10);
      let year = parseInt(slashMatch[3], 10);
      if (year < 100) year += 2000;
      if (month > 12 && day <= 12) {
        const tmp = day;
        day = month;
        month = tmp;
      }
      date = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }

  // 5. Format ISO YYYY-MM-DD
  if (!date) {
    const isoMatch = text.match(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);
      date = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }

  return { date, time };
}

// ============================================================================
// 5. EKSTRAKSI NOMOR STRUK & MERCHANT
// ============================================================================

/**
 * Mengekstrak nomor struk / nomor faktur / ID transaksi.
 * @param {string} text
 * @returns {string | null}
 */
export function extractReceiptNumber(text = '') {
  if (!text) return null;

  const ignoredWords = /^(?:penjualan|pembelian|pajak|restoran|kasir|tanggal|belanja|tunai|debit|kredit|struk|nota|faktur|bon|invoice)$/i;

  const patterns = [
    /(?:no\.?\s*(?:struk|transaksi|resi|bon|order|nota|faktur|bill|ref|referensi)|receipt\s*(?:no|#)|order\s*(?:id|#)|trx\s*id|check|bon|faktur\s*no\.?|invoice\s*no\.?)[:\s]*([A-Za-z0-9\-_/.]{2,32})/i,
    /(?:^|\n)\s*(?:no\.?|nomor|ref|reference)[:\s]+([A-Za-z0-9\-_/.]{2,32})/i,
    /(?:id\s*transaksi|reference\s*no|txid)[:\s]*([A-Za-z0-9\-_/.]{3,32})/i,
    /(?:^|\n)\s*(?:invoice|faktur)[:\s]+([0-9][A-Za-z0-9\-_/.]{1,31})/i,
    /\b(TRX-[A-Z0-9]{4,20})\b/i,
    /\b(INV[/-][0-9]{4,16})\b/i,
    /\b(SI-\d{8}-\d{4})\b/i,
    /\b(TR-\d{5}-\d{4})\b/i,
    /\b(MIDI-\d{4,12})\b/i,
    /\b(MCD-\d{4,12})\b/i,
    /\b(KFC-\d{4,12})\b/i,
  ];

  for (const p of patterns) {
    const matches = text.matchAll(new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g'));
    for (const m of matches) {
      if (m && m[1]) {
        const val = m[1].trim();
        const matchIndex = m.index;
        const lineBefore = text.slice(Math.max(0, matchIndex - 30), matchIndex);
        if (/jl\.|jalan/i.test(lineBefore)) {
          continue;
        }
        if (!ignoredWords.test(val) && val.length >= 2) {
          return val;
        }
      }
    }
  }

  return null;
}

/**
 * Mengekstrak nama merchant / toko.
 * @param {string | string[]} input
 * @returns {string}
 */
export function extractMerchant(input = '') {
  const fullText = Array.isArray(input) ? input.join('\n') : String(input || '');
  for (const km of KNOWN_MERCHANTS) {
    if (km.pattern.test(fullText)) {
      return km.name;
    }
  }

  const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const ignorePatterns = /^(struk|bukti|pembayaran|kasir|tanggal|jam|selamat\s*datang|terima\s*kasih|nota|invoice|receipt|rp|total|telp|jl\.|alamat|npwp)/i;
  for (const line of lines.slice(0, 5)) {
    if (line.length >= 3 && line.length <= 40 && !ignorePatterns.test(line)) {
      return line;
    }
  }

  return 'Toko / Merchant';
}

// ============================================================================
// 6. EKSTRAKSI METODE PEMBAYARAN
// ============================================================================

const PAYMENT_METHODS = [
  { pattern: /\b(qris)\b/i, name: 'QRIS' },
  { pattern: /\b(debit\s*bca|bca\s*debit)\b/i, name: 'Debit BCA' },
  { pattern: /\b(debit\s*mandiri|mandiri\s*debit)\b/i, name: 'Debit Mandiri' },
  { pattern: /\b(kartu\s*kredit|credit\s*card)\b/i, name: 'Kartu Kredit' },
  { pattern: /\b(kartu\s*debit|debit\s*card|debit)\b/i, name: 'Kartu Debit' },
  { pattern: /\b(shopeepay|spay)\b/i, name: 'ShopeePay' },
  { pattern: /\b(gopay|gojek)\b/i, name: 'GoPay' },
  { pattern: /\b(ovo)\b/i, name: 'OVO' },
  { pattern: /\b(dana)\b/i, name: 'DANA' },
  { pattern: /\b(tunai|cash)\b/i, name: 'Tunai' },
];

/**
 * Mengekstrak metode pembayaran Indonesia.
 * @param {string} text
 * @returns {string}
 */
export function extractPaymentMethod(text = '') {
  for (const pm of PAYMENT_METHODS) {
    if (pm.pattern.test(text)) {
      return pm.name;
    }
  }
  return 'Tunai';
}

// ============================================================================
// 7. EKSTRAKSI RINCIAN BARANG (LINE ITEMS)
// ============================================================================

/**
 * Mengekstrak rincian item belanja dan diskon level item jika ada.
 * Mencegah nomor faktur, rekening, tanggal, atau metadata tercatat sebagai item.
 * @param {string[] | string} input
 * @param {string} [merchant='']
 * @returns {Array<{ name: string; quantity: number; unit_price: number; total_price: number; discount?: number; discount_percent?: number | null; net_price?: number; category_suggestion: string }>}
 */
export function extractLineItems(input = [], merchant = '') {
  const lines = Array.isArray(input) ? input : String(input || '').split(/\r?\n/);
  const items = [];

  // Kata kunci ringkasan dan status pembayaran finansial (yang TIDAK PERNAH boleh menjadi item belanja)
  const summaryOrPaymentTerms = /\b(?:total|grand\s*total|subtotal|sub\s*total|ppn|pb1|pajak|tax|vat|ongkir|ongkos\s*kirim|biaya\s*(?:pengiriman|kirim|layanan|ongkir)|shipping|delivery|tunai|cash|kembali|kembalian|debit|kredit|qris|kartu|change|payment|bayar|gopay|shopeepay|ovo|dana|linkaja|lunas|paid|unpaid|terbayar|dp\b|down\s*payment|uang\s*muka|tertagih|jumlah\s*tertagih|jumlah\s*tagih(?:an)?|sisa\s*tagihan|sisa\s*bayar|balance\s*due|amount\s*(?:due|paid)|dpp|faktur|invoice|status|tertunggak|piutang|nilai\s*faktur)\b/i;

  const headerKeywords = /^(?:selamat\s*datang|terima\s*kasih|struk|nota|kasir|waktu|tanggal|tgl|jam|shift|pos|jl\.|telp|npwp|member|antrian|layanan|ksr|bon|date|order|trx|check|faktur|bill|receipt|merchant|harga\s*(?:sudah\s*)?termasuk|pt\b|cv\b|tbk\b|kepada\s*yth|attn:)/i;
  const isDateLine = /^\s*(?:\d{1,2}\s+(?:januari|jan|februari|feb|maret|mar|april|apr|mei|may|juni|jun|juli|jul|agustus|agu|ags|aug|september|sep|oktober|okt|oct|november|nov|desember|des|dec)[a-z]*\s+\d{2,4}|\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4})\b/i;

  // Metadata identifier yang BUKAN merupakan item belanja
  const metadataBlacklist = /\b(?:no\.?|nomor|invoice|inv|faktur|nota|bill|order|trx|check|resi|receipt|ref|reference|id|rekening|rek|va|account|bca|mandiri|bri|bni|cimb|bsi|npwp|kode|merchant|toko|kasir|cashier|terminal|batch|approval|trace|mid|tid|customer|pelanggan|member|alamat|telp|phone|fax|email|website|date|waktu|jam|tgl|shift|pos|jatuh\s*tempo|due\s*date|status|perhatian|catatan|keterangan|syarat|ketentuan|tanda\s*tangan|ttd|hormat\s*kami|penerima|pengirim)\b/i;

  /**
   * Validasi nama produk agar bukan metadata acak atau baris status / ringkasan
   * @param {string} name
   */
  const isValidItemName = (name) => {
    if (!name || typeof name !== 'string') return false;
    // Bersihkan simbol dan tanda baca di awal dan akhir
    const cleaned = name.replace(/^[:\s\-_.*~>#|/\\;,]+/, '').replace(/[:\s\-_.*~>#|/\\;,]+$/, '').trim();
    if (cleaned.length < 2) return false;

    // Bersihkan awalan/akhiran satuan atau simbol mata uang (misal: 'Ro', 'Rp', 'IDR')
    const withoutCurrency = cleaned.replace(/\b(?:rp|ro|idr|bp|hp)\b\.?/gi, '').trim();
    if (withoutCurrency.length < 2) return false;

    // Harus memuat minimal 2 huruf nyata
    const lettersOnly = withoutCurrency.replace(/[^a-zA-Z]/g, '');
    if (lettersOnly.length < 2) return false;

    // Tolak jika memuat kata kunci ringkasan / pembayaran / status
    if (summaryOrPaymentTerms.test(cleaned)) return false;
    if (headerKeywords.test(cleaned)) return false;
    if (metadataBlacklist.test(cleaned)) return false;
    if (isDateLine.test(cleaned)) return false;

    return true;
  };

  const itemDiscountRegex = /^(?:disc(?:\.|\b)|diskon|discount|potongan(?:\s*harga)?|promo|voucher|hemat|rebate)\b(?:\s*(\d+(?:[.,]\d+)?)\s*%)?[:\s-]*\(?(?:rp\.?)?\s*-?\s*([\d.,]{1,15})?\)?/i;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = (rawLine || '').trim();
    if (!line) continue;

    const strippedLine = line.replace(/^[:\s\-_.*~>#|/\\;,]+/, '').replace(/[:\s\-_.*~>#|/\\;,]+$/, '').trim();
    if (!strippedLine) continue;

    // Abaikan baris tanggal agar tidak salah terurai sebagai item belanja
    if (isDateLine.test(strippedLine)) {
      continue;
    }

    // Deteksi diskon level item (misal: 'Disc 10% -1.739' di bawah item)
    if (itemDiscountRegex.test(line) && items.length > 0) {
      const match = line.match(itemDiscountRegex);
      const last = items[items.length - 1];
      const pct = match[1] ? parseFloat(match[1].replace(',', '.')) : null;
      let discAmt = match[2] ? cleanCurrencyAmount(match[2]) : null;
      if (!discAmt && pct !== null && last.total_price > 0) {
        discAmt = Math.round(last.total_price * (pct / 100));
      }
      if (discAmt && discAmt > 0) {
        last.discount = (last.discount || 0) + discAmt;
        if (pct !== null) last.discount_percent = pct;
        last.net_price = Math.max(0, (last.total_price || 0) - last.discount);
      }
      continue;
    }

    // Abaikan baris ringkasan atau baris status finansial
    if (summaryOrPaymentTerms.test(strippedLine)) {
      continue;
    }
    if (headerKeywords.test(strippedLine)) {
      continue;
    }
    if (metadataBlacklist.test(strippedLine)) {
      continue;
    }

    // Pola A: Baris kuantitas bertingkat Alfamart / Kimia Farma (contoh: '2 PCS x 3.500 7.000' atau '1 17.387 17.387')
    const multiQtyMatch = line.match(/^(\d{1,3})\s*(?:pcs|pc|btl|box|x|@)?\s*[x@]?\s*(?:rp\.?)?\s*([\d.,]{3,12})\s+(?:rp\.?)?\s*([\d.,]{3,12})$/i);
    if (multiQtyMatch && items.length > 0 && items[items.length - 1].total_price === 0) {
      const last = items[items.length - 1];
      const qty = parseInt(multiQtyMatch[1], 10) || 1;
      const unit = cleanCurrencyAmount(multiQtyMatch[2]) || last.unit_price;
      const total = cleanCurrencyAmount(multiQtyMatch[3]) || (qty * unit);
      last.quantity = qty;
      last.unit_price = unit;
      last.total_price = total;
      last.net_price = total;
      continue;
    } else if (multiQtyMatch && items.length > 0) {
      const last = items[items.length - 1];
      const qty = parseInt(multiQtyMatch[1], 10) || 1;
      const unit = cleanCurrencyAmount(multiQtyMatch[2]) || last.unit_price;
      const total = cleanCurrencyAmount(multiQtyMatch[3]) || (qty * unit);
      last.quantity = qty;
      last.unit_price = unit;
      last.total_price = total;
      last.net_price = Math.max(0, total - (last.discount || 0));
      continue;
    }

    // Pola B: Format 3 kolom lengkap: 'INDOMIE GOR SPEC 85G   2   3.100   6.200'
    const threeColMatch = line.match(/^(.+?)\s+(\d{1,3})\s+(?:rp\.?)?\s*([\d.,]{3,12})\s+(?:rp\.?)?\s*([\d.,]{3,12})$/i);
    if (threeColMatch) {
      const name = threeColMatch[1].trim();
      const qty = parseInt(threeColMatch[2], 10) || 1;
      const unit = cleanCurrencyAmount(threeColMatch[3]) || 0;
      const total = cleanCurrencyAmount(threeColMatch[4]) || (qty * unit);

      if (isValidItemName(name) && total > 0 && total < 100000000) {
        const cat = categorizeItem(name);
        items.push({
          name,
          quantity: qty,
          unit_price: unit,
          total_price: total,
          net_price: total,
          category_suggestion: cat.category,
        });
        continue;
      }
    }

    // Pola C: Awalan kuantitas: '2x KOPI KENANGAN MANTAN 36.000' atau '1 CAFFE LATTE (GRANDE) 52.000'
    const prefixQtyMatch = line.match(/^(\d{1,2})\s*x?\s+(.+?)\s+(?:rp\.?)?\s*([\d.,]{3,12})$/i);
    if (prefixQtyMatch) {
      const qty = parseInt(prefixQtyMatch[1], 10) || 1;
      const name = prefixQtyMatch[2].trim();
      const total = cleanCurrencyAmount(prefixQtyMatch[3]) || 0;
      const unit = Math.round(total / qty);

      if (isValidItemName(name) && total > 0 && total < 100000000) {
        const cat = categorizeItem(name);
        items.push({
          name,
          quantity: qty,
          unit_price: unit,
          total_price: total,
          net_price: total,
          category_suggestion: cat.category,
        });
        continue;
      }
    }

    // Pola D: Satu baris item dan nominal harga di akhir: 'SARI ROTI TAWAR KUPAS 15.000'
    const singleLineMatch = line.match(/^(.+?)\s+(?:rp\.?|ro\.?|idr\.?)?\s*([\d]{1,3}(?:[.,][\d]{3})*(?:[.,][\d]{2})?)$/i);
    if (singleLineMatch) {
      const name = singleLineMatch[1].trim();
      const total = cleanCurrencyAmount(singleLineMatch[2]) || 0;
      if (isValidItemName(name) && total > 0 && total < 100000000) {
        const cat = categorizeItem(name);
        items.push({
          name,
          quantity: 1,
          unit_price: total,
          total_price: total,
          net_price: total,
          category_suggestion: cat.category,
        });
        continue;
      }
    }

    // Pola E: Baris hanya nama produk (persiapan baris kuantitas dan harga di bawahnya)
    const hasOnlyLetters = /[a-zA-Z]/.test(line);
    const endsWithPrice = /(?:rp\.?|idr)\s*[\d.,]{3,}\s*$/i.test(line) ||
      /\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\s*$/.test(line) ||
      /\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\s*$/.test(line);

    if (hasOnlyLetters && !endsWithPrice && line.length >= 3 && isValidItemName(line)) {
      const cat = categorizeItem(line);
      items.push({
        name: line,
        quantity: 1,
        unit_price: 0,
        total_price: 0,
        net_price: 0,
        category_suggestion: cat.category,
      });
    }
  }

  // Filter item yang total_price-nya > 0
  return items.filter((it) => it.total_price > 0);
}

// ============================================================================
// 8. EKSTRAKSI RINGKASAN FINANSIAL
// ============================================================================

/**
 * Mengekstrak ringkasan finansial struk / faktur:
 * - Subtotal item murni (single line atau multi-line)
 * - Diskon (persentase & nominal)
 * - Pajak / PPN (termasuk vs terpisah)
 * - Ongkos kirim
 * - Grand total
 * - Jumlah Tagih / Sisa Tagihan (Amount Due pada invoice)
 * - Uang Muka / Telah Dibayar (Amount Paid / DP pada invoice)
 * - Deteksi tipe dokumen (receipt vs invoice) & payment status
 *
 * @param {string} text
 * @param {Array<any>} [lineItems=[]]
 * @returns {{
 *   subtotal: number;
 *   discount: number;
 *   discount_percent: number | null;
 *   tax: number;
 *   tax_included: boolean;
 *   shipping: number;
 *   total: number;
 *   amount_due: number;
 *   amount_paid: number;
 *   document_type: 'receipt' | 'invoice';
 *   payment_status: 'paid' | 'unpaid' | 'partial';
 *   reconstructed_total: number;
 *   reconciliation_mismatch: boolean;
 *   reconciliation_difference: number;
 *   needs_review: boolean;
 *   review_reasons: string[];
 *   cash_paid: number;
 *   change: number;
 * }}
 */
export function extractFinancialSummary(text = '', lineItems = []) {
  let subtotal = 0;
  let invoice_gross = 0;
  let discount = 0;
  let discount_percent = null;
  let tax = 0;
  let tax_included = false;
  let shipping = 0;
  let total = 0;
  let down_payment = 0;
  let previously_paid = 0;
  let amount_paid = 0;
  let amount_due = 0;
  let cash_paid = 0;
  let change = 0;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1. Deteksi Tipe Dokumen: RECEIPT vs INVOICE vs UNKNOWN
  const invoiceKeywords = /\b(?:invoice|faktur|tagihan|penagihan|bill\s*to|tagih\s*ke|surat\s*tagihan|faktur\s*penjualan|sales\s*invoice|due\s*date|jatuh\s*tempo|jumlah\s*tertagih|jumlah\s*tagih|sisa\s*tagihan|down\s*payment|uang\s*muka|termin|piutang|kepada\s*yth)\b/i;
  const receiptKeywords = /\b(?:struk|nota(?:\s*belanja|\s*pembelian|\s*kontan)?|kasir|cashier|pos\b|selamat\s*datang|terima\s*kasih\s*atas\s*kunjungan|kembalian|change|kartu\s*debit|debit\s*card)\b/i;

  let document_type = 'unknown';
  const cleanTrimmed = text.trim();
  if (!cleanTrimmed || cleanTrimmed.length < 15) {
    document_type = 'unknown';
  } else if (invoiceKeywords.test(text)) {
    document_type = 'invoice';
  } else if (receiptKeywords.test(text)) {
    document_type = 'receipt';
  } else {
    const km = KNOWN_MERCHANTS.some((m) => m.pattern.test(text));
    if (km || (Array.isArray(lineItems) && lineItems.length > 0)) {
      document_type = 'receipt';
    } else {
      document_type = 'unknown';
    }
  }

  const isInvoice = document_type === 'invoice';

  // Deteksi apakah pajak / PPN sudah termasuk dalam harga
  const taxIncludedRegex = /(?:harga\s*(?:sudah\s*)?termasuk\s*(?:ppn|pajak|tax|pb1)|sudah\s*termasuk\s*(?:ppn|pajak|tax|pb1)|termasuk\s*(?:ppn|pajak|tax|pb1)|tax\s*included|prices?\s*include\s*vat|ppn\s*termasuk|dpp\s*[:\s]*[\d.,]+)/i;
  if (taxIncludedRegex.test(text)) {
    tax_included = true;
  }

  // Hitung total diskon dari baris item-level jika ada
  const itemDiscountsTotal = Array.isArray(lineItems)
    ? lineItems.reduce((acc, it) => acc + (Number(it.discount) || 0), 0)
    : 0;

  // Helper mencari nilai numerik pada baris saat ini atau baris setelahnya (multi-line layout)
  const getAmountFromLineOrNext = (i, line, regexSingle, regexLabelOnly) => {
    // 1. Coba pada baris yang sama
    const matchSame = line.match(regexSingle);
    if (matchSame && matchSame[1]) {
      const amt = cleanCurrencyAmount(matchSame[1]);
      if (amt !== null) return amt;
    }
    // 2. Jika baris hanya label, periksa 1-2 baris berikutnya
    if (regexLabelOnly && regexLabelOnly.test(line)) {
      for (let offset = 1; offset <= 2 && (i + offset) < lines.length; offset++) {
        const nextLine = lines[i + offset].trim();
        if (!nextLine) continue;
        // Jika baris berikutnya adalah label ringkasan lain, berhenti
        if (/^(?:subtotal|total|grand\s*total|ppn|pb1|pajak|diskon|disc|ongkir|jumlah|uang\s*muka|sisa|dp\b|tagih|tertagih|dpp\b)/i.test(nextLine)) {
          break;
        }
        // Cek jika baris berikutnya memuat nominal
        const nextMatch = nextLine.match(/^(?:rp\.?|ro\.?|idr)?\s*\(?([\d.,]{3,20})\)?$/i) ||
          nextLine.match(/(?:rp\.?|ro\.?|idr)\s*([\d.,]{3,20})/i) ||
          nextLine.match(/^([\d.,]{3,20})$/);
        if (nextMatch) {
          const amt = cleanCurrencyAmount(nextMatch[1]);
          if (amt !== null && amt > 0) return amt;
        }
      }
    }
    return null;
  };

  let dpp_amount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Simpan DPP jika ada untuk fallback jika subtotal tidak ada sama sekali
    if (dpp_amount === 0) {
      const dppMatch = line.match(/^dpp\b[:\s]*(?:rp\.?|ro\.?|idr\.?)?\s*([\d.,]{3,20})/i);
      if (dppMatch) {
        dpp_amount = cleanCurrencyAmount(dppMatch[1]) || 0;
      }
    }

    // 1. Subtotal / Nilai Bruto Faktur (prioritaskan subtotal eksplisit, bukan DPP)
    if (subtotal === 0) {
      const sub = getAmountFromLineOrNext(
        i,
        line,
        /^(?:subtotal|sub\s*total|total\s*harga|jumlah\s*harga|nilai\s*faktur|gross)\b[:\s]*(?:rp\.?|ro\.?|idr\.?)?\s*([\d.,]{3,20})/i,
        /^(?:subtotal|sub\s*total|total\s*harga|jumlah\s*harga|nilai\s*faktur|gross)[:\s]*$/i
      );
      if (sub !== null && sub > 0) {
        subtotal = sub;
        invoice_gross = sub;
      }
    }

    // 2. Diskon / Potongan / Promo / Voucher (dukung format persen & nominal)
    if (discount === 0) {
      const discRegex = /^(?:total\s*diskon|diskon\s*total|diskon\s*member|diskon|disc(?:\.|\b)|discount|potongan(?:\s*harga)?|promo|voucher|hemat|cashback|rebate)\b(?:\s*(\d+(?:[.,]\d+)?)\s*%)?[:\s-]*\(?(?:rp\.?|ro\.?|idr\.?)?\s*-?\s*([\d.,]{1,20})?\)?/i;
      const discMatch = line.match(discRegex);
      if (discMatch) {
        if (discMatch[1]) {
          discount_percent = parseFloat(discMatch[1].replace(',', '.'));
        }
        if (discMatch[2]) {
          discount = cleanCurrencyAmount(discMatch[2]) || 0;
        }
      } else {
        const discLabelRegex = /^(?:total\s*diskon|diskon\s*total|diskon\s*member|diskon|disc(?:\.|\b)|discount|potongan(?:\s*harga)?|promo|voucher|hemat)[:\s]*$/i;
        const discVal = getAmountFromLineOrNext(i, line, discRegex, discLabelRegex);
        if (discVal !== null && discVal > 0) {
          discount = discVal;
        }
      }
    }

    // 3. Pajak / PPN / PB1 (dukung pajak terpisah maupun label PPN dengan rate; abaikan info rate tanpa nominal)
    if (tax === 0) {
      const taxSingleRegex = /^(?:harga\s*(?:sudah\s*)?termasuk\s*)?(?:total\s*)?(?:ppn|pb1|pajak(?:\s*restoran)?|tax|vat)\b(?:\s*\(?\d+(?:[.,]\d+)?%\)?)?[:\s]*(?:rp\.?|ro\.?|idr\.?)?\s*([\d.,]{1,20})(?![\d.,\s]*%)/i;
      const taxLabelRegex = /^(?:total\s*)?(?:ppn|pb1|pajak(?:\s*restoran)?|tax|vat)(?:\s*\(?\d+(?:[.,]\d+)?%\)?)?[:\s]*$/i;
      const taxVal = getAmountFromLineOrNext(i, line, taxSingleRegex, taxLabelRegex);
      if (taxVal !== null && taxVal > 0) {
        tax = taxVal;
      }
    }

    // 4. Ongkos Kirim / Shipping Fee
    if (shipping === 0) {
      const shipSingleRegex = /^(?:ongkir|ongkos\s*kirim|biaya\s*(?:pengiriman|kirim|layanan|ongkir)|shipping(?:\s*fee)?|delivery(?:\s*fee)?)\b[:\s]*(?:rp\.?|ro\.?|idr\.?)?\s*([\d.,]{1,20})/i;
      const shipLabelRegex = /^(?:ongkir|ongkos\s*kirim|biaya\s*(?:pengiriman|kirim|layanan|ongkir)|shipping(?:\s*fee)?|delivery(?:\s*fee)?)[:\s]*$/i;
      const shipVal = getAmountFromLineOrNext(i, line, shipSingleRegex, shipLabelRegex);
      if (shipVal !== null && shipVal > 0) {
        shipping = shipVal;
      }
    }

    // 5. Down Payment / Uang Muka (DP)
    if (down_payment === 0) {
      const dpSingleRegex = /(?:^|[:\s\-_])(?:down\s*payment|uang\s*muka|dp\b)(?:\s*\([^)]*\))?[:\s]*(?:rp\.?|ro\.?|idr\.?)?\s*([\d.,]{3,20})/i;
      const dpLabelRegex = /^(?:down\s*payment|uang\s*muka|dp\b)(?:\s*\([^)]*\))?[:\s]*$/i;
      const dpVal = getAmountFromLineOrNext(i, line, dpSingleRegex, dpLabelRegex);
      if (dpVal !== null && dpVal > 0) {
        down_payment = dpVal;
      }
    }

    // 6. Previously Paid / Sudah Dibayar / Lunas Sebagian
    if (previously_paid === 0) {
      const prevSingleRegex = /(?:^|[:\s\-_])(?:status\s*:\s*)?(?:pembayaran\s*sebelumnya|sudah\s*dibayar|telah\s*dibayar|lunas\s*sebagian|lunas|paid)\b(?:\s*\([^)]*\))?[:\s]*(?:rp\.?|ro\.?|idr\.?)?\s*([\d.,]{3,20})/i;
      const prevLabelRegex = /^(?:status\s*:\s*)?(?:pembayaran\s*sebelumnya|sudah\s*dibayar|telah\s*dibayar|lunas\s*sebagian|lunas|paid)(?:\s*\([^)]*\))?[:\s]*$/i;
      const prevVal = getAmountFromLineOrNext(i, line, prevSingleRegex, prevLabelRegex);
      if (prevVal !== null && prevVal > 0) {
        previously_paid = prevVal;
      }
    }

    // 7. Jumlah Tagih / Sisa Tagihan (Amount Due / Jumlah Tertagih pada Faktur)
    if (amount_due === 0) {
      const dueSingleRegex = /^(?:jumlah\s*tertagih|jumlah\s*tagih(?:an)?|total\s*tagihan|sisa\s*tagihan|sisa\s*yang\s*harus\s*dibayar|yang\s*harus\s*dibayar|amount\s*due|balance\s*due)\b(?:\s*\([^)]*\))?[:\s]*(?:rp\.?|ro\.?|idr\.?)?\s*([\d.,]{3,20})/i;
      const dueLabelRegex = /^(?:jumlah\s*tertagih|jumlah\s*tagih(?:an)?|total\s*tagihan|sisa\s*tagihan|sisa\s*yang\s*harus\s*dibayar|yang\s*harus\s*dibayar|amount\s*due|balance\s*due)(?:\s*\([^)]*\))?[:\s]*$/i;
      const dueVal = getAmountFromLineOrNext(i, line, dueSingleRegex, dueLabelRegex);
      if (dueVal !== null && dueVal > 0) {
        amount_due = dueVal;
      }
    }

    // 8. Grand Total / Total Akhir / Total Faktur
    if (total === 0 && !line.match(/^total\s*(?:harga|diskon|item|qty|barang|tagihan)\b/i)) {
      const totSingleRegex = /^(?:grand\s*total|total\s*akhir|total\s*faktur|total\s*bayar|total\s*belanja|total\s*transaksi|total)\b[:\s]*(?:rp\.?|ro\.?|idr\.?)?\s*([\d.,]{3,20})/i;
      const totLabelRegex = /^(?:grand\s*total|total\s*akhir|total\s*faktur|total\s*bayar|total\s*belanja|total\s*transaksi|total)[:\s]*$/i;
      const totVal = getAmountFromLineOrNext(i, line, totSingleRegex, totLabelRegex);
      if (totVal !== null && totVal > 0) {
        total = totVal;
      }
    }

    // 9. Tunai / Pembayaran
    if (cash_paid === 0) {
      const cashMatch = line.match(/^(?:tunai\s*diterima|tunai|cash|bayar|debit\s*card|kartu\s*debit)\b[:\s]*(?:rp\.?|ro\.?|idr\.?)?\s*([\d.,]{3,20})/i);
      if (cashMatch) {
        cash_paid = cleanCurrencyAmount(cashMatch[1]) || 0;
      }
    }

    // 10. Kembalian
    if (change === 0) {
      const chgMatch = line.match(/^(?:kembalian|kembali|change)\b[:\s]*(?:rp\.?|ro\.?|idr\.?)?\s*([\d.,]{1,20})/i);
      if (chgMatch) {
        change = cleanCurrencyAmount(chgMatch[1]) || 0;
      }
    }
  }

  // Rekonsiliasi subtotal dengan line items jika belum eksplisit
  const sumItems = Array.isArray(lineItems) && lineItems.length > 0
    ? lineItems.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0)
    : 0;

  if (subtotal === 0 && sumItems > 0) {
    subtotal = sumItems;
  } else if (subtotal === 0 && dpp_amount > 0) {
    subtotal = dpp_amount;
  }

  // Hitung total pembayaran yang telah dilakukan (DP + pembayaran sebelumnya)
  amount_paid = (down_payment || 0) + (previously_paid || 0);

  if (isInvoice) {
    if (invoice_gross === 0) {
      invoice_gross = subtotal > 0 ? subtotal : total;
    }
    if (subtotal === 0 && invoice_gross > 0) {
      subtotal = invoice_gross;
    }
  }

  // Jika diskon ringkasan belum terdeteksi tapi ada diskon di level item, gunakan diskon item
  if (discount === 0 && itemDiscountsTotal > 0) {
    discount = itemDiscountsTotal;
  }

  // Jika hanya ada persentase diskon tapi belum ada nominal, hitung dari subtotal
  if (discount === 0 && discount_percent && subtotal > 0) {
    discount = Math.round(subtotal * (discount_percent / 100));
  }

  // Perhitungan Rekonsiliasi:
  // subtotal - diskon + (tax_included ? 0 : pajak) + ongkir
  const additionalTax = tax_included ? 0 : tax;
  const reconstructedTotal = Math.max(0, subtotal - discount + additionalTax + shipping);

  // Jika total eksplisit belum ditemukan, tentukan fallback cerdas
  const explicitTotal = total;
  if (total === 0) {
    if (isInvoice) {
      total = invoice_gross || (amount_due + amount_paid) || reconstructedTotal;
    } else if (subtotal > 0) {
      total = reconstructedTotal;
    } else if (sumItems > 0) {
      total = sumItems;
    }
  }

  // Rekonsiliasi check: beda > 2 Rupiah dianggap mismatch
  let reconciliationMismatch = false;
  let reconciliationDifference = 0;

  if (isInvoice) {
    // Pada invoice: cek apakah invoice_gross - discount + tax + shipping - amount_paid == amount_due
    const netInvoice = Math.max(0, (invoice_gross || subtotal) - discount + additionalTax + shipping);
    const expectedDue = Math.max(0, netInvoice - amount_paid);
    if (amount_due > 0 && Math.abs(expectedDue - amount_due) > 2) {
      reconciliationMismatch = true;
      reconciliationDifference = Math.abs(expectedDue - amount_due);
    }
  } else {
    if (explicitTotal > 0 && Math.abs(explicitTotal - reconstructedTotal) > 2) {
      reconciliationMismatch = true;
      reconciliationDifference = Math.abs(explicitTotal - reconstructedTotal);
    }
  }

  // Status Pembayaran & Tipe Dokumen
  let payment_status = 'paid';
  if (isInvoice) {
    if (amount_due > 0 && amount_paid > 0) {
      payment_status = 'partial';
    } else if (amount_due > 0) {
      payment_status = 'unpaid';
    } else if (/\b(?:lunas|paid|terbayar|settled)\b/i.test(text) && amount_due === 0) {
      payment_status = 'paid';
    } else {
      payment_status = 'unpaid';
    }
  }

  // Nominal pembayaran yang dicatat hari ini
  let recorded_payment_amount = 0;
  if (!isInvoice) {
    recorded_payment_amount = total;
  } else {
    if (payment_status === 'paid') {
      recorded_payment_amount = total;
    } else {
      // PERLINDUNGAN FINANCIAL: Tagihan belum lunas / partial TIDAK otomatis memotong saldo bank hari ini!
      recorded_payment_amount = 0;
    }
  }

  const review_reasons = [];
  let needs_review = false;

  if (document_type === 'unknown') {
    needs_review = true;
    review_reasons.push('Tipe dokumen tidak dapat dipastikan secara otomatis. Periksa apakah dokumen merupakan struk atau faktur.');
  }

  if (isInvoice && payment_status !== 'paid') {
    needs_review = true;
    const dueFormatted = new Intl.NumberFormat('id-ID').format(amount_due || total);
    review_reasons.push(
      `Dokumen terdeteksi sebagai Faktur/Invoice dengan sisa tagihan Rp ${dueFormatted} (${payment_status === 'partial' ? 'Pembayaran Sebagian' : 'Belum Dibayar'}). Saldo bank tidak akan dipotong otomatis kecuali Anda mengonfirmasi nominal pembayaran.`
    );
  }

  if (reconciliationMismatch) {
    needs_review = true;
    const diffFormatted = new Intl.NumberFormat('id-ID').format(reconciliationDifference);
    review_reasons.push(
      `Terdapat selisih rekonsiliasi finansial sebesar Rp ${diffFormatted}. Harap periksa kembali rincian faktur/struk.`
    );
  }

  return {
    subtotal,
    invoice_gross: isInvoice ? (invoice_gross || subtotal) : 0,
    discount,
    discount_percent,
    tax,
    tax_included,
    shipping,
    total,
    down_payment,
    previously_paid,
    amount_paid,
    amount_due,
    recorded_payment_amount,
    document_type,
    payment_status,
    reconstructed_total: reconstructedTotal,
    reconciliation_mismatch: reconciliationMismatch,
    reconciliation_difference: reconciliationDifference,
    needs_review,
    review_reasons,
    cash_paid,
    change,
  };
}

// ============================================================================
// 9. FINGERPRINT & DETEKSI DUPLIKASI
// ============================================================================

/**
 * Menghasilkan fingerprint SHA-256 64-karakter hex deterministik dari struk.
 * @param {any} receipt
 * @returns {string}
 */
export function generateReceiptFingerprint(receipt) {
  if (!receipt || typeof receipt !== 'object') {
    return crypto.createHash('sha256').update('empty_receipt').digest('hex');
  }

  const merchant = String(receipt.merchant || '').toLowerCase().trim();
  const date = String(receipt.date || '').trim();
  const total = String(Math.round(Number(receipt.total) || 0));
  const no = String(receipt.receipt_no || '').toLowerCase().trim();

  let itemsDigest = '';
  if (Array.isArray(receipt.line_items) && receipt.line_items.length > 0) {
    itemsDigest = receipt.line_items
      .map((it) => `${String(it.name || '').toLowerCase()}:${it.total_price || 0}`)
      .join('|');
  }

  const payload = `KAYLA_RECEIPT::${merchant}::${date}::${total}::${no}::${itemsDigest}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Memeriksa apakah dua struk merupakan duplikasi identik.
 * @param {any} r1
 * @param {any} r2
 * @returns {boolean}
 */
export function isDuplicateReceipt(r1, r2) {
  if (!r1 || !r2) return false;
  return generateReceiptFingerprint(r1) === generateReceiptFingerprint(r2);
}

// ============================================================================
// 10. SKOR KEYAKINAN (CONFIDENCE SCORE)
// ============================================================================

/**
 * Menghitung tingkat keyakinan (Confidence Score 0-100% dan level high/medium/low).
 * @param {any} receipt
 * @returns {{ score: number; level: 'high' | 'medium' | 'low' }}
 */
export function calculateConfidenceScore(receipt = {}) {
  let score = 0;

  if (receipt.merchant && receipt.merchant !== 'Toko / Merchant') {
    score += 20;
  }
  if (receipt.date) {
    score += 20;
  }
  if (receipt.total && Number(receipt.total) > 0) {
    score += 25;
  }
  if (Array.isArray(receipt.line_items) && receipt.line_items.length > 0) {
    score += 20;
  }
  if (receipt.receipt_no) {
    score += 15;
  }

  let level = 'low';
  if (score >= 75) {
    level = 'high';
  } else if (score >= 50) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return { score, level };
}

// ============================================================================
// 11. PARSER UTAMA STRUK (parseReceipt)
// ============================================================================

/**
 * Mengurai teks OCR struk secara komprehensif menjadi struktur data belanja lengkap.
 * @param {string} rawText
 * @returns {{
 *   success: boolean;
 *   merchant: string;
 *   date: string | null;
 *   time: string | null;
 *   receipt_no: string | null;
 *   total: number;
 *   subtotal: number;
 *   discount: number;
 *   discount_percent: number | null;
 *   tax: number;
 *   tax_included: boolean;
 *   shipping: number;
 *   reconstructed_total: number;
 *   reconciliation_mismatch: boolean;
 *   reconciliation_difference: number;
 *   cash_paid: number;
 *   change: number;
 *   payment_method: string;
 *   category_suggestion: string;
 *   category_id: string;
 *   line_items: Array<{ name: string; quantity: number; unit_price: number; total_price: number; discount?: number; discount_percent?: number | null; net_price?: number; category_suggestion: string }>;
 *   fingerprint: string;
 *   confidence: 'high' | 'medium' | 'low';
 *   confidence_score: number;
 *   warnings: string[];
 * }}
 */
export function parseReceipt(rawText) {
  if (rawText === null || rawText === undefined || typeof rawText !== 'string' || !rawText.trim()) {
    const emptyFp = generateReceiptFingerprint(null);
    return {
      success: false,
      merchant: '',
      date: null,
      time: null,
      receipt_no: null,
      total: 0,
      subtotal: 0,
      discount: 0,
      discount_percent: null,
      tax: 0,
      tax_included: false,
      shipping: 0,
      reconstructed_total: 0,
      reconciliation_mismatch: false,
      reconciliation_difference: 0,
      cash_paid: 0,
      change: 0,
      payment_method: 'Tunai',
      category_suggestion: RECEIPT_CATEGORIES.OTHER,
      category_id: CATEGORY_ID_MAP[RECEIPT_CATEGORIES.OTHER],
      line_items: [],
      fingerprint: emptyFp,
      confidence: 'low',
      confidence_score: 0,
      warnings: ['Teks struk kosong atau tidak terdeteksi.'],
    };
  }

  const text = rawText.trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const merchant = extractMerchant(lines, text);
  const { date, time } = extractDateTime(text);
  const receipt_no = extractReceiptNumber(text);
  const line_items = extractLineItems(lines, merchant);
  const summary = extractFinancialSummary(text, line_items);
  const payment_method = extractPaymentMethod(text);

  // Tentukan kategori utama struk
  let category_suggestion = RECEIPT_CATEGORIES.GROCERIES;
  const km = KNOWN_MERCHANTS.find((m) => m.pattern.test(merchant));
  if (km) {
    category_suggestion = km.defaultCategory;
  } else if (line_items.length > 0) {
    category_suggestion = line_items[0].category_suggestion;
  }
  const category_id = CATEGORY_ID_MAP[category_suggestion] || 'cat-exp-shopping';

  // Deteksi anomali / random OCR noise
  const warnings = [];
  const isKnownMerchant = KNOWN_MERCHANTS.some((m) => m.pattern.test(merchant));
  const isInvoice = summary.document_type === 'invoice';
  const hasValidFeatures = Boolean(
    isKnownMerchant ||
    (date && (summary.total > 0 || receipt_no)) ||
    (isInvoice && (summary.total > 0 || summary.amount_due > 0)) ||
    (summary.total > 0 && (merchant !== 'Toko / Merchant' || line_items.length > 0))
  );

  if (!hasValidFeatures || summary.total === 0) {
    warnings.push('Format struk tidak lazim atau banyak noise terdeteksi.');
  }

  if (summary.needs_review && Array.isArray(summary.review_reasons)) {
    warnings.push(...summary.review_reasons);
  } else if (summary.reconciliation_mismatch) {
    warnings.push(`Terdapat selisih rekonsiliasi antara total tercetak (Rp ${summary.total}) dan kalkulasi rincian (Rp ${summary.reconstructed_total}).`);
  }

  const finalTotal = hasValidFeatures ? summary.total : 0;
  const finalItems = hasValidFeatures ? line_items : [];

  const partialObj = {
    merchant: hasValidFeatures ? merchant : '',
    date: hasValidFeatures ? date : null,
    total: finalTotal,
    receipt_no: hasValidFeatures ? receipt_no : null,
    line_items: finalItems,
  };

  const { score: confidence_score, level: confidence } = calculateConfidenceScore(partialObj);
  const fingerprint = generateReceiptFingerprint(partialObj);

  return {
    success: hasValidFeatures && finalTotal > 0,
    document_type: summary.document_type || 'receipt',
    payment_status: summary.payment_status || 'paid',
    merchant: hasValidFeatures ? merchant : '',
    date: hasValidFeatures ? date : null,
    time: hasValidFeatures ? time : null,
    receipt_no: hasValidFeatures ? receipt_no : null,
    total: finalTotal,
    grand_total: finalTotal,
    subtotal: hasValidFeatures ? summary.subtotal : 0,
    invoice_gross: hasValidFeatures ? (summary.invoice_gross || summary.subtotal) : 0,
    down_payment: hasValidFeatures ? summary.down_payment : 0,
    previously_paid: hasValidFeatures ? summary.previously_paid : 0,
    amount_due: hasValidFeatures ? summary.amount_due : 0,
    amount_paid: hasValidFeatures ? summary.amount_paid : 0,
    recorded_payment_amount: hasValidFeatures ? summary.recorded_payment_amount : 0,
    discount: hasValidFeatures ? summary.discount : 0,
    discount_percent: hasValidFeatures ? summary.discount_percent : null,
    tax: hasValidFeatures ? summary.tax : 0,
    tax_included: hasValidFeatures ? summary.tax_included : false,
    shipping: hasValidFeatures ? summary.shipping : 0,
    reconstructed_total: hasValidFeatures ? summary.reconstructed_total : 0,
    reconciliation_mismatch: hasValidFeatures ? summary.reconciliation_mismatch : false,
    reconciliation_difference: hasValidFeatures ? summary.reconciliation_difference : 0,
    needs_review: Boolean(summary.needs_review),
    review_reasons: summary.review_reasons || [],
    cash_paid: hasValidFeatures ? summary.cash_paid : 0,
    change: hasValidFeatures ? summary.change : 0,
    payment_method,
    category_suggestion,
    category_id,
    line_items: finalItems,
    fingerprint,
    confidence,
    confidence_score,
    warnings,
    raw_text: text,
    source_text: text,
  };
}

// ============================================================================
// 12. ADAPTER KOMPATIBILITAS SCANMODAL (parseReceiptText & checkReceiptDuplicate)
// ============================================================================

/**
 * Adapter fungsi lama untuk ScanModal.jsx
 * @param {string} rawText
 * @param {any} [options]
 */
export function parseReceiptText(rawText = '', options = {}) {
  const parsed = parseReceipt(rawText);
  return {
    document_type: parsed.document_type || 'receipt',
    payment_status: parsed.payment_status || 'paid',
    merchant: parsed.merchant || 'Toko / Merchant',
    date: parsed.date || new Date().toISOString().slice(0, 10),
    receipt_number: parsed.receipt_no || `STRUK-${Date.now().toString().slice(-6)}`,
    items: parsed.line_items.map((it, idx) => ({
      id: `item-${Date.now()}-${idx + 1}`,
      name: it.name,
      qty: it.quantity,
      unit_price: it.unit_price,
      subtotal: it.total_price,
      total_price: it.total_price,
      discount: it.discount || 0,
      discount_percent: it.discount_percent || null,
      net_price: it.net_price || it.total_price,
    })),
    subtotal: parsed.subtotal,
    invoice_gross: parsed.invoice_gross || parsed.subtotal || 0,
    down_payment: parsed.down_payment || 0,
    previously_paid: parsed.previously_paid || 0,
    amount_due: parsed.amount_due || 0,
    amount_paid: parsed.amount_paid || 0,
    recorded_payment_amount: parsed.recorded_payment_amount || 0,
    discount: parsed.discount,
    discount_percent: parsed.discount_percent,
    tax: parsed.tax,
    tax_included: parsed.tax_included,
    shipping: parsed.shipping,
    grand_total: parsed.total,
    reconstructed_total: parsed.reconstructed_total,
    reconciliation_mismatch: parsed.reconciliation_mismatch,
    reconciliation_difference: parsed.reconciliation_difference,
    needs_review: parsed.needs_review || false,
    review_reasons: parsed.review_reasons || [],
    payment_method: parsed.payment_method,
    suggested_category_id: parsed.category_id,
    suggested_account: parsed.payment_method,
    fingerprint: parsed.fingerprint,
    confidence: parsed.confidence,
    confidence_score: parsed.confidence_score,
    raw_text: rawText,
    source_text: rawText,
    warnings: parsed.warnings || [],
  };
}

/**
 * Adapter fungsi lama checkReceiptDuplicate untuk ScanModal.jsx
 * @param {string} fingerprint
 * @param {any} receiptData
 * @param {Array<any>} existingTransactions
 */
export function checkReceiptDuplicate(fingerprint, receiptData, existingTransactions = []) {
  if (!existingTransactions || existingTransactions.length === 0) return null;

  if (receiptData?.receipt_number && !receiptData.receipt_number.startsWith('STRUK-')) {
    const match = existingTransactions.find((t) => t.external_transaction_id === receiptData.receipt_number);
    if (match) {
      return {
        isDuplicate: true,
        reason: `Nomor struk "${receiptData.receipt_number}" sudah tercatat pada transaksi sebelumnya (${match.description}).`,
        matchedTransaction: match,
      };
    }
  }

  if (receiptData?.grand_total > 0 && receiptData.date) {
    const match = existingTransactions.find((t) => {
      const txDate = (t.transaction_date || '').slice(0, 10);
      const isSameDate = txDate === receiptData.date;
      const isSameAmount = Math.abs(Number(t.amount) - Number(receiptData.grand_total)) < 1;
      return isSameDate && isSameAmount && t.transaction_type === 'expense';
    });

    if (match) {
      return {
        isDuplicate: true,
        reason: `Ditemukan transaksi serupa sebesar Rp ${Number(receiptData.grand_total).toLocaleString('id-ID')} pada tanggal ${receiptData.date} (${match.description}).`,
        matchedTransaction: match,
      };
    }
  }

  return null;
}

export default {
  parseReceipt,
  parseReceiptText,
  checkReceiptDuplicate,
  extractLineItems,
  extractFinancialSummary,
  cleanCurrencyAmount,
  cleanPercentage,
  RECEIPT_CATEGORIES,
  CATEGORY_ID_MAP,
};
