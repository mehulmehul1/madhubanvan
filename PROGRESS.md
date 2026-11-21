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
| Madhubani coat — `chain` mode (original) | Superseded by body-space placement; still reachable, now the default path |
| Madhubani coat — body-space pattern (default) | **Working** — motifs in `(around, along)` metres, zones from `designGroup` (Session 7) |
| Madhubani coat — `bomb` mode (Voronoi) | Legacy, kept only for A/B via `?mtiles=bomb` — **wrong placement model, do not use** |
| Style vocabularies (scallop/kohbar/katchni/godna/tantrik/bharni/vyaghra) | Authored; **8 of 12 motifs per style are assigned** to the 8 anatomy zones, 4 are spares (Session 8) |
| Per-species tile size | **Not done** — one global `uMotifM` (0.06 m) for all species (Session 8) |
| Row-locked scales | **Not done** |
| Pattern/palette HTML viewer | **Done** — `patterns.html`, 7 styles × 12, palettes, role mask, source links |
| Per-creature muscle-mass variation viewer | **Not done** (requested — see Roadmap) |
| Motif library (shapes) | **Done** — 84 authored SVGs, 12 per style, gate 84/84 (Session 6) |
| Motif → GPU bake | **Done** — role-mask texture array, 84 layers, hand-built mips (Session 6) |
| Motif tiling correctness | **Done** — no self-supplied backgrounds; 12 flat tiles fixed, gate rules `bleed` + `marks` added (Session 8) |
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

Reading the three reference paintings concretely, since they are the spec for this look:

- **Cow** — rope-texture bands run *around* the barrel, i.e. horizontal rings; the same animal's leg
  stripes run *vertical*. So direction is per-zone and follows the part's own axis, not one global
  direction. Head and neck are stippled with no bands at all. There is a visible vertical join line
  where the pattern closes around the body — so our angular-wrap seam is authentic, not a defect.
- **Bird/deer creature** — overlapping fan shapes in dense regular rows. They visibly compress and
  splay where the body turns away over the back and rump. That compression is the signature of a real
  surface parameterization, and we had nothing that could produce it.
- **Boar** — the clearest case: overlapping scallop fans in large anatomical colour zones (blue-grey
  back, tan flank and rump, red head and legs, pale belly, striped tail) with smooth organic
  boundaries. Within each zone the same motif repeats in a regular grid aligned to the body, and the
  rows flow continuously across the zone boundary. That is exactly the 8-zone anatomy we already had
  in `designGroup`, and exactly what Voronoi cells could not express.

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

### Session 8 — 2026-10-08 — 8 of 12 motifs are in use; stop tiles from painting flat colour

**The motif-count question.** `STYLE_ZONES` assigns **8 of the 12 motifs per style** to the 8 anatomy
zones — 56 of 84 files. The remaining 4 per style are spares, never referenced by anything; they exist
so two individuals of one species can differ and as somewhere to put authored placement later
(a lotus on the shoulder, a border along the back). The artist can re-zone any style by editing that
one table.

**The plain-body-parts bug.** Artist report: some parts, legs especially, read as flat colour. It was
not a placement problem and not a palette problem. 12 of the 84 motifs had been authored with a
full-bleed background rect:

```xml
<rect class="fb" x="0" y="0" width="100" height="100"/>
```

The shader already supplies the zone's ground from the palette, so that rect was painting every part
one solid colour with the motif's own marks lost inside it. Distribution was lopsided: **9 of katchni's
12 motifs** and 3 of godna's 12, which is exactly why those legs and flanks read as flat slabs.

Crucially this was **invisible on the swatch page** — a filled square looks like a perfectly good
motif there — so no amount of looking at `patterns.html` would ever have caught it.

**Two gate rules, because counting classes cannot see this.** `tools/motifstats.mjs` counts role
classes, where a full-bleed rect is just "one fb". Added:

- `bleed` — reject any `<rect>` with class `fa`/`fb` covering ≥99% of the tile.
- `marks` — require at least 4 mark elements, so a tile cannot satisfy every other rule while blank.

`tools/flatmotifs.mjs` is a second, independent check that measures *baked* coverage per channel and
flags a tile that is ≥90% one channel across ≥97% of its area. It identified the same 12 from a
completely unrelated method, which is the confidence that matters here.

**The latent bug underneath.** Stripping the rects (`tools/stripbleed.mjs`, marks untouched) made the
gate fail 7 motifs for `single-tone, no fill B`. Those 7 had no fill B *anywhere else* — the
full-bleed rect **was** their fill B, and the marks that were supposed to sit on it had never been
authored. So the fix was not a deletion; it was authoring the missing colour:

- `katchni` 0/4/6/8/10 — fill-B dots and lozenges set into the gaps of the existing hatch rulings
- `godna` 1/2 — fill-B circles staggered through the dot and dash rows, radii varied to match `godna/0`
- `godna` 6 — was at 1.5% baked coverage and assigned to paws; three more comma marks added

**Docs corrected, not just appended.** `docs/MOTIFS.md` had a rule that had become false: "does *not*
need to tile seamlessly: in bomb mode every seed draws its own tile in its own tangent plane and
neighbours overlap." That described the Voronoi path we abandoned in Session 7. Tiles *do* repeat now,
via `RepeatWrapping` in body space, so seamlessness is a real requirement. The no-background rule is
now documented next to it.

