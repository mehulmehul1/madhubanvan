#!/usr/bin/env node
// Headless screenshot + state probe for the viewer.
//
//   node tools/shot.mjs <url> <out.png> [--w 900] [--h 620] [--gpu] [--timeout 120]
//
// Default (no --gpu): software GL + SwiftShader — enough for the TSL->GLSL (WebGL2 backend) path.
// --gpu: D3D12 WebGPU flags, full Chromium (for the real WebGPU path).
import fs from 'fs';
import path from 'path';
import { launchPage, mkdirp, findChrome } from './lib/common.mjs';

const url = process.argv[2];
const out = process.argv[3] || 'out/shot.png';
const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const W = +opt('w', 900), H = +opt('h', 620), timeout = +opt('timeout', 120) * 1000;

if (!url) { console.error('usage: node tools/shot.mjs <url> <out.png> [--w N] [--h N] [--gpu]'); process.exit(2); }

const CHROME = process.env.PROCEDURAL_ANIMALS_CHROME || findChrome();
if (!fs.existsSync(CHROME)) { console.error('chromium not found at ' + CHROME); process.exit(2); }

const GPU_ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--no-first-run'];
const SOFT_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run'];

import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  timeout: 60000,
  args: flag('gpu') ? GPU_ARGS : SOFT_ARGS,
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text().slice(0, 500)); });

let state = null;
try {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  const hasGpu = await page.evaluate(() => !!navigator.gpu);
  console.log('navigator.gpu =', hasGpu);
  await page.waitForFunction(() => { const s = window.__state; return s && (s.phase === 'ready' || s.phase === 'error'); }, null, { timeout });
  state = await page.evaluate(() => window.__state);
  await page.waitForTimeout(600);
  mkdirp(path.dirname(path.resolve(out)));
  await page.screenshot({ path: out });
  console.log('state =', JSON.stringify(state));
  console.log('wrote', out);
} catch (e) {
  console.error('FAIL: ' + e.message);
  state = await page.evaluate(() => window.__state).catch(() => null);
  console.error('state =', JSON.stringify(state));
  await page.screenshot({ path: out }).catch(() => {});
} finally {
  if (errors.length) console.error('page errors:\n  ' + errors.slice(0, 12).join('\n  '));
  await browser.close().catch(() => {});
}
process.exit(state && state.phase === 'ready' ? 0 : 1);
