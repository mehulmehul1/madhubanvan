// Bake the SVG motif library into GPU-ready role-mask texture arrays.
//
// One binary file per style: app/atlas/<style>.bin — 12 layers of
// cellSize x cellSize RGBA, where each channel is the ANTIALIASED COVERAGE
// of one role:
//
//   R = ink coverage    (selectors .fi, .si)
//   G = fill A coverage (selectors .fa, .sia, .sa)
//   B = fill B coverage (selectors .fb, .sib)
//   A = bead coverage   (selector  .bd)
//
// There is deliberately no ground channel: ground is where all four are zero.
// The shader composites bead -> fill B -> fill A -> ink over a ground colour,
// and because each role lives in its own channel, mip-averaging is exactly
// correct (average coverage IS average colour).
//
// HOW IT BAKES: each motif is rendered FOUR times, once per role group, each
// time hiding the other roles, painting only the visible group in opaque white
// on a fully transparent background, and reading the ALPHA channel as that
// role's coverage. This avoids all alpha-compositing and colour-space
// contamination and keeps the rasterizer's own antialiasing.
//
//   node tools/bakeatlas.mjs                 # bake all 7 styles
//   node tools/bakeatlas.mjs --style scallop # one style
//   node tools/bakeatlas.mjs --size 512      # override cell size (default 256)
//   node tools/bakeatlas.mjs --verify        # re-read baked files, print stats
//
// Only node:fs, node:path, node:http, node:url and playwright-core are used.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, normalize, sep } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { STYLE_KEYS } from '../src/core/render/madhubani/params.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// Baked output lives UNDER app/ on purpose: the viewer fetches these over the dev/preview server,
// and they are committed so a clone renders the real motifs without needing a headless browser.
// Regenerate with `npm run bake:motifs` after editing any SVG.
const OUT_DIR = join(ROOT, 'app', 'atlas');
const LAYERS = 12; // motif indices 0..11 per style
const DEFAULT_SIZE = 256;

// The role groups, in channel order. Elements whose class list contains none
// of the group's selectors are hidden (display:none) for that render.
const GROUPS = [
  { name: 'ink', classes: ['fi', 'si'], channel: 0 },
  { name: 'fillA', classes: ['fa', 'sia', 'sa'], channel: 1 },
  { name: 'fillB', classes: ['fb', 'sib'], channel: 2 },
  { name: 'bead', classes: ['bd'], channel: 3 },
];

// Per-role paint rules, applied AFTER a global `fill:none;stroke:none` reset.
// Two things this must get right, and a blanket `* { fill:#fff }` gets both wrong:
//   - `si` / `sa` are STROKE-ONLY by contract, and SVG's default fill is black, so a blanket fill
//     turns every thin ruled line (e.g. katchni's hand-ruled parallels) into a solid blob.
//   - `sia` / `sib` are two-tone: an ink outline around a coloured body. The ink render must take
//     only the outline and the fill render only the body, or each channel over-counts the shape.
const ROLE_CSS = {
  ink: '.fi{fill:#fff!important}.si,.sia{fill:none!important;stroke:#fff!important}',
  fillA: '.fa,.sia{fill:#fff!important}.sa{fill:none!important;stroke:#fff!important}',
  fillB: '.fb{fill:#fff!important}.sib{fill:none!important;stroke:#fff!important}',
  bead: '.bd{fill:#fff!important}',
};

const MAGIC = 'MATL';
const VERSION = 1;
const HEADER_BYTES = 32;

// ---- cli ----------------------------------------------------------------------------------------
function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const ONLY_STYLE = arg('--style', null);
const CELL = Number(arg('--size', String(DEFAULT_SIZE)));
const VERIFY = process.argv.includes('--verify');

if (!Number.isInteger(CELL) || CELL <= 0 || CELL > 2048) {
  console.error(`bakeatlas: --size must be a positive integer (got ${arg('--size', '(default)')})`);
  process.exit(1);
}
if (ONLY_STYLE !== null && !STYLE_KEYS.includes(ONLY_STYLE)) {
  console.error(`bakeatlas: unknown style "${ONLY_STYLE}" (expected one of ${STYLE_KEYS.join(', ')})`);
  process.exit(1);
}
const STYLES = ONLY_STYLE !== null ? [ONLY_STYLE] : [...STYLE_KEYS];