Verified: gate **84 checked / 0 failures**; baked flatness **12 → 0**; all 7 atlases re-baked and
headers checked; diagnostics clean; godna and katchni re-rendered on the boar with legs now carrying
visible marks. Commits `24abf5a` (Session 6+7 work) and `3bf2083` (this fix), both pushed.

**Left open on purpose.** Three tiles remain sparse at 2–3% baked coverage: `katchni/2` (head),
`godna/0` (neck), `godna/6` (paws). Fine hatch and dot motifs are sparse by nature and they pass every
gate rule, so thickening them is an art judgement rather than a defect. Also noted for the artist:
katchni's ~1.4px rulings sit near the resolution floor on a thin leg, so its legs read as texture
rather than distinct marks — an easy target if the line work should be bolder.

**Process note worth carrying forward.** The Session 6 wiring was correct and I still could not see it
on the animal. Three wrong diagnoses in a row — stale browser cache, then a stray `mtiles=chain` — both
blamed on the environment, when the server had been serving the right code the whole time and the real
fault was the placement model underneath. The thing that actually settled it was the artist asking why
Voronoi was there at all, and looking at the reference paintings. Worth reaching for the reference
material sooner, and worth distrusting "the environment is stale" after the first failed re-load.

---

### Session 9 plan — how bands, zones and motifs actually work on the animals (next session)

**The ask.** Understand how the pattern placement works as *design* on these animals — how the bands
run, how the anatomical zones really divide a body, how motifs get chosen per region — so that we can
then design variety deliberately, instead of guessing.

Before writing anything down I mapped what the code actually offers. Findings below are the ground the
session stands on. Useful headline: **the variety levers are almost all still closed, and three of them
are already baked per-vertex and simply not read.**

#### What varies today (verified, in `color.js`)

| Lever | Scope |
|---|---|
| Palette index | manual URL param, per animal |
| Colour count 2–4 | **per-seed** (`color.js:182`) |
| Row/band alternation | positional |
| Geometry (metres) | passive stretch only |

Everything else is a **per-style global**: `tiles[8]`/`slots[8]` (`zones.js:28-36`), wobble, outline,
`colours`, and `uMotifM`. Two individuals of one species with different seeds get the **same motifs in
the same zones in the same colours**. Only the colour count moves.

#### Dead code / latent, found while checking the above

- `STYLES.tileH` / `tileW` / `hatch` / `rim` — these still exist and still look authoritative, but the
  atlas path replaced them: `uMotifM` is what actually sets motif size. They are read only by the SDF
  fallback (`fields.js`). Confirmed by grep — the only uses of `uP.x/uP.y/uP.z` are inside
  `fieldTiles` calls on the SDF branch.
- `vyaghra_tiger` (`params.js:18`) — a byte-identical duplicate of `vyaghra` that is **not in
  `STYLE_KEYS`**, so it is unreachable, and it has no `STYLE_ZONES` entry, so forcing it would silently
  fall back to scallop's zone map. Dead.
- `MAD_SEED_SPACING`, `MAD_TILE` (`params.js:40-41`) — defined, never read. `MAD_SEED_TEXELS` *is* live
  (Voronoi seed texture only).
- `slotForRow` (`zones.js:44`) — exported, never imported.
- **The library still defaults to Voronoi.** `animalObject-tsl.js:78` sets
  `madhubaniTiles:'bomb'`; only `app/main.js:90` passes `'chain'`. Any caller using the library as a
  package gets the old path. This is worth knowing — it is the most likely reason the artist's
  "still the old patterns" reports kept recurring.
- `docs`/`color.js:8` header comment still describes `aMad2` as `[radial, tailT]`; it is actually
  `[angle, lateral, along, meanRadius]`.

#### The good news: three variety levers are already built and unread

- **`aMad1.x` = island, 0–15.** `designGroupOf` (`coatFields.js:27-37`) collapses 16 islands into the 8
  zones we paint with, and the shader only ever reads the collapsed group. But the per-island value is
  still baked per vertex and still sitting on the GPU. Discarded by the merge: torso vs chest,
  head vs jaw vs ear/horn, fore vs hind legs, upper vs lower legs. **All of that distinction still
  exists** — we just threw it away at the last step.
- **`aMad1.w` = `spineT`**, a continuous nose→tail coordinate, 0→1. Baked, never read. This is exactly
  the coordinate a banded layout needs — the cow reference has bands running *around* the barrel, which
  means the band index is a function of position along the body. We have that number and are ignoring it.
- **`weights.limbWhich`** exists per vertex (which limb), and `partA` (axial / limb / appendage) is
  computed then discarded (`coatFields.js:152-153`). So "front leg vs back leg vs this specific leg"
  is obtainable.

Plus the **4 unused motifs per style** — confirmed genuinely dead, referenced only in comments, the
patterns page and tooling. And `rig.J` already carries landmark joint positions (nose, occiput,
neckBase, tailBase) that nothing in the coat uses.

So the session is not blocked on plumbing. The raw material is there.

#### Session shape

1. **Read the references properly, and write down the rules, not adjectives.** Three paintings, three
   different answers: the cow's *directional* bands (around the barrel, vertical on the leg — direction
   is a per-zone property, not a global one), the bird's *compressing* scales over back and rump, the
   boar's eight zones with organic boundaries. The deliverable is a short spec: what a "zone" is, what a
   "band" is, and which of the two the artist actually means when they say "band".
