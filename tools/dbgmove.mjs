#!/usr/bin/env node
import path from 'path';
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1194', 'chrome-win', 'chrome.exe');
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: CHROME, headless: true, timeout: 60000, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run'] });
const page = await browser.newPage({ viewport: { width: 700, height: 460 } });
await page.goto('http://localhost:5175/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__state?.phase === 'ready', null, { timeout: 90000 });
await page.click('body');
const snap = () => page.evaluate(() => {
  const a = window.__animal;
  return {
    inp: a.motion.input.speed,
    eng: +a.state.speed.toFixed(2),
    gait: a.state.gait,
    vel: +a.velocity.length().toFixed(2),
    pos: [+a.position.x.toFixed(2), +a.position.y.toFixed(2), +a.position.z.toFixed(2)],
    maxSpeed: a.motion.cfg?.maxSpeed?.toFixed?.(2) ?? String(a.motion.cfg?.maxSpeed),
  };
});
console.log('idle ', JSON.stringify(await snap()));
await page.keyboard.down('w');
for (let i = 0; i < 6; i++) { await page.waitForTimeout(500); console.log(`t=${((i + 1) * 0.5).toFixed(1)}s`, JSON.stringify(await snap())); }
await page.keyboard.up('w');
await browser.close();
