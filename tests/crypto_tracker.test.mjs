/**
 * @file crypto_tracker.test.mjs
 * Test Suite Otomatis: Non-Custodial Watch-Only Crypto Tracker
 * Kayla Finance - Agent 09 (Crypto Wallet Tracker Specialist)
 *
 * Menguji:
 * 1. Validasi Alamat BTC (Legacy, SegWit, Native SegWit, Taproot) dan penolakan format cacat.
 * 2. Validasi Alamat Ethereum & EVM (format 0x + 40 hex char, EIP-55 checksum, penolakan checksum rusak).
 * 3. Validasi Alamat Solana (SOL Base58 32-44 karakter, penolakan karakter terlarang 0, O, I, l).
 * 4. Validasi Alamat Tron (TRX Base58 diawali 'T' 34 karakter, penolakan format salah).
 * 5. Penolakan Mutlak Kunci Rahasia: Hex Private Key (64 karakter hex), Bitcoin WIF, dan BIP-39 Seed Phrase.
 * 6. Mesin Harga & Fallback Offline Hardened saat jaringan offline atau tanpa API key.
 * 7. Konversi Multi-Mata Uang (USD dan IDR) dengan rate dinamis.
 * 8. Kalkulasi Portofolio, Alokasi Aset (BTC, ETH, SOL, Stablecoins), dan Unrealized PnL.
 * 9. Operasi Penyimpanan Terenkripsi (Brankas / Local): get, save, update, delete, update balance.
 */

import assert from 'node:assert';

// ----------------------------------------------------------------------------
// Setup Mock Environment untuk Node.js (localStorage & window)
// ----------------------------------------------------------------------------
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => (mockStorage.has(key) ? mockStorage.get(key) : null),
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
  get length() { return mockStorage.size; },
};

const windowEvents = [];
const eventListeners = new Map();
globalThis.window = {
  location: { hostname: 'localhost', pathname: '/' },
  addEventListener: (type, listener) => {
    if (!eventListeners.has(type)) eventListeners.set(type, []);
    eventListeners.get(type).push(listener);
  },
  removeEventListener: (type, listener) => {
    if (!eventListeners.has(type)) return;
    eventListeners.set(type, eventListeners.get(type).filter((l) => l !== listener));
  },
  dispatchEvent: (event) => {
    windowEvents.push(event);
    const list = eventListeners.get(event.type) || [];
    for (const fn of list) {
      try { fn(event); } catch (e) { console.error(e); }
    }
    return true;
  },
};

// Inisialisasi basis data awal di localStorage untuk pengujian
const initialTestDatabase = {
  settings: {
    app_name: 'Kayla Finance Test',
    default_currency: 'IDR',
    usd_to_idr_rate: 16500,
  },
  accounts: [],
  transactions: [],
  categories: [],
  crypto_wallets: [],
};
mockStorage.set('kayla_finance_db_v2', JSON.stringify(initialTestDatabase));

// Impor modul crypto-tracker yang diuji
import {
  validateCryptoAddress,
  validateBitcoinAddress,
  validateEvmAddress,
  validateSolanaAddress,
  validateTronAddress,
  detectSensitiveCryptoKey,
  detectPrivateKeyOrSeedPhrase,
  isPrivateKeyOrSeedPhrase,
  assertWatchOnlySafe,
  toChecksumAddress,
  keccak256,
  fetchCryptoPrices,
  fetchPublicCryptoPrices,
  convertCryptoValue,
  calculateCryptoPortfolio,
  calculateUnrealizedPnL,
  getCryptoWallets,
  getCryptoWalletById,
  saveCryptoWallet,
  updateCryptoWallet,
  deleteCryptoWallet,
  updateWalletBalance,
  DEFAULT_CRYPTO_PRICES_USD,
  DEFAULT_CRYPTO_PRICES,
  SUPPORTED_CHAINS,
  SUPPORTED_ASSETS,
  STABLECOIN_SYMBOLS,
} from '../src/lib/crypto-tracker.js';

let passedTests = 0;
let totalTests = 0;

