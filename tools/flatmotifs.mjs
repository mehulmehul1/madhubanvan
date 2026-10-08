// Scan ALL baked motifs for "flat tile" — a motif that is essentially one solid channel with no
// drawing on it. Harmless on the swatch page (a filled square reads fine there) but fatal when
// tiled: it paints the whole body part one colour and the motif disappears. This is what makes
// some legs look plain.
import fs from 'node:fs';

const STYLES = ['scallop', 'vyaghra', 'kohbar', 'katchni', 'godna', 'tantrik', 'bharni'];
const ZONES = ['trunk', 'neck', 'head', 'legs', 'paws', 'tail', 'wing', 'fin'];
const TILES = {
  scallop: [0, 7, 1, 3, 5, 11, 4, 2],
  vyaghra: [0, 6, 1, 10, 7, 11, 4, 9],
  kohbar: [0, 1, 3, 2, 6, 10, 4, 9],
  katchni: [0, 1, 2, 4, 7, 9, 5, 10],
  godna: [8, 0, 9, 1, 6, 11, 7, 10],
  tantrik: [4, 0, 1, 3, 2, 7, 8, 10],
  bharni: [0, 2, 3, 10, 6, 4, 7, 8],
};
const FLAT = 0.9;   // a channel covering this much of the tile = full-bleed background
const EMPTY = 0.04; // less than this much total coverage = too sparse to read

function stats(buf, layer) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const cell = dv.getUint32(8, true);
  const bpl = cell * cell * 4;
  const px = new Uint8Array(buf.buffer, buf.byteOffset + 32 + layer * bpl, bpl);
  const ch = [0, 0, 0, 0];
  let any = 0;
  const n = cell * cell;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < 4; c++) { ch[c] += px[i * 4 + c]; s += px[i * 4 + c]; }
    if (s > 6) any++;
  }
  const norm = n * 255;
  return { cell, frac: ch.map((v) => v / norm), coverage: any / n };
}

const flat = [], sparse = [], ok = [];
for (const s of STYLES) {
  const buf = fs.readFileSync(`app/atlas/${s}.bin`);
  for (let layer = 0; layer < 12; layer++) {
    const st = stats(buf, layer);
    const dom = Math.max(...st.frac);
    const zones = TILES[s].map((t, z) => (t === layer ? ZONES[z] : null)).filter(Boolean);
    const where = zones.length ? `USED BY ${zones.join('/')}` : 'spare';
    const rec = { style: s, layer, dom, coverage: st.coverage, where, frac: st.frac };
    if (st.coverage > 0.97 && dom > FLAT) flat.push(rec);
    else if (st.coverage < EMPTY) sparse.push(rec);
    else ok.push(rec);
  }
}

const line = (r) => `${(r.style + '/' + r.layer).padEnd(14)} dom=${(r.dom * 100).toFixed(1).padStart(5)}%  covered=${(r.coverage * 100).toFixed(1).padStart(5)}%  ${r.where}`;
console.log(`FLAT (single channel >= ${FLAT * 100}% and tile >= 97% covered): ${flat.length}`);
for (const r of flat) console.log('  ' + line(r));
console.log(`\nNEARLY EMPTY (< ${EMPTY * 100}% covered): ${sparse.length}`);
for (const r of sparse) console.log('  ' + line(r));
console.log(`\nOK: ${ok.length} of ${STYLES.length * 12}`);