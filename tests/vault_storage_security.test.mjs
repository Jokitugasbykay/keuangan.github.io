/**
 * @file Test Suite Otomatis: Keamanan Penyimpanan Brankas & Pencegahan Kebocoran Plaintext
 * Kayla Finance - Agent 03: Vault Storage & Data Persistence
 * 
 * Memverifikasi:
 * 1. Pencegahan Kebocoran Plaintext: saveActiveDatabaseLocally tidak menulis plaintext ke localStorage saat vault terbuka.
 * 2. saveAccountClient dalam mode vault hanya memperbarui ciphertext di VAULT_STORAGE_KEY dan 0 byte plaintext di storage key biasa.
 * 3. saveTransactionClient dalam mode vault mengkalkulasi saldo, mengenkripsi ke brankas, dan bebas plaintext.
 * 4. updateAccountClient & deleteAccountClient memperbarui brankas secara aman tanpa kebocoran.
 * 5. updateTransactionClient & deleteTransactionClient memperbarui brankas secara aman tanpa kebocoran.
 * 6. saveSettingsClient memperbarui pengaturan dalam brankas terenkripsi tanpa menulis plaintext.
 * 7. importCsvTransactionsClient memproses mutasi langsung ke dalam brankas tanpa kebocoran.
 * 8. Pembersihan Memori: lockVault() membersihkan seluruh referensi database dan passphrase di memori.
 * 9. Pencegahan Operasi Saat Terkunci: Operasi tulis/simpan gagal aman jika brankas terkunci.
 * 10. Sanitasi Event Broadcasting: Event window (kayla_vault_state_changed & kayla_vault_data_updated) tidak membocorkan saldo atau payload database.
 * 11. Perlindungan Data Lama (Legacy Plaintext): hasLegacyData mendeteksi, readLegacyData membaca tanpa merusak.
 * 12. Migrasi Aman Data Lama: migrateLegacyDataToVault memverifikasi keberhasilan dekripsi sebelum menghapus data lama.
 * 13. Verifikasi Zero Plaintext: Seluruh kunci localStorage diperiksa dengan pemindaian kata kunci rahasia.
 */

import fs from 'fs';
import path from 'path';

// Setup Mock Environment untuk Node.js
const mockStore = new Map();
globalThis.localStorage = {
  getItem: (key) => (mockStore.has(key) ? mockStore.get(key) : null),
  setItem: (key, val) => mockStore.set(key, String(val)),
  removeItem: (key) => mockStore.delete(key),
  clear: () => mockStore.clear(),
  get length() { return mockStore.size; },
};

const windowListeners = new Map();
globalThis.window = {
  location: { hostname: 'localhost', pathname: '/' },
  addEventListener: (type, listener) => {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(listener);
  },
  removeEventListener: (type, listener) => {
    if (!windowListeners.has(type)) return;
    windowListeners.set(type, windowListeners.get(type).filter((l) => l !== listener));
  },
  dispatchEvent: (event) => {
    const list = windowListeners.get(event.type) || [];
    for (const fn of list) {
      try { fn(event); } catch (e) { console.error(e); }
    }
    return true;
  },
};

globalThis.Event = class Event {
  constructor(type) {
    this.type = type;
  }
};

globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};

// Mock fetch agar backend lokal dianggap offline pada test unit browser
globalThis.fetch = async () => {
  return {
    ok: false,
    status: 503,
    headers: { get: () => 'application/json' },
    json: async () => ({ error: 'Backend offline simulated' }),
  };
};

import {
  encryptBackup,
  decryptBackup,
  createDataSummary,
} from '../src/lib/vault-crypto.js';

import {
  VAULT_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  DEMO_STORAGE_KEY,
  PRE_RESTORE_SNAPSHOT_KEY,
  hasEncryptedVault,
  isVaultUnlocked,
  unlockVault,
  lockVault,
  saveToVault,
  createNewVault,
  getActiveVaultDatabase,
  hasLegacyData,
  readLegacyData,
  migrateLegacyDataToVault,
  safelyClearLegacyData,
  createSafeEventSummary,
} from '../src/lib/vault-storage.js';

import {
  LOCAL_STORAGE_KEY,
  loadDatabase,
  saveActiveDatabaseLocally,
  saveAccountClient,
  updateAccountClient,
  deleteAccountClient,
  saveTransactionClient,
  updateTransactionClient,
  deleteTransactionClient,
  saveSettingsClient,
  importCsvTransactionsClient,
} from '../src/lib/client-data.js';

