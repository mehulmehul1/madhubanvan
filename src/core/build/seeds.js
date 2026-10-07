// Tile-bombing seed build. See ~/.commandcode/plans/madhubani-bomb-tiles.md §3.
//
// Produces:
//   seedTex : Float32Array(nS * 5 * 4)          RGBA texels describing each seed
//   gridData: Float32Array(nx*ny*nz * 4)        up to 4 candidate seed ids per cell (-1 empty)
//   gridDims: [nx, ny, nz], gridOrigin: [ox,oy,oz], cell: C, tile: S, nS
import { rng } from '../math/vec.js';
import { vertexAnatomy } from './coatFields.js';

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// Nearest-segment frame on the axial polyline: arc length s and unit direction dir.
// dir points nose -> tail (rig.AXIAL.points runs nose first), so `dir` is the "toward tail" axis.
function axialFrame(rig, px, py, pz) {
  const P = (rig.AXIAL && rig.AXIAL.points) || [];
  let best = Infinity, bs = 0, dir = [1, 0, 0], acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
    const L2 = vx * vx + vy * vy + vz * vz || 1, L = Math.sqrt(L2);
    let t = ((px - a[0]) * vx + (py - a[1]) * vy + (pz - a[2]) * vz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - a[0] - vx * t, dy = py - a[1] - vy * t, dz = pz - a[2] - vz * t;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) { best = d; bs = acc + L * t; dir = [vx / L, vy / L, vz / L]; }
    acc += L;
  }
  return { s: bs, dir };
}

