/**
 * @file crypto-tracker.js
 * Modul Pelacak Dompet Kripto Non-Kustodian (Watch-Only Crypto Tracker)
 * Kayla Finance - Agent 09 (Crypto Wallet Tracker Specialist)
 *
 * FITUR UTAMA:
 * 1. Prinsip Keamanan Non-Kustodian Mutlak (Strict Watch-Only):
 *    - Menolak keras input, pemrosesan, atau penyimpanan Private Key atau Seed Phrase (BIP-39).
 *    - Hanya mendukung Public Address / Public Key.
 * 2. Validasi Format Alamat Multi-Chain:
 *    - Bitcoin (BTC): Legacy ('1'), SegWit P2SH ('3'), Native SegWit ('bc1q'), Taproot ('bc1p').
 *    - Ethereum & EVM (ETH, Polygon, BSC, Arbitrum, Base, OP): 0x + 40 hex char dengan EIP-55 checksum.
 *    - Solana (SOL): Base58 string 32-44 karakter.
 *    - Tron (TRX): Base58 string diawali huruf 'T' (34 karakter).
 * 3. Mesin Harga & Konversi Multi-Mata Uang:
 *    - Tabel harga default offline (hardened fallback).
 *    - Integrasi endpoint harga publik ringan dengan timeout aman dan fallback otomatis.
 *    - Konversi nilai aset ke USD dan IDR dengan rate dinamis.
 * 4. Kalkulasi Portofolio & Alokasi Aset:
 *    - Total portofolio USD dan IDR.
 *    - Alokasi per aset dan per kategori aset (BTC, ETH, SOL, Stablecoins, Others).
 *    - Perhitungan Unrealized PnL berdasarkan cost basis.
 * 5. Operasi Penyimpanan Terenkripsi (Brankas / Local):
 *    - Integrasi penuh dengan loadDatabase() dan saveActiveDatabaseLocally().
 */

import { loadDatabase, saveActiveDatabaseLocally } from './client-data.js';

// ============================================================================
// 1. DAFTAR RANTAI (CHAINS) & ASET YANG DIDUKUNG
// ============================================================================

export const SUPPORTED_CHAINS = Object.freeze([
  { id: 'BTC', name: 'Bitcoin', symbol: 'BTC', formatDesc: 'Legacy (1), SegWit (3), Native SegWit (bc1q), Taproot (bc1p)' },
  { id: 'ETH', name: 'Ethereum', symbol: 'ETH', formatDesc: '0x + 40 hex (EIP-55 checksum)' },
  { id: 'SOL', name: 'Solana', symbol: 'SOL', formatDesc: 'Base58 (32-44 karakter)' },
  { id: 'TRX', name: 'Tron', symbol: 'TRX', formatDesc: 'T + 33 Base58 (total 34 karakter)' },
  { id: 'BSC', name: 'BNB Smart Chain', symbol: 'BNB', formatDesc: '0x + 40 hex (EVM)' },
  { id: 'POLYGON', name: 'Polygon (PoS)', symbol: 'POL', formatDesc: '0x + 40 hex (EVM)' },
  { id: 'ARBITRUM', name: 'Arbitrum One', symbol: 'ETH', formatDesc: '0x + 40 hex (EVM)' },
  { id: 'OPTIMISM', name: 'Optimism (OP)', symbol: 'ETH', formatDesc: '0x + 40 hex (EVM)' },
  { id: 'BASE', name: 'Base', symbol: 'ETH', formatDesc: '0x + 40 hex (EVM)' },
  { id: 'AVAX', name: 'Avalanche C-Chain', symbol: 'AVAX', formatDesc: '0x + 40 hex (EVM)' },
]);

export const SUPPORTED_ASSETS = Object.freeze([
  { symbol: 'BTC', name: 'Bitcoin', defaultChain: 'BTC' },
  { symbol: 'ETH', name: 'Ethereum', defaultChain: 'ETH' },
  { symbol: 'SOL', name: 'Solana', defaultChain: 'SOL' },
  { symbol: 'BNB', name: 'Binance Coin', defaultChain: 'BSC' },
  { symbol: 'TRX', name: 'TRON', defaultChain: 'TRX' },
  { symbol: 'POL', name: 'Polygon', defaultChain: 'POLYGON' },
  { symbol: 'MATIC', name: 'Polygon Matic', defaultChain: 'POLYGON' },
  { symbol: 'ARB', name: 'Arbitrum', defaultChain: 'ARBITRUM' },
  { symbol: 'OP', name: 'Optimism', defaultChain: 'OPTIMISM' },
  { symbol: 'AVAX', name: 'Avalanche', defaultChain: 'AVAX' },
  { symbol: 'USDT', name: 'Tether USD', defaultChain: 'ETH' },
  { symbol: 'USDC', name: 'USD Coin', defaultChain: 'ETH' },
  { symbol: 'DAI', name: 'Dai Stablecoin', defaultChain: 'ETH' },
  { symbol: 'FDUSD', name: 'First Digital USD', defaultChain: 'BSC' },
]);

export const STABLECOIN_SYMBOLS = Object.freeze([
  'USDT',
  'USDC',
  'DAI',
  'FDUSD',
  'BUSD',
  'TUSD',
  'USDD',
  'PYUSD',
]);

// ============================================================================
// 2. TABEL HARGA DEFAULT OFFLINE (HARDENED FALLBACK)
// ============================================================================

export const DEFAULT_CRYPTO_PRICES_USD = Object.freeze({
  BTC: 68500,
  ETH: 2500,
  SOL: 180,
  BNB: 580,
  TRX: 0.16,
  POL: 0.38,
  MATIC: 0.38,
  ARB: 0.55,
  OP: 1.50,
  AVAX: 26.0,
  USDT: 1.0,
  USDC: 1.0,
  DAI: 1.0,
  FDUSD: 1.0,
  BUSD: 1.0,
});

// Alias untuk kompatibilitas integrasi UI
export const DEFAULT_CRYPTO_PRICES = DEFAULT_CRYPTO_PRICES_USD;

