/**
 * @file Pengelola Penyimpanan Brankas Lokal Terenkripsi (Private Local Vault Storage)
 * Menjaga data keuangan pribadi tetap terenkripsi di sisi klien (browser) menggunakan passphrase pengguna.
 * Passphrase dan kunci dekripsi HANYA disimpan sementara di memori selama sesi aktif (tidak pernah disimpan di disk/localStorage).
 */

import { encryptBackup, decryptBackup, createDataSummary } from './vault-crypto.js';

const defaultSkeletonDatabase = {
  settings: {
    app_name: 'Kayla Finance',
    default_currency: 'IDR',
    theme: 'light',
    auto_backup_enabled: true,
    max_backups: 15,
    usd_to_idr_rate: 16250,
  },
  accounts: [],
  transactions: [],
  categories: [],
  trading_accounts: [],
  sync_logs: [],
};

export const VAULT_STORAGE_KEY = 'kayla_finance_vault_v1';
export const LEGACY_STORAGE_KEY = 'kayla_finance_db_v2';
export const DEMO_STORAGE_KEY = 'kayla_finance_demo_v1';
export const PRE_RESTORE_SNAPSHOT_KEY = 'kayla_finance_pre_restore_snapshot';

// State memori sesi aktif (in-memory only, hilang saat tab ditutup)
let inMemoryPassphrase = null;
let inMemoryDatabase = null;

/**
 * Mengecek apakah brankas lokal terenkripsi sudah pernah dibuat pada perangkat ini.
 * @returns {boolean}
 */
export function hasEncryptedVault() {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem(VAULT_STORAGE_KEY));
}

/**
 * Mengecek apakah brankas lokal sedang dalam status terbuka (unlocked) di memori.
 * @returns {boolean}
 */
export function isVaultUnlocked() {
  return inMemoryDatabase !== null && inMemoryPassphrase !== null;
}

/**
 * Mendapatkan data database aktif dari brankas terbuka, atau fallback ke demo/default jika terkunci.
 * @returns {Object}
 */
export function getActiveVaultDatabase() {
  if (inMemoryDatabase) {
    return inMemoryDatabase;
  }
  return null;
}

/**
 * Membuka brankas lokal terenkripsi menggunakan passphrase pengguna.
 * @param {string} passphrase
 * @returns {Promise<{ success: boolean, database?: Object, summary?: Object, error?: string }>}
 */
export async function unlockVault(passphrase) {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Runtime peramban tidak terdeteksi.' };
  }

  const rawEnvelope = localStorage.getItem(VAULT_STORAGE_KEY);
  if (!rawEnvelope) {
    return { success: false, error: 'Brankas lokal belum pernah dibuat pada perangkat ini.' };
  }

  try {
    const result = await decryptBackup(rawEnvelope, passphrase);
    inMemoryPassphrase = passphrase.trim();
    inMemoryDatabase = result.database;

    // Picu event kustom agar komponen UI memperbarui tampilan
    window.dispatchEvent(new CustomEvent('kayla_vault_state_changed', { 
      detail: { unlocked: true, summary: result.summary } 
    }));

    return {
      success: true,
      database: result.database,
      summary: result.summary,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Passphrase salah atau berkas brankas rusak.',
    };
  }
}

/**
 * Mengunci kembali brankas lokal dan menghapus seluruh passphrase serta data dekripsi dari memori.
 */
export function lockVault() {
  inMemoryPassphrase = null;
  inMemoryDatabase = null;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kayla_vault_state_changed', { 
      detail: { unlocked: false } 
    }));
  }
}