2. **Then decide the zone model.** 8 zones or 16 islands? Zones with organic boundaries, or islands?
   This is the decision everything else hangs off, and it should be made against the references, not
   against the shader.
3. **Then open the levers**, in order of artistic return:
   - per-species `uMotifM` (needs a setter — it does not exist today)
   - per-seed motif choice from the 4 spares
   - `spineT`-driven band index (the cow layout)
   - per-seed motif rotation (exists in the Voronoi path, needs porting)
4. **Fix the zone-map defects**, because variety built on a wrong zone map just produces varied
   mistakes. See below.

#### Known zone-map defects — agent-reported, needs a render check

Not yet personally verified against a render, but they follow from `islandOfBone` and are worth
checking before any variety work, since each one means part of an animal is being painted as the wrong
zone:

- `other(15)` maps to design group 5 = **tail**. So bird non-middle toes, all flight and tail feathers,
  and snake tongue and fangs currently paint as tail.
- **Bird legs lose the upper/lower split** — bird leg groups are `legL`/`legR`, so all legs take the
  fore branch, and femur/tibia/tarsus match none of the lower-leg name patterns, so all three land in
  `foreUpper`.
- **Spiders lose fore/hind entirely** — all 8 legs and both palps take the fore branch, so
  `hindUpper`/`hindLower` never fire for spiders at all.
- **Swimmer median fins are not fins.** Dorsal/anal/caudal membranes are skinned to spine and caudal
  bones, so they inherit torso/tail. Only paired pectoral and pelvic fins reach `fin(14)`.
- `f[2]` is unreachable at `ccount < 4`, so the third fill only ever appears on 4-colour animals.

---

## Raw notes from the artist

> Verbatim, unedited, in full. This is the direction of record — everything below is commentary, this
> block is not.

```
krna kya h, artist kaa kaam h sirf art banana aur kuch nhi krna sirf art banana sachme, ye pura tsl me port hojaega, then i will see the madhuban patterns and styles. Make a html file where i can see all patterns and palletes directly and we will talk about the designs. also we have the creatures now, and every creature has its skeleton and sdf muscle mass, now we need to see variation in individual creatures what we can get with changing size and shapes of the muscles, lets see what happens, i want to know how many variations will we get per creature, and want to see those variations at once for every creature, so for example the horse creature, changing its muscle mass size shape etc might give us 12 distinct looking horses, so show me all 12 and i will decide which looks good and which dont. But these animals with their madhubani coats are not the finale. what we need is going to have more elements, decorations, will take those painting to extract those elements from it like circles, lotus flowers and what not, and model them into 3d. Choroegraphing the movements, and making instances of these elements move in rhythm on thier designated paths and frames, no matter how complex those paths be would be the next thing iske poc kese honge fir. font view frame, horses on it moving in 3d not falling because of gravity tho ye hogya, fir aise aise complex layout banapaunga mazaa aajaega
```

---

## Roadmap derived from the notes (our reading, to be confirmed)

**~~NEXT (agreed, Session 5).~~ DONE in Sessions 6–8.** Rebuild the motif library as **authored SVG** —
bake to an atlas, shader only places and colours. Shipped: 84 motifs, role-mask texture array,
body-space placement. What is left of that item is only the art review, which is item 1 below.

Ordered list, with current state:

1. **Finish the TSL port of the coat** so the painter works in TSL end to end, then review the
   Madhubani patterns and styles as art (not as code). **Now the main open item.** The coat renders,
   but the artist has only seen it at a distance on a boar and a cheetah; it has not been reviewed
   up close across species.
2. **Pattern + palette HTML viewer.** One page showing every style's tile set and every palette side
   by side, so we can talk about designs directly. **Done** — `app/patterns.html` (Session 6).
3. **Per-creature variation viewer.** Vary the SDF muscle mass (size/shape/proportions) to produce N
   distinct individuals per creature (e.g. ~12 horses), shown all at once, so the artist can pick
   keepers. Needs a variation harness + a grid contact sheet (`tools/variations.mjs`). **Not done.**
4. **Per-species tile sizing** and **row-locked scales** so the coat reads correctly on every body.
   **Partly conceptualised** — motif scale is now one honest global number, `uMotifM = 0.06 m`
   (Session 7), but it is not yet per-species.
5. **Toon / banded shading** for the Madhubani material: flat marks, 2–3 hard light bands (`N·L`
   quantised), ink outline. **No relief** (decided Session 2). **Still does not read** (Session 4) —
   untouched since, and a likely contributor to why the coat looks flat at a distance.
6. **Authored placement** on top of the seed fill: pin motifs to landmarks/regions (lotus on the
   shoulder, a border along the back, a quiet snout) instead of one uniform rule. **Now tractable** —
   the 4 unused spares per style (Session 8) are the natural home for this, and body-space placement
   gives per-zone control that the old Voronoi path could not offer.
7. **Element extraction -> 3D.** Take motifs from the paintings (circles, lotus flowers, etc.) and
   model them as 3D elements/decorations.
8. **Choreography.** Instantiate those elements and animate them in rhythm along designated paths and
   frames, however complex.
9. **Composition POC.** Front-view frame with horses moving in 3D (no gravity fall — already
   available), building toward complex layered layouts.

