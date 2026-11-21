// Elephant skeleton in bind pose (metres). Forward = +Z, up = +Y, the animal's left = +X.
// Reference individual: an African bush elephant (Loxodonta africana), ~3.0 m at the shoulder.
//
// This is a hand-authored skeleton in the same idiom as cow/rig.js and the other 17 quadrupeds —
// real landmark coordinates, a head frame, a tail chain, and one part no other species here has:
// a TRUNK. The trunk is a fused nose + upper lip: ~40,000 muscles, no bone, tapering to a
// prehensile tip. Here it is a joint chain off the head (trunk0..trunkN), so the sculpt can follow
// it and the motion engine can curl it.
//
// Landmarks (from elephant anatomy references): shoulder height ~3.0 m, the skull tall and domed
// at the poll and sloping forward-down to the trunk base, the ear a great fan from behind the eye,
// the legs columnar and straight with a broad flat foot (a false hoof and a fat pad), tusks the
// upper incisors growing forward and up.
import { buildRig } from '../../core/rig/rig.js';
import { quadrupedBones, quadrupedLimbs, tailChain } from '../../core/rig/quadruped.js';

export const TAIL_SEGS = 12; // 10 bony segments + 2 of tuft
export const BONE_SEGS = 10;
export const TAIL_PITCH = [-24, -50, -70, -84, -90, -92, -93, -93, -93, -93, -93, -93];
export const TAIL_LENS = [0.13, 0.12, 0.11, 0.10, 0.095, 0.09, 0.085, 0.08, 0.075, 0.07, 0.16, 0.16];

export const TRUNK_SEGS = 10;

// Head frame: the head is modelled along its own axis (poll -> trunk base), pitched 55 degrees
// nose-down in the bind pose (the forehead up, the face sloping down to the trunk).
export const HEAD_PITCH = (55 * Math.PI) / 180;
export const HZ = [0, -Math.sin(HEAD_PITCH), Math.cos(HEAD_PITCH)];
export const HY = [0, Math.cos(HEAD_PITCH), Math.sin(HEAD_PITCH)];
export const HEAD_O = [0, 2.85, 1.50]; // on the head axis, level with the eyes
export const hl = (v) => [HEAD_O[0] + v[0], HEAD_O[1] + v[1] * HY[1] + v[2] * HZ[1], HEAD_O[2] + v[1] * HY[2] + v[2] * HZ[2]];

// Trunk chain from the nose forward and down, curling: per-segment pitch (degrees below
// horizontal) and lengths. Writes trunk0..trunkN into J.
export function trunkChain(J, base, anglesDeg, lens) {
  let p = J[base].slice();
  J.trunk0 = p.slice();
  for (let i = 0; i < anglesDeg.length; i++) {
    const a = (anglesDeg[i] * Math.PI) / 180;
    p = [p[0], p[1] + Math.sin(a) * lens[i], p[2] + Math.cos(a) * lens[i]];
    J['trunk' + (i + 1)] = p.slice();
  }
  return J;
}
export const TRUNK_PITCH = [-30, -44, -56, -66, -74, -80, -85, -89, -92, -94];
export const TRUNK_LENS = [0.19, 0.185, 0.18, 0.175, 0.17, 0.165, 0.16, 0.15, 0.14, 0.13];

export function elephantJoints() {
  const J = {
    // axial: a very short neck — the head sits close on the great shoulders
    nose: [0, 2.56, 1.44],
    occiput: [0, 3.06, 0.94],
    neckMid: [0, 3.00, 0.78],
    neckBase: [0, 2.86, 0.54],
    chestMid: [0, 2.68, 0.26],
    thoraxRear: [0, 2.84, -0.30],
    lumbarMid: [0, 2.80, -0.78],
    lumbosacral: [0, 2.90, -1.22],
    tailBase: [0, 2.82, -1.66],
    // forelimb: a near-vertical column. Shoulder high, elbow mid, carpus low, broad flat foot.
    scapTopL: [0.22, 3.04, 0.42],
    shoulderL: [0.36, 1.98, 0.50],
    elbowL: [0.37, 1.30, 0.48],
    wristL: [0.36, 0.60, 0.52],
    mcpL: [0.36, 0.22, 0.54],
    ftoeL: [0.36, 0.0, 0.58],
    // hindlimb: the stifle forward under the flank, the hock low and back
    hipL: [0.38, 2.24, -1.15],
    kneeL: [0.40, 1.40, -1.10],
    hockL: [0.37, 0.68, -1.27],
    mtpL: [0.36, 0.22, -1.21],
    htoeL: [0.36, 0.0, -1.15],
    jawHinge: [0, 2.64, 1.06],
    jawTip: [0, 2.34, 1.42],
    earBaseL: [0.24, 3.06, 1.16],
  };
  J.earTipL = [1.05, 1.88, 0.38];
  tailChain(J, 'tailBase', TAIL_PITCH, TAIL_LENS);
  trunkChain(J, 'nose', TRUNK_PITCH, TRUNK_LENS);
  return J;
}

export function elephantBones() {
  const b = quadrupedBones({ tailSegs: TAIL_SEGS, ears: true, jaw: true });
  for (let i = 0; i < TRUNK_SEGS; i++) {
    b.push(['trunk' + i, 'trunk' + i, 'trunk' + (i + 1), i === 0 ? 'head' : 'trunk' + (i - 1), { region: 'trunk', group: 'trunk' }]);
  }
  return b;
}

export function elephantRig(J = elephantJoints()) {
  const limbs = quadrupedLimbs({
    front: { tCore: 0.55, aCore: 0.06, aBody: -0.1, midX: 0.0 },
    hind: { tCore: 0.5, aCore: 0.03, aBody: -0.08, midX: 0.02 },
  });
  return buildRig({
    joints: J,
    unit: 3.0 / 0.76,
    headOrigin: HEAD_O,
    bones: elephantBones(),
    axial: {
      points: ['nose', 'occiput', 'neckMid', 'neckBase', 'chestMid', 'thoraxRear', 'lumbarMid', 'lumbosacral', 'tailBase', ...Array.from({ length: TAIL_SEGS }, (_, i) => 'tail' + (i + 1))],
      bones: ['head', 'neck2', 'neck1', 'chest', 'spine3', 'spine2', 'spine1', 'pelvis', ...Array.from({ length: TAIL_SEGS }, (_, i) => 'tail' + i)],
      blend: { 1: [-0.08, 0.16, 4], 3: [-0.14, 0.14, 2] },
      bodyTail: 0,
    },
    limbs,
    appendages: [
      { group: 'earL', bone: 'earL', blend: [-0.004, 0.008] },
      { group: 'earR', bone: 'earR', blend: [-0.004, 0.008] },
    ],
    webTags: [],
  });
}
