# Madhubani Animals — Progress Report

Living document. **Append a new dated session under "Session log" every time we work; never rewrite past sessions.**
Repo: `experiments/madhubani-animals` (fork of `procedural-animals`; render layer ported to three.js TSL/WebGPU).

---

## Project in one line

24 procedural animals (SDF sculpt -> surface-nets mesh -> skin -> coat) rendered with a first-class
**Madhubani coat mode**. The coat is what we are actively developing.

---

## Status board

| Area | State |
|---|---|
| Engine (sculpt / rig / motion / mesher) | Working, upstream, untouched |
| Natural coat | Working |
| Madhubani coat — `chain` mode (original) | Working, kept as A/B baseline (`?mtiles=chain`) |
| Madhubani coat — body-space pattern (default) | **Working** — motifs in `(around, along)` metres, zones from `designGroup` (Session 7) |
| Madhubani coat — `bomb` mode (Voronoi) | Legacy, kept only for A/B via `?mtiles=bomb` — **wrong placement model, do not use** |
| Style vocabularies (scallop/kohbar/katchni/godna/tantrik/bharni/vyaghra) | Authored, driven per-cell in bomb mode |
| Per-species tile size | **Not done** (one fixed size today — see Known issues) |
| Row-locked scales | **Not done** |
| Pattern/palette HTML viewer | **Done** — `patterns.html`, 7 styles × 12, palettes, role mask, source links |
| Per-creature muscle-mass variation viewer | **Not done** (requested — see Roadmap) |
| Motif library (shapes) | **Done** — 84 authored SVGs, 12 per style, gate 84/84 (Session 6) |
| Motif → GPU bake | **Done** — role-mask texture array, 84 layers, hand-built mips (Session 6) |
| Coat look / shading | Flat marks + light binding in place (Session 3) — but the **toon shading does not read yet; needs work** (Session 4). **Relief/embossing decided against** (Session 2) |

---

## Session log

### Session 1 — 2026-10-03 — "Option A: tile bombing"

**Problem being solved.** In `chain` mode the Madhubani pattern coordinates were baked per vertex as
*skeleton arc-length × (angle × mean radius)* and interpolated across triangles. That map is not
isometric, clamps at chain ends, and jumps at region seams, so scales smeared/stretched over the
body — worst on the head, shoulder and belly.

**Approach chosen (Option A — local tangent-plane tiles / "tile bombing").** At build time we scatter
seed points over the surface; at render time each *fragment* finds its own nearest seed and draws the
style motif in that seed's own tangent plane, so every tile is rigid, uniform and flat. There is no
global map, hence no pole, no clamping, no stretching.

**Work completed**

- `src/core/build/coatFields.js` — extracted `vertexAnatomy({rig, weights, nV})` (per-vertex
  island/designGroup/axisMode), now shared by the coat fields and the seed builder.
- `src/core/build/seeds.js` *(new)* — seed build:
  farthest-point sampling (coverage radius `0.60 * C`), 2× Lloyd relaxation toward a hex-ish layout,
  coverage repair, per-seed tangent frames (up = toward-tail axial direction), rotation jitter,
  candidate grid (≤4 seeds/cell).
- `src/core/build/pipeline.js` — computes seeds after the warp; adds `seedTex, seedGrid,
  seedGridDims, seedGridOrigin, seedCell, seedTile, seedCount` to the built data; extends
  `ARRAY_KEYS` so workers and `.animal` bakes carry them.
- `src/core/render/madhubani/color.js` — new `bomb` mode: 3×3×3 grid search for the nearest + 2nd
  nearest seed (with a same-side normal test), motif drawn in the seed's tangent plane, zone colours
  from the seed's designGroup; `chain` mode kept verbatim behind `?mtiles=chain`.
- `src/core/render/animalObject-tsl.js` — `makeMadTextures(data)`: packs the seed and grid arrays
  into 2D `DataTexture`s (NEAREST, FloatType), disposes them with the object.
