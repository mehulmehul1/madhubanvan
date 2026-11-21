// Elephant coat: wrinkly slate-grey skin, ivory tusks, keratin toenails,
// sparse coarse tail tuft, and depigmented pink ear/trunk spots.
import { SDFModel } from '../../core/sdf/sdf.js';
import { srgb, mix3, MAT } from '../../core/build/coatKit.js';
import { norm, sub, dot, len, clamp, mix } from '../../core/math/vec.js';

export const ELEPHANT_PALETTE = {
  african: {
    body: 0x52504e,
    dorsal: 0x42403e,
    belly: 0x5c5856,
    head: 0x504e4c,
    tuskBase: 0xeee4d2,
    tuskTip: 0x6e6252,
    nail: 0xdcd6cc,
    tuft: 0x181614,
    mouth: 0xa85858,
  },
  asian: {
    body: 0x5a544e,
    dorsal: 0x48423c,
    belly: 0x645c54,
    head: 0x58524c,
    tuskBase: 0xeee4d2,
    tuskTip: 0x6e6252,
    nail: 0xdcd6cc,
    tuft: 0x181614,
    mouth: 0xa85858,
    spot: 0xdb9a94,
  },
};

export function elephantCoat(ctx) {
  const { model, rig, pos, nrm, regionOf: partOf, regionNames, weights, nV, params, lists } = ctx;
  const { BONES } = rig;
  const variant = params.variant || 'african';
  const C = ELEPHANT_PALETTE[variant] || ELEPHANT_PALETTE.african;

  const colBody = srgb(C.body);
  const colDorsal = srgb(C.dorsal);
  const colBelly = srgb(C.belly);
  const colTuskBase = srgb(C.tuskBase);
  const colTuskTip = srgb(C.tuskTip);
  const colNail = srgb(C.nail);
  const colTuft = srgb(C.tuft);
  const colMouth = srgb(C.mouth);

  const { dominant, limbMember } = weights;

  const comb = new Float32Array(nV * 3);
  const tint = new Float32Array(nV * 4);
  const pattern = new Float32Array(nV);
  const markSDF = new Float32Array(nV);
  const furLen = new Float32Array(nV);
  const patternColor = new Float32Array(nV * 4);
  const surf = new Float32Array(nV * 4);
  const region = new Uint8Array(nV);
  const ventral = new Float32Array(nV);

  const isLimb = BONES.map((b) => /^(scapula|humerus|radius|metacarpus|fpaw|femur|tibia|metatarsus|hpaw)/.test(b.name));

  // Determine nearest primitive tag per vertex
  const tagOf = new Array(nV);
  for (let v = 0; v < nV; v++) {
    const L = lists[v];
    const px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
    let best = 1e9, t = '';
    if (L) {
      for (const pr of L) {
        if (pr.carve) continue;
        const d = SDFModel.dist(pr, px, py, pz);
        if (d < best) {
          best = d;
          t = pr.tag || '';
        }
      }
    }
    tagOf[v] = t;
  }

  for (let v = 0; v < nV; v++) {
    const o3 = v * 3;
    const o4 = v * 4;
    const ny = nrm[o3 + 1];
    const tag = tagOf[v];
    const boneName = BONES[dominant[v]] ? BONES[dominant[v]].name : '';
    const rname = regionNames && partOf ? regionNames[partOf[v]] : '';

    // Ventral factor (0 = dorsal spine, 1 = ventral belly)
    const vent = clamp((-ny + 0.4) * 0.7, 0, 1);
    ventral[v] = vent;

    // Region classification
    if (tag === 'nail') {
      region[v] = 14;
    } else if (tag === 'tusk' || tag === 'tusktip' || rname === 'tusk') {
      region[v] = 8;
    } else if (tag === 'trunk' || tag === 'trunktip' || boneName.startsWith('trunk')) {
      region[v] = 7;
    } else if (tag === 'ear' || boneName.startsWith('ear')) {
      region[v] = 5;
    } else if (tag === 'lowerjaw' || tag === 'chin' || rname === 'jaw') {
      region[v] = 6;
    } else if (tag === 'tail' || tag === 'tuft' || boneName.startsWith('tail')) {
      region[v] = 4;
    } else if (isLimb[dominant[v]] || limbMember[v] > 0.3) {
      region[v] = 3;
    } else if (boneName === 'head') {
      region[v] = 2;
    } else if (boneName.startsWith('neck')) {
      region[v] = 1;
    } else {
      region[v] = 0; // torso
    }

    // Material and surface properties
    if (region[v] === 8) {
      // Tusk (ivory keratin)
      const tuskTipBlend = tag === 'tusktip' ? 0.9 : 0.2;
      const c = mix3(colTuskBase, colTuskTip, tuskTipBlend);
      tint[o4] = c[0];
      tint[o4 + 1] = c[1];
      tint[o4 + 2] = c[2];
      tint[o4 + 3] = MAT.KERATIN;
      furLen[v] = 0.0;
      surf[o4] = 0.32; // roughness
      surf[o4 + 1] = 0.0; // metalness
      surf[o4 + 2] = 0.25; // clearcoat
    } else if (region[v] === 14) {
      // Toenails
      tint[o4] = colNail[0];
      tint[o4 + 1] = colNail[1];
      tint[o4 + 2] = colNail[2];
      tint[o4 + 3] = MAT.KERATIN;
      furLen[v] = 0.0;
      surf[o4] = 0.45;
      surf[o4 + 1] = 0.0;
      surf[o4 + 2] = 0.1;
    } else if (tag === 'tuft') {
      // Coarse tail tuft
      tint[o4] = colTuft[0];
      tint[o4 + 1] = colTuft[1];
      tint[o4 + 2] = colTuft[2];
      tint[o4 + 3] = MAT.FUR;
      furLen[v] = 0.08;
      surf[o4] = 0.9;
      surf[o4 + 1] = 0.0;
      surf[o4 + 2] = 0.0;
    } else if (region[v] === 6 && tag === 'lowerjaw') {
      // Mouth / inner jaw
      tint[o4] = colMouth[0];
      tint[o4 + 1] = colMouth[1];
      tint[o4 + 2] = colMouth[2];
      tint[o4 + 3] = MAT.MOUTH;
      furLen[v] = 0.0;
      surf[o4] = 0.4;
      surf[o4 + 1] = 0.0;
      surf[o4 + 2] = 0.2;
    } else {
      // Skin (body, head, ears, trunk, legs)
      const baseCol = mix3(colDorsal, colBelly, vent);
      tint[o4] = baseCol[0];
      tint[o4 + 1] = baseCol[1];
      tint[o4 + 2] = baseCol[2];
      tint[o4 + 3] = MAT.DARK_SKIN;
      furLen[v] = 0.001; // very sparse micro-bristles
      surf[o4] = 0.82; // rough wrinkly elephant skin
      surf[o4 + 1] = 0.0;
      surf[o4 + 2] = 0.0;
    }

    // Default flow / comb direction: downwards on sides, backwards on appendages
    comb[o3] = 0.0;
    comb[o3 + 1] = -1.0;
    comb[o3 + 2] = 0.0;

    pattern[v] = 0.0;
    markSDF[v] = 1.0;
    patternColor[o4] = tint[o4];
    patternColor[o4 + 1] = tint[o4 + 1];
    patternColor[o4 + 2] = tint[o4 + 2];
    patternColor[o4 + 3] = 1.0;
  }

  return {
    comb,
    tint,
    pattern,
    mark: markSDF,
    furLen,
    patternColor,
    surf,
    stats: {},
    region,
    ventral,
  };
}
