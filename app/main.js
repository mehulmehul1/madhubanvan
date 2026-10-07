// Viewer: uses the public createAnimal() API end-to-end on the TSL/WebGPU render layer.
// Controls write URL params and reload, so state is shareable/reproducible.
import * as THREE from 'three/webgpu';
import { createAnimal, listSpecies } from '../src/index.js';
import { STYLE_KEYS } from '../src/core/render/madhubani/params.js';

const params = new URLSearchParams(location.search);
const SPECIES = params.get('species') || 'cheetah';
const SEED = Number(params.get('seed') || 7);
const QUALITY = params.get('quality') || 'medium';
const STYLE = params.get('style') || 'natural';
const PALETTE = Number(params.get('palette') || 0);
const MSTYLE = params.get('mstyle') || 'vyaghra';
const VARIANT = params.get('variant') || '';
const BRUSH = params.get('brush') === '1';
const MTILES = params.get('mtiles') || 'bomb';
const MDBG = params.get('mdbg');

// species.variants is declared inconsistently across the base — normalise to {id,name}
const variantList = (species) => (species?.variants || []).map((x) => (typeof x === 'string' ? { id: x, name: x } : { id: x.id ?? x.name, name: x.name ?? x.id }));

const hud = document.getElementById('hud');
const status = (s) => { hud.textContent = s; };
window.__state = { phase: 'boot' };

function fail(err) {
  const msg = String((err && err.stack) || err);
  console.error(err);
  status('ERROR\n' + msg);
  window.__state = { phase: 'error', error: msg };
  document.title = 'MAD:error';
}

function panel(vlist) {
  const ids = listSpecies().sort();
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;right:10px;top:10px;display:flex;gap:8px;align-items:center;font:12px ui-monospace,monospace';
  bar.innerHTML =
    `<select id="sp">${ids.map((i) => `<option ${i === SPECIES ? 'selected' : ''}>${i}</option>`).join('')}</select>` +
    (vlist.length ? `<select id="vr"><option value="">default</option>${vlist.map((v) => `<option value="${v.id}" ${v.id === VARIANT ? 'selected' : ''}>${v.name}</option>`).join('')}</select>` : '') +
    `<label>seed <input id="sd" type="number" value="${SEED}" style="width:56px"></label>` +
    `<select id="q">${['high', 'medium', 'low', 'crowd'].map((q) => `<option ${q === QUALITY ? 'selected' : ''}>${q}</option>`).join('')}</select>` +
    `<select id="st"><option ${STYLE !== 'madhubani' ? 'selected' : ''}>natural</option><option ${STYLE === 'madhubani' ? 'selected' : ''}>madhubani</option></select>` +
    `<select id="ms">${STYLE_KEYS.map((k) => `<option ${k === MSTYLE ? 'selected' : ''}>${k}</option>`).join('')}</select>` +
    `<label>pal <input id="pl" type="number" min="0" max="7" value="${PALETTE}" style="width:40px"></label>` +
    `<button id="rn">random seed</button>` +
    `<label title="silhouette fins (ink outline in Madhubani)">fins <input id="cov" type="checkbox" checked></label>` +
    (STYLE === 'madhubani' ? `<label title="draw the print as fur brush strokes"><input id="br" type="checkbox" ${BRUSH ? 'checked' : ''}> brush fur</label>` : '');
  document.body.appendChild(bar);
  const go = (o) => {
    const p = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(o)) p.set(k, v); // URLSearchParams needs set(), not property assign
    location.search = p.toString();
  };
  // switching species drops the variant (ids are species-specific)
  bar.querySelector('#sp').onchange = (e) => go({ species: e.target.value, variant: '' });
  if (vlist.length) bar.querySelector('#vr').onchange = (e) => go({ variant: e.target.value });
  bar.querySelector('#q').onchange = (e) => go({ quality: e.target.value });
  bar.querySelector('#sd').onchange = (e) => go({ seed: e.target.value });
  bar.querySelector('#st').onchange = (e) => go({ style: e.target.value });
  bar.querySelector('#ms').onchange = (e) => go({ mstyle: e.target.value });
  bar.querySelector('#pl').onchange = (e) => go({ palette: e.target.value });
  bar.querySelector('#rn').onclick = () => go({ seed: Math.floor(Math.random() * 1e6) });
  window.__cover = (on) => window.__animal?.setCoverings(on);
  bar.querySelector('#cov').onchange = (e) => window.__cover(e.target.checked);
  if (STYLE === 'madhubani') bar.querySelector('#br').onchange = (e) => window.__animal?.setBrush(e.target.checked);
}

