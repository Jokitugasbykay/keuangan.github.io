/**
 * @file Mesin Kriptografi Brankas Terenkripsi Kayla Finance (Web Crypto API)
 * Standar Keamanan: AES-256-GCM, PBKDF2-SHA256 (100.000 iterasi), Salt 16 byte acak, IV 12 byte acak.
 * Mendukung authenticated encryption untuk verifikasi integritas data anti-tampering.
 * Beroperasi seragam pada peramban web modern dan runtime Node.js pengujian.
 */

const KFIN_FORMAT = 'kfin.enc';
const KFIN_VERSION = 1;
export const DEFAULT_PBKDF2_ITERATIONS = 600000;
export const LEGACY_PBKDF2_ITERATIONS = 100000;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12;

/**
 * Mendapatkan antarmuka Web Crypto Subtle API yang tersedia di lingkungan runtime.
 * @returns {SubtleCrypto}
 */
function getSubtleCrypto() {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    return window.crypto.subtle;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('Web Crypto API (subtle) tidak tersedia pada runtime ini.');
}

/**
 * Mengisi buffer dengan nilai acak kriptografis (cryptographically secure random values).
 * @param {Uint8Array} buffer
 * @returns {Uint8Array}
 */
function getRandomValues(buffer) {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    return window.crypto.getRandomValues(buffer);
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    return globalThis.crypto.getRandomValues(buffer);
  }
  throw new Error('Secure random values generator tidak tersedia.');
}

/**
 * Konversi Uint8Array ke Base64 string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bufferToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

/**
 * Konversi Base64 string ke Uint8Array.
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToBuffer(base64) {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Menurunkan kunci AES-GCM 256-bit dari passphrase pengguna menggunakan PBKDF2-SHA256.
 * @param {string} passphrase
 * @param {Uint8Array} salt
 * @param {number} [iterations=DEFAULT_PBKDF2_ITERATIONS]
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(passphrase, salt, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  const passphraseKey = await subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Membentuk ringkasan statistik non-sensitif dari data database untuk keperluan pratinjau pemulihan.
 * @param {Object} db
 * @returns {Object}
 */
export function createDataSummary(db) {
  const accounts = Array.isArray(db?.accounts) ? db.accounts : [];
  const transactions = Array.isArray(db?.transactions) ? db.transactions : [];
  const categories = Array.isArray(db?.categories) ? db.categories : [];
  const tradingAccounts = Array.isArray(db?.trading_accounts) ? db.trading_accounts : [];

  const balances = { IDR: 0, USD: 0 };
  for (const acc of accounts) {
    const curr = acc.currency === 'USD' ? 'USD' : 'IDR';
    balances[curr] += Number(acc.current_balance) || 0;
  }

  return {
    accounts_count: accounts.length,
    transactions_count: transactions.length,
    categories_count: categories.length,
    trading_accounts_count: tradingAccounts.length,
    balances,
  };
}

/**
 * Mengenkripsi payload database keuangan menjadi format berkas backup .kfin.enc.
 * Menyertakan verifikasi internal roundtrip sebelum menghasilkan keluaran.
 * @param {Object} databaseObject
 * @param {string} passphrase
 * @param {number} [iterations=DEFAULT_PBKDF2_ITERATIONS]
 * @returns {Promise<{ envelope: Object, jsonString: string, filename: string }>}
 */
