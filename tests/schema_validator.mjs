/**
 * Kayla Finance - Supabase Migration & RLS Security Validator
 * Memverifikasi integritas penamaan migrasi, isolasi rollback, skema PostgreSQL, dan RLS security.
 */

import fs from 'fs';
import path from 'path';

console.log('================================================================');
console.log('KAYLA FINANCE: SUPABASE MIGRATION & RLS SECURITY VALIDATOR');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function assertCheck(condition, name, details) {
  if (condition) {
    passed++;
    console.log(`[PASS] ${name}`);
    if (details) console.log(`       Detail: ${JSON.stringify(details)}`);
  } else {
    failed++;
    console.error(`[FAIL] ${name}`);
    if (details) console.error(`       Detail: ${JSON.stringify(details)}`);
  }
}

// 1. Audit Direktori supabase/migrations/
const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir);

const hasRollbackInMigrations = migrationFiles.some(f => f.toLowerCase().includes('rollback'));
assertCheck(
  !hasRollbackInMigrations,
  'Isolasi Rollback: Tidak ada file rollback di dalam supabase/migrations/',
  { filesInMigrations: migrationFiles }
);

// 2. Format Penamaan Sesuai Standar Supabase CLI (YYYYMMDDHHMMSS_name.sql)
const supabaseNamingRegex = /^\d{14}_[a-z0-9_]+\.sql$/;
const allNamesValid = migrationFiles.every(f => supabaseNamingRegex.test(f));
assertCheck(
  allNamesValid && migrationFiles.length > 0,
  'Kepatuhan Penamaan Supabase CLI (YYYYMMDDHHMMSS_name.sql)',
  { migrationFiles }
);

// 3. Verifikasi Keberadaan Direktori Rollback Terisolasi
const rollbacksDir = path.join(process.cwd(), 'supabase', 'rollbacks');
const hasRollbacksDir = fs.existsSync(rollbacksDir);
const rollbackFiles = hasRollbacksDir ? fs.readdirSync(rollbacksDir) : [];
assertCheck(
  hasRollbacksDir && rollbackFiles.length > 0,
  'Direktori Rollback Terpisah (supabase/rollbacks/) Tersedia',
  { rollbackFiles }
);

// 4. Analisis Konten Skema Migrasi
const canonicalMigrationPath = path.join(migrationsDir, migrationFiles[0]);
const schemaContent = fs.readFileSync(canonicalMigrationPath, 'utf-8');

// 4.1 Larangan Tipe Data Floating-Point untuk Nilai Finansial
const hasFloat = /\b(float|real|double\s+precision)\b/i.test(schemaContent);
assertCheck(
  !hasFloat,
  'Keamanan Tipe Data Finansial: Bebas dari floating-point (FLOAT/REAL/DOUBLE PRECISION)',
  { hasFloat }
);

// 4.2 Presisi Numerik Eksak NUMERIC(18, 4)
const hasNumericExact = schemaContent.includes('NUMERIC(18, 4)');
assertCheck(
  hasNumericExact,
  'Presisi Nilai Finansial: Menggunakan NUMERIC(18, 4) untuk saldo dan transaksi',
  { exactNumericUsed: hasNumericExact }
);

// 4.3 Seluruh Tabel Wajib RLS
const expectedTables = [
  'app_settings',
  'accounts',
  'categories',
  'transactions',
  'trading_accounts',
  'trading_positions',
  'trading_deals',
  'sync_logs',
];

const allTablesHaveRls = expectedTables.every(table => {
  const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
  return rlsRegex.test(schemaContent);
});

assertCheck(
  allTablesHaveRls,
  'Cakupan RLS Penuh: Seluruh 8 tabel publik mengaktifkan ROW LEVEL SECURITY',
  { expectedTables, allProtected: allTablesHaveRls }
);

// 4.4 Granular RLS Policies (SELECT, INSERT, UPDATE, DELETE)
const crudOperations = ['select', 'insert', 'update', 'delete'];
let allGranularPresent = true;
const missingPolicies = [];

for (const table of expectedTables) {
  for (const op of crudOperations) {
    const policyRegex = new RegExp(`CREATE\\s+POLICY\\s+"${table}_${op}_policy"\\s+ON\\s+public\\.${table}`, 'i');
    if (!policyRegex.test(schemaContent)) {
      allGranularPresent = false;
      missingPolicies.push(`${table}_${op}_policy`);
    }
  }
}

assertCheck(
  allGranularPresent,
  'Kebijakan RLS Granular: 32 kebijakan spesifik (SELECT, INSERT, UPDATE, DELETE) lengkap',
  { missing: missingPolicies, totalPolicies: expectedTables.length * 4 }
);

// 4.5 Klausa USING vs WITH CHECK pada RLS
// INSERT harus memiliki WITH CHECK, SELECT/DELETE harus memiliki USING, UPDATE harus memiliki keduanya
const insertPoliciesHaveWithCheck = expectedTables.every(table => {
  const match = schemaContent.match(new RegExp(`CREATE\\s+POLICY\\s+"${table}_insert_policy"[^;]+;`, 'is'));
  return match && match[0].includes('WITH CHECK');
});

const selectPoliciesHaveUsing = expectedTables.every(table => {
  const match = schemaContent.match(new RegExp(`CREATE\\s+POLICY\\s+"${table}_select_policy"[^;]+;`, 'is'));
  return match && match[0].includes('USING');
});

const deletePoliciesHaveUsing = expectedTables.every(table => {
  const match = schemaContent.match(new RegExp(`CREATE\\s+POLICY\\s+"${table}_delete_policy"[^;]+;`, 'is'));
  return match && match[0].includes('USING');
});

const updatePoliciesHaveBoth = expectedTables.every(table => {
  const match = schemaContent.match(new RegExp(`CREATE\\s+POLICY\\s+"${table}_update_policy"[^;]+;`, 'is'));
  return match && match[0].includes('USING') && match[0].includes('WITH CHECK');
});

assertCheck(
  insertPoliciesHaveWithCheck && selectPoliciesHaveUsing && deletePoliciesHaveUsing && updatePoliciesHaveBoth,
  'Validasi Semantik Klausa RLS: USING pada SELECT/DELETE/UPDATE dan WITH CHECK pada INSERT/UPDATE',
  {
    insertCheck: insertPoliciesHaveWithCheck,
    selectUsing: selectPoliciesHaveUsing,
    deleteUsing: deletePoliciesHaveUsing,
    updateBoth: updatePoliciesHaveBoth,
  }
);

// 4.6 Proteksi Anonimitas: Seluruh Hak Akses 'anon' Dicabut
const anonRevoked = 
  schemaContent.includes('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;') &&
  schemaContent.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;');

assertCheck(
  anonRevoked,
  'Isolasi Peran Anonim: Hak akses role anon dicabut total dari seluruh tabel dan fungsi publik',
  { anonRevoked }
);

// 4.7 Simetri Rollback: Seluruh Tabel dan Kebijakan Memiliki Perintah DROP
const rollbackContent = fs.readFileSync(path.join(rollbacksDir, rollbackFiles[0]), 'utf-8');
const allTablesDroppedInRollback = expectedTables.every(table => {
  return rollbackContent.includes(`DROP TABLE IF EXISTS public.${table}`);
});

assertCheck(
  allTablesDroppedInRollback,
  'Simetri Skrip Rollback: Seluruh 8 tabel memiliki instruksi DROP TABLE IF EXISTS CASCADE',
  { allTablesDropped: allTablesDroppedInRollback }
);

console.log('\n================================================================');
console.log(`TOTAL HASIL: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
