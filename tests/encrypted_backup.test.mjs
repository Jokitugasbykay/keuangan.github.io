/**
 * @file Test Suite Otomatis Kriptografi Brankas Terenkripsi Kayla Finance
 * Memverifikasi 25 parameter keamanan:
 * 1. Enkripsi backup AES-256-GCM (600.000 iterasi OWASP)
 * 2. Dekripsi dengan passphrase benar
 * 3. Penolakan passphrase salah
 * 4. Deteksi tampering ciphertext (modifikasi 1 byte ditolak)
 * 5. Deteksi tampering IV
 * 6. Deteksi tampering salt
 * 7. Deteksi tampering authentication tag
 * 8. Non-deterministik: Salt dan IV unik setiap enkripsi
 * 9. Penolakan format amplop tidak valid
 * 10. Penolakan versi amplop tidak didukung
 * 11. Penolakan cipher selain AES-256-GCM
 * 12. Penolakan KDF selain PBKDF2
 * 13. Akurasi kalkulasi ringkasan data statistik (createDataSummary)
 * 14. Self-verification roundtrip pada encryptBackup
 * 15. Validasi minimal 10 karakter passphrase
 * 16. Mekanisme snapshot pemulihan dan rollback brankas lokal
 * 17. Nol import / referensi Supabase pada seluruh codebase src/
 * 18. Backward Compatibility: Dekripsi backup 100.000 iterasi
 * 19. Backward Compatibility: Metadata tanpa field iterations
 * 20. Perlindungan Privasi Total: Nol saldo finansial plaintext (zero plaintext balance) pada amplop
 * 21. Integritas Pasca-Dekripsi: Rekalkulasi saldo langsung dari plaintext terdekripsi (kebal spoofing)
 * 22. Uji Penolakan Passphrase Tidak Valid: String kosong, spasi saja, dan variasi pendek ditolak
 * 23. Deteksi Tampering Tambahan: Pemotongan ciphertext (truncation) ditolak
 * 24. Pengujian Ketahanan Passphrase Salah: Perbedaan 1 karakter typo ditolak
 * 25. Ketahanan Terhadap Kerusakan Format Base64 Ciphertext
 */

import fs from 'fs';
import path from 'path';

// Setup Mock Browser Environment untuk pengujian vault-storage di Node.js
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    dispatchEvent: () => {},
  };
}
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, eventInitDict) {
      this.type = type;
      this.detail = eventInitDict?.detail;
    }
  };
}
if (typeof globalThis.Event === 'undefined') {
  globalThis.Event = class Event {
    constructor(type) {
      this.type = type;
    }
  };
}

import {
  encryptBackup,
  decryptBackup,
  createDataSummary,
  createEnvelopeSummary,
  MIN_PASSPHRASE_LENGTH,
  bufferToBase64,
  base64ToBuffer,
} from '../src/lib/vault-crypto.js';

import {
  VAULT_STORAGE_KEY,
  PRE_RESTORE_SNAPSHOT_KEY,
  hasEncryptedVault,
  isVaultUnlocked,
  unlockVault,
  lockVault,
  saveToVault,
  createNewVault,
  createPreRestoreSnapshot,
  hasPreRestoreSnapshot,
  rollbackPreRestoreSnapshot,
  restoreVaultFromBackup,
} from '../src/lib/vault-storage.js';

console.log('================================================================');
console.log('KAYLA FINANCE: ENCRYPTED VAULT & CRYPTOGRAPHY TEST SUITE (25 TESTS)');
console.log('================================================================\n');

let passedCount = 0;
let failedCount = 0;

function assertTest(condition, testName, detail = '') {
  if (condition) {
    passedCount++;
    console.log(`[PASS] Test ${passedCount + failedCount}: ${testName}`);
    if (detail) console.log(`       Info: ${detail}`);
  } else {
    failedCount++;
    console.error(`[FAIL] Test ${passedCount + failedCount}: ${testName}`);
    if (detail) console.error(`       Error: ${detail}`);
  }
}

