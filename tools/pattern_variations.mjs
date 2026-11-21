#!/usr/bin/env node
// Render 12 distinct Madhubani Pattern Styles & Palette variations on the Horse.
//
// Demonstrates all 7 traditional Madhubani styles (Scallop, Vyaghra, Kohbar, Katchni,
// Godna, Tantrik, Bharni) across natural earth palettes on canonical horse form.
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';
import { findChrome, mkdirp, composeSheet } from './lib/common.mjs';

const outSheet = 'out/variations/horse_pattern_sheet.png';
const outDir = path.resolve('out/variations/patterns');
mkdirp(outDir);
mkdirp(path.dirname(path.resolve(outSheet)));

export const PATTERN_PRESETS = [
  { id: 1, style: 'vyaghra', palette: 0, palName: 'haldi-geru', name: 'Vyaghra · Tiger Gold', desc: 'Flowing tiger stripes in turmeric & terracotta' },
  { id: 2, style: 'scallop', palette: 3, palName: 'neel', name: 'Scallop · Indigo Scales', desc: 'Overlapping aquatic fish scales in lapis indigo' },
  { id: 3, style: 'kohbar', palette: 1, palName: 'kohbar', name: 'Kohbar · Nuptial Lotus', desc: 'Sacred bridal chamber lotus flora & fertility motifs' },
  { id: 4, style: 'katchni', palette: 2, palName: 'chuna', name: 'Katchni · Fine Line Work', desc: 'Delicate high-density parallel line hatching' },
  { id: 5, style: 'godna', palette: 7, palName: 'godna', name: 'Godna · Tattoo Dots', desc: 'Ancestral concentric circle tattoos & puncture marks' },
  { id: 6, style: 'tantrik', palette: 6, palName: 'sindoor', name: 'Tantrik · Cinnabar Yantra', desc: 'Occult sacred mandalas in vermilion sindoor' },
  { id: 7, style: 'bharni', palette: 4, palName: 'marigold', name: 'Bharni · Marigold Fill', desc: 'Bold, saturated flat color fills in warm ochre' },
  { id: 8, style: 'katchni', palette: 3, palName: 'neel', name: 'Katchni · Midnight Indigo', desc: 'Ultra-fine line work in midnight blue & gold' },
  { id: 9, style: 'vyaghra', palette: 6, palName: 'sindoor', name: 'Vyaghra · Cinnabar Tiger', desc: 'High-contrast vermilion and lampblack tiger bands' },
  { id: 10, style: 'scallop', palette: 5, palName: 'polo', name: 'Scallop · Forest Sage', desc: 'Overlapping scales in earth green & raw sienna' },
  { id: 11, style: 'kohbar', palette: 2, palName: 'chuna', name: 'Kohbar · Chalk Ivory', desc: 'Delicate flora on lime white parchment' },
  { id: 12, style: 'bharni', palette: 0, palName: 'haldi-geru', name: 'Bharni · Golden Terracotta', desc: 'Vivid, richly pigmented ancestral ceremonial fills' },
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

console.log('Rendering 12 Madhubani Pattern Variations on the Horse…');
const tiles = [];

for (const p of PATTERN_PRESETS) {
  const url = `http://localhost:5175/?style=madhubani&species=horse&mstyle=${p.style}&palette=${p.palette}&mtiles=chain&seed=7&quality=low`;
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

    const cardFile = path.join(outDir, `horse_pattern_${String(p.id).padStart(2, '0')}.png`);
    await page.screenshot({ path: cardFile, animations: 'disabled', timeout: 20000 });
    console.log(`  ✓ Pattern #${p.id} rendered: ${p.name} [${p.style} / ${p.palName}]`);
    tiles.push({
      file: cardFile,
      label: `#${p.id} ${p.name}`,
      sub: p.desc,
    });
  } catch (e) {
    console.error(`  ✗ Error rendering pattern #${p.id}: ${e.message}`);
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
      title: 'Madhubani Art Pattern Styles on Horse: 7 Traditional Styles & 8 Natural Palettes',
      cols: 4,
      rows: [
        { label: 'Tier 1: Core Traditions (Vyaghra, Scallop, Kohbar, Katchni)', tiles: tiles.slice(0, 4) },
        { label: 'Tier 2: Ritual & Sacred (Godna, Tantrik, Bharni, Midnight Katchni)', tiles: tiles.slice(4, 8) },
        { label: 'Tier 3: Colorway Variations (Cinnabar Tiger, Forest Sage, Chalk Kohbar, Golden Bharni)', tiles: tiles.slice(8, 12) },
      ],
    });
    console.log(`Master pattern contact sheet composed at: ${outSheet}`);
  } catch (e) {
    console.warn(`Could not run composeSheet: ${e.message}`);
  }
}

console.log(`--- Result: ${tiles.length}/12 pattern variants rendered ---`);
process.exit(tiles.length === 12 ? 0 : 1);