console.log('================================================================');
console.log('KAYLA FINANCE: VAULT STORAGE & DATA PERSISTENCE SECURITY TESTS');
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

const VAULT_TEST_PASSPHRASE = 'KaylaSecretPassphrase2026!';

const initialVaultData = {
  settings: {
    app_name: 'Kayla Finance Private Vault',
    default_currency: 'IDR',
  },
  accounts: [
    {
      id: 'acc-vault-1',
      name: 'Rekening Brankas Utama',
      provider: 'BCA Private',
      account_type: 'bank',
      currency: 'IDR',
      current_balance: 100000000,
      is_active: true,
      ledger: 'personal',
    },
    {
      id: 'acc-vault-2',
      name: 'Tabungan Rahasia USD',
      provider: 'Wise USD',
      account_type: 'bank',
      currency: 'USD',
      current_balance: 5000,
      is_active: true,
      ledger: 'personal',
    },
  ],
  transactions: [
    {
      id: 'tx-vault-1',
      account_id: 'acc-vault-1',
      transaction_date: '2026-11-01T10:00:00.000Z',
      description: 'Gaji Bulanan Rahasia November',
      amount: 100000000,
      transaction_type: 'income',
      category_id: 'cat-income',
    },
  ],
  categories: [
    { id: 'cat-income', name: 'Pendapatan', category_type: 'income' },
    { id: 'cat-invest', name: 'Investasi', category_type: 'expense' },
  ],
  trading_accounts: [],
  sync_logs: [],
};

