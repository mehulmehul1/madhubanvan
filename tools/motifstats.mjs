// Quality gate for the SVG motif library.
//
// Counts the ROLE classes in each motif's SOURCE (not the rendered DOM, which the 3x3 field view
// inflates ~9x) and fails the process when a motif breaks a rule.
//
//   node tools/motifstats.mjs          # full table + exit non-zero if anything fails
//   node tools/motifstats.mjs --quiet  # summary + failures only
//
// The rules exist because the first pass measurably got them wrong:
//
//   ground      every motif needs a ground rect, or its marks float on the page background
//   two-tone    the project's hard rule is "always multi-colour, varied" — a motif with no fill B
//               renders as flat single colour + ink and breaks it
//   beads       a tile denser in dots than in fill reads as noise
//   ink         ink plus ink line work above the share below renders nearly black, which is the
//               "blown out / fat black lines" failure the whole SVG move exists to escape
//   elements    density must come from stroke width and spacing, not from adding more elements
//   colour      no literal colour in source; colour comes from the role classes only
//   bleed       a tile must NOT carry its own background. The shader supplies the zone's ground from
//               the palette, so a full-bleed fa/fb rect paints the whole body part one flat colour and
//               the drawing disappears once tiled. This is invisible on the swatch page — a filled
//               square reads fine there — so it has to be caught in source, not by eye.
//   marks       at least 4 mark elements. Without a floor, a motif can satisfy every other rule with
//               one full-bleed rect and nothing else, and still be a blank tile on the animal.
//
// The last two exist because 12 of the 84 motifs shipped with a full-bleed background rect, and 7 of
// those had no other fill B anywhere — the rect WAS their fill B, so removing it (correctly) left
// them two-tone-deficient. Counting classes alone cannot see either failure.
//
// Per-style ink limits differ on purpose: a line-work style is mostly stroke by nature, while a
// filled style must be mostly mass.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const QUIET = process.argv.includes('--quiet');
const ROOT = join(process.cwd(), 'app', 'motifs');
const ROLES = ['g', 'fi', 'fa', 'fb', 'bd', 'si', 'sa', 'sia', 'sib'];

// style -> { ink: max share of fi+si, beads: max share of bd, elements: max element count }
const LIMITS = {
  scallop: { ink: 0.50, beads: 0.30, elements: 24 },
  vyaghra: { ink: 0.50, beads: 0.30, elements: 24 },
  kohbar: { ink: 0.50, beads: 0.30, elements: 24 },
  katchni: { ink: 0.55, beads: 0.30, elements: 20 },
  godna: { ink: 0.50, beads: 0.30, elements: 20 },
  tantrik: { ink: 0.50, beads: 0.30, elements: 24 },
  bharni: { ink: 0.45, beads: 0.25, elements: 20 },
};
const EXPECTED_PER_STYLE = 12;

const rows = [];
const missing = [];
for (const style of Object.keys(LIMITS)) {
  const dir = join(ROOT, style);
  if (!existsSync(dir)) { missing.push(`${style} (no directory)`); continue; }
  const files = readdirSync(dir).filter((n) => n.endsWith('.svg')).sort();
  if (files.length !== EXPECTED_PER_STYLE) {
    missing.push(`${style} (${files.length}/${EXPECTED_PER_STYLE} files)`);
  }
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    const c = Object.fromEntries(ROLES.map((r) => [r, 0]));
    for (const m of src.matchAll(/class="([^"]+)"/g)) {
      for (const t of m[1].split(/\s+/)) if (t in c) c[t]++;
    }
    const total = ROLES.reduce((s, r) => s + c[r], 0);
    const lim = LIMITS[style];
    const ink = (c.fi + c.si) / (total || 1);
    const beads = c.bd / (total || 1);

    // A tile must NOT carry its own background. The shader supplies the zone's ground colour from
    // the palette, so a full-bleed fa/fb rect paints the entire body part one flat colour and the
    // drawing vanishes once tiled. Invisible on the swatch page — a filled square reads fine there —
    // which is exactly why it has to be a source rule and not a visual check.
    let fullBleed = false;
    for (const m of src.matchAll(/<rect\b([^>]*?)\/?>/g)) {
      const attrs = m[1];
      const toks = (/class="([^"]+)"/.exec(attrs)?.[1] ?? '').split(/\s+/);
      const w = parseFloat(/width="([\d.]+)"/.exec(attrs)?.[1] ?? '0');
      const h = parseFloat(/height="([\d.]+)"/.exec(attrs)?.[1] ?? '0');
      if ((toks.includes('fa') || toks.includes('fb')) && w >= 99 && h >= 99) fullBleed = true;
    }
    // Density has to come from marks. Without a floor, a motif can satisfy every rule above with one
    // full-bleed rect and nothing else, and still be a blank tile on the animal.
    const marks = total - c.g;

    const fail = [];
    if (c.g === 0) fail.push('no ground rect');
    if (fullBleed) fail.push('full-bleed fa/fb rect — tiles as flat colour, kills the drawing');
    if (marks < 4) fail.push(`only ${marks} mark elements — too sparse to read when tiled`);
    if (c.sib === 0 && c.fb === 0) fail.push('single-tone, no fill B');
    if (beads > lim.beads) fail.push(`beads ${beads.toFixed(2)} > ${lim.beads}`);
    if (ink > lim.ink) fail.push(`ink ${ink.toFixed(2)} > ${lim.ink}`);
    if (total > lim.elements) fail.push(`${total} elements > ${lim.elements}`);
    if (/fill="#|stroke="#|fill="rgb|style="fill|fill="none"/.test(src)) fail.push('literal colour in source');

    rows.push({ file: `${style}/${f}`, ...c, total, ink, beads, fail });
  }
}

const bad = rows.filter((r) => r.fail.length);
const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 5) => String(v).padStart(n);

if (!QUIET) {
  console.log(`${pad('file', 16)}${num('g')}${num('fi')}${num('fa')}${num('fb')}${num('bd')}${num('si')}${num('sa')}${num('sia')}${num('sib')}${num('tot', 5)}  ink   beads`);
  console.log('-'.repeat(78));
  for (const r of rows) {
    console.log(`${pad(r.file, 16)}${num(r.g)}${num(r.fi)}${num(r.fa)}${num(r.fb)}${num(r.bd)}${num(r.si)}${num(r.sa)}${num(r.sia)}${num(r.sib)}${num(r.total, 5)}  ` +
      `${r.ink.toFixed(2)}  ${r.beads.toFixed(2)}  ${r.fail.length ? 'FAIL: ' + r.fail.join('; ') : ''}`);
  }
  console.log('-'.repeat(78));
}

console.log(`motifs checked : ${rows.length}`);
console.log(`styles missing : ${missing.length ? missing.join(', ') : 'none'}`);
console.log(`gate failures  : ${bad.length}${bad.length ? `  ->  ${bad.map((r) => `${r.file} [${r.fail.join('; ')}]`).join('  |  ')}` : ''}`);
if (bad.length || missing.length) process.exitCode = 1;