// Cache harga memori lokal dengan waktu kedaluwarsa (TTL 60 detik)
let cachedPrices = null;
let lastPriceFetchTime = 0;
const PRICE_CACHE_TTL_MS = 60 * 1000;

// ============================================================================
// 3. IMPLEMENTASI ALGORITMA KRIPTOGRAFI: KECCAK-256 (MURNI JS)
// ============================================================================

const KECCAK_ROUNDS = 24;
const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const KECCAK_ROT = [
  0,  1, 62, 28, 27,
 36, 44,  6, 55, 20,
  3, 10, 43, 25, 39,
 41, 45, 15, 21,  8,
 18,  2, 61, 56, 14,
];

function rotl64(n, r) {
  const b = BigInt(r % 64);
  return ((n << b) | (n >> (64n - b))) & 0xFFFFFFFFFFFFFFFFn;
}

/**
 * Menghitung hash Keccak-256 standar Ethereum dari input string atau Uint8Array.
 * Kompatibel 100% di browser dan Node.js tanpa dependensi eksternal.
 * @param {string | Uint8Array} input
 * @returns {string} Hexadecimal hash 64 karakter
 */
export function keccak256(input) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);

  const rate = 136; // 1088 bit
  const state = new BigUint64Array(25);

  const padLen = rate - (bytes.length % rate);
  const padded = new Uint8Array(bytes.length + padLen);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);

  for (let b = 0; b < padded.length; b += rate) {
    for (let i = 0; i < rate / 8; i++) {
      state[i] ^= view.getBigUint64(b + i * 8, true);
    }

    for (let round = 0; round < KECCAK_ROUNDS; round++) {
      // Theta
      const C = new BigUint64Array(5);
      for (let x = 0; x < 5; x++) {
        C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
      }
      const D = new BigUint64Array(5);
      for (let x = 0; x < 5; x++) {
        D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
      }
      for (let i = 0; i < 25; i++) {
        state[i] ^= D[i % 5];
      }

      // Rho and Pi
      const B = new BigUint64Array(25);
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          const idx = x + 5 * y;
          const newIdx = y + ((2 * x + 3 * y) % 5) * 5;
          B[newIdx] = rotl64(state[idx], KECCAK_ROT[idx]);
        }
      }

      // Chi
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          const idx = x + 5 * y;
          state[idx] = B[idx] ^ ((~B[((x + 1) % 5) + 5 * y]) & B[((x + 2) % 5) + 5 * y]);
        }
      }

      // Iota
      state[0] ^= KECCAK_RC[round];
    }
  }

  const outBytes = new Uint8Array(32);
  const outView = new DataView(outBytes.buffer);
  for (let i = 0; i < 4; i++) {
    outView.setBigUint64(i * 8, state[i], true);
  }
  return Array.from(outBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Mengonversi alamat Ethereum ke format EIP-55 Checksum.
 * @param {string} address
 * @returns {string} Alamat EIP-55 checksum diawali '0x'
 */
export function toChecksumAddress(address) {
  if (typeof address !== 'string') return '';
  const clean = address.startsWith('0x') || address.startsWith('0X')
    ? address.slice(2)
    : address;

  if (!/^[0-9a-fA-F]{40}$/.test(clean)) {
    return address;
  }

  const lower = clean.toLowerCase();
  const hash = keccak256(lower);
  let checksum = '0x';

  for (let i = 0; i < 40; i++) {
    const nibble = parseInt(hash[i], 16);
    if (nibble >= 8) {
      checksum += lower[i].toUpperCase();
    } else {
      checksum += lower[i];
    }
  }

  return checksum;
}

// ============================================================================
// 4. DETEKSI & PENCEGAHAN KUNCI RAHASIA (STRICT NON-CUSTODIAL WATCH-ONLY)
// ============================================================================

/**
 * Memeriksa apakah input mengandung Private Key, Seed Phrase, atau kredensial rahasia.
 * Menjamin prinsip non-kustodian mutlak agar sistem tidak pernah memproses rahasia pengguna.
 * @param {any} input
 * @returns {{ detected: boolean; secretType?: string; reason?: string }}
 */
export function detectSensitiveCryptoKey(input) {
  if (input === null || input === undefined) {
    return { detected: false };
  }

  const text = String(input).trim();
  if (!text) {
    return { detected: false };
  }

  // 1. Raw Hexadecimal Private Key (64 karakter hex, dengan atau tanpa awalan 0x)
  if (/^0x[0-9a-fA-F]{64}$/i.test(text)) {
    return {
      detected: true,
      secretType: 'Hexadecimal Private Key (EVM/Raw 256-bit)',
      reason: 'Input berformat 64 karakter heksadesimal dengan awalan 0x.',
    };
  }
  if (/^[0-9a-fA-F]{64}$/i.test(text)) {
    return {
      detected: true,
      secretType: 'Hexadecimal Private Key (Raw 256-bit)',
      reason: 'Input berformat 64 karakter heksadesimal tanpa awalan.',
    };
  }

  // 2. Bitcoin WIF (Wallet Import Format) Private Key
  // Awalan '5' (51 karakter uncompressed) atau 'K'/'L' (52 karakter compressed) Base58
  if (/^5[1-9A-HJ-NP-Za-km-z]{50}$/.test(text)) {
    return {
      detected: true,
      secretType: 'Bitcoin WIF Uncompressed Private Key',
      reason: 'Input berformat WIF Base58 51 karakter diawali angka 5.',
    };
  }
  if (/^[KL][1-9A-HJ-NP-Za-km-z]{51}$/.test(text)) {
    return {
      detected: true,
      secretType: 'Bitcoin WIF Compressed Private Key',
      reason: 'Input berformat WIF Base58 52 karakter diawali huruf K atau L.',
    };
  }

  // 3. BIP-38 Encrypted Private Key (58 karakter diawali 6P)
  if (/^6P[1-9A-HJ-NP-Za-km-z]{56}$/.test(text)) {
    return {
      detected: true,
      secretType: 'BIP-38 Encrypted Private Key',
      reason: 'Input berformat kunci privat terenkripsi BIP-38.',
    };
  }

  // 4. Solana / Base58 Private Key (Keypair 64-byte encoded in Base58, 85-90 karakter)
  if (/^[1-9A-HJ-NP-Za-km-z]{85,90}$/.test(text)) {
    return {
      detected: true,
      secretType: 'Base58 Extended/Solana Private Key',
      reason: 'Input berformat Base58 panjang (85-90 karakter) yang identik dengan secret keypair.',
    };
  }

  // 5. BIP-39 Seed Phrase / Secret Recovery Phrase
  // Kalimat kata-kata rahasia (12, 15, 18, 21, atau 24 kata terpisah spasi)
  const words = text.split(/\s+/).filter(Boolean);
  if ([12, 15, 18, 21, 24].includes(words.length)) {
    const isMnemonicLike = words.every((w) => /^[a-zA-Z]{3,8}$/.test(w));
    if (isMnemonicLike) {
      return {
        detected: true,
        secretType: `BIP-39 Seed Phrase (${words.length} Kata Rahasia)`,
        reason: 'Input berformat daftar kata rahasia pemulihan dompet (Seed Phrase).',
      };
    }
  }

  // 6. Pola Frasa Kunci Rahasia Eksplisit
  const lowerText = text.toLowerCase();
  if (
    lowerText.includes('private key') ||
    lowerText.includes('seed phrase') ||
    lowerText.includes('secret recovery phrase') ||
    lowerText.includes('mnemonic phrase')
  ) {
    if (words.length >= 8) {
      return {
        detected: true,
        secretType: 'Kredensial Pemulihan Rahasia Terdeteksi',
        reason: 'Input mengandung kata kunci pemulihan rahasia yang dilarang keras.',
      };
    }
  }

  return { detected: false };
}

// Alias fungsi untuk integrasi UI
export const detectPrivateKeyOrSeedPhrase = detectSensitiveCryptoKey;

/**
 * Mengembalikan true jika input terdeteksi sebagai private key atau seed phrase.
 * @param {any} input
 * @returns {boolean}
 */
export function isPrivateKeyOrSeedPhrase(input) {
  return detectSensitiveCryptoKey(input).detected;
}

/**
 * Memastikan payload atau teks bebas dari private key / seed phrase.
 * Melempar error jika kunci rahasia terdeteksi.
 * @param {any} input
 * @param {string} [contextName='input']
 */
export function assertWatchOnlySafe(input, contextName = 'input') {
  const result = detectSensitiveCryptoKey(input);
  if (result.detected) {
    throw new Error(
      `Pelanggaran Keamanan Non-Kustodian pada ${contextName}: Terdeteksi ${result.secretType}. Kayla Finance menolak keras pemrosesan kunci rahasia demi keamanan Anda.`
    );
  }
}

/**
 * Memeriksa seluruh properti objek secara rekursif untuk mendeteksi kunci rahasia.
 * @param {Record<string, any>} obj
 * @returns {{ detected: boolean; secretType?: string; field?: string; reason?: string }}
 */
export function checkObjectForSensitiveKeys(obj) {
  if (!obj || typeof obj !== 'object') return { detected: false };

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const check = detectSensitiveCryptoKey(value);
      if (check.detected) {
        return {
          detected: true,
          secretType: check.secretType,
          field: key,
          reason: check.reason,
        };
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = checkObjectForSensitiveKeys(value);
      if (nested.detected) return nested;
    }
  }

  return { detected: false };
}

