// Report per-file role density for the SVG motif library.
//
// The role audit on the rendered page counts DOM nodes, which the 3x3 field view inflates by ~9x.
// This counts the SOURCE, so it is the honest measure of how heavy each motif is:
//   bd   beads   - Madhubani uses dots, but a tile denser in dots than in fill reads as noise
//   fi   ink     - solid ink masses; too many and the tile goes black
//   si   strokes  - ink line work
//   sia/sib filled + outlined shapes - the actual coloured mass (fill A / fill B)
//
//   node tools/motifstats.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'app', 'motifs');
const ROLES = ['g', 'fi', 'fa', 'fb', 'bd', 'si', 'sa', 'sia', 'sib'];

const rows = [];
for (const style of readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  for (const f of readdirSync(join(ROOT, style)).filter((n) => n.endsWith('.svg')).sort()) {
    const src = readFileSync(join(ROOT, style, f), 'utf8');
    const c = Object.fromEntries(ROLES.map((r) => [r, 0]));
    // count class tokens on every element that has a class attribute
    for (const m of src.matchAll(/class="([^"]+)"/g)) {
      for (const t of m[1].split(/\s+/)) if (t in c) c[t]++;
    }
    const filled = c.sia + c.sib;               // shapes carrying real colour
    const inkish = c.fi + c.si;                // solid ink + ink line work
    const total = ROLES.reduce((s, r) => s + c[r], 0);
    rows.push({
      file: `${style}/${f}`,
      ...c,
      filled,
      inkish,
      total,
      // beads and ink as a share of everything that paints. >0.34 bead is dotty; >0.55 ink is black.
      beadPct: total ? c.bd / total : 0,
      inkPct: total ? inkish / total : 0,
      // does any motif use a bare second fill? the palette needs two tones to work
      twoTone: c.sib > 0 || c.fb > 0,
    });
  }
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 5) => String(v).padStart(n);
console.log(`${pad('file', 17)}${num('g')}${num('fi')}${num('fa')}${num('fb')}${num('bd')}${num('si')}${num('sa')}${num('sia')}${num('sib')}${num('tot', 5)}  bead%  ink%  2-tone`);
console.log('-'.repeat(96));
for (const r of rows) {
  const flag = r.beadPct > 0.34 ? ' ' : '!';
  console.log(
    `${pad(r.file, 17)}${num(r.g)}${num(r.fi)}${num(r.fa)}${num(r.fb)}${num(r.bd)}${num(r.si)}${num(r.sa)}${num(r.sia)}${num(r.sib)}${num(r.total, 5)}  ` +
    `${r.beadPct.toFixed(2)}${flag}  ${r.inkPct.toFixed(2)}   ${r.twoTone ? 'yes' : 'NO'}`);
}
console.log('-'.repeat(96));
console.log(`motifs: ${rows.length}`);
console.log(`bead-heavy (>0.34): ${rows.filter((r) => r.beadPct > 0.34).length}`);
console.log(`ink-heavy  (>0.55): ${rows.filter((r) => r.inkPct > 0.55).length}`);
console.log(`single-tone (no B) : ${rows.filter((r) => !r.twoTone).length}  ${rows.filter((r) => !r.twoTone).map((r) => r.file).join(', ')}`);
