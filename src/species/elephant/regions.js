// Elephant meshing plan:
// Body (torso, columnar legs, feet, tail) cross-faded with head (tall domed skull, trunk, fan ears),
// plus rigid sub-meshes for lower jaw and tusks.
import { HEAD_O, elephantJoints } from './rig.js';
import { norm, sub, smoothstep } from '../../core/math/vec.js';

const J0 = elephantJoints();

// Cut plane between neck and head, centered between neckMid and occiput
export const NECK_CUT = (() => {
  const d = norm(sub(J0.occiput, J0.neckMid));
  const c = [0, (J0.neckMid[1] + J0.occiput[1]) * 0.5, (J0.neckMid[2] + J0.occiput[2]) * 0.5];
  return { c, d, band: 0.08 };
})();

export const neckS = (x, y, z) =>
  (x - NECK_CUT.c[0]) * NECK_CUT.d[0] +
  (y - NECK_CUT.c[1]) * NECK_CUT.d[1] +
  (z - NECK_CUT.c[2]) * NECK_CUT.d[2];

export const EYE_CENTRES = [1, -1].map((s) => [0.335 * s, 2.86, 1.32]);
const EYE_PATCH = { R: 0.08, B: 0.015, h: 0.006 };

export function elephantRegions(rig, params, Q) {
  const r = Q.res;
  const B = Math.max(NECK_CUT.band, 1.5 * 0.024 * r);
  const XB = Math.min(0.12, 4 * 0.024 * r);
  const XH = Math.min(0.06, 3 * 0.014 * r);

  // Mesh cell sizes scaling across the 5 tiers (hero ~0.024m, high ~0.033m, medium ~0.048m, low ~0.072m, crowd ~0.108m)
  const hB = 0.024 * r;
  const hH = 0.014 * r;
  const hJ = 0.014 * r;
  const hT = 0.012 * r;

  const patches = (Q.eyePatches || r <= 2.01)
    ? EYE_CENTRES.map((c) => ({ c, R: EYE_PATCH.R, B: EYE_PATCH.B, h: EYE_PATCH.h * Math.max(1, r) }))
    : [];

  return {
    jobs: [
      [
        {
          name: 'body',
          part: 'body',
          bmin: [-1.45, -0.05, -2.85],
          bmax: [1.45, 3.35, 1.30],
          h: hB,
          F: 4,
          clip: (x, y, z) => neckS(x, y, z) < B + XB,
        },
      ],
      [
        {
          name: 'head',
          part: 'body',
          bmin: [-1.55, 0.15, 0.50],
          bmax: [1.55, 3.45, 2.45],
          h: hH,
          F: 6,
          clip: (x, y, z) => neckS(x, y, z) > -B - XH,
          patches,
        },
        {
          name: 'jaw',
          part: 'jaw',
          bmin: [-0.32, 2.05, 1.05],
          bmax: [0.32, 2.70, 1.70],
          h: hJ,
          F: 6,
          rigidBone: 'jaw',
        },
        {
          name: 'tusk',
          part: 'tusk',
          bmin: [-0.65, 2.15, 1.40],
          bmax: [0.65, 2.95, 2.45],
          h: hT,
          F: 6,
          rigidBone: 'head',
        },
      ],
    ],
    fade(x, y, z, name, patch) {
      const sN = neckS(x, y, z);
      if (name === 'body') return 1 - smoothstep(-B, B, sN);
      if (name === 'head') {
        let f = smoothstep(-B, B, sN);
        if (patches.length && patch) {
          let dmin = 1e9;
          for (const p of patches) {
            dmin = Math.min(dmin, Math.hypot(x - p.c[0], y - p.c[1], z - p.c[2]));
          }
          const pw = 1 - smoothstep(EYE_PATCH.R - EYE_PATCH.B, EYE_PATCH.R + EYE_PATCH.B, dmin);
          f *= patch ? pw : 1 - pw;
        }
        return f;
      }
      return 1;
    },
  };
}
