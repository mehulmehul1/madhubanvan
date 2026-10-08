// Motif atlas loader — turns a baked role-mask .bin into a GPU texture array.
//
// WHY A TEXTURE ARRAY, NOT AN ATLAS: every motif is its own layer, so motifs can never bleed into
// each other at low mip levels, which is the classic failure of a flat packed atlas. `bomb` mode
// only ever needs the active style's motifs, so we bake and upload ONE STYLE AT A TIME — 12 layers
// at 256x256 is ~3 MB instead of 84 MB for the whole library.
//
// WHY MIPMAPS ARE GENERATED HERE, BY HAND: three.js would generate them for a 2D texture, but for a
// DataArrayTexture the behaviour is backend-dependent. Generating them in JS costs ~1 ms per style
// and removes the dependency. It is also exactly correct here: each channel is a coverage mask, and
// averaging coverage IS the correct average of the motif, so mip reduction introduces no colour
// error and no cross-role contamination.
//
// CHANNEL CONTRACT (see tools/bakeatlas.mjs):
//   R = ink coverage   G = fill A coverage   B = fill B coverage   A = bead coverage
// Ground is simply where all four are zero. The shader composites them over a ground colour in
// painter's order: bead -> fill B -> fill A -> ink.
//
// This is DATA, not colour: the texture must stay in NoColorSpace so three does not apply an sRGB
// transform to coverage values on read.

import * as THREE from 'three/webgpu';

const MAGIC = 0x4c54414d; // "MATL" little-endian
const HEADER = 32;

function readHeader(buf) {
  if (buf.byteLength < HEADER) throw new Error('atlas: file too short to hold a header');
  const dv = new DataView(buf);
  const magic = dv.getUint32(0, true);
  if (magic !== MAGIC) throw new Error(`atlas: bad magic 0x${magic.toString(16)} (expected 0x${MAGIC.toString(16)})`);
  const version = dv.getUint32(4, true);
  if (version !== 1) throw new Error(`atlas: unsupported version ${version}`);
  return {
    version,
    cellSize: dv.getUint32(8, true),
    layers: dv.getUint32(12, true),
    styleIndex: dv.getUint32(16, true),
    bytesPerLayer: dv.getUint32(20, true),
  };
}

/**
 * Box-filter a role-mask texture array down a full mip chain.
 * Each mip averages 2x2 per channel, independently, so coverage stays coverage.
 */
function buildMips(data, w, h, layers) {
  const mips = [{ data, width: w, height: h, depth: layers }];
  let src = data, sw = w, sh = h;
  while (sw > 1 || sh > 1) {
    const dw = Math.max(1, sw >> 1), dh = Math.max(1, sh >> 1);
    const dst = new Uint8Array(dw * dh * layers * 4);
    for (let l = 0; l < layers; l++) {
      const so = l * sw * sh * 4;
      const doff = l * dw * dh * 4;
      for (let y = 0; y < dh; y++) {
        const y0 = Math.min(y * 2, sh - 1), y1 = Math.min(y * 2 + 1, sh - 1);
        for (let x = 0; x < dw; x++) {
          const x0 = Math.min(x * 2, sw - 1), x1 = Math.min(x * 2 + 1, sw - 1);
          const i00 = so + (y0 * sw + x0) * 4, i01 = so + (y0 * sw + x1) * 4;
          const i10 = so + (y1 * sw + x0) * 4, i11 = so + (y1 * sw + x1) * 4;
          const o = doff + (y * dw + x) * 4;
          for (let c = 0; c < 4; c++) {
            dst[o + c] = (src[i00 + c] + src[i01 + c] + src[i10 + c] + src[i11 + c] + 2) >> 2;
          }
        }
      }
    }
    mips.push({ data: dst, width: dw, height: dh, depth: layers });
    src = dst; sw = dw; sh = dh;
  }
  return mips;
}

/**
 * Build a DataArrayTexture from an ArrayBuffer holding a baked .bin.
 * @param {ArrayBuffer} buffer
 * @returns {{texture: THREE.DataArrayTexture, cellSize: number, layers: number, styleIndex: number}}
 */
