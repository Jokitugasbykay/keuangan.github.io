/**
 * @file Test Suite Otomatis: Pengurai dan Kategorisasi Struk Cerdas (Receipt Parser)
 * Kayla Finance - Agent 07: Receipt Parser Specialist
 *
 * Menguji 18 skenario pengujian komprehensif:
 * 1. Parsing struk Indomaret dengan diskon dan PPN.
 * 2. Parsing struk Alfamart dengan item multi-qty dua baris.
 * 3. Parsing struk Alfamidi dengan PPN dan pembayaran QRIS.
 * 4. Parsing struk Superindo dengan aneka sayur, buah, daging, dan diskon.
 * 5. Parsing struk Hypermart / Transmart format panjang dengan nomor faktur dan kasir.
 * 6. Parsing struk kafe modern (Starbucks) dengan PB1 dan kartu debit.
 * 7. Parsing struk kafe lokal (Kopi Kenangan) dengan QRIS / GoPay.
 * 8. Parsing struk resto cepat saji (McDonald's) dengan paket makanan dan PB1 resto.
 * 9. Parsing struk KFC dengan Paket Super Besar dan ShopeePay.
 * 10. Ekstraksi rincian barang (line items) lengkap: name, quantity, unit_price, total_price, category_suggestion.
 * 11. Kategorisasi otomatis cerdas ke 5 kategori pengeluaran Kayla Finance.
 * 12. Ringkasan finansial dan konsistensi matematika (Subtotal, Diskon, Pajak, Total, Cash, Change).
 * 13. Deteksi ragam metode pembayaran Indonesia (Tunai, QRIS, Debit BCA, Mandiri, ShopeePay, GoPay, OVO, DANA).
 * 14. Anti-duplikasi struk via Receipt Hash Fingerprint deterministik.
 * 15. Penanganan receipt fingerprint deterministik pada data struk parsial.
 * 16. Toleransi kesalahan: Teks kosong, null, undefined, dan whitespace tanpa crash.
 * 17. Toleransi kesalahan: Teks rusak / noise OCR acak tanpa crash dengan fallback aman.
 * 18. Perhitungan skor keyakinan (Confidence Score 0-100% dan level high/medium/low).
 */

import {
  parseReceipt,
  generateReceiptFingerprint,
  isDuplicateReceipt,
  categorizeItem,
  extractLineItems,
  extractFinancialSummary,
  extractMerchant,
  extractDateTime,
  extractReceiptNumber,
  extractPaymentMethod,
  calculateConfidenceScore,
  cleanCurrencyAmount,
  RECEIPT_CATEGORIES,
  CATEGORY_ID_MAP,
} from '../src/lib/receipt-parser.js';

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
console.log('KAYLA FINANCE: RECEIPT PARSER & CATEGORIZATION TEST SUITE');
console.log('================================================================\n');

// -------------------------------------------------------------
// Skenario 1: Parsing struk Indomaret dengan diskon dan PPN
// -------------------------------------------------------------
const INDOMARET_RECEIPT = `
INDOMARET
PT INDOMARCO PRISMATAMA
JL. RAYA DARMO NO. 12 SURABAYA
NPWP: 01.337.994.2-054.000
================================
TGL: 06/11/2026 14:35:10  KASIR: SITI
NO. STRUK: 061126-10294
--------------------------------
INDOMIE GOR SPEC 85G   2   3.100   6.200
ULTRA MILK COKLAT 250ML 1  7.500   7.500
SARI ROTI TAWAR KUPAS  1  15.000  15.000
--------------------------------
SUBTOTAL                         28.700
POTONGAN HARGA                    2.000
PPN 11%                           2.670
TOTAL                            26.700
TUNAI                            50.000
KEMBALI                          23.300
================================
LAYANAN KONSUMEN SMS 0816 500 580
TERIMA KASIH DAN SELAMAT BELANJA
`;

const resIndomaret = parseReceipt(INDOMARET_RECEIPT);

