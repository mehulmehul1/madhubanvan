// Task 4.1: Elephant Cross-Repo Parity & 5-Tier Quality Build Test
import { pathToFileURL } from 'node:url';
import { buildAnimalData } from '../src/build.js';
import { loadSpecies } from '../src/registry.js';
import { elephantRig } from '../src/species/elephant/rig.js';
import { sculptElephant } from '../src/species/elephant/sculpt.js';
import { SDFModel } from '../src/core/sdf/sdf.js';

// Load handwired mass measurement
const handwiredMassMod = await import(
  pathToFileURL('C:/Users/mehul/OneDrive/Desktop/Studio/PROJECTS/handwired/madhuban-morphology/mass.ts').href
);

async function run() {
  console.log('================================================================');
  console.log('Task 4.1: Elephant Cross-Repo Parity & 5-Tier Quality Build Test');
  console.log('================================================================');

  // 1. Cross-repo Volume & CoM Parity Check against AUDIT.md baseline
  console.log('\n--- 1. SDF Volume & CoM Parity Check ---');
  const rig = elephantRig();
  const m = new SDFModel();
  sculptElephant(m, rig, {});
  const prims = m.prims;

  const massResult = await handwiredMassMod.measure(prims);
  const measuredVol = massResult.volume;
  const AUDIT_BASELINE_VOL = 5.938; // m3
  const volDeltaPct = Math.abs(measuredVol - AUDIT_BASELINE_VOL) / AUDIT_BASELINE_VOL * 100;

  console.log(`Measured SDF Volume:    ${measuredVol.toFixed(4)} m³`);
  console.log(`AUDIT.md Baseline Vol:  ${AUDIT_BASELINE_VOL.toFixed(3)} m³`);
  console.log(`Volume Parity Delta:    ${volDeltaPct.toFixed(3)}% (Gate < 2.0%)`);
  console.log(`Uniform Mass (@1000):   ${massResult.massAt(1000).toFixed(0)} kg (AUDIT: 5,939 kg)`);
  console.log(`Biological Mass (350):  ${massResult.totalMassKg.toFixed(0)} kg (AUDIT: 6,221 kg)`);
  console.log(`Fore Load Split:        ${(massResult.loadFore * 100).toFixed(2)}% (AUDIT: 62.0%)`);
  console.log(`Stability Margin:       ${massResult.margin.toFixed(3)} m (AUDIT: 0.600 m)`);
  console.log(`CoM (Uniform):          [${massResult.com.map((v) => v.toFixed(3)).join(', ')}] m`);

  if (volDeltaPct >= 2.0) {
    throw new Error(`Volume parity delta ${volDeltaPct.toFixed(2)}% exceeds 2.0% threshold!`);
  }
  console.log('>>> Cross-repo Parity: PASS');

  // 2. Build Elephant across all 5 quality tiers
  console.log('\n--- 2. Build All 5 Quality Tiers (Hero -> Crowd) ---');
  const species = await loadSpecies('elephant');
  console.log(`Loaded species: "${species.id}" (${species.name})`);

  const tiers = ['hero', 'high', 'medium', 'low', 'crowd'];
  const expectedMaxVerts = { hero: 140000, high: 80000, medium: 45000, low: 25000, crowd: 12000 };

  for (const tier of tiers) {
    const t0 = performance.now();
    const data = await buildAnimalData('elephant', { quality: tier, seed: 1 });
    const elapsed = performance.now() - t0;

    const nV = data.pos.length / 3;
    const nTris = data.index.length / 3;
    const nBones = data.bones.length;

    console.log(`  Tier ${tier.toUpperCase().padEnd(6)}: ${nV.toLocaleString().padStart(7)} verts | ${nTris.toLocaleString().padStart(7)} tris | ${nBones} bones | ${elapsed.toFixed(0).padStart(5)} ms`);

    // Validations
    if (nV === 0 || nTris === 0) {
      throw new Error(`Tier ${tier} generated 0 geometry!`);
    }
    if (nV > expectedMaxVerts[tier]) {
      throw new Error(`Tier ${tier} vertex count ${nV} exceeds max budget ${expectedMaxVerts[tier]}`);
    }
    if (!data.aMad1 || data.aMad1.length !== nV * 4) {
      throw new Error(`Tier ${tier}: aMad1 buffer missing or size mismatch`);
    }
    if (!data.aMad2 || data.aMad2.length !== nV * 4) {
      throw new Error(`Tier ${tier}: aMad2 buffer missing or size mismatch`);
    }
    if (!data.tint || data.tint.length !== nV * 4) {
      throw new Error(`Tier ${tier}: tint buffer missing or size mismatch`);
    }
    if (!data.surf || data.surf.length !== nV * 4) {
      throw new Error(`Tier ${tier}: surf buffer missing or size mismatch`);
    }
  }

  console.log('\n================================================================');
  console.log('TASK 4.1 VERIFICATION COMPLETE: ALL ACCEPTANCE TESTS PASSED!');
  console.log('================================================================');
}

run().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