// ============================================================================
// 5. VALIDASI ALAMAT MULTI-CHAIN
// ============================================================================

/**
 * Memvalidasi alamat Bitcoin (BTC).
 * Mendukung Legacy ('1'), SegWit P2SH ('3'), Native SegWit Bech32 ('bc1q'), dan Taproot ('bc1p').
 * @param {string} address
 * @returns {{ valid: boolean; chain: 'BTC'; format?: string; error?: string; normalizedAddress?: string }}
 */
export function validateBitcoinAddress(address) {
  if (typeof address !== 'string' || !address.trim()) {
    return { valid: false, chain: 'BTC', error: 'Alamat Bitcoin tidak boleh kosong.' };
  }
  const clean = address.trim();

  // Legacy (P2PKH): Awalan '1', Base58, panjang 26-35 karakter
  if (/^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(clean)) {
    return { valid: true, chain: 'BTC', format: 'legacy_p2pkh', normalizedAddress: clean };
  }

  // SegWit / Nested SegWit (P2SH): Awalan '3', Base58, panjang 26-35 karakter
  if (/^3[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(clean)) {
    return { valid: true, chain: 'BTC', format: 'segwit_p2sh', normalizedAddress: clean };
  }

  // Native SegWit Bech32 (P2WPKH / P2WSH): Awalan 'bc1q'
  // 42 karakter (P2WPKH) atau 62 karakter (P2WSH), charset bech32: 02-9ac-hj-np-z
  if (/^bc1q[02-9ac-hj-np-z]{38}$/i.test(clean)) {
    return { valid: true, chain: 'BTC', format: 'native_segwit_bech32_p2wpkh', normalizedAddress: clean.toLowerCase() };
  }
  if (/^bc1q[02-9ac-hj-np-z]{58}$/i.test(clean)) {
    return { valid: true, chain: 'BTC', format: 'native_segwit_bech32_p2wsh', normalizedAddress: clean.toLowerCase() };
  }

  // Taproot Bech32m (P2TR): Awalan 'bc1p', 62 karakter
  if (/^bc1p[0-9a-zA-Z]{58}$/.test(clean)) {
    return { valid: true, chain: 'BTC', format: 'taproot_bech32m', normalizedAddress: clean.toLowerCase() };
  }

  return {
    valid: false,
    chain: 'BTC',
    error: 'Format alamat Bitcoin tidak valid. Harus berupa Legacy (awalan 1), SegWit (awalan 3), Native SegWit (awalan bc1q), atau Taproot (awalan bc1p).',
  };
}

/**
 * Memvalidasi alamat Ethereum dan seluruh EVM compatible chains (BSC, Polygon, Arbitrum, dll).
 * Menguji format 0x + 40 hex char dan integritas EIP-55 checksum jika terdapat kombinasi huruf besar-kecil.
 * @param {string} address
 * @returns {{ valid: boolean; chain: 'ETH'; format?: string; checksummedAddress?: string; normalizedAddress?: string; error?: string }}
 */
export function validateEvmAddress(address) {
  if (typeof address !== 'string' || !address.trim()) {
    return { valid: false, chain: 'ETH', error: 'Alamat EVM/Ethereum tidak boleh kosong.' };
  }
  const clean = address.trim();

  if (!/^0x[0-9a-fA-F]{40}$/.test(clean)) {
    return {
      valid: false,
      chain: 'ETH',
      error: 'Format alamat EVM harus diawali 0x dan diikuti 40 karakter heksadesimal (total 42 karakter).',
    };
  }

  const hexPart = clean.slice(2);
  const isAllLower = hexPart === hexPart.toLowerCase();
  const isAllUpper = hexPart === hexPart.toUpperCase();
  const checksummed = toChecksumAddress(clean);

  // Jika alamat memiliki kombinasi huruf besar dan huruf kecil (mixed-case),
  // maka WAJIB sesuai persis dengan standar EIP-55 checksum untuk mencegah salah transfer
  if (!isAllLower && !isAllUpper) {
    if (clean !== checksummed) {
      return {
        valid: false,
        chain: 'ETH',
        error: 'Alamat EVM memiliki kombinasi huruf besar-kecil tetapi gagal validasi EIP-55 checksum (terdeteksi salah ketik atau karakter terdistorsi).',
      };
    }
    return {
      valid: true,
      chain: 'ETH',
      format: 'eip55_checksummed',
      checksummedAddress: checksummed,
      normalizedAddress: hexPart.toLowerCase(),
    };
  }

  return {
    valid: true,
    chain: 'ETH',
    format: 'evm_hex',
    checksummedAddress: checksummed,
    normalizedAddress: hexPart.toLowerCase(),
  };
}

/**
 * Memvalidasi alamat Solana (SOL).
 * Harus berupa string Base58 dengan panjang 32 hingga 44 karakter.
 * @param {string} address
 * @returns {{ valid: boolean; chain: 'SOL'; format?: string; error?: string; normalizedAddress?: string }}
 */
export function validateSolanaAddress(address) {
  if (typeof address !== 'string' || !address.trim()) {
    return { valid: false, chain: 'SOL', error: 'Alamat Solana tidak boleh kosong.' };
  }
  const clean = address.trim();

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(clean)) {
    if (/[0OIl]/.test(clean)) {
      return {
        valid: false,
        chain: 'SOL',
        error: 'Alamat Solana tidak valid: mengandung karakter non-Base58 (0, O, I, atau l dilarang dalam Base58).',
      };
    }
    return {
      valid: false,
      chain: 'SOL',
      error: 'Format alamat Solana harus berupa string Base58 dengan panjang 32 hingga 44 karakter.',
    };
  }

  return {
    valid: true,
    chain: 'SOL',
    format: 'base58_solana',
    normalizedAddress: clean,
  };
}