export function createMotifAtlas(buffer) {
  const head = readHeader(buffer);
  const { cellSize, layers, bytesPerLayer } = head;
  const expect = cellSize * cellSize * 4;
  if (bytesPerLayer !== expect) {
    throw new Error(`atlas: bytesPerLayer ${bytesPerLayer} != ${expect} for ${cellSize}^2 RGBA`);
  }
  const need = HEADER + bytesPerLayer * layers;
  if (buffer.byteLength < need) {
    throw new Error(`atlas: payload truncated — need ${need} bytes, have ${buffer.byteLength}`);
  }

  // copy the base level out so the whole chain is owned by us and independent of the fetch buffer
  const base = new Uint8Array(buffer, HEADER, bytesPerLayer * layers).slice();
  const mipmaps = buildMips(base, cellSize, cellSize, layers);

  const tex = new THREE.DataArrayTexture(base, cellSize, cellSize, layers);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.mipmaps = mipmaps;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = false;   // we already built them
  tex.anisotropy = 4;            // grazing angles are where a tiled pattern shimmers worst
  tex.colorSpace = THREE.NoColorSpace; // coverage data, never sRGB-decoded
  tex.needsUpdate = true;

  return { texture: tex, ...head };
}

/** Fetch + build. Returns null (never throws) so a missing bake degrades to the SDF fallback. */
export async function loadMotifAtlas(url) {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return createMotifAtlas(await res.arrayBuffer());
  } catch (e) {
    console.warn(`[madhubani] motif atlas unavailable at ${url}: ${e.message} — falling back to SDF tiles`);
    return null;
  }
}

export const disposeMotifAtlas = (a) => { if (a?.texture) a.texture.dispose(); };

/**
 * Load every style's bake into ONE texture array.
 *
 * Why one array instead of seven textures: style switching happens at runtime, and a texture binding
 * is baked into the shader at build time — swapping textures would mean rebuilding the material on
 * every style change. Stacking all 84 motifs into one array instead turns style selection into a
 * single uniform (the layer base offset), so switching is free.
 *
 * @param {Array<{styleKey: string, url: string}>} entries in STYLE_KEYS order
 * @returns {Promise<null | {texture, cellSize, layers, offsets: Record<string, number>}>}
 *          null only if EVERY style failed to load; a partial set still works for the styles it has.
 */
export async function loadMotifAtlasSet(entries) {
  const loaded = await Promise.all(
    entries.map(async (e) => ({ styleKey: e.styleKey, atlas: await loadMotifAtlas(e.url) })),
  );

  const good = loaded.filter((e) => e.atlas);
  if (good.length === 0) return null;

  const cellSize = good[0].atlas.cellSize;
  const layers = good[0].atlas.layers;
  const bad = good.filter((e) => e.atlas.cellSize !== cellSize || e.atlas.layers !== layers);
  if (bad.length) {
    // Mixed geometry cannot be stacked; refuse rather than silently mis-sample a layer.
    console.warn(`[madhubani] atlas cell/layer mismatch, ignoring: ${bad.map((e) => e.styleKey).join(', ')}`);
    for (const e of bad) e.atlas = null;
  }
  const usable = good.filter((e) => e.atlas);
  if (usable.length === 0) return null;

  // concatenate each style's base level back to back
  const total = usable.length * layers;
  const base = new Uint8Array(cellSize * cellSize * total * 4);
  const offsets = {};
  usable.forEach((e, i) => {
    offsets[e.styleKey] = i * layers;
    base.set(e.atlas.texture.image.data, i * layers * cellSize * cellSize * 4);
  });

  const mipmaps = buildMips(base, cellSize, cellSize, total);
  const texture = new THREE.DataArrayTexture(base, cellSize, cellSize, total);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.mipmaps = mipmaps;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;

  for (const e of usable) e.atlas.texture.dispose();
  return { texture, cellSize, layers: total, offsets, styles: Object.keys(offsets) };
}
