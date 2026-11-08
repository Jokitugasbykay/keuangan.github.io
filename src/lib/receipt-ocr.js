/**
 * @file Mesin Pengenalan Optik Struk Belanja (Receipt OCR Core Engine)
 * Modul pemrosesan citra berbasis canvas dan ekstraksi teks struk belanja / bukti transaksi.
 * Kompatibel dengan lingkungan browser (offline-friendly untuk GitHub Pages) dan mode server lokal Next.js.
 * 
 * Aturan Sistem:
 * - Tidak menggunakan em dash atau en dash. Gunakan tanda minus biasa (-).
 * - Tidak menggunakan emoticon atau emoji.
 * - Aman terhadap Server-Side Rendering (SSR guard).
 */

/**
 * Tipe MIME citra yang didukung untuk OCR struk belanja.
 * @type {string[]}
 */
export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/**
 * Nama-nama bulan dalam bahasa Indonesia untuk parsing tanggal struk.
 * @type {Record<string, number>}
 */
const INDONESIAN_MONTHS = {
  januari: 1, jan: 1,
  februari: 2, feb: 2,
  maret: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  agustus: 8, agu: 8, ags: 8, aug: 8,
  september: 9, sep: 9,
  oktober: 10, okt: 10, oct: 10,
  november: 11, nov: 11,
  desember: 12, des: 12, dec: 12,
};

/**
 * Daftar pedagang / merchant populer di Indonesia untuk deteksi cepat.
 * Catatan: Kata generik seperti 'total' tidak dimasukkan agar tidak salah mendeteksi baris total pembayaran.
 * @type {Array<{ pattern: RegExp, name: string }>}
 */
const KNOWN_MERCHANT_PATTERNS = [
  { pattern: /\b(indomaret)\b/i, name: 'INDOMARET' },
  { pattern: /\b(alfamidi)\b/i, name: 'ALFAMIDI' },
  { pattern: /\b(alfamart)\b/i, name: 'ALFAMART' },
  { pattern: /\b(super\s*indo)\b/i, name: 'SUPERINDO' },
  { pattern: /\b(transmart|carrefour)\b/i, name: 'TRANSMART' },
  { pattern: /\b(hypermart)\b/i, name: 'HYPERMART' },
  { pattern: /\b(lotte\s*mart)\b/i, name: 'LOTTE MART' },
  { pattern: /\b(spbu\s*pertamina|pertamina)\b/i, name: 'SPBU PERTAMINA' },
  { pattern: /\b(shell)\b/i, name: 'SHELL' },
  { pattern: /\b(bp\s*akr)\b/i, name: 'BP AKR' },
  { pattern: /\b(starbucks)\b/i, name: 'STARBUCKS' },
  { pattern: /\b(kopi\s*kenangan)\b/i, name: 'KOPI KENANGAN' },
  { pattern: /\b(fore\s*coffee)\b/i, name: 'FORE COFFEE' },
  { pattern: /\b(janji\s*jiwa)\b/i, name: 'JANJI JIWA' },
  { pattern: /\b(point\s*coffee)\b/i, name: 'POINT COFFEE' },
  { pattern: /\b(lawson)\b/i, name: 'LAWSON' },
  { pattern: /\b(familymart)\b/i, name: 'FAMILYMART' },
  { pattern: /\b(circle\s*k)\b/i, name: 'CIRCLE K' },
  { pattern: /\b(mcdonald|mcd\b)\b/i, name: "MCDONALD'S" },
  { pattern: /\b(kfc|kentucky)\b/i, name: 'KFC' },
  { pattern: /\b(hokben|hoka)\b/i, name: 'HOKBEN' },
  { pattern: /\b(richeese\s*factory)\b/i, name: 'RICHEESE FACTORY' },
  { pattern: /\b(burger\s*king)\b/i, name: 'BURGER KING' },
  { pattern: /\b(pizza\s*hut)\b/i, name: 'PIZZA HUT' },
  { pattern: /\b(domino)\b/i, name: "DOMINO'S PIZZA" },
  { pattern: /\b(chatime)\b/i, name: 'CHATIME' },
  { pattern: /\b(mixue)\b/i, name: 'MIXUE' },
  { pattern: /\b(dcost)\b/i, name: "D'COST" },
  { pattern: /\b(solaria)\b/i, name: 'SOLARIA' },
  { pattern: /\b(bakmi\s*gm)\b/i, name: 'BAKMI GM' },
  { pattern: /\b(guardian)\b/i, name: 'GUARDIAN' },
  { pattern: /\b(watsons)\b/i, name: 'WATSONS' },
  { pattern: /\b(kimia\s*farma)\b/i, name: 'KIMIA FARMA' },
  { pattern: /\b(century)\b/i, name: 'CENTURY' },
  { pattern: /\b(k24|k-24)\b/i, name: 'APOTEK K-24' },
  { pattern: /\b(shopeepay)\b/i, name: 'SHOPEEPAY' },
  { pattern: /\b(gopay)\b/i, name: 'GOPAY' },
  { pattern: /\b(ovo)\b/i, name: 'OVO' },
  { pattern: /\b(dana)\b/i, name: 'DANA' },
  { pattern: /\b(linkaja)\b/i, name: 'LINKAJA' },
  { pattern: /\b(bca)\b/i, name: 'BCA' },
  { pattern: /\b(mandiri)\b/i, name: 'MANDIRI' },
  { pattern: /\b(bri)\b/i, name: 'BRI' },
  { pattern: /\b(bni)\b/i, name: 'BNI' },
  { pattern: /\b(cimb\s*niaga)\b/i, name: 'CIMB NIAGA' },
  { pattern: /\b(bank\s*jago)\b/i, name: 'BANK JAGO' },
  { pattern: /\b(seabank)\b/i, name: 'SEABANK' },
  { pattern: /\b(jenius)\b/i, name: 'JENIUS' },
  { pattern: /\b(tokopedia)\b/i, name: 'TOKOPEDIA' },
];