/**
 * Memvalidasi alamat Tron (TRX).
 * Harus diawali huruf kapital 'T' dan terdiri dari tepat 34 karakter Base58.
 * @param {string} address
 * @returns {{ valid: boolean; chain: 'TRX'; format?: string; error?: string; normalizedAddress?: string }}
 */
export function validateTronAddress(address) {
  if (typeof address !== 'string' || !address.trim()) {
    return { valid: false, chain: 'TRX', error: 'Alamat Tron tidak boleh kosong.' };
  }
  const clean = address.trim();

  if (!clean.startsWith('T')) {
    return {
      valid: false,
      chain: 'TRX',
      error: 'Alamat Tron harus selalu diawali dengan huruf kapital T.',
    };
  }

  if (clean.length !== 34) {
    return {
      valid: false,
      chain: 'TRX',
      error: `Panjang alamat Tron harus tepat 34 karakter (saat ini ${clean.length} karakter).`,
    };
  }

  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(clean)) {
    return {
      valid: false,
      chain: 'TRX',
      error: 'Alamat Tron mengandung karakter non-Base58 yang tidak valid.',
    };
  }

  return {
    valid: true,
    chain: 'TRX',
    format: 'base58_tron',
    normalizedAddress: clean,
  };
}

/**
 * Mendeteksi blockchain yang cocok untuk alamat yang diberikan secara otomatis.
 * @param {string} address
 * @returns {'BTC' | 'ETH' | 'SOL' | 'TRX' | null}
 */
export function detectCryptoChain(address) {
  if (typeof address !== 'string') return null;
  const clean = address.trim();

  if (validateEvmAddress(clean).valid) return 'ETH';
  if (validateBitcoinAddress(clean).valid) return 'BTC';
  if (validateTronAddress(clean).valid) return 'TRX';
  if (validateSolanaAddress(clean).valid) return 'SOL';

  return null;
}

/**
 * Validasi utama alamat kripto multi-chain dengan perlindungan non-kustodian mutlak.
 * @param {string} address
 * @param {string} [chain='AUTO'] Nama chain: 'BTC', 'ETH', 'SOL', 'TRX', 'BSC', 'POLYGON', 'ARBITRUM', dll.
 * @returns {{ valid: boolean; chain?: string; format?: string; error?: string; normalizedAddress?: string; checksummedAddress?: string }}
 */