function runTest(testName, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`[PASS] Test ${totalTests}: ${testName}`);
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${testName}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runAsyncTest(testName, testFn) {
  totalTests++;
  try {
    await testFn();
    passedTests++;
    console.log(`[PASS] Test ${totalTests}: ${testName}`);
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${testName}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('================================================================');
console.log('KAYLA FINANCE: NON-CUSTODIAL WATCH-ONLY CRYPTO TRACKER TESTS');
console.log('================================================================');

// ----------------------------------------------------------------------------
// 1. VALIDASI ALAMAT BITCOIN (BTC)
// ----------------------------------------------------------------------------

runTest('Validasi Alamat BTC Legacy P2PKH (awalan 1) yang sah', () => {
  // Alamat Genesis Block Satoshi Nakamoto
  const satoshiAddr = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  const result = validateCryptoAddress(satoshiAddr, 'BTC');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.chain, 'BTC');
  assert.strictEqual(result.format, 'legacy_p2pkh');
});

runTest('Validasi Alamat BTC SegWit P2SH (awalan 3) yang sah', () => {
  const p2shAddr = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
  const result = validateCryptoAddress(p2shAddr, 'BTC');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.chain, 'BTC');
  assert.strictEqual(result.format, 'segwit_p2sh');
});

runTest('Validasi Alamat BTC Native SegWit Bech32 (awalan bc1q) yang sah', () => {
  const bech32Addr = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
  const result = validateCryptoAddress(bech32Addr, 'BTC');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.chain, 'BTC');
  assert.strictEqual(result.format, 'native_segwit_bech32_p2wpkh');
});

runTest('Validasi Alamat BTC Taproot Bech32m (awalan bc1p) yang sah', () => {
  const taprootAddr = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0';
  const result = validateCryptoAddress(taprootAddr, 'BTC');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.chain, 'BTC');
  assert.strictEqual(result.format, 'taproot_bech32m');
});

runTest('Penolakan Alamat Bitcoin dengan format salah atau karakter terlarang Base58 (0, O, I, l)', () => {
  // Karakter '0' (angka nol) dilarang dalam Base58 Legacy
  const badAddr0 = '101zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  assert.strictEqual(validateCryptoAddress(badAddr0, 'BTC').valid, false);

  // Karakter 'I' (huruf i kapital) dilarang dalam Base58
  const badAddrI = '1A1zP1eP5QGefI2DMPTfTL5SLmv7DivfNa';
  assert.strictEqual(validateCryptoAddress(badAddrI, 'BTC').valid, false);

  // Alamat terlalu pendek
  assert.strictEqual(validateCryptoAddress('1A1zP1e', 'BTC').valid, false);

  // Alamat kosong
  assert.strictEqual(validateCryptoAddress('', 'BTC').valid, false);
});

// ----------------------------------------------------------------------------
// 2. VALIDASI ALAMAT ETHEREUM & EVM DENGAN EIP-55 CHECKSUM
// ----------------------------------------------------------------------------

runTest('Validasi Alamat Ethereum & EVM lowercase yang sah', () => {
  const ethAddr = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
  const result = validateCryptoAddress(ethAddr, 'ETH');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.chain, 'ETH');
  assert.strictEqual(result.format, 'evm_hex');
  assert.strictEqual(result.checksummedAddress, '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
});

runTest('Validasi Alamat Ethereum & EVM dengan checksum EIP-55 yang tepat', () => {
  const checksummedEth = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const result = validateCryptoAddress(checksummedEth, 'ETH');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.format, 'eip55_checksummed');
  assert.strictEqual(result.checksummedAddress, checksummedEth);
});

runTest('Penolakan Alamat Ethereum & EVM jika checksum EIP-55 terdistorsi/tampered', () => {
  // Memodifikasi kapitalisasi huruf: 'a' diubah menjadi 'A' di posisi yang salah
  const tamperedEth = '0xD8da6bf26964af9d7eed9e03e53415d37aa96045';
  const result = validateCryptoAddress(tamperedEth, 'ETH');
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('EIP-55'));
});

runTest('Penolakan Alamat Ethereum dengan panjang bukan 40 karakter heksadesimal atau tanpa 0x', () => {
  // Kurang 1 karakter (39 hex)
  const shortEth = '0xd8da6bf26964af9d7eed9e03e53415d37aa9604';
  assert.strictEqual(validateCryptoAddress(shortEth, 'ETH').valid, false);

  // Mengandung karakter non-heksadesimal 'Z'
  const nonHexEth = '0xd8da6bf26964af9d7eed9e03e53415d37aa9604Z';
  assert.strictEqual(validateCryptoAddress(nonHexEth, 'ETH').valid, false);

  // Tanpa awalan 0x
  const noPrefix = 'd8da6bf26964af9d7eed9e03e53415d37aa96045';
  assert.strictEqual(validateCryptoAddress(noPrefix, 'ETH').valid, false);
});

