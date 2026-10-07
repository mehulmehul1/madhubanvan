// TSL port of the coat material family (src/core/render/coatMaterial.js).
//
// The library builds four GLSL ShaderMaterials (base / shells / fins / membrane). This module
// rebuilds them as three.js NodeMaterials from the same per-vertex attributes the baker produces:
//   aComb  vec3  hair flow direction
//   aTint  vec4  rgb + material id (w)
//   aCoat  vec4  pattern SDF, mark SDF, fur length, region cross-fade
//   aPat   vec4  pattern colour rgb + intensity (w)
//   aSurf  vec4  gloss, feature size, agouti, undercoat/iridescence
// plus skinIndex/skinWeight skinned by the TSL DQS node (dqs-tsl.js).
//
//   base    opaque surface (albedo from tint + pattern + marks)
//   shells  instanced fur layers (one instance = one shell layer over the whole surface)
//   fins    instanced silhouette cards, one per skin vertex, each carrying a few tapered strands
//   membrane translucent fin membranes (material 11)
import * as THREE from 'three/webgpu';
import {
  If, Discard, select, uniform, attribute, instanceIndex,
  vec2, float, mix, smoothstep, clamp, fract, floor, dot, cross, normalize,
  max, min, abs, pow, length, hash, fwidth, cameraPosition, vec3, vec4,
} from 'three/tsl';
import { dqsSkinFn } from './dqs-tsl.js';
import { createMadhubani } from './madhubani/color.js';