export function validateCryptoAddress(address, chain = 'AUTO') {
  if (typeof address !== 'string' || !address.trim()) {
    return { valid: false, error: 'Alamat kripto tidak boleh kosong.' };
  }

  const clean = address.trim();

  // 1. Uji Keamanan Non-Kustodian Mutlak
  const sensitiveCheck = detectSensitiveCryptoKey(clean);
  if (sensitiveCheck.detected) {
    return {
      valid: false,
      error: `Peringatan Keamanan Non-Kustodian: Input terdeteksi sebagai ${sensitiveCheck.secretType}. Kayla Finance adalah pelacak watch-only dan menolak keras input private key atau seed phrase demi keamanan dana Anda.`,
    };
  }

  const normalizedChain = (chain || 'AUTO').toUpperCase().trim();

  // 2. Rute Validasi Berdasarkan Chain
  if (['BTC', 'BITCOIN'].includes(normalizedChain)) {
    return validateBitcoinAddress(clean);
  }

  if (
    [
      'ETH',
      'ETHEREUM',
      'EVM',
      'BSC',
      'BINANCE',
      'POLYGON',
      'MATIC',
      'POL',
      'ARBITRUM',
      'OPTIMISM',
      'BASE',
      'AVALANCHE',
      'AVAX',
    ].includes(normalizedChain)
  ) {
    const res = validateEvmAddress(clean);
    return { ...res, chain: normalizedChain };
  }

  if (['SOL', 'SOLANA'].includes(normalizedChain)) {
    return validateSolanaAddress(clean);
  }

  if (['TRX', 'TRON'].includes(normalizedChain)) {
    return validateTronAddress(clean);
  }

  // 3. Deteksi Otomatis Jika Chain Tidak Dikenal atau AUTO
  if (normalizedChain === 'AUTO') {
    const detected = detectCryptoChain(clean);
    if (detected === 'ETH') return validateEvmAddress(clean);
    if (detected === 'BTC') return validateBitcoinAddress(clean);
    if (detected === 'TRX') return validateTronAddress(clean);
    if (detected === 'SOL') return validateSolanaAddress(clean);

    return {
      valid: false,
      error: 'Format alamat tidak cocok dengan chain yang didukung (BTC, ETH/EVM, SOL, TRX).',
    };
  }

  return {
    valid: false,
    error: `Chain '${chain}' belum didukung. Gunakan salah satu dari: BTC, ETH, SOL, TRX, Polygon, BSC, Arbitrum.`,
  };
}

// ============================================================================
// 6. MESIN HARGA & KONVERSI MULTI-MATA UANG (USD & IDR)
// ============================================================================

/**
 * Mengambil harga kripto terkini dari endpoint publik dengan timeout dan fallback offline hardened.
 * @param {Object} [options]
 * @param {string[]} [options.symbols]
 * @param {number} [options.timeoutMs=3500]
 * @param {boolean} [options.forceRefresh=false]
 * @returns {Promise<Record<string, number>>} Peta harga aset dalam USD
 */
