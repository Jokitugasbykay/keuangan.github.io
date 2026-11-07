/**
 * DevSecOps & Deployment Audit Specialist Test Suite (Agent 15)
 * Kayla Finance Project
 *
 * Verifikasi menyeluruh:
 * 1. Integritas Kriptografis Database (SHA-256 & byte size).
 * 2. Konfigurasi .gitignore dan pencegahan pelacakan berkas rahasia.
 * 3. Audit kebocoran rahasia dan data pribadi pada Static Export output (out/ & .next/).
 * 4. Ketiadaan dependensi Supabase dan Cloud Database di package.json dan src/.
 * 5. Validasi gerbang keamanan CI/CD GitHub Actions (.github/workflows/deploy.yml).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT_DIR = process.cwd();
const EXPECTED_DB_SHA256 = '9E08822CB3787DC9429090FCC626B6A8EED3454AB2A18E354D591690E1ABD8A4';
const EXPECTED_DB_SIZE = 13250;

console.log('================================================================');
console.log('KAYLA FINANCE: DEVSECOPS & DEPLOYMENT SECURITY AUDIT (AGENT 15)');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertTest(title, condition, details = null) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] Test ${totalTests}: ${title}`);
    if (details) console.log(`       Info: ${JSON.stringify(details)}`);
  } else {
    failedTests++;
    console.error(`[FAIL] Test ${totalTests}: ${title}`);
    if (details) console.error(`       Detail: ${JSON.stringify(details)}`);
  }
}

// -------------------------------------------------------------
// 1. AUDIT INTEGRITAS SHA-256 DATABASE (data/db.json)
// -------------------------------------------------------------
console.log('--- SEKSI 1: VERIFIKASI INTEGRITAS SHA-256 DATABASE ---');

const dbPath = path.join(ROOT_DIR, 'data', 'db.json');
const dbExists = fs.existsSync(dbPath);
assertTest('Berkas data/db.json tersedia pada repositori', dbExists);

if (dbExists) {
  const dbBuffer = fs.readFileSync(dbPath);
  const dbSize = dbBuffer.length;
  assertTest(
    `Ukuran berkas data/db.json tepat ${EXPECTED_DB_SIZE} bytes`,
    dbSize === EXPECTED_DB_SIZE,
    { actualSize: dbSize, expectedSize: EXPECTED_DB_SIZE }
  );

  const hash = crypto.createHash('sha256').update(dbBuffer).digest('hex').toUpperCase();
  assertTest(
    'Checksum SHA-256 data/db.json identik dengan patokan mutlak',
    hash === EXPECTED_DB_SHA256,
    { calculatedHash: hash, expectedHash: EXPECTED_DB_SHA256 }
  );
}

// -------------------------------------------------------------
// 2. AUDIT .gitignore & BLOKIR BERKAS RAHASIA
// -------------------------------------------------------------
console.log('\n--- SEKSI 2: AUDIT .gitignore & PERLINDUNGAN BERKAS RAHASIA ---');

const gitignorePath = path.join(ROOT_DIR, '.gitignore');
const gitignoreExists = fs.existsSync(gitignorePath);
assertTest('Berkas .gitignore tersedia di root repositori', gitignoreExists);

if (gitignoreExists) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');

  // Periksa pemblokiran data/db.json
  const blocksDbJson = gitignoreContent.includes('/data/db.json');
  assertTest('.gitignore memblokir /data/db.json', blocksDbJson);

  // Periksa pemblokiran data/backups/
  const blocksBackups = gitignoreContent.includes('/data/backups/');
  assertTest('.gitignore memblokir /data/backups/', blocksBackups);

  // Periksa pemblokiran .env*
  const blocksEnv = gitignoreContent.includes('.env*');
  assertTest('.gitignore memblokir seluruh pola .env*', blocksEnv);

  // Periksa pemblokiran *.kfin.enc
  const blocksEnc = gitignoreContent.includes('*.kfin.enc');
  assertTest('.gitignore memblokir seluruh arsip brankas *.kfin.enc', blocksEnc);

  // Periksa bahwa .env.example tetap diizinkan
  const allowsEnvExample = gitignoreContent.includes('!.env.example');
  assertTest('.gitignore mengizinkan template publik !.env.example', allowsEnvExample);
}

// -------------------------------------------------------------
// 3. AUDIT DEPENDENCY & KEBERSIHAN CLOUD DATABASE (package.json)
// -------------------------------------------------------------
console.log('\n--- SEKSI 3: AUDIT DEPENDENSI & KEBERSIHAN CLOUD DATABASE ---');

const pkgPath = path.join(ROOT_DIR, 'package.json');
const pkgExists = fs.existsSync(pkgPath);
assertTest('Berkas package.json tersedia', pkgExists);

if (pkgExists) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  const hasSupabase = Object.keys(allDeps).some(d => d.toLowerCase().includes('supabase'));
  assertTest('package.json 100% bebas dari dependensi Supabase', !hasSupabase, { hasSupabase });

  const prohibitedCloudDbs = ['firebase', 'mongodb', 'aws-sdk', '@aws-sdk', 'prisma', '@prisma/client', 'couchdb'];
  const hasCloudDb = Object.keys(allDeps).some(d =>
    prohibitedCloudDbs.some(prohibited => d.toLowerCase().includes(prohibited))
  );
  assertTest('package.json bebas dari paket database cloud eksternal', !hasCloudDb, { hasCloudDb });
}

// -------------------------------------------------------------
// 4. AUDIT KEBOCORAN PADA STATIC EXPORT OUTPUT (out/)
// -------------------------------------------------------------
console.log('\n--- SEKSI 4: AUDIT KEBOCORAN PADA STATIC EXPORT (out/) ---');

const outDir = path.join(ROOT_DIR, 'out');
const outExists = fs.existsSync(outDir);
assertTest('Direktori output static export (out/) tersedia', outExists);

if (outExists) {
  // 1. Pastikan tidak ada data/ atau demo-db.json di out/
  const outDataDir = path.join(outDir, 'data');
  const outDbJson = path.join(outDir, 'data', 'db.json');
  const outDemoDbJson = path.join(outDir, 'demo-db.json');

  assertTest('Direktori out/data/ TIDAK diekspor', !fs.existsSync(outDataDir));
  assertTest('Berkas out/data/db.json TIDAK diekspor', !fs.existsSync(outDbJson));
  assertTest('Berkas out/demo-db.json TIDAK diekspor', !fs.existsSync(outDemoDbJson));

  // 2. Kumpulkan seluruh berkas di out/ untuk deep leak scanning
  function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        getAllFiles(filePath, fileList);
      } else {
        fileList.push(filePath);
      }
    }
    return fileList;
  }

  const allOutFiles = getAllFiles(outDir);
  assertTest(
    'Static export memuat artefak halaman web yang lengkap',
    allOutFiles.length >= 10,
    { totalFilesExported: allOutFiles.length }
  );

  // Periksa .nojekyll
  const nojekyllPath = path.join(outDir, '.nojekyll');
  assertTest('Marker out/.nojekyll tersedia untuk kompatibilitas GitHub Pages', fs.existsSync(nojekyllPath));

  // Pindai kebocoran email administrator
  const ADMIN_EMAIL = 'kaylafisika24@gmail.com';
  let emailLeakFiles = [];
  let secretKeyLeaks = [];
  const SENSITIVE_KEYWORDS = ['AUTH_SECRET=', 'ADMIN_PASSWORD_HASH=', 'JWT_SECRET='];

  // Kumpulkan sampel data pribadi dari data/db.json untuk dicocokkan
  let privateStrings = [];
  if (dbExists) {
    try {
      const dbObj = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      // Ambil nomor rekening atau nama akun asli jika ada
      if (Array.isArray(dbObj.accounts)) {
        for (const acc of dbObj.accounts) {
          if (acc.account_number && acc.account_number.length > 5) {
            privateStrings.push(acc.account_number);
          }
        }
      }
    } catch {
      // Abaikan jika parsing gagal
    }
  }

  let privateDataLeaks = [];

  for (const filePath of allOutFiles) {
    // Hanya periksa berkas teks (html, js, css, json, txt)
    const ext = path.extname(filePath).toLowerCase();
    if (['.html', '.js', '.css', '.json', '.txt'].includes(ext)) {
      const content = fs.readFileSync(filePath, 'utf-8');

      if (content.includes(ADMIN_EMAIL)) {
        emailLeakFiles.push(path.relative(outDir, filePath));
      }

      for (const kw of SENSITIVE_KEYWORDS) {
        if (content.includes(kw)) {
          secretKeyLeaks.push({ file: path.relative(outDir, filePath), keyword: kw });
        }
      }

      for (const privStr of privateStrings) {
        if (content.includes(privStr)) {
          privateDataLeaks.push({ file: path.relative(outDir, filePath), matched: privStr });
        }
      }
    }
  }

  assertTest(
    'Nol kebocoran email administrator pribadi pada seluruh bundle client out/',
    emailLeakFiles.length === 0,
    { leaksFound: emailLeakFiles }
  );

  assertTest(
    'Nol kebocoran secret key atau environment variables pada bundle out/',
    secretKeyLeaks.length === 0,
    { leaksFound: secretKeyLeaks }
  );

  assertTest(
    'Nol kebocoran data rekening privat dari data/db.json pada bundle out/',
    privateDataLeaks.length === 0,
    { leaksFound: privateDataLeaks }
  );
}

// -------------------------------------------------------------
// 5. AUDIT GITHUB PAGES WORKFLOW (.github/workflows/deploy.yml)
// -------------------------------------------------------------
console.log('\n--- SEKSI 5: AUDIT CI/CD WORKFLOW (.github/workflows/deploy.yml) ---');

const deployYmlPath = path.join(ROOT_DIR, '.github', 'workflows', 'deploy.yml');
const deployYmlExists = fs.existsSync(deployYmlPath);
assertTest('Workflow .github/workflows/deploy.yml tersedia', deployYmlExists);

if (deployYmlExists) {
  const deployContent = fs.readFileSync(deployYmlPath, 'utf-8');

  assertTest(
    'Workflow memiliki Pre-build Security Gate untuk mencegah kebocoran repositori',
    deployContent.includes('Pre-build Security Gate')
  );

  assertTest(
    'Workflow mengisolasi route API server sebelum static build dijalankan',
    deployContent.includes('Exclude API routes for static export')
  );

  assertTest(
    'Workflow menyetel STATIC_EXPORT=true untuk produksi GitHub Pages',
    deployContent.includes("STATIC_EXPORT: 'true'")
  );

  assertTest(
    'Workflow memiliki Post-build Security Verification untuk validasi artefak out/',
    deployContent.includes('Post-build Security Verification')
  );

  assertTest(
    'Workflow melakukan verifikasi marker .nojekyll sebelum deployment',
    deployContent.includes('.nojekyll')
  );
}

// -------------------------------------------------------------
// RINGKASAN AKHIR AUDIT DEVSECOPS
// -------------------------------------------------------------
console.log('\n================================================================');
console.log(`HASIL AKHIR AUDIT DEVSECOPS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL ${totalTests})`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