/**
 * Validasi tipe MIME dari berkas atau string mime.
 * 
 * @param {File|Blob|string} fileOrMime
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateReceiptImage(fileOrMime) {
  let mime = '';
  if (typeof fileOrMime === 'string') {
    mime = fileOrMime;
  } else if (fileOrMime && typeof fileOrMime.type === 'string') {
    mime = fileOrMime.type;
  }

  if (!mime || !SUPPORTED_MIME_TYPES.includes(mime.toLowerCase())) {
    return {
      valid: false,
      error: 'Format berkas tidak didukung. Format yang diterima: JPG, PNG, atau WebP.',
    };
  }

  return { valid: true };
}

/**
 * Memuat objek File, Blob, Data URL, atau HTMLImageElement menjadi elemen HTMLImageElement siap pakai.
 * Dilengkapi pengaman SSR.
 * 
 * @param {HTMLImageElement|HTMLCanvasElement|File|Blob|string} source
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageElement(source) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Pemuatan citra hanya dapat dijalankan di lingkungan browser.'));
  }

  if (source instanceof HTMLImageElement && source.complete && source.naturalWidth > 0) {
    return Promise.resolve(source);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let objectUrl = null;

    img.onload = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      resolve(img);
    };

    img.onerror = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      reject(new Error('Gagal memuat citra struk untuk pemrosesan OCR.'));
    };

    if (typeof source === 'string') {
      img.src = source;
    } else if (source instanceof Blob || (typeof File !== 'undefined' && source instanceof File)) {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    } else if (source instanceof HTMLCanvasElement) {
      img.src = source.toDataURL('image/png');
    } else {
      reject(new Error('Tipe sumber citra tidak didukung.'));
    }
  });
}

/**
 * Mengompresi berkas citra berukuran besar sebelum pemrosesan tanpa mengorbankan keterbacaan teks angka dan huruf.
 * Mendukung pembatasan dimensi maksimum (default 1600px) dan kompresi kualitas JPEG.
 * 
 * @param {File|Blob} file Berkas citra struk asli
 * @param {number} [maxDimension=1600] Batas maksimum lebar atau tinggi piksel
 * @param {number} [quality=0.85] Kualitas kompresi JPEG (0.1 hingga 1.0)
 * @returns {Promise<File|Blob>} Berkas hasil kompresi siap diproses
 */
