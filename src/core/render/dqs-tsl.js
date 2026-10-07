// TSL port of the DQS skinning vertex path (the GLSL `DQS_GLSL` in dqs.js).
//
// The CPU `DQSkin` class in dqs.js is unchanged: it packs 5 texels per bone into a DataTexture
// (rotation quat, dual quat, 3 rows of the bind-space scale map). This module builds the matching
// WebGPU/TSL vertex nodes from that same texture, for the base surface and the instanced fin cards
// (which carry their own iSkinIndex/iSkinWeight attributes).
//
// TSL requires every mutation to happen inside an `Fn()`, so the accumulation lives in one Fn that
// returns a struct {pos, nrm, tan}. NodeMaterial feeds `material.positionNode` to the shadow/depth
// pass too (Renderer.js: castShadowPositionNode ?? positionNode), which replaces the library's
// MeshDepthMaterial + onBeforeCompile DQS patch.
import {
  Fn, struct, ivec2, int, vec3, vec4, dot, cross, max, length, select,
  texture, textureLoad, attribute, positionLocal, normalLocal,
} from 'three/tsl';

const Skinned = struct({ pos: 'vec3', nrm: 'vec3', tan: 'vec3' });

/**
 * Builds the DQS skinning machinery for one animal's dual-quaternion texture.
 * @param {import('three').DataTexture} dqTexture  5 texels per bone (see dqs.js DQSkin)
 * @returns {{ skin:(p,n,t,i,w)=>any, attr:()=>any }}
 *   skin() takes explicit (position, normal, tangent, skinIndex, skinWeight) nodes;
 *   attr() is the base-surface convenience using the geometry's own attributes.
 */
export function dqsSkinFn(dqTexture) {
  const uDQ = texture(dqTexture);
  const dqT = (b, k) => textureLoad(uDQ, ivec2(int(b).mul(5).add(int(k)), 0));
  const rotate = Fn(([q, v]) => v.add(cross(q.xyz, cross(q.xyz, v).add(q.w.mul(v))).mul(2.0)));

  const skin = Fn(([p, n, t, sIdx, sW]) => {
    const idx = [sIdx.x, sIdx.y, sIdx.z, sIdx.w];
    const wts = [sW.x, sW.y, sW.z, sW.w];
    const r0 = dqT(idx[0], 0);
    const hp = vec4(p, 1.0);
    const ps = vec3(0.0).toVar();
    const real = vec4(0.0).toVar();
    const dual = vec4(0.0).toVar();

    for (let i = 0; i < 4; i++) {
      const b = idx[i], w = wts[i];
      ps.addAssign(w.mul(vec3(dot(dqT(b, 2), hp), dot(dqT(b, 3), hp), dot(dqT(b, 4), hp))));
      const rq = dqT(b, 0), dq = dqT(b, 1);
      const s = select(dot(rq, r0).lessThan(0.0), w.negate(), w);
      real.addAssign(s.mul(rq));
      dual.addAssign(s.mul(dq));
    }

    ps.divAssign(max(sW.x.add(sW.y).add(sW.z).add(sW.w), 1e-5));
    const L = max(length(real), 1e-6);
    real.divAssign(L);
    dual.divAssign(L);
    const tr = real.w.mul(dual.xyz).sub(dual.w.mul(real.xyz)).add(cross(real.xyz, dual.xyz)).mul(2.0);

    return Skinned(rotate(real, ps).add(tr), rotate(real, n), rotate(real, t));
  });

  const attr = () => skin(
    positionLocal, normalLocal, attribute('aComb', 'vec3'),
    attribute('skinIndex', 'vec4'), attribute('skinWeight', 'vec4'),
  );

  return { skin, attr };
}