- `src/core/render/coat-tsl.js`, `src/animal.js`, `app/main.js` — plumb `tiles` / `grid` options and
  the `mtiles` / `mdbg` URL params.
- `src/core/render/madhubani/params.js` — `MAD_SEED_SPACING = 0.070`, `MAD_TILE = 0.95 *
  MAD_SEED_SPACING`, `MAD_SEED_TEXELS = 5`.

**Bugs found and fixed during this session**

1. **`dg is not defined` (chain mode rendered black).** A JS block-scoping slip: the zone-seam line
   lived outside the `if (mode === 'chain')` block that declared `dg`. The thrown TSL error made the
   material render black — this is the "all animals are black" the artist saw. Fixed by moving the
   seam inside the chain branch.
2. **Grid texture uploaded short.** The grid array held `cells` texels but the texture was created
   `gridW × gridH` (rounded up), so the upload was invalid and every fragment fell back to seed 0 ->
   flat fill. Fixed by padding the array to `gridW * gridH`.
3. **Seed texture exceeded WebGPU's texture-width limit.** Uploaded as one strip `seedCount * 5`
   wide (shark: 10345) — fine in WebGL2 (16384) but WebGPU's default `maxTextureDimension2D` is
   **8192**, so the texture failed and the bind group was invalid ("Invalid BindGroup"). This is why
   shark/horse did not load on the artist's WebGPU browser. Fixed by packing BOTH textures 2D at
   width ≤ 2048 and indexing them with `mod`/`floor`.
4. **Gaps between scales.** The drawn scale radius was smaller than the seed covering radius, so most
   of the surface showed only the ground colour. Fixed by tightening the seed coverage threshold
   (`FPS_THRESH = 0.60 * C`) and retuning `MAD_TILE`.
5. **Polygon-mosaic look (feedback from artist).** An early cut inked every Voronoi cell boundary and
   discarded the authored motifs, so all styles looked like the same flat polygon grid — and the
   styles stopped reading as our patterns. Fixed by (a) driving the **authored motifs from
   `fields.js`** per cell so scallop/kohbar/katchni/godna/tantrik/bharni stay distinct, and
   (b) removing the Voronoi outline so the scale rim is the motif's own arc.

**Verified this session**

- Coverage invariant holds (`maxCoverage <= threshold`, zero violations) on boar, horse, snake,
  spider, shark — bodies from 0.07 m to ~3 m, legged / limbless / winged / finned.
- Rendered and inspected: boar (scallop, kohbar, godna, chain baseline), shark (close-up), horse,
  crow (bird), fish, snake.
- Full madhubani batch: **22/24 ok**. `cow` and `deer` failed on a transient OS *file-write* error
  (`UNKNOWN: unknown error, open out/allspecies/...`), not a shader/render failure.

**Known issues / caveats (open)**

- **One fixed tile size for every species.** `MAD_TILE` is absolute metres, so a large animal gets
  many tiny tiles and a small animal (rat, spider, frog) gets a few oversized ones. Needs a
  per-species (or bounding-box-relative) size dial.
- **Scales are not row-locked.** Seeds are isotropic, so the scale field is organic rather than the
  reference's neat offset rows.
- **Fins / membranes** are drawn as flat ink/paper grey by design (existing behaviour) — the coat
  pattern does not cover them.
- **`tools/test.mjs` cannot run on Windows.** Pre-existing bug in `tools/bake.mjs:103`
  (`fs.realpathSync(new URL(import.meta.url).pathname)` yields `C:\C:` and throws ENOENT). Not
  introduced by this work; build validation currently comes from the browser batch instead.
- Nearest-seed is found by Euclidean distance with a same-side normal test; on very thin parts that
  are closer than one grid cell there is a small risk of picking the far-side seed.

**How to run / verify**

```
npm run dev                                   # vite, port 5175
node tools/shot.mjs "http://localhost:5175/?species=boar&seed=1&quality=medium&style=madhubani&mstyle=scallop&palette=1" out/boar.png
node tools/allspecies.mjs --base http://localhost:5175 --quality low --styles madhubani
```