// ---- tiny static server (fetch is blocked on file://, so serve the project dir) -----------------
const MIME = {
  '.svg': 'image/svg+xml',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      try {
        const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (path === '/') {
          // A blank same-origin page: fetch() from here is same-origin.
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
          return;
        }
        const file = normalize(join(ROOT, ...path.split('/').filter((p) => p && p !== '.' && p !== '..')));
        if (file !== ROOT && !file.startsWith(ROOT + sep)) {
          res.writeHead(403); res.end('forbidden'); return;
        }
        const body = readFileSync(file);
        const dot = file.lastIndexOf('.');
        res.writeHead(200, { 'Content-Type': MIME[file.slice(dot)] ?? 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404); res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ---- page-side bake: fetch one SVG, render it 4x, return one RGBA buffer -------------------------
// Runs inside Chromium. Returns { rgba: Uint8Array, viewBox, warnings: string[] }.
// rgba is cellSize*cellSize*4 bytes, row-major, row 0 = the TOP row of the viewBox.
async function bakeMotifInPage(page, url, cellSize) {
  return page.evaluate(async ({ url, cellSize, groups, roleCss }) => {
    const warnings = [];
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
    const text = await res.text();

    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    if (root.nodeName.toLowerCase() !== 'svg') {
      throw new Error(`${url}: root element is <${root.nodeName}>, expected <svg>`);
    }
    const viewBox = root.getAttribute('viewBox') ?? '';
    if (viewBox !== '0 0 100 100') warnings.push(`viewBox is "${viewBox}", expected "0 0 100 100"`);

    let canvas = document.getElementById('bake');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'bake';
      document.body.appendChild(canvas);
    }
    canvas.width = cellSize;
    canvas.height = cellSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const out = new Uint8Array(cellSize * cellSize * 4);

    for (const group of groups) {
      const keep = new Set(group.classes);
      const clone = root.cloneNode(true);
      clone.setAttribute('width', String(cellSize));
      clone.setAttribute('height', String(cellSize));
      // Hide every element whose class is not in the current group. The root
      // itself carries no class and must stay; classless descendants (none in
      // the library, but be safe) are hidden too — only role paint survives.
      for (const el of clone.querySelectorAll('*')) {
        const cls = el.getAttribute('class');
        if (cls === null) {
          if (!/^(defs|style|title|desc|metadata)$/i.test(el.tagName)) el.style.display = 'none';
          continue;
        }
        const toks = cls.split(/\s+/).filter(Boolean);
        if (!toks.some((t) => keep.has(t))) el.style.display = 'none';
      }
      // Paint the surviving group opaque white, keeping the authored
      // stroke-widths. Scoped to this render: the <style> travels inside the
      // cloned SVG, which rasterizes as a self-contained image.
      const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = `*{fill:none!important;stroke:none!important}${roleCss[group.name] ?? ''}`;
      clone.insertBefore(style, clone.firstChild);

      const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
        type: 'image/svg+xml;charset=utf-8',
      });
      const objUrl = URL.createObjectURL(blob);
      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error(`rasterize failed for ${url} [${group.name}]`));
          img.src = objUrl;
        });
        // Start cleared every render so nothing leaks between role passes.
        ctx.clearRect(0, 0, cellSize, cellSize);
        ctx.drawImage(img, 0, 0, cellSize, cellSize);
        const px = ctx.getImageData(0, 0, cellSize, cellSize).data;
        for (let i = 0; i < cellSize * cellSize; i++) {
          out[i * 4 + group.channel] = px[i * 4 + 3]; // alpha IS the coverage
        }
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    }
    return { rgba: out, viewBox, warnings };
  }, { url, cellSize, groups: GROUPS, roleCss: ROLE_CSS });
}

// ---- .bin format --------------------------------------------------------------------------------
// Little-endian: char[4] magic, u32 version, u32 cellSize, u32 layers,
// u32 styleIndex, u32 bytesPerLayer, u32 reserved, u32 reserved2 (32 bytes),
// then layers consecutive, each cellSize*cellSize*4 RGBA bytes row-major.
function encodeStyle(styleIndex, cellSize, layerBuffers) {
  const bytesPerLayer = cellSize * cellSize * 4;
  const buf = Buffer.alloc(HEADER_BYTES + bytesPerLayer * layerBuffers.length);
  buf.write(MAGIC, 0, 'ascii');
  buf.writeUInt32LE(VERSION, 4);
  buf.writeUInt32LE(cellSize, 8);
  buf.writeUInt32LE(layerBuffers.length, 12);
  buf.writeUInt32LE(styleIndex, 16);
  buf.writeUInt32LE(bytesPerLayer, 20);
  buf.writeUInt32LE(0, 24);
  buf.writeUInt32LE(0, 28);
  layerBuffers.forEach((layer, i) => Buffer.from(layer).copy(buf, HEADER_BYTES + i * bytesPerLayer));
  return buf;
}

function decodeHeader(buf) {
  const problems = [];
  if (buf.length < HEADER_BYTES) return { problems: ['file shorter than 32-byte header'] };
  const magic = buf.subarray(0, 4).toString('ascii');
  const version = buf.readUInt32LE(4);
  const cellSize = buf.readUInt32LE(8);
  const layers = buf.readUInt32LE(12);
  const styleIndex = buf.readUInt32LE(16);
  const bytesPerLayer = buf.readUInt32LE(20);
  if (magic !== MAGIC) problems.push(`bad magic "${magic}" (expected "${MAGIC}")`);
  if (version !== VERSION) problems.push(`unsupported version ${version} (expected ${VERSION})`);
  if (bytesPerLayer !== cellSize * cellSize * 4) {
    problems.push(`bytesPerLayer ${bytesPerLayer} != cellSize^2*4 (${cellSize * cellSize * 4})`);
  }
  const need = HEADER_BYTES + layers * bytesPerLayer;
  if (buf.length < need) problems.push(`payload truncated: need ${need} bytes, have ${buf.length}`);
  if (buf.length > need) problems.push(`payload has ${buf.length - need} trailing bytes past ${need}`);
  return { magic, version, cellSize, layers, styleIndex, bytesPerLayer, problems };
}

