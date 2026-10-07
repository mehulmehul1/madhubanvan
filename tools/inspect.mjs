import { loadSpecies } from '../src/registry.js';
import { buildAnimalData } from '../src/build.js';

const id = process.argv[2] || 'cheetah';
const seed = +(process.argv[3] || 7);
const quality = process.argv[4] || 'medium';
const s = await loadSpecies(id);
const d = await buildAnimalData(s, { seed, quality, worker: false });
console.log(`${id} seed ${seed} ${quality}: nV=${d.nV} tris=${d.index.length / 3} bones=${d.bones.length}`);
const show = (name, arr, stride) => {
  const out = [];
  for (let c = 0; c < stride; c++) {
    let mn = Infinity, mx = -Infinity, sum = 0;
    for (let v = 0; v < arr.length / stride; v++) { const x = arr[v * stride + c]; if (x < mn) mn = x; if (x > mx) mx = x; sum += x; }
    out.push(`[${c}] ${mn.toFixed(3)}..${mx.toFixed(3)} (m ${(sum / (arr.length / stride)).toFixed(3)})`);
  }
  console.log(name.padEnd(6), out.join('  '));
};
show('tint', d.tint, 4);
show('coat', d.coat, 4);
show('pat', d.pat, 4);
show('surf', d.surf, 4);
show('comb', d.comb, 3);
show('aMad1', d.aMad1, 4);
show('aMad2', d.aMad2, 4);
console.log('params', JSON.stringify(d.params).slice(0, 300));
console.log('eyes', JSON.stringify(d.eyes || null).slice(0, 400));