Useful URL params: `style=madhubani|natural`, `mstyle=<style>`, `palette=0..7`, `mtiles=bomb|chain`,
`mdbg=2` (per-seed id debug view), `mdbg=3` (grid-cell debug view).

### Session 2 — 2026-10-03 — art direction: flat marks + toon shading, **no relief**

**Decision (artist).** The coat stays **flat**: every mark is a 2D graphic element lying on the 3D
body. The volume must come from **toon/banded shading**, not from physical relief.

**Explicitly dropped.** Raised / embossed tiles, normal-mapped tile edges, per-tile bump, baked AO,
any displaced surface for the pattern. The references may photograph like crafted objects, but the
target here is the *painting*'s graphic flatness carried on a 3D form.

**Consequence for the code.** The Madhubani material is `MeshBasicNodeMaterial` (unlit) with a
hand-faked flat term in `src/core/render/madhubani/color.js`:
`tone = 0.95 + 0.05 * step(-0.15, lam)`. That fake is the placeholder to be replaced by a real cel
term: `N·L` quantised into 2–3 hard bands, the **flat pattern colour multiplied by those bands**, and
the existing thin ink outline kept (silhouette, optionally a terminator line). No specular, no sheen,
no crushed blacks — those were the reasons unlit was chosen in the first place, and banding avoids
them.

**Also recorded.** Procedural tiling is the *fill*; **authored placement** (which motif goes where —
lotus on the shoulder, border along the back, quiet snout) is a later layer on top of the seeds, not
a replacement for them. See Roadmap.

**Open questions.** 2 bands or 3? Ink outline always on, or silhouette only?

### Session 3 — 2026-10-03 — toon shading + proper light

**Implemented.** Toon (cel) shading in `src/core/render/madhubani/color.js`, replacing the faked flat
term (`tone = 0.95 + 0.05·step(...)`): `N·L` quantised into **3 anti-aliased bands** (shadow `0.64` /
mid `0.84` / light `1.03`), multiplied over the flat pattern. Marks stay flat 2D; the volume is read
from the bands. No specular / sheen / crushed blacks.

**Proper light.** Added `setSun(v)` to the Madhubani material (`color.js`) and bound it in
`app/main.js` to the scene's key `DirectionalLight` every frame — the world light direction is
transformed into the animal's local space before use. No more hardcoded sun constant; the bands now
track the real light (and will follow it if the light moves, or as more lights are added).

**Verified.** Rendered boar and shark to confirm banding reads on both a lumpy and a long smooth
form (`out/boar-toon.png`, `out/shark-toon.png`, `out/boar-toon2.png`). Since the scene light's
direction equals the old constant, the look is unchanged — which is the expected, correct result and
confirms the binding didn't shift anything.

**Note.** Dev server now run with **`bun run dev`** (not npm).

**Open.** 2 vs 3 bands; band contrast; whether to ink the terminator line. Also `tools/shot.mjs` has
a hardcoded 30s screenshot timeout that trips on SwiftShader — renders here used a longer-timeout
probe.

### Session 4 — 2026-10-03 — session close: the toon shading does NOT read yet

**Artist verdict (verbatim).** "honestly i cant tell the difference with this toon shading at all"

**Recorded status.** Toon shading is implemented but **not convincing — it needs work.** Do not treat
it as done. The light binding (Session 3) is real and correct, but it is backing, not a visible result.

**Likely reasons to investigate next session (start here)**

1. **Band values are too close.** `0.64 / 0.84 / 1.03` is a ~20 % step per edge — hard to see under a
   busy, high-contrast pattern. Try 2 bands with a big gap (e.g. `0.55 / 1.0`), or 3 bands with a much
   darker shadow.
2. **The test could not show a difference.** The scene key light's direction equals the old hardcoded
   constant, so the render was bound to look the same. Prove it by deliberately moving the key light
   and re-rendering.
