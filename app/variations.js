import { STYLE_KEYS } from '../src/core/render/madhubani/params.js';

const horseWarps = ({ leg = 1, len = 1, girth = 1, head = 1 } = {}) => [
  { type: 'legs', k: leg, top: 0.95 },
  { type: 'length', k: len, z0: -0.62, z1: 0.62 },
  { type: 'girth', k: girth, cy: 1.25, z0: -0.7, z1: 0.75 },
  { type: 'scaleAbout', c: [0, 2.05, 1.2], k: head, r0: 0.2, r1: 0.4 },
];

export const VARIATION_PRESETS = [
  { id: 1, name: 'Reference Culture (Yardstick)', desc: 'Canonical baseline sculpt & proportions', overrides: {} },
  { id: 2, name: 'Heavy Draft (Coldblood)', desc: 'High girth (+30%), heavy crest, massive neck', overrides: { crest: 1.55, size: 1.15, warps: horseWarps({ girth: 1.30, leg: 0.90 }) } },
  { id: 3, name: 'Thoroughbred (Speed/Leggy)', desc: 'Elongated limbs (+25%), lean flank, high wither', overrides: { size: 1.05, warps: horseWarps({ leg: 1.25, girth: 0.85, len: 1.12 }) } },
  { id: 4, name: 'Warmblood (Athletic)', desc: 'Balanced sport musculature, tall stature', overrides: { crest: 1.15, size: 1.06, warps: horseWarps({ girth: 1.08, leg: 1.04 }) } },
  { id: 5, name: 'Arabian (Arched & Compact)', desc: 'High arched crest, dished face, short compact back', overrides: { crest: 1.45, warps: horseWarps({ len: 0.85, girth: 0.90, head: 1.15 }) } },
  { id: 6, name: 'Quarter Horse (Powerful Haunches)', desc: 'Stocky compact frame, heavy shoulder & rump', overrides: { crest: 0.90, warps: horseWarps({ girth: 1.25, leg: 0.90, len: 0.90 }) } },
  { id: 7, name: 'Foal / Juvenile (Leggy Growth)', desc: 'Juvenile proportions, slender body, 60% adult size', overrides: { age: 'juvenile', size: 0.60 } },
  { id: 8, name: 'Desert Slender (Agile)', desc: 'Narrow deep chest, ultra-lean barrel', overrides: { warps: horseWarps({ girth: 0.82, leg: 1.12 }) } },
  { id: 9, name: 'Stallion (Dominant Crest)', desc: 'Maximal crest thickness (+70%), broad chest', overrides: { sex: 'male', crest: 1.70, size: 1.10, warps: horseWarps({ girth: 1.18 }) } },
  { id: 10, name: 'Cob / Pony (Compact & Sturdy)', desc: 'Short cannons (-22% legs), wide barrel, 75% height', overrides: { size: 0.75, warps: horseWarps({ girth: 1.22, leg: 0.78, len: 0.85 }) } },
  { id: 11, name: 'Hunter / Longline', desc: 'Extended spine (+15%), athletic shoulder angle', overrides: { warps: horseWarps({ len: 1.18, leg: 1.05, girth: 1.02 }) } },
  { id: 12, name: 'Warhorse (Monumental)', desc: 'Exaggerated heroic mass (+22% size, +80% crest, +35% girth)', overrides: { size: 1.22, crest: 1.80, warps: horseWarps({ girth: 1.35, len: 1.10 }) } },
];

let activeSpecies = 'horse';
let activeStyle = 'vyaghra';

