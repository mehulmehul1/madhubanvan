// Madhubani swatch book — renders the authored SVG motif library.
//
// The motifs live in app/motifs/<style>/<n>.svg as real drawings that paint into named
// ROLES (see motifs/manifest.js for the nine-class contract). This file does three things
// and nothing else:
//
//   1. fetches each .svg and INLINES it (so CSS custom properties reach the paths — an
//      <img src> would not inherit them, which is the whole reason for inlining)
//   2. binds the role variables to the selected palette
//   3. offers a role-mask view that paints the roles as raw atlas channels
//
// The atlas bake will read exactly these roles out of exactly these files.
import { PALETTES } from '../src/core/render/madhubani/params.js';
import { STYLE_ZONES, ZONE_NAMES, TILES_PER_STYLE } from '../src/core/render/madhubani/zones.js';
import { MOTIFS, STYLE_NOTES, motifsFor } from './motifs/manifest.js';

const H = (v) => '#' + (v >>> 0).toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// role -> the palette slot it binds to
const ROLES = [
  ['g', 'ground', 'f[3]'],
  ['fi', 'ink fill', 'ink'],
  ['fa', 'fill A', 'f[0]'],
  ['fb', 'fill B', 'f[1]'],
  ['bd', 'bead', 'bead'],
  ['si', 'ink stroke', 'ink'],
  ['sa', 'A stroke', 'f[0]'],
  ['sia', 'ink stroke + fill A', 'ink / f[0]'],
  ['sib', 'ink stroke + fill B', 'ink / f[1]'],
];

// role-mask: the literal channels the atlas will store
const MASK = {
  ground: '#141414', ink: '#e2372c', fa: '#31a354', fb: '#2f6fe0', bead: '#f2c230',
};

// ---- state ------------------------------------------------------------------------------------
const q = new URLSearchParams(location.search);
let paletteIdx = +(q.get('palette') ?? 1);
let view = q.get('view') === 'tile' ? 'tile' : 'field';
let mask = q.get('mask') === '1';
const REPEAT = 3; // field view repeats the motif 3x3 to judge how it covers a body

// ---- fetch + inline ---------------------------------------------------------------------------
const markup = new Map();
const failed = [];