// ----------------------------------------------------------------------------
// 3. VALIDASI ALAMAT SOLANA (SOL)
// ----------------------------------------------------------------------------

runTest('Validasi Alamat Solana (SOL) Base58 sah (32-44 karakter)', () => {
  const solAddr = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  const result = validateCryptoAddress(solAddr, 'SOL');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.chain, 'SOL');
  assert.strictEqual(result.format, 'base58_solana');
});

runTest('Penolakan Alamat Solana dengan karakter non-Base58 (0, O, I, l) atau panjang di luar batas', () => {
  // Karakter '0' (angka nol) dilarang di Base58
  const badSol0 = '0WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  assert.strictEqual(validateCryptoAddress(badSol0, 'SOL').valid, false);

  // Karakter 'O' (huruf O kapital) dilarang di Base58
  const badSolO = 'OWzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  assert.strictEqual(validateCryptoAddress(badSolO, 'SOL').valid, false);

  // Terlalu pendek (< 32 karakter)
  assert.strictEqual(validateCryptoAddress('9WzDXwBbmkg8ZTbNMqUxvQRAyr', 'SOL').valid, false);
});

// ----------------------------------------------------------------------------
// 4. VALIDASI ALAMAT TRON (TRX)
// ----------------------------------------------------------------------------

runTest('Validasi Alamat Tron (TRX) yang sah (awalan T, 34 karakter Base58)', () => {
  // Alamat resmi Kontrak USDT pada jaringan Tron
  const tronUsdtAddr = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const result = validateCryptoAddress(tronUsdtAddr, 'TRX');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.chain, 'TRX');
  assert.strictEqual(result.format, 'base58_tron');
});

runTest('Penolakan Alamat Tron jika panjang bukan 34 karakter atau tidak diawali huruf T', () => {
  // Tidak diawali T
  const notT = 'AR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  assert.strictEqual(validateCryptoAddress(notT, 'TRX').valid, false);

  // Kurang dari 34 karakter (33 karakter)
  const shortTron = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6';
  assert.strictEqual(validateCryptoAddress(shortTron, 'TRX').valid, false);

  // Lebih dari 34 karakter (35 karakter)
  const longTron = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6taa';
  assert.strictEqual(validateCryptoAddress(longTron, 'TRX').valid, false);
});

// ----------------------------------------------------------------------------
// 5. KEAMANAN NON-KUSTODIAN MUTLAK: PENOLAKAN KUNCI PRIVAT & SEED PHRASE
// ----------------------------------------------------------------------------

runTest('Keamanan Non-Kustodian: Penolakan input Hexadecimal Private Key (64 hex characters)', () => {
  const hexPrivateKeyWith0x = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
  const resultWith0x = detectSensitiveCryptoKey(hexPrivateKeyWith0x);
  assert.strictEqual(resultWith0x.detected, true);
  assert.ok(resultWith0x.secretType.includes('Hexadecimal Private Key'));

  // Uji penolakan via validateCryptoAddress
  const validateResult = validateCryptoAddress(hexPrivateKeyWith0x, 'ETH');
  assert.strictEqual(validateResult.valid, false);
  assert.ok(validateResult.error.includes('Non-Kustodian'));

  // Uji tanpa awalan 0x
  const hexPrivateKeyRaw = '4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
  assert.strictEqual(isPrivateKeyOrSeedPhrase(hexPrivateKeyRaw), true);
  assert.strictEqual(validateCryptoAddress(hexPrivateKeyRaw, 'ETH').valid, false);
});

runTest('Keamanan Non-Kustodian: Penolakan input Bitcoin WIF Private Key (awalan 5, K, atau L)', () => {
  // WIF Uncompressed (awalan 5, 51 karakter)
  const wif5 = '5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ';
  const resultWif5 = detectSensitiveCryptoKey(wif5);
  assert.strictEqual(resultWif5.detected, true);
  assert.ok(resultWif5.secretType.includes('WIF'));
  assert.strictEqual(validateCryptoAddress(wif5, 'BTC').valid, false);

  // WIF Compressed (awalan K atau L, 52 karakter)
  const wifK = 'KxFC1jtffDYjNBHd6EpCtUVMZ3a4L74Dhs34d6Xg55bSbhRtgL2T';
  const resultWifK = detectSensitiveCryptoKey(wifK);
  assert.strictEqual(resultWifK.detected, true);
  assert.strictEqual(validateCryptoAddress(wifK, 'BTC').valid, false);
});