async function main() {
  status('building ' + SPECIES + ' seed ' + SEED + ' (' + QUALITY + ')…');
  const animal = await createAnimal(SPECIES, {
    seed: SEED, quality: QUALITY, worker: false, ground: () => 0, variant: VARIANT || undefined, brush: BRUSH,
    style: STYLE, palette: PALETTE, madhubaniStyle: MSTYLE, madhubaniSeed: SEED, madhubaniTiles: MTILES,
  });
  window.__animal = animal;
  if (MDBG && animal.render.materials?.mad?.setDebug) animal.render.materials.mad.setDebug(Number(MDBG));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xefe6d6);
  scene.add(animal.object);

  // frame from the bind mesh (geometries carry a 1e6 bounding sphere for culling, so Box3 is unsafe)
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const P = animal.data.pos;
  for (let i = 0; i < animal.data.nV; i++) box.expandByPoint(v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 1.15 || 1;
  const camDist = radius * 2.3;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
    new THREE.MeshStandardNodeMaterial({ color: 0xcfc4ad, roughness: 1.0 }),
  );
  floor.receiveShadow = true;
  scene.add(floor);

  const key = new THREE.DirectionalLight(0xfff3e0, 3.0);
  key.position.set(4, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = radius * 20;
  key.shadow.camera.left = -radius * 2; key.shadow.camera.right = radius * 2;
  key.shadow.camera.top = radius * 2; key.shadow.camera.bottom = -radius * 2;
  scene.add(key, new THREE.HemisphereLight(0xdde6f2, 0x6b6250, 1.4));

  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, Math.max(0.02, radius * 0.01), radius * 60);

  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: !navigator.gpu });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  panel(variantList(animal.species));

  // ---- locomotion controls (the showcase's WASD steering) -----------------------------------
  // W/S: accelerate / brake through the animal's own gears, A/D: turn, Shift: sprint,
  // Space: jump, E/R/T/Y: eat / lie / attack / hit. Speeds come from animal.gears (m/s).
  const keys = new Set();
  window.__keys = keys;
  const gearVals = Object.values(animal.gears || {}).filter((v) => v > 0).sort((a, b) => a - b);
  const maxSpeed = gearVals[gearVals.length - 1] || 2;
  let heading = 0;
  let speed = 0;
  const norm = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  addEventListener('keydown', (e) => {
    const k = norm(e);
    if (k === ' ') { e.preventDefault(); animal.play('jump').catch(() => {}); return; }
    if (k === 'e') animal.play('eat', { loop: true }).catch(() => {});
    else if (k === 'r') animal.play('lie').catch(() => {});
    else if (k === 't') animal.play('attack').catch(() => {});
    else if (k === 'y') animal.play('hit').catch(() => {});
    else keys.add(k);
  });
  addEventListener('keyup', (e) => keys.delete(norm(e)));
  const camTarget = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  const sunRot = new THREE.Matrix3();

  let last = performance.now();
  let frames = 0;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    const accel = maxSpeed * 1.3 * dt;
    if (keys.has('w')) speed = Math.min(maxSpeed, speed + accel * (keys.has('Shift') ? 1.8 : 1));
    else if (keys.has('s')) speed = Math.max(0, speed - accel * 1.6);
    else speed = Math.max(0, speed - accel * 0.8);
    if (keys.has('a')) heading += 1.6 * dt;
    if (keys.has('d')) heading -= 1.6 * dt;
    animal.move({ speed, heading });
    animal.update(dt);
    window.__dbg = { keys: [...keys], speed, heading };

    camTarget.copy(animal.position).add(center);
    const a = now * 0.00018;
    camera.position.set(camTarget.x + Math.sin(a) * camDist, camTarget.y + radius * 0.45, camTarget.z + Math.cos(a) * camDist);
    camera.lookAt(camTarget.x, camTarget.y, camTarget.z);

    // toon bands follow the scene key light: world direction -> the animal's local space
    animal.object.updateMatrixWorld();
    sunDir.copy(key.position).normalize();
    sunRot.setFromMatrix4(animal.object.matrixWorld).invert();
    sunDir.applyMatrix3(sunRot).normalize();
    animal.render.materials.mad?.setSun(sunDir);

    renderer.render(scene, camera);

    frames++;
    if (frames >= 2) {
      const backend = renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
      const st = animal.stats;
      window.__state = { phase: 'ready', backend, species: SPECIES, variant: VARIANT || null, seed: SEED, verts: st.vertices, tris: st.triangles, bones: st.bones, speed, gait: animal.state?.gait };
      status(`${SPECIES}${VARIANT ? '/' + VARIANT : ''} · ${animal.species.plan}/${animal.species.group} · ${STYLE}${STYLE === 'madhubani' ? '/' + MSTYLE : ''} · ${QUALITY}\n${backend} · ${st.vertices} verts · ${st.bones} bones · ${(speed || 0).toFixed(2)}/${maxSpeed.toFixed(2)} m/s · ${animal.state?.gait || 'stand'}\nW/S move · A/D turn · Shift sprint · Space jump · E eat · R lie · T attack · Y hit`);
      document.title = 'MAD:ready:' + backend;
    }
  });
}

addEventListener('error', (e) => fail(e.error || e.message));
main().catch(fail);
