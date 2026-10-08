// Screenshot the Madhubani SVG swatch book.
//
// The page is pure SVG + CSS (no WebGL), so this does not hit the SwiftShader timeout
// that tools/shot.mjs runs into on the 3D viewer.
//
//   node tools/svgshot.mjs [--url <url>] [--out out/svg] [--width 1400]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : d;
};

const URL_ = arg('--url', 'http://localhost:5175/patterns.html');
const OUT = arg('--out', 'out/svg');
const WIDTH = +arg('--width', 1400);

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: 1000 }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL_, { waitUntil: 'load', timeout: 60000 });

// the page sets window.__state once every motif has been fetched and inlined
await page.waitForFunction(() => window.__state?.phase === 'ready', null, { timeout: 60000 });
const state = await page.evaluate(() => window.__state);

// how many <svg> actually landed in the DOM, and are the roles painting?
const audit = await page.evaluate(() => {
  const motifs = document.querySelectorAll('.motif');
  const svgs = document.querySelectorAll('.motif > svg, .motif > .cell > svg');
  const roles = { g: 0, fi: 0, fa: 0, fb: 0, bd: 0, si: 0, sa: 0, sia: 0, sib: 0 };
  document.querySelectorAll('.motif [class]').forEach((el) => {
    for (const c of el.getAttribute('class').split(/\s+/)) if (c in roles) roles[c]++;
  });
  return { motifBoxes: motifs.length, svgs, roles };
});

await page.screenshot({ path: `${OUT}/00-top.png` });

// per-style strips, so each vocabulary can be judged on its own
const styles = await page.evaluate(() => [...document.querySelectorAll('#styleHost h2')].map((h) => h.textContent.trim()));
for (let i = 0; i < styles.length; i++) {
  const h = page.locator('#styleHost h2').nth(i);
  await h.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, '0')}-${styles[i]}.png` });
}

await page.screenshot({ path: `${OUT}/99-full.png`, fullPage: true });

// role-mask view proves the atlas channels are separable
await page.goto(`${URL_.split('?')[0]}?palette=1&view=tile&mask=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__state?.phase === 'ready', null, { timeout: 60000 });
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/98-rolemask.png`, fullPage: false });

await browser.close();

console.log(JSON.stringify({ url: URL_, state, audit, styles, errors }, null, 2));
if (errors.length) process.exitCode = 1;