export function computeMadSeeds({ rig, weights, pos, nrm, nV, C, TILE, seed = 7 }) {
  const S = TILE;                 // drawn tile size (metres)
  const anat = vertexAnatomy({ rig, weights, nV });

  // ---- vertex grid for radius queries (cell = C) ------------------------------------------
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < nV; v++) for (let k = 0; k < 3; k++) {
    const x = pos[v * 3 + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x;
  }
  const gO = [mn[0] - C, mn[1] - C, mn[2] - C];
  const gN = [0, 1, 2].map((k) => Math.max(1, Math.floor((mx[k] - mn[k]) / C) + 3));
  const vcellKey = (x, y, z) => x + ',' + y + ',' + z;   // string key: exact, no collisions
  const vCells = new Map();
  for (let v = 0; v < nV; v++) {
    const cx = Math.floor((pos[v * 3] - gO[0]) / C), cy = Math.floor((pos[v * 3 + 1] - gO[1]) / C), cz = Math.floor((pos[v * 3 + 2] - gO[2]) / C);
    if (cx < 0 || cy < 0 || cz < 0 || cx >= gN[0] || cy >= gN[1] || cz >= gN[2]) continue;
    const k = vcellKey(cx, cy, cz); (vCells.get(k) || vCells.set(k, []).get(k)).push(v);
  }
  const vertsWithin = (x, y, z, R, fn) => {
    const r = Math.ceil(R / C);
    const bx = Math.floor((x - gO[0]) / C), by = Math.floor((y - gO[1]) / C), bz = Math.floor((z - gO[2]) / C);
    for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const arr = vCells.get(vcellKey(bx + dx, by + dy, bz + dz)); if (!arr) continue;
      for (const v of arr) fn(v);
    }
  };
  // nearest surface vertex to a point (keeps moved seeds on the surface)
  const nearestVertex = (x, y, z) => {
    let bd = Infinity, bi = -1;
    vertsWithin(x, y, z, C * 1.5, (v) => {
      const dx = pos[v * 3] - x, dy = pos[v * 3 + 1] - y, dz = pos[v * 3 + 2] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bd) { bd = d2; bi = v; }
    });
    return { i: bi, d: Math.sqrt(bd) };
  };

  // ---- farthest-point sampling: coverage radius <= FPS_THRESH (< the drawn scale radius) -----
  // FPS_THRESH must be well under the drawn scale radius (0.54 * TILE) or gaps appear between
  // scales; it must stay under the grid cell C for the 3x3x3 shader search to be valid.
  const FPS_THRESH = 0.60 * C;
  const dist2 = new Float64Array(nV).fill(Infinity);
  const seedPos = [];
  const rnd = rng((seed * 2654435761) >>> 0);
  let cur = (rnd() * nV) | 0;                         // deterministic start
  for (;;) {
    seedPos.push([pos[cur * 3], pos[cur * 3 + 1], pos[cur * 3 + 2]]);
    const sx = pos[cur * 3], sy = pos[cur * 3 + 1], sz = pos[cur * 3 + 2];
    vertsWithin(sx, sy, sz, FPS_THRESH * 1.25, (v) => {
      const dx = pos[v * 3] - sx, dy = pos[v * 3 + 1] - sy, dz = pos[v * 3 + 2] - sz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < dist2[v]) dist2[v] = d2;
    });
    let best = -1, bestD = 0;
    for (let v = 0; v < nV; v++) if (dist2[v] > bestD) { bestD = dist2[v]; best = v; }
    if (best < 0 || bestD <= FPS_THRESH * FPS_THRESH) break;
    cur = best;
    if (seedPos.length > 20000) break;                // safety cap
  }

  // ---- 2 Lloyd iterations to spread toward a hex-ish layout -------------------------------
  const seedGrid = new Map();                          // cell -> [seedIdx]
  const sCell = (p) => [Math.floor((p[0] - gO[0]) / C), Math.floor((p[1] - gO[1]) / C), Math.floor((p[2] - gO[2]) / C)];
  const rebuildSeedGrid = () => {
    seedGrid.clear();
    for (let i = 0; i < seedPos.length; i++) {
      const [cx, cy, cz] = sCell(seedPos[i]);
      const k = vcellKey(cx, cy, cz); (seedGrid.get(k) || seedGrid.set(k, []).get(k)).push(i);
    }
  };
  const nearestSeed = (x, y, z) => {
    const cx = Math.floor((x - gO[0]) / C), cy = Math.floor((y - gO[1]) / C), cz = Math.floor((z - gO[2]) / C);
    let bd = Infinity, bi = -1;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const arr = seedGrid.get(vcellKey(cx + dx, cy + dy, cz + dz)); if (!arr) continue;
      for (const i of arr) {
        const p = seedPos[i]; const ddx = p[0] - x, ddy = p[1] - y, ddz = p[2] - z;
        const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
        if (d2 < bd) { bd = d2; bi = i; }
      }
    }
    return { i: bi, d: Math.sqrt(bd) };
  };
  rebuildSeedGrid();
  for (let it = 0; it < 2; it++) {
    const sum = seedPos.map(() => [0, 0, 0, 0]);
    for (let v = 0; v < nV; v++) {
      const { i } = nearestSeed(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      if (i < 0) continue;
      sum[i][0] += pos[v * 3]; sum[i][1] += pos[v * 3 + 1]; sum[i][2] += pos[v * 3 + 2]; sum[i][3]++;
    }
    for (let i = 0; i < seedPos.length; i++) if (sum[i][3] > 0) seedPos[i] = [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]];
    for (let i = 0; i < seedPos.length; i++) {
      const [x, y, z] = seedPos[i]; const { i: iv } = nearestVertex(x, y, z);
      if (iv >= 0) seedPos[i] = [pos[iv * 3], pos[iv * 3 + 1], pos[iv * 3 + 2]];
    }
    rebuildSeedGrid();
  }

  // ---- coverage repair: guarantee every vertex is within FPS_THRESH of a seed ----------------
  for (let pass = 0; pass < 4; pass++) {
    let added = 0;
    for (let v = 0; v < nV; v++) {
      const { d } = nearestSeed(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      if (!(d <= FPS_THRESH)) { seedPos.push([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]); added++; }
    }
    if (added) rebuildSeedGrid(); else break;
  }

  // ---- frames + meta ----------------------------------------------------------------------
  const nS = seedPos.length;
  const seedTex = new Float32Array(nS * 5 * 4).fill(0);
  const rotRnd = rng((seed * 40503 + 12345) >>> 0);
  for (let i = 0; i < nS; i++) {
    const [x, y, z] = seedPos[i];
    const iv = nearestVertex(x, y, z).i;
    const dg = iv >= 0 ? anat.dg[iv] : 0;
    const N = iv >= 0 ? nrm3([nrm[iv * 3], nrm[iv * 3 + 1], nrm[iv * 3 + 2]]) : [0, 1, 0];
    const { s, dir } = axialFrame(rig, x, y, z);
    let T = sub3(dir, [N[0] * dot(dir, N), N[1] * dot(dir, N), N[2] * dot(dir, N)]);
    if (Math.hypot(T[0], T[1], T[2]) < 0.15) T = [0, 0, 1];   // degenerate: any perpendicular
    T = nrm3(sub3(T, [N[0] * dot(T, N), N[1] * dot(T, N), N[2] * dot(T, N)]));
    if (Math.hypot(T[0], T[1], T[2]) < 0.15) T = nrm3([1, 0, 0]);
    const B = nrm3(cross(N, T));
    const rot = (rotRnd() - 0.5) * 0.35;                      // +-10 deg hand-drawn variation
    const o = i * 5 * 4;
    seedTex[o + 0] = x; seedTex[o + 1] = y; seedTex[o + 2] = z; seedTex[o + 3] = dg;
    seedTex[o + 4] = N[0]; seedTex[o + 5] = N[1]; seedTex[o + 6] = N[2]; seedTex[o + 7] = S;
    seedTex[o + 8] = T[0]; seedTex[o + 9] = T[1]; seedTex[o + 10] = T[2]; seedTex[o + 11] = s;
    seedTex[o + 12] = B[0]; seedTex[o + 13] = B[1]; seedTex[o + 14] = B[2]; seedTex[o + 15] = 0;
    seedTex[o + 16] = Math.cos(rot); seedTex[o + 17] = Math.sin(rot); seedTex[o + 18] = 0; seedTex[o + 19] = 0;
  }

  // ---- candidate grid ---------------------------------------------------------------------
  const gridData = new Float32Array(gN[0] * gN[1] * gN[2] * 4).fill(-1);
  const perCell = new Map();  // cellIndex -> [seedIdx]
  for (let i = 0; i < nS; i++) {
    const [cx, cy, cz] = sCell(seedPos[i]);
    if (cx < 0 || cy < 0 || cz < 0 || cx >= gN[0] || cy >= gN[1] || cz >= gN[2]) continue;
    const c = cx + cy * gN[0] + cz * gN[0] * gN[1];
    (perCell.get(c) || perCell.set(c, []).get(c)).push(i);
  }
  for (const [c, list] of perCell) {
    const ccx = gO[0] + ((c % gN[0]) + 0.5) * C;
    const ccy = gO[1] + ((Math.floor(c / gN[0]) % gN[1]) + 0.5) * C;
    const ccz = gO[2] + ((Math.floor(c / (gN[0] * gN[1]))) + 0.5) * C;
    list.sort((a, b) => {
      const pa = seedPos[a], pb = seedPos[b];
      const da = (pa[0] - ccx) ** 2 + (pa[1] - ccy) ** 2 + (pa[2] - ccz) ** 2;
      const db = (pb[0] - ccx) ** 2 + (pb[1] - ccy) ** 2 + (pb[2] - ccz) ** 2;
      return da - db;
    });
    for (let k = 0; k < Math.min(4, list.length); k++) gridData[c * 4 + k] = list[k];
  }

  return { seedTex, nS, gridData, gridDims: gN, gridOrigin: gO, cell: C, tile: S };
}
