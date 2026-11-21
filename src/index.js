// procedural-animals: three.js Procedural Animals.
//
//   const wolf = await createAnimal('wolf', { seed: 3, quality: 'high', ground: (x, z) => h(x, z) });
//   scene.add(wolf.object);
//   wolf.move({ speed: 6, heading });   // or wolf.follow(body.position, body.velocity)
//   wolf.update(dt);                     // every frame
import { Animal } from './animal.js';
import { buildAnimalData } from './build.js';
import { loadSpecies } from './registry.js';
import { readBake } from './bake.js';

export { Animal } from './animal.js';
export { registerSpecies, listSpecies, loadSpecies, addLoader } from './registry.js';
export { buildAnimalData, setWorkerFactory, clearBuildCache } from './build.js';
export { QUALITY } from './core/build/pipeline.js';
export { writeBake, readBake } from './bake.js';

/**
 * Create an animal. Builds it procedurally (in Web Workers when available) or loads a baked file.
 * @param {string|object} species  species id ('wolf') or an imported species module
 * @param {object} opts  { seed, quality, sex, age, ground, water, position, heading, baked, worker, onProgress }
 */
export async function createAnimal(species, opts = {}) {
  let sId = species;
  let options = opts;
  if (typeof species === 'object' && species !== null && !species.rig && (species.species || species.id)) {
    sId = species.species || species.id;
    options = { ...species, ...opts };
  }
  const s = await loadSpecies(sId);
  let data;
  if (options.baked) data = readBake(options.baked instanceof ArrayBuffer ? options.baked : await options.baked);
  else data = await buildAnimalData(s, options, options.onProgress);
  return new Animal(s, data, options);
}