// Data simulasi keuangan untuk pengujian
const sampleDatabase = {
  accounts: [
    { id: 'acc-1', name: 'BCA Utama', currency: 'IDR', current_balance: 15500000 },
    { id: 'acc-2', name: 'Mandiri Operasional', currency: 'IDR', current_balance: 4500000 },
    { id: 'acc-3', name: 'Wise Multi-Currency', currency: 'USD', current_balance: 1250.75 },
  ],
  transactions: [
    { id: 'tx-1', account_id: 'acc-1', amount: 500000, type: 'expense', category_id: 'cat-1' },
    { id: 'tx-2', account_id: 'acc-3', amount: 100, type: 'income', category_id: 'cat-2' },
  ],
  categories: [
    { id: 'cat-1', name: 'Makanan', category_type: 'expense' },
    { id: 'cat-2', name: 'Dividen', category_type: 'income' },
  ],
  trading_accounts: [
    { id: 'tr-1', broker: 'Exness MT5', balance: 500, currency: 'USD' },
  ],
  settings: {
    app_name: 'Kayla Finance Test',
    default_currency: 'IDR',
  },
};

const TEST_PASSPHRASE = 'KaylaSecureVaultPassphrase2026!';
const WRONG_PASSPHRASE = 'SalahPassphraseBeda2026!';

