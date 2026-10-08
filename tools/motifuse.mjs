// Which of the 12 motifs actually reach an animal, and how much ink does each put on the part it is
// assigned to? Answers two questions at once: "how many motifs are used per style" (8 of 12 — the
// other 4 are spares) and "why do legs look plain" (assigned motif may just be sparse).
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

function load(style) {
  const buf = fs.readFileSync(`app/atlas/${style}.bin`);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const cell = dv.getUint32(8, true);
  const bpl = cell * cell * 4;
  return { cell, bpl, base: 32 + buf.byteOffset };
}

function coverage(file, layer) {
  const buf = fs.readFileSync(file);
  const { cell, bpl } = (() => {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    return { cell: dv.getUint32(8, true), bpl: dv.getUint32(8, true) ** 2 * 4 };
  })();
  const off = 32 + layer * bpl;
  const px = new Uint8Array(buf.buffer, buf.byteOffset + off, bpl);
  let ink = 0, fillA = 0, fillB = 0, bead = 0, any = 0;
  for (let i = 0; i < cell * cell; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3];
    ink += r; fillA += g; fillB += b; bead += a;
    if (r + g + b + a > 6) any++;
  }
  const n = cell * cell * 255;
  return {
    ink: ink / n, fillA: fillA / n, fillB: fillB / n, bead: bead / n,
    coverage: any / (cell * cell),
  };
}

console.log('motifs used per style: 8 of 12 (indices 0-11); the remaining 4 are spares\n');
const used = new Set();
for (const s of STYLES) TILES[s].forEach((t) => used.add(`${s}/${t}`));
console.log(`distinct (style,motif) pairs in use: ${used.size} of ${STYLES.length * 12}\n`);

const hdr = ['style', 'zone', 'motif', 'ink%', 'fillA%', 'fillB%', 'bead%', 'covered%'];
console.log(hdr.map((h) => h.padStart(9)).join(''));
for (const s of STYLES) {
  const f = `app/atlas/${s}.bin`;
  for (const z of [3, 4]) {   // legs, paws
    const layer = TILES[s][z];
    const c = coverage(f, layer);
    console.log([
      s.padStart(9), ZONES[z].padStart(9), String(layer).padStart(6),
      (c.ink * 100).toFixed(1).padStart(9), (c.fillA * 100).toFixed(1).padStart(9),
      (c.fillB * 100).toFixed(1).padStart(9), (c.bead * 100).toFixed(1).padStart(9),
      (c.coverage * 100).toFixed(1).padStart(9),
    ].join(''));
  }
}