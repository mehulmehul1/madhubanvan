#!/usr/bin/env node
// Headless runner for Task 1.4: Per-Creature SDF Muscle-Mass Variation Viewer.
//
// Renders 12 distinct conformation/muscle-mass variants of a species side-by-side
// into individual frames and composes an artist contact sheet.
//
// Usage:
//   node tools/variations.mjs [--species horse] [--style vyaghra] [--out out/variations/horse_sheet.png]
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';
import { findChrome, mkdirp, composeSheet } from './lib/common.mjs';

const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const species = opt('species', 'horse');
const style = opt('style', 'vyaghra');
const outSheet = opt('out', `out/variations/${species}_sheet.png`);
const outDir = path.resolve(`out/variations/${species}`);
mkdirp(outDir);
mkdirp(path.dirname(path.resolve(outSheet)));

const VARIATION_PRESETS = [
  { id: 1, name: 'Reference Culture', desc: 'Canonical baseline sculpt' },
  { id: 2, name: 'Heavy Draft', desc: 'High girth, massive crest' },
  { id: 3, name: 'Thoroughbred', desc: 'Leggy speed, lean flank' },
  { id: 4, name: 'Warmblood', desc: 'Athletic tall sport build' },
  { id: 5, name: 'Arabian', desc: 'Arched crest, compact body' },
  { id: 6, name: 'Quarter Horse', desc: 'Heavy shoulder & rump' },
  { id: 7, name: 'Foal / Growth', desc: 'Juvenile leggy proportions' },
  { id: 8, name: 'Desert Slender', desc: 'Narrow chest, ultra-lean' },
  { id: 9, name: 'Stallion Crest', desc: 'Maximal crest thickness' },
  { id: 10, name: 'Cob / Pony', desc: 'Compact wide barrel, low CoM' },
  { id: 11, name: 'Hunter / Longline', desc: 'Extended spine, long frame' },
  { id: 12, name: 'Heroic Warhorse', desc: 'Imposing monumental mass' },
];

const CHROME = process.env.PROCEDURAL_ANIMALS_CHROME || findChrome();
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--use-angle=default',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
    '--no-first-run',
  ],
});

console.log(`Rendering 12 ${species} variations in ${style} style…`);
const tiles = [];

for (const p of VARIATION_PRESETS) {
  const url = `http://localhost:5175/?style=madhubani&species=${species}&mstyle=${style}&mtiles=chain&preset=${p.id}&seed=7&quality=low&cam=fixed`;
  let page = null;
  try {
    page = await browser.newPage({ viewport: { width: 560, height: 400 } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!window.__animal, { timeout: 60000 });
    
    // Hide fur shells so Madhubani print is completely clear
    await page.evaluate(() => {
      const c = document.querySelector('#cov');
      if (c && c.checked) c.click();
    });
    await page.waitForTimeout(2000);

    const cardFile = path.join(outDir, `variant_${String(p.id).padStart(2, '0')}.png`);
    await page.screenshot({ path: cardFile, animations: 'disabled', timeout: 20000 });
    console.log(`  ✓ Variant #${p.id} rendered: ${p.name}`);
    tiles.push({
      file: cardFile,
      label: `#${p.id} ${p.name}`,
      sub: p.desc,
    });
  } catch (e) {
    console.error(`  ✗ Error rendering variant #${p.id}: ${e.message}`);
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

await browser.close();

// Compose master contact sheet
if (tiles.length === 12) {
  try {
    composeSheet({
      out: outSheet,
      title: `12 Muscle-Mass Variations: ${species.toUpperCase()} (${style.toUpperCase()} coat)`,
      cols: 4,
      rows: [
        { label: 'Upper Tier (Conformation 1 - 4)', tiles: tiles.slice(0, 4) },
        { label: 'Mid Tier (Conformation 5 - 8)', tiles: tiles.slice(4, 8) },
        { label: 'Lower Tier (Conformation 9 - 12)', tiles: tiles.slice(8, 12) },
      ],
    });
    console.log(`Master contact sheet composed at: ${outSheet}`);
  } catch (e) {
    console.warn(`Could not run composeSheet: ${e.message}`);
  }
}

console.log(`--- Result: ${tiles.length}/12 variants rendered ---`);
process.exit(tiles.length === 12 ? 0 : 1);
