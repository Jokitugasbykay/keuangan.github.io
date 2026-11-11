/**
 * @file Test Suite Verifikasi Ketepatan OCR, Parser Finansial, dan Rekonsiliasi Faktur
 * Kayla Finance - Pengujian Mendalam Pencegahan Misread Finansial (Critical OCR Fix)
 *
 * Aturan:
 * - Tidak menggunakan em dash atau en dash. Gunakan tanda minus biasa (-).
 * - Tidak menggunakan emoticon atau emoji.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  parseReceipt,
  parseReceiptText,
  cleanCurrencyAmount,
  cleanPercentage,
  extractLineItems,
  extractFinancialSummary,
  extractReceiptNumber,
  extractMerchant,
} from '../src/lib/receipt-parser.js';

import { preprocessReceiptImage } from '../src/lib/receipt-ocr.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${message}`);
  }
}

console.log('================================================================');
console.log('KAYLA FINANCE: CRITICAL OCR FINANCIAL ACCURACY & RECONCILIATION');
console.log('================================================================\n');

// ============================================================================
// SUITE 1: REPRODUKSI & VERIFIKASI KASUS INVOICE DILAPORKAN (Rp25 JUTA & Rp6.886)
// ============================================================================
console.log('--- SUITE 1: CRITICAL INVOICE MISREAD RESOLUTION (25.000.000 vs 6.886) ---');

const reportedInvoiceText = `
PT MITRA TEKNOLOGI UTAMA
FAKTUR PENJUALAN
No: 6.886
Tanggal: 09/11/2026
Jatuh Tempo: 23/11/2026

Subtotal
Rp25,000,000.00

Total
Rp25,000,000.00

Jumlah Tagih
Rp14,750,000.00
`;

const resReported = parseReceipt(reportedInvoiceText);
const resReportedText = parseReceiptText(reportedInvoiceText);

// 1.1 Pastikan 6.886 BUKAN menjadi Grand Total atau Subtotal
assert(resReported.total === 25000000, `Grand total terurai Rp25.000.000 (bukan 6.886) -> Total: ${resReported.total}`);
assert(resReported.subtotal === 25000000, `Subtotal terurai Rp25.000.000 (bukan 0 atau 6.886) -> Subtotal: ${resReported.subtotal}`);
assert(resReported.amount_due === 14750000, `Jumlah Tagih (Amount Due) terurai tepat Rp14.750.000 -> Amount Due: ${resReported.amount_due}`);
assert(resReported.receipt_no === '6.886', `Nomor faktur 6.886 teridentifikasi sebagai nomor referensi -> No: ${resReported.receipt_no}`);

// 1.2 Pastikan nomor faktur 6.886 TIDAK masuk sebagai line items belanja
assert(resReported.line_items.length === 0, `Tidak ada line items palsu dari nomor faktur -> Items: ${resReported.line_items.length}`);
const fakeItem = resReported.line_items.find((it) => it.name.includes('6.886') || it.name.includes('No:'));
assert(!fakeItem, 'Nomor faktur tidak tercemar sebagai item belanja');

// 1.3 Klasifikasi tipe dokumen & status penagihan
assert(resReported.document_type === 'invoice', `Tipe dokumen terklasifikasi sebagai invoice/faktur -> ${resReported.document_type}`);
assert(resReported.payment_status === 'unpaid', `Status pembayaran terdeteksi belum lunas (unpaid) -> ${resReported.payment_status}`);
assert(resReported.needs_review === true, `Scan ditandai NEEDS REVIEW karena faktur belum lunas -> ${resReported.needs_review}`);
assert(resReported.warnings.some((w) => w.includes('Faktur/Invoice') || w.includes('14.750.000')), 'Peringatan faktur belum lunas tercantum jelas');

// 1.4 Kompatibilitas adapter parseReceiptText untuk ScanModal
assert(resReportedText.grand_total === 25000000, `Adapter grand_total tepat Rp25.000.000 -> ${resReportedText.grand_total}`);
assert(resReportedText.subtotal === 25000000, `Adapter subtotal tepat Rp25.000.000 -> ${resReportedText.subtotal}`);
assert(resReportedText.amount_due === 14750000, `Adapter amount_due tepat Rp14.750.000 -> ${resReportedText.amount_due}`);
assert(resReportedText.document_type === 'invoice', `Adapter document_type tepat invoice -> ${resReportedText.document_type}`);
assert(resReportedText.needs_review === true, `Adapter needs_review bernilai true -> ${resReportedText.needs_review}`);
assert(resReportedText.recorded_payment_amount === 0, `Proteksi saldo: recorded_payment_amount adalah 0 untuk tagihan belum lunas -> ${resReportedText.recorded_payment_amount}`);

console.log('');

// ============================================================================
// SUITE 1B: KASUS EKSKLUSIF ANDROID USER (25JT, DP 10JT, LUNAS 250RB, TERTAGIH 14.75JT)
// ============================================================================
console.log('--- SUITE 1B: ANDROID SCREENSHOT RECONCILIATION & REJECTION OF ": LUNAS RO" ---');

const androidScreenshotInvoice = `
PT MITRA BANGUNAN SEJAHTERA
FAKTUR PENJUALAN
No. Faktur: INV-2026-88192
Tanggal: 11/11/2026

Subtotal: Rp 25,000,000.00
Down Payment: Rp 10,000,000.00
: Lunas Ro 250.000,00
Jumlah Tertagih: Rp 14,750,000.00
Total Faktur: Rp 25.000.000,00
`;

const resAndroid = parseReceipt(androidScreenshotInvoice);
const resAndroidText = parseReceiptText(androidScreenshotInvoice);

// Verifikasi 1: Pencegahan mutlak pembuatan item ": Lunas Ro"
const hasLunasItem = resAndroid.line_items.some((it) => /lunas|ro|dp|tertagih/i.test(it.name));
assert(!hasLunasItem, 'Baris ": Lunas Ro" TIDAK dibuat sebagai line item belanja');
assert(resAndroid.line_items.length === 0, `Tidak ada line items belanja semu pada header faktur -> Items: ${resAndroid.line_items.length}`);

// Verifikasi 2: Nilai finansial terpisah dan akurat
assert(resAndroid.total === 25000000, `Total nilai faktur Rp25.000.000 -> Total: ${resAndroid.total}`);
assert(resAndroid.invoice_gross === 25000000, `Nilai Faktur (Gross) Rp25.000.000 -> Gross: ${resAndroid.invoice_gross}`);
assert(resAndroid.down_payment === 10000000, `Uang Muka (DP) Rp10.000.000 -> DP: ${resAndroid.down_payment}`);
assert(resAndroid.previously_paid === 250000, `Pembayaran terdahulu / lunas Rp250.000 -> Previously Paid: ${resAndroid.previously_paid}`);
assert(resAndroid.amount_paid === 10250000, `Total telah dibayar (DP + Lunas) Rp10.250.000 -> Paid: ${resAndroid.amount_paid}`);
assert(resAndroid.amount_due === 14750000, `Jumlah tertagih Rp14.750.000 -> Due: ${resAndroid.amount_due}`);

// Verifikasi 3: Rekonsiliasi integer tepat 25.000.000 - 10.250.000 = 14.750.000
assert(resAndroid.reconciliation_mismatch === false, `Formula rekonsiliasi cocok tanpa mismatch -> mismatch: ${resAndroid.reconciliation_mismatch}`);
assert(resAndroid.payment_status === 'partial', `Status pembayaran terdeteksi partial -> status: ${resAndroid.payment_status}`);
assert(resAndroid.document_type === 'invoice', `Tipe dokumen terdeteksi invoice -> type: ${resAndroid.document_type}`);

// Verifikasi 4: Proteksi saldo bank (recorded_payment_amount default 0)
assert(resAndroid.recorded_payment_amount === 0, `Saldo bank TIDAK dipotong otomatis (recorded_payment_amount = 0) -> ${resAndroid.recorded_payment_amount}`);
assert(resAndroid.needs_review === true, `Memerlukan review karena ada tagihan aktif -> needs_review: ${resAndroid.needs_review}`);

// Verifikasi 5: Preservasi teks mentah untuk audit manual
assert(typeof resAndroid.raw_text === 'string' && resAndroid.raw_text.includes('PT MITRA BANGUNAN'), 'Teks mentah tersimpan di raw_text untuk audit');
assert(typeof resAndroid.source_text === 'string' && resAndroid.source_text.includes('14,750,000.00'), 'Teks sumber tersimpan di source_text');

// Verifikasi 6: Adapter parseReceiptText untuk komponen React ScanModal
assert(resAndroidText.invoice_gross === 25000000, `Adapter invoice_gross tepat 25.000.000 -> ${resAndroidText.invoice_gross}`);
assert(resAndroidText.down_payment === 10000000, `Adapter down_payment tepat 10.000.000 -> ${resAndroidText.down_payment}`);
assert(resAndroidText.previously_paid === 250000, `Adapter previously_paid tepat 250.000 -> ${resAndroidText.previously_paid}`);
assert(resAndroidText.amount_due === 14750000, `Adapter amount_due tepat 14.750.000 -> ${resAndroidText.amount_due}`);
assert(resAndroidText.recorded_payment_amount === 0, `Adapter recorded_payment_amount tepat 0 -> ${resAndroidText.recorded_payment_amount}`);

console.log('');

// ============================================================================
// SUITE 2: NORMALISASI MATA UANG CAMPURAN (MIXED CURRENCY FORMATS)
// ============================================================================
console.log('--- SUITE 2: MIXED CURRENCY FORMAT NORMALIZATION ---');

// Format Indonesia titik ribuan desimal kosong
assert(cleanCurrencyAmount('Rp25.000.000') === 25000000, 'Format Rp25.000.000 terurai 25000000');
assert(cleanCurrencyAmount('Rp 25.000.000') === 25000000, 'Format Rp 25.000.000 terurai 25000000');

// Format Internasional koma ribuan desimal titik
assert(cleanCurrencyAmount('Rp25,000,000.00') === 25000000, 'Format Rp25,000,000.00 terurai 25000000');
assert(cleanCurrencyAmount('25,000,000.00') === 25000000, 'Format 25,000,000.00 terurai 25000000');
assert(cleanCurrencyAmount('Rp14,750,000.00') === 14750000, 'Format Rp14,750,000.00 terurai 14750000');

// Format Indonesia titik ribuan desimal koma
assert(cleanCurrencyAmount('Rp 25.000.000,00') === 25000000, 'Format Rp 25.000.000,00 terurai 25000000');
assert(cleanCurrencyAmount('14.750.000,00') === 14750000, 'Format 14.750.000,00 terurai 14750000');

// Format struk ritel sehari-hari
assert(cleanCurrencyAmount('17.387') === 17387, 'Format 17.387 terurai 17387');
assert(cleanCurrencyAmount('1.739') === 1739, 'Format 1.739 terurai 1739');
assert(cleanCurrencyAmount('15.648') === 15648, 'Format 15.648 terurai 15648');

// Format negatif & akuntansi dalam kurung
assert(cleanCurrencyAmount('-1.739') === 1739, 'Format minus -1.739 terurai 1739');
assert(cleanCurrencyAmount('(1.739)') === 1739, 'Format kurung (1.739) terurai 1739');
assert(cleanCurrencyAmount('(Rp 25.000.000,00)') === 25000000, 'Format kurung (Rp 25.000.000,00) terurai 25000000');

// Format spasi OCR di antara separator dan digit
assert(cleanCurrencyAmount('Rp 25.000. 000') === 25000000, 'Format spasi OCR 25.000. 000 terurai 25000000');
assert(cleanCurrencyAmount('Rp 25,000, 000.00') === 25000000, 'Format spasi OCR 25,000, 000.00 terurai 25000000');

console.log('');

// ============================================================================
// SUITE 3: PENCEGAHAN NOMOR ARBITRER / METADATA DARI FINANCIAL TOTALS
// ============================================================================
console.log('--- SUITE 3: ARBITRARY METADATA FILTERING ---');

const invoiceWithMetadata = `
PT SOLUSI BISNIS DIGITAL
FAKTUR PENJUALAN #INV-2026-9041
No. Pelanggan: CUST-88391
No. Rekening BCA: 8820491823
NPWP: 01.492.102.4-012.000
Telp: 021-5829104

ITEM JASA:
PENGEMBANGAN SISTEM WEB   1   10.000.000   10.000.000

SUBTOTAL: Rp 10.000.000
PPN 11%: Rp 1.100.000
TOTAL FAKTUR: Rp 11.100.000
SISA TAGIHAN: Rp 11.100.000
`;

const resMeta = parseReceipt(invoiceWithMetadata);

assert(resMeta.total === 11100000, `Total terurai Rp11.100.000 (bukan nomor rekening atau telp) -> Total: ${resMeta.total}`);
assert(resMeta.subtotal === 10000000, `Subtotal terurai Rp10.000.000 -> Subtotal: ${resMeta.subtotal}`);
assert(resMeta.tax === 1100000, `PPN terurai Rp1.100.000 -> PPN: ${resMeta.tax}`);
assert(resMeta.amount_due === 11100000, `Sisa Tagihan terurai Rp11.100.000 -> Sisa: ${resMeta.amount_due}`);
assert(resMeta.line_items.length === 1, `Line items hanya 1 item jasa nyata -> Items: ${resMeta.line_items.length}`);
assert(resMeta.line_items[0].name === 'PENGEMBANGAN SISTEM WEB', `Nama item jasa tepat -> ${resMeta.line_items[0].name}`);

// Pastikan tidak ada metadata yang masuk sebagai item
const metaItemMatches = resMeta.line_items.filter((it) =>
  /bca|rekening|npwp|telp|inv|cust/i.test(it.name)
);
assert(metaItemMatches.length === 0, 'Nomor rekening, telepon, dan NPWP tidak menjadi item belanja');

console.log('');

// ============================================================================
// SUITE 4: INVOICE VS RECEIPT & REKONSILIASI PEMBAYARAN SEBAGIAN (DP)
// ============================================================================
console.log('--- SUITE 4: INVOICE DOWN PAYMENT & RECONCILIATION ---');

const partialInvoiceText = `
CV MAKMUR JAYA SENTOSA
FAKTUR TAGIHAN
No: INV/2026/11/0491
Tanggal: 10/11/2026

Pekerjaan Renovasi Kantor Tahap 1   1   50.000.000   50.000.000

Subtotal: Rp50,000,000.00
Uang Muka (DP 30%): Rp15,000,000.00
Jumlah Tagih: Rp35,000,000.00
Total: Rp50,000,000.00
`;

const resPartial = parseReceipt(partialInvoiceText);

assert(resPartial.document_type === 'invoice', `Tipe dokumen invoice terdeteksi -> ${resPartial.document_type}`);
assert(resPartial.total === 50000000, `Total nilai faktur Rp50.000.000 -> Total: ${resPartial.total}`);
assert(resPartial.amount_paid === 15000000, `Uang muka / DP terurai Rp15.000.000 -> DP: ${resPartial.amount_paid}`);
assert(resPartial.amount_due === 35000000, `Sisa tagihan (amount due) terurai Rp35.000.000 -> Sisa: ${resPartial.amount_due}`);
assert(resPartial.payment_status === 'partial', `Status pembayaran terdeteksi partial (pembayaran sebagian) -> ${resPartial.payment_status}`);
assert(resPartial.needs_review === true, `Invoice berstatus partial memerlukan review -> ${resPartial.needs_review}`);

console.log('');

// ============================================================================
// SUITE 5: KIMIA FARMA REFERENCE RECEIPT (REGRESI TIDAK BOLEH RUSAK)
// ============================================================================
console.log('--- SUITE 5: KIMIA FARMA REFERENCE REGRESSION ---');

const kimiaFarmaText = `
KIMIA FARMA APOTEK
JL. DIPONEGORO NO. 30 SURABAYA
TELP: 031-5678901
TGL: 09/11/2026 08:42:15
NO: KF-20261109-0842
KASIR: SITI
========================================
HANSAPLAST AQUA PROTECT B.S030
   1   17.387    17.387
DISC 10%        -1.739
----------------------------------------
HARGA SUDAH TERMASUK PPN 11%
DPP: 14.097
PPN: 1.551
SUBTOTAL: 17.387
TOTAL DISKON: 1.739
GRAND TOTAL: 15.648
KARTU DEBIT: 15.648
KEMBALIAN: 0
========================================
TERIMA KASIH ATAS KUNJUNGAN ANDA
SEMOGA LEKAS SEMBUH
`;

const resKF = parseReceipt(kimiaFarmaText);

assert(resKF.merchant === 'Kimia Farma', `Merchant Kimia Farma tepat -> ${resKF.merchant}`);
assert(resKF.subtotal === 17387, `Subtotal tepat Rp17.387 -> Subtotal: ${resKF.subtotal}`);
assert(resKF.discount === 1739, `Diskon tepat Rp1.739 -> Diskon: ${resKF.discount}`);
assert(resKF.tax_included === true, `PPN termasuk terdeteksi true -> ${resKF.tax_included}`);
assert(resKF.tax === 1551, `PPN 11% terurai Rp1.551 -> PPN: ${resKF.tax}`);
assert(resKF.total === 15648, `Grand total tepat Rp15.648 -> Grand Total: ${resKF.total}`);
assert(resKF.payment_method === 'Kartu Debit', `Metode bayar Kartu Debit tepat -> ${resKF.payment_method}`);
assert(resKF.document_type === 'receipt', `Dokumen Kimia Farma adalah receipt belanja -> ${resKF.document_type}`);
assert(resKF.reconciliation_mismatch === false, `Rekonsiliasi Kimia Farma sinkron tanpa mismatch -> ${resKF.reconciliation_mismatch}`);

console.log('');

// ============================================================================
// SUITE 6: REKONSILIASI MISMATCH & PERINGATAN KETIDAKPASTIAN (SAFETY GATES)
// ============================================================================
console.log('--- SUITE 6: RECONCILIATION MISMATCH & SAFETY GATES ---');

const inconsistentReceiptText = `
TOKO ELEKTRONIK SEJAHTERA
TANGGAL: 10/11/2026
NO STRUK: EL-8910

KABEL HDMI 2M   1   50.000   50.000
MOUSE WIRELESS  1  100.000  100.000

SUBTOTAL: 150.000
POTONGAN: 0
TOTAL: 250.000
`;

const resInconsistent = parseReceipt(inconsistentReceiptText);

assert(resInconsistent.reconciliation_mismatch === true, `Mismatch terdeteksi (total cetak 250k vs hitungan 150k) -> ${resInconsistent.reconciliation_mismatch}`);
assert(resInconsistent.needs_review === true, `Status scan memerlukan review manual (needs_review = true) -> ${resInconsistent.needs_review}`);
assert(resInconsistent.warnings.some((w) => w.includes('selisih rekonsiliasi')), 'Peringatan selisih rekonsiliasi muncul di warnings');

console.log('');

// ============================================================================
// SUITE 7: IMAGE ROTATION & ORIENTATION CHECK
// ============================================================================
console.log('--- SUITE 7: IMAGE ROTATION RESILIENCE ---');

const rotationDegrees = [0, 90, 180, 270];
for (const deg of rotationDegrees) {
  const dummyDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  try {
    const res = await preprocessReceiptImage(dummyDataUrl, { rotateDegrees: deg });
    assert(typeof res === 'string' && res.startsWith('data:image/'), `Rotasi ${deg} derajat aman dieksekusi`);
  } catch (err) {
    assert(false, `Rotasi ${deg} derajat gagal: ${err.message}`);
  }
}

console.log('');

// ============================================================================
// SUITE 8: INTEGRITAS DATABASE & SAFETY GUARANTEE
// ============================================================================
console.log('--- SUITE 8: DATABASE INTEGRITY CHECK ---');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');
const dbContent = fs.readFileSync(dbPath, 'utf8');
const currentDbHash = crypto.createHash('sha256').update(dbContent).digest('hex').toUpperCase();
const expectedDbHash = '9E08822CB3787DC9429090FCC626B6A8EED3454AB2A18E354D591690E1ABD8A4';

assert(currentDbHash === expectedDbHash, `Hash data/db.json tetap utuh tidak berubah -> ${currentDbHash}`);

console.log('\n================================================================');
console.log(`TOTAL SUITE TEST: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL ${totalTests})`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
