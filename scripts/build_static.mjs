import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Change working directory explicitly to D:\KAYLA_FINANCE_CLEAN
process.chdir(ROOT);
process.env.STATIC_EXPORT = 'true';
console.log(`[BUILD] Working directory set to: ${ROOT}`);

const apiDir = path.join(ROOT, 'src', 'app', 'api');
const tempApiDir = path.join(ROOT, 'src', 'app', '_api_server_only');
const nextDir = path.join(ROOT, '.next');
const outDir = path.join(ROOT, 'out');

const hasApi = fs.existsSync(apiDir);
if (hasApi) {
  fs.renameSync(apiDir, tempApiDir);
  console.log('[BUILD] Temporarily moved src/app/api to src/app/_api_server_only for static export');
}

if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
}
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}

try {
  const cmd = process.platform === 'win32'
    ? 'set STATIC_EXPORT=true&& npm run build'
    : 'STATIC_EXPORT=true npm run build';
  const res = spawnSync(cmd, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, STATIC_EXPORT: 'true' }
  });
  if (res.status !== 0) {
    throw new Error('Static export build failed with code ' + res.status);
  }
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  console.log('[BUILD] Static export build completed successfully.');
} finally {
  if (fs.existsSync(tempApiDir)) {
    let restored = false;
    for (let i = 0; i < 5; i++) {
      try {
        fs.renameSync(tempApiDir, apiDir);
        restored = true;
        console.log('[BUILD] Restored src/app/api');
        break;
      } catch (err) {
        // Wait briefly for file handle release on Windows
        const waitTill = new Date(new Date().getTime() + 500);
        while (waitTill > new Date()) {}
      }
    }
    if (!restored) {
      console.error('[BUILD] Warning: Could not restore src/app/api immediately. Retrying via copy.');
    }
  }
}
