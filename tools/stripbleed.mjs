// Remove full-bleed fa/fb background rects from the motif library.
//
// A tile must not carry its own background: the shader supplies the zone's ground colour from the
// palette, so a full-bleed fill rect paints the whole body part one flat colour and the drawing
// disappears when tiled. Only rects that are BOTH a fill role AND cover the whole tile are removed;
// every mark is left untouched.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'app', 'motifs');
const DRY = process.argv.includes('--dry');

let changed = 0, scanned = 0;
const log = [];

for (const style of readdirSync(ROOT)) {
  const dir = join(ROOT, style);
  // readdirSync also returns manifest.js — check it is really a directory before descending
  if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.svg'))) {
    const p = join(dir, f);
    const src = readFileSync(p, 'utf8');
    scanned++;

    // match each <rect ...> tag, decide from its attributes, keep or drop it
    let out = '';
    let last = 0;
    let dropped = 0;

    for (const m of src.matchAll(/<rect\b[^>]*?\/?>/g)) {
      const tag = m[0];
      const attrs = /<rect\b([^>]*?)\/?>/.exec(tag)[1];
      const toks = (/class="([^"]+)"/.exec(attrs)?.[1] ?? '').split(/\s+/);
      const w = parseFloat(/width="([\d.]+)"/.exec(attrs)?.[1] ?? '0');
      const h = parseFloat(/height="([\d.]+)"/.exec(attrs)?.[1] ?? '0');
      const isFill = toks.includes('fa') || toks.includes('fb');
      if (isFill && w >= 99 && h >= 99) {
        out += src.slice(last, m.index);
        last = m.index + tag.length;
        dropped++;
      }
    }

    if (dropped === 0) continue;
    out += src.slice(last);
    // tidy any blank-line pile-up the removal leaves behind
    out = out.replace(/\n{3,}/g, '\n\n');
    changed++;
    log.push(`${style}/${f}  dropped ${dropped} full-bleed rect(s)`);
    if (!DRY) writeFileSync(p, out);
  }
}

console.log(`scanned ${scanned} motifs, ${changed} modified${DRY ? ' (dry run)' : ''}`);
for (const l of log) console.log('  ' + l);