export async function fetchCryptoPrices(options = {}) {
  const {
    timeoutMs = 3500,
    forceRefresh = false,
  } = options;

  const now = Date.now();
  if (!forceRefresh && cachedPrices && now - lastPriceFetchTime < PRICE_CACHE_TTL_MS) {
    return { ...cachedPrices };
  }

  // Inisialisasi dengan tabel harga default offline hardened
  const resultPrices = { ...DEFAULT_CRYPTO_PRICES_USD };

  try {
    // Siapkan controller timeout aman
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Coba endpoint publik Binance Ticker (ringan, tanpa API key)
    const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'TRXUSDT'];
    const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(pairs))}`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          const sym = item.symbol.replace('USDT', '');
          const price = parseFloat(item.price);
          if (!isNaN(price) && price > 0) {
            resultPrices[sym] = price;
          }
        }
      }
    }
  } catch {
    // Jika offline, terjadi timeout, atau terkena rate limit, gunakan fallback offline hardened
  }

  // Perbarui cache memori
  cachedPrices = resultPrices;
  lastPriceFetchTime = now;

  return resultPrices;
}

// Alias untuk integrasi UI
export const fetchPublicCryptoPrices = fetchCryptoPrices;

/**
 * Mengonversi nilai satu aset kripto ke USD dan IDR.
 * @param {number} amount Jumlah saldo kripto
 * @param {string} assetSymbol Simbol aset (BTC, ETH, dsb)
 * @param {Record<string, number>} [prices={}] Peta harga aset dalam USD
 * @param {number} [usdToIdrRate=16000] Kurs konversi USD ke IDR
 * @returns {{ amount: number; symbol: string; unitPriceUsd: number; unitPriceIdr: number; valueUsd: number; valueIdr: number; isFallbackPrice: boolean }}
 */
export function convertCryptoValue(amount, assetSymbol, prices = {}, usdToIdrRate = 16000) {
  const parsedAmount = Number(amount);
  const safeAmount = isNaN(parsedAmount) || parsedAmount < 0 ? 0 : parsedAmount;
  const symbol = (assetSymbol || 'BTC').toUpperCase().trim();

  let unitPriceUsd = prices[symbol];
  let isFallbackPrice = false;

  if (typeof unitPriceUsd !== 'number' || isNaN(unitPriceUsd) || unitPriceUsd <= 0) {
    unitPriceUsd = DEFAULT_CRYPTO_PRICES_USD[symbol] || 0;
    isFallbackPrice = true;
  }

  const safeRate = Number(usdToIdrRate) > 0 ? Number(usdToIdrRate) : 16000;
  const unitPriceIdr = unitPriceUsd * safeRate;
  const valueUsd = safeAmount * unitPriceUsd;
  const valueIdr = valueUsd * safeRate;

  return {
    amount: safeAmount,
    symbol,
    unitPriceUsd,
    unitPriceIdr,
    valueUsd,
    valueIdr,
    isFallbackPrice,
  };
}

// ============================================================================
// 7. KALKULASI PORTOFOLIO & ALOKASI ASET
// ============================================================================

/**
 * Menghitung keseluruhan nilai portofolio dompet kripto, alokasi aset, dan PnL belum terealisasi.
 * @param {Array<Object>} wallets Daftar dompet kripto
 * @param {Record<string, number>} [prices={}] Peta harga aset dalam USD
 * @param {number} [usdToIdrRate=16000] Kurs konversi USD ke IDR
 * @returns {{
 *   total_usd: number;
 *   total_idr: number;
 *   total_cost_basis_usd: number;
 *   total_cost_basis_idr: number;
 *   total_unrealized_pnl_usd: number;
 *   total_unrealized_pnl_idr: number;
 *   total_unrealized_pnl_percentage: number;
 *   wallets: Array<Object>;
 *   allocation_by_asset: Array<{ symbol: string; total_balance: number; value_usd: number; value_idr: number; percentage: number }>;
 *   allocation_by_category: Array<{ category: string; value_usd: number; value_idr: number; percentage: number }>;
 * }}
 */
export function calculateCryptoPortfolio(wallets = [], prices = {}, usdToIdrRate = 16000) {
  const safeWallets = Array.isArray(wallets) ? wallets : [];
  const safeRate = Number(usdToIdrRate) > 0 ? Number(usdToIdrRate) : 16000;

  // Gabungkan harga dengan fallback default
  const mergedPrices = { ...DEFAULT_CRYPTO_PRICES_USD, ...prices };

  let totalPortfolioUsd = 0;
  let totalCostBasisUsd = 0;
  let totalCostedValueUsd = 0; // Nilai saat ini dari koin yang memiliki cost basis

  const processedWallets = [];
  const assetMap = new Map();

  for (const wallet of safeWallets) {
    const symbol = (wallet.asset_symbol || wallet.chain || 'BTC').toUpperCase().trim();
    const balance = Number(wallet.balance) >= 0 ? Number(wallet.balance) : 0;
    const unitPriceUsd = mergedPrices[symbol] || 0;
    const unitPriceIdr = unitPriceUsd * safeRate;
    const valueUsd = balance * unitPriceUsd;
    const valueIdr = valueUsd * safeRate;

    totalPortfolioUsd += valueUsd;

    // Kalkulasi PnL per dompet jika cost_basis tersedia
    let walletCostBasisUsd = null;
    let walletCostBasisIdr = null;
    let walletUnrealizedPnlUsd = null;
    let walletUnrealizedPnlIdr = null;
    let walletUnrealizedPnlPct = null;

    if (
      wallet.cost_basis !== null &&
      wallet.cost_basis !== undefined &&
      !isNaN(Number(wallet.cost_basis)) &&
      Number(wallet.cost_basis) > 0
    ) {
      const unitCost = Number(wallet.cost_basis);
      // Cost basis total dihitung: harga beli satuan dikalikan jumlah saldo
      walletCostBasisUsd = unitCost * balance;
      walletCostBasisIdr = walletCostBasisUsd * safeRate;
      walletUnrealizedPnlUsd = valueUsd - walletCostBasisUsd;
      walletUnrealizedPnlIdr = walletUnrealizedPnlUsd * safeRate;
      walletUnrealizedPnlPct = walletCostBasisUsd > 0
        ? (walletUnrealizedPnlUsd / walletCostBasisUsd) * 100
        : 0;

      totalCostBasisUsd += walletCostBasisUsd;
      totalCostedValueUsd += valueUsd;
    }

    processedWallets.push({
      ...wallet,
      asset_symbol: symbol,
      balance,
      unit_price_usd: unitPriceUsd,
      unit_price_idr: unitPriceIdr,
      value_usd: valueUsd,
      value_idr: valueIdr,
      cost_basis_total_usd: walletCostBasisUsd,
      cost_basis_total_idr: walletCostBasisIdr,
      unrealized_pnl_usd: walletUnrealizedPnlUsd,
      unrealized_pnl_idr: walletUnrealizedPnlIdr,
      unrealized_pnl_percentage: walletUnrealizedPnlPct,
      allocation_percentage: 0, // Akan dihitung setelah total keseluruhan didapat
    });

    // Agregasi per simbol aset
    const prevAsset = assetMap.get(symbol) || { balance: 0, valueUsd: 0 };
    assetMap.set(symbol, {
      balance: prevAsset.balance + balance,
      valueUsd: prevAsset.valueUsd + valueUsd,
    });
  }

  // Hitung persentase alokasi tiap dompet
  for (const pw of processedWallets) {
    pw.allocation_percentage = totalPortfolioUsd > 0
      ? (pw.value_usd / totalPortfolioUsd) * 100
      : 0;
  }

  // Hitung agregat PnL keseluruhan
  const totalCostBasisIdr = totalCostBasisUsd * safeRate;
  const totalUnrealizedPnlUsd = totalCostBasisUsd > 0
    ? totalCostedValueUsd - totalCostBasisUsd
    : 0;
  const totalUnrealizedPnlIdr = totalUnrealizedPnlUsd * safeRate;
  const totalUnrealizedPnlPct = totalCostBasisUsd > 0
    ? (totalUnrealizedPnlUsd / totalCostBasisUsd) * 100
    : 0;

  // Susun tabel alokasi per simbol aset
  const allocationByAsset = [];
  for (const [sym, data] of assetMap.entries()) {
    const valIdr = data.valueUsd * safeRate;
    allocationByAsset.push({
      symbol: sym,
      total_balance: data.balance,
      value_usd: data.valueUsd,
      value_idr: valIdr,
      percentage: totalPortfolioUsd > 0 ? (data.valueUsd / totalPortfolioUsd) * 100 : 0,
    });
  }
  // Urutkan dari nilai aset terbesar
  allocationByAsset.sort((a, b) => b.value_usd - a.value_usd);

  // Susun kategori aset: BTC, ETH, SOL, Stablecoins, Others
  const categoryTotals = {
    BTC: 0,
    ETH: 0,
    SOL: 0,
    Stablecoins: 0,
    Others: 0,
  };

  for (const item of allocationByAsset) {
    if (item.symbol === 'BTC') {
      categoryTotals.BTC += item.value_usd;
    } else if (item.symbol === 'ETH') {
      categoryTotals.ETH += item.value_usd;
    } else if (item.symbol === 'SOL') {
      categoryTotals.SOL += item.value_usd;
    } else if (STABLECOIN_SYMBOLS.includes(item.symbol)) {
      categoryTotals.Stablecoins += item.value_usd;
    } else {
      categoryTotals.Others += item.value_usd;
    }
  }

  const allocationByCategory = Object.entries(categoryTotals)
    .map(([cat, valUsd]) => ({
      category: cat,
      value_usd: valUsd,
      value_idr: valUsd * safeRate,
      percentage: totalPortfolioUsd > 0 ? (valUsd / totalPortfolioUsd) * 100 : 0,
    }))
    .filter((c) => c.value_usd > 0 || ['BTC', 'ETH', 'SOL', 'Stablecoins'].includes(c.category));

  return {
    total_usd: totalPortfolioUsd,
    total_idr: totalPortfolioUsd * safeRate,
    total_cost_basis_usd: totalCostBasisUsd,
    total_cost_basis_idr: totalCostBasisIdr,
    total_unrealized_pnl_usd: totalUnrealizedPnlUsd,
    total_unrealized_pnl_idr: totalUnrealizedPnlIdr,
    total_unrealized_pnl_percentage: totalUnrealizedPnlPct,
    wallets: processedWallets,
    allocation_by_asset: allocationByAsset,
    allocation_by_category: allocationByCategory,
  };
}

/**
 * Menghitung perkiraan untung/rugi (Unrealized PnL) untuk seluruh dompet.
 * @param {Array<Object>} wallets
 * @param {Record<string, number>} [prices={}]
 * @returns {{ total_pnl_usd: number; total_pnl_percentage: number; wallets_pnl: Array<Object> }}
 */
export function calculateUnrealizedPnL(wallets = [], prices = {}) {
  const result = calculateCryptoPortfolio(wallets, prices);
  return {
    total_pnl_usd: result.total_unrealized_pnl_usd,
    total_pnl_percentage: result.total_unrealized_pnl_percentage,
    wallets_pnl: result.wallets.map((w) => ({
      id: w.id,
      label: w.label,
      asset_symbol: w.asset_symbol,
      cost_basis: w.cost_basis,
      balance: w.balance,
      value_usd: w.value_usd,
      cost_basis_total_usd: w.cost_basis_total_usd,
      unrealized_pnl_usd: w.unrealized_pnl_usd,
      unrealized_pnl_percentage: w.unrealized_pnl_percentage,
    })),
  };
}

// ============================================================================
// 8. OPERASI PENYIMPANAN TERENKRIPSI (BRANKAS / LOCAL STORAGE)
// ============================================================================

/**
 * Mengambil seluruh dompet kripto yang tersimpan dari database aktif (brankas atau local).
 * Jika parameter db disediakan, mengambil langsung dari objek db tersebut.
 * @param {Object} [db] Objek basis data opsional
 * @returns {Promise<Array<Object>>}
 */
export async function getCryptoWallets(db = null) {
  const activeDb = db || (await loadDatabase());
  if (!activeDb || !Array.isArray(activeDb.crypto_wallets)) {
    return [];
  }
  return activeDb.crypto_wallets;
}

/**
 * Mengambil satu dompet kripto berdasarkan ID.
 * @param {string} id
 * @returns {Promise<Object | null>}
 */
export async function getCryptoWalletById(id) {
  if (!id) return null;
  const wallets = await getCryptoWallets();
  return wallets.find((w) => w.id === id) || null;
}

/**
 * Menyimpan dompet kripto baru atau memperbarui yang sudah ada dengan validasi ketat.
 * Terintegrasi penuh dengan loadDatabase() dan saveActiveDatabaseLocally().
 * @param {Object} walletData
 * @param {string} [walletData.id]
 * @param {string} walletData.label Label atau nama panggilan dompet
 * @param {string} walletData.chain Blockchain ('BTC', 'ETH', 'SOL', 'TRX', dll)
 * @param {string} walletData.address Alamat publik (Public Address)
 * @param {number} [walletData.balance=0] Saldo koin
 * @param {string} [walletData.asset_symbol] Simbol koin
 * @param {number} [walletData.cost_basis] Harga beli satuan dalam USD
 * @param {string} [walletData.notes] Catatan transaksi / dompet
 * @returns {Promise<{ success: boolean; wallet?: Object; error?: string }>}
 */
export async function saveCryptoWallet(walletData) {
  if (!walletData || typeof walletData !== 'object') {
    return { success: false, error: 'Data dompet tidak valid.' };
  }

  // 1. Audit Keamanan Non-Kustodian: Deteksi Private Key / Seed Phrase di seluruh bidang input
  const sensitiveCheck = checkObjectForSensitiveKeys(walletData);
  if (sensitiveCheck.detected) {
    return {
      success: false,
      error: `Pelanggaran Keamanan Non-Kustodian: Bidang '${sensitiveCheck.field}' terdeteksi mengandung ${sensitiveCheck.secretType}. Kayla Finance menolak keras input private key atau seed phrase demi keamanan dana Anda.`,
    };
  }

  // 2. Validasi Blockchain (Chain)
  const chain = (walletData.chain || '').toUpperCase().trim();
  if (!chain) {
    return { success: false, error: 'Nama blockchain (chain) wajib ditentukan.' };
  }

  // 3. Validasi Format Alamat Sesuai Chain
  const addressStr = (walletData.address || '').trim();
  if (!addressStr) {
    return { success: false, error: 'Alamat publik (public address) wajib diisi.' };
  }

  const addrValidation = validateCryptoAddress(addressStr, chain);
  if (!addrValidation.valid) {
    return { success: false, error: addrValidation.error };
  }

  // 4. Muat Database Aktif
  const db = (await loadDatabase()) || {};
  if (!Array.isArray(db.crypto_wallets)) {
    db.crypto_wallets = [];
  }

  const now = new Date().toISOString();
  const existingIndex = walletData.id
    ? db.crypto_wallets.findIndex((w) => w.id === walletData.id)
    : -1;

  // Tentukan simbol koin default jika tidak diisi
  let assetSymbol = (walletData.asset_symbol || '').toUpperCase().trim();
  if (!assetSymbol) {
    if (['ETH', 'ETHEREUM', 'BSC', 'POLYGON', 'ARBITRUM'].includes(chain)) {
      assetSymbol = chain === 'BSC' ? 'BNB' : chain === 'POLYGON' ? 'POL' : 'ETH';
    } else {
      assetSymbol = chain;
    }
  }

  // Format alamat yang dinormalisasi (EIP-55 checksum untuk EVM)
  const finalAddress = addrValidation.checksummedAddress || addrValidation.normalizedAddress || addressStr;

  const wallet = {
    id: walletData.id || `cw-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    label: walletData.label?.trim() || `Dompet ${chain}`,
    chain,
    address: finalAddress,
    balance: Number(walletData.balance) >= 0 ? Number(walletData.balance) : 0,
    asset_symbol: assetSymbol,
    cost_basis:
      walletData.cost_basis !== undefined &&
      walletData.cost_basis !== null &&
      !isNaN(Number(walletData.cost_basis))
        ? Number(walletData.cost_basis)
        : null,
    notes: walletData.notes?.trim() || '',
    created_at: existingIndex >= 0 ? db.crypto_wallets[existingIndex].created_at : now,
    updated_at: now,
  };

  if (existingIndex >= 0) {
    db.crypto_wallets[existingIndex] = wallet;
  } else {
    db.crypto_wallets.unshift(wallet);
  }

  // Simpan ke brankas terenkripsi atau penyimpanan lokal
  await saveActiveDatabaseLocally(db);

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('kayla_crypto_updated', { detail: { walletId: wallet.id } }));
    } catch {}
  }

  return { success: true, wallet };
}

