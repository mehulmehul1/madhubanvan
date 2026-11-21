// TSL/WebGPU port of core/render/animalObject.js.
//
// Same scene graph as the GLSL original — skinned base surface, instanced coat shells, silhouette
// fin cards, translucent fin membranes — but everything is a NodeMaterial (coat-tsl.js) with the
// DQS skinning node (dqs-tsl.js). Eyes are not ported yet (the coat already paints eye rims/lids);
// they are the one remaining GLSL piece.
import * as THREE from 'three/webgpu';
import { createSkeleton } from './skeleton.js';
import { DQSkin } from './dqs.js';
import { createCoatMaterials } from './coat-tsl.js';
import { splitMembranes, hasHair } from './membranes.js';
import { QUALITY } from '../build/pipeline.js';

const FIN_POS = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, 1, 0, 0.5, 1, 0]);
const FIN_IDX = [0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4];

// Tile-bombing seed/grid textures (Option A). Both are packed 2D (width <= 2048) with NEAREST
// sampling; a single wide strip is avoided because WebGPU caps texture width at 8192.
function makeMadTextures(data) {
  if (!data.seedTex || !data.seedGrid) return null;
  // Both textures are packed 2D with width <= 2048: WebGPU's default maxTextureDimension2D is 8192,
  // so a single long strip (seedCount*5 wide) is rejected there even though WebGL2 accepts it.
  const seedTotal = data.seedCount * 5;
  const seedW = Math.min(2048, seedTotal), seedH = Math.ceil(seedTotal / seedW);
  const seedData = new Float32Array(seedW * seedH * 4).fill(0);
  seedData.set(data.seedTex.subarray(0, Math.min(data.seedTex.length, seedData.length)));
  const seedTex = new THREE.DataTexture(seedData, seedW, seedH, THREE.RGBAFormat, THREE.FloatType);
  const cells = data.seedGridDims[0] * data.seedGridDims[1] * data.seedGridDims[2];
  const gridW = Math.min(2048, cells), gridH = Math.ceil(cells / gridW);
  // the grid array holds `cells` texels; the texture needs gridW*gridH → pad the tail (empty = -1)
  const gridData = new Float32Array(gridW * gridH * 4).fill(-1);
  gridData.set(data.seedGrid.subarray(0, Math.min(data.seedGrid.length, gridData.length)));
  const gridTex = new THREE.DataTexture(gridData, gridW, gridH, THREE.RGBAFormat, THREE.FloatType);
  for (const t of [seedTex, gridTex]) {
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
  }
  return { seedTex, gridTex, seedW, seedH, gridW, gridH, nS: data.seedCount, cell: data.seedCell, tile: data.seedTile, dims: data.seedGridDims, origin: data.seedGridOrigin };
}

