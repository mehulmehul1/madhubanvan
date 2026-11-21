// Render the 3D animal with the madhubani coat + the baked SVG atlas, capture console/page errors,
// and screenshot.
//
// The console capture is the point: an atlas layer type that WGSL rejects fails at shader-compile
// time rather than silently, so "did it compile" is only answerable from the log.
//
//   node tools/shot3d.mjs <url> <out.png> [--nocov] [--noatlas]
//
//     --nocov    uncheck the fur-shell toggle so the coat is actually visible
//     --noatlas  block the *.bin fetch, forcing the SDF fallback — the A/B baseline
import { chromium } from 'playwright-core';
import { findChrome } from './lib/common.mjs';

const [url = 'http://localhost:5175/?style=madhubani&species=boar&mstyle=katchni&mtiles=chain&seed=7',
       out = 'out/shot.png'] = process.argv.slice(2);
const nocov = process.argv.includes('--nocov');
const noatlas = process.argv.includes('--noatlas');

const CHROME = process.env.PROCEDURAL_ANIMALS_CHROME || findChrome();
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--enable-unsafe-webgpu', '--use-angle=default', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--no-first-run']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

if (noatlas) await page.route('**/atlas/*.bin', (r) => r.abort());

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

let built = true;
try {
  await page.waitForFunction(() => !!window.__animal, { timeout: 120000 });
} catch {
  built = false;
  logs.push('[fatal] window.__animal never appeared');
}

if (nocov) {
  // fur shells bury the coat; turn them off so the pattern is legible
  await page.evaluate(() => {
    const c = document.querySelector('#cov');
    if (c && c.checked) c.click();
  });
  await page.waitForTimeout(1200);
}

await page.waitForTimeout(6000);

const info = await page.evaluate(() => {
  const a = window.__animal;
  const r = window.__renderer;
  return {
    ok: !!a,
    species: a?.species?.id ?? null,
    mad: !!a?.render?.materials?.mad,
    backend: r?.backend?.isWebGPUBackend ? 'WebGPU' : (r?.backend?.isWebGLBackend ? 'WebGL2' : (navigator.gpu ? 'WebGPU' : 'WebGL2')),
    status: document.querySelector('#status')?.textContent?.slice(0, 300) ?? null,
  };
});

await page.screenshot({ path: out });

const uvWarn = logs.filter((l) => /Vertex attribute "uv"/.test(l)).length;
const shaderBad = logs.filter((l) => /pageerror|wgsl|shader|compile|invalid/i.test(l));

console.log('--- page ---');
console.log(JSON.stringify(info));
console.log(`--- console: ${logs.length} lines | uv-missing warnings: ${uvWarn} | shader/error-like: ${shaderBad.length} ---`);
for (const l of logs.filter((l) => !/Vertex attribute "uv"/.test(l)).slice(0, 40)) console.log(l);

await browser.close();
process.exit(built && shaderBad.length === 0 ? 0 : 1);