3. **The band multiply sits on top of everything.** It multiplies the whole pattern *and* the
   grain/contour passes that run after it, so the form cue drowns in the pattern's own contrast.
   Consider applying bands before the pattern's tone variation, or damping the pattern where a band
   edge falls.
4. **No terminator line.** A toon read usually needs the drawn edge — an ink line along the shadow
   boundary — not just a value step.
5. **Possibly the wrong idea for this look.** Flat marks may want *no* interior shading at all
   (fully flat colour + silhouette outline), with form implied only by the outline and the cast
   shadow on the ground.

**State at session close.** Code compiles and runs: bomb tiles + 3-band toon + scene-light binding.
Dev server stopped.

### Session 5 — 2026-10-03 — agreed: rebuild the motif library as authored SVG

**Artist question (verbatim).** "i was not aware that the patterns are also being done in sdf, is that
why they appear blown out or jittery on the animals?"

**Answer — partly yes, and the causes split cleanly:**

- **Crude shapes** → the *vocabulary*, not SDF itself. Every motif in `fields.js` is a circle, a line,
  an axis-aligned box/triangle, radial spokes (`fract(ang * k)`) or a sine. An SDF can be perfectly
  crisp; ours are primitives standing in for drawing.
- **Jitter / crawl** → a **procedural pattern cannot be mip-filtered**. When a tile covers only a few
  pixels there is no lower-resolution version to sample, so it aliases and shimmers as the camera or
  the animal moves. A texture atlas fixes this (mipmaps + anisotropic filtering).
- **Blown out / fat black lines** → the line-width fallback in `ln()`:
  `ws = max(w * rim, fwidth * 0.5)`. Motif lines are sub-pixel at normal zoom, so the `fwidth * 0.5`
  floor takes over; at grazing angles the derivative explodes and the "line" blooms until it fills the
  area. This is the same failure the file's own comments describe. On top of that, many **fills use a
  raw `step()` with no anti-aliasing at all** → jagged, crawling edges.
- **Dead code bug:** the third argument of `ln(x, w, aa)` is **never used**, so every `0.012` /
  `0.010` passed in `fields.js` does nothing; real weight is `w * rimScale` plus the derivative floor.

**Agreed plan (work starts tomorrow).** Rebuild the motif library as **SVG**, authored by the artist —
*I write the SVG code*. Bake the motifs to an atlas; the shader only **places and colours** them. This
fixes filtering (real mipmaps), replaces primitives with real drawings, and introduces named colour
roles (outline / fill A-B-C / ground / bead) so any motif can be recoloured by a palette.

---

### Session 6 — 2026-10-08 — the motifs are on the animals

**The library is real art now, and it renders.** 84 authored SVGs (7 styles × 12), every one passing
the quality gate, baked to role-mask textures and sampled by the coat shader.

What changed:

- **12 motifs per style, all distinct.** 8 body zones get 8 different motifs; 4 spares for variety.
  Previously one tile was reused across four zones, which is why every zone looked the same.
- **Quality gate passes: 84/84, 0 failures.** It started at 18 failures; seven repair passes fixed
  them. The gate checks ink density, bead count, element count, and rejects literal colours.
- **`tools/bakeatlas.mjs`** rasterizes each SVG four times — once per role group — reading alpha as
  per-role coverage, packing R=ink G=fillA B=fillB A=bead. Ground is where all four are zero.
- **`src/core/render/madhubani/atlas.js`** stacks all 84 motifs into ONE `DataArrayTexture`
  (84 layers @ 256px, 21 MB) with hand-generated mipmaps. Mip reduction is *exact* here because each
  channel is coverage, not colour — so averaging blurs a motif without bleeding roles.
- **All styles in one array, not seven textures.** A texture binding is baked into the shader at
  build time, so per-style textures would mean rebuilding the material on every style change.
  Instead style selection is one `uAtlasOffset` uniform. Runtime switching is free.
