/**
 * @file Test Suite Otomatis: Receipt OCR Core Engine
 * Kayla Finance - Agent 06: Receipt OCR Core Specialist
 * 
 * Aturan Sistem:
 * - Tidak menggunakan em dash atau en dash. Gunakan tanda minus biasa (-).
 * - Tidak menggunakan emoticon atau emoji.
 */

import {
  SUPPORTED_MIME_TYPES,
  validateReceiptImage,
  compressImageForOcr,
  preprocessReceiptImage,
  loadTesseract,
  fileToBase64,
  parseReceiptText,
  performReceiptOcr,
} from '../src/lib/receipt-ocr.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] Test ${totalTests}: ${message}`);
  } else {
    failedTests++;
    console.error(`[FAIL] Test ${totalTests}: ${message}`);
  }
}

console.log('================================================================');
console.log('KAYLA FINANCE: RECEIPT OCR CORE ENGINE TEST SUITE');
console.log('================================================================\n');

// -------------------------------------------------------------
// Kelompok 1: Validasi Tipe MIME Citra
// -------------------------------------------------------------
assert(Array.isArray(SUPPORTED_MIME_TYPES), 'SUPPORTED_MIME_TYPES adalah array');
assert(SUPPORTED_MIME_TYPES.includes('image/jpeg'), 'Dukung image/jpeg');
assert(SUPPORTED_MIME_TYPES.includes('image/png'), 'Dukung image/png');
assert(SUPPORTED_MIME_TYPES.includes('image/webp'), 'Dukung image/webp');

const valJpg = validateReceiptImage('image/jpeg');
assert(valJpg.valid === true, 'MIME image/jpeg valid');

const valPng = validateReceiptImage('image/png');
assert(valPng.valid === true, 'MIME image/png valid');

const valWebp = validateReceiptImage('image/webp');
assert(valWebp.valid === true, 'MIME image/webp valid');

const valObj = validateReceiptImage({ type: 'image/jpeg' });
assert(valObj.valid === true, 'Validasi objek berkas MIME image/jpeg valid');

const valPdf = validateReceiptImage('application/pdf');
assert(valPdf.valid === false && typeof valPdf.error === 'string', 'MIME PDF ditolak dengan pesan error');

const valEmpty = validateReceiptImage('');
assert(valEmpty.valid === false, 'MIME kosong ditolak');

const valNull = validateReceiptImage(null);
assert(valNull.valid === false, 'MIME null ditolak');

// -------------------------------------------------------------
// Kelompok 2: Pengaman SSR (Server-Side Rendering Guards)
// -------------------------------------------------------------
async function testSsrGuards() {
  // 1. preprocessReceiptImage tidak crash saat dieksekusi di Node.js (tanpa window)
  const ssrPreprocess = await preprocessReceiptImage('data:image/jpeg;base64,1234');
  assert(ssrPreprocess === 'data:image/jpeg;base64,1234', 'preprocessReceiptImage aman di lingkungan SSR');

  // 2. compressImageForOcr tidak crash di SSR
  const fakeFile = { type: 'image/jpeg', name: 'receipt.jpg' };
  const ssrCompress = await compressImageForOcr(fakeFile);
  assert(ssrCompress === fakeFile, 'compressImageForOcr mengembalikan input aman di SSR');

  // 3. loadTesseract menolak secara terkendali tanpa melempar exception fatal
  let tessRejected = false;
  try {
    await loadTesseract();
  } catch (err) {
    tessRejected = true;
  }
  assert(tessRejected === true, 'loadTesseract melempar error terisolasi saat window tidak ada');
}