async function init() {
  const status = document.getElementById('status');
  if (!status) return; // Only execute when DOM is variations.html

  const params = new URLSearchParams(location.search);
  if (params.get('species')) activeSpecies = params.get('species');
  if (params.get('style')) activeStyle = params.get('style');

  const spSelect = document.getElementById('speciesSelect');
  if (spSelect) {
    spSelect.value = activeSpecies;
    spSelect.addEventListener('change', (e) => {
      activeSpecies = e.target.value;
      buildGrid();
    });
  }

  const stSelect = document.getElementById('styleSelect');
  if (stSelect) {
    stSelect.value = activeStyle;
    stSelect.addEventListener('change', (e) => {
      activeStyle = e.target.value;
      buildGrid();
    });
  }

  const copyBtn = document.getElementById('copyCuratedBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const saved = JSON.parse(localStorage.getItem(`curated_${activeSpecies}`) || '[]');
      const kept = VARIATION_PRESETS.filter((p) => saved.includes(p.id));
      const summary = kept.map((k) => `#${k.id} ${k.name} (${k.desc})`).join('\n');
      navigator.clipboard.writeText(summary);
      alert(`Copied ${kept.length} curated variations to clipboard:\n\n` + summary);
    });
  }

  const renderBtn = document.getElementById('renderAllBtn');
  if (renderBtn) {
    renderBtn.addEventListener('click', () => {
      alert(`To re-render all 12 ${activeSpecies} variations with WebGPU and generate contact sheet, run:\nnode tools/variations.mjs --species ${activeSpecies} --style ${activeStyle}`);
    });
  }

  await buildGrid();
}

async function buildGrid() {
  window.__variationsReady = false;
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  const status = document.getElementById('status');

  const curatedKey = `curated_${activeSpecies}`;
  const curatedIds = new Set(JSON.parse(localStorage.getItem(curatedKey) || '[]'));

  for (const p of VARIATION_PRESETS) {
    const card = document.createElement('div');
    card.className = 'card' + (curatedIds.has(p.id) ? ' curated' : '');
    card.id = `card_${p.id}`;

    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `<span>#${p.id} ${p.name}</span><button class="curate-btn ${curatedIds.has(p.id) ? 'active' : ''}">${curatedIds.has(p.id) ? '★ Kept' : 'Keep'}</button>`;

    const btn = header.querySelector('.curate-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (curatedIds.has(p.id)) {
        curatedIds.delete(p.id);
        card.classList.remove('curated');
        btn.classList.remove('active');
        btn.textContent = 'Keep';
      } else {
        curatedIds.add(p.id);
        card.classList.add('curated');
        btn.classList.add('active');
        btn.textContent = '★ Kept';
      }
      localStorage.setItem(curatedKey, JSON.stringify([...curatedIds]));
      updateStatus();
    });

    const imgWrap = document.createElement('div');
    imgWrap.className = 'card-img-wrap';
    const img = document.createElement('img');
    img.className = 'card-img';
    img.src = `/variations/${activeSpecies}/variant_${String(p.id).padStart(2, '0')}.png`;
    img.alt = p.name;
    img.onerror = () => {
      imgWrap.innerHTML = `<div style="font-size:11px;color:#887766;text-align:center;padding:20px;">[Variant #${p.id} Preview Pending]<br><a href="/?species=${activeSpecies}&preset=${p.id}&style=madhubani&mstyle=${activeStyle}&mtiles=chain" target="_blank" style="color:#b84a28;">Open 3D Live</a></div>`;
    };
    imgWrap.appendChild(img);

    const body = document.createElement('div');
    body.className = 'card-body';
    body.textContent = p.desc;

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.innerHTML = `<span>Seed: ${p.id} · ${activeStyle}</span><a class="inspect-link" href="/?species=${activeSpecies}&preset=${p.id}&style=madhubani&mstyle=${activeStyle}&mtiles=chain" target="_blank">Inspect in 3D ↗</a>`;

    card.appendChild(header);
    card.appendChild(imgWrap);
    card.appendChild(body);
    card.appendChild(footer);
    grid.appendChild(card);
  }

  function updateStatus() {
    status.textContent = `12 ${activeSpecies} variations · ${curatedIds.size}/12 kept for artist curation`;
  }
  updateStatus();

  window.__variationsReady = true;
}

window.addEventListener('DOMContentLoaded', init);