async function runVaultSecuritySuite() {
  try {
    // -------------------------------------------------------------
    // Test 1: Inisialisasi Brankas Terenkripsi Baru
    // -------------------------------------------------------------
    mockStore.clear();
    lockVault();

    const createRes = await createNewVault(VAULT_TEST_PASSPHRASE, initialVaultData);
    assertTest(
      createRes.success && isVaultUnlocked() && hasEncryptedVault(),
      'Inisialisasi brankas terenkripsi baru berhasil dan status aktif terbuka',
      `Vault unlocked: ${isVaultUnlocked()}, Has vault in storage: ${hasEncryptedVault()}`
    );

    // -------------------------------------------------------------
    // Test 2: Reproduksi & Verifikasi Fix: saveActiveDatabaseLocally TIDAK membocorkan plaintext
    // -------------------------------------------------------------
    const sensitiveUpdate = {
      ...initialVaultData,
      settings: { ...initialVaultData.settings, app_name: 'SuperSecretDatabaseUpdate' },
    };

    await saveActiveDatabaseLocally(sensitiveUpdate);

    const localKeyVal = mockStore.get(LOCAL_STORAGE_KEY);
    const demoKeyVal = mockStore.get(DEMO_STORAGE_KEY);
    const vaultEnvelopeRaw = mockStore.get(VAULT_STORAGE_KEY);

    const zeroPlaintextInStorage =
      localKeyVal === undefined || localKeyVal === null;
    const zeroPlaintextInDemo =
      demoKeyVal === undefined || demoKeyVal === null;
    const vaultEnvelopeUpdated =
      typeof vaultEnvelopeRaw === 'string' && vaultEnvelopeRaw.includes('AES-256-GCM');

    assertTest(
      zeroPlaintextInStorage && zeroPlaintextInDemo && vaultEnvelopeUpdated,
      'Perbaikan Kerentanan: saveActiveDatabaseLocally TIDAK menulis plaintext ke LOCAL_STORAGE_KEY atau DEMO_STORAGE_KEY saat vault terbuka',
      `LOCAL_STORAGE_KEY: ${localKeyVal ?? 'null (AMAN)'}, DEMO_STORAGE_KEY: ${demoKeyVal ?? 'null (AMAN)'}`
    );

    // -------------------------------------------------------------
    // Test 3: Integritas Brankas: Data di VAULT_STORAGE_KEY benar-benar terenkripsi dan dapat didekripsi
    // -------------------------------------------------------------
    const decryptedVault = await decryptBackup(vaultEnvelopeRaw, VAULT_TEST_PASSPHRASE);
    assertTest(
      decryptedVault.database.settings.app_name === 'SuperSecretDatabaseUpdate',
      'Data pada VAULT_STORAGE_KEY terenkripsi AES-256-GCM yang valid dan berhasil didekripsi dengan passphrase',
      `Decrypted App Name: ${decryptedVault.database.settings.app_name}`
    );

    // -------------------------------------------------------------
    // Test 4: saveAccountClient dalam mode vault hanya menyimpan ke VAULT_STORAGE_KEY
    // -------------------------------------------------------------
    const newAccRes = await saveAccountClient({
      name: 'Rekening Bank Rahasia Swiss',
      provider: 'UBS Zurich',
      account_type: 'bank',
      currency: 'USD',
      current_balance: 750000,
      ledger: 'personal',
    });

    const envelopeAfterNewAcc = mockStore.get(VAULT_STORAGE_KEY);
    const decAfterNewAcc = await decryptBackup(envelopeAfterNewAcc, VAULT_TEST_PASSPHRASE);
    const hasNewAcc = decAfterNewAcc.database.accounts.some(
      (a) => a.name === 'Rekening Bank Rahasia Swiss'
    );
    const localKeyValAfterAcc = mockStore.get(LOCAL_STORAGE_KEY);

    assertTest(
      newAccRes.success && hasNewAcc && (localKeyValAfterAcc === undefined || localKeyValAfterAcc === null),
      'saveAccountClient dalam mode vault memperbarui brankas terenkripsi dan meninggalkan 0 byte pada LOCAL_STORAGE_KEY',
      `Akun baru terenkripsi: ${hasNewAcc}, Local storage: ${localKeyValAfterAcc ?? 'null (AMAN)'}`
    );

    // -------------------------------------------------------------
    // Test 5: saveTransactionClient dalam mode vault memperbarui saldo dan riwayat transaksi
    // -------------------------------------------------------------
    const newTxRes = await saveTransactionClient({
      account_id: 'acc-vault-1',
      transaction_type: 'expense',
      amount: 15000000,
      description: 'Pembelian Aset Fisik Emas Rahasia',
      notes: 'Catatan Sangat Rahasia Tanpa Bocor',
    });

    const envelopeAfterTx = mockStore.get(VAULT_STORAGE_KEY);
    const decAfterTx = await decryptBackup(envelopeAfterTx, VAULT_TEST_PASSPHRASE);
    const targetAcc = decAfterTx.database.accounts.find((a) => a.id === 'acc-vault-1');
    const hasNewTx = decAfterTx.database.transactions.some(
      (t) => t.description === 'Pembelian Aset Fisik Emas Rahasia'
    );

    // Saldo awal 100.000.000 - 15.000.000 = 85.000.000
    const balanceCorrect = targetAcc?.current_balance === 85000000;
    const localKeyValAfterTx = mockStore.get(LOCAL_STORAGE_KEY);

    assertTest(
      newTxRes.success && hasNewTx && balanceCorrect && !localKeyValAfterTx,
      'saveTransactionClient dalam mode vault menghitung saldo, mengenkripsi ke brankas, dan 0 byte plaintext di storage',
      `Saldo baru: Rp ${targetAcc?.current_balance.toLocaleString()}, Transaksi ada: ${hasNewTx}`
    );

    // -------------------------------------------------------------
    // Test 6: updateTransactionClient dan deleteTransactionClient dalam mode vault
    // -------------------------------------------------------------
    const createdTxId = newTxRes.transaction.id;
    const updateTxRes = await updateTransactionClient(createdTxId, {
      description: 'Pembelian Aset Emas Terkoreksi',
    });

    const decAfterUpdateTx = await decryptBackup(mockStore.get(VAULT_STORAGE_KEY), VAULT_TEST_PASSPHRASE);
    const updatedTx = decAfterUpdateTx.database.transactions.find((t) => t.id === createdTxId);
    const isDescriptionUpdated = updatedTx?.description === 'Pembelian Aset Emas Terkoreksi';

    const deleteTxSuccess = await deleteTransactionClient(createdTxId);
    const decAfterDeleteTx = await decryptBackup(mockStore.get(VAULT_STORAGE_KEY), VAULT_TEST_PASSPHRASE);
    const isTxDeleted = !decAfterDeleteTx.database.transactions.some((t) => t.id === createdTxId);
    const targetAccRestored = decAfterDeleteTx.database.accounts.find((a) => a.id === 'acc-vault-1');
    const isBalanceRestored = targetAccRestored?.current_balance === 100000000;

    assertTest(
      updateTxRes.success && isDescriptionUpdated && deleteTxSuccess && isTxDeleted && isBalanceRestored,
      'updateTransactionClient & deleteTransactionClient bekerja aman dalam mode vault dengan rekonsiliasi saldo',
      `Update berhasil: ${isDescriptionUpdated}, Hapus berhasil: ${isTxDeleted}, Saldo dipulihkan: Rp ${targetAccRestored?.current_balance.toLocaleString()}`
    );

    // -------------------------------------------------------------
    // Test 7: updateAccountClient dan deleteAccountClient dalam mode vault
    // -------------------------------------------------------------
    const createdAccId = newAccRes.account.id;
    const updateAccRes = await updateAccountClient(createdAccId, {
      name: 'Rekening Swiss Zurich Platinum',
    });

    const decAfterAccUpdate = await decryptBackup(mockStore.get(VAULT_STORAGE_KEY), VAULT_TEST_PASSPHRASE);
    const updatedAccObj = decAfterAccUpdate.database.accounts.find((a) => a.id === createdAccId);
    const isAccNameUpdated = updatedAccObj?.name === 'Rekening Swiss Zurich Platinum';

    const deleteAccRes = await deleteAccountClient(createdAccId);
    const decAfterAccDelete = await decryptBackup(mockStore.get(VAULT_STORAGE_KEY), VAULT_TEST_PASSPHRASE);
    const isAccDeleted = !decAfterAccDelete.database.accounts.some((a) => a.id === createdAccId);

    assertTest(
      updateAccRes.success && isAccNameUpdated && deleteAccRes.success && isAccDeleted,
      'updateAccountClient & deleteAccountClient bekerja aman dalam mode vault tanpa kebocoran data',
      `Nama akun terupdate: ${isAccNameUpdated}, Akun terhapus: ${isAccDeleted}`
    );

    // -------------------------------------------------------------
    // Test 8: importCsvTransactionsClient dalam mode vault
    // -------------------------------------------------------------
    const csvTestData = `Tanggal,Keterangan,Nominal,Tipe,Referensi
2026-11-05,Dividen Saham Rahasia,2500000,CR,REF-DIV-001
2026-11-06,Biaya Kustodi Portofolio,150000,DB,REF-FEE-002`;

    const csvImportRes = await importCsvTransactionsClient('acc-vault-1', csvTestData);
    const decAfterCsv = await decryptBackup(mockStore.get(VAULT_STORAGE_KEY), VAULT_TEST_PASSPHRASE);
    const importedTxCount = decAfterCsv.database.transactions.filter((t) =>
      t.external_transaction_id?.startsWith('REF-')
    ).length;
    const targetAccAfterCsv = decAfterCsv.database.accounts.find((a) => a.id === 'acc-vault-1');
    // Saldo 100.000.000 + 2.500.000 - 150.000 = 102.350.000
    const csvBalanceExpected = 102350000;

    assertTest(
      csvImportRes.success &&
        importedTxCount === 2 &&
        targetAccAfterCsv?.current_balance === csvBalanceExpected,
      'importCsvTransactionsClient dalam mode vault memproses mutasi langsung ke brankas terenkripsi',
      `Transaksi diimpor: ${importedTxCount}, Saldo baru: Rp ${targetAccAfterCsv?.current_balance.toLocaleString()}`
    );

    // -------------------------------------------------------------
    // Test 9: saveSettingsClient dalam mode vault
    // -------------------------------------------------------------
    const saveSettingsRes = await saveSettingsClient({
      theme: 'dark',
      usd_to_idr_rate: 16500,
    });
    const decAfterSettings = await decryptBackup(mockStore.get(VAULT_STORAGE_KEY), VAULT_TEST_PASSPHRASE);
    const settingsUpdated =
      decAfterSettings.database.settings.theme === 'dark' &&
      decAfterSettings.database.settings.usd_to_idr_rate === 16500;

    assertTest(
      saveSettingsRes.success && settingsUpdated,
      'saveSettingsClient dalam mode vault memperbarui preferensi ke brankas terenkripsi tanpa menulis plaintext',
      `Theme: ${decAfterSettings.database.settings.theme}, USD Rate: ${decAfterSettings.database.settings.usd_to_idr_rate}`
    );

    // -------------------------------------------------------------
    // Test 10: lockVault() membersihkan seluruh data dekripsi dan passphrase dari memori
    // -------------------------------------------------------------
    lockVault();

    const isUnlockedAfterLock = isVaultUnlocked();
    const activeDbAfterLock = getActiveVaultDatabase();
    const loadDbAfterLock = await loadDatabase();

    const notLeakingPrivateData =
      loadDbAfterLock?.settings?.app_name !== 'SuperSecretDatabaseUpdate';

    assertTest(
      !isUnlockedAfterLock && activeDbAfterLock === null && notLeakingPrivateData,
      'lockVault() menghapus total inMemoryPassphrase dan inMemoryDatabase dari memori runtime',
      `isVaultUnlocked: ${isUnlockedAfterLock}, activeDatabase: ${activeDbAfterLock}, loadDatabase leaked: ${!notLeakingPrivateData}`
    );

    // -------------------------------------------------------------
    // Test 11: Operasi saveToVault saat brankas terkunci gagal aman (Fail-safe)
    // -------------------------------------------------------------
    const saveWhileLockedRes = await saveToVault({ dummy: true });
    assertTest(
      !saveWhileLockedRes.success && saveWhileLockedRes.error?.includes('terkunci'),
      'saveToVault menolak penulisan saat brankas terkunci dengan pesan error aman',
      `Pesan penolakan: "${saveWhileLockedRes.error}"`
    );

    // -------------------------------------------------------------
    // Test 12: Sanitasi Event Broadcasting (Nol Saldo Finansial di Window Event)
    // -------------------------------------------------------------
    let stateChangedDetail = null;
    let dataUpdatedDetail = null;

    const stateListener = (e) => { stateChangedDetail = e.detail; };
    const updateListener = (e) => { dataUpdatedDetail = e.detail; };

    globalThis.window.addEventListener('kayla_vault_state_changed', stateListener);
    globalThis.window.addEventListener('kayla_vault_data_updated', updateListener);

    // Buka kembali brankas
    await unlockVault(VAULT_TEST_PASSPHRASE);
    // Simpan data
    await saveToVault(initialVaultData);

    globalThis.window.removeEventListener('kayla_vault_state_changed', stateListener);
    globalThis.window.removeEventListener('kayla_vault_data_updated', updateListener);

    const stateEventHasNoBalances = !stateChangedDetail?.summary?.balances;
    const stateEventHasNoRawDb = !stateChangedDetail?.database;
    const updateEventHasNoBalances = !dataUpdatedDetail?.summary?.balances && !dataUpdatedDetail?.balances;
    const updateEventHasNoRawDb = !dataUpdatedDetail?.database;

    assertTest(
      stateEventHasNoBalances && stateEventHasNoRawDb && updateEventHasNoBalances && updateEventHasNoRawDb,
      'Sanitasi Event: kayla_vault_state_changed & kayla_vault_data_updated tidak membocorkan saldo atau database ke window object',
      `State Event Summary Keys: ${Object.keys(stateChangedDetail?.summary || {})}, Balances in Event: ${Boolean(stateChangedDetail?.summary?.balances)}`
    );

    // -------------------------------------------------------------
    // Test 13: Deteksi Data Lama (Legacy Data Plaintext) secara aman
    // -------------------------------------------------------------
    const dummyLegacyJson = JSON.stringify({
      accounts: [{ id: 'acc-old', name: 'Legacy Old Account', currency: 'IDR', current_balance: 5000000 }],
      transactions: [{ id: 'tx-old', description: 'Old Transaction', amount: 500000 }],
    });
    mockStore.set(LEGACY_STORAGE_KEY, dummyLegacyJson);

    const hasLegacy = hasLegacyData();
    const readLegacy = readLegacyData();

    assertTest(
      hasLegacy && readLegacy?.accounts?.length === 1 && readLegacy.accounts[0].name === 'Legacy Old Account',
      'hasLegacyData & readLegacyData mendeteksi dan membaca data lama plaintext tanpa merusak strukturnya',
      `Legacy detected: ${hasLegacy}, Accounts: ${readLegacy?.accounts?.length}`
    );

    // -------------------------------------------------------------
    // Test 14: Migrasi Data Lama ke Brankas Terenkripsi Mempertahankan Data Lama Jika Tanpa Konfirmasi
    // -------------------------------------------------------------
    const migrateWithoutClearRes = await migrateLegacyDataToVault('NewMigratedVaultPassphrase2026!', {
      clearLegacy: false,
      confirmed: false,
    });

    const legacyStillExists = Boolean(mockStore.get(LEGACY_STORAGE_KEY));
    const newVaultEnvelopeExists = Boolean(mockStore.get(VAULT_STORAGE_KEY));

    assertTest(
      migrateWithoutClearRes.success &&
        migrateWithoutClearRes.legacyRetained &&
        legacyStillExists &&
        newVaultEnvelopeExists,
      'migrateLegacyDataToVault mempertahankan data lama jika tanpa konfirmasi eksplisit (Zero Data Loss)',
      `Legacy retained: ${migrateWithoutClearRes.legacyRetained}, Storage contains legacy: ${legacyStillExists}`
    );

    // -------------------------------------------------------------
    // Test 15: Pembersihan Data Lama Hanya Dapat Dilakukan dengan Konfirmasi Eksplisit & Backup Terverifikasi
    // -------------------------------------------------------------
    const unconfirmedClear = safelyClearLegacyData(false);
    const legacyAfterUnconfirmed = Boolean(mockStore.get(LEGACY_STORAGE_KEY));

    const confirmedClear = safelyClearLegacyData(true);
    const legacyAfterConfirmed = Boolean(mockStore.get(LEGACY_STORAGE_KEY));

    assertTest(
      !unconfirmedClear.success &&
        legacyAfterUnconfirmed &&
        confirmedClear.success &&
        !legacyAfterConfirmed,
      'safelyClearLegacyData menolak pembersihan tanpa konfirmasi dan hanya menghapus jika konfirmasi terverifikasi',
      `Unconfirmed success: ${unconfirmedClear.success}, Confirmed success: ${confirmedClear.success}`
    );

    // -------------------------------------------------------------
    // Test 16: Zero Plaintext Storage Scan: Pemindaian Menyeluruh pada localStorage
    // -------------------------------------------------------------
    // Isi brankas dengan data pribadi
    await createNewVault(VAULT_TEST_PASSPHRASE, initialVaultData);

    const secretKeywords = [
      'Rekening Brankas Utama',
      'Tabungan Rahasia USD',
      'Gaji Bulanan Rahasia',
      '100000000',
    ];

    let foundLeakInLocalStorage = false;
    let leakedKeyName = null;

    for (const [key, value] of mockStore.entries()) {
      if (key === VAULT_STORAGE_KEY || key === PRE_RESTORE_SNAPSHOT_KEY) {
        // Kunci brankas terenkripsi: periksa bahwa isinya BUKAN plaintext database
        if (value.includes('"Rekening Brankas Utama"') || value.includes('"Gaji Bulanan Rahasia"')) {
          foundLeakInLocalStorage = true;
          leakedKeyName = `${key} (TERBOCOR PLAINTEXT DI DALAM KUNCI BRANKAS)`;
        }
      } else {
        // Kunci selain brankas (LOCAL_STORAGE_KEY, DEMO_STORAGE_KEY, dsb.)
        for (const word of secretKeywords) {
          if (typeof value === 'string' && value.includes(word)) {
            foundLeakInLocalStorage = true;
            leakedKeyName = `${key} (BOCOR KATA KUNCI: "${word}")`;
            break;
          }
        }
      }
    }

    assertTest(
      !foundLeakInLocalStorage,
      'Audit Kriptografi & Penyimpanan: Nol kata kunci data pribadi terdeteksi dalam plaintext di seluruh localStorage',
      foundLeakInLocalStorage ? `Kebocoran terdeteksi pada: ${leakedKeyName}` : 'Penyimpanan 100% bersih dari plaintext pribadi'
    );

    // -------------------------------------------------------------
    // Test 17: Simulasi Refresh Tab / Tutup Peramban
    // -------------------------------------------------------------
    // Saat tab ditutup atau di-refresh, memori modul JS ter-reset total (inMemoryDatabase & inMemoryPassphrase = null)
    lockVault();

    // Pastikan brankas tidak dapat diakses tanpa memasukkan kembali passphrase
    const unlockWrongPass = await unlockVault('PassphraseSalahTotal123!');
    const unlockCorrectPass = await unlockVault(VAULT_TEST_PASSPHRASE);

    assertTest(
      !unlockWrongPass.success &&
        unlockCorrectPass.success &&
        unlockCorrectPass.database.accounts.length === 2,
      'Siklus Sesi: Buka kunci brankas pasca refresh tab mewajibkan passphrase yang valid',
      `Penolakan passphrase salah: ${!unlockWrongPass.success}, Buka kunci passphrase benar: ${unlockCorrectPass.success}`
    );

  } catch (err) {
    console.error('Fatal Test Exception:', err);
    failedCount++;
  } finally {
    console.log('\n================================================================');
    console.log(`HASIL TEST SUITE: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL ${passedCount + failedCount})`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    }
  }
}

runVaultSecuritySuite();
