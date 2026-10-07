// Madhubani swatch book — per-STYLE tile libraries, drawn directly as SVG.
//
// Each style owns FOUR tiles of its own (mirroring src/core/render/madhubani/fields.js). They are
// not shared between styles: bharni fills figures, katchni fills with line work, godna uses tattoo
// marks, tantrik uses yantra geometry, kohbar uses nuptial symbols, vyaghra uses stripes, scallop
// uses scales. The sheets let you see one style's whole vocabulary at once.
import { PALETTES, STYLES, STYLE_KEYS } from '../src/core/render/madhubani/params.js';
import { STYLE_ZONES, ZONE_NAMES } from '../src/core/render/madhubani/zones.js';

const S = 132;
const H = (v) => '#' + (v >>> 0).toString(16).padStart(6, '0');
const R = (x, y, w, h, f, e = '') => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${f}" ${e}/>`;
const Ci = (cx, cy, r, f, e = '') => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${f}" ${e}/>`;
const L = (x1, y1, x2, y2, s, w) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${s}" stroke-width="${w}"/>`;
const P = (d, s, w, f = 'none') => `<path d="${d}" stroke="${s}" stroke-width="${w}" fill="${f}"/>`;
const wrap = (inner) => `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

const q = new URLSearchParams(location.search);
let paletteIdx = +(q.get('palette') ?? 1);
let styleKey = q.get('style') ?? 'scallop';
let colourCount = +(q.get('colours') ?? 0);
const palOf = (i) => ({ ...PALETTES[i], __i: i });

// ---- per-style tile libraries (SVG mirrors of fields.js) ----------------------------------------
// each drawer gets { g, x,y,w,h, ink, bead, fill(r), ground }
const LIB = {
  scallop: [
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const rh = g.w / 2 * 0.62; for (let r = 0; r <= Math.ceil(g.h / rh) + 1; r++) { const yy = g.y + r * rh, cw = g.w / 2, off = (r % 2) * cw * 0.5; for (let c = -1; c < 3; c++) { const cx = g.x + c * cw + off + cw * 0.5, rad = cw * 0.55; o += P(`M${cx - rad} ${yy + rh} A ${rad} ${rad} 0 0 1 ${cx + rad} ${yy + rh}`, g.ink, g.sw, g.fill(r)); o += Ci(cx, yy + rh - rad * 0.4, rad * 0.15, g.bead); } } return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const rh = g.w / 2 * 0.62, cw = g.w / 2; for (let r = 0; r <= Math.ceil(g.h / rh) + 1; r++) { const yy = g.y + r * rh, off = (r % 2) * cw * 0.5; for (let c = -1; c < 3; c++) { const cx = g.x + c * cw + off + cw * 0.5, rad = cw * 0.55; o += P(`M${cx - rad} ${yy + rh} A ${rad} ${rad} 0 0 1 ${cx + rad} ${yy + rh}`, g.ink, g.sw, g.fill(r)); o += P(`M${cx - rad * 0.6} ${yy + rh} A ${rad * 0.6} ${rad * 0.6} 0 0 1 ${cx + rad * 0.6} ${yy + rh}`, g.ink, g.sw * 0.8); o += Ci(cx, yy + rh - rad * 0.4, rad * 0.14, g.bead); } } return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const rh = g.w / 2 * 0.62, cw = g.w / 2; for (let r = 0; r <= Math.ceil(g.h / rh) + 1; r++) { const yy = g.y + r * rh, off = (r % 2) * cw * 0.5; for (let c = -1; c < 3; c++) { const cx = g.x + c * cw + off + cw * 0.5, rad = cw * 0.55; o += P(`M${cx - rad} ${yy + rh} A ${rad} ${rad} 0 0 1 ${cx + rad} ${yy + rh}`, g.ink, g.sw, g.fill(r)); } o += L(g.x, yy + rh * 0.05, g.x + g.w, yy + rh * 0.05, g.ink, g.sw * 0.8); } return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const rh = g.w / 4 * 0.62, cw = g.w / 4; for (let r = 0; r <= Math.ceil(g.h / rh) + 1; r++) { const yy = g.y + r * rh, off = (r % 2) * cw * 0.5; for (let c = -1; c < 5; c++) { const cx = g.x + c * cw + off + cw * 0.5, rad = cw * 0.55; o += P(`M${cx - rad} ${yy + rh} A ${rad} ${rad} 0 0 1 ${cx + rad} ${yy + rh}`, g.ink, g.sw * 0.8, g.fill(r)); } } return o; },
  ],
  vyaghra: [
    (g) => { let o = ''; const n = 6; for (let r = 0; r < n; r++) o += R(g.x, g.y + (r * g.h) / n, g.w, g.h / n, g.fill(r), `stroke="${g.ink}" stroke-width="${g.sw * 0.7}"`); return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const n = 4; for (let i = 0; i < n; i++) { const cx = g.x + (i + 0.5) * (g.w / n); const hw = (g.w / n) * 0.34; o += P(`M${cx - hw} ${g.y + g.h * 0.4} L${cx - hw * 0.6} ${g.y} L${cx + hw * 0.6} ${g.y} L${cx + hw} ${g.y + g.h * 0.4} L${cx + hw * 0.6} ${g.y + g.h} L${cx - hw * 0.6} ${g.y + g.h} Z`, g.ink, g.sw, g.fill(i)); } return o; },
    (g) => { let o = ''; const n = 3; for (let r = 0; r < n; r++) { const y = g.y + (r * g.h) / n, hh = g.h / n; o += R(g.x, y + hh * 0.3, g.w, hh * 0.7, g.fill(r), `stroke="${g.ink}" stroke-width="${g.sw * 0.7}"`); o += L(g.x, y + hh * 0.15, g.x + g.w, y + hh * 0.15, g.ink, g.sw * 0.8); } return o; },
    (g) => { let o = ''; const n = 4; for (let r = 0; r < n; r++) { const y = g.y + (r * g.h) / n, hh = g.h / n; o += R(g.x, y, g.w, hh, g.fill(r)); o += P(`M${g.x} ${y + hh} L${g.x + g.w * 0.25} ${y + hh * 0.3} L${g.x + g.w * 0.5} ${y + hh} L${g.x + g.w * 0.75} ${y + hh * 0.3} L${g.x + g.w} ${y + hh}`, g.ink, g.sw * 0.8); } return o; },
  ],
  kohbar: [
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const cx = g.x + g.w / 2, cy = g.y + g.h / 2, rad = Math.min(g.w, g.h) * 0.42; for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; o += P(`M${cx} ${cy} L${cx + Math.cos(a) * rad} ${cy + Math.sin(a) * rad}`, g.ink, g.sw * 0.8); } o += Ci(cx, cy, rad, 'none', `stroke="${g.ink}" stroke-width="${g.sw}"`); o += Ci(cx, cy, rad * 0.16, g.bead); return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const cx = g.x + g.w / 2, cy = g.y + g.h / 2, rw = g.w * 0.26, rh = g.h * 0.13; o += `<ellipse cx="${cx}" cy="${cy}" rx="${rw}" ry="${rh}" fill="${g.fill(0)}" stroke="${g.ink}" stroke-width="${g.sw}"/>`; o += P(`M${cx + rw * 0.9} ${cy} L${cx + rw * 1.7} ${cy - rh} L${cx + rw * 1.7} ${cy + rh} Z`, g.ink, g.sw, g.fill(1)); o += Ci(cx - rw * 0.45, cy - rh * 0.2, rh * 0.28, g.ink); return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); for (let i = 0; i < 3; i++) { const x = g.x + g.w * (0.25 + i * 0.25); o += L(x, g.y + g.h * 0.1, x, g.y + g.h * 0.9, g.ink, g.sw * 1.6); for (let k = 1; k < 4; k++) o += L(x - g.w * 0.05, g.y + g.h * (0.1 + k * 0.22), x + g.w * 0.05, g.y + g.h * (0.1 + k * 0.22), g.ink, g.sw * 0.9); } return o; },
    (g) => { let o = R(g.x + g.w * 0.12, g.y + g.h * 0.12, g.w * 0.76, g.h * 0.76, g.fill(0), `stroke="${g.ink}" stroke-width="${g.sw * 1.4}"`); o += R(g.x + g.w * 0.22, g.y + g.h * 0.22, g.w * 0.56, g.h * 0.56, 'none', `stroke="${g.ink}" stroke-width="${g.sw * 0.8}"`); o += Ci(g.x + g.w / 2, g.y + g.h / 2, g.w * 0.09, g.bead); return o; },
  ],
  katchni: [
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.fill(0)); for (let i = -6; i < 12; i++) o += L(g.x + i * 12, g.y, g.x + i * 12 + g.h, g.y + g.h, g.ink, g.sw * 0.8); return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.fill(0)); for (let i = -6; i < 12; i++) { o += L(g.x + i * 13, g.y, g.x + i * 13 + g.h, g.y + g.h, g.ink, g.sw * 0.8); o += L(g.x + i * 13, g.y + g.h, g.x + i * 13 + g.h, g.y, g.ink, g.sw * 0.8); } return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.fill(0)); for (let r = 0; r <= 10; r++) for (let c = 0; c <= 10; c++) o += Ci(g.x + c * (g.w / 10) + (r % 2 ? g.w / 20 : 0), g.y + r * (g.h / 10), g.sw * 0.9, g.ink); return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.fill(0)); for (let k = 0; k < 6; k++) { let d = `M${g.x} ${g.y + (k + 0.5) * (g.h / 6)}`; for (let t = 0; t <= 1.001; t += 0.1) d += ` L${g.x + t * g.w} ${g.y + (k + 0.5) * (g.h / 6) + Math.sin(t * Math.PI * 3) * g.h * 0.03}`; o += P(d, g.ink, g.sw * 0.8); } return o; },
  ],
  godna: [
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); for (let r = 0; r <= 6; r++) for (let c = 0; c <= 6; c++) o += Ci(g.x + c * (g.w / 6) + (r % 2 ? g.w / 12 : 0), g.y + r * (g.h / 6), g.w * 0.05, g.ink); return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) o += R(g.x + c * (g.w / 5) + g.w * 0.06, g.y + (r + 0.4) * (g.h / 6), g.w * 0.10, g.h * 0.035, g.ink); return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const cx = g.x + (c + 0.5) * (g.w / 5), cy = g.y + (r + 0.5) * (g.h / 5), a = g.w * 0.05; o += L(cx - a, cy, cx + a, cy, g.ink, g.sw); o += L(cx, cy - a, cx, cy + a, g.ink, g.sw); } return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const x = g.x + c * (g.w / 4), y = g.y + r * (g.h / 4), w = g.w / 4, h = g.h / 4; o += P(`M${x + w * 0.15} ${y + h * 0.85} L${x + w * 0.5} ${y + h * 0.15} L${x + w * 0.85} ${y + h * 0.85} Z`, g.ink, g.sw, g.fill((r + c) % 4)); } return o; },
  ],
  tantrik: [
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const cx = g.x + g.w / 2, cy = g.y + g.h / 2, R0 = Math.min(g.w, g.h) * 0.45; for (const k of [1, 0.75, 0.5, 0.25]) o += Ci(cx, cy, R0 * k, 'none', `stroke="${g.ink}" stroke-width="${g.sw}"`); o += Ci(cx, cy, g.w * 0.04, g.bead); return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const cx = g.x + g.w / 2, cy = g.y + g.h / 2, R0 = Math.min(g.w, g.h) * 0.45; for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; o += P(`M${cx + Math.cos(a) * R0 * 0.2} ${cy + Math.sin(a) * R0 * 0.2} L${cx + Math.cos(a) * R0} ${cy + Math.sin(a) * R0}`, g.ink, g.sw * 0.9); } o += Ci(cx, cy, R0, 'none', `stroke="${g.ink}" stroke-width="${g.sw}"`); o += Ci(cx, cy, g.w * 0.04, g.bead); return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const w = g.w / 2, h = g.h / 4; for (let i = 0; i < 2; i++) for (let r = 0; r < 2; r++) { const x = g.x + i * w, y = g.y + r * h * 2; o += P(`M${x + w * 0.15} ${y + h * 0.9} L${x + w * 0.5} ${y + h * 0.1} L${x + w * 0.85} ${y + h * 0.9} Z`, g.fill(i + r), `stroke="${g.ink}" stroke-width="${g.sw}"`); o += P(`M${x + w * 0.15} ${y + h * 1.1} L${x + w * 0.5} ${y + h * 1.9} L${x + w * 0.85} ${y + h * 1.1} Z`, g.fill(i + r + 1), `stroke="${g.ink}" stroke-width="${g.sw}"`); } return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); for (let i = 0; i <= 3; i++) { o += L(g.x + (i * g.w) / 3, g.y, g.x + (i * g.w) / 3, g.y + g.h, g.ink, g.sw * 0.9); o += L(g.x, g.y + (i * g.h) / 3, g.x + g.w, g.y + (i * g.h) / 3, g.ink, g.sw * 0.9); } for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o += Ci(g.x + (i + 0.5) * (g.w / 3), g.y + (j + 0.5) * (g.h / 3), g.w * 0.045, g.bead); return o; },
  ],
  bharni: [
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const cx = g.x + g.w / 2, cy = g.y + g.h / 2, rad = Math.min(g.w, g.h) * 0.40; o += Ci(cx, cy, rad, g.fill(0), `stroke="${g.ink}" stroke-width="${g.sw}"`); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; o += P(`M${cx + Math.cos(a) * rad * 0.3} ${cy + Math.sin(a) * rad * 0.3} L${cx + Math.cos(a) * rad} ${cy + Math.sin(a) * rad}`, g.ink, g.sw * 0.9); } o += Ci(cx, cy, rad * 0.18, g.bead); return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const cx = g.x + g.w / 2, cy = g.y + g.h / 2, rw = g.w * 0.24, rh = g.h * 0.18; o += `<ellipse cx="${cx}" cy="${cy}" rx="${rw}" ry="${rh}" fill="${g.fill(0)}" stroke="${g.ink}" stroke-width="${g.sw}"/>`; o += P(`M${cx + rw * 0.9} ${cy} L${cx + rw * 1.6} ${cy - rh * 0.9} L${cx + rw * 1.6} ${cy + rh * 0.9} Z`, g.fill(1), `stroke="${g.ink}" stroke-width="${g.sw}"`); o += Ci(cx - rw * 0.5, cy - rh * 0.25, rh * 0.28, g.ink); return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); for (const dx of [0.32, 0.68]) { const cx = g.x + g.w * dx, cy = g.y + g.h / 2, rw = g.w * 0.15, rh = g.h * 0.32; o += `<ellipse cx="${cx}" cy="${cy}" rx="${rw}" ry="${rh}" fill="${g.fill(0)}" stroke="${g.ink}" stroke-width="${g.sw}"/>`; o += L(cx, cy - rh, cx, cy + rh, g.ink, g.sw * 0.7); } return o; },
    (g) => { let o = R(g.x, g.y, g.w, g.h, g.ground()); const cx = g.x + g.w / 2, cy = g.y + g.h / 2, rad = Math.min(g.w, g.h) * 0.38; o += Ci(cx, cy, rad, g.fill(2), `stroke="${g.ink}" stroke-width="${g.sw * 1.2}"`); o += Ci(cx, cy, rad * 0.62, 'none', `stroke="${g.ink}" stroke-width="${g.sw * 0.9}"`); o += Ci(cx, cy, rad * 0.2, g.bead); return o; },
  ],
};

function drawStyleTile(key, idx, x, y, w, h, pal, slot, n) {
  const ink = H(pal.ink), bead = H(pal.bead);
  const fill = (r) => H(pal.f[(((slot + r) % n) + n) % n]);
  const ground = () => H(pal.f[(((slot + 2) % n) + n) % n]);
  const g = { x, y, w, h, ink, bead, fill, ground, sw: Math.max(1.1, Math.min(w, h) * 0.035) };
  const lib = LIB[key] || LIB.scallop;
  return lib[idx % lib.length](g);
}

// ---- page --------------------------------------------------------------------------------------
const palEl = document.getElementById('palettes');
for (const p of PALETTES) {
  const keys = [['paper', p.paper], ['ink', p.ink], ['f0', p.f[0]], ['f1', p.f[1]], ['f2', p.f[2]], ['f3', p.f[3]], ['bead', p.bead]];
  const row = document.createElement('div');
  row.className = 'pal';
  row.innerHTML = `<div class="name">${p.id}</div><div class="chips">${keys.map(([k, v]) => `<div class="chip" title="${k} ${H(v)}" style="background:${H(v)}"><span>${k}</span></div>`).join('')}</div>`;
  palEl.appendChild(row);
}

const ctrls = document.getElementById('controls');
ctrls.innerHTML =
  `<label>style <select id="st">${STYLE_KEYS.map((k) => `<option ${k === styleKey ? 'selected' : ''}>${k}</option>`).join('')}</select></label>` +
  `<label>palette <select id="pa">${PALETTES.map((p, i) => `<option value="${i}" ${i === paletteIdx ? 'selected' : ''}>${i} ${p.id}</option>`).join('')}</select></label>` +
  `<label>colours <select id="co">${[0, 2, 3, 4].map((c) => `<option value="${c}" ${c === colourCount ? 'selected' : ''}>${c === 0 ? 'style default' : c}</option>`).join('')}</select></label>`;
const sync = () => { const p = new URLSearchParams(); p.set('palette', paletteIdx); p.set('style', styleKey); if (colourCount) p.set('colours', colourCount); location.search = p.toString(); };
ctrls.querySelector('#st').onchange = (e) => { styleKey = e.target.value; sync(); };
ctrls.querySelector('#pa').onchange = (e) => { paletteIdx = +e.target.value; sync(); };
ctrls.querySelector('#co').onchange = (e) => { colourCount = +e.target.value; sync(); };

function grid(hostId, title, note, items, cols) {
  const host = document.getElementById(hostId);
  host.innerHTML = `<h2>${title}</h2>${note ? `<div class="note">${note}</div>` : ''}<div class="grid" style="grid-template-columns:repeat(${cols},1fr)">` +
    items.map((it) => `<div class="tile">${wrap(it.inner)}<div class="cap">${it.tag}</div></div>`).join('') + `</div>`;
}

const pal = palOf(paletteIdx);
const z = STYLE_ZONES[styleKey];
const n = colourCount || z.colours;

// one panel per style: its own four tiles in a 2x2, so a style reads as a whole vocabulary
grid('styleGrid', 'The seven styles — each with its OWN four tiles',
  'These are not shared primitives: every style has its own tile library (scales / stripes / nuptial symbols / line work / tattoo marks / yantra / filled figures).',
  STYLE_KEYS.map((k) => {
    const zz = STYLE_ZONES[k], h = S / 2;
    let o = '';
    for (let i = 0; i < 4; i++) o += drawStyleTile(k, i, (i % 2) * h, Math.floor(i / 2) * h, h, h, pal, zz.slots[i], zz.colours);
    return { tag: `${k} · ${zz.colours} colours`, inner: o };
  }), 3);

grid('zoneGrid', `Zones · ${styleKey}`, 'The current style maps each body group to one of ITS OWN tiles. This is the anatomy mapping that drives the animal.', ZONE_NAMES.map((nm, dg) => ({ tag: `${dg} ${nm} → tile ${z.tiles[dg]}`, inner: drawStyleTile(styleKey, z.tiles[dg], 0, 0, S, S, pal, z.slots[dg], n) })), 4);

grid('motifGrid', `${styleKey} — the four tiles`, 'This style\'s own vocabulary, full coverage.', [0, 1, 2, 3].map((i) => ({ tag: `tile ${i}`, inner: drawStyleTile(styleKey, i, 0, 0, S, S, pal, 0, n) })), 4);

grid('borderGrid', `Colour ramp · ${styleKey}`, `${n} colours: each slot family, row-cycling.`, [0, 1, 2, 3].map((s) => ({ tag: `slot ${s}`, inner: drawStyleTile(styleKey, 0, 0, 0, S, S, pal, s, n) })), 4);

grid('palGrid', `${styleKey} · every palette`, 'The same tile under all eight palettes.', PALETTES.map((p, i) => ({ tag: `${i} ${p.id}`, inner: drawStyleTile(styleKey, 0, 0, 0, S, S, palOf(i), 0, n) })), 4);

const s = STYLES[styleKey];
document.getElementById('styleInfo').textContent =
  `${s.label} — tile ${s.tileH.toFixed(3)}×${s.tileW.toFixed(3)} m · rim ${s.rim} · outline ${s.outline} · target colours ${s.colours}${colourCount ? ` (forced ${colourCount})` : ''}`;
document.title = 'MAD:ready:swatch';
window.__state = { phase: 'ready', styles: STYLE_KEYS.length, zones: ZONE_NAMES.length, palettes: PALETTES.length, palette: paletteIdx, styleKey, colours: n };