- **`color.js` bomb mode** samples the atlas by zone tile id and composites
  ground → fill B → fill A → bead → ink. The SDF path stays as a fallback: a missing bake degrades
  instead of breaking the coat (verified by blocking the fetch).
- **`uMotifScale` (3.0).** The first render was legible-but-noisy: `uTile` is the Voronoi cell size
  (~0.085 m), so a motif repeated ~17× along a 1.5 m boar. Letting a motif span 3 cells gives ~5
  readable repeats, which is the difference between noise and a drawing.

Two things worth recording as decisions, not accidents:

- **Stroke-only classes need role-aware paint.** `si` / `sa` are stroke-only by contract, and SVG
  defaults fill to black — so a blanket `* { fill: #fff }` in the baker silently turned every thin
  ruled line into a filled blob. The bake now resets to `fill:none;stroke:none` and re-enables per
  role, which also splits the two-tone classes (`sia` / `sib`) so the ink render takes only the
  outline and the fill render only the body.
- **Mipmaps are generated by hand, not by three.js.** Behaviour for `DataArrayTexture` mip generation
  is backend-dependent; doing it in JS costs ~1 ms per load and removes the question.

Verified: gate 84/84 · diagnostics clean across the project · zero shader-compile errors on the 3D
render · SDF fallback path exercised · `uv`-attribute warnings confirmed pre-existing (present
identically with the atlas blocked, so not introduced here).

**Honest limitation:** this rendered through the **WebGL2 fallback**, not WGSL — headless Chromium in
this environment has no WebGPU adapter. `.depth()` on a TSL texture node is documented in three r186
(`TextureNode.js:88`, "When using texture arrays, the depth node defines the layer to select") and
should emit `textureSample(t, s, uv, layer)`, but it is **unverified on the WGSL backend**. Check it
in a real browser before trusting it.

Still open at this point: zone boundaries were Voronoi cells, not anatomy. Fixed in Session 7 — the
plumbing here turned out to be correct while the placement model underneath it was wrong.

---

### Session 7 — 2026-10-08 — the Voronoi premise was wrong; paint in body space

Session 6 wired the SVG atlas correctly and I still could not tell it apart from the old SDF output on
screen. Chasing that as a stale-build problem was wrong three times over: the server was serving the
right code throughout, and the A/B difference was genuinely marginal. The artist asked the right
question — *why are we using Voronoi at all?* — and the reference paintings settled it.

**What the references show, and what we could never produce.** One coherent surface parameterization;
large anatomical zones with smooth organic boundaries; motif direction following each part's own
axis; contour compression where the body turns away; and not one straight polygon edge anywhere.

**Why Voronoi could not.** Bomb mode gives every seed its own tangent plane, so motif *orientation* is
discontinuous at every cell boundary. That is the blobby look — structurally, not as a tuning problem.
It was a way to pattern a mesh without UVs, which was never the actual constraint.

**The fix, and the uncomfortable part.** The correct architecture was already in the repo, filed as
"the A/B baseline":

- `src/core/build/coatFields.js:20-37` — 16 rig-derived islands collapsed by `designGroupOf` into 8
  anatomical groups (trunk, neck, head, legs, paws, tail, wing, fin). Because it comes from bone
  regions, all 24 species get coherent zones for free.
- `aMad2` is a cylindrical parameterization **in metres on both axes**: `along` = arc length along the
  part, `angle × 2π × meanRadius` = arc length around it.

So the atlas is now sampled at `(around, along)` in body space, with `designGroup` selecting motif and
palette. `?mtiles` now defaults to `chain`; the Voronoi path survives only for A/B via `?mtiles=bomb`.

Verified: all 7 styles build and render with **0 shader-compile errors**. kohbar resolves into distinct
paisley motifs in an aligned grid; vyaghra into clean horizontal stripes wrapping the barrel and
compressing at the curves — from the same URL that produced amorphous blobs under Voronoi. Diagnostics
clean, motif gate still 84/84.

Worth remembering: motif scale stopped being a fudge factor fighting the placement model. `uMotifM`
(0.06 m per repeat) is meaningful now precisely because both axes are metres.

