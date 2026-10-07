#!/usr/bin/env node
// Smoke test: panel dropdown (species + variant) and WASD locomotion.
import path from 'path';
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1194', 'chrome-win', 'chrome.exe');
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: CHROME, headless: true, timeout: 60000, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run'] });
const page = await browser.newPage({ viewport: { width: 700, height: 460 } });
const ready = () => page.waitForFunction(() => window.__state?.phase === 'ready', null, { timeout: 90000 });
const results = [];

await page.goto('http://localhost:5175/?quality=low', { waitUntil: 'load' });
await ready();
await page.click('body'); // focus, or headless swallows keys

// 1) locomotion: hold W, expect the engine to gain speed and translate.
//    NB headless SwiftShader runs ~1 fps, so dt is capped and only a handful of frames tick — the
//    thresholds are deliberately small (a real 60 fps browser covers far more ground).
const p0 = await page.evaluate(() => { const p = window.__animal.position; return [p.x, p.z]; });
await page.keyboard.down('w');
await page.waitForTimeout(4000);
const s1 = await page.evaluate(() => ({ inp: window.__animal.motion.input.speed, eng: window.__animal.state.speed, gait: window.__animal.state.gait, p: [window.__animal.position.x, window.__animal.position.z] }));
await page.keyboard.up('w');
const moved = Math.hypot(s1.p[0] - p0[0], s1.p[1] - p0[1]);
results.push(['locomotion', s1.eng > 0.1 && moved > 0.02, `input ${s1.inp.toFixed(2)} engine ${s1.eng.toFixed(2)} gait ${s1.gait} moved ${moved.toFixed(3)}m`]);

// 2) variant switch on a species that has them
await page.selectOption('#sp', 'fish');
await page.waitForFunction(() => location.search.includes('species=fish') && window.__state?.phase === 'ready', null, { timeout: 90000 });
await page.selectOption('#vr', 'goldfish');
await page.waitForFunction(() => new URLSearchParams(location.search).get('variant') === 'goldfish' && window.__state?.phase === 'ready', null, { timeout: 90000 });
const v = await page.evaluate(() => window.__state.variant);
results.push(['variant', v === 'goldfish', `state.variant = ${v}`]);

await browser.close();
for (const [n, ok, d] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}: ${d}`);
console.log(results.every((r) => r[1]) ? 'ALL OK' : 'FAILURES');
process.exit(results.every((r) => r[1]) ? 0 : 1);