/**
 * Memperbarui dompet kripto yang sudah ada berdasarkan ID dan bidang perubahannya.
 * @param {string} walletId ID dompet
 * @param {Object} updates Properti yang diperbarui
 * @returns {Promise<{ success: boolean; wallet?: Object; error?: string }>}
 */
export async function updateCryptoWallet(walletId, updates = {}) {
  if (!walletId) {
    return { success: false, error: 'ID dompet wajib disertakan.' };
  }

  // Audit keamanan non-kustodian
  const sensitiveCheck = checkObjectForSensitiveKeys(updates);
  if (sensitiveCheck.detected) {
    return {
      success: false,
      error: `Pelanggaran Keamanan Non-Kustodian: Bidang '${sensitiveCheck.field}' terdeteksi mengandung ${sensitiveCheck.secretType}. Kayla Finance menolak keras input kunci rahasia.`,
    };
  }

  const db = (await loadDatabase()) || {};
  if (!Array.isArray(db.crypto_wallets)) {
    return { success: false, error: 'Basis data dompet kripto tidak ditemukan.' };
  }

  const idx = db.crypto_wallets.findIndex((w) => w.id === walletId);
  if (idx === -1) {
    return { success: false, error: 'Dompet dengan ID tersebut tidak ditemukan.' };
  }

  const existing = db.crypto_wallets[idx];
  const targetChain = (updates.chain || existing.chain).toUpperCase().trim();
  const targetAddress = (updates.address || existing.address).trim();

  if (updates.address || updates.chain) {
    const validation = validateCryptoAddress(targetAddress, targetChain);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
  }

  const updatedWallet = {
    ...existing,
    ...updates,
    id: walletId,
    chain: targetChain,
    address: targetAddress,
    updated_at: new Date().toISOString(),
  };

  if (updates.balance !== undefined) {
    const b = Number(updates.balance);
    updatedWallet.balance = isNaN(b) || b < 0 ? 0 : b;
  }

  if (updates.cost_basis !== undefined) {
    const cb = Number(updates.cost_basis);
    updatedWallet.cost_basis = isNaN(cb) || cb < 0 ? null : cb;
  }

  db.crypto_wallets[idx] = updatedWallet;
  await saveActiveDatabaseLocally(db);

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('kayla_crypto_updated', { detail: { walletId } }));
    } catch {}
  }

  return { success: true, wallet: updatedWallet };
}