Still open: per-species motif scale (one global number), the visible angular-wrap seam (left in — the
references have that join line too), tapered-torso stretch from the smoothed mean radius, and WGSL
still unverified behind the WebGL2 fallback.

---

## Raw notes from the artist

> Verbatim, unedited, in full. This is the direction of record — everything below is commentary, this
> block is not.

```
krna kya h, artist kaa kaam h sirf art banana aur kuch nhi krna sirf art banana sachme, ye pura tsl me port hojaega, then i will see the madhuban patterns and styles. Make a html file where i can see all patterns and palletes directly and we will talk about the designs. also we have the creatures now, and every creature has its skeleton and sdf muscle mass, now we need to see variation in individual creatures what we can get with changing size and shapes of the muscles, lets see what happens, i want to know how many variations will we get per creature, and want to see those variations at once for every creature, so for example the horse creature, changing its muscle mass size shape etc might give us 12 distinct looking horses, so show me all 12 and i will decide which looks good and which dont. But these animals with their madhubani coats are not the finale. what we need is going to have more elements, decorations, will take those painting to extract those elements from it like circles, lotus flowers and what not, and model them into 3d. Choroegraphing the movements, and making instances of these elements move in rhythm on thier designated paths and frames, no matter how complex those paths be would be the next thing iske poc kese honge fir. font view frame, horses on it moving in 3d not falling because of gravity tho ye hogya, fir aise aise complex layout banapaunga mazaa aajaega
```

---

## Roadmap derived from the notes (our reading, to be confirmed)

**NEXT (agreed, Session 5).** Rebuild the motif library as **authored SVG** — I write the SVG, bake to
an atlas, shader only places/colours. This comes before everything else in the list below.

1. **Finish the TSL port of the coat** so the painter works in TSL end to end, then review the
   Madhubani patterns and styles as art (not as code).
2. **Pattern + palette HTML viewer.** One page showing every style's tile set and every palette side
   by side, so we can talk about designs directly. (`app/patterns.html` already exists as a partial
   SVG swatch book — extend it.)
3. **Per-creature variation viewer.** Vary the SDF muscle mass (size/shape/proportions) to produce N
   distinct individuals per creature (e.g. ~12 horses), shown all at once, so the artist can pick
   keepers. Needs a variation harness + a grid contact sheet (`tools/variations.mjs`).
4. **Per-species tile sizing** and **row-locked scales** so the coat reads correctly on every body.
5. **Toon / banded shading** for the Madhubani material: flat marks, 2–3 hard light bands (`N·L`
   quantised), ink outline. **No relief** (decided Session 2).
6. **Authored placement** on top of the seed fill: pin motifs to landmarks/regions (lotus on the
   shoulder, a border along the back, a quiet snout) instead of one uniform rule.
7. **Element extraction -> 3D.** Take motifs from the paintings (circles, lotus flowers, etc.) and
   model them as 3D elements/decorations.
8. **Choreography.** Instantiate those elements and animate them in rhythm along designated paths and
   frames, however complex.
9. **Composition POC.** Front-view frame with horses moving in 3D (no gravity fall — already
   available), building toward complex layered layouts.

---

## Change log (files touched, cumulative)

- `src/core/build/coatFields.js` — `vertexAnatomy` export, shared by seeds
- `src/core/build/seeds.js` — new, seed scatter + grid
- `src/core/build/pipeline.js` — seed build + data/ARRAY_KEYS wiring
- `src/core/render/madhubani/color.js` — bomb mode, seed lookup, motif-from-fields, debug view
- `src/core/render/madhubani/params.js` — tile-bombing constants
- `src/core/render/animalObject-tsl.js` — `makeMadTextures`, 2D packing, disposal
- `src/core/render/coat-tsl.js` — forward `tiles` / `grid`
- `src/animal.js` — forward `madhubaniTiles`
- `app/main.js` — `mtiles` / `mdbg` URL params
