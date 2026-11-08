/**
 * @file Kayla Finance Master Automated Test Runner
 * Menjalankan seluruh rangkaian pengujian unit, integrasi, kriptografi, buku besar, OCR, dan dompet kripto.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TEST_SUITES = [
  { name: 'Encrypted Vault & Cryptography (PBKDF2 600k + AES-GCM)', file: 'tests/encrypted_backup.test.mjs', args: [] },
  { name: 'Security Hardening, Auth, CSRF & Edge Constant-Time', file: 'tests/security_hardening.test.mjs', args: ['--import', './tests/loader.mjs'] },
  { name: 'Vault Storage & Plaintext Leak Prevention', file: 'tests/vault_storage_security.test.mjs', args: [] },
  { name: 'Financial Ledger Engine & Float Precision', file: 'tests/ledger_engine.test.mjs', args: [] },
  { name: 'Receipt OCR Parser & Retail Categorization', file: 'tests/receipt_parser.test.mjs', args: [] },
  { name: 'Non-Custodial Watch-Only Crypto Wallet Tracker', file: 'tests/crypto_tracker.test.mjs', args: [] },
  { name: 'Crypto Portfolio UI & Multi-Chain Formats', file: 'tests/crypto_portfolio_ui.test.mjs', args: [] },
  { name: 'MT5 Trading Connector, M2M Auth & Null Safety', file: 'tests/trading_sync_m2m.test.mjs', args: [] },
  { name: 'DevSecOps, Static Export Leak & Deployment Gate Audit', file: 'tests/devsecops_audit.test.mjs', args: [] },
  { name: 'Demo Zero Balance, Cache Purge & Vault Isolation', file: 'tests/demo_zero_balance.test.mjs', args: [] },
  { name: 'Mobile Gesture Navigation & Preview Consistency', file: 'tests/swipe_navigation.test.mjs', args: [] },
];

async function runCommand(cmd, args) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn(cmd, args, { cwd: rootDir, env: { ...process.env, NODE_ENV: 'test' } });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({ code, stdout, stderr, duration });
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('KAYLA FINANCE: MASTER AUTOMATED TEST RUNNER');
  console.log('Workspace: ' + rootDir);
  console.log('================================================================\n');

  let totalSuites = TEST_SUITES.length;
  let passedSuites = 0;
  let failedSuites = 0;
  let overallStart = Date.now();
  const results = [];

  for (const suite of TEST_SUITES) {
    process.stdout.write(`Menjalankan: ${suite.name} ... `);
    const cmdArgs = [...suite.args, suite.file];
    const res = await runCommand(process.execPath, cmdArgs);

    let passCount = 0;
    let failCount = 0;

    // Hitung pass / fail dari output
    const passMatches = res.stdout.match(/\[PASS\]|✔|pass/gi) || [];
    const failMatches = res.stdout.match(/\[FAIL\]|✖|fail/gi) || [];

    if (res.code === 0) {
      passedSuites++;
      console.log(`[SUKSES] (${res.duration}ms)`);
      results.push({ name: suite.name, status: 'PASSED', duration: res.duration, output: res.stdout });
    } else {
      failedSuites++;
      console.log(`[GAGAL] (Exit Code: ${res.code}, ${res.duration}ms)`);
      console.error(res.stderr || res.stdout);
      results.push({ name: suite.name, status: 'FAILED', duration: res.duration, error: res.stderr || res.stdout });
    }
  }

  const overallDuration = Date.now() - overallStart;

  console.log('\n================================================================');
  console.log('RINGKASAN EKSEKUTIF PENGUJIAN OTOMATIS:');
  console.log('================================================================');
  console.log(`Total Test Suite : ${totalSuites}`);
  console.log(`Suite Lulus      : ${passedSuites}`);
  console.log(`Suite Gagal      : ${failedSuites}`);
  console.log(`Total Durasi     : ${(overallDuration / 1000).toFixed(2)} detik`);
  console.log('================================================================');

  results.forEach((r, idx) => {
    const icon = r.status === 'PASSED' ? '[OK]' : '[ERR]';
    console.log(`${icon} Suite ${idx + 1}: ${r.name} - ${r.status} (${r.duration}ms)`);
  });

  console.log('================================================================\n');

  if (failedSuites > 0) {
    process.exit(1);
  }
}

main();
