import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const liveUrl = 'https://jokitugasbykay.github.io/keuangan.github.io/crypto';
const defaultScreenshotDir = resolve(__dirname, 'screenshots');
if (!existsSync(defaultScreenshotDir)) {
  mkdirSync(defaultScreenshotDir, { recursive: true });
}
const artifactDir = process.env.ARTIFACT_DIR || defaultScreenshotDir;

console.log('================================================================');
console.log('KAYLA FINANCE: LIVE PRODUCTION DEPLOYMENT VERIFICATION');
console.log(`Live URL    : ${liveUrl}`);
console.log('================================================================\n');

const chromePath = (
  existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined
);

const browser = await chromium.launch({
  headless: true,
  ...(chromePath ? { executablePath: chromePath } : {}),
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  // Desktop Verification
  const ctxDesktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctxDesktop.newPage();

  console.log('Navigating to live production Crypto page...');
  await page.goto(liveUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  // 1. Verify 0 native select elements
  const selectCount = await page.locator('select').count();
  console.log(`Native <select> count on live page: ${selectCount}`);

  // 2. Verify CustomSelect exists
  const customSelects = await page.locator('button[aria-haspopup="listbox"]').count();
  console.log(`CustomSelect count on live page: ${customSelects}`);

  // 3. Click Filter Jaringan
  const filterBtn = page.locator('button[aria-haspopup="listbox"]').first();
  await filterBtn.click();
  await page.waitForTimeout(300);

  const listboxVisible = await page.locator('div[role="listbox"]').first().isVisible();
  console.log(`Filter dropdown listbox visible: ${listboxVisible}`);

  const liveShot1 = resolve(artifactDir, 'live_production_crypto_filter_open.png');
  await page.screenshot({ path: liveShot1 });
  console.log(`Screenshot saved: ${liveShot1}`);

  // Select Solana
  await page.locator('div[role="option"]').getByText(/Solana/i).first().click();
  await page.waitForTimeout(300);
  const filterText = await filterBtn.innerText();
  console.log(`Filter button after selecting Solana: ${filterText.trim()}`);

  // 4. Open Tambah Dompet modal
  await page.getByRole('button', { name: /Tambah Dompet/i }).click();
  await page.waitForTimeout(400);

  const modalSelect = page.locator('div.fixed.inset-0 button[aria-haspopup="listbox"]').first();
  await modalSelect.click();
  await page.waitForTimeout(300);

  const modalListboxVisible = await page.locator('div.fixed.inset-0 div[role="listbox"]').first().isVisible();
  console.log(`Modal Blockchain dropdown listbox visible: ${modalListboxVisible}`);

  const liveShot2 = resolve(artifactDir, 'live_production_modal_crypto_dropdown.png');
  await page.screenshot({ path: liveShot2 });
  console.log(`Screenshot saved: ${liveShot2}`);

  // Mobile Verification (390px)
  const ctxMobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const pageMobile = await ctxMobile.newPage();
  await pageMobile.goto(liveUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await pageMobile.waitForTimeout(1000);

  const mobileFilterBtn = pageMobile.locator('button[aria-haspopup="listbox"]').first();
  await mobileFilterBtn.click();
  await pageMobile.waitForTimeout(300);

  const liveShot3 = resolve(artifactDir, 'live_production_crypto_mobile_390px.png');
  await pageMobile.screenshot({ path: liveShot3 });
  console.log(`Mobile screenshot saved: ${liveShot3}`);

  const success = (selectCount === 0 && customSelects > 0 && listboxVisible && modalListboxVisible);
  console.log('\n================================================================');
  console.log(`LIVE PRODUCTION VERIFICATION RESULT: ${success ? 'SUCCESS (100% PASS)' : 'FAILED'}`);
  console.log('================================================================');

} finally {
  await browser.close();
}