export async function encryptBackup(databaseObject, passphrase, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  if (!passphrase || typeof passphrase !== 'string' || passphrase.trim().length < 6) {
    throw new Error('Passphrase wajib diisi minimal 6 karakter.');
  }

  const subtle = getSubtleCrypto();
  const salt = getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

  // 1. Derivasi kunci kriptografis
  const key = await deriveKey(passphrase.trim(), salt, iterations);

  // 2. Serialisasi data
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(JSON.stringify(databaseObject));

  // 3. Enkripsi terotentikasi AES-256-GCM
  const ciphertextBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    plaintextBytes
  );

  const ciphertextBytes = new Uint8Array(ciphertextBuffer);

  // 4. Verifikasi mandiri internal (Self-verification roundtrip)
  try {
    const testDecrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertextBuffer
    );
    if (testDecrypted.byteLength !== plaintextBytes.byteLength) {
      throw new Error('Panjang data verifikasi internal tidak cocok.');
    }
  } catch (verifyErr) {
    throw new Error('Gagal memverifikasi integritas enkripsi mandiri: ' + verifyErr.message);
  }

  // 5. Susun amplop data (.kfin.enc envelope)
  const summary = createDataSummary(databaseObject);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const filename = `kayla-finance-backup-${dateStr}.kfin.enc`;

  const envelope = {
    app: 'Kayla Finance',
    version: KFIN_VERSION,
    format: KFIN_FORMAT,
    timestamp: now.toISOString(),
    crypto: {
      cipher: 'AES-256-GCM',
      kdf: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: bufferToBase64(salt),
      iv: bufferToBase64(iv),
    },
    summary,
    ciphertext: bufferToBase64(ciphertextBytes),
  };

  return {
    envelope,
    jsonString: JSON.stringify(envelope, null, 2),
    filename,
  };
}

/**
 * Mendekripsi berkas backup .kfin.enc menjadi objek database asli.
 * Memvalidasi format, versi, algoritma KDF, dan integritas autentikasi GCM.
 * @param {string | Object} envelopeInput
 * @param {string} passphrase
 * @returns {Promise<{ database: Object, summary: Object, timestamp: string }>}
 */
export async function decryptBackup(envelopeInput, passphrase) {
  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('Passphrase wajib dimasukkan.');
  }

  let envelope = envelopeInput;
  if (typeof envelopeInput === 'string') {
    try {
      envelope = JSON.parse(envelopeInput);
    } catch {
      throw new Error('Format berkas tidak valid: bukan berkas JSON terstruktur.');
    }
  }

  // 1. Validasi metadata amplop
  if (!envelope || envelope.format !== KFIN_FORMAT) {
    throw new Error('Berkas tidak dikenali: format bukan cadangan terenkripsi Kayla Finance (.kfin.enc).');
  }

  if (envelope.version !== KFIN_VERSION) {
    throw new Error(`Versi cadangan (${envelope.version}) tidak didukung oleh versi aplikasi ini.`);
  }

  const cryptoMeta = envelope.crypto;
  if (!cryptoMeta || cryptoMeta.cipher !== 'AES-256-GCM' || cryptoMeta.kdf !== 'PBKDF2') {
    throw new Error('Parameter kriptografi cadangan tidak didukung.');
  }

  // 2. Ekstrak parameter kriptografi
  const salt = base64ToBuffer(cryptoMeta.salt);
  const iv = base64ToBuffer(cryptoMeta.iv);
  const iterations = Number(cryptoMeta.iterations) || LEGACY_PBKDF2_ITERATIONS;
  const ciphertext = base64ToBuffer(envelope.ciphertext);

  const subtle = getSubtleCrypto();

  // 3. Derivasi kunci dengan parameter salt yang tersimpan
  const key = await deriveKey(passphrase.trim(), salt, iterations);

  // 4. Dekripsi data menggunakan AES-GCM
  let decryptedBuffer;
  try {
    decryptedBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      ciphertext
    );
  } catch {
    // Pada AES-GCM, kegagalan dekripsi mengindikasikan passphrase salah ATAU data telah dimodifikasi (tampered)
    throw new Error('Gagal mendekripsi: Passphrase salah atau isi berkas telah dimodifikasi/rusak.');
  }

  // 5. Parse data hasil dekripsi
  const decoder = new TextDecoder();
  const jsonText = decoder.decode(decryptedBuffer);
  let database;
  try {
    database = JSON.parse(jsonText);
  } catch {
    throw new Error('Isi data hasil dekripsi bukan format database JSON yang sah.');
  }

  return {
    database,
    summary: envelope.summary || createDataSummary(database),
    timestamp: envelope.timestamp,
  };
}