assert(resIndomaret.success === true, 'Struk Indomaret berhasil diurai');
assert(resIndomaret.merchant === 'Indomaret', `Merchant Indomaret terdeteksi tepat: ${resIndomaret.merchant}`);
assert(resIndomaret.date === '2026-11-06', `Tanggal Indomaret terurai tepat: ${resIndomaret.date}`);
assert(resIndomaret.time === '14:35:10', `Waktu Indomaret terurai tepat: ${resIndomaret.time}`);
assert(resIndomaret.receipt_no === '061126-10294', `Nomor struk Indomaret cocok: ${resIndomaret.receipt_no}`);
assert(resIndomaret.total === 26700, `Grand total Indomaret tepat: ${resIndomaret.total}`);
assert(resIndomaret.subtotal === 28700, `Subtotal Indomaret tepat: ${resIndomaret.subtotal}`);
assert(resIndomaret.discount === 2000, `Diskon Indomaret tepat: ${resIndomaret.discount}`);
assert(resIndomaret.tax === 2670, `PPN Indomaret tepat: ${resIndomaret.tax}`);
assert(resIndomaret.payment_method === 'Tunai', `Metode bayar Tunai tepat: ${resIndomaret.payment_method}`);
assert(resIndomaret.cash_paid === 50000 && resIndomaret.change === 23300, `Tunai dan kembalian tepat: ${resIndomaret.cash_paid} / ${resIndomaret.change}`);
assert(resIndomaret.line_items.length === 3, `Jumlah item Indomaret tepat: ${resIndomaret.line_items.length}`);

// -------------------------------------------------------------
// Skenario 2: Parsing struk Alfamart dengan item multi-qty dua baris
// -------------------------------------------------------------
const ALFAMART_RECEIPT = `
ALFAMART
PT SUMBER ALFARIA TRIJAYA TBK
JL. MERDEKA NO. 45 BANDUNG
--------------------------------
06.11.26-15:20  KSR: BUDI
BON: 48923-01
--------------------------------
AQUA AIR MINERAL 600ML
   2 PCS x 3.500                 7.000
CHITATO SAPI PANGGANG 68G
   1 PCS x 11.500               11.500
RINSO ANTI NODA 770G
   1 PCS x 22.000               22.000
--------------------------------
SUBTOTAL                        40.500
POTONGAN HARGA                       0
PPN                              4.009
TOTAL                           40.500
DEBIT BCA                       40.500
KEMBALI                              0
================================
TERIMA KASIH TELAH BERBELANJA
`;

const resAlfamart = parseReceipt(ALFAMART_RECEIPT);

assert(resAlfamart.success === true, 'Struk Alfamart berhasil diurai');
assert(resAlfamart.merchant === 'Alfamart', `Merchant Alfamart terdeteksi tepat: ${resAlfamart.merchant}`);
assert(resAlfamart.date === '2026-11-06', `Tanggal Alfamart format 06.11.26 tepat: ${resAlfamart.date}`);
assert(resAlfamart.receipt_no === '48923-01', `Nomor bon Alfamart tepat: ${resAlfamart.receipt_no}`);
assert(resAlfamart.total === 40500, `Grand total Alfamart tepat: ${resAlfamart.total}`);
assert(resAlfamart.payment_method === 'Debit BCA', `Metode bayar Debit BCA tepat: ${resAlfamart.payment_method}`);
assert(resAlfamart.line_items.length === 3, `3 line items Alfamart terdeteksi: ${resAlfamart.line_items.length}`);

const aquaItem = resAlfamart.line_items.find((it) => it.name.includes('AQUA'));
assert(aquaItem && aquaItem.quantity === 2 && aquaItem.unit_price === 3500 && aquaItem.total_price === 7000,
  `Multi-qty Alfamart tepat: qty=${aquaItem?.quantity}, unit=${aquaItem?.unit_price}, total=${aquaItem?.total_price}`);