/**
 * Menghapus dompet kripto dari database aktif.
 * @param {string} id ID dompet
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function deleteCryptoWallet(id) {
  if (!id) {
    return { success: false, error: 'ID dompet wajib disertakan.' };
  }

  const db = await loadDatabase();
  if (!db || !Array.isArray(db.crypto_wallets)) {
    return { success: false, error: 'Database dompet kripto tidak ditemukan.' };
  }

  const initialCount = db.crypto_wallets.length;
  db.crypto_wallets = db.crypto_wallets.filter((w) => w.id !== id);

  if (db.crypto_wallets.length === initialCount) {
    return { success: false, error: 'Dompet dengan ID tersebut tidak ditemukan.' };
  }

  await saveActiveDatabaseLocally(db);

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('kayla_crypto_updated', { detail: { deletedId: id } }));
    } catch {}
  }

  return { success: true };
}

/**
 * Memperbarui saldo dompet kripto secara cepat.
 * @param {string} id ID dompet
 * @param {number} newBalance Saldo baru
 * @returns {Promise<{ success: boolean; wallet?: Object; error?: string }>}
 */
export async function updateWalletBalance(id, newBalance) {
  if (!id) {
    return { success: false, error: 'ID dompet wajib disertakan.' };
  }

  const parsedBalance = Number(newBalance);
  if (isNaN(parsedBalance) || parsedBalance < 0) {
    return { success: false, error: 'Saldo harus berupa angka bernilai nol atau positif.' };
  }

  const db = await loadDatabase();
  if (!db || !Array.isArray(db.crypto_wallets)) {
    return { success: false, error: 'Database dompet kripto tidak ditemukan.' };
  }

  const wallet = db.crypto_wallets.find((w) => w.id === id);
  if (!wallet) {
    return { success: false, error: 'Dompet dengan ID tersebut tidak ditemukan.' };
  }

  wallet.balance = parsedBalance;
  wallet.updated_at = new Date().toISOString();

  await saveActiveDatabaseLocally(db);

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('kayla_crypto_updated', {
          detail: { walletId: id, balance: parsedBalance },
        })
      );
    } catch {}
  }

  return { success: true, wallet };
}