// -------------------------------------------------------------
// Kelompok 3: Parsing Teks Struk Belanja Retail Indonesia
// -------------------------------------------------------------
function testReceiptParsing() {
  // Skenario A: Struk Belanja Retail Kasir (Indomaret)
  const indomaretText = `
INDOMARET RAYA DARMO
JL. RAYA DARMO NO 45 SURABAYA
TGL 14 FEBRUARI 2026 10:15
NO STRUK: IDM-89104
--------------------------------
ROTI TAWAR SARI ROTI    15.000
SUSU BEAR BRAND          9.500
AIR MINERAL 600ML        3.500
--------------------------------
TOTAL BELANJA : RP 28.000
TUNAI         : RP 50.000
KEMBALIAN     : RP 22.000
TERIMA KASIH
`;

  const parsedIndomaret = parseReceiptText(indomaretText);
  assert(parsedIndomaret.transaction_type === 'expense', 'Tipe transaksi belanja adalah expense');
  assert(parsedIndomaret.merchant === 'INDOMARET', `Merchant Indomaret terdeteksi: ${parsedIndomaret.merchant}`);
  assert(parsedIndomaret.amount === 28000, `Nominal total belanja tepat 28000: ${parsedIndomaret.amount}`);
  assert(parsedIndomaret.date === '2026-02-14', `Tanggal struk tepat 2026-02-14: ${parsedIndomaret.date}`);
  assert(parsedIndomaret.reference_number === 'IDM-89104', `No struk cocok: ${parsedIndomaret.reference_number}`);
  assert(parsedIndomaret.confidence === 'high', `Tingkat keyakinan tinggi: ${parsedIndomaret.confidence}`);
  assert(typeof parsedIndomaret.confidenceScore === 'number' && parsedIndomaret.confidenceScore >= 0.75, `Confidence score numerik tinggi: ${parsedIndomaret.confidenceScore}`);

  // Skenario B: Struk SPBU Pertamina (Format Thermal Faded)
  const spbuText = `
SPBU PERTAMINA 34-10201
JL. GATOT SUBROTO KAV 12
TANGGAL: 01/03/2026 08:30:12
NO. TRANSAKSI: TRX-992144
PERTAMAX TURBO 98
VOLUME: 25.00 L
HARGA/L: RP 14.400
TOTAL: RP 360.000
PEMBAYARAN: QRIS
`;

  const parsedSpbu = parseReceiptText(spbuText);
  assert(parsedSpbu.merchant.includes('PERTAMINA'), `Merchant SPBU terdeteksi: ${parsedSpbu.merchant}`);
  assert(parsedSpbu.amount === 360000, `Nominal bensin tepat 360000: ${parsedSpbu.amount}`);
  assert(parsedSpbu.date === '2026-03-01', `Tanggal numerik DD/MM/YYYY tepat 2026-03-01: ${parsedSpbu.date}`);
  assert(parsedSpbu.reference_number === 'TRX-992144', `No transaksi cocok: ${parsedSpbu.reference_number}`);

  // Skenario C: Struk Kedai Kopi (Starbucks Coffee)
  const sbuxText = `
STARBUCKS COFFEE INDONESIA
GRAND INDONESIA MALL
2026-04-10 16:45
ORDER ID: SBX-5512
CAFFE LATTE GRANDE   57.000
CARAMEL MACCHIATO    64.000
SUBTOTAL            121.000
PB1 10%              12.100
GRAND TOTAL : RP 133.100
`;

  const parsedSbux = parseReceiptText(sbuxText);
  assert(parsedSbux.merchant === 'STARBUCKS', `Merchant Starbucks terdeteksi: ${parsedSbux.merchant}`);
  assert(parsedSbux.amount === 133100, `Grand total Starbucks tepat 133100: ${parsedSbux.amount}`);
  assert(parsedSbux.date === '2026-04-10', `Tanggal ISO cocok: ${parsedSbux.date}`);
  assert(parsedSbux.reference_number === 'SBX-5512', `Order ID cocok: ${parsedSbux.reference_number}`);

  // Skenario D: Bukti Penerimaan / Transfer Masuk (Income)
  const incomeText = `
TRANSFER MASUK DITERIMA
DARI: PT TEKNOLOGI KARYA
NOMINAL: RP 5.500.000,00
TANGGAL: 25 MEI 2026
NO. REFERENSI: BATCH-88120
`;

  const parsedIncome = parseReceiptText(incomeText, 'expense');
  assert(parsedIncome.transaction_type === 'income', `Transfer masuk terdeteksi sebagai income: ${parsedIncome.transaction_type}`);
  assert(parsedIncome.amount === 5500000, `Nominal income tepat 5500000: ${parsedIncome.amount}`);
  assert(parsedIncome.date === '2026-05-25', `Tanggal income tepat 2026-05-25: ${parsedIncome.date}`);
}

// -------------------------------------------------------------
// Kelompok 4: Pipeline Eksekusi OCR Fleksibel & Progress Callback
// -------------------------------------------------------------
async function testPerformReceiptOcr() {
  const recordedProgress = [];
  const recordedMessages = [];

  const onProgress = (item) => {
    recordedProgress.push(+item);
    recordedMessages.push(item.message);
  };

  const sampleDataUrl = 'data:image/jpeg;base64,VGVzdCByZWNlaXB0IGRhdGE=';
  const result = await performReceiptOcr(sampleDataUrl, onProgress);

  assert(typeof result === 'object' && result !== null, 'performReceiptOcr mengembalikan objek');
  assert(typeof result.success === 'boolean', 'Properti success adalah boolean');
  assert(typeof result.confidence === 'number', 'Properti confidence adalah number');
  assert(typeof result.text === 'string', 'Properti text adalah string');

  // Periksa apakah progres dilaporkan dari awal sampai akhir
  assert(recordedProgress.length >= 3, `Minimal 3 checkpoint progres tercatat: ${recordedProgress.length}`);
  assert(recordedProgress[0] === 0, `Progres awal bernilai 0%: ${recordedProgress[0]}`);
  assert(recordedProgress.includes(25), 'Checkpoint pra-pemrosesan 25% terpanggil');
  assert(recordedProgress.includes(50), 'Checkpoint pembacaan OCR 50% terpanggil');

  // Input kosong ditangani dengan respon terstruktur
  const emptyResult = await performReceiptOcr(null);
  assert(emptyResult.success === false, 'Input null menghasilkan success: false');
  assert(emptyResult.confidence === 0, 'Input null menghasilkan confidence: 0');
  assert(typeof emptyResult.error === 'string', 'Input null menyertakan pesan error deskriptif');
}

// -------------------------------------------------------------
// Eksekusi Semua Kelompok Uji
// -------------------------------------------------------------
async function runAll() {
  await testSsrGuards();
  testReceiptParsing();
  await testPerformReceiptOcr();

  console.log('\n================================================================');
  console.log(`HASIL TEST SUITE RECEIPT OCR: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL ${totalTests})`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAll();