export function createCoatMaterials(dqTexture, opts = {}) {
  const uShells = uniform(opts.shells ?? 28);
  const uFurScale = uniform(opts.shellScale ?? 1);
  const uTime = uniform(0);
  const uShellsOn = uniform(1);
  const uFinFade = uniform(1);
  // 1 = keep strands only where the coat is genuinely hairy (mane / jowls); 0 = all or nothing
  const uHairGate = uniform(0);
  const uFinWidth = uniform(opts.finWidth ?? 0.5);
  const uMarkColor = uniform(new THREE.Color(...(opts.markColor || [0.016, 0.0105, 0.0075])));
  const uStrandDensity = uniform(opts.strandDensity ?? 620);
  const uFurForce = uniform(new THREE.Vector3(0, -0.15, 0));
  // painted eyes (up to 4): bind-space centre + radius, iris tint. The library paints the eyes into
  // the base at the crowd tier; we do the same everywhere since eyes.js is not ported yet.
  const uEyeC = Array.from({ length: 4 }, () => uniform(new THREE.Vector4(0, 0, 0, 0)));
  const uEyeTint = Array.from({ length: 4 }, () => uniform(new THREE.Vector3(0.01, 0.007, 0.004)));

  const style = opts.style === 'madhubani' ? 'madhubani' : 'natural';
  const mad = style === 'madhubani'
    ? createMadhubani({ palette: opts.palette, styleKey: opts.madhubaniStyle, seed: opts.madhubaniSeed,
        tiles: opts.tiles, grid: opts.madGrid })
    : null;
  const aMad1 = attribute('aMad1', 'vec4');
  const aMad2 = attribute('aMad2', 'vec4');

  // ---- shared helpers ----------------------------------------------------------------------------
  const coatColor = (tint, pat, coat) => {
    const pw = max(fwidth(coat.x), 0.0011);
    const spot = smoothstep(pw, pw.negate(), coat.x).mul(max(pat.a, 0.0));
    const mw = max(fwidth(coat.y), 0.0007);
    const mark = smoothstep(mw, mw.negate(), coat.y);
    return mix(mix(tint.rgb, pat.rgb, spot), uMarkColor, mark);
  };
  const hairOffset = (sN, sC, L, h) => sN.mul(L.mul(0.5).mul(h))
    .add(sC.mul(L.mul(0.85).mul(h.mul(h).mul(0.6).add(h.mul(0.4)))))
    .add(uFurForce.mul(L.mul(h.mul(h))));

  const D = dqsSkinFn(dqTexture);
  const sk = D.attr();
  const skPos = sk.get('pos');
  const skNrm = sk.get('nrm');

  // ===============================================================================================
  // base surface
  // ===============================================================================================
  const aTint = attribute('aTint', 'vec4');
  const aCoat = attribute('aCoat', 'vec4');
  const aPat = attribute('aPat', 'vec4');
  const aComb = attribute('aComb', 'vec3');
  const rest = attribute('position', 'vec3');
  const restN = attribute('normal', 'vec3');

  const withEyes = (col) => {
    let out = col;
    for (let i = 0; i < 4; i++) {
      const de = length(rest.sub(uEyeC[i].xyz)).div(max(uEyeC[i].w, 1e-4));
      const eyeAlb = mix(uEyeTint[i], vec3(0.004, 0.003, 0.003), smoothstep(0.55, 0.30, de));
      out = select(de.lessThan(1.25), eyeAlb, out);
    }
    return out;
  };

  // Madhubani is FLAT painting: use unlit materials so scene lighting cannot add a specular sheen
  // (white) or crush the unlit side (black) over the print. Form comes from the baked `tone` term.
  const base = mad
    ? new THREE.MeshBasicNodeMaterial()
    : new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0.0 });
  base.name = 'coat.base';
  base.positionNode = skPos;
  base.normalNode = skNrm;
  base.colorNode = mad ? mad.color(rest, aMad1, aMad2, skPos, skNrm) : withEyes(coatColor(aTint, aPat, aCoat));
  if (mad) base.toneMapped = false;

  // ===============================================================================================
  // fur shells (one instance = one shell layer over the whole surface)
  // ===============================================================================================
  const shells = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0.0, transparent: true, depthWrite: true });
  shells.name = 'coat.shells';
  shells.side = THREE.FrontSide;

  const h = float(instanceIndex).add(1.0).div(uShells);
  const L = aCoat.z.mul(uFurScale);
  shells.positionNode = skPos.add(hairOffset(skNrm, aComb, L, h));
  shells.normalNode = skNrm;

  const useX = abs(restN).x.greaterThan(abs(restN).y).and(abs(restN).x.greaterThan(abs(restN).z));
  const useY = abs(restN).y.greaterThan(abs(restN).z);
  const uv = select(useX, rest.yz, select(useY, rest.xz, rest.xy));

  const q = uv.mul(uStrandDensity);
  const ci = floor(q);
  const f = fract(q).sub(0.5);
  const r1 = hash(ci);
  const r2 = hash(ci.add(vec2(7.1, 3.3)));
  const sl = mix(0.55, 1.0, hash(ci.add(vec2(3.3, 1.7))));
  const hr = h.div(sl);
  const rad = float(0.5).mul(float(1.0).sub(hr.mul(hr).mul(0.8)));
  const d = length(f.sub(vec2(r1, r2).sub(0.5).mul(0.5)));
  const aa = fwidth(d).mul(0.9).add(0.015);
  const strand = select(hr.greaterThan(1.0), float(0.0), smoothstep(rad.add(aa), rad.sub(aa), d));
  // hair gate: Madhubani paints flat on the skin, but genuinely hairy regions (the lion's mane,
  // jowls) must keep their strands or the mane collapses into a bald coloured mass.
  const furMask = smoothstep(float(0.018), float(0.06), aCoat.z);
  const alphaShell = strand.mul(float(1.0).sub(smoothstep(0.85, 1.0, h).mul(0.5))).mul(aCoat.w).mul(uShellsOn);
  shells.colorNode = (mad ? mad.color(rest, aMad1, aMad2, skPos, skNrm) : coatColor(aTint, aPat, aCoat))
    .mul(mix(0.42, 1.08, pow(h, 0.55))).mul(mix(0.8, 1.2, r2));
  shells.opacityNode = alphaShell.mul(mix(float(1.0), furMask, uHairGate));
  shells.alphaTestNode = float(0.02);

  // ===============================================================================================
  // silhouette fins (instanced cards, one per skin vertex, a few tapered strands each)
  // ===============================================================================================
  const iPos = attribute('iPos', 'vec3');
  const iNrm = attribute('iNrm', 'vec3');
  const iComb = attribute('iComb', 'vec3');
  const iTint = attribute('iTint', 'vec4');
  const iCoat = attribute('iCoat', 'vec4');
  const iPat = attribute('iPat', 'vec4');
  const quad = attribute('position', 'vec3');

  const finSk = D.skin(iPos, iNrm, iComb, attribute('iSkinIndex', 'vec4'), attribute('iSkinWeight', 'vec4'));
  const fP = finSk.get('pos');
  const fN = finSk.get('nrm');
  const V = normalize(cameraPosition.sub(fP));
  const vis = float(1.0).sub(smoothstep(0.16, 0.42, abs(dot(fN, V))));
  const fL = iCoat.z.mul(uFurScale);
  const y = quad.y;
  const tipDir = normalize(fN.mul(0.5).add(iComb.mul(0.85)));
  const side = normalize(cross(tipDir, V));
  const w = clamp(fL.mul(uFinWidth), 0.0028, 0.012);
  const fp = fP.add(hairOffset(fN, iComb, fL.mul(1.08), y)).add(fN.mul(fL.mul(0.08).mul(y))).add(side.mul(quad.x.mul(w)));

  const fins = mad
    ? new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
    : new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0.0, transparent: true, depthWrite: false });
  fins.name = 'coat.fins';
  fins.side = THREE.DoubleSide;
  fins.alphaTestNode = float(0.02);
  // collapse invisible cards to a point (no pixels) instead of moving clip space
  fins.positionNode = select(vis.greaterThan(0.01).and(iCoat.w.greaterThan(0.05)), fp, fP);

  const fid = iPos.xy.mul(1733.1).add(iPos.z.mul(917.3));
  const nS = float(5.0);
  const uu = quad.x.add(0.5).mul(nS);
  const uw = fwidth(uu).mul(0.8).add(0.02);
  let cov = float(0.0);
  for (let i = 0; i < 5; i++) {
    const hid = fid.add(vec2(i * 7.13, 0.0));
    const h1 = hash(hid), h2 = hash(hid.add(3.7)), h3 = hash(hid.add(9.1));
    const slen = mix(0.38, 1.1, h1.mul(h1).mul(float(3.0).sub(h1.mul(2.0))));
    const cx = float(i).add(0.5).add(h3.sub(0.5).mul(0.6)).add(h2.sub(0.5).mul(1.4).mul(y).mul(y));
    const wdt = float(0.2).mul(float(1.0).sub(y.div(slen))).add(0.03);
    const c = select(y.greaterThan(slen), float(0.0), smoothstep(wdt.add(uw), wdt.sub(uw), abs(uu.sub(cx))));
    cov = max(cov, c);
  }
  const alphaFin = cov.mul(vis).mul(iCoat.w).mul(float(1.0).sub(smoothstep(0.6, 1.0, y).mul(0.35))).mul(uFinFade);
  fins.colorNode = mad
    ? mix(mad.uniforms.uInk, mad.uniforms.uPaper, 0.12)
    : coatColor(iTint, iPat, iCoat).mul(mix(0.42, 1.08, pow(y, 0.55)));
  fins.opacityNode = mad ? alphaFin.mul(1.7).min(0.95) : alphaFin;

  // ===============================================================================================
  // membranes (material 11): translucent fin skin, its own transparent pass
  // ===============================================================================================
  const membrane = mad
    ? new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
    : new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.0, transparent: true, depthWrite: false });
  membrane.name = 'coat.membrane';
  membrane.side = THREE.DoubleSide;
  membrane.positionNode = skPos;
  membrane.normalNode = skNrm;
  membrane.colorNode = mad ? mix(mad.uniforms.uInk, mad.uniforms.uPaper, 0.15) : coatColor(aTint, aPat, aCoat);
  membrane.opacityNode = float(0.85);

  const uniforms = { uShells, uFurScale, uTime, uShellsOn, uFinFade, uFurForce, uMarkColor, uStrandDensity, uEyeC, uEyeTint, uHairGate };
  const update = ({ time = 0 } = {}) => { uTime.value = time; };

  return { base, shells, fins, membrane, uniforms, update, style, mad };
}