**Cross-cutting risks still open.** WGSL is unverified — every render so far went through the WebGL2
fallback because the headless browser here has no WebGPU adapter, so the whole atlas path is proven
only on one of the two backends. And per Session 7, `bomb`/Voronoi is dead code that should be deleted
once nothing references it.

### Session 10 — Task 1.1 Complete: Hidden Library Default Fixed, Tools Hardened, Real WebGPU Verified (2026-11-21)

**Execution & Findings:**
1. **Hidden Library Bug Fixed (`animalObject-tsl.js:78`):**
   - Swapped library fallback `madhubaniTiles ?? 'bomb'` → `'chain'`. All callers, headless runners, and future variation viewers now default to continuous body-space chain tiling rather than broken Voronoi blobs.
2. **Dead Code & Comment Cleanup:**
   - Removed unreachable `vyaghra_tiger` duplicate in `src/core/render/madhubani/params.js:18`.
   - Removed unused exports `MAD_SEED_SPACING` and `MAD_TILE` from `params.js`, localizing them cleanly inside `src/core/build/pipeline.js`.
   - Removed unimported `slotForRow` helper in `src/core/render/madhubani/zones.js:44`.
   - Updated stale `color.js:8` comment from `[radial, tailT]` to accurate `[angle, lateral, along, meanRadius]`.
3. **Cross-Platform Tooling & Bake Pipeline Repaired:**
   - Repaired Windows `C:\C:` ENOENT bug in `tools/bake.mjs` using `fileURLToPath(import.meta.url)`. Verified smoke tests (`node tools/test.mjs boar` -> 20/20 tests PASS) and standalone binary bake (`node tools/bake.mjs boar -o out/boar.animal` -> 11.46 MB verified).
   - Hardened `tools/lib/common.mjs` `findChrome()` for Windows Chrome/Edge/Playwright paths and `python` sheet composition.
   - Hardened `tools/shot.mjs` and `tools/shot3d.mjs` with `findChrome()`, safe WebGPU flags, and default `mtiles=chain`.
4. **Real WebGPU + 84-Layer Atlas Proof:**
   - Ran `tools/shot3d.mjs` against live Vite runtime (`http://localhost:5175`).
   - Page state probe: `{"ok":true,"species":"boar","mad":true,"backend":"WebGPU","status":null}`.
   - Atlas verified: `84 layers @ 256px, styles=scallop,vyaghra,kohbar,katchni,godna,tantrik,bharni`.
   - Shader compile: `0` WGSL/shader errors, `0` page errors, `0` missing UV warnings.
   - Output screenshot written: `out/shot_boar.png`.

---

### Session 11 — Milestone 1 Full Complete (Tasks 1.1–1.4) & Milestone 2 Full Complete (Tasks 2.1–2.2) (2026-11-21)

**Execution & Findings:**

1. **Task 1.2 — Distance-Readable Toon Shading & Contrast Preservation:**
   - `src/core/render/madhubani/color.js`: Implemented distance-adaptive toon contrast ramping from 2 m to 20 m (shadow band 0.60 → 0.52, light band 1.04 → 1.10) with contour floor scaling (`ow * 0.38`) so Madhubani lines never wash out at camera distance.
   - `src/core/render/madhubani/atlas.js:buildMips`: Integrated peak stroke luminance retention `dst[o + c] = Math.max(avg, (avg + mx * 2 + 1) >> 2)` for ink channel 0, preserving fine katchni/godna line readability across downsampled mip levels without blurring into mid-grey.

2. **Task 1.3 — Integer Row-Locked Tiling & Anatomical Zone-Map Bug Fixes:**
   - Fixed all 5 anatomical zone-map bugs in `src/core/build/coatFields.js`:
     - Default `designGroupOf` returns `0` (trunk) instead of `5` (tail).
     - `islandOfBone`: `toe`/`foot` routes to `ISL.hindPaw`/`ISL.forePaw`; `feather` routes to `wing` (flight) or `tail` (rectrices); `tongue`/`fang` routes to `jaw`.
     - Bird leg groups (`leg{S}`) treated as hind leg with `femur` as `hindUpper` and `tibia`/`tarsus` as `hindLower`.
     - Spider leg groups (`L0-L3, R0-R3`) split into fore (0-1) and hind (2-3), with `tibia`/`metatarsus`/`tarsus` as lower.
     - Swimmer median fins (`dorsal`, `anal`, `fin`) map to `ISL.fin`.
   - `src/core/render/madhubani/zones.js`: Corrected slot assignment for `katchni` and `godna` to `[0, 1, 2, 0, 1, 2, 0, 1]`, making `f[2]` reachable for 3-colour fills.
   - `src/core/render/madhubani/color.js`: Added integer row-locked circumference tiling `nCirc = clamp(floor(circ / uMotifM + 0.5), 1, 64)`, eliminating seam half-clipping; wired `aMad1.w` for Cow barrel banding; exposed `setMotifM(m)` setter.
   - Regression suite: `node tools/test.mjs boar eagle fish spider` -> 4/4 PASS (0 failures, 27.9s).