// -------------------------------------------------------------
// Skenario 3: Parsing struk Alfamidi dengan PPN dan QRIS
// -------------------------------------------------------------
const ALFAMIDI_RECEIPT = `
ALFAMIDI
PT MIDI UTAMA INDONESIA TBK
JL. PANGLIMA POLIM JAKARTA
TGL 07/11/2026 10:15
NO STRUK: MIDI-881294
--------------------------------
SUNCO MINYAK GORENG 2L  1  38.500  38.500
GULA PASIR GULAKU 1KG   2  17.500  35.000
--------------------------------
TOTAL HARGA                        73.500
PPN 11%                             7.283
TOTAL BELANJA                      73.500
QRIS                               73.500
KEMBALIAN                               0
`;

const resAlfamidi = parseReceipt(ALFAMIDI_RECEIPT);

assert(resAlfamidi.success === true, 'Struk Alfamidi berhasil diurai');
assert(resAlfamidi.merchant === 'Alfamidi', `Merchant Alfamidi tepat: ${resAlfamidi.merchant}`);
assert(resAlfamidi.receipt_no === 'MIDI-881294', `Nomor struk Alfamidi tepat: ${resAlfamidi.receipt_no}`);
assert(resAlfamidi.total === 73500, `Total belanja Alfamidi tepat: ${resAlfamidi.total}`);
assert(resAlfamidi.payment_method === 'QRIS', `Metode bayar QRIS tepat: ${resAlfamidi.payment_method}`);
assert(resAlfamidi.category_suggestion === RECEIPT_CATEGORIES.GROCERIES, `Kategori Alfamidi Groceries tepat: ${resAlfamidi.category_suggestion}`);

// -------------------------------------------------------------
// Skenario 4: Parsing struk Superindo dengan sayur, buah, daging
// -------------------------------------------------------------
const SUPERINDO_RECEIPT = `
LION SUPER INDO
SUPERINDO CABANG KELAPA GADING
TANGGAL: 05-11-2026  17:45:00
FAKTUR: SI-20261105-0912
--------------------------------
DAGING AYAM BROILER 1KG  1  36.900  36.900
PISANG SUNPRIDE 1KG      1  22.500  22.500
BAYAM HIJAU SEGAR        2   4.500   9.000
MAMA LEMON 780ML         1  12.000  12.000
--------------------------------
SUBTOTAL                            80.400
DISKON MEMBER                        5.400
TOTAL AKHIR                         75.000
DEBIT MANDIRI                       75.000
`;

const resSuperindo = parseReceipt(SUPERINDO_RECEIPT);

assert(resSuperindo.success === true, 'Struk Superindo berhasil diurai');
assert(resSuperindo.merchant === 'Superindo', `Merchant Superindo tepat: ${resSuperindo.merchant}`);
assert(resSuperindo.date === '2026-11-05', `Tanggal Superindo tepat: ${resSuperindo.date}`);
assert(resSuperindo.receipt_no === 'SI-20261105-0912', `Nomor faktur Superindo tepat: ${resSuperindo.receipt_no}`);
assert(resSuperindo.subtotal === 80400 && resSuperindo.discount === 5400 && resSuperindo.total === 75000,
  `Ringkasan finansial Superindo tepat: Sub=${resSuperindo.subtotal}, Disc=${resSuperindo.discount}, Tot=${resSuperindo.total}`);
assert(resSuperindo.payment_method === 'Debit Mandiri', `Metode bayar Debit Mandiri tepat: ${resSuperindo.payment_method}`);

// -------------------------------------------------------------
// Skenario 5: Parsing struk Hypermart / Transmart format panjang
// -------------------------------------------------------------
const TRANSMART_RECEIPT = `
TRANSMART CARREFOUR
PT TRANS RETAIL INDONESIA
OUTLET CIKOKOL TANGERANG
TGL: 04/11/2026 19:12
KASIR: RINI  POS: 04
NO. FAKTUR: TR-89104-2026
--------------------------------
BIMOLI MINYAK GORENG 2L 1 35.000 35.000
BERAS SETRA RAMOS 5KG   1 72.000 72.000
DOWNY PEWANGI 650ML     1 28.000 28.000
--------------------------------
TOTAL HARGA                    135.000
PPN                             13.378
TOTAL TRANSAKSI                135.000
KARTU KREDIT                   135.000
`;

