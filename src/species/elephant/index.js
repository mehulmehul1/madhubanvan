// African bush elephant (Loxodonta africana).
// The 25th species in the Madhubani procedural animal library:
// An immense, column-legged proboscidean with high-crested shoulder (3.0 m withers height),
// prehensile 10-joint trunk, broad fan ears, arcing ivory tusks, and columnar feet with flat pads.
import { elephantRig, HEAD_O } from './rig.js';
import { sculptElephant } from './sculpt.js';
import { elephantRegions, EYE_CENTRES } from './regions.js';
import { elephantCoat } from './coat.js';
import { motion } from './motion.js';
import { srgb } from '../../core/build/coatKit.js';

const VARIANTS = [
  { id: 'african', name: 'African bush elephant', latin: 'Loxodonta africana' },
  { id: 'asian', name: 'Asian elephant', latin: 'Elephas maximus' },
];

export const EYE_LOOK = {
  pupil: 'round',
  lids: 'mammal',
  iris: {
    inner: srgb(0x22140c),
    mid: srgb(0x3e2618),
    hi: srgb(0x5a3e28),
    outer: srgb(0x1a0e08),
  },
  sclera: { color: [0.65, 0.62, 0.58], visible: true },
  lidColor: [0.06, 0.05, 0.045],
  pupilSize: [0.22, 0.22],
};

export default {
  id: 'elephant',
  name: 'African bush elephant',
  latin: 'Loxodonta africana',
  group: 'paws',
  plan: 'quadruped',
  covering: 'skin',
  variants: VARIANTS,

  variation(R, o = {}) {
    const variant = o.variant === 'asian' ? 'asian' : 'african';
    const sex = o.sex || (R() < 0.5 ? 'male' : 'female');
    const age = o.age || 'adult';
    const calf = age === 'juvenile';
    const male = sex === 'male';
    const g = () => (R() + R() + R() - 1.5) / 1.5;

    // African elephant reference shoulder height: 3.0 m; Asian: ~2.7 m
    const baseH = variant === 'asian' ? 2.7 : 3.0;
    const size = o.size ?? ((baseH / 3.0) * (male ? 1.0 : 0.92) * (1 + 0.03 * g()) * (calf ? 0.45 : 1.0));

    // Ears: African has giant fans; Asian has smaller squared ears
    const earK = o.earK ?? ((variant === 'asian' ? 0.65 : 1.0) * (calf ? 0.85 : 1.0) * (1 + 0.03 * g()));

    // Tusks: Bulls have massive tusks; cows smaller; calves none; Asian cows usually lack tusks
    let tuskK = 1.0;
    if (calf) {
      tuskK = 0.001;
    } else if (variant === 'asian' && !male) {
      tuskK = 0.05;
    } else {
      tuskK = o.tuskK ?? ((male ? 1.0 : 0.75) * (variant === 'asian' ? 0.7 : 1.0) * (1 + 0.05 * g()));
    }

    const coatSeed = Math.floor(R() * 1e6);

    return {
      variant,
      sex,
      age,
      size,
      earK,
      tuskK,
      trunkK: 1 + 0.03 * g(),
      coatSeed,
      minThick: 0.006,
      warps: [
        { type: 'legs', k: 1 + 0.02 * g() * (calf ? 0.9 : 1.0), top: 1.6 },
        { type: 'length', k: 1 + 0.02 * g() * (calf ? 0.85 : 1.0), z0: -1.6, z1: 1.4 },
        { type: 'girth', k: 1 + 0.02 * g() * (male ? 1.02 : 1.0), cy: 2.4, z0: -1.7, z1: 1.5 },
        { type: 'scaleAbout', c: HEAD_O, k: (1 + 0.02 * g()) * (calf ? 1.25 : 1.0), r0: 0.35, r1: 0.9 },
      ],
    };
  },

  rig: () => elephantRig(),
  sculpt: (m, rig, params) => sculptElephant(m, rig, params),
  regions: elephantRegions,
  coat: elephantCoat,
  eyeSpecs: () => [1, -1].map((side) => ({
    side,
    spec: {
      c: [0.335 * side, 0.01, -0.18],
      r: 0.045,
      back: 0.01,
      yaw: 0.25 * side,
      pitch: 0.05,
      lid: 0.006,
      R: 0.05,
      d: 0.02,
      off: 0,
      tilt: 0,
      irisZ: 0.02,
      irisR: 0.028,
    },
    headOrigin: HEAD_O,
    bone: 'head',
    look: EYE_LOOK,
  })),
  motion,
  render: {
    markColor: srgb(0x1a1616),
    strandDensity: 400,
    clumpDensity: 0.8,
    shellScale: 1.0,
    finWidth: 0.45,
    flatMaterial: true,
  },
};