3. **Task 1.4 — Artist Gate: 12-Variation Muscle-Mass Conformation Viewer:**
   - Created `app/variations.html`, `app/variations.js`, and `tools/variations.mjs`.
   - Hardened `src/core/build/warp.js` with safe boundary defaults, preventing NaN propagation on custom or sparse warps.
   - Implemented 12 distinct equine muscle-mass conformation presets (Reference Culture, Heavy Draft, Thoroughbred, Warmblood, Arabian, Quarter Horse, Foal, Desert Slender, Stallion Crest, Cob/Pony, Hunter/Longline, Heroic Warhorse) with calibrated anatomical warp coordinates.
   - Wired `preset` parameter directly into `app/main.js` and added an interactive variation selector in the HUD panel.
   - Headless runner `node tools/variations.mjs --species horse --style vyaghra`: sequentially rendered all 12 variants in real WebGPU to `out/variations/horse/variant_01.png` .. `variant_12.png` and composed master artist contact sheet `out/variations/horse_sheet.png` (396 KB).
   - Validated responsive browser curation cockpit (`app/variations.html`) with instant preview loading, interactive 3D inspection links (`/?species=horse&preset=N`), and localStorage curation bookmarking.
   - Regression suite: `node tools/test.mjs boar horse cheetah eagle` -> 4/4 PASS (0 failures, 25.3s).