export async function compressImageForOcr(file, maxDimension = 1600, quality = 0.85) {
  if (typeof window === 'undefined') {
    return file;
  }

  if (!file) {
    throw new Error('Berkas citra tidak ditemukan.');
  }

  const validation = validateReceiptImage(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const img = await loadImageElement(file);
  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;

  if (origWidth <= 0 || origHeight <= 0) {
    throw new Error('Dimensi citra tidak valid atau citra kosong.');
  }

  let targetWidth = origWidth;
  let targetHeight = origHeight;

  const maxSide = Math.max(origWidth, origHeight);
  if (maxSide > maxDimension) {
    const scale = maxDimension / maxSide;
    targetWidth = Math.max(1, Math.round(origWidth * scale));
    targetHeight = Math.max(1, Math.round(origHeight * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Gagal menginisialisasi context canvas 2D.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Gagal menghasilkan blob citra terkompresi.'));
          return;
        }

        const fileName = (file instanceof File && file.name)
          ? file.name.replace(/\.[^/.]+$/, '') + '-compressed.jpg'
          : 'compressed-receipt.jpg';

        if (typeof File !== 'undefined') {
          const compressedFile = new File([blob], fileName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        } else {
          resolve(blob);
        }
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Pra-pemrosesan Citra Canvas (Canvas Image Preprocessing).
 * Mengoptimalkan kontras dan kejelasan cetak thermal receipt struk belanja:
 * - Resize downscale otomatis jika dimensi melebihi 1920px untuk menghemat memori.
 * - Konversi Grayscale dengan pembobotan luminance standar (0.299*R + 0.587*G + 0.114*B).
 * - Kontras adaptif dan binarization (thresholding lokal integral image) untuk memperjelas teks cetak thermal receipt.
 * - Mengembalikan data URL citra hasil optimasi kontras untuk diumpankan ke OCR.
 * 
 * @param {HTMLImageElement|HTMLCanvasElement|File|Blob|string} imageElementOrFile
 * @param {Object} [options] Opsi pra-pemrosesan
 * @param {number} [options.maxDimension=1920] Batas maksimum dimensi piksel
 * @param {boolean} [options.binarize=true] Apakah binarization thresholding diterapkan
 * @param {number} [options.adaptiveWindowSize=31] Ukuran jendela lokal untuk adaptive thresholding
 * @param {number} [options.adaptivePercentage=12] Persentase offset thresholding lokal
 * @param {number} [options.adaptiveDelta=8] Nilai delta minimum perbedaan kontras
 * @param {string} [options.format='image/png'] Format data URL keluaran
 * @returns {Promise<string>} Data URL citra hasil pra-pemrosesan
 */
export async function preprocessReceiptImage(imageElementOrFile, options = {}) {
  if (typeof window === 'undefined') {
    return Promise.resolve(
      typeof imageElementOrFile === 'string' ? imageElementOrFile : ''
    );
  }

  const {
    maxDimension = 1920,
    binarize = true,
    adaptiveWindowSize = 31,
    adaptivePercentage = 12,
    adaptiveDelta = 8,
    format = 'image/png',
  } = options;

  const img = await loadImageElement(imageElementOrFile);
  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;

  if (origWidth <= 0 || origHeight <= 0) {
    throw new Error('Dimensi citra tidak valid untuk pra-pemrosesan.');
  }

  let targetWidth = origWidth;
  let targetHeight = origHeight;

  const maxSide = Math.max(origWidth, origHeight);
  if (maxSide > maxDimension) {
    const scale = maxDimension / maxSide;
    targetWidth = Math.max(1, Math.round(origWidth * scale));
    targetHeight = Math.max(1, Math.round(origHeight * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Context canvas 2D tidak tersedia pada browser ini.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = imgData.data;
  const totalPixels = targetWidth * targetHeight;

  // 1. Konversi Grayscale dengan pembobotan luminance standar (0.299*R + 0.587*G + 0.114*B)
  const grayscale = new Uint8Array(totalPixels);
  let minGray = 255;
  let maxGray = 0;

  for (let i = 0, p = 0; i < totalPixels; i++, p += 4) {
    const r = pixels[p];
    const g = pixels[p + 1];
    const b = pixels[p + 2];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    grayscale[i] = gray;
    if (gray < minGray) minGray = gray;
    if (gray > maxGray) maxGray = gray;
  }

  // 2. Peregangan Kontras (Contrast Stretching)
  const range = maxGray - minGray;
  const stretched = new Uint8Array(totalPixels);

  if (range > 10) {
    for (let i = 0; i < totalPixels; i++) {
      const normalized = Math.round(((grayscale[i] - minGray) / range) * 255);
      stretched[i] = Math.min(255, Math.max(0, normalized));
    }
  } else {
    stretched.set(grayscale);
  }

  // 3. Kontras Adaptif dan Binarization (Thresholding Lokal Berbasis Integral Image)
  if (binarize) {
    const integral = new Uint32Array(totalPixels);

    // Hitung Integral Image secara efisien dalam satu iterasi O(W * H)
    for (let y = 0; y < targetHeight; y++) {
      let rowSum = 0;
      const rowOffset = y * targetWidth;
      const prevRowOffset = (y - 1) * targetWidth;

      for (let x = 0; x < targetWidth; x++) {
        const idx = rowOffset + x;
        rowSum += stretched[idx];
        integral[idx] = rowSum + (y > 0 ? integral[prevRowOffset + x] : 0);
      }
    }

    const radius = Math.max(4, Math.floor(adaptiveWindowSize / 2));
    const factor = (100 - adaptivePercentage) / 100;

    for (let y = 0; y < targetHeight; y++) {
      const y1 = Math.max(0, y - radius);
      const y2 = Math.min(targetHeight - 1, y + radius);
      const rowOffset = y * targetWidth;

      for (let x = 0; x < targetWidth; x++) {
        const x1 = Math.max(0, x - radius);
        const x2 = Math.min(targetWidth - 1, x + radius);

        const count = (x2 - x1 + 1) * (y2 - y1 + 1);

        const d = integral[y2 * targetWidth + x2];
        const b = y1 > 0 ? integral[(y1 - 1) * targetWidth + x2] : 0;
        const c = x1 > 0 ? integral[y2 * targetWidth + (x1 - 1)] : 0;
        const a = (y1 > 0 && x1 > 0) ? integral[(y1 - 1) * targetWidth + (x1 - 1)] : 0;

        const localSum = d - b - c + a;
        const localMean = localSum / count;

        const currentPixel = stretched[rowOffset + x];
        const pixelOffset = (rowOffset + x) * 4;

        // Teks struk thermal (gelap) vs latar belakang kertas (terang)
        if (currentPixel < (localMean * factor) - adaptiveDelta) {
          pixels[pixelOffset] = 0;
          pixels[pixelOffset + 1] = 0;
          pixels[pixelOffset + 2] = 0;
        } else {
          pixels[pixelOffset] = 255;
          pixels[pixelOffset + 1] = 255;
          pixels[pixelOffset + 2] = 255;
        }
        pixels[pixelOffset + 3] = 255;
      }
    }
  } else {
    // Mode grayscale dengan kontras tinggi tanpa binarization penuh
    for (let i = 0, p = 0; i < totalPixels; i++, p += 4) {
      const val = stretched[i];
      pixels[p] = val;
      pixels[p + 1] = val;
      pixels[p + 2] = val;
      pixels[p + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL(format);
}

/**
 * Singleton pemuatan skrip Tesseract.js di browser.
 * @type {Promise<any>|null}
 */
let tesseractLoaderPromise = null;

/**
 * Memuat library Tesseract.js secara dinamis dan aman di browser.
 * 
 * @returns {Promise<any>}
 */
export function loadTesseract() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Tesseract hanya dapat dimuat di browser.'));
  }

  if (window.Tesseract) {
    return Promise.resolve(window.Tesseract);
  }

  if (!tesseractLoaderPromise) {
    tesseractLoaderPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[src*="tesseract.js"]');
      if (existingScript && window.Tesseract) {
        resolve(window.Tesseract);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
      script.async = true;

      script.onload = () => {
        if (window.Tesseract) {
          resolve(window.Tesseract);
        } else {
          reject(new Error('Objek Tesseract tidak ditemukan setelah skrip dimuat.'));
        }
      };

      script.onerror = () => {
        tesseractLoaderPromise = null;
        reject(new Error('Gagal memuat pustaka Tesseract.js dari CDN.'));
      };

      document.head.appendChild(script);
    });
  }

  return tesseractLoaderPromise;
}

/**
 * Mengonversi berkas atau blob menjadi string Base64.
 * 
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader tidak tersedia.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      if (typeof res === 'string') {
        const parts = res.split(',');
        resolve(parts[1] || parts[0]);
      } else {
        reject(new Error('Format pembacaan berkas tidak valid.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas menjadi Base64.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Membersihkan dan mengubah representasi nominal uang menjadi angka murni (number).
 * Mendukung format desimal Indonesia (15.000,00) dan internasional (15,000.00).
 * 
 * @param {string|number} raw
 * @returns {number|null}
 */
export function parseCurrencyValue(raw) {
  if (typeof raw === 'number') {
    return isNaN(raw) ? null : raw;
  }
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  let s = raw.replace(/[^\d.,]/g, '').trim();
  if (!s) return null;

  if (s.includes('.') && s.includes(',')) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Format Indonesia: 150.000,00
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Format Internasional: 150,000.00
      s = s.replace(/,/g, '');
    }
  } else if (s.includes('.') && !s.includes(',')) {
    const parts = s.split('.');
    if (parts.length > 2) {
      s = s.replace(/\./g, '');
    } else if (parts[1].length === 3) {
      s = s.replace(/\./g, '');
    } else if (parts[1].length === 2) {
      // Format 150.00
      s = s;
    } else {
      s = s.replace(/\./g, '');
    }
  } else if (s.includes(',') && !s.includes('.')) {
    const parts = s.split(',');
    if (parts.length > 2) {
      s = s.replace(/,/g, '');
    } else if (parts[1].length === 3) {
      s = s.replace(/,/g, '');
    } else if (parts[1].length === 2) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }

  const val = parseFloat(s);
  return (!isNaN(val) && val >= 0 && val < 100000000000) ? val : null;
}

/**
 * Mengurai teks mentah struk belanja menjadi entitas terstruktur.
 * Mendukung format struk retail Indonesia, struk kasir thermal, dan bukti transfer.
 * 
 * @param {string} rawText Teks hasil OCR
 * @param {'income'|'expense'} [defaultType='expense'] Tipe transaksi default
 * @returns {Object} Data entitas transaksi terstruktur
 */
export function parseReceiptText(rawText, defaultType = 'expense') {
  const text = rawText || '';
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Tipe Transaksi
  let txType = defaultType;
  const isRetailReceipt = /(?:total\s*belanja|total\s*bayar|belanja|kasir|subtotal|no\.?\s*struk|struk)/i.test(text);

  if (!isRetailReceipt && /(?:transfer\s*masuk|uang\s*masuk|diterima\s*dari|deposit\s*masuk|top\s*up\s*berhasil|refund\s*sukses|cashback\s*diterima)\b/i.test(text)) {
    txType = 'income';
  } else if (isRetailReceipt || /(?:transfer\s*keluar|uang\s*keluar|pembayaran|bayar|beli|pembelian|tagihan|debit|pengeluaran|total\s*belanja|belanja)\b/i.test(text)) {
    txType = 'expense';
  }

  // 2. Ekstraksi Nominal (Amount) dengan Prioritas Baris
  let amount = null;

  // Prioritas 1: Baris Grand Total / Total Bayar / Total Belanja
  for (const line of lines) {
    const grandMatch = line.match(/^(?:grand\s*total|total\s*akhir|total\s*bayar|total\s*belanja|total\s*transaksi)\b[:\s]*(?:rp\.?)?\s*([\d.,]{3,18})/i);
    if (grandMatch && grandMatch[1]) {
      const val = parseCurrencyValue(grandMatch[1]);
      if (val !== null && val > 0) {
        amount = val;
        break;
      }
    }
  }

  // Prioritas 2: Baris TOTAL murni (hindari 'total harga' subtotal atau 'total liter/volume')
  if (amount === null) {
    for (const line of lines) {
      if (/total\s*(?:harga|liter|item|barang|qty|volume)\b/i.test(line)) {
        continue;
      }
      const totMatch = line.match(/^total\b[:\s]*(?:rp\.?)?\s*([\d.,]{3,18})/i);
      if (totMatch && totMatch[1]) {
        const val = parseCurrencyValue(totMatch[1]);
        if (val !== null && val > 0) {
          amount = val;
          break;
        }
      }
    }
  }

  // Prioritas 3: Baris Subtotal / Nominal / Jumlah Bayar / Tagihan
  if (amount === null) {
    for (const line of lines) {
      const midMatch = line.match(/^(?:subtotal|sub\s*total|jumlah\s*bayar|nominal|tagihan)\b[:\s]*(?:rp\.?)?\s*([\d.,]{3,18})/i);
      if (midMatch && midMatch[1]) {
        const val = parseCurrencyValue(midMatch[1]);
        if (val !== null && val > 0) {
          amount = val;
          break;
        }
      }
    }
  }

  // Prioritas 4: Baris Metode Pembayaran Tunai / QRIS / Kartu
  if (amount === null) {
    for (const line of lines) {
      const payMatch = line.match(/^(?:tunai|cash|debit|qris|kartu)\b[:\s]*(?:rp\.?)?\s*([\d.,]{3,18})/i);
      if (payMatch && payMatch[1]) {
        const val = parseCurrencyValue(payMatch[1]);
        if (val !== null && val > 0) {
          amount = val;
          break;
        }
      }
    }
  }

  // Prioritas 5: Pola Umum Nilai Rupiah Tertinggi atau Regex Global
  if (amount === null) {
    const generalAmountPatterns = [
      /(?:rp\.?|idr)\s*([\d.,]{3,18})/i,
      /\b(\d{1,3}(?:\.\d{3})+(?:,\d{2})?)\b/,
      /\b(\d{4,9})\b/,
    ];

    for (const pattern of generalAmountPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const val = parseCurrencyValue(match[1]);
        if (val !== null && val > 0) {
          amount = val;
          break;
        }
      }
    }
  }

  // 3. Ekstraksi Tanggal
  let dateVal = null;
  const monthPattern = Object.keys(INDONESIAN_MONTHS).join('|');

  // Format teks: "14 Februari 2026" atau "14 Feb 26"
  const indDateRegex = new RegExp(`\\b(\\d{1,2})\\s+(${monthPattern})\\s+(\\d{4}|\\d{2})\\b`, 'i');
  const indMatch = text.match(indDateRegex);

  if (indMatch) {
    const d = parseInt(indMatch[1], 10);
    const m = INDONESIAN_MONTHS[indMatch[2].toLowerCase()] || 1;
    let y = parseInt(indMatch[3], 10);
    if (y < 100) y += 2000;
    dateVal = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
  } else {
    // Prioritas format ISO: "YYYY-MM-DD"
    const isoMatch = text.match(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/);
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10);
      const m = parseInt(isoMatch[2], 10);
      const d = parseInt(isoMatch[3], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        dateVal = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      }
    } else {
      // Format numerik: "DD/MM/YYYY" atau "DD-MM-YYYY" atau "DD.MM.YYYY"
      const numDateMatch = text.match(/\b(\d{1,2})[/. -](\d{1,2})[/. -](\d{4}|\d{2})\b/);
      if (numDateMatch) {
        let d = parseInt(numDateMatch[1], 10);
        let m = parseInt(numDateMatch[2], 10);
        let y = parseInt(numDateMatch[3], 10);
        if (y < 100) y += 2000;

        if (m > 12 && d <= 12) {
          const tmp = d;
          d = m;
          m = tmp;
        }

        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          dateVal = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
        }
      }
    }
  }

  // 4. Nomor Referensi / Struk / Transaksi
  let refNum = null;
  const refPatterns = [
    /(?:no\.?\s*referensi|nomor\s*referensi|ref\s*id|ref\s*no|reference\s*no|txid|id\s*transaksi|no\.?\s*transaksi|trx\s*id)[:\s]*([A-Za-z0-9_-]{4,36})/i,
    /(?:order\s*id|no\.?\s*resi|no\.?\s*struk|receipt\s*no|struk\s*#|check\s*#)[:\s]*([A-Za-z0-9_-]{4,30})/i,
    /(?:trace\s*no|approval\s*code|auth\s*code)[:\s]*([A-Za-z0-9_-]{4,20})/i,
    /\b(IDM-[A-Za-z0-9_-]{4,20})\b/i,
    /\b(ALF-[A-Za-z0-9_-]{4,20})\b/i,
    /\b(MIDI-[A-Za-z0-9_-]{4,20})\b/i,
    /\b(SBX-[A-Za-z0-9_-]{4,20})\b/i,
    /\b(MCD-[A-Za-z0-9_-]{4,20})\b/i,
    /\b(KFC-[A-Za-z0-9_-]{4,20})\b/i,
    /\b(TRX-[A-Za-z0-9_-]{4,20})\b/i,
    /\b(BATCH-[A-Za-z0-9_-]{4,20})\b/i,
  ];

  for (const rp of refPatterns) {
    const rm = text.match(rp);
    if (rm && rm[1]) {
      refNum = rm[1].trim();
      break;
    }
  }

  // 5. Merchant / Toko / Penerima
  let merchant = '';

  // Cek dari daftar pedagang terkenal di Indonesia dengan pola RegExp spesifik
  for (const item of KNOWN_MERCHANT_PATTERNS) {
    if (item.pattern.test(text)) {
      merchant = item.name;
      break;
    }
  }

  // Jika belum ditemukan, periksa pola teks penerima / merchant
  if (!merchant) {
    const merchantPatterns = [
      /(?:ke|penerima|tujuan|kepada|transfer\s*ke|bayar\s*ke)[:\s]*([^\n,]{3,40})/i,
      /(?:merchant|toko|nama\s*toko|merchant\s*name)[:\s]*([^\n,]{3,40})/i,
      /(?:dari|pengirim|diterima\s*dari)[:\s]*([^\n,]{3,40})/i,
    ];

    for (const mp of merchantPatterns) {
      const mm = text.match(mp);
      if (mm && mm[1]) {
        const candidate = mm[1].trim();
        if (!/^(rp|total|berhasil|sukses|mandiri|bca|bri|bni|tanggal|jam|subtotal|grand)/i.test(candidate)) {
          merchant = candidate;
          break;
        }
      }
    }
  }

  // Fallback: periksa baris-baris teratas struk thermal
  if (!merchant && lines.length > 0) {
    for (const l of lines.slice(0, 5)) {
      if (
        l.length >= 3 &&
        l.length <= 40 &&
        !/^(struk|bukti|pembayaran|kasir|tanggal|jam|selamat|terima|nota|invoice|receipt|rp|total|telp|jl\.|alamat|npwp|subtotal|grand)/i.test(l)
      ) {
        merchant = l;
        break;
      }
    }
  }

  // 6. Hitung Skor Keyakinan (Confidence)
  let foundSignals = 0;
  if (amount !== null) foundSignals += 3;
  if (dateVal !== null) foundSignals += 2;
  if (merchant) foundSignals += 2;
  if (refNum) foundSignals += 1;

  // Nilai numerik confidence skala 0.0 sampai 1.0
  const numericConfidence = Math.min(1.0, Math.max(0.1, Number((foundSignals / 8).toFixed(2))));
  const confidenceLevel = numericConfidence >= 0.75 ? 'high' : numericConfidence >= 0.45 ? 'medium' : 'low';

  const description = merchant
    ? `Belanja ${merchant}`
    : lines[0]
      ? `Bukti Transaksi (${lines[0].slice(0, 30)})`
      : 'Struk Belanja';

  return {
    transaction_type: txType,
    amount,
    currency: 'IDR',
    date: dateVal,
    description,
    merchant,
    reference_number: refNum,
    suggested_account: null,
    confidence: confidenceLevel,
    confidenceScore: numericConfidence,
    notes: refNum ? `No. Struk/Ref: ${refNum}` : '',
  };
}

/**
 * Normalisasi callback onProgress agar mendukung format objek maupun persentase angka secara mulus.
 * Objek yang dikirimkan dapat diakses propertinya (.progress, .message, .stage)
 * maupun diperlakukan langsung sebagai angka persentase.
 * 
 * @param {Function} callback
 * @param {number} progress
 * @param {string} message
 * @param {string} stage
 */
function notifyProgress(callback, progress, message, stage) {
  if (typeof callback !== 'function') return;

  const numericProgress = typeof progress === 'number' && !Number.isNaN(progress)
    ? Math.max(0, Math.min(100, Math.round(progress)))
    : (Number(progress) || 0);
  const textMessage = typeof message === 'string'
    ? message
    : (typeof stage === 'string' ? stage : 'Memproses OCR...');
  const stageName = typeof stage === 'string' ? stage : '';

  const payload = Object.assign(new Number(numericProgress), {
    progress: numericProgress,
    message: textMessage,
    stage: stageName,
    [Symbol.toPrimitive](hint) {
      if (hint === 'string') return String(numericProgress);
      return numericProgress;
    },
    valueOf: () => numericProgress,
  });

  try {
    if (callback.length >= 2) {
      callback(numericProgress, textMessage, payload);
    } else {
      callback(payload);
    }
  } catch {
    // Hindari interupsi pipeline jika handler konsumen mengalami kesalahan
  }
}

/**
 * Pipeline Eksekusi OCR Fleksibel (Client & Server Fallback).
 * 
 * Alur Proses:
 * - Melaporkan progres berkala (0% -> 25% -> 50% -> 75% -> 100%) melalui callback onProgress.
 * - Mendukung pemrosesan client-side di browser (offline-friendly untuk GitHub Pages) dengan Tesseract.js.
 * - Jika berjalan di browser dan Tesseract worker dimuat, ekstrak teks dengan bahasa 'ind+eng' (atau fallback bahasa Inggris).
 * - Jika berjalan dalam mode server lokal (Next.js fullstack), sediakan integrasi fallback ke API /api/scan.
 * - Jika terjadi kegagalan jaringan atau citra terdistorsi, kembalikan response terstruktur:
 *   { success: boolean, text: string, confidence: number, preprocessedUrl?: string, error?: string }
 * 
 * @param {File|Blob|string} imageFileOrDataUrl Berkas citra atau Data URL struk belanja
 * @param {Function|Object} [optionsOrProgress] Callback onProgress atau opsi pipeline
 * @returns {Promise<{
 *   success: boolean,
 *   text: string,
 *   confidence: number,
 *   preprocessedUrl?: string,
 *   engine?: string,
 *   data?: Object,
 *   error?: string
 * }>}
 */
export async function performReceiptOcr(imageFileOrDataUrl, optionsOrProgress = () => {}) {
  let onProgress = () => {};
  let preferEngine = 'auto'; // 'auto' | 'client' | 'server'
  let defaultType = 'expense';
  let language = 'ind+eng';

  if (typeof optionsOrProgress === 'function') {
    onProgress = optionsOrProgress;
  } else if (optionsOrProgress && typeof optionsOrProgress === 'object') {
    if (typeof optionsOrProgress.onProgress === 'function') {
      onProgress = optionsOrProgress.onProgress;
    }
    if (optionsOrProgress.preferEngine) {
      preferEngine = optionsOrProgress.preferEngine;
    }
    if (optionsOrProgress.defaultType) {
      defaultType = optionsOrProgress.defaultType;
    }
    if (optionsOrProgress.language) {
      language = optionsOrProgress.language;
    }
  }

  // Validasi input awal
  if (!imageFileOrDataUrl) {
    return {
      success: false,
      text: '',
      confidence: 0,
      error: 'Data citra struk belanja tidak boleh kosong.',
    };
  }

  // 0% - Memulai
  notifyProgress(onProgress, 0, 'Memulai persiapan pemrosesan struk belanja...', 'start');

  let preprocessedUrl = '';
  try {
    // 25% - Pra-pemrosesan citra canvas
    notifyProgress(onProgress, 25, 'Menjalankan pra-pemrosesan citra dan peningkatan kontras...', 'preprocess');

    if (typeof window !== 'undefined') {
      preprocessedUrl = await preprocessReceiptImage(imageFileOrDataUrl, {
        maxDimension: 1920,
        binarize: true,
      });
    } else if (typeof imageFileOrDataUrl === 'string') {
      preprocessedUrl = imageFileOrDataUrl;
    }
  } catch (prepErr) {
    // Jika pra-pemrosesan gagal, fallback ke citra asli
    if (typeof imageFileOrDataUrl === 'string') {
      preprocessedUrl = imageFileOrDataUrl;
    }
  }

  // 50% - Eksekusi Pengenalan Teks (OCR)
  notifyProgress(onProgress, 50, 'Membaca karakter teks pada struk belanja...', 'ocr');

  let recognizedText = '';
  let engineUsed = '';
  let ocrError = null;

  // Strategi A: Coba Server API /api/scan terlebih dahulu jika preferEngine === 'server'
  // atau saat running di server lokal fullstack
  if (preferEngine === 'server' || (preferEngine === 'auto' && typeof window !== 'undefined' && !window.location.hostname.includes('github.io'))) {
    try {
      let base64Data = '';
      let mimeType = 'image/jpeg';

      if (typeof imageFileOrDataUrl === 'string') {
        if (imageFileOrDataUrl.startsWith('data:')) {
          const match = imageFileOrDataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            base64Data = match[2];
          }
        } else {
          base64Data = imageFileOrDataUrl;
        }
      } else if (imageFileOrDataUrl instanceof Blob || (typeof File !== 'undefined' && imageFileOrDataUrl instanceof File)) {
        mimeType = imageFileOrDataUrl.type || 'image/jpeg';
        base64Data = await fileToBase64(imageFileOrDataUrl);
      }

      if (base64Data) {
        const serverEndpoint = (typeof window !== 'undefined' && window.__NEXT_DATA__?.basePath)
          ? `${window.__NEXT_DATA__.basePath}/api/scan`
          : '/api/scan';

        const serverRes = await fetch(serverEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64Data,
            mimeType,
            transactionType: defaultType,
          }),
        });

        if (serverRes.ok) {
          const contentType = serverRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const resultJson = await serverRes.json();
            if (resultJson.success && resultJson.data) {
              const serverData = resultJson.data;
              const constructedText = [
                serverData.merchant,
                serverData.description,
                serverData.amount ? `Rp ${serverData.amount}` : '',
                serverData.date,
                serverData.reference_number ? `Ref: ${serverData.reference_number}` : '',
                serverData.notes,
              ].filter(Boolean).join('\n');

              recognizedText = constructedText || 'Struk terdeteksi dari server';
              engineUsed = resultJson.ocrEngine || 'RapidOCR Server API';

              notifyProgress(onProgress, 75, 'Menganalisis hasil pembacaan server...', 'parse');
              notifyProgress(onProgress, 100, 'Pemrosesan struk selesai.', 'done');

              const numConfidence = serverData.confidence === 'high' ? 0.9 : serverData.confidence === 'medium' ? 0.65 : 0.35;

              return {
                success: true,
                text: recognizedText,
                confidence: numConfidence,
                preprocessedUrl: preprocessedUrl || undefined,
                engine: engineUsed,
                data: serverData,
              };
            }
          }
        }
      }
    } catch (serverErr) {
      ocrError = serverErr;
    }
  }

  // Strategi B: Pemrosesan Client-Side dengan Tesseract.js (Offline-friendly untuk GitHub Pages)
  if (!recognizedText && typeof window !== 'undefined') {
    try {
      notifyProgress(onProgress, 55, 'Memuat modul OCR Tesseract browser...', 'ocr');
      const Tesseract = await loadTesseract();

      let worker = null;
      let primaryLang = language || 'ind+eng';

      try {
        // Coba inisialisasi dengan bahasa primer 'ind+eng'
        worker = await Tesseract.createWorker(primaryLang, 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              const currentPct = Math.round(55 + (m.progress || 0) * 18);
              notifyProgress(onProgress, Math.min(74, currentPct), 'Mengenali teks struk...', 'ocr');
            }
          },
        });
        engineUsed = `Tesseract.js Client (${primaryLang})`;
      } catch (indErr) {
        // Fallback bahasa Inggris jika paket bahasa Indonesia gagal diunduh
        worker = await Tesseract.createWorker('eng', 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              const currentPct = Math.round(55 + (m.progress || 0) * 18);
              notifyProgress(onProgress, Math.min(74, currentPct), 'Mengenali teks struk (fallback eng)...', 'ocr');
            }
          },
        });
        engineUsed = 'Tesseract.js Client (eng-fallback)';
      }

      // Umpankan citra hasil pra-pemrosesan atau berkas asli
      const inputForOcr = preprocessedUrl || imageFileOrDataUrl;
      const tesseractResult = await worker.recognize(inputForOcr);
      await worker.terminate();

      recognizedText = tesseractResult?.data?.text || '';
    } catch (clientErr) {
      ocrError = clientErr;
    }
  }

  // 75% - Analisis dan ekstraksi data teks
  notifyProgress(onProgress, 75, 'Mengekstrak nominal, tanggal, dan entitas transaksi...', 'parse');

  if (!recognizedText || recognizedText.trim().length === 0) {
    return {
      success: false,
      text: '',
      confidence: 0,
      preprocessedUrl: preprocessedUrl || undefined,
      error: ocrError ? ocrError.message : 'Teks struk tidak terbaca atau citra terlalu buram.',
      data: null,
    };
  }

  const parsedData = parseReceiptText(recognizedText, defaultType);

  // 100% - Selesai
  notifyProgress(onProgress, 100, 'Pemrosesan struk berhasil diselesaikan.', 'done');

  return {
    success: true,
    text: recognizedText,
    confidence: parsedData.confidenceScore,
    preprocessedUrl: preprocessedUrl || undefined,
    engine: engineUsed || 'Client OCR',
    data: parsedData,
  };
}

export default {
  SUPPORTED_MIME_TYPES,
  validateReceiptImage,
  compressImageForOcr,
  preprocessReceiptImage,
  loadTesseract,
  fileToBase64,
  parseCurrencyValue,
  parseReceiptText,
  performReceiptOcr,
};
