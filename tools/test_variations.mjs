import { chromium } from 'playwright-core';
import { findChrome } from './lib/common.mjs';

const CHROME = process.env.PROCEDURAL_ANIMALS_CHROME || findChrome();
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--enable-unsafe-webgpu', '--use-angle=default', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--no-first-run']
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

page.on('console', (m) => console.log(`[console:${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

console.log('Navigating to variations.html...');
await page.goto('http://localhost:5175/variations.html', { waitUntil: 'domcontentloaded', timeout: 60000 });

try {
  await page.waitForFunction(() => window.__variationsReady === true, { timeout: 60000 });
  console.log('window.__variationsReady reached!');
} catch (e) {
  console.log('Wait failed:', e.message);
}

await page.screenshot({ path: 'out/variations_screen.png' });
console.log('Saved screenshot to out/variations_screen.png');

await browser.close();