async function runTests() {
  try {
    // -------------------------------------------------------------
    // Test 1: Enkripsi backup AES-256-GCM (600.000 iterasi OWASP)
    // -------------------------------------------------------------
    const encResult = await encryptBackup(sampleDatabase, TEST_PASSPHRASE);
    const envelope = encResult.envelope;

    assertTest(
      envelope &&
        envelope.format === 'kfin.enc' &&
        envelope.version === 1 &&
        envelope.crypto?.cipher === 'AES-256-GCM' &&
        envelope.crypto?.kdf === 'PBKDF2' &&
        envelope.crypto?.iterations === 600000 &&
        typeof envelope.ciphertext === 'string' &&
        envelope.ciphertext.length > 50,
      'Enkripsi cadangan menghasilkan format amplop .kfin.enc v1 terstandar AES-256-GCM (600.000 iterasi)',
      `Ciphertext length: ${envelope.ciphertext.length} chars, Iterations: ${envelope.crypto.iterations}`
    );

    // -------------------------------------------------------------
    // Test 2: Dekripsi dengan passphrase yang benar
    // -------------------------------------------------------------
    const decResult = await decryptBackup(encResult.jsonString, TEST_PASSPHRASE);
    const decryptedDb = decResult.database;

    assertTest(
      decryptedDb &&
        decryptedDb.accounts.length === sampleDatabase.accounts.length &&
        decryptedDb.accounts[0].current_balance === sampleDatabase.accounts[0].current_balance &&
        decryptedDb.settings.app_name === sampleDatabase.settings.app_name,
      'Dekripsi dengan passphrase benar berhasil mengembalikan database asli',
      `Akun terdekripsi: ${decryptedDb.accounts.length}, Saldo: Rp ${decryptedDb.accounts[0].current_balance}`
    );

    // -------------------------------------------------------------
    // Test 3: Penolakan passphrase salah
    // -------------------------------------------------------------
    let wrongPassRejected = false;
    let wrongPassErrorMessage = '';
    try {
      await decryptBackup(encResult.jsonString, WRONG_PASSPHRASE);
    } catch (err) {
      wrongPassRejected = true;
      wrongPassErrorMessage = err.message;
    }
    assertTest(
      wrongPassRejected,
      'Dekripsi dengan passphrase salah ditolak dengan aman',
      `Pesan penolakan: "${wrongPassErrorMessage}"`
    );

    // -------------------------------------------------------------
    // Test 4: Deteksi Tampering Ciphertext (Modifikasi 1 byte ditolak)
    // -------------------------------------------------------------
    const tamperedEnvelope = JSON.parse(encResult.jsonString);
    const cipherBytes = base64ToBuffer(tamperedEnvelope.ciphertext);
    // Ubah 1 byte di tengah ciphertext
    cipherBytes[10] ^= 0xff;
    tamperedEnvelope.ciphertext = bufferToBase64(cipherBytes);

    let tamperingRejected = false;
    try {
      await decryptBackup(tamperedEnvelope, TEST_PASSPHRASE);
    } catch {
      tamperingRejected = true;
    }
    assertTest(
      tamperingRejected,
      'Deteksi Tampering: Modifikasi 1 byte pada ciphertext berhasil dideteksi dan ditolak'
    );

    // -------------------------------------------------------------
    // Test 5: Deteksi Tampering IV
    // -------------------------------------------------------------
    const tamperedIvEnvelope = JSON.parse(encResult.jsonString);
    const ivBytes = base64ToBuffer(tamperedIvEnvelope.crypto.iv);
    ivBytes[0] ^= 0x01;
    tamperedIvEnvelope.crypto.iv = bufferToBase64(ivBytes);

    let ivTamperingRejected = false;
    try {
      await decryptBackup(tamperedIvEnvelope, TEST_PASSPHRASE);
    } catch {
      ivTamperingRejected = true;
    }
    assertTest(
      ivTamperingRejected,
      'Deteksi Tampering: Modifikasi IV ditolak oleh verifikasi kriptografi'
    );

    // -------------------------------------------------------------
    // Test 6: Deteksi Tampering Salt
    // -------------------------------------------------------------
    const tamperedSaltEnvelope = JSON.parse(encResult.jsonString);
    const saltBytes = base64ToBuffer(tamperedSaltEnvelope.crypto.salt);
    saltBytes[0] ^= 0x01;
    tamperedSaltEnvelope.crypto.salt = bufferToBase64(saltBytes);

    let saltTamperingRejected = false;
    try {
      await decryptBackup(tamperedSaltEnvelope, TEST_PASSPHRASE);
    } catch {
      saltTamperingRejected = true;
    }
    assertTest(
      saltTamperingRejected,
      'Deteksi Tampering: Modifikasi Salt menghasilkan kegagalan dekripsi'
    );

    // -------------------------------------------------------------
    // Test 7: Deteksi Tampering Auth Tag (Bagian akhir ciphertext AES-GCM)
    // -------------------------------------------------------------
    const tamperedTagEnvelope = JSON.parse(encResult.jsonString);
    const tagCipherBytes = base64ToBuffer(tamperedTagEnvelope.ciphertext);
    // Modifikasi 1 byte terakhir (bagian dari 16-byte authentication tag GCM)
    tagCipherBytes[tagCipherBytes.length - 1] ^= 0xaa;
    tamperedTagEnvelope.ciphertext = bufferToBase64(tagCipherBytes);

    let tagTamperingRejected = false;
    try {
      await decryptBackup(tamperedTagEnvelope, TEST_PASSPHRASE);
    } catch {
      tagTamperingRejected = true;
    }
    assertTest(
      tagTamperingRejected,
      'Deteksi Tampering: Modifikasi Authentication Tag 128-bit langsung ditolak AES-GCM'
    );

    // -------------------------------------------------------------
    // Test 8: Non-deterministik (Salt dan IV unik pada setiap enkripsi)
    // -------------------------------------------------------------
    const encResult2 = await encryptBackup(sampleDatabase, TEST_PASSPHRASE);
    const isSaltDifferent = encResult.envelope.crypto.salt !== encResult2.envelope.crypto.salt;
    const isIvDifferent = encResult.envelope.crypto.iv !== encResult2.envelope.crypto.iv;
    const isCiphertextDifferent = encResult.envelope.ciphertext !== encResult2.envelope.ciphertext;

    assertTest(
      isSaltDifferent && isIvDifferent && isCiphertextDifferent,
      'Enkripsi bersifat non-deterministik: Salt, IV, dan Ciphertext berbeda di setiap pemanggilan',
      `Salt1 !== Salt2: ${isSaltDifferent}, IV1 !== IV2: ${isIvDifferent}`
    );

    // -------------------------------------------------------------
    // Test 9: Penolakan format amplop tidak valid
    // -------------------------------------------------------------
    let invalidFormatRejected = false;
    try {
      const badEnvelope = { ...encResult.envelope, format: 'unknown_format.xyz' };
      await decryptBackup(badEnvelope, TEST_PASSPHRASE);
    } catch (err) {
      invalidFormatRejected = err.message.includes('format');
    }
    assertTest(
      invalidFormatRejected,
      'Penolakan berkas dengan format bukan "kfin.enc"'
    );

    // -------------------------------------------------------------
    // Test 10: Penolakan versi amplop tidak didukung
    // -------------------------------------------------------------
    let invalidVersionRejected = false;
    try {
      const badVersionEnvelope = { ...encResult.envelope, version: 99 };
      await decryptBackup(badVersionEnvelope, TEST_PASSPHRASE);
    } catch (err) {
      invalidVersionRejected = err.message.includes('Versi');
    }
    assertTest(
      invalidVersionRejected,
      'Penolakan berkas dengan versi amplop tidak didukung'
    );

    // -------------------------------------------------------------
    // Test 11: Penolakan cipher tidak didukung
    // -------------------------------------------------------------
    let invalidCipherRejected = false;
    try {
      const badCipherEnvelope = JSON.parse(JSON.stringify(encResult.envelope));
      badCipherEnvelope.crypto.cipher = 'DES-CBC';
      await decryptBackup(badCipherEnvelope, TEST_PASSPHRASE);
    } catch (err) {
      invalidCipherRejected = err.message.includes('kriptografi');
    }
    assertTest(
      invalidCipherRejected,
      'Penolakan berkas dengan cipher selain AES-256-GCM'
    );

    // -------------------------------------------------------------
    // Test 12: Penolakan KDF tidak didukung
    // -------------------------------------------------------------
    let invalidKdfRejected = false;
    try {
      const badKdfEnvelope = JSON.parse(JSON.stringify(encResult.envelope));
      badKdfEnvelope.crypto.kdf = 'MD5-SIMPLE';
      await decryptBackup(badKdfEnvelope, TEST_PASSPHRASE);
    } catch (err) {
      invalidKdfRejected = err.message.includes('kriptografi');
    }
    assertTest(
      invalidKdfRejected,
      'Penolakan berkas dengan KDF selain PBKDF2'
    );

    // -------------------------------------------------------------
    // Test 13: Akurasi ringkasan data statistik (createDataSummary)
    // -------------------------------------------------------------
    const summary = createDataSummary(sampleDatabase);
    const expectedIdr = 15500000 + 4500000; // 20.000.000
    const expectedUsd = 1250.75;

    assertTest(
      summary.accounts_count === 3 &&
        summary.transactions_count === 2 &&
        summary.categories_count === 2 &&
        summary.trading_accounts_count === 1 &&
        summary.balances.IDR === expectedIdr &&
        summary.balances.USD === expectedUsd,
      'Kalkulasi statistik createDataSummary presisi untuk akun, saldo IDR, dan saldo USD',
      `IDR: Rp ${summary.balances.IDR.toLocaleString('id-ID')}, USD: $ ${summary.balances.USD}`
    );

    // -------------------------------------------------------------
    // Test 14: Verifikasi roundtrip internal saat encryptBackup
    // -------------------------------------------------------------
    assertTest(
      encResult.filename.startsWith('kayla-finance-backup-') &&
        encResult.filename.endsWith('.kfin.enc') &&
        encResult.envelope.summary.accounts_count === 3,
      'Self-verification roundtrip pada encryptBackup berhasil tanpa anomali',
      `Nama berkas: ${encResult.filename}`
    );

    // -------------------------------------------------------------
    // Test 15: Validasi passphrase minimal 10 karakter
    // -------------------------------------------------------------
    let shortPassRejected = false;
    let shortPassErrorMessage = '';
    try {
      await encryptBackup(sampleDatabase, '12345');
    } catch (err) {
      shortPassRejected = err.message.includes('minimal 10 karakter');
      shortPassErrorMessage = err.message;
    }
    assertTest(
      shortPassRejected && MIN_PASSPHRASE_LENGTH === 10,
      'Validasi keamanan: Passphrase kurang dari 10 karakter ditolak dengan pesan yang jelas',
      `Pesan: "${shortPassErrorMessage}"`
    );

    // -------------------------------------------------------------
    // Test 16: Snapshot pemulihan sebelum restore dan rollback
    // -------------------------------------------------------------
    globalThis.localStorage.clear();
    lockVault();

    // 1. Inisialisasi vault lama
    const initRes = await createNewVault(TEST_PASSPHRASE, sampleDatabase);
    const hasInitVault = hasEncryptedVault();
    const isInitUnlocked = isVaultUnlocked();

    // 2. Simulasi restore data baru dengan snapshot otomatis
    const modifiedDb = {
      ...sampleDatabase,
      accounts: [
        { id: 'acc-99', name: 'Akun Baru Hasil Restore', currency: 'IDR', current_balance: 99000000 },
      ],
    };
    const { jsonString: newBackupString } = await encryptBackup(modifiedDb, 'NewPassphrase2026!');

    // Panggil restoreVaultFromBackup
    const restoreRes = await restoreVaultFromBackup(newBackupString, 'NewPassphrase2026!');
    const snapshotAvailable = hasPreRestoreSnapshot();

    // 3. Rollback snapshot
    const rollbackSuccess = rollbackPreRestoreSnapshot();

    // 4. Buka kembali vault dengan passphrase lama setelah rollback
    const unlockAfterRollback = await unlockVault(TEST_PASSPHRASE);

    assertTest(
      initRes.success &&
        hasInitVault &&
        isInitUnlocked &&
        restoreRes.success &&
        snapshotAvailable &&
        rollbackSuccess &&
        unlockAfterRollback.success &&
        unlockAfterRollback.database.accounts.length === 3,
      'Mekanisme snapshot otomatis sebelum restore dan pemulihan rollback berfungsi penuh',
      `Snapshot tersimpan: ${snapshotAvailable}, Rollback: ${rollbackSuccess}, Akun setelah rollback: ${unlockAfterRollback.database?.accounts?.length}`
    );

    // -------------------------------------------------------------
    // Test 17: Nol dependensi atau referensi Supabase di direktori src/
    // -------------------------------------------------------------
    const srcDir = path.join(process.cwd(), 'src');
    function scanDirectoryForSupabase(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const found = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          found.push(...scanDirectoryForSupabase(fullPath));
        } else if (entry.isFile() && /\.(js|jsx|ts|tsx|json)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('@supabase') || content.includes('createBrowserClient') || content.includes('createClient(')) {
            found.push(fullPath);
          }
        }
      }
      return found;
    }

    const supabaseRefsInSrc = scanDirectoryForSupabase(srcDir);
    assertTest(
      supabaseRefsInSrc.length === 0,
      'Verifikasi Bersih: Nol referensi atau import Supabase di seluruh direktori src/',
      supabaseRefsInSrc.length === 0 ? 'Bersih dari Supabase' : `Ditemukan: ${supabaseRefsInSrc.join(', ')}`
    );

    // -------------------------------------------------------------
    // Test 18: Backward Compatibility: Dekripsi backup 100.000 iterasi
    // -------------------------------------------------------------
    const legacy100kResult = await encryptBackup(sampleDatabase, TEST_PASSPHRASE, 100000);
    const legacy100kDecrypted = await decryptBackup(legacy100kResult.jsonString, TEST_PASSPHRASE);
    assertTest(
      legacy100kDecrypted.database &&
        legacy100kDecrypted.database.accounts.length === sampleDatabase.accounts.length &&
        legacy100kResult.envelope.crypto.iterations === 100000,
      'Backward Compatibility: Backup lama dengan 100.000 iterasi berhasil didekripsi sempurna',
      `Iterations in metadata: ${legacy100kResult.envelope.crypto.iterations}, Akun: ${legacy100kDecrypted.database.accounts.length}`
    );

    // -------------------------------------------------------------
    // Test 19: Backward Compatibility: Metadata tanpa field iterations
    // -------------------------------------------------------------
    const noIterationsEnvelope = JSON.parse(legacy100kResult.jsonString);
    delete noIterationsEnvelope.crypto.iterations;
    const noIterationsDecrypted = await decryptBackup(noIterationsEnvelope, TEST_PASSPHRASE);
    assertTest(
      noIterationsDecrypted.database &&
        noIterationsDecrypted.database.accounts.length === sampleDatabase.accounts.length,
      'Backward Compatibility: Metadata tanpa field iterations otomatis fallback ke 100.000 iterasi',
      `Akun terdekripsi: ${noIterationsDecrypted.database.accounts.length}`
    );

    // -------------------------------------------------------------
    // Test 20: Perlindungan Privasi Total: Nol saldo finansial plaintext pada amplop (.kfin.enc)
    // -------------------------------------------------------------
    const envelopeSummary = encResult.envelope.summary;
    const jsonEnvelopeText = encResult.jsonString;

    const hasNoBalancesInEnvelopeSummary = typeof envelopeSummary.balances === 'undefined';
    const hasOnlyItemCounts = (
      typeof envelopeSummary.accounts_count === 'number' &&
      typeof envelopeSummary.transactions_count === 'number' &&
      typeof envelopeSummary.categories_count === 'number' &&
      typeof envelopeSummary.trading_accounts_count === 'number' &&
      Object.keys(envelopeSummary).length === 4
    );
    const jsonHasNoBalancesField = !jsonEnvelopeText.includes('"balances"');
    const jsonHasNoPlaintext15M = !jsonEnvelopeText.includes('15500000');
    const jsonHasNoPlaintext4M = !jsonEnvelopeText.includes('4500000');
    const jsonHasNoPlaintextUSD = !jsonEnvelopeText.includes('1250.75');

    assertTest(
      hasNoBalancesInEnvelopeSummary &&
        hasOnlyItemCounts &&
        jsonHasNoBalancesField &&
        jsonHasNoPlaintext15M &&
        jsonHasNoPlaintext4M &&
        jsonHasNoPlaintextUSD,
      'Perlindungan Privasi: Nol saldo finansial plaintext pada metadata amplop (.kfin.enc)',
      `Fields di summary amplop: [${Object.keys(envelopeSummary).join(', ')}] (tanpa saldo)`
    );

    // -------------------------------------------------------------
    // Test 21: Integritas Pasca-Dekripsi: Rekalkulasi saldo langsung dari plaintext terdekripsi (kebal spoofing)
    // -------------------------------------------------------------
    // Buat amplop palsu yang disisipi nilai summary palsu di metadata luar
    const spoofedEnvelope = JSON.parse(encResult.jsonString);
    spoofedEnvelope.summary = {
      accounts_count: 9999,
      transactions_count: 8888,
      categories_count: 7777,
      trading_accounts_count: 6666,
      balances: { IDR: 999999999999, USD: 88888888 },
    };

    const verifiedDecrypted = await decryptBackup(spoofedEnvelope, TEST_PASSPHRASE);
    const postSummary = verifiedDecrypted.summary;

    const isSpoofingNeutralized = (
      postSummary.accounts_count === 3 &&
      postSummary.transactions_count === 2 &&
      postSummary.balances.IDR === 20000000 &&
      postSummary.balances.USD === 1250.75
    );

    assertTest(
      isSpoofingNeutralized,
      'Integritas Pasca-Dekripsi: Rekalkulasi ringkasan langsung dari payload terdekripsi dan kebal spoofing metadata luar',
      `Hasil pasca-dekripsi: ${postSummary.accounts_count} akun, Saldo IDR: Rp ${postSummary.balances.IDR.toLocaleString('id-ID')}`
    );

    // -------------------------------------------------------------
    // Test 22: Uji Penolakan Passphrase Tidak Valid: String kosong, spasi, dan panjang < 10 karakter
    // -------------------------------------------------------------
    let emptyPassRejected = false;
    let whitespacePassRejected = false;
    let nineCharPassRejected = false;

    try {
      await encryptBackup(sampleDatabase, '');
    } catch {
      emptyPassRejected = true;
    }

    try {
      await encryptBackup(sampleDatabase, '         ');
    } catch {
      whitespacePassRejected = true;
    }

    try {
      await encryptBackup(sampleDatabase, 'Kayla1234'); // 9 karakter
    } catch (err) {
      nineCharPassRejected = err.message.includes('minimal 10 karakter');
    }

    assertTest(
      emptyPassRejected && whitespacePassRejected && nineCharPassRejected,
      'Uji Penolakan Passphrase Tidak Valid: String kosong, spasi, dan 9 karakter ditolak tegas',
      `Empty: ${emptyPassRejected}, Whitespace: ${whitespacePassRejected}, 9-char: ${nineCharPassRejected}`
    );

    // -------------------------------------------------------------
    // Test 23: Deteksi Tampering Tambahan: Pemotongan ciphertext (truncation) ditolak
    // -------------------------------------------------------------
    const truncatedEnvelope = JSON.parse(encResult.jsonString);
    const fullCipherBytes = base64ToBuffer(truncatedEnvelope.ciphertext);
    // Potong 16 byte terakhir (menghapus auth tag secara parsial/total)
    const truncatedBytes = fullCipherBytes.slice(0, fullCipherBytes.length - 16);
    truncatedEnvelope.ciphertext = bufferToBase64(truncatedBytes);

    let truncationRejected = false;
    try {
      await decryptBackup(truncatedEnvelope, TEST_PASSPHRASE);
    } catch {
      truncationRejected = true;
    }

    assertTest(
      truncationRejected,
      'Deteksi Tampering: Pemotongan ciphertext (truncation) terdeteksi dan ditolak oleh AES-GCM'
    );

    // -------------------------------------------------------------
    // Test 24: Pengujian Ketahanan Passphrase Salah: Perbedaan 1 karakter typo ditolak
    // -------------------------------------------------------------
    // Ganti karakter terakhir tanda seru (!) menjadi tanda tanya (?)
    const typoPassphrase = 'KaylaSecureVaultPassphrase2026?';
    let typoRejected = false;

    try {
      await decryptBackup(encResult.jsonString, typoPassphrase);
    } catch {
      typoRejected = true;
    }

    assertTest(
      typoRejected,
      'Pengujian Ketahanan: Passphrase typo 1 karakter ditolak oleh autentikasi AES-256-GCM',
      `Typo test: ${typoPassphrase}`
    );

    // -------------------------------------------------------------
    // Test 25: Ketahanan Terhadap Kerusakan Format Base64 Ciphertext
    // -------------------------------------------------------------
    const corruptBase64Envelope = JSON.parse(encResult.jsonString);
    corruptBase64Envelope.ciphertext = '!!!NotAValidBase64String###@@@';

    let corruptBase64Rejected = false;
    try {
      await decryptBackup(corruptBase64Envelope, TEST_PASSPHRASE);
    } catch {
      corruptBase64Rejected = true;
    }

    assertTest(
      corruptBase64Rejected,
      'Ketahanan Format: Ciphertext Base64 tidak valid langsung ditolak tanpa crash sistem'
    );

  } catch (err) {
    console.error('Unhandled Test Error:', err);
    failedCount++;
  }

  console.log('\n================================================================');
  console.log(`HASIL TEST SUITE: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL ${passedCount + failedCount}/25)`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