const resTransmart = parseReceipt(TRANSMART_RECEIPT);

assert(resTransmart.success === true, 'Struk Transmart berhasil diurai');
assert(resTransmart.merchant === 'Transmart', `Merchant Transmart tepat: ${resTransmart.merchant}`);
assert(resTransmart.receipt_no === 'TR-89104-2026', `Nomor faktur Transmart tepat: ${resTransmart.receipt_no}`);
assert(resTransmart.total === 135000, `Total transaksi Transmart tepat: ${resTransmart.total}`);
assert(resTransmart.payment_method === 'Kartu Kredit', `Metode bayar Kartu Kredit tepat: ${resTransmart.payment_method}`);

// -------------------------------------------------------------
// Skenario 6: Parsing struk kafe modern (Starbucks)
// -------------------------------------------------------------
const STARBUCKS_RECEIPT = `
STARBUCKS COFFEE
PT SARI COFFEE INDONESIA
STORE 104 GRAND INDONESIA
DATE: 06/11/2026 09:30
CHECK: 49021
--------------------------------
1 CAFFE LATTE (GRANDE)           52.000
1 CARAMEL MACCHIATO             61.000
1 CHOCOLATE CROISSANT           38.000
--------------------------------
SUBTOTAL                       151.000
PB1 10%                         15.100
GRAND TOTAL                    166.100
KARTU DEBIT                    166.100
`;

const resStarbucks = parseReceipt(STARBUCKS_RECEIPT);

assert(resStarbucks.success === true, 'Struk Starbucks berhasil diurai');
assert(resStarbucks.merchant === 'Starbucks', `Merchant Starbucks tepat: ${resStarbucks.merchant}`);
assert(resStarbucks.receipt_no === '49021', `Nomor check Starbucks tepat: ${resStarbucks.receipt_no}`);
assert(resStarbucks.subtotal === 151000 && resStarbucks.tax === 15100 && resStarbucks.total === 166100,
  `Finansial Starbucks tepat: Sub=${resStarbucks.subtotal}, PB1=${resStarbucks.tax}, Tot=${resStarbucks.total}`);
assert(resStarbucks.category_suggestion === RECEIPT_CATEGORIES.FNB, `Kategori Starbucks F&B tepat: ${resStarbucks.category_suggestion}`);
assert(resStarbucks.category_id === 'cat-exp-food', `Category ID Kayla Finance F&B tepat: ${resStarbucks.category_id}`);

// -------------------------------------------------------------
// Skenario 7: Parsing struk kafe lokal (Kopi Kenangan)
// -------------------------------------------------------------
const KENANGAN_RECEIPT = `
KOPI KENANGAN
KENANGAN GROUP
OUTLET MALL KELAPA GADING
06-11-2026 13:40:00
ORDER #: 8820
--------------------------------
2x KOPI KENANGAN MANTAN          36.000
1x TOAST SMOKED BEEF CHEESE      28.000
--------------------------------
SUBTOTAL                         64.000
PB1                              6.400
TOTAL                            70.400
GOPAY                            70.400
`;

const resKenangan = parseReceipt(KENANGAN_RECEIPT);

assert(resKenangan.success === true, 'Struk Kopi Kenangan berhasil diurai');
assert(resKenangan.merchant === 'Kopi Kenangan', `Merchant Kopi Kenangan tepat: ${resKenangan.merchant}`);
assert(resKenangan.receipt_no === '8820', `Nomor order Kopi Kenangan tepat: ${resKenangan.receipt_no}`);
assert(resKenangan.total === 70400, `Total Kopi Kenangan tepat: ${resKenangan.total}`);
assert(resKenangan.payment_method === 'GoPay', `Metode bayar GoPay tepat: ${resKenangan.payment_method}`);
assert(resKenangan.line_items.length === 2, `Line items Kopi Kenangan tepat: ${resKenangan.line_items.length}`);

