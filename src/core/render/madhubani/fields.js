// Per-STYLE tile libraries for the Madhubani model (TSL).
//
// Each style owns its own four tiles — they are NOT shared between styles. That is the whole point:
// bharni fills figures, katchni fills with line work, godna uses tattoo marks, tantrik uses yantra
// geometry, kohbar uses nuptial symbols, scallop uses scales. An earlier cut reused six generic
// primitives across every style, which made them all read the same.
//
// A tile fn takes a context and returns { fill, rim, dot } coverage in 0..1:
//   fill  the zone FILL colour (row-cycled by the caller)
//   rim   the ink outline
//   dot   the bead accent
import { Fn, float, vec2, vec4, select, step, fract, floor, abs, length, max, min, atan, sin } from 'three/tsl';

export function makeStyleTiles({ ln, style }) {
  // ---- scallop : the reference scale field ------------------------------------------------------
  const scallop = [
    (x) => { // 0 overlapping scale + centre dot
      const d = length(vec2(x.tu.sub(0.5), x.tv.sub(0.06)));
      return { fill: step(d, 0.54), rim: ln(d.sub(0.54), 0.022, 0.012), dot: ln(d.sub(0.12), 0.028, 0.012) };
    },
    (x) => { // 1 double scale
      const d = length(vec2(x.tu.sub(0.5), x.tv.sub(0.06)));
      const d2 = length(vec2(x.tu.sub(0.5), x.tv.sub(0.14)));
      return { fill: step(d, 0.54), rim: ln(d.sub(0.54), 0.022, 0.012).add(ln(d2.sub(0.30), 0.018, 0.010)), dot: ln(d2.sub(0.08), 0.024, 0.010) };
    },
    (x) => { // 2 scale row + a line through the row
      const d = length(vec2(x.tu.sub(0.5), x.tv.sub(0.06)));
      return { fill: step(d, 0.54), rim: ln(d.sub(0.54), 0.022, 0.012).add(ln(x.tv.sub(0.92), 0.018, 0.010)), dot: ln(d.sub(0.12), 0.028, 0.012) };
    },
    (x) => { // 3 dense small scales
      const d = length(vec2(fract(x.tu.mul(2.0)).sub(0.5), x.tv.sub(0.04)));
      return { fill: step(d, 0.55), rim: ln(d.sub(0.55), 0.024, 0.012), dot: ln(d.sub(0.14), 0.03, 0.012) };
    },
  ];

  // ---- vyaghra : tiger stripes ------------------------------------------------------------------
  const vyaghra = [
    (x) => { // 0 continuous bands
      const sv = x.rv.mul(0.5).fract();
      return { fill: step(sv, 0.5), rim: ln(sv.sub(0.5), 0.02, 0.012), dot: float(0) };
    },
    (x) => { // 1 tapered notched stripe
      const sdf = abs(x.tu.sub(0.5)).sub(float(0.34).sub(x.tv.mul(0.20)));
      return { fill: step(sdf, x.zero), rim: ln(sdf, 0.02, 0.012), dot: float(0) };
    },
    (x) => { // 2 double band
      const sv = x.rv.mul(0.5).fract();
      return { fill: step(sv, 0.5), rim: ln(sv.sub(0.5), 0.018, 0.010).add(ln(sv, 0.014, 0.008)), dot: float(0) };
    },
    (x) => { // 3 band + zigzag
      const sv = x.rv.mul(0.5).fract();
      const zz = abs(x.tu.sub(0.5)).sub(0.30);
      return { fill: step(sv, 0.5), rim: ln(sv.sub(0.5), 0.018, 0.010).add(ln(zz, 0.02, 0.010).mul(step(0.6, sv))), dot: float(0) };
    },
  ];

  // ---- kohbar : nuptial symbols (lotus, fish, bamboo, frame) -------------------------------------
  const kohbar = [
    (x) => { // 0 lotus rosette
      const pet = ln(abs(fract(x.ang.mul(0.9549)).sub(0.5)).mul(x.rad).sub(0.11), 0.03, 0.012).mul(step(x.rad, 0.44)).mul(step(0.10, x.rad));
      return { fill: ln(x.rad.sub(0.44), 0.10, 0.02), rim: ln(x.rad.sub(0.44), 0.024, 0.012).add(pet), dot: ln(x.rad.sub(0.07), 0.035, 0.014) };
    },
    (x) => { // 1 fish (body + tail + eye)
      const body = length(vec2(x.tu.sub(0.5).mul(1.15), x.tv.sub(0.5).mul(2.0)));
      const tail = abs(x.tv.sub(0.5)).sub(float(0.16).sub(x.tu.sub(0.72).max(0.0).mul(0.5)));
      return { fill: ln(body.sub(0.30), 0.14, 0.02), rim: ln(body.sub(0.30), 0.022, 0.012).add(ln(tail, 0.022, 0.012).mul(step(0.62, x.tu))), dot: ln(length(vec2(x.tu.sub(0.34), x.tv.sub(0.44))).sub(0.035), 0.022, 0.010) };
    },
    (x) => { // 2 bamboo stalks with nodes
      const st = ln(abs(x.tu.sub(0.22)).sub(0.035), 0.02, 0.012).add(ln(abs(x.tu.sub(0.50)).sub(0.035), 0.02, 0.012)).add(ln(abs(x.tu.sub(0.78)).sub(0.035), 0.02, 0.012));
      const nodes = ln(abs(fract(x.tv.mul(3.0)).sub(0.5)).sub(0.05), 0.02, 0.012);
      return { fill: float(0.0), rim: st.add(nodes), dot: float(0) };
    },
    (x) => { // 3 framed panel with a bead
      const fr = max(abs(x.tu.sub(0.5)).sub(0.40), abs(x.tv.sub(0.5)).sub(0.34));
      return { fill: ln(fr, 0.12, 0.02), rim: ln(fr, 0.022, 0.012), dot: ln(length(vec2(x.tu.sub(0.5), x.tv.sub(0.5))).sub(0.07), 0.03, 0.012) };
    },
  ];

  // ---- katchni : line work (parallel, cross, stipple, wave) --------------------------------------
  const katchni = [
    (x) => { // 0 parallel lines
      const hv = fract(x.tu.add(x.tv).mul(x.hatchN));
      return { fill: float(1.0), rim: ln(hv.sub(0.5), 0.030, 0.012), dot: float(0) };
    },
    (x) => { // 1 cross-hatch
      const hv = fract(x.tu.add(x.tv).mul(x.hatchN));
      const hw = fract(x.tu.sub(x.tv).mul(x.hatchN));
      return { fill: float(1.0), rim: ln(hv.sub(0.5), 0.026, 0.012).add(ln(hw.sub(0.5), 0.026, 0.012)), dot: float(0) };
    },
    (x) => { // 2 stipple
      const d = length(vec2(x.tu.sub(0.5), x.tv.sub(0.5)));
      return { fill: float(1.0), rim: ln(d.sub(0.18), 0.035, 0.012).add(ln(d.sub(0.40), 0.028, 0.012)), dot: float(0) };
    },
    (x) => { // 3 wave lines
      const wv = x.tv.add(sin(x.tu.mul(6.2831853)).mul(0.12));
      return { fill: float(1.0), rim: ln(fract(wv.mul(3.0)).sub(0.5), 0.030, 0.012), dot: float(0) };
    },
  ];

  // ---- godna : tattoo marks (dots, dashes, crosses, triangles) -----------------------------------
  const godna = [
    (x) => { // 0 dot rows
      const d = length(vec2(x.tu.sub(0.5), x.tv.sub(0.5)));
      return { fill: float(0.0), rim: float(0.0), dot: ln(d.sub(0.22), 0.05, 0.014) };
    },
    (x) => { // 1 dashes
      const sy = fract(x.tv.mul(3.0)).sub(0.5);
      return { fill: float(0.0), rim: ln(abs(sy).sub(0.06), 0.026, 0.012).mul(step(0.35, abs(x.tu.sub(0.5)))), dot: float(0) };
    },
    (x) => { // 2 small crosses
      const cross = ln(abs(x.tu.sub(0.5)), 0.02, 0.010).add(ln(abs(x.tv.sub(0.5)), 0.02, 0.010));
      return { fill: float(0.0), rim: cross, dot: ln(length(vec2(x.tu.sub(0.5), x.tv.sub(0.5))).sub(0.04), 0.02, 0.010) };
    },
    (x) => { // 3 triangles row
      const tri = max(x.tv.sub(0.80), abs(x.tu.sub(0.5)).mul(1.4).sub(x.tv.mul(0.9)));
      return { fill: ln(tri, 0.14, 0.02), rim: ln(tri, 0.024, 0.012), dot: float(0) };
    },
  ];

  // ---- tantrik : yantra geometry (rings, rosette, triangles, star) -------------------------------
  const tantrik = [
    (x) => { // 0 concentric rings
      const rr = x.rad.mul(1.7);
      const r = ln(rr.sub(0.46), 0.024, 0.012).add(ln(rr.sub(0.34), 0.022, 0.012)).add(ln(rr.sub(0.22), 0.022, 0.012)).add(ln(rr.sub(0.10), 0.022, 0.012));
      return { fill: float(0.0), rim: r, dot: ln(rr.sub(0.05), 0.03, 0.012) };
    },
    (x) => { // 1 petal rosette
      const rr = x.rad.mul(1.6);
      const pet = ln(abs(fract(x.ang.mul(1.27)).sub(0.5)).mul(rr).sub(0.10), 0.03, 0.012).mul(step(rr, 0.46)).mul(step(0.12, rr));
      return { fill: float(0.0), rim: ln(rr.sub(0.46), 0.024, 0.012).add(pet), dot: ln(rr.sub(0.06), 0.03, 0.012) };
    },
    (x) => { // 2 up / down triangles
      const up = max(x.tv.sub(0.86), abs(x.tu.sub(0.5)).mul(1.2).sub(x.tv.mul(0.9)));
      const dn = max(x.tv.negate().sub(0.14), abs(x.tu.sub(0.5)).mul(1.2).sub(x.tv.negate().mul(0.9)));
      return { fill: ln(up, 0.12, 0.02), rim: ln(up, 0.022, 0.012).add(ln(dn, 0.022, 0.012)), dot: float(0) };
    },
    (x) => { // 3 star / cross grid
      const cross = ln(abs(x.tu.sub(0.5)), 0.022, 0.012).add(ln(abs(x.tv.sub(0.5)), 0.022, 0.012));
      return { fill: float(0.0), rim: cross, dot: ln(x.rad.sub(0.06), 0.028, 0.012) };
    },
  ];

  // ---- bharni : filled figures (solid shapes inside an outline) ----------------------------------
  const bharni = [
    (x) => { // 0 filled lotus
      const pet = abs(fract(x.ang.mul(0.9549)).sub(0.5)).mul(x.rad);
      return { fill: ln(x.rad.sub(0.44), 0.15, 0.02), rim: ln(x.rad.sub(0.44), 0.024, 0.012).add(ln(pet.sub(0.16), 0.03, 0.012).mul(step(x.rad, 0.44))), dot: ln(x.rad.sub(0.07), 0.035, 0.014) };
    },
    (x) => { // 1 filled fish
      const body = length(vec2(x.tu.sub(0.5).mul(1.15), x.tv.sub(0.5).mul(2.0)));
      return { fill: ln(body.sub(0.30), 0.17, 0.02), rim: ln(body.sub(0.30), 0.022, 0.012), dot: ln(length(vec2(x.tu.sub(0.34), x.tv.sub(0.44))).sub(0.035), 0.022, 0.010) };
    },
    (x) => { // 2 filled leaf (paisley)
      const leaf = length(vec2(x.tu.sub(0.5), x.tv.sub(0.5).mul(0.62))).sub(0.30);
      return { fill: ln(leaf, 0.15, 0.02), rim: ln(leaf, 0.022, 0.012).add(ln(abs(x.tu.sub(0.5)).sub(0.02), 0.016, 0.010)), dot: float(0) };
    },
    (x) => { // 3 filled medallion
      const d = length(vec2(x.tu.sub(0.5), x.tv.sub(0.5)));
      return { fill: ln(d.sub(0.38), 0.16, 0.02), rim: ln(d.sub(0.38), 0.022, 0.012).add(ln(d.sub(0.24), 0.02, 0.010)), dot: ln(d.sub(0.08), 0.03, 0.012) };
    },
  ];

  const SETS = { scallop, vyaghra, kohbar, katchni, godna, tantrik, bharni };
  const tiles = SETS[style] || scallop;

  return Fn(([u, v, tileH, tileW, tileId, hatchN]) => {
    const rv = v.div(tileH);
    const ru = u.div(tileW);
    const ri = floor(rv);
    const tv = fract(rv);
    const tu = fract(ru);
    const odd = step(float(0.25), fract(ri.mul(0.5)));
    const tuo = fract(ru.add(odd.mul(0.5)));
    const ctx = {
      ln, hatchN, ri, rv, ru, tv, tu: tuo, zero: float(0.0),
      ang: atan(tv.sub(0.06), tuo.sub(0.5)),
      rad: length(vec2(tuo.sub(0.5), tv.sub(0.06))),
    };
    const t0 = tiles[0](ctx), t1 = tiles[1](ctx), t2 = tiles[2](ctx), t3 = tiles[3](ctx);
    const pick = (k) => select(tileId.lessThan(0.5), t0[k], select(tileId.lessThan(1.5), t1[k], select(tileId.lessThan(2.5), t2[k], t3[k])));
    return vec4(pick('fill'), pick('rim'), pick('dot'), ri);
  });
}
