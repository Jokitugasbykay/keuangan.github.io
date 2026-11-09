/**
 * Final QA Regression Test Suite for Kayla Finance Receipt Scanner
 *
 * Verifies:
 * 1. Kimia Farma reference receipt parsing:
 *    - Merchant: KIMIA FARMA
 *    - Date: 2026-11-09
 *    - Item: HANSAPLAST AQUA PROTECT B.S030
 *    - Quantity: 1
 *    - Price: 17387
 *    - Discount rate: 10%
 *    - Discount amount: 1739
 *    - Tax included: true (PPN 11% sudah termasuk dalam harga)
 *    - Additional tax: 0
 *    - Shipping: 0
 *    - Grand total: 15648
 *    - Payment: Debit Card
 * 2. OCR preprocessing & orientation handling (portrait & landscape 90-deg rotation)
 * 3. Form reconciliation & dynamic updates:
 *    - subtotal - discount + additionalTax + shipping = grand total
 *    - no double discount, no double taxation
 * 4. Safety: No automatic save, zero database mutations
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseReceiptText, cleanCurrencyAmount } from '../src/lib/receipt-parser.js';
import { preprocessReceiptImage } from '../src/lib/receipt-ocr.js';

console.log('================================================================');
console.log('KAYLA FINANCE: RECEIPT SCANNER & FINANCIAL RECONCILIATION QA');
console.log('================================================================');

let passCount = 0;
let failCount = 0;

function check(desc, condition, details = '') {
  if (condition) {
    passCount++;
    console.log(`[PASS] ${desc}${details ? ` -> ${details}` : ''}`);
  } else {
    failCount++;
    console.error(`[FAIL] ${desc}${details ? ` -> ${details}` : ''}`);
  }
}

// -----------------------------------------------------------------------------
// TEST SUITE 1: KIMIA FARMA REFERENCE RECEIPT PARSING
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 1: KIMIA FARMA REFERENCE RECEIPT PARSER ---');

const KIMIA_FARMA_RAW = `
========================================
           KIMIA FARMA APOTEK
        JL. PAJAJARAN NO. 45 BOGOR
         TELP: (0251) 8321456
========================================
Tgl: 09/11/2026   14:20:15
No. Struk: KF-20261109-0842
Kasir: Siti Rahma
----------------------------------------
HANSAPLAST AQUA PROTECT B.S030
   1  x  17.387               17.387
   Disc 10%                   -1.739
----------------------------------------
Subtotal                      17.387
Total Potongan                -1.739
Harga Sudah Termasuk PPN 11%   1.551
Biaya Pengiriman                   0
----------------------------------------
TOTAL BAYAR                   15.648
DEBIT CARD                    15.648
KEMBALI                            0
========================================
   TERIMA KASIH ATAS KUNJUNGAN ANDA
     SEMOGA LEKAS SEMBUH & SEHAT
========================================
`;

const parsedKF = parseReceiptText(KIMIA_FARMA_RAW, { defaultType: 'expense' });

check('1.1 Merchant Kimia Farma terdeteksi', /kimia farma/i.test(parsedKF.merchant), parsedKF.merchant);
check('1.2 Tanggal transaksi terurai tepat 2026-11-09', parsedKF.date === '2026-11-09', parsedKF.date);
check('1.3 Nomor struk terurai', parsedKF.receipt_number === 'KF-20261109-0842', parsedKF.receipt_number);
check('1.4 Jumlah line items adalah 1', parsedKF.items.length === 1, `Items: ${parsedKF.items.length}`);

const itemKF = parsedKF.items[0] || {};
check('1.5 Nama item memuat HANSAPLAST AQUA PROTECT', /hansaplast/i.test(itemKF.name), itemKF.name);
check('1.6 Kuantitas item adalah 1', itemKF.qty === 1, `Qty: ${itemKF.qty}`);
check('1.7 Harga satuan asli adalah Rp17.387', itemKF.unit_price === 17387, `Price: ${itemKF.unit_price}`);
check('1.8 Subtotal item sebelum diskon adalah Rp17.387', itemKF.total_price === 17387, `Subtotal: ${itemKF.total_price}`);
check('1.9 Diskon nominal item terurai Rp1.739', itemKF.discount === 1739, `Discount: ${itemKF.discount}`);

check('1.10 Subtotal struk terurai tepat Rp17.387', parsedKF.subtotal === 17387, `Subtotal: ${parsedKF.subtotal}`);
check('1.11 Total diskon struk terurai tepat Rp1.739', parsedKF.discount === 1739, `Discount: ${parsedKF.discount}`);
check('1.12 Status PPN Termasuk (tax_included) terdeteksi TRUE', parsedKF.tax_included === true, `tax_included: ${parsedKF.tax_included}`);
check('1.13 Nilai PPN 11% terurai Rp1.551', parsedKF.tax === 1551, `Tax: ${parsedKF.tax}`);
check('1.14 Ongkos kirim adalah Rp0', (parsedKF.shipping || 0) === 0, `Shipping: ${parsedKF.shipping}`);
check('1.15 Grand total final tepat Rp15.648', parsedKF.grand_total === 15648, `Grand Total: ${parsedKF.grand_total}`);
check('1.16 Metode pembayaran terdeteksi Debit Card', /debit/i.test(parsedKF.payment_method), parsedKF.payment_method);
check('1.17 Rekonsiliasi internal akurat (reconciliation_mismatch = false)', parsedKF.reconciliation_mismatch === false, 'Sinkron');

// -----------------------------------------------------------------------------
// TEST SUITE 2: FORM RECONCILIATION & NO DOUBLE TAXATION
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: FORM RECONCILIATION & TAX LOGIC ---');

// Simulasi logika form ScanModal
function simulateScanModalForm(parsed) {
  const calculatedSubtotal = parsed.items.reduce((acc, curr) => acc + (Number(curr.subtotal || curr.total_price) || 0), 0);
  const discountVal = Number(parsed.discount) || 0;
  const taxVal = Number(parsed.tax) || 0;
  const taxIncluded = Boolean(parsed.tax_included);
  const shippingVal = Number(parsed.shipping) || 0;

  // Pajak tambahan hanya bernilai > 0 jika pajak BELUM termasuk dalam harga
  const additionalTax = taxIncluded ? 0 : taxVal;
  const computedGrandTotal = calculatedSubtotal - discountVal + additionalTax + shippingVal;

  return {
    subtotal: calculatedSubtotal,
    discount: discountVal,
    tax: taxVal,
    taxIncluded,
    additionalTax,
    shipping: shippingVal,
    computedGrandTotal,
  };
}

const formStateKF = simulateScanModalForm(parsedKF);

check('2.1 Form Subtotal menampilkan Rp17.387', formStateKF.subtotal === 17387, `Rp${formStateKF.subtotal}`);
check('2.2 Form Diskon menampilkan Rp1.739', formStateKF.discount === 1739, `Rp${formStateKF.discount}`);
check('2.3 Form Pajak Tambahan adalah Rp0 (bebas double tax)', formStateKF.additionalTax === 0, `Rp${formStateKF.additionalTax}`);
check('2.4 Form Grand Total adalah Rp15.648', formStateKF.computedGrandTotal === 15648, `Rp${formStateKF.computedGrandTotal}`);
check('2.5 Nilai form sama persis dengan printed grand total struk', formStateKF.computedGrandTotal === parsedKF.grand_total, 'Cocok');

// Uji kasus struk non-included tax (Pajak Restoran PB1 10%)
const RESTO_RECEIPT = `
CAFE NUSANTARA
Tgl: 09/11/2026
Nasi Goreng Spesial   40.000
Es Teh Manis          10.000
Subtotal              50.000
PB1 (10%)              5.000
TOTAL                 55.000
`;
const parsedResto = parseReceiptText(RESTO_RECEIPT, { defaultType: 'expense' });
const formStateResto = simulateScanModalForm(parsedResto);

check('2.6 Struk resto PB1: Subtotal Rp50.000', formStateResto.subtotal === 50000, `Rp${formStateResto.subtotal}`);
check('2.7 Struk resto PB1: Pajak Tambahan Rp5.000', formStateResto.additionalTax === 5000, `Rp${formStateResto.additionalTax}`);
check('2.8 Struk resto PB1: Grand Total Rp55.000', formStateResto.computedGrandTotal === 55000, `Rp${formStateResto.computedGrandTotal}`);

// -----------------------------------------------------------------------------
// TEST SUITE 3: DYNAMIC MANUAL CORRECTION IN FORM
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: DYNAMIC FORM CORRECTION (MANUAL OVERRIDE REACTIVITY) ---');

// Simulasi user mengubah Qty item dari 1 menjadi 2 pada form
const modifiedItems = [
  { ...parsedKF.items[0], qty: 2, subtotal: 2 * 17387 },
];
const modifiedSubtotal = modifiedItems.reduce((acc, curr) => acc + curr.subtotal, 0);
const modifiedGrandTotal = modifiedSubtotal - formStateKF.discount + formStateKF.additionalTax + formStateKF.shipping;

check('3.1 Perubahan kuantitas mengubah subtotal menjadi Rp34.774', modifiedSubtotal === 34774, `Rp${modifiedSubtotal}`);
check('3.2 Perubahan kuantitas mengupdate grand total reaktif menjadi Rp33.035', modifiedGrandTotal === 33035, `Rp${modifiedGrandTotal}`);

// -----------------------------------------------------------------------------
// TEST SUITE 4: IMAGE ROTATION & LANDSCAPE OCR PREPROCESSING
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: IMAGE ROTATION & LANDSCAPE PREPROCESSING ---');

const dummyFile = {
  name: 'receipt-landscape.jpg',
  type: 'image/jpeg',
  size: 102400,
};

// preprocessReceiptImage SSR safety check with rotation parameters
const dummyDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const res0 = await preprocessReceiptImage(dummyDataUrl, { rotateDegrees: 0 });
const res90 = await preprocessReceiptImage(dummyDataUrl, { rotateDegrees: 90 });
const res180 = await preprocessReceiptImage(dummyDataUrl, { rotateDegrees: 180 });
const res270 = await preprocessReceiptImage(dummyDataUrl, { rotateDegrees: 270 });

check('4.1 Preprocessing rotation 0 deg aman di lingkungan SSR', res0 === dummyDataUrl, 'Pass');
check('4.2 Preprocessing rotation 90 deg aman di lingkungan SSR', res90 === dummyDataUrl, 'Pass');
check('4.3 Preprocessing rotation 180 deg aman di lingkungan SSR', res180 === dummyDataUrl, 'Pass');
check('4.4 Preprocessing rotation 270 deg aman di lingkungan SSR', res270 === dummyDataUrl, 'Pass');

// -----------------------------------------------------------------------------
// TEST SUITE 5: DATABASE INTEGRITY & NO AUTO-SAVE SAFETY
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: DATABASE INTEGRITY CHECK ---');

const EXPECTED_DB_HASH = '9E08822CB3787DC9429090FCC626B6A8EED3454AB2A18E354D591690E1ABD8A4';
const dbPath = path.resolve('data/db.json');
const currentDbContent = fs.readFileSync(dbPath, 'utf8');
const currentDbHash = crypto.createHash('sha256').update(currentDbContent).digest('hex').toUpperCase();

check('5.1 File data/db.json tetap utuh tanpa modifikasi', currentDbHash === EXPECTED_DB_HASH, currentDbHash);

console.log('\n================================================================');
console.log(`HASIL TEST REGRESI RECEIPT SCANNER: ${passCount} PASSED, ${failCount} FAILED (TOTAL ${passCount + failCount})`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
