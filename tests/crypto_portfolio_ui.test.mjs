/**
 * @file crypto_portfolio_ui.test.mjs
 * Pengujian komprehensif untuk modul antarmuka Portofolio Kripto Watch-Only.
 * Memverifikasi validasi alamat, deteksi kunci rahasia, kalkulasi alokasi aset,
 * dan integritas operasional watch-only tanpa private key.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateCryptoAddress,
  detectSensitiveCryptoKey,
  assertWatchOnlySafe,
  DEFAULT_CRYPTO_PRICES_USD,
  calculateCryptoPortfolio,
  convertCryptoValue,
  STABLECOIN_SYMBOLS,
} from '../src/lib/crypto-tracker.js';

test('1. Validasi Alamat Bitcoin (BTC) Multi-Format', () => {
  // Legacy P2PKH (Awalan '1')
  const legacy = validateCryptoAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'BTC');
  assert.equal(legacy.valid, true);
  assert.equal(legacy.format, 'legacy_p2pkh');

  // SegWit P2SH (Awalan '3')
  const segwit = validateCryptoAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'BTC');
  assert.equal(segwit.valid, true);
  assert.equal(segwit.format, 'segwit_p2sh');

  // Native SegWit Bech32 (Awalan 'bc1q')
  const bech32 = validateCryptoAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'BTC');
  assert.equal(bech32.valid, true);

  // Alamat tidak valid
  const invalid = validateCryptoAddress('invalid_btc_address', 'BTC');
  assert.equal(invalid.valid, false);
});

test('2. Validasi Alamat EVM & Integritas Checksum EIP-55', () => {
  // Alamat checksum valid (Vitalik address)
  const validEvm = validateCryptoAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'ETH');
  assert.equal(validEvm.valid, true);

  // Alamat all-lowercase
  const lowerEvm = validateCryptoAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045', 'ETH');
  assert.equal(lowerEvm.valid, true);

  // Alamat mixed-case dengan checksum rusak (harus gagal)
  const badChecksum = validateCryptoAddress('0xD8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'ETH'); // D kapital salah
  assert.equal(badChecksum.valid, false);
});

test('3. Validasi Alamat Solana (SOL) Base58', () => {
  const solValid = validateCryptoAddress('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'SOL');
  assert.equal(solValid.valid, true);

  // Karakter ilegal di Base58 (huruf '0', 'O', 'I', 'l')
  const solIllegal = validateCryptoAddress('0xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'SOL');
  assert.equal(solIllegal.valid, false);
});

test('4. Validasi Alamat Tron (TRX) 34 Karakter Base58', () => {
  // USDT TRC-20 Contract / Tron address
  const trxValid = validateCryptoAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 'TRX');
  assert.equal(trxValid.valid, true);

  // Tidak diawali huruf 'T'
  const trxNoT = validateCryptoAddress('AR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 'TRX');
  assert.equal(trxNoT.valid, false);
});

test('5. Deteksi Kunci Privat dan Seed Phrase (Strict Non-Custodial Watch-Only)', () => {
  // Hex Private Key 64 karakter
  const hexKey = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
  const detHex = detectSensitiveCryptoKey(hexKey);
  assert.equal(detHex.detected, true);

  // BIP-39 Seed Phrase (12 kata)
  const seedPhrase = 'witch collapse practice feed shame open despair creek road again ice least';
  const detSeed = detectSensitiveCryptoKey(seedPhrase);
  assert.equal(detSeed.detected, true);

  // Validasi alamat menolak keras private key
  const valReject = validateCryptoAddress(hexKey, 'ETH');
  assert.equal(valReject.valid, false);
  assert.match(valReject.error, /Peringatan Keamanan Non-Kustodian/);

  // assertWatchOnlySafe melempar exception
  assert.throws(() => {
    assertWatchOnlySafe(seedPhrase, 'tes_input');
  }, /Pelanggaran Keamanan Non-Kustodian/);
});

test('6. Kalkulasi Portofolio dan Alokasi Kategori Aset', () => {
  const mockWallets = [
    { id: 'w1', label: 'Ledger BTC', chain: 'BTC', asset_symbol: 'BTC', balance: 1.0, cost_basis: 60000 },
    { id: 'w2', label: 'Staking ETH', chain: 'ETH', asset_symbol: 'ETH', balance: 10.0, cost_basis: 2000 },
    { id: 'w3', label: 'Treasury USDT', chain: 'TRX', asset_symbol: 'USDT', balance: 5000, cost_basis: 1.0 },
  ];

  const customPrices = {
    BTC: 70000,
    ETH: 3000,
    USDT: 1.0,
  };

  const usdToIdr = 16000;
  const portfolio = calculateCryptoPortfolio(mockWallets, customPrices, usdToIdr);

  // Expected Total USD: (1 * 70,000) + (10 * 3,000) + (5000 * 1) = 70,000 + 30,000 + 5000 = 105,000 USD
  assert.equal(portfolio.total_usd, 105000);
  assert.equal(portfolio.total_idr, 105000 * 16000);

  // Expected Cost Basis USD: 60,000 + 20,000 + 5000 = 85,000 USD
  assert.equal(portfolio.total_cost_basis_usd, 85000);

  // Unrealized PnL: 105,000 - 85,000 = +20,000 USD
  assert.equal(portfolio.total_unrealized_pnl_usd, 20000);

  // Alokasi kategori
  const btcCat = portfolio.allocation_by_category.find((c) => c.category === 'BTC');
  const ethCat = portfolio.allocation_by_category.find((c) => c.category === 'ETH');
  const stableCat = portfolio.allocation_by_category.find((c) => c.category === 'Stablecoins');

  assert.ok(btcCat && btcCat.value_usd === 70000);
  assert.ok(ethCat && ethCat.value_usd === 30000);
  assert.ok(stableCat && stableCat.value_usd === 5000);
});

test('7. Konversi Nilai Kripto Satuan Multi-Currency', () => {
  const conv = convertCryptoValue(2.5, 'ETH', { ETH: 2500 }, 16000);
  assert.equal(conv.amount, 2.5);
  assert.equal(conv.symbol, 'ETH');
  assert.equal(conv.unitPriceUsd, 2500);
  assert.equal(conv.unitPriceIdr, 2500 * 16000);
  assert.equal(conv.valueUsd, 6250);
  assert.equal(conv.valueIdr, 6250 * 16000);
});