// -------------------------------------------------------------
// Skenario 8: Parsing struk resto cepat saji (McDonald's)
// -------------------------------------------------------------
const MCD_RECEIPT = `
MCDONALD'S
PT REKSO NASIONAL FOOD
MCD SARINAH THAMRIN
05/11/2026 12:20:15
ORDER ID: MCD-09142
--------------------------------
1 PA-NAS 1 MEDIUM               38.500
1 MCFLURRY OREO                 14.000
--------------------------------
SUBTOTAL                        52.500
PAJAK RESTORAN 10%               5.250
TOTAL BAYAR                     57.750
SHOPEEPAY                       57.750
`;

const resMcd = parseReceipt(MCD_RECEIPT);

assert(resMcd.success === true, "Struk McDonald's berhasil diurai");
assert(resMcd.merchant === "McDonald's", `Merchant McDonald's tepat: ${resMcd.merchant}`);
assert(resMcd.receipt_no === 'MCD-09142', `Order ID McDonald's tepat: ${resMcd.receipt_no}`);
assert(resMcd.tax === 5250, `Pajak restoran 10% tepat: ${resMcd.tax}`);
assert(resMcd.total === 57750, `Total bayar McDonald's tepat: ${resMcd.total}`);
assert(resMcd.payment_method === 'ShopeePay', `Metode bayar ShopeePay tepat: ${resMcd.payment_method}`);

// -------------------------------------------------------------
// Skenario 9: Parsing struk resto KFC
// -------------------------------------------------------------
const KFC_RECEIPT = `
KFC
PT FAST FOOD INDONESIA TBK
KFC DAGO BANDUNG
DATE: 04-11-2026 18:30:00
TRX ID: KFC-77218
--------------------------------
1 SUPER BESAR 2                 55.000
1 PERKEDEL                       8.000
--------------------------------
TOTAL HARGA                     63.000
TAX 10%                          6.300
TOTAL                           69.300
TUNAI                          100.000
KEMBALIAN                       30.700
`;

const resKfc = parseReceipt(KFC_RECEIPT);

assert(resKfc.success === true, 'Struk KFC berhasil diurai');
assert(resKfc.merchant === 'KFC', `Merchant KFC tepat: ${resKfc.merchant}`);
assert(resKfc.receipt_no === 'KFC-77218', `TRX ID KFC tepat: ${resKfc.receipt_no}`);
assert(resKfc.total === 69300, `Total KFC tepat: ${resKfc.total}`);
assert(resKfc.cash_paid === 100000 && resKfc.change === 30700, `Tunai dan kembalian KFC tepat`);

// -------------------------------------------------------------
// Skenario 10: Ekstraksi Rincian Barang (Line Items) Lengkap
// -------------------------------------------------------------
const sampleLines = [
  'INDOMIE GOR SPEC 85G   3   3.100   9.300',
  'LIFEBUOY SOAP 110G     2   4.500   9.000',
];
const extractedItems = extractLineItems(sampleLines, 'Indomaret');

assert(extractedItems.length === 2, `Ekstraksi 2 line items berhasil: ${extractedItems.length}`);
assert(extractedItems[0].name === 'INDOMIE GOR SPEC 85G', `Nama item 1 tepat: ${extractedItems[0].name}`);
assert(extractedItems[0].quantity === 3, `Quantity item 1 tepat: ${extractedItems[0].quantity}`);
assert(extractedItems[0].unit_price === 3100, `Unit price item 1 tepat: ${extractedItems[0].unit_price}`);
assert(extractedItems[0].total_price === 9300, `Total price item 1 tepat: ${extractedItems[0].total_price}`);
assert(extractedItems[0].category_suggestion === RECEIPT_CATEGORIES.GROCERIES, `Kategori item 1 Groceries tepat`);
assert(extractedItems[1].category_suggestion === RECEIPT_CATEGORIES.HEALTH_BEAUTY, `Kategori item 2 Health & Beauty tepat`);

