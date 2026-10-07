#!/usr/bin/env node
// Render every species (natural + madhubani) headlessly in one browser and report failures.
//   node tools/allspecies.mjs [--base http://localhost:5175] [--quality low] [--styles natural,madhubani]
import fs from 'fs';
import path from 'path';
import { listSpecies } from '../src/registry.js';

const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = opt('base', 'http://localhost:5175');
const quality = opt('quality', 'low');
const styles = opt('styles', 'natural,madhubani').split(',');

const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1194', 'chrome-win', 'chrome.exe');
const outDir = path.resolve('out/allspecies');
fs.mkdirSync(outDir, { recursive: true });

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: CHROME, headless: true, timeout: 60000, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run'] });
const page = await browser.newPage({ viewport: { width: 420, height: 300 } });

const species = listSpecies().sort();
const rows = [];
for (const style of styles) {
  for (const id of species) {
    const errs = [];
    const onErr = (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text().slice(0, 220)); };
    page.on('console', onErr);
    const onPageErr = (e) => errs.push('PAGEERROR ' + e.message.slice(0, 220));
    page.on('pageerror', onPageErr);
    let state = null;
    try {
      await page.goto(`${base}/?species=${id}&seed=1&quality=${quality}&style=${style}`, { waitUntil: 'load', timeout: 45000 });
      await page.waitForFunction(() => { const s = window.__state; return s && (s.phase === 'ready' || s.phase === 'error'); }, null, { timeout: 90000 });
      state = await page.evaluate(() => window.__state);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(outDir, `${id}-${style}.png`) });
    } catch (e) {
      errs.push('TIMEOUT ' + e.message.slice(0, 120));
    }
    page.off('console', onErr);
    page.off('pageerror', onPageErr);
    const ok = state && state.phase === 'ready' && errs.length === 0;
    rows.push({ id, style, ok, verts: state?.verts, tris: state?.tris, err: errs[0] || (state?.phase === 'error' ? state.error?.slice(0, 160) : '') });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(10)} ${style.padEnd(10)} ${state?.verts ?? '-'}v ${state?.tris ?? '-'}t ${errs.length ? '| ' + errs[0].slice(0, 120) : ''}`);
  }
}
await browser.close();
const fails = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - fails.length}/${rows.length} ok${fails.length ? `, ${fails.length} failed` : ''}`);
if (fails.length) console.log('failures:\n' + fails.map((f) => `  ${f.id} (${f.style}): ${f.err}`).join('\n'));
process.exit(fails.length ? 1 : 0);