runTest('Keamanan Non-Kustodian: Penolakan input BIP-39 Seed Phrase (12 kata dan 24 kata rahasia)', () => {
  const seed12 = 'witch collapse practice feed shame open despair creek road again ice least';
  const resultSeed12 = detectSensitiveCryptoKey(seed12);
  assert.strictEqual(resultSeed12.detected, true);
  assert.ok(resultSeed12.secretType.includes('Seed Phrase'));
  assert.strictEqual(validateCryptoAddress(seed12, 'AUTO').valid, false);

  const seed24 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
  assert.strictEqual(isPrivateKeyOrSeedPhrase(seed24), true);
  assert.strictEqual(validateCryptoAddress(seed24, 'BTC').valid, false);
});

// ----------------------------------------------------------------------------
// 6. MESIN HARGA & FALLBACK OFFLINE HARDENED
// ----------------------------------------------------------------------------

await runAsyncTest('Mesin Harga: Hardened fallback offline saat endpoint publik tidak dapat diakses', async () => {
  // Panggil fetchCryptoPrices dengan timeout sangat pendek untuk mensimulasikan offline
  const prices = await fetchCryptoPrices({ timeoutMs: 1, forceRefresh: true });
  assert.ok(prices.BTC > 0);
  assert.ok(prices.ETH > 0);
  assert.ok(prices.SOL > 0);
  assert.strictEqual(prices.USDT, 1.0);
  assert.strictEqual(prices.USDC, 1.0);
  assert.strictEqual(prices.BTC, DEFAULT_CRYPTO_PRICES_USD.BTC);
});

runTest('Mesin Harga: Konversi nilai kripto ke USD dan IDR dengan kurs dinamis', () => {
  const amount = 2.5; // 2.5 ETH
  const customPrices = { ETH: 3000 };
  const usdToIdrRate = 16000;

  const result = convertCryptoValue(amount, 'ETH', customPrices, usdToIdrRate);
  assert.strictEqual(result.amount, 2.5);
  assert.strictEqual(result.symbol, 'ETH');
  assert.strictEqual(result.unitPriceUsd, 3000);
  assert.strictEqual(result.valueUsd, 7500); // 2.5 * 3000
  assert.strictEqual(result.unitPriceIdr, 48000000); // 3000 * 16000
  assert.strictEqual(result.valueIdr, 120000000); // 7500 * 16000
  assert.strictEqual(result.isFallbackPrice, false);
});

runTest('Mesin Harga: Konversi menggunakan fallback otomatis jika aset tidak terdaftar di custom prices', () => {
  const result = convertCryptoValue(1, 'SOL', {}, 16000);
  assert.strictEqual(result.unitPriceUsd, DEFAULT_CRYPTO_PRICES_USD.SOL);
  assert.strictEqual(result.isFallbackPrice, true);
  assert.strictEqual(result.valueUsd, DEFAULT_CRYPTO_PRICES_USD.SOL);
  assert.strictEqual(result.valueIdr, DEFAULT_CRYPTO_PRICES_USD.SOL * 16000);
});

// ----------------------------------------------------------------------------
// 7. KALKULASI PORTOFOLIO, ALOKASI ASET & UNREALIZED PnL
// ----------------------------------------------------------------------------