// -------------------------------------------------------------
// Skenario 11: Kategorisasi Otomatis Cerdas ke 5 Kategori
// -------------------------------------------------------------
const catGroceries = categorizeItem('BERAS PANDAN WANGI 5KG');
const catFnb = categorizeItem('ES KOPI SUSU GULA AREN');
const catHealth = categorizeItem('PARACETAMOL 500MG STRIP');
const catHousehold = categorizeItem('SUNLIGHT PENCUCI PIRING 700ML');
const catOther = categorizeItem('PULSA TELKOMSEL 50K');

assert(catGroceries.category === RECEIPT_CATEGORIES.GROCERIES && catGroceries.category_id === 'cat-exp-shopping',
  `Kategori Groceries terpetakan: ${catGroceries.category}`);
assert(catFnb.category === RECEIPT_CATEGORIES.FNB && catFnb.category_id === 'cat-exp-food',
  `Kategori F&B terpetakan: ${catFnb.category}`);
assert(catHealth.category === RECEIPT_CATEGORIES.HEALTH_BEAUTY && catHealth.category_id === 'cat-exp-shopping',
  `Kategori Health & Beauty terpetakan: ${catHealth.category}`);
assert(catHousehold.category === RECEIPT_CATEGORIES.HOUSEHOLD && catHousehold.category_id === 'cat-exp-shopping',
  `Kategori Household terpetakan: ${catHousehold.category}`);
assert(catOther.category === RECEIPT_CATEGORIES.OTHER && catOther.category_id === 'cat-exp-entertainment',
  `Kategori Other/Hiburan terpetakan: ${catOther.category}`);

// -------------------------------------------------------------
// Skenario 12: Pembersihan Nominal Uang (cleanCurrencyAmount)
// -------------------------------------------------------------
assert(cleanCurrencyAmount('15.000') === 15000, 'Format 15.000 bernilai 15000');
assert(cleanCurrencyAmount('15.000,00') === 15000, 'Format 15.000,00 bernilai 15000');
assert(cleanCurrencyAmount('Rp 1.250.000') === 1250000, 'Format Rp 1.250.000 bernilai 1250000');
assert(cleanCurrencyAmount('7,500') === 7500, 'Format 7,500 bernilai 7500');
assert(cleanCurrencyAmount(45000) === 45000, 'Input angka 45000 tetap 45000');
assert(cleanCurrencyAmount('invalid') === null, 'Input teks tidak valid menghasilkan null');

// -------------------------------------------------------------
// Skenario 13: Deteksi Ragam Metode Pembayaran Indonesia
// -------------------------------------------------------------
assert(extractPaymentMethod('PEMBAYARAN DENGAN QRIS STATIS') === 'QRIS', 'QRIS terdeteksi');
assert(extractPaymentMethod('DEBIT BCA NO KARTU: 1234') === 'Debit BCA', 'Debit BCA terdeteksi');
assert(extractPaymentMethod('MANDIRI DEBIT CHIP') === 'Debit Mandiri', 'Debit Mandiri terdeteksi');
assert(extractPaymentMethod('SHOPEEPAY SCAN') === 'ShopeePay', 'ShopeePay terdeteksi');
assert(extractPaymentMethod('SALDO GOPAY') === 'GoPay', 'GoPay terdeteksi');
assert(extractPaymentMethod('OVO CASH') === 'OVO', 'OVO terdeteksi');
assert(extractPaymentMethod('DANA DOMPET DIGITAL') === 'DANA', 'DANA terdeteksi');
assert(extractPaymentMethod('TUNAI DITERIMA 50.000') === 'Tunai', 'Tunai terdeteksi');

// -------------------------------------------------------------
// Skenario 14: Anti-Duplikasi Struk via Receipt Hash Fingerprint
// -------------------------------------------------------------
const fp1 = generateReceiptFingerprint(resIndomaret);
const fp2 = generateReceiptFingerprint(resIndomaret);
assert(fp1.length === 64, `Fingerprint SHA-256 valid 64-karakter hex: ${fp1}`);
assert(fp1 === fp2, 'Dua kali hashing struk yang sama menghasilkan fingerprint identik');
assert(isDuplicateReceipt(resIndomaret, resIndomaret) === true, 'isDuplicateReceipt mengenali struk kembar');

