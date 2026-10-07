// The build-time coat contract the Madhubani mode reads (see the plan §4).
//
// Derived from the weights the pipeline already computes (dominant bone, axialS, segT) plus the
// rig's per-bone `region`/`group` metadata, so it is body-plan agnostic: every plan tags its bones
// with region ('torso' | 'neck' | 'head' | 'jaw' | 'ear' | 'limb' | 'foot' | 'tail' | plan-specific)
// and group ('axial' | 'F{L,R}' | 'H{L,R}' | ...).
//
// Packed per vertex into two vec4s:
//   aMad1 = [ island, designGroup, axisMode, spineT ]
//   aMad2 = [ radial, lateral, along, radius ]
//
// `along`, `lateral` and `radius` are in METRES, measured by projecting the vertex onto the
// body-part's own chain (spine/tail, a limb, or a fin/wing appendage). The shader tiles in those
// metres so tiles are arc-length square everywhere — they wrap the body instead of smearing like a
// planar world-space projection would. Tubular parts tile across by radial*2*PI*radius (arc around
// the limb); flat parts (fins/wings) tile across by `lateral`.
import { axialLengths } from './weights.js';

// island ids (kept close to the POC's madIslOf table so the style zone maps port over)
export const ISL = {
  torso: 0, chest: 1, neck: 2, head: 3, jaw: 4, ear: 5,
  foreUpper: 6, foreLower: 7, forePaw: 8, hindUpper: 9, hindLower: 10, hindPaw: 11,
  tail: 12, wing: 13, fin: 14, other: 15,
};

// island -> design group (neighbouring masses share one fill + motif roll, like the POC)
export function designGroupOf(island) {
  if (island <= ISL.chest) return 0;              // trunk
  if (island === ISL.neck) return 1;
  if (island === ISL.head || island === ISL.jaw || island === ISL.ear) return 2;
  if (island === ISL.foreUpper || island === ISL.foreLower || island === ISL.hindUpper || island === ISL.hindLower) return 3;
  if (island === ISL.forePaw || island === ISL.hindPaw) return 4;
  if (island === ISL.tail) return 5;
  if (island === ISL.wing) return 6;
  if (island === ISL.fin) return 7;
  return 5;
}

function islandOfBone(bone) {
  const r = bone.region, g = bone.group || '', n = bone.name;
  switch (r) {
    case 'torso': return n === 'chest' ? ISL.chest : ISL.torso;
    case 'neck': return ISL.neck;
    case 'head': return ISL.head;
    case 'jaw': case 'muzzle': return ISL.jaw;
    case 'ear': case 'horn': return ISL.ear;
    case 'tail': return ISL.tail;
    case 'wing': return ISL.wing;
    case 'fin': return ISL.fin;
    case 'foot': return g[0] === 'H' ? ISL.hindPaw : ISL.forePaw;
    case 'limb': {
      const fore = g[0] !== 'H';
      // upper vs lower from the bone name (falls back to upper for unknown plans)
      const lower = /^(radius|metacarpus|ulna|tibia|metatarsus|fibula|antebrachium)/.test(n) ||
        /(radius|tibia|metatarsus|metacarpus|lower)/.test(n);
      if (fore) return lower ? ISL.foreLower : ISL.foreUpper;
      return lower ? ISL.hindLower : ISL.hindUpper;
    }
    default: return ISL.other;
  }
}

// Per-vertex anatomy, shared by the coat fields and the seed builder.
export function vertexAnatomy({ rig, weights, nV }) {
  const island = new Int32Array(nV), dg = new Int32Array(nV), am = new Int32Array(nV);
  for (let v = 0; v < nV; v++) {
    const bone = rig.BONES[weights.dominant[v]] || rig.BONES[0];
    island[v] = islandOfBone(bone);
    dg[v] = designGroupOf(island[v]);
    am[v] = axisModeOf(island[v]);
  }
  return { island, dg, am };
}

export function axisModeOf(island) {
  if (island >= ISL.foreUpper && island <= ISL.hindPaw) return 1; // down the leg
  if (island === ISL.tail) return 2;                              // tail diagonal
  if (island === ISL.wing) return 3;                              // wing span
  if (island === ISL.fin) return 4;                               // body axis
  return 0;                                                       // along the spine
}

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function makeChain(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist3(pts[i - 1], pts[i]));
  return { pts, cum, len: cum[cum.length - 1] || 1 };
}

// nearest point on a polyline -> arc length along it, distance from it, angle around it, and which
// segment was nearest (used to group vertices into rings for the around-the-body arc accumulation)
function projectChain(ch, px, py, pz) {
  let bd = Infinity, bs = 0, bq = [0, 0, 0], be = [0, 0, 1], bsi = 0;
  const P = ch.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const a0 = P[i], a1 = P[i + 1];
    const vx = a1[0] - a0[0], vy = a1[1] - a0[1], vz = a1[2] - a0[2];
    const L2 = vx * vx + vy * vy + vz * vz || 1;
    let t = ((px - a0[0]) * vx + (py - a0[1]) * vy + (pz - a0[2]) * vz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = a0[0] + vx * t, cy = a0[1] + vy * t, cz = a0[2] + vz * t;
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bd) { bd = d2; bs = ch.cum[i] + Math.sqrt(L2) * t; bq = [cx, cy, cz]; be = [vx, vy, vz]; bsi = i; }
  }
  const dl = Math.hypot(be[0], be[1], be[2]) || 1;
  const ux = be[0] / dl, uy = be[1] / dl, uz = be[2] / dl;
  let lx = 1 - ux * ux, ly = -uy * ux, lz = -uz * ux;
  const ll = Math.hypot(lx, ly, lz) || 1; lx /= ll; ly /= ll; lz /= ll;
  const wx = uy * lz - uz * ly, wy = uz * lx - ux * lz, wz = ux * ly - uy * lx;
  const dx = px - bq[0], dy = py - bq[1], dz = pz - bq[2];
  const alongAxis = dx * lx + dy * ly + dz * lz;
  return {
    s: bs,
    r: Math.sqrt(bd),
    lat: alongAxis,
    si: bsi,
    ang: Math.atan2(dx * wx + dy * wy + dz * wz, alongAxis) / (2 * Math.PI) + 0.5,
  };
}