runTest('Kalkulasi Portofolio: Menghitung total nilai USD dan IDR dengan alokasi aset yang tepat', () => {
  const mockWallets = [
    {
      id: 'cw-1',
      label: 'Cold Storage BTC',
      chain: 'BTC',
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      balance: 1.0,
      asset_symbol: 'BTC',
      cost_basis: 50000, // Beli di $50,000
    },
    {
      id: 'cw-2',
      label: 'Main Staking ETH',
      chain: 'ETH',
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      balance: 10.0,
      asset_symbol: 'ETH',
      cost_basis: 2000, // Beli di $2,000
    },
    {
      id: 'cw-3',
      label: 'DeFi Cash Reserve',
      chain: 'ETH',
      address: '0x0000000000000000000000000000000000000001',
      balance: 5000.0,
      asset_symbol: 'USDT',
      cost_basis: 1.0,
    },
  ];

  const customPrices = {
    BTC: 60000,
    ETH: 3000,
    USDT: 1.0,
  };
  const rate = 16000;

  const portfolio = calculateCryptoPortfolio(mockWallets, customPrices, rate);

  // Nilai perhitungan ekspektasi:
  // BTC: 1.0 * 60,000 = $60,000
  // ETH: 10.0 * 3,000 = $30,000
  // USDT: 5,000 * 1.0 = $5,000
  // Total USD = $95,000
  // Total IDR = 95,000 * 16,000 = Rp 1,520,000,000
  assert.strictEqual(portfolio.total_usd, 95000);
  assert.strictEqual(portfolio.total_idr, 1520000000);

  // Cost Basis ekspektasi:
  // BTC cost = 1.0 * 50,000 = $50,000
  // ETH cost = 10.0 * 2,000 = $20,000
  // USDT cost = 5,000 * 1.0 = $5,000
  // Total Cost Basis = $75,000
  assert.strictEqual(portfolio.total_cost_basis_usd, 75000);
  assert.strictEqual(portfolio.total_cost_basis_idr, 75000 * 16000);

  // Unrealized PnL ekspektasi:
  // Total PnL = 95,000 - 75,000 = +$20,000
  // PnL % = (20,000 / 75,000) * 100 = 26.6666...%
  assert.strictEqual(portfolio.total_unrealized_pnl_usd, 20000);
  assert.strictEqual(portfolio.total_unrealized_pnl_idr, 20000 * 16000);
  assert.ok(Math.abs(portfolio.total_unrealized_pnl_percentage - 26.666) < 0.01);

  // Uji Alokasi Kategori
  const btcCat = portfolio.allocation_by_category.find((c) => c.category === 'BTC');
  const ethCat = portfolio.allocation_by_category.find((c) => c.category === 'ETH');
  const stableCat = portfolio.allocation_by_category.find((c) => c.category === 'Stablecoins');

  assert.ok(btcCat);
  assert.strictEqual(btcCat.value_usd, 60000);
  assert.ok(Math.abs(btcCat.percentage - (60000 / 95000) * 100) < 0.001);

  assert.ok(ethCat);
  assert.strictEqual(ethCat.value_usd, 30000);

  assert.ok(stableCat);
  assert.strictEqual(stableCat.value_usd, 5000);
});

runTest('Kalkulasi Unrealized PnL: calculateUnrealizedPnL menghitung untung rugi per dompet dengan tepat', () => {
  const wallets = [
    {
      id: 'cw-profit',
      label: 'Untung',
      asset_symbol: 'BTC',
      balance: 0.5,
      cost_basis: 40000, // Cost = 0.5 * 40k = $20k
    },
    {
      id: 'cw-loss',
      label: 'Rugi',
      asset_symbol: 'ETH',
      balance: 2.0,
      cost_basis: 4000, // Cost = 2 * 4k = $8k
    },
  ];
  const prices = {
    BTC: 60000, // Nilai saat ini = 0.5 * 60k = $30k (+10k untung)
    ETH: 3000,  // Nilai saat ini = 2 * 3k = $6k (-2k rugi)
  };

  const pnl = calculateUnrealizedPnL(wallets, prices);
  // Total Cost = 20k + 8k = 28k
  // Total Nilai = 30k + 6k = 36k
  // Total PnL = +8k (+28.57%)
  assert.strictEqual(pnl.total_pnl_usd, 8000);
  assert.ok(Math.abs(pnl.total_pnl_percentage - (8000 / 28000) * 100) < 0.01);

  const walletProfit = pnl.wallets_pnl.find((w) => w.id === 'cw-profit');
  assert.strictEqual(walletProfit.unrealized_pnl_usd, 10000);
  assert.strictEqual(walletProfit.unrealized_pnl_percentage, 50);

  const walletLoss = pnl.wallets_pnl.find((w) => w.id === 'cw-loss');
  assert.strictEqual(walletLoss.unrealized_pnl_usd, -2000);
  assert.strictEqual(walletLoss.unrealized_pnl_percentage, -25);
});

