// Madhubani coat colour (TSL) — tile-field model.
//
// Replaces the old "ground + sparse motif" approach. The surface is a CONTINUOUS FIELD of tiles
// (scallop / stitch / hatch / dots / stripe / plain); each body zone (designGroup, baked at build
// time) picks its own tile and colour slot, colours cycle per tile row, and a bold ink seam is drawn
// where zones meet. Multi-colour by design: 2-4 palette fills, varied per seed.
//
// Reads the build-time contract aMad1 = [island, designGroup, axisMode, spineT], aMad2 = [radial, tailT].
import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, uniform, select, vec2, vec3, vec4, float, int, mix, smoothstep, clamp, abs, floor, fract,
  step, dot, normalize, length, max, min, hash, fwidth, cameraPosition, texture, attribute, mod,
} from 'three/tsl';
import { PALETTES, STYLES, MAD_SEED_TEXELS } from './params.js';
import { STYLE_ZONES } from './zones.js';
import { makeStyleTiles } from './fields.js';

const srgbLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lin = (hex) => new THREE.Color(srgbLin(((hex >> 16) & 255) / 255), srgbLin(((hex >> 8) & 255) / 255), srgbLin((hex & 255) / 255));
const v4 = (a, b, c, d) => new THREE.Vector4(a, b, c, d);