export function createAnimalObject(data, species = {}, opts = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(data.nrm, 3));
  g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(data.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(data.skinWeight, 4));
  g.setAttribute('aComb', new THREE.BufferAttribute(data.comb, 3));
  g.setAttribute('aTint', new THREE.BufferAttribute(data.tint, 4));
  g.setAttribute('aCoat', new THREE.BufferAttribute(data.coat, 4));
  g.setAttribute('aPat', new THREE.BufferAttribute(data.pat, 4));
  g.setAttribute('aSurf', new THREE.BufferAttribute(data.surf, 4));
  g.setAttribute('aMad1', new THREE.BufferAttribute(data.aMad1, 4));
  g.setAttribute('aMad2', new THREE.BufferAttribute(data.aMad2, 4));
  g.setIndex(new THREE.BufferAttribute(data.index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const sk = createSkeleton(data);
  const dqs = new DQSkin(sk);
  const hints = (typeof species.render === 'function' ? species.render(data.params) : species.render) || {};
  const tier = QUALITY[opts.quality] ? opts.quality : (QUALITY[data.quality] ? data.quality : 'high');
  let shells = Math.max(0, QUALITY[tier].shells);

  const madTex = makeMadTextures(data);
  const mats = createCoatMaterials(dqs.tex, {
    shells,
    shellScale: hints.shellScale,
    markColor: hints.markColor,
    strandDensity: hints.strandDensity,
    finWidth: hints.finWidth,
    style: opts.style,
    palette: opts.palette,
    madhubaniStyle: opts.madhubaniStyle,
    madhubaniSeed: opts.madhubaniSeed ?? data.seed,
    madhubaniAtlas: opts.madhubaniAtlas,
    tiles: opts.madhubaniTiles ?? 'chain',
    madGrid: madTex,
  });
  // Automatic per-species motif scaling: scales with creature body length if not explicitly overridden
  let autoMotifM = 0.06;
  if (data.pos && data.pos.length >= 6) {
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 2; i < data.pos.length; i += 3) {
      const z = data.pos[i];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const len = maxZ - minZ;
    autoMotifM = Math.min(0.08, Math.max(0.015, len / 28));
  }
  const motifM = opts.madhubaniMotifM ?? autoMotifM;
  if (mats.mad?.setMotifM) mats.mad.setMotifM(motifM);
  const madMode = mats.style === 'madhubani';

  // painted eyes (bind-space centres + iris tint)
  const eyeData = data.eyes || [];
  for (let i = 0; i < 4; i++) {
    const e = eyeData[i];
    if (!e) { mats.uniforms.uEyeC[i].value.set(0, 0, 0, 0); continue; }
    const r = (e.spec && e.spec.r ? e.spec.r : 0.01) * (e.scale || 1);
    mats.uniforms.uEyeC[i].value.set(e.c[0], e.c[1], e.c[2], r);
    const m = (e.look && e.look.iris && e.look.iris.mid) || [0.32, 0.13, 0.02];
    mats.uniforms.uEyeTint[i].value.set(m[0] * 0.6, m[1] * 0.6, m[2] * 0.6);
  }

  const base = new THREE.Mesh(g, mats.base);
  base.name = 'base';
  base.frustumCulled = false;
  base.castShadow = opts.castShadow ?? true;
  base.receiveShadow = opts.receiveShadow ?? true;

  // shells: one instanced draw sharing every base buffer
  const sg = new THREE.InstancedBufferGeometry();
  for (const k of Object.keys(g.attributes)) sg.setAttribute(k, g.attributes[k]);
  sg.setIndex(g.index);
  sg.boundingSphere = g.boundingSphere;
  sg.instanceCount = shells;
  const shellMesh = new THREE.Mesh(sg, mats.shells);
  shellMesh.name = 'shells';
  shellMesh.frustumCulled = false;
  shellMesh.renderOrder = 10;
  shellMesh.receiveShadow = base.receiveShadow;

  // fins: a 2-segment card instanced once per skin vertex, fed the same per-vertex data
  const fg = new THREE.InstancedBufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(FIN_POS, 3));
  fg.setIndex(FIN_IDX);
  const inst = (name, arr, size) => fg.setAttribute(name, new THREE.InstancedBufferAttribute(arr, size));
  inst('iPos', data.pos, 3);
  inst('iNrm', data.nrm, 3);
  inst('iComb', data.comb, 3);
  inst('iTint', data.tint, 4);
  inst('iCoat', data.coat, 4);
  inst('iPat', data.pat, 4);
  inst('iSurf', data.surf, 4);
  inst('iSkinIndex', new Float32Array(data.skinIndex), 4);
  inst('iSkinWeight', data.skinWeight, 4);
  fg.instanceCount = data.nV;
  fg.boundingSphere = g.boundingSphere;
  const fins = new THREE.Mesh(fg, mats.fins);
  fins.name = 'fins';
  fins.frustumCulled = false;
  fins.renderOrder = 11;

  // membranes (material 11): move membrane triangles into their own transparent draw
  const split = splitMembranes(data);
  let membranes = null;
  if (split) {
    const mg = new THREE.BufferGeometry();
    for (const k of Object.keys(g.attributes)) mg.setAttribute(k, g.attributes[k]);
    mg.setIndex(new THREE.BufferAttribute(split.membrane, 1));
    mg.boundingSphere = g.boundingSphere;
    g.setIndex(new THREE.BufferAttribute(split.opaque, 1));
    membranes = new THREE.Mesh(mg, mats.membrane);
    membranes.name = 'membranes';
    membranes.frustumCulled = false;
    membranes.renderOrder = 5;
  }

  const hairy = hasHair(data);
  const group = new THREE.Group();
  group.name = data.species;
  group.add(base, shellMesh, fins);
  if (membranes) group.add(membranes);

  const obj = {
    group, base, shells: shellMesh, fins, membranes, skeleton: sk, dqs, uniforms: mats.uniforms,
    materials: mats, geometry: g, tier,
  };

  const syncVis = () => {
    const showCover = opts.coverings !== false;
    // Madhubani paints flat, BUT hairy regions keep strands (uHairGate masks them per vertex), so
    // the lion's mane is still a mane. "brush fur" removes the mask and strands the whole body.
    const shellsOn = showCover && hairy && shells > 0;
    shellMesh.visible = shellsOn;
    sg.instanceCount = shells;
    mats.uniforms.uShells.value = Math.max(1, shells);
    mats.uniforms.uShellsOn.value = shellsOn ? 1 : 0;
    mats.uniforms.uHairGate.value = (madMode && opts.brush !== true) ? 1 : 0;
    fins.visible = showCover && hairy;
    mats.uniforms.uFinFade.value = showCover ? 1 : 0;
  };
  obj.setQuality = (q) => { if (QUALITY[q]) { shells = QUALITY[q].shells; obj.tier = q; syncVis(); } return obj; };
  obj.setCoverings = (on) => { opts.coverings = !!on; syncVis(); return obj; };
  /** Madhubani: draw the print as fur brush strokes (shells on) instead of flat poster paint. */
  obj.setBrush = (on) => { opts.brush = !!on; syncVis(); return obj; };
  obj.setDebug = () => obj;
  obj.update = ({ dt = 0, time = 0 } = {}) => {
    dqs.update();
    dqs.tex.needsUpdate = true;
    mats.update({ time });
  };
  obj.dispose = () => {
    g.dispose(); sg.dispose(); fg.dispose(); dqs.tex.dispose();
    if (madTex) { madTex.seedTex.dispose(); madTex.gridTex.dispose(); }
    for (const m of [mats.base, mats.shells, mats.fins, mats.membrane]) m.dispose();
    group.removeFromParent();
  };

  syncVis();
  return obj;
}