// ----------------------------------------------------------------------------
// 8. OPERASI PENYIMPANAN TERENKRIPSI (BRANKAS / LOCAL STORAGE)
// ----------------------------------------------------------------------------

await runAsyncTest('Penyimpanan: saveCryptoWallet berhasil memvalidasi dan menyimpan dompet baru', async () => {
  const newWalletPayload = {
    label: 'Tabungan Bitcoin Hard HODL',
    chain: 'BTC',
    address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    balance: 0.75,
    asset_symbol: 'BTC',
    cost_basis: 42000,
    notes: 'Disimpan di cold card hardware wallet.',
  };

  const saveRes = await saveCryptoWallet(newWalletPayload);
  assert.strictEqual(saveRes.success, true);
  assert.ok(saveRes.wallet.id.startsWith('cw-'));
  assert.strictEqual(saveRes.wallet.address, 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
  assert.strictEqual(saveRes.wallet.balance, 0.75);

  // Ambil dan pastikan tersimpan di database
  const wallets = await getCryptoWallets();
  assert.strictEqual(wallets.length, 1);
  assert.strictEqual(wallets[0].id, saveRes.wallet.id);
});

await runAsyncTest('Penyimpanan: saveCryptoWallet MENOLAK penyimpanan jika label atau catatan disusupi seed phrase / private key', async () => {
  const taintedPayload = {
    label: 'Dompet Bocor',
    chain: 'ETH',
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    balance: 1.0,
    notes: 'witch collapse practice feed shame open despair creek road again ice least', // Seed phrase terlarang!
  };

  const res = await saveCryptoWallet(taintedPayload);
  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes('Non-Kustodian'));
});

await runAsyncTest('Penyimpanan: updateWalletBalance memperbarui saldo secara cepat dan aman', async () => {
  const wallets = await getCryptoWallets();
  const targetId = wallets[0].id;

  const updateRes = await updateWalletBalance(targetId, 1.25);
  assert.strictEqual(updateRes.success, true);
  assert.strictEqual(updateRes.wallet.balance, 1.25);

  const updatedWallet = await getCryptoWalletById(targetId);
  assert.strictEqual(updatedWallet.balance, 1.25);
});

await runAsyncTest('Penyimpanan: updateCryptoWallet memperbarui atribut dompet tanpa kebocoran', async () => {
  const wallets = await getCryptoWallets();
  const targetId = wallets[0].id;

  const updateRes = await updateCryptoWallet(targetId, {
    label: 'Tabungan Bitcoin Diperbarui',
    notes: 'Catatan tambahan terverifikasi.',
  });
  assert.strictEqual(updateRes.success, true);
  assert.strictEqual(updateRes.wallet.label, 'Tabungan Bitcoin Diperbarui');
});

await runAsyncTest('Penyimpanan: deleteCryptoWallet menghapus dompet dari penyimpanan aktif', async () => {
  const wallets = await getCryptoWallets();
  const targetId = wallets[0].id;

  const deleteRes = await deleteCryptoWallet(targetId);
  assert.strictEqual(deleteRes.success, true);

  const remaining = await getCryptoWallets();
  assert.strictEqual(remaining.length, 0);
});

runTest('Struktur Konstanta: Memastikan SUPPORTED_CHAINS dan SUPPORTED_ASSETS diekspor lengkap', () => {
  assert.ok(Array.isArray(SUPPORTED_CHAINS));
  assert.ok(SUPPORTED_CHAINS.some((c) => c.id === 'BTC'));
  assert.ok(SUPPORTED_CHAINS.some((c) => c.id === 'ETH'));
  assert.ok(SUPPORTED_CHAINS.some((c) => c.id === 'SOL'));
  assert.ok(SUPPORTED_CHAINS.some((c) => c.id === 'TRX'));

  assert.ok(Array.isArray(SUPPORTED_ASSETS));
  assert.ok(SUPPORTED_ASSETS.some((a) => a.symbol === 'BTC'));
  assert.ok(SUPPORTED_ASSETS.some((a) => a.symbol === 'ETH'));
  assert.ok(SUPPORTED_ASSETS.some((a) => a.symbol === 'USDT'));
});

console.log('================================================================');
console.log(`HASIL TEST SUITE: ${passedTests} PASSED, ${totalTests - passedTests} FAILED (TOTAL ${totalTests})`);
console.log('================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