/**
 * Menyimpan pembaruan data ke dalam brankas terenkripsi di penyimpanan lokal.
 * Data dienkripsi ulang secara atomik menggunakan Web Crypto AES-256-GCM sebelum ditulis.
 * @param {Object} updatedDatabase
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function saveToVault(updatedDatabase) {
  if (!inMemoryPassphrase) {
    return { success: false, error: 'Brankas dalam kondisi terkunci. Buka brankas terlebih dahulu.' };
  }

  try {
    const { jsonString } = await encryptBackup(updatedDatabase, inMemoryPassphrase);
    if (typeof window !== 'undefined') {
      localStorage.setItem(VAULT_STORAGE_KEY, jsonString);
      inMemoryDatabase = updatedDatabase;

      window.dispatchEvent(new CustomEvent('kayla_vault_data_updated', {
        detail: { summary: createDataSummary(updatedDatabase) }
      }));
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Gagal mengenkripsi dan menyimpan data ke brankas: ' + err.message };
  }
}

/**
 * Inisialisasi brankas baru pada perangkat kosong atau migrasi dari data awal.
 * @param {string} passphrase
 * @param {Object} [initialData]
 * @returns {Promise<{ success: boolean, database?: Object, error?: string }>}
 */
export async function createNewVault(passphrase, initialData = null) {
  if (!passphrase || passphrase.trim().length < 6) {
    return { success: false, error: 'Passphrase wajib diisi minimal 6 karakter.' };
  }

  const dataToStore = initialData || defaultSkeletonDatabase;
  try {
    const { jsonString } = await encryptBackup(dataToStore, passphrase.trim());
    if (typeof window !== 'undefined') {
      localStorage.setItem(VAULT_STORAGE_KEY, jsonString);
      inMemoryPassphrase = passphrase.trim();
      inMemoryDatabase = dataToStore;

      window.dispatchEvent(new CustomEvent('kayla_vault_state_changed', { 
        detail: { unlocked: true, summary: createDataSummary(dataToStore) } 
      }));
    }
    return { success: true, database: dataToStore };
  } catch (err) {
    return { success: false, error: 'Gagal membuat brankas baru: ' + err.message };
  }
}

/**
 * Mengecek apakah terdapat data lama plaintext (localStorage v2) yang bisa dimigrasikan.
 * @returns {boolean}
 */
export function hasLegacyData() {
  if (typeof window === 'undefined') return false;
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  return Boolean(legacy && legacy.length > 50);
}

/**
 * Membaca data lama tanpa merusaknya.
 * @returns {Object | null}
 */
export function readLegacyData() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Membuat snapshot pemulihan data aktif sebelum proses restore dijalankan.
 */
export function createPreRestoreSnapshot() {
  if (typeof window === 'undefined') return;
  const currentVault = localStorage.getItem(VAULT_STORAGE_KEY);
  if (currentVault) {
    localStorage.setItem(PRE_RESTORE_SNAPSHOT_KEY, currentVault);
  }
}

/**
 * Mengecek apakah terdapat snapshot sebelum pemulihan yang tersimpan.
 * @returns {boolean}
 */
export function hasPreRestoreSnapshot() {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem(PRE_RESTORE_SNAPSHOT_KEY));
}

/**
 * Membatalkan proses restore terakhir dan mengembalikan snapshot data sebelumnya.
 * @returns {boolean}
 */
export function rollbackPreRestoreSnapshot() {
  if (typeof window === 'undefined') return false;
  const snapshot = localStorage.getItem(PRE_RESTORE_SNAPSHOT_KEY);
  if (snapshot) {
    localStorage.setItem(VAULT_STORAGE_KEY, snapshot);
    lockVault();
    return true;
  }
  return false;
}

/**
 * Memulihkan data brankas dari berkas cadangan terenkripsi .kfin.enc secara aman.
 * @param {string | Object} envelopeInput
 * @param {string} passphrase
 * @returns {Promise<{ success: boolean, database?: Object, summary?: Object, error?: string }>}
 */
export async function restoreVaultFromBackup(envelopeInput, passphrase) {
  try {
    const result = await decryptBackup(envelopeInput, passphrase);
    createPreRestoreSnapshot();
    const saveRes = await createNewVault(passphrase, result.database);
    if (!saveRes.success) {
      return { success: false, error: saveRes.error };
    }
    return {
      success: true,
      database: result.database,
      summary: result.summary,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Gagal memulihkan cadangan: passphrase salah atau file rusak.',
    };
  }
}