function layerStats(layer) {
  const n = layer.length / 4;
  const sum = [0, 0, 0, 0];
  let empty = 0;
  for (let i = 0; i < n; i++) {
    const r = layer[i * 4], g = layer[i * 4 + 1], b = layer[i * 4 + 2], a = layer[i * 4 + 3];
    sum[0] += r; sum[1] += g; sum[2] += b; sum[3] += a;
    if (r === 0 && g === 0 && b === 0 && a === 0) empty++;
  }
  return { mean: sum.map((s) => s / n / 255), emptyFrac: empty / n };
}

// ---- bake ----------------------------------------------------------------------------------------
async function bake() {
  mkdirSync(OUT_DIR, { recursive: true });
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: CELL, height: CELL },
      deviceScaleFactor: 1,
    });
    // Transparent page: the canvas starts cleared and each render starts
    // cleared, so unpainted pixels stay alpha-zero.
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.addStyleTag({ content: 'html,body{background:transparent !important;margin:0;padding:0;}' });

    const manifest = {};
    for (const style of STYLES) {
      const styleIndex = STYLE_KEYS.indexOf(style);
      const layerBuffers = [];
      for (let index = 0; index < LAYERS; index++) {
        const url = `${base}/app/motifs/${style}/${index}.svg`;
        let baked;
        try {
          baked = await bakeMotifInPage(page, url, CELL);
        } catch (e) {
          console.error(`bakeatlas: ${style}/${index}.svg: ${e.message}`);
          process.exitCode = 1;
          continue;
        }
        for (const w of baked.warnings) console.warn(`bakeatlas: warn ${style}/${index}.svg: ${w}`);
        const rgba = Buffer.from(baked.rgba);
        const { emptyFrac } = layerStats(rgba);
        const flag = emptyFrac > 0.5 ? '  <-- WARN: more than 50% empty, possible drawing bug' : '';
        console.log(`bakeatlas: ${style}/${index} empty=${(emptyFrac * 100).toFixed(1)}%${flag}`);
        layerBuffers.push(rgba);
      }
      const bin = encodeStyle(styleIndex, CELL, layerBuffers);
      const file = `${style}.bin`;
      writeFileSync(join(OUT_DIR, file), bin);
      manifest[style] = { file, layers: layerBuffers.length, cellSize: CELL, bytes: bin.length };
      console.log(`bakeatlas: wrote app/atlas/${file} (${bin.length} bytes, ${layerBuffers.length} layers of ${CELL}x${CELL})`);
    }
    writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log('bakeatlas: wrote app/atlas/manifest.json');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

// ---- verify ---------------------------------------------------------------------------------------
async function verify() {
  let failed = false;
  for (const style of STYLES) {
    const path = join(OUT_DIR, `${style}.bin`);
    let buf;
    try {
      buf = readFileSync(path);
    } catch {
      console.error(`verify: MISSING app/atlas/${style}.bin`);
      failed = true;
      continue;
    }
    const head = decodeHeader(buf);
    if (head.problems?.length) {
      for (const p of head.problems) console.error(`verify: ${style}.bin MALFORMED: ${p}`);
      failed = true;
      continue;
    }
    console.log(`verify: ${style}.bin ok — magic="${head.magic}" version=${head.version} ` +
      `cell=${head.cellSize} layers=${head.layers} styleIndex=${head.styleIndex} ` +
      `bytesPerLayer=${head.bytesPerLayer} total=${buf.length}`);
    for (let l = 0; l < head.layers; l++) {
      const layer = buf.subarray(HEADER_BYTES + l * head.bytesPerLayer, HEADER_BYTES + (l + 1) * head.bytesPerLayer);
      const s = layerStats(layer);
      const flag = s.emptyFrac > 0.5 ? '  <-- WARN: more than 50% empty' : '';
      console.log(`  layer ${String(l).padStart(2)} mean R=${s.mean[0].toFixed(3)} ` +
        `G=${s.mean[1].toFixed(3)} B=${s.mean[2].toFixed(3)} A=${s.mean[3].toFixed(3)} ` +
        `empty=${(s.emptyFrac * 100).toFixed(1)}%${flag}`);
    }
  }
  if (failed) {
    console.error('verify: FAILED');
    process.exit(1);
  }
  console.log('verify: all files well-formed');
}

if (VERIFY) await verify();
else await bake();