const fpAlfamart = generateReceiptFingerprint(resAlfamart);
assert(fp1 !== fpAlfamart, 'Struk berbeda menghasilkan fingerprint berbeda');
assert(isDuplicateReceipt(resIndomaret, resAlfamart) === false, 'isDuplicateReceipt membedakan struk berbeda');

// -------------------------------------------------------------
// Skenario 15: Penanganan Receipt Fingerprint Parsial (Tanpa Nomor Struk)
// -------------------------------------------------------------
const partialReceipt = {
  merchant: 'Indomaret Point',
  date: '2026-11-06',
  total: 45000,
  receipt_no: null,
  line_items: [{ name: 'Kopi', total_price: 45000 }],
};
const partialFp1 = generateReceiptFingerprint(partialReceipt);
const partialFp2 = generateReceiptFingerprint(partialReceipt);
assert(partialFp1 && partialFp1.length === 64, `Fingerprint parsial tetap valid: ${partialFp1}`);
assert(partialFp1 === partialFp2, 'Fingerprint parsial stabil dan deterministik');

// -------------------------------------------------------------
// Skenario 16: Toleransi Kesalahan Teks Kosong & Whitespace
// -------------------------------------------------------------
const emptyRes1 = parseReceipt('');
const emptyRes2 = parseReceipt('    \n\n   \r\n');
const emptyRes3 = parseReceipt(null);

assert(emptyRes1.success === false, 'Teks kosong menghasilkan success false');
assert(emptyRes1.confidence === 'low' && emptyRes1.confidence_score === 0, 'Confidence score teks kosong adalah 0');
assert(Array.isArray(emptyRes1.line_items) && emptyRes1.line_items.length === 0, 'Line items teks kosong adalah array kosong');
assert(typeof emptyRes1.fingerprint === 'string' && emptyRes1.fingerprint.length > 0, 'Fingerprint fallback terisi');
assert(emptyRes2.success === false && emptyRes3.success === false, 'Whitespace dan null ditangani bebas crash');

// -------------------------------------------------------------
// Skenario 17: Toleransi Kesalahan Teks Rusak / Random OCR Noise
// -------------------------------------------------------------
const noiseText = `
*&*@^#!@%#^&!@*^#!
asdhjkfa sdkjhaf 91823901823
====++++====??????
unknown junk data random words here
`;
const noiseRes = parseReceipt(noiseText);

assert(noiseRes.total === 0, 'Teks sampah menghasilkan total 0');
assert(Array.isArray(noiseRes.line_items), 'Line items tetap berstruktur array valid');
assert(noiseRes.confidence === 'low', 'Teks sampah berstatus confidence low');
assert(noiseRes.warnings.length > 0, 'Peringatan toleransi kesalahan terpasang');

// -------------------------------------------------------------
// Skenario 18: Verifikasi Skor Keyakinan (Confidence Score)
// -------------------------------------------------------------
const highConf = calculateConfidenceScore({
  merchant: 'Indomaret',
  date: '2026-11-06',
  total: 50000,
  line_items: [{ total_price: 50000 }],
  receipt_no: 'STRUK-1234',
});
assert(highConf.score === 100 && highConf.level === 'high',
  `Struk lengkap mendapat skor 100% level high: ${highConf.score}%`);

const medConf = calculateConfidenceScore({
  merchant: 'Alfamart',
  date: '2026-11-06',
  total: 25000,
  line_items: [],
  receipt_no: null,
});
assert(medConf.score >= 50 && medConf.score < 75 && medConf.level === 'medium',
  `Struk parsial mendapat skor medium: ${medConf.score}% level=${medConf.level}`);

const lowConf = calculateConfidenceScore({});
assert(lowConf.score === 0 && lowConf.level === 'low',
  `Elemen kosong mendapat skor 0% level low: ${lowConf.score}%`);

// -------------------------------------------------------------
// Laporan Akhir Test Suite
// -------------------------------------------------------------
console.log('\n================================================================');
console.log(`HASIL TEST SUITE: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL ${totalTests})`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
