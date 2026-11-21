// The elephant, sculpted as a signed distance field — hand-authored in the same idiom as
// cow/sculpt.js and horse/sculpt.js: every primitive placed in metres from elephant anatomy,
// attached to a bone (skinning) and a group.
//
// This is the difference between a massing scaffold and a sculpt. buildMasses() gives any skeleton
// three ellipsoids and some tapered cones — enough to read as "a quadruped", with no head anatomy,
// no fan ears, no trunk, legs that taper to a point. Here the trunk is a tapering muscle column off
// the head, the ears are great thin sheets with a rolled rim, the legs are columns that end in
// broad flat pads with toenails, the skull is tall and domed with a sloping face, and the tusks arc
// forward and up. That is the nuance the mass system does not carry.
//
// Knobs (params): earK (ear size), tuskK (tusk length).
import { HEAD_O, HZ, HY, hl, TRUNK_SEGS, BONE_SEGS } from './rig.js';
import { add, sub, lerp, norm, cross, dot, mul } from '../../core/math/vec.js';

const X = [1, 0, 0];
const UP = [0, 1, 0];
const FWD = [0, 0, 1];

export function sculptElephant(m, rig, params = {}) {
  const J = rig.J;
  const tuskK = params.tuskK ?? 1;
  const earK = params.earK ?? 1;

  const E = (o) => m.ell({ k: 0.08, axis: [0, 0, 1], up: [0, 1, 0], ...o });
  const C = (o) => m.cone({ k: 0.08, ...o });
  const SP = (o) => m.sphere({ k: 0.08, ...o });
  const ellY = (o) => {
    const y = norm(o.ydir);
    const lat = o.lateral || X;
    const ax = norm(cross(lat, y));
    return m.ell({ ...o, axis: ax, up: y, k: o.k ?? 0.08 });
  };

  // ---------------------------------------------------------------- TORSO
  // a heavy barrel: deepest behind the ribs, with a great chest and a hanging belly; the topline
  // dips behind the withers and rises over the hips — the African elephant's saddle
  E({ tag: 'ribcage', bone: 'spine3', c: [0, 2.44, 0.10], r: [0.64, 0.74, 0.94], axis: norm([0, 0.05, 1]), k: 0.12 });
  E({ tag: 'girth', bone: 'chest', c: [0, 2.36, 0.60], r: [0.54, 0.54, 0.42], axis: FWD, k: 0.12 });
  E({ tag: 'brisket', bone: 'chest', c: [0, 2.00, 0.70], r: [0.34, 0.40, 0.38], axis: FWD, k: 0.10 });
  E({ tag: 'abdomen', bone: 'spine2', c: [0, 2.36, -0.55], r: [0.62, 0.68, 0.84], axis: norm([0, 0.06, -1]), k: 0.12 });
  E({ tag: 'belly', bone: 'spine2', c: [0, 2.00, -0.30], r: [0.54, 0.46, 0.76], axis: FWD, k: 0.14 });
  E({ tag: 'flank', bone: 'spine1', c: [0, 2.44, -0.95], r: [0.54, 0.56, 0.44], axis: FWD, k: 0.12 });
  E({ tag: 'rump', bone: 'pelvis', c: [0, 2.58, -1.30], r: [0.50, 0.54, 0.46], axis: FWD, k: 0.12 });
  E({ tag: 'withers', bone: 'chest', c: [0, 2.98, 0.44], r: [0.34, 0.18, 0.50], axis: norm([0, -0.1, 1]), k: 0.10 });
  E({ tag: 'back', bone: 'spine3', c: [0, 2.76, -0.10], r: [0.38, 0.21, 0.52], axis: FWD, k: 0.12 });
  E({ tag: 'loin', bone: 'spine1', c: [0, 2.84, -0.90], r: [0.44, 0.21, 0.36], axis: FWD, k: 0.11 });
  for (const s of [1, -1]) {
    SP({ tag: 'hook', bone: 'pelvis', c: [0.48 * s, 2.88, -1.14], rad: 0.19, k: 0.09 });
    SP({ tag: 'pin', bone: 'pelvis', c: [0.22 * s, 2.80, -1.58], rad: 0.16, k: 0.08 });
    E({ tag: 'quarter', bone: 'pelvis', c: [0.36 * s, 2.46, -1.34], r: [0.26, 0.44, 0.34], axis: FWD, k: 0.11 });
  }

  // ---------------------------------------------------------------- NECK (short and thick)
  E({ tag: 'neck', bone: 'neck2', c: [0, 3.00, 0.76], r: [0.42, 0.44, 0.38], axis: norm([0, 0.7, 1]), k: 0.12 });
  E({ tag: 'neck', bone: 'neck1', c: [0, 2.84, 0.52], r: [0.46, 0.48, 0.38], axis: norm([0, 0.5, 1]), k: 0.12 });
  C({ tag: 'throat', bone: 'neck1', a: [0, 2.44, 0.62], b: [0, 2.70, 0.92], ra: 0.24, rb: 0.20, k: 0.10 });

  // ---------------------------------------------------------------- HEAD
  // a tall skull whose forehead domes up and back, then a steep face falling to the trunk root; the
  // eye small and set well back; a heavy cheek and a short lower jaw
  E({ tag: 'cranium', bone: 'head', c: [0, 3.08, 1.00], r: [0.44, 0.50, 0.48], axis: norm([0, 0.25, 0.6]), k: 0.10 });
  E({ tag: 'forehead', bone: 'head', c: [0, 3.12, 1.24], r: [0.38, 0.42, 0.30], axis: norm([0, 0.4, 0.8]), k: 0.08 });
  E({ tag: 'face', bone: 'head', c: [0, 2.88, 1.30], r: [0.33, 0.33, 0.30], axis: FWD, k: 0.08 });
  E({ tag: 'midface', bone: 'head', c: [0, 2.66, 1.42], r: [0.27, 0.28, 0.26], axis: norm([0, -0.3, 1]), k: 0.07 });
  E({ tag: 'muzzle', bone: 'head', c: [0, 2.50, 1.50], r: [0.23, 0.24, 0.22], axis: norm([0, -0.5, 1]), k: 0.06 });
  for (const s of [1, -1]) {
    E({ tag: 'temple', bone: 'head', c: [0.32 * s, 2.98, 1.02], r: [0.15, 0.28, 0.28], axis: FWD, k: 0.07 });
    E({ tag: 'cheek', bone: 'head', c: [0.29 * s, 2.56, 1.24], r: [0.19, 0.27, 0.29], axis: FWD, k: 0.08 });
    E({ tag: 'brow', bone: 'head', c: [0.32 * s, 2.92, 1.28], r: [0.10, 0.08, 0.13], axis: FWD, k: 0.03 });
    SP({ tag: 'eye', bone: 'head', c: [0.335 * s, 2.86, 1.32], rad: 0.055, k: 0.012 });
  }
  // jaw and chin (the mouth opens; the lower lip is short)
  E({ tag: 'lowerjaw', bone: 'jaw', group: 'jaw', part: 'jaw', c: [0, 2.36, 1.30], r: [0.24, 0.22, 0.30], axis: FWD, k: 0.07 });
  E({ tag: 'chin', bone: 'jaw', group: 'jaw', part: 'jaw', c: [0, 2.28, 1.38], r: [0.17, 0.15, 0.19], axis: FWD, k: 0.06 });

  // ---------------------------------------------------------------- TRUNK (a tapering muscle column, no bone)
  for (let i = 0; i < TRUNK_SEGS; i++) {
    const a = J['trunk' + i], b = J['trunk' + (i + 1)];
    const t0 = i / TRUNK_SEGS, t1 = (i + 1) / TRUNK_SEGS;
    const r = (t) => Math.max(0.075, 0.225 * (1 - 0.66 * t));
    C({ tag: 'trunk', bone: 'trunk' + i, a, b, ra: r(t0), rb: r(t1), k: i === 0 ? 0.08 : 0.045 });
  }
  SP({ tag: 'trunktip', bone: 'trunk' + (TRUNK_SEGS - 1), c: J['trunk' + TRUNK_SEGS], rad: 0.075, k: 0.045 });

  // ---------------------------------------------------------------- TUSKS (upper incisors: thick at
  // the root, arcs forward then up) — they root in the upper jaw either side of the trunk
  for (const s of [1, -1]) {
    const segs = 4, seg = 0.185 * tuskK;
    let p = [0.22 * s, 2.52, 1.60];
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const a = (-25 + 60 * t) * (Math.PI / 180);
      const d = norm([0.16 * s, Math.sin(a), Math.cos(a)]);
      const q = [p[0] + d[0] * seg, p[1] + d[1] * seg, p[2] + d[2] * seg];
      C({ tag: 'tusk', bone: 'head', part: 'tusk', a: p, b: q, ra: 0.130 * (1 - 0.58 * t), rb: 0.130 * (1 - 0.58 * (t + 1 / segs)), k: 0.02 });
      p = q;
    }
    SP({ tag: 'tusktip', bone: 'head', part: 'tusk', c: p, rad: 0.055, k: 0.01 });
  }

  // ---------------------------------------------------------------- EARS (great fans)
  // A fan of a sheet: an exact slab (m.fin) with a leaf outline, thick at the root and thinning to a
  // rounded rim, cupped forward. In an African elephant the ear is a third of the animal's height;
  // here it hangs from the top of the skull behind the eye, down over the shoulder.
  for (const S of ['L', 'R']) {
    const s = S === 'L' ? 1 : -1;
    const base = J['earBase' + S], tip = J['earTip' + S];
    const nRaw = norm([s * 0.62, 0.26, 0.74]);
    const d = sub(tip, base);
    const u = norm(sub(d, mul(nRaw, dot(d, nRaw))));
    const v = cross(nRaw, u);
    const poly = [
      [0.00, -0.15], [0.32, -0.40], [0.78, -0.54], [1.24, -0.52], [1.58, -0.36], [1.78, -0.06],
      [1.76, 0.22], [1.46, 0.48], [1.02, 0.64], [0.54, 0.66], [0.16, 0.52], [0.00, 0.26],
    ].map(([a, b]) => [a * earK, b * earK]);
    m.fin({
      bone: 'ear' + S, group: 'ear' + S, part: 'ear' + S, tag: 'ear',
      o: base, u, v, poly,
      t: 0.10, round: 0.034, grad: [-0.026, -0.012], curve: [0, 0, 0, 0.16, 0, 0.30], k: 0.008,
    });
  }

  // ---------------------------------------------------------------- LEGS
  // Columns, not cones: from the elbow to the ground the radius barely changes (an elephant stands on
  // a straight pillar), and the pillar ends in a broad flat pad ringed with toenails.
  for (const S of ['L', 'R']) {
    const s = S === 'L' ? 1 : -1;
    const lat = [s, 0, 0];
    // fore
    const g = 'F' + S;
    const Sc = J['scapTop' + S], Sh = J['shoulder' + S], El = J['elbow' + S], W = J['wrist' + S], M = J['mcp' + S];
    ellY({ tag: 'scapmuscle', bone: 'scapula' + S, group: g, c: lerp(Sc, Sh, 0.45), ydir: sub(Sh, Sc), lateral: lat, r: [0.26, 0.46, 0.24], k: 0.12 });
    SP({ tag: 'shoulderpoint', bone: 'humerus' + S, group: g, c: Sh, rad: 0.24, k: 0.09 });
    C({ tag: 'upperarm', bone: 'humerus' + S, group: g, a: Sh, b: El, ra: 0.27, rb: 0.245, k: 0.09 });
    ellY({ tag: 'triceps', bone: 'humerus' + S, group: g, c: lerp(Sh, El, 0.55), ydir: sub(El, Sh), lateral: lat, r: [0.21, 0.30, 0.18], k: 0.09 });
    SP({ tag: 'elbow', bone: 'radius' + S, group: g, c: add(El, [0, 0.03, -0.08]), rad: 0.15, k: 0.05 });
    C({ tag: 'forearm', bone: 'radius' + S, group: g, a: El, b: W, ra: 0.24, rb: 0.205, k: 0.07 });
    ellY({ tag: 'forearmmuscle', bone: 'radius' + S, group: g, c: lerp(El, W, 0.32), ydir: sub(W, El), lateral: lat, r: [0.19, 0.28, 0.15], k: 0.07 });
    E({ tag: 'carpus', bone: 'metacarpus' + S, group: g, c: W, r: [0.20, 0.18, 0.19], axis: UP, up: FWD, k: 0.04 });
    C({ tag: 'cannon', bone: 'metacarpus' + S, group: g, a: W, b: M, ra: 0.195, rb: 0.20, k: 0.04 });
    sculptFoot(m, 'fpaw' + S, g, M[0], M[2], 0.25, 0.30, 5);
    // hind
    const h = 'H' + S;
    const Hp = J['hip' + S], K = J['knee' + S], Hk = J['hock' + S], Mt = J['mtp' + S];
    ellY({ tag: 'thigh', bone: 'femur' + S, group: h, c: lerp(Hp, K, 0.45), ydir: sub(K, Hp), lateral: lat, r: [0.26, 0.54, 0.34], k: 0.11 });
    C({ tag: 'thighfront', bone: 'femur' + S, group: h, a: [0.34 * s, 2.20, -0.92], b: add(K, [0, 0.06, 0.04]), ra: 0.22, rb: 0.17, k: 0.09 });
    C({ tag: 'shin', bone: 'tibia' + S, group: h, a: lerp(K, Hk, 0.08), b: Hk, ra: 0.22, rb: 0.19, k: 0.07 });
    ellY({ tag: 'gaskin', bone: 'tibia' + S, group: h, c: add(lerp(K, Hk, 0.34), [0, 0, -0.06]), ydir: sub(Hk, K), lateral: lat, r: [0.18, 0.28, 0.15], k: 0.07 });
    SP({ tag: 'calcaneus', bone: 'metatarsus' + S, group: h, c: add(Hk, [0, 0.08, -0.09]), rad: 0.11, k: 0.05 });
    E({ tag: 'hock', bone: 'metatarsus' + S, group: h, c: Hk, r: [0.19, 0.19, 0.19], axis: UP, up: FWD, k: 0.05 });
    C({ tag: 'cannon', bone: 'metatarsus' + S, group: h, a: Hk, b: Mt, ra: 0.19, rb: 0.20, k: 0.04 });
    sculptFoot(m, 'hpaw' + S, h, Mt[0], Mt[2], 0.25, 0.29, 4);
  }

  // ---------------------------------------------------------------- TAIL (bony rope + a tuft)
  for (let i = 0; i < BONE_SEGS; i++) {
    const t0 = i / BONE_SEGS, t1 = (i + 1) / BONE_SEGS;
    const r = (t) => 0.085 * (1 - 0.55 * t);
    C({ tag: 'tail', bone: 'tail' + i, a: J['tail' + i], b: J['tail' + (i + 1)], ra: r(t0), rb: r(t1), k: i === 0 ? 0.09 : 0.03 });
  }
  const tb = J['tail' + BONE_SEGS], tt = J['tail' + (BONE_SEGS + 1)];
  C({ tag: 'tuft', bone: 'tail' + BONE_SEGS, a: lerp(J['tail' + (BONE_SEGS - 1)], tb, 0.5), b: tt, ra: 0.055, rb: 0.075, k: 0.02 });
  C({ tag: 'tuft', bone: 'tail' + (BONE_SEGS + 1), a: tt, b: lerp(tt, J['tail' + (BONE_SEGS + 2)] ?? tt, 0.7), ra: 0.07, rb: 0.02, k: 0.02 });

  return m;
}

// A broad flat foot: a fat pad reaching the ground, a rounded front, and toenails set around the
// front of the pad — an elephant stands on a pad, not on a hoof and not on a tapering cone tip.
function sculptFoot(m, bone, group, cx, cz, rad, len, nails) {
  const c = [cx, 0.14, cz + 0.04];
  m.ell({ tag: 'foot', bone, group, c, r: [rad, 0.15, len], axis: [0, 0, 1], up: [0, 1, 0], k: 0.06 });
  m.ell({ tag: 'sole', bone, group, c: [cx, 0.05, c[2] + 0.03], r: [rad * 1.02, 0.06, len * 0.98], axis: [0, 0, 1], up: [0, 1, 0], k: 0.04 });
  for (let i = 0; i < nails; i++) {
    const a = ((i / (nails - 1)) * 2 - 1) * 0.78; // fan across the front of the pad
    m.ell({ tag: 'nail', bone, group, c: [cx + Math.sin(a) * rad * 0.86, 0.08, c[2] + Math.cos(a) * len * 0.86], r: [0.062, 0.055, 0.062], axis: [0, 0, 1], up: [0, 1, 0], k: 0.02 });
  }
}
