#!/usr/bin/env node
import path from 'path';
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1194', 'chrome-win', 'chrome.exe');
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: CHROME, headless: true, timeout: 60000, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run'] });
const page = await browser.newPage({ viewport: { width: 700, height: 460 } });
await page.goto('http://localhost:5175/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__state?.phase === 'ready', null, { timeout: 90000 });

// 1) probe: does any keydown reach the window?
await page.evaluate(() => { window.__kd = 0; addEventListener('keydown', () => window.__kd++); });
await page.click('body');
await page.keyboard.down('w');
await page.waitForTimeout(400);
console.log('probe keydowns via playwright:', await page.evaluate(() => window.__kd));
await page.keyboard.up('w');

// 2) synthetic dispatch (bypasses OS/headless focus)
await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true })));
await page.waitForTimeout(400);
console.log('viewer keys after synthetic:', await page.evaluate(() => [...(window.__keys || [])]));
console.log('dbg:', await page.evaluate(() => window.__dbg));
await browser.close();