async function loadAll() {
  await Promise.all(MOTIFS.map(async (m) => {
    try {
      const res = await fetch(m.src, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${res.status}`);
      markup.set(m.key, await res.text());
    } catch (e) {
      failed.push(`${m.key} (${m.src}): ${e.message}`);
    }
  }));
}

/** One motif, optionally repeated into a field. */
function art(m, pal) {
  const svg = markup.get(m.key);
  if (!svg) return `<div style="padding:14px;opacity:.5;font-size:10px">missing</div>`;
  const vars = mask
    ? MASK
    : { ground: H(pal.f[3]), ink: H(pal.ink), fa: H(pal.f[0]), fb: H(pal.f[1]), bead: H(pal.bead) };
  const style = Object.entries(vars).map(([k, v]) => `--${k}:${v}`).join(';');
  const cells = view === 'field' ? REPEAT * REPEAT : 1;
  let inner = '';
  for (let i = 0; i < cells; i++) inner += svg;
  return `<div class="motif ${view}" style="${style}">${inner}</div>`;
}

function tile(m, pal, caption, sub, spare = false) {
  // the src link opens the raw file: that IS the source of truth, and it is what you edit
  const src = m.src ? `<a class="src" href="${esc(m.src)}" target="_blank" title="open the raw SVG">src</a>` : '';
  return `<div class="tile${spare ? ' spare' : ''}"><div class="art">${art(m, pal)}</div>` +
    `<div class="cap"><b>${esc(caption)}</b><em>${esc(sub ?? m.key)}</em>${src}</div></div>`;
}

// ---- page --------------------------------------------------------------------------------------
function render() {
  const pal = PALETTES[((paletteIdx % PALETTES.length) + PALETTES.length) % PALETTES.length];

  // controls
  const ctrls = document.getElementById('controls');
  ctrls.innerHTML =
    `<label>palette <select id="pa">${PALETTES.map((p, i) =>
      `<option value="${i}" ${i === paletteIdx ? 'selected' : ''}>${i} ${esc(p.id)}</option>`).join('')}</select></label>` +
    `<label>view <select id="vw"><option value="field" ${view === 'field' ? 'selected' : ''}>field ${REPEAT}x${REPEAT}</option>` +
    `<option value="tile" ${view === 'tile' ? 'selected' : ''}>single tile</option></select></label>` +
    `<label><button id="mk" class="${mask ? 'on' : ''}">role mask</button></label>` +
    `<span style="opacity:.6">${mask ? 'raw atlas channels' : `palette ${esc(pal.id)}`}</span>`;

  const sync = () => {
    const p = new URLSearchParams();
    p.set('palette', paletteIdx);
    p.set('view', view);
    if (mask) p.set('mask', '1');
    location.search = p.toString();
  };
  ctrls.querySelector('#pa').onchange = (e) => { paletteIdx = +e.target.value; sync(); };
  ctrls.querySelector('#vw').onchange = (e) => { view = e.target.value; sync(); };
  ctrls.querySelector('#mk').onclick = () => { mask = !mask; sync(); };

  // role legend
  const lg = document.getElementById('legend');
  const sw = (cls) => {
    const c = mask ? MASK : { ground: H(pal.f[3]), ink: H(pal.ink), fa: H(pal.f[0]), fb: H(pal.f[1]), bead: H(pal.bead) };
    const v = cls === 'g' ? c.ground : cls === 'fi' || cls === 'si' ? c.ink : cls === 'fa' || cls === 'sa' ? c.fa : cls === 'fb' || cls === 'sib' ? c.fb : c.bead;
    return `<i style="background:${v}"></i>`;
  };
  lg.innerHTML = ROLES.map(([cls, what, slot]) =>
    `<div class="lg">${sw(cls)}<code>${cls}</code> ${esc(what)} <span style="opacity:.55">&rarr; ${esc(slot)}</span></div>`).join('');

  // palettes
  document.getElementById('palettes').innerHTML = PALETTES.map((p) => {
    const keys = [['paper', p.paper], ['ink', p.ink], ['f0', p.f[0]], ['f1', p.f[1]], ['f2', p.f[2]], ['f3', p.f[3]], ['bead', p.bead]];
    return `<div class="pal"><div class="name">${esc(p.id)}</div><div class="chips">${keys.map(([k, v]) =>
      `<div class="chip" title="${k} ${H(v)}" style="background:${H(v)}"><span>${k}</span></div>`).join('')}</div></div>`;
  }).join('');

  // one section per style: its twelve tiles + the anatomy map
  const host = document.getElementById('styleHost');
  host.innerHTML = Object.keys(STYLE_ZONES).map((style) => {
    const ms = motifsFor(style);
    const z = STYLE_ZONES[style];
    const used = new Set(z.tiles);
    // the four tiles not claimed by a zone are spares: the shader can swap one in per seed, and
    // they are where authored placement will go later.
    const tiles = ms.map((m, i) => {
      const spare = !used.has(i);
      const zones = z.tiles.filter((t) => t === i).map((dg) => ZONE_NAMES[dg]);
      const sub = spare ? 'spare' : zones.join(' + ');
      return tile(m, pal, `${i} ${m.label}`, sub, spare);
    }).join('');
    // anatomy: which tile + which colour slot each body group gets
    const zones = ZONE_NAMES.map((nm, dg) =>
      tile({ key: `${style}-${z.tiles[dg]}`, src: `./motifs/${style}/${z.tiles[dg]}.svg` },
        pal, `${dg} ${nm}`, `tile ${z.tiles[dg]} · slot ${z.slots[dg]}`)).join('');
    const dupes = z.tiles.length - new Set(z.tiles).size;
    return `<h2>${esc(style)}</h2><div class="note">${esc(STYLE_NOTES[style] ?? '')}` +
      ` &mdash; <b>${TILES_PER_STYLE} motifs</b>, 8 claimed by zones, ${TILES_PER_STYLE - used.size} spare.` +
      `${dupes ? ` <b style="color:#a33">${dupes} zone(s) reuse a tile</b>` : ' No zone reuses a tile.'}</div>` +
      `<div class="grid" style="grid-template-columns:repeat(6,1fr);max-width:1180px">${tiles}</div>` +
      `<h3>anatomy map &mdash; ${esc(style)}</h3>` +
      `<div class="note">The style maps each of the eight body groups to its own motif and a colour slot.</div>` +
      `<div class="grid" style="grid-template-columns:repeat(4,1fr);max-width:880px">${zones}</div>`;
  }).join('');

  // all motifs: one row per style, twelve across
  document.getElementById('allHost').innerHTML = Object.keys(STYLE_ZONES).map((style) => {
    const used = new Set(STYLE_ZONES[style].tiles);
    const row = motifsFor(style).map((m) =>
      tile(m, pal, `${m.index} ${m.label}`, used.has(m.index) ? '' : 'spare', !used.has(m.index))).join('');
    return `<h3>${esc(style)}</h3><div class="grid" style="grid-template-columns:repeat(12,1fr);max-width:1240px">${row}</div>`;
  }).join('');

  if (failed.length) {
    document.getElementById('loadErr').innerHTML =
      `<b>${failed.length} motif file(s) failed to load:</b><br>` + failed.map(esc).join('<br>');
  }

  document.title = 'MAD:ready:swatch';
  window.__state = { phase: 'ready', motifs: MOTIFS.length, loaded: markup.size, failed: failed.length };
}

await loadAll();
render();