/**
 * @param {object} args { rig, weights, pos, nV }
 * @returns {{ aMad1: Float32Array, aMad2: Float32Array }}
 */
export function computeCoatFields({ rig, weights, pos, nV }) {
  const aMad1 = new Float32Array(nV * 4);
  const aMad2 = new Float32Array(nV * 4);
  const AXL = weights.axialLengths;
  const total = AXL[AXL.length - 1] || 1;
  const tailStart = rig.AXIAL && rig.AXIAL.bones.indexOf('tail0') >= 0
    ? AXL[rig.AXIAL.bones.indexOf('tail0')] : 0;
  const tailEnd = total;

  // body chains: the axial polyline, plus one polyline per limb built from its bones' joints
  const axialChain = rig.AXIAL && rig.AXIAL.points && rig.AXIAL.points.length >= 2 ? makeChain(rig.AXIAL.points) : null;
  const byName = new Map(rig.BONES.map((b) => [b.name, b]));
  const chainOfNames = (names) => {
    const pts = [];
    for (const n of names) { const b = byName.get(n); if (b) pts.push(b.head); }
    const last = byName.get(names[names.length - 1]);
    if (last) pts.push(last.tail);
    return pts.length >= 2 ? makeChain(pts) : null;
  };
  const limbIds = Object.keys(rig.LIMBS || {});
  const limbChains = limbIds.map((id) => chainOfNames((rig.LIMBS[id] && rig.LIMBS[id].bones) || []));
  const appendageChains = (rig.appendages || []).map((ap) => chainOfNames([ap.bone])).filter(Boolean);

  // ---- pass 1: project every vertex onto its part's chain ------------------------------------
  const islandA = new Int32Array(nV), dgA = new Int32Array(nV), amA = new Int32Array(nV);
  const partA = new Int32Array(nV), segA = new Int32Array(nV);
  const angA = new Float32Array(nV), alongA = new Float32Array(nV), latA = new Float32Array(nV), radA = new Float32Array(nV);

  const anat = vertexAnatomy({ rig, weights, nV });
  islandA.set(anat.island); dgA.set(anat.dg); amA.set(anat.am);
  for (let v = 0; v < nV; v++) {
    const px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
    const li = weights.limbWhich ? weights.limbWhich[v] : -1;
    const isLimb = islandA[v] >= ISL.foreUpper && islandA[v] <= ISL.hindPaw;
    let pr = null, part = 0;
    if (isLimb && limbChains.length) {
      // A limb/paw vertex MUST use its limb's chain. The spine fallback gave a "radius" of ~0.15 m
      // instead of the leg's ~0.03 m and the cells smeared.
      if (li >= 0 && limbChains[li]) { pr = projectChain(limbChains[li], px, py, pz); part = 1 + li; }
      else { let bd = Infinity; for (let k = 0; k < limbChains.length; k++) { const ch = limbChains[k]; if (!ch) continue; const q = projectChain(ch, px, py, pz); if (q.r < bd) { bd = q.r; pr = q; part = 1 + k; } } }
    } else if (amA[v] >= 3 && appendageChains.length) {
      let bd = Infinity; for (let k = 0; k < appendageChains.length; k++) { const q = projectChain(appendageChains[k], px, py, pz); if (q.r < bd) { bd = q.r; pr = q; part = 100 + k; } }
    }
    if (!pr && axialChain) { pr = projectChain(axialChain, px, py, pz); part = 0; }
    if (pr) {
      alongA[v] = pr.s; angA[v] = pr.ang; latA[v] = pr.lat; radA[v] = pr.r;
      segA[v] = pr.si; partA[v] = part;
    }
  }

  // ---- pass 2: smooth the radius per (part, segment) -----------------------------------------
  // The across coordinate is `angle * 2*PI * radius`. Using each vertex's own distance to the axis
  // smeared the tiles on an elliptical torso (the flanks are nearer the spine than the belly), so we
  // use the segment's mean radius instead: smooth, uniform in angle, no ring-detection artefacts.
  const sumR = new Map(), cntR = new Map();
  for (let v = 0; v < nV; v++) {
    const k = partA[v] * 1000 + segA[v];
    sumR.set(k, (sumR.get(k) || 0) + radA[v]);
    cntR.set(k, (cntR.get(k) || 0) + 1);
  }
  const meanR = new Float32Array(nV);
  for (let v = 0; v < nV; v++) {
    const k = partA[v] * 1000 + segA[v];
    meanR[v] = (sumR.get(k) || 0) / Math.max(1, cntR.get(k) || 1);
  }

  // ---- write ---------------------------------------------------------------------------------
  for (let v = 0; v < nV; v++) {
    const o = v * 4;
    aMad1[o] = islandA[v];
    aMad1[o + 1] = dgA[v];
    aMad1[o + 2] = amA[v];
    aMad1[o + 3] = weights.axialS[v] / total;
    aMad2[o] = angA[v];       // 0..1 angle around the part
    aMad2[o + 1] = latA[v];   // lateral offset (metres) — flat parts (fins/wings) tile across by this
    aMad2[o + 2] = alongA[v]; // arc length along the part's chain (metres)
    aMad2[o + 3] = meanR[v];  // smoothed local radius (metres)
  }
  return { aMad1, aMad2 };
}