export function createMadhubani(opts = {}) {
  const uInk = uniform(new THREE.Color(0, 0, 0));
  const uPaper = uniform(new THREE.Color(0, 0, 0));
  const uF0 = uniform(new THREE.Color(0, 0, 0));
  const uF1 = uniform(new THREE.Color(0, 0, 0));
  const uF2 = uniform(new THREE.Color(0, 0, 0));
  const uF3 = uniform(new THREE.Color(0, 0, 0));
  const uBead = uniform(new THREE.Color(0, 0, 0));
  // tiles, hatch, outline, wobble, base colour count, seed
  const uP = uniform(v4(0.085, 0.072, 3, 0.10));
  const uP2 = uniform(v4(0.03, 3, 0.5, 0)); // wobble, base colours, rim stroke scale
  // Layer base offset into the stacked all-style motif array. Every style's 12 motifs occupy a
  // contiguous 12-layer block, so switching style is this one integer — no material rebuild, no
  // texture rebind. Declared BEFORE setStyle(), which assigns it.
  const uAtlasOffset = uniform(0, 'int');
  // Metres per motif repeat, in BODY SPACE. Both pattern axes are arc lengths in metres, so this one
  // number sets the motif scale for the whole animal with no distortion anywhere. ~6 cm puts roughly
  // 25 repeats along a 1.5 m body: fine enough to read as woven texture at a distance (which is how
  // the references look) while still resolving into individual motifs on approach, thanks to mips.
  const uMotifM = uniform(0.06);
  // Zone size, in units of the baked Voronoi cell. The cell is ~0.085 m, so one authored motif at
  // 1:1 lands at ~0.85 px strokes on a 1.5 m animal — sub-pixel, which reads as grey noise. Growing
  // the CELLS (not the motif) fixes it: a zone then spans several cells, so a motif tiles a few
  // times INSIDE a zone panel and reads as a continuous field of drawing rather than as one cropped
  // blob per cell. Grid dims shrink by the same factor so world coverage is unchanged.
  const zoneScale = opts.zoneScale ?? 1.0;
  // How many Voronoi cells one motif repeat spans. The cell is ~0.085 m, so at 1 a motif's strokes
  // land near 0.85 px on a 1.5 m animal — sub-pixel, which reads as grey noise. At 3 the strokes are
  // ~2.6 px and the drawing is legible. Growing cells instead of the motif was tried and is worse:
  // it flattens each zone into a single colour patch.
  const motifScale = Math.max(0.25, opts.motifScale ?? 3.0);
  // Baked SVG motifs for `bomb` mode (see atlas.js). When present this REPLACES the SDF tiles: one
  // layer per motif, so all 12 authored motifs per style become reachable. Left null the SDF path
  // still runs, which is why a missing bake degrades instead of breaking the coat.
  const atlasTex = opts.atlas?.texture ?? null;
  const atlasOffsets = opts.atlas?.offsets ?? {};
  const uZT = uniform(v4(0, 0, 0, 0));   // zone tile ids 0-3
  const uZT2 = uniform(v4(0, 0, 0, 0));  // zone tile ids 4-7
  const uZS = uniform(v4(0, 0, 0, 0));   // zone colour slots 0-3
  const uZS2 = uniform(v4(0, 0, 0, 0));  // zone colour slots 4-7
  const uDbg = uniform(v4(0, 0, 0, 0));
  const uSunDir = uniform(new THREE.Vector3(0.39, 0.78, 0.49).normalize());
  const uSeed = uniform((opts.seed ?? 7) >>> 0);

  // ---- tile-bombing (Option A) ------------------------------------------------------------
  const grid = opts.grid || null;
  const mode = (opts.tiles === 'chain' || !grid) ? 'chain' : 'bomb';
  const seedTex = mode === 'bomb' ? grid.seedTex : null;
  const gridTex = mode === 'bomb' ? grid.gridTex : null;
  const uGrid = uniform(new THREE.Vector4(0.07, 0, 0, 0));  // cell, ox, oy, oz
  const uGridDim = uniform(new THREE.Vector4(1, 1, 1, 1));  // nx, ny, nz, nS
  const uGridWH = uniform(new THREE.Vector2(1, 1));          // packed grid texture width/height
  const uSeedWH = uniform(new THREE.Vector2(1, 1));          // packed seed texture width/height
  const uTile = uniform(0.084);                             // drawn tile size S (metres)
  const restN = attribute('normal', 'vec3');                 // bind normal (seed side test)

  function setPalette(i) {
    const p = PALETTES[((i | 0) % PALETTES.length + PALETTES.length) % PALETTES.length];
    uInk.value.copy(lin(p.ink)); uPaper.value.copy(lin(p.paper));
    uF0.value.copy(lin(p.f[0])); uF1.value.copy(lin(p.f[1])); uF2.value.copy(lin(p.f[2])); uF3.value.copy(lin(p.f[3]));
    uBead.value.copy(lin(p.bead));
  }
  function setStyle(key) {
    const s = STYLES[key] || STYLES.scallop;
    const z = STYLE_ZONES[key] || STYLE_ZONES.scallop;
    uP.value.set(s.tileH, s.tileW, s.hatch, s.outline);
    uP2.value.set(s.wobble, s.colours, s.rim ?? 0.5, 0);
    uZT.value.set(z.tiles[0], z.tiles[1], z.tiles[2], z.tiles[3]);
    uZT2.value.set(z.tiles[4], z.tiles[5], z.tiles[6], z.tiles[7]);
    uZS.value.set(z.slots[0], z.slots[1], z.slots[2], z.slots[3]);
    uZS2.value.set(z.slots[4], z.slots[5], z.slots[6], z.slots[7]);
    uAtlasOffset.value = atlasOffsets[key] ?? 0;
  }
  function setSeed(s) { uSeed.value = s >>> 0; }
  function setDebug(v) { uDbg.value.x = typeof v === 'number' ? v : (v ? 1 : 0); }
  // the toon bands follow the scene's key light (direction toward the light, in the mesh's space)
  function setSun(v) { uSunDir.value.copy(v).normalize(); }

  setPalette(opts.palette ?? 0);
  setStyle(opts.styleKey ?? 'scallop');
  setSeed(opts.seed ?? 7);
  if (mode === 'bomb') {
    const zs = Math.max(0.5, zoneScale);
    uGrid.value.set(grid.cell * zs, grid.origin[0], grid.origin[1], grid.origin[2]);
    uGridDim.value.set(
      Math.max(1, Math.ceil(grid.dims[0] / zs)),
      Math.max(1, Math.ceil(grid.dims[1] / zs)),
      Math.max(1, Math.ceil(grid.dims[2] / zs)),
      grid.nS,
    );
    uGridWH.value.set(grid.gridW, grid.gridH);
    uSeedWH.value.set(grid.seedW, grid.seedH);
    uTile.value = grid.tile * zs;
  }

  const n2 = Fn(([p]) => {
    const i = floor(p);
    const fr = fract(p);
    const w = fr.mul(fr).mul(float(3.0).sub(fr.mul(2.0)));
    return mix(mix(hash(i), hash(i.add(vec2(1, 0))), w.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), w.x), w.y);
  });
  // line work: thin ink rims, with only a small screen-space floor so they stay visible when the
  // surface is seen at a steep angle — a large floor made every outline read as a fat black band.
  const ln = Fn(([x, w, aa]) => {
    const grad = max(fwidth(x), float(1e-6));
    const ws = max(w.mul(uP2.z), grad.mul(0.5));
    const a = max(ws.mul(0.5), grad.mul(0.35));
    return float(1.0).sub(smoothstep(ws.sub(a), ws.add(a), abs(x)));
  });

  const seedFetch = (id, k) => {
    const t = id.mul(MAD_SEED_TEXELS).add(float(k));
    return texture(seedTex, vec2(mod(t, uSeedWH.x).add(0.5).div(uSeedWH.x), floor(t.div(uSeedWH.x)).add(0.5).div(uSeedWH.y)));
  };
  const gridFetch = (c) => {
    const gx = mod(c, uGridWH.x), gy = floor(c.div(uGridWH.x));
    return texture(gridTex, vec2(gx.add(0.5).div(uGridWH.x), gy.add(0.5).div(uGridWH.y)));
  };

  // nearest + 2nd nearest seed, with a same-side normal test
  const nearestSeeds = (p, nRest) => {
    const bp = p.sub(vec3(uGrid.y, uGrid.z, uGrid.w)).div(uGrid.x);
    const base = floor(bp);
    const d1 = float(1e9).toVar(), d2 = float(1e9).toVar();
    const id1 = float(-1).toVar(), id2 = float(-1).toVar();
    const consider = (id) => {
      If(id.greaterThanEqual(0), () => {
        If(dot(seedFetch(id, 1).xyz, nRest).greaterThan(0.25), () => {
          const d = p.sub(seedFetch(id, 0).xyz).length();
          If(d.lessThan(d1), () => { d2.assign(d1); id2.assign(id1); d1.assign(d); id1.assign(id); })
            .ElseIf(d.lessThan(d2), () => { d2.assign(d); id2.assign(id); });
        });
      });
    };
    Loop(27, ({ i }) => {
      const fi = float(i);
      const ix = mod(fi, 3.0).sub(1.0);
      const iy = mod(floor(fi.div(3.0)), 3.0).sub(1.0);
      const iz = floor(fi.div(9.0));
      const cx = base.x.add(ix), cy = base.y.add(iy), cz = base.z.add(iz);
      const inb = cx.greaterThanEqual(0).and(cy.greaterThanEqual(0)).and(cz.greaterThanEqual(0))
        .and(cx.lessThan(uGridDim.x)).and(cy.lessThan(uGridDim.y)).and(cz.lessThan(uGridDim.z));
      If(inb, () => {
        const cell = cx.add(cy.mul(uGridDim.x)).add(cz.mul(uGridDim.x.mul(uGridDim.y)));
        const g = gridFetch(cell);
        consider(g.x); consider(g.y); consider(g.z); consider(g.w);
      });
    });
    return { d1, id1, d2, id2, base };
  };
  const fieldTiles = makeStyleTiles({ ln, style: opts.styleKey ?? 'scallop' });
  const pick = (i) => select(i.lessThan(0.5), uF0,
    select(i.lessThan(1.5), uF1,
      select(i.lessThan(2.5), uF2,
        select(i.lessThan(3.5), uF3, uPaper))));

  const color = Fn(([rest, mad1, mad2, pIn, nIn]) => {
    const seed = uSeed;

    // colour count varies 2..4 around the style's target, per seed
    const ccount = clamp(uP2.y.add(floor(hash(vec2(seed, 3.3)).mul(3.0)).sub(1.0)), float(2.0), float(4.0));
    const ns = (mode === 'bomb') ? nearestSeeds(rest, normalize(restN)) : null;
    let col;
    if (mode === 'chain') {
      const dg = mad1.y;
      const am = mad1.z;

      // pattern space: `mad2.z` is arc length along the part's chain (rows wrap, uniform). Across,
      // tubular parts use angle * 2*PI * the segment's MEAN radius (a smoothed, artifact-free
      // approximation of arc length around — using each vertex's own radius smeared on an elliptical
      // torso, and a mesh-accumulated unwrap was worse because ring detection doesn't match the mesh).
      // Flat parts (fins / wings) tile across by the lateral offset `mad2.y`.
      const pu = mad2.z;
      const pv = select(am.lessThan(2.5), mad2.x.mul(6.2831853).mul(max(mad2.w, float(0.004))), mad2.y);

      // continuous wobble (no floor(): a stepped seed jumps as the pattern crosses tile borders)
      const wob = n2(vec2(pv.mul(6.0), pu.mul(6.0))).sub(0.5).mul(uP2.x);
      const vv = pu.add(wob);
      const uu = pv.add(wob.mul(0.5));

      // zone -> tile + colour slot
      const tileId = select(dg.lessThan(0.5), uZT.x, select(dg.lessThan(1.5), uZT.y, select(dg.lessThan(2.5), uZT.z, select(dg.lessThan(3.5), uZT.w, select(dg.lessThan(4.5), uZT2.x, select(dg.lessThan(5.5), uZT2.y, select(dg.lessThan(6.5), uZT2.z, uZT2.w)))))));
      const slot = select(dg.lessThan(0.5), uZS.x, select(dg.lessThan(1.5), uZS.y, select(dg.lessThan(2.5), uZS.z, select(dg.lessThan(3.5), uZS.w, select(dg.lessThan(4.5), uZS2.x, select(dg.lessThan(5.5), uZS2.y, select(dg.lessThan(6.5), uZS2.z, uZS2.w)))))));
      // ── Authored SVG motifs, painted in BODY SPACE ────────────────────────────────────────────
      // `uu` is arc length AROUND the part, `vv` is arc length ALONG it — both in METRES. That is the
      // whole point: a square motif stays square and uniform-scale everywhere, orientation runs
      // continuously across the entire surface, rows compress where the body curves away, and the
      // zone comes from the baked anatomical designGroup. Sampled in a per-seed tangent plane
      // instead, orientation is discontinuous at every cell boundary — which is what produced the
      // blobby Voronoi look this replaces.
      if (atlasTex) {
        const m = texture(atlasTex, vec2(uu.div(uMotifM), vv.div(uMotifM)))
          .depth(int(tileId).add(uAtlasOffset));
        // colour bands step per motif row, as in the references where each row shifts tone
        const band = floor(vv.div(uMotifM)).mod(2.0);
        const iA = slot.add(band).mod(ccount);
        col = pick(slot.add(2.0).mod(ccount));                    // ground
        col = mix(col, pick(iA.add(1.0).mod(ccount)), m.b);        // fill B under fill A
        col = mix(col, pick(iA), m.g);                             // fill A
        col = mix(col, uBead, m.a);                                // beads sit above the fills
        col = mix(col, uInk, m.r);                                 // ink outline last
      } else {
        const row = fieldTiles(uu, vv, uP.x, uP.y, tileId, uP.z);
        const fillIdx = slot.add(row.w).mod(ccount);
        col = pick(slot.add(2.0).mod(ccount));
        col = mix(col, pick(fillIdx), row.x);
        col = mix(col, uInk, row.y);
        col = mix(col, uBead, row.z);
      }

      // bold seam where the zone changes (fwidth spikes on the interpolated designGroup)
      const seam = clamp(fwidth(dg), float(0.0), float(1.0)).mul(uP.w.mul(4.0));
      col = mix(col, uInk, min(seam, 1.0));
    } else {
      const id1 = ns.id1, id2 = ns.id2;
      const A = seedFetch(id1, 0), T = seedFetch(id1, 2), B = seedFetch(id1, 3), R = seedFetch(id1, 4);
      const rel = rest.sub(A.xyz);
      const u0 = dot(rel, T.xyz), v0 = dot(rel, B.xyz);
      const u = u0.mul(R.x).sub(v0.mul(R.y));
      const v = u0.mul(R.y).add(v0.mul(R.x));
      const dg = A.w;
      const tileId = select(dg.lessThan(0.5), uZT.x, select(dg.lessThan(1.5), uZT.y, select(dg.lessThan(2.5), uZT.z, select(dg.lessThan(3.5), uZT.w, select(dg.lessThan(4.5), uZT2.x, select(dg.lessThan(5.5), uZT2.y, select(dg.lessThan(6.5), uZT2.z, uZT2.w)))))));
      const slot = select(dg.lessThan(0.5), uZS.x, select(dg.lessThan(1.5), uZS.y, select(dg.lessThan(2.5), uZS.z, select(dg.lessThan(3.5), uZS.w, select(dg.lessThan(4.5), uZS2.x, select(dg.lessThan(5.5), uZS2.y, select(dg.lessThan(6.5), uZS2.z, uZS2.w)))))));
      const row = floor(T.w.div(uTile));
      const fillIdx = slot.add(row).mod(ccount);
      const ground = pick(slot.add(2.0).mod(ccount));
      if (atlasTex) {
        // AUTHORED SVG motifs, baked to a role mask: R=ink G=fillA B=fillB A=bead, ground = none.
        // One motif per layer, picked by the zone's tile id, tiled across the seed's tangent plane.
        // The UV is deliberately NOT fract()'d: mip level is chosen from screen-space derivatives,
        // and fract introduces a hard seam that destroys them, which shows up as a mip-level "step"
        // ring around every motif. RepeatWrapping tiles it correctly instead.
        const msize = uTile.mul(motifScale);
        const m = texture(atlasTex, vec2(u.div(msize).add(0.5), v.div(msize).add(0.5)))
          .depth(int(tileId).add(uAtlasOffset));
        // painter order: ground -> fill B -> fill A -> bead -> ink, so ink always outlines on top
        col = ground;
        col = mix(col, pick(fillIdx.add(1.0).mod(ccount)), m.b);
        col = mix(col, pick(fillIdx), m.g);
        col = mix(col, uBead, m.a);
        col = mix(col, uInk, m.r);
      } else {
        // SDF fallback (fields.js, 4 tiles per style) for when no atlas has been baked.
        const t = fieldTiles(u.add(uTile.mul(0.5)), v.add(uTile.mul(0.06)), uTile, uTile, tileId, uP.z);
        col = ground;
        col = mix(col, pick(fillIdx), t.x);
        col = mix(col, uInk, t.y);
        col = mix(col, uBead, t.z);
      }

      // NOTE: no Voronoi outline. The cell boundary is invisible scaffolding; the scale rim comes
      // from the motif's own arc (which sits inside the cell), so you see shingled scales, not a
      // polygon mosaic.

      // a bolder ink line where two DIFFERENT zones meet
      const dg2 = seedFetch(id2, 0).w;
      const nearB = smoothstep(float(0.030), float(0.0), abs(ns.d1.sub(ns.d2)));
      const diff = step(float(0.5), abs(dg.sub(dg2)));
      col = mix(col, uInk, nearB.mul(diff));
    }

    // pigment grain kept LOW frequency: a high-frequency noise (was 52/m) aliases to shimmer
    const grain = float(0.97).add(n2(rest.xy.mul(14.0).add(rest.z.mul(9.0))).mul(0.05));
    col = col.mul(grain);

    // toon (cel) shading: the FLAT pattern multiplied by 3 hard light bands. Marks stay 2D
    // graphic elements; the volume is read from the bands. No specular, no sheen, no crushed blacks.
    const N = normalize(nIn);
    const V = normalize(cameraPosition.sub(pIn));
    const lam = dot(N, normalize(uSunDir));
    const aa = max(fwidth(lam), float(0.004));            // anti-alias the band edges
    const s1 = smoothstep(aa.negate(), aa, lam);          // terminator: shadow -> mid
    const s2 = smoothstep(aa.negate(), aa, lam.sub(0.45)); // mid -> light
    let band = mix(float(0.64), float(0.84), s1);
    band = mix(band, float(1.03), s2);
    col = col.mul(band);

    // ink contour: a THIN silhouette line only. A wide threshold (ow ~0.10) turned every steeply
    // angled surface into a black band, and the paper rim into a white one — the "sheen" that
    // killed the print when the animal moved. Keep it narrow.
    const ndv = abs(dot(N, V));
    const ow = uP.w.mul(0.28);
    const o1 = float(1.0).sub(smoothstep(ow, ow.mul(1.7), ndv));
    col = mix(col, uInk, clamp(o1, 0.0, 1.0).mul(0.9));

    if (mode === 'bomb') {
      const dbgId = hash(vec2(ns.id1, 3.7));
      const bc = ns.base;
      const dbgCell = hash(vec2(bc.x.add(bc.y.mul(uGridDim.x)).add(bc.z.mul(uGridDim.x.mul(uGridDim.y))), 1.3));
      const dbg = select(uDbg.x.lessThan(1.5), vec3(0.0),
        select(uDbg.x.lessThan(2.5), vec3(dbgId, dbgId.mul(0.6), dbgId.mul(0.3)),
          vec3(dbgCell, dbgCell.mul(0.5), float(1.0).sub(dbgCell))));
      col = select(uDbg.x.greaterThan(0.5), dbg, col);
    }
    return col;
  });

  return { uniforms: { uInk, uPaper, uBead, uSunDir, uP, uP2 }, color, setPalette, setStyle, setSeed, setDebug, setSun };
}