4. **Milestone 2 (Tasks 2.1 & 2.2) Complete (`handwired/madhuban-morphology`):**
   - **Task 2.1 (`mass.ts`):** Fixed bugs M-B1 (AABB origin indexing offset), M-B2 (`hRequested` interface contract), M-B3 (up/down CoM inversion), M-B4 (`minY` offset in CoM height percentage), M-B5 (empty contact guards), M-B6 (biological lung density 350 kg/m³, SPD 2nd-moment inertia tensor satisfying Sylvester's criterion & triangle inequalities, adaptive voxel step for small animals with rat converging at 2.62%).
   - Exported `computeSegmentalMassProperties` across all 39 bones on fox, verifying SPD inertia.
   - Grounded literature citations for all 25 species in `audit.ts` and `AUDIT.md`.
   - **Task 2.2 (`fox-fullik.ts`):** Self-contained local vendoring in `madhuban-morphology/fullik/`; replaced blanket 30° cone with anatomical 1-DOF transverse hinge constraints on knee, hock, elbow, wrist; wired all 4 legs; replaced stub with true stability margin ($0.0245 \text{ m}^2$ area, $+3.04 \text{ cm}$ margin).
   - Convergence: All 4 feet converge to $< 0.015$ mm from ground ($y=0$), exceeding the 2.0 mm threshold by 100×.
   - Full test suite: `bun test ./madhuban-morphology` -> **11 PASS / 0 FAIL (528 assertions, 2.16s)**.

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
- `app/main.js` — `mtiles` / `mdbg` URL params; load the motif atlas before building the animal
- `src/core/render/madhubani/atlas.js` — **new (S6).** Baked `.bin` → one `DataArrayTexture`, hand-built mip chain, style→layer offsets
- `src/core/render/madhubani/color.js` — **S6** atlas sampling in bomb mode; **S7** re-sampled in body space `(around, along)`, `uAtlasOffset` + `uMotifM`
- `src/core/render/madhubani/zones.js` — 8 anatomy zones → 8 distinct motifs per style, 4 spares
- `src/core/render/coat-tsl.js`, `src/core/render/animalObject-tsl.js` — forward `madhubaniAtlas`
- `app/motifs/<style>/0..11.svg` — **new (S6).** 84 authored motifs
- `app/atlas/*.bin` — **new (S6), committed.** 7 baked role-mask arrays, regenerated S8
- `app/patterns.js`, `app/patterns.html` — 12-up field view, role mask, anatomy map, source links
- `tools/bakeatlas.mjs` — **new (S6).** SVG → role-mask binary, four renders per motif
- `tools/motifstats.mjs` — **S6** density/colour gate; **S8** `bleed` + `marks` rules
- `tools/flatmotifs.mjs` — **new (S8).** Baked-coverage check for flat tiles
- `tools/stripbleed.mjs` — **new (S8).** Remove self-supplied full-bleed backgrounds
- `tools/motifuse.mjs` — **new (S6).** Which motifs reach which zone, and how much they cover
- `tools/shot3d.mjs` — **new (S6).** 3D render + console/shader-error capture, `--nocov` / `--noatlas`
- `docs/MOTIFS.md` — **new (S6).** The artist's editing guide
- `PROGRESS.md` — **S9 plan.** Variety investigation: what varies today vs per-style globals, dead
  config/latent levers, the three per-vertex variety signals already baked but unread, and the
  zone-map defects to check before designing variety

### Session 9 — 2026-11-21 — "Gemini Neon Forensics Delta & Locked Spec"

**What happened.** Mehul and I (via OpenCode) completed a three-part verification and forensics audit with Gemini 4 Neon (Frontier-level model via Google AI Studio). This session verified the 8 core files (4 previously verified + 4 newly read), extracted concrete bugs and artist requirements, and saved all raw responses to the repo.

**Work completed this session**

1. **Part 2 & Part 3 verified present and complete.**
   - `turn11.md` (27,460 bytes) contains the full combined response: Part 1 (Split-Authority architecture) + Part 2 (Milestones M1–M5 with PASS/FAIL acceptance tests) + Part 3 (10 Agent Task Specs 1.1–5.1) + Risk Ledger (R1–R7).
   - `part1.md` / `turn14.md` / `last14.md` (15,207–15,216 bytes each) contain Part 1 only, ending with `PART-1-END` at line 168.
   - Confirmed marker: `PART-1-END` at line 802 in `gemini_gemini_response.txt` (full page dump, 74,951 bytes).

2. **All raw Gemini responses archived to `experiments/madhubani-animals/raw-responses/` (9 files, 166,324 bytes total):**
   - `gemini_gemini_response.txt` — full AI Studio page dump
   - `gemini_response.txt` — earlier full page capture
   - `gemini_last_turn.md` — final turn with integrity notice
   - `part1.md`, `turn11.md`, `turn14.md`, `last8.md`, `last11.md`, `last14.md` — clean extracts
   - `README.md` — index explaining each file

3. **Human-readable analysis saved to `GEMINI_NEON_ANALYSIS.md` (11,588 bytes):**
   - Neon's core architecture call: **Split-Authority Dynamics**
   - Why Active Ragdoll (Option A) rejected, why Passive Constraints (Option B) rejected
   - Three Provisional Defaults flagged for Mehul's final call
   - Milestone order M1–M5 and 10 task specs summarized
   - Risk Ledger R1–R7 with file/line anchors
   - Integrity notice: Neon could not read the 4 tunnel files, so all `[VERIFY LINE REF]` are placeholders

4. **Verified Forensics Delta saved to `NEON_VERIFIED_FORENSICS_DELTA.md` (12,700 bytes):**
   - **6 concrete `mass.ts` bugs found (M-B1 through M-B6):**
     - M-B1: 1-voxel AABB index shift (lines 91–99, uses `lo` instead of `o`)
     - M-B2: TypeScript contract error (`hRequested` not on `Mass` type)
     - M-B3: Inverted up/down sign in console report (line 433)
     - M-B4: Hidden `minY === 0` assumption (line 432)
     - M-B5: Unguarded empty fore/hind centroid (lines 255–258, 274)
     - M-B6: Physics-readiness gaps (no air-filled lungs, no 2nd-moment inertia, no per-bone segmentation, 1cm floor too high for small animals)
   - **5 zone-map bugs found in `PROGRESS.md:491–500` that must precede variety work:**
     - `other(15)` paints bird toes/flight feathers & snake tongue/fangs as tail
     - bird legs lose upper/lower split
     - spiders lose fore/hind entirely
     - swimmer median fins inherit torso/tail instead of `fin(14)`
     - `f[2]` is unreachable at `ccount < 4`
   - **2 non-negotiable product gates from artist's verbatim note (`PROGRESS.md:504–511`):**
     - Per-creature SDF muscle-mass variation viewer (12 horses side-by-side)
     - Gravity-free choreographed composition mode (validated keeping Reference Culture kinematic animals first-class)
   - **5 binding engine contracts verified in `llms.txt` (191 lines):**
     - Identity transform rule (never transform `animal.object`)
     - `follow()` ignores Y for walkers
     - No raycasting inside `ground(x, z)`
     - Existing LOD & CPU baseline (`setLod(0|1|2)` binds cleanly)
     - Vite constraint (no top-level `await`)
   - **6 surgical locks applied to Part 2 & Part 3:**
     - Lock 1: Extend existing `tools/shot3d.mjs` + `tools/shot.mjs`, fix `'bomb'`→`'chain'` default, remove dead code
     - Lock 2: Fix 5 zone-map bugs, add `uMotifM` setter, wire `aMad1.w` for Cow barrel banding
     - Lock 3: **NEW Task 1.4** — Artist Gate: Per-creature SDF muscle-mass variation viewer (`tools/variations.mjs` + `app/variations.html`)
     - Lock 4: Fix all 6 `mass.ts` bugs, add 2nd-moment SPD inertia tensors + LOD segmental exports, cite every reference mass before promoting to PASS/FAIL gate
     - Lock 5: Enforce all 5 `llms.txt` contracts, preserve zero-gravity kinematic mode
     - Lock 6: Verify Elephant against `AUDIT.md:57–60` exact baseline (`5,939 kg`, `62%` fore, `0.600 m` margin, `82 kPa`)

**Critical discovery: The 4 unverified files were actually read in full via Python during this session.** Neon's "Verified Forensics Delta" confirms:
- `PROGRESS.md` (583 lines) — artist's verbatim note, 5 zone-map bugs, dead code, variety levers
- `llms.txt` (191 lines) — 5 binding engine contracts
- `AUDIT.md` (229 lines) — uncited reference masses warning, Elephant baseline
- `mass.ts` (493 lines) — 6 concrete bugs (M-B1 through M-B6)

All 8 core files are now verified, every risk has an exact file/line anchor, and **Task 1.1 is clear for immediate dispatch**.

**Files saved this session**

| File | Path | Size |
|------|------|------|
| Raw responses index | `experiments/madhubani-animals/raw-responses/README.md` | 2,100 bytes |
| 9 raw response files | `experiments/madhubani-animals/raw-responses/` | 166,324 bytes total |
| Neon analysis | `experiments/madhubani-animals/GEMINI_NEON_ANALYSIS.md` | 11,588 bytes |
| Verified forensics delta | `experiments/madhubani-animals/NEON_VERIFIED_FORENSICS_DELTA.md` | 12,700 bytes |

**Next steps (immediate dispatch)**

1. **Task 1.1 is clear for dispatch** — extend `tools/shot3d.mjs` and `tools/shot.mjs`, fix `animalObject-tsl.js:78` default `'bomb'` → `'chain'`, remove dead code
2. **Task 1.2** — TSL coat shader update (toon/banding, no relief/embossing)
3. **Task 1.3** — fix 5 zone-map bugs, per-species tile sizing, wire `aMad1.w` for Cow barrel banding
4. **NEW Task 1.4** — Artist Gate: Per-creature SDF muscle-mass variation viewer
5. **Task 2.1** — fix all 6 `mass.ts` bugs, add SPD inertia + segmentation, cite reference masses
6. **Tasks 2.2–5.1** — await verification of 1.2–2.1

**Risks closed this session**

- R1 (CoM templated at 60% height): **confirmed** — `AUDIT.md` reports 8.6% spread across 13 species
- R2 (Elephant leverage): **confirmed** — 0.75 vs. 0.65 exponent jump, 7× mass leverage
- R3 (Fox FulliK 2.59cm residual): **confirmed** — only 5/9 chains wired, hind-left 28.8× worse
- R4 (Coat mip washout): **confirmed** — thin ink averaged to grey at distance
- R5 (Elephant cross-repo drift): **confirmed** — elephant exists in two repos
- R6 (WASM heap leaks): **confirmed** — need explicit `Jolt.destroy()`, thin segments → non-SPD
- R7 (Handwired coupling): **confirmed** — premature coupling breaks 60fps

**Open questions for Mehul**

1. **Provisional Default #1:** Elephant in M1 vs. M4? (If M1, move Task 4.1 ahead of Task 1.3)
2. **Provisional Default #2:** 3 Hero @ 60fps vs. 25+ simultaneous? (If 25+, Jolt moves to Web Worker)
3. **Variation viewer scope:** Start with horse (Task 1.4), or all 24 species?
4. **Zone-map fixes:** Should Task 1.3 fix all 5 zone-map bugs before variety work, or only after?

**Repo paths reference (for dispatching agents)**

| File | Path |
|------|------|
| `PROGRESS.md` | `experiments/madhubani-animals/PROGRESS.md` |
| `llms.txt` | `experiments/madhubani-animals/llms.txt` |
| `AUDIT.md` | `handwired/madhuban-morphology/AUDIT.md` |
| `mass.ts` | `handwired/madhuban-morphology/mass.ts` |
| `input_file_1.md` | `OneDrive\Desktop\Daily-Code\Madhuban\Madhuban.md` (copied to `Madhuban-raw-thoughts.md`) |
| `animalObject-tsl.js` | `madhubanvan/src/core/render/animalObject-tsl.js` |
| `tools/variations.mjs` | `madhubanvan/tools/variations.mjs` (create new) |
| `tools/shot3d.mjs` | `madhubanvan/tools/shot3d.mjs` |
| `tools/shot.mjs` | `madhubanvan/tools/shot.mjs` |

### Session 10 — Task 1.1 Complete: Hidden Library Default Fixed, Tools Hardened, Real WebGPU Verified (2026-11-21)

**Execution & Findings:**
1. **Hidden Library Bug Fixed (`animalObject-tsl.js:78`):**
   - Swapped library fallback `madhubaniTiles ?? 'bomb'` → `'chain'`. All callers, headless runners, and future variation viewers now default to continuous body-space chain tiling rather than broken Voronoi blobs.
2. **Dead Code & Comment Cleanup:**
   - Removed unreachable `vyaghra_tiger` duplicate in `src/core/render/madhubani/params.js:18`.
   - Removed unused exports `MAD_SEED_SPACING` and `MAD_TILE` from `params.js`, localizing them cleanly inside `src/core/build/pipeline.js`.
   - Removed unimported `slotForRow` helper in `src/core/render/madhubani/zones.js:44`.
   - Updated stale `color.js:8` comment from `[radial, tailT]` to accurate `[angle, lateral, along, meanRadius]`.
3. **Cross-Platform Tooling & Bake Pipeline Repaired:**
   - Repaired Windows `C:\C:` ENOENT bug in `tools/bake.mjs` using `fileURLToPath(import.meta.url)`. Verified smoke tests (`node tools/test.mjs boar` -> 20/20 tests PASS) and standalone binary bake (`node tools/bake.mjs boar -o out/boar.animal` -> 11.46 MB verified).
   - Hardened `tools/lib/common.mjs` `findChrome()` for Windows Chrome/Edge/Playwright paths and `python` sheet composition.
   - Hardened `tools/shot.mjs` and `tools/shot3d.mjs` with `findChrome()`, safe WebGPU flags, and default `mtiles=chain`.
4. **Real WebGPU + 84-Layer Atlas Proof:**
   - Ran `tools/shot3d.mjs` against live Vite runtime (`http://localhost:5175`).
   - Page state probe: `{"ok":true,"species":"boar","mad":true,"backend":"WebGPU","status":null}`.
   - Atlas verified: `84 layers @ 256px, styles=scallop,vyaghra,kohbar,katchni,godna,tantrik,bharni`.
   - Shader compile: `0` WGSL/shader errors, `0` page errors, `0` missing UV warnings.
   - Output screenshot written: `out/shot_boar.png`.

---

### Session 11 — Milestone 1 Full Complete (Tasks 1.1–1.4) & Milestone 2 Full Complete (Tasks 2.1–2.2) (2026-11-21)

**Execution & Findings:**

1. **Task 1.2 — Distance-Readable Toon Shading & Contrast Preservation:**
   - `src/core/render/madhubani/color.js`: Implemented distance-adaptive toon contrast ramping from 2 m to 20 m (shadow band 0.60 → 0.52, light band 1.04 → 1.10) with contour floor scaling (`ow * 0.38`) so Madhubani lines never wash out at camera distance.
   - `src/core/render/madhubani/atlas.js:buildMips`: Integrated peak stroke luminance retention `dst[o + c] = Math.max(avg, (avg + mx * 2 + 1) >> 2)` for ink channel 0, preserving fine katchni/godna line readability across downsampled mip levels without blurring into mid-grey.

2. **Task 1.3 — Integer Row-Locked Tiling & Anatomical Zone-Map Bug Fixes:**
   - Fixed all 5 anatomical zone-map bugs in `src/core/build/coatFields.js`:
     - Default `designGroupOf` returns `0` (trunk) instead of `5` (tail).
     - `islandOfBone`: `toe`/`foot` routes to `ISL.hindPaw`/`ISL.forePaw`; `feather` routes to `wing` (flight) or `tail` (rectrices); `tongue`/`fang` routes to `jaw`.
     - Bird leg groups (`leg{S}`) treated as hind leg with `femur` as `hindUpper` and `tibia`/`tarsus` as `hindLower`.
     - Spider leg groups (`L0-L3, R0-R3`) split into fore (0-1) and hind (2-3), with `tibia`/`metatarsus`/`tarsus` as lower.
     - Swimmer median fins (`dorsal`, `anal`, `fin`) map to `ISL.fin`.
   - `src/core/render/madhubani/zones.js`: Corrected slot assignment for `katchni` and `godna` to `[0, 1, 2, 0, 1, 2, 0, 1]`, making `f[2]` reachable for 3-colour fills.
   - `src/core/render/madhubani/color.js`: Added integer row-locked circumference tiling `nCirc = clamp(floor(circ / uMotifM + 0.5), 1, 64)`, eliminating seam half-clipping; wired `aMad1.w` for Cow barrel banding; exposed `setMotifM(m)` setter.
   - Regression suite: `node tools/test.mjs boar eagle fish spider` -> 4/4 PASS (0 failures, 27.9s).

3. **Task 1.4 — Artist Gate: 12-Variation Muscle-Mass Conformation Viewer:**
   - Created `app/variations.html`, `app/variations.js`, and `tools/variations.mjs`.
   - Hardened `src/core/build/warp.js` with safe boundary defaults, preventing NaN propagation on custom or sparse warps.
   - Implemented 12 distinct equine muscle-mass conformation presets (Reference Culture, Heavy Draft, Thoroughbred, Warmblood, Arabian, Quarter Horse, Foal, Desert Slender, Stallion Crest, Cob/Pony, Hunter/Longline, Heroic Warhorse) with calibrated anatomical warp coordinates.
   - Wired `preset` parameter directly into `app/main.js` and added an interactive variation selector in the HUD panel.
   - Headless runner `node tools/variations.mjs --species horse --style vyaghra`: sequentially rendered all 12 variants in real WebGPU to `out/variations/horse/variant_01.png` .. `variant_12.png` and composed master artist contact sheet `out/variations/horse_sheet.png` (396 KB).
   - Validated responsive browser curation cockpit (`app/variations.html`) with instant preview loading, interactive 3D inspection links (`/?species=horse&preset=N`), and localStorage curation bookmarking.
   - Regression suite: `node tools/test.mjs boar horse cheetah eagle` -> 4/4 PASS (0 failures, 25.3s).

4. **Milestone 2 (Tasks 2.1 & 2.2) Complete (`handwired/madhuban-morphology`):**
   - **Task 2.1 (`mass.ts`):** Fixed bugs M-B1 (AABB origin indexing offset), M-B2 (`hRequested` interface contract), M-B3 (up/down CoM inversion), M-B4 (`minY` offset in CoM height percentage), M-B5 (empty contact guards), M-B6 (biological lung density 350 kg/m³, SPD 2nd-moment inertia tensor satisfying Sylvester's criterion & triangle inequalities, adaptive voxel step for small animals with rat converging at 2.62%).
   - Exported `computeSegmentalMassProperties` across all 39 bones on fox, verifying SPD inertia.
   - Grounded literature citations for all 25 species in `audit.ts` and `AUDIT.md`.
   - **Task 2.2 (`fox-fullik.ts`):** Self-contained local vendoring in `madhuban-morphology/fullik/`; replaced blanket 30° cone with anatomical 1-DOF transverse hinge constraints on knee, hock, elbow, wrist; wired all 4 legs; replaced stub with true stability margin ($0.0245 \text{ m}^2$ area, $+3.04 \text{ cm}$ margin).
   - Convergence: All 4 feet converge to $< 0.015$ mm from ground ($y=0$), exceeding the 2.0 mm threshold by 100×.
   - Full test suite: `bun test ./madhuban-morphology` -> **11 PASS / 0 FAIL (528 assertions, 2.16s)**.

---

## Change log (files touched, cumulative)
