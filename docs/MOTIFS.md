# Editing the motifs

The motif library is **plain SVG files on disk**. They are the source of truth. There is no build
step, no compile, no code to touch. Edit a file, save, refresh the browser, see the change.

```
app/motifs/<style>/<index>.svg     7 styles x 12 motifs = 84 files
```

Open <http://localhost:5175/patterns.html> to see them. Edit in any text editor (VS Code is fine).
Hard-refresh if the browser seems to be showing you a stale copy (`Ctrl+Shift+R`).

## The one rule: paint into ROLES, never into colours

A motif never hardcodes a colour. It paints into named **roles**, and the page binds each role to a
palette slot. That is the whole reason one drawing serves all eight palettes, and it is also exactly
what the baked texture array will store later — so the atlas bake is a straight read of these same
classes, with no second contract to maintain.

| class | paints | palette slot |
|---|---|---|
| `g` | fill, ground | `f[3]` — the pale end of the ramp |
| `fi` | fill, ink | `ink` |
| `fa` | fill, A | `f[0]` |
| `fb` | fill, B | `f[1]` |
| `bd` | fill, bead | `bead` |
| `si` | stroke ink, **no fill** | `ink` |
| `sa` | stroke A, **no fill** | `f[0]` |
| `sia` | stroke ink + fill A | `ink` over `f[0]` |
| `sib` | stroke ink + fill B | `ink` over `f[1]` |

**So:** to change a colour, change the **palette** in the dropdown — never the SVG.
To change which role a shape paints into, edit the SVG.

```xml
<!-- correct: this shape follows the palette -->
<path class="sib" stroke-width="3" d="M8,52 C24,30 54,28 76,44 Z"/>

<!-- WRONG: this shape is frozen to one colour and ignores every palette -->
<path fill="#C0392B" stroke="#1E1710" d="M8,52 C24,30 54,28 76,44 Z"/>
```

Also forbidden: `fill="rgb(...)"`, `style="fill:..."`, named colours like `fill="red"`, and
`fill="none"` — the CSS already sets `fill: none` on `si`/`sa`, so writing it yourself is redundant
and the gate flags it.

## Geometry rules

- `viewBox="0 0 100 100"` with `width="100" height="100"`.
- **Every stroked element needs an explicit `stroke-width`** and `stroke-linejoin="round"`. The CSS
  supplies colour only, never width — so a `<path class="si">` with no `stroke-width` draws with
  hairline width and will look wrong.
- A motif is **one self-contained tile** that should cover most of its cell. It does *not* need to
  tile seamlessly: in bomb mode every seed draws its own tile in its own tangent plane with a small
  rotation, and neighbours overlap. That is why a motif may bleed past its viewBox on purpose
  (`M-8,...` or `...,108`) — often it should.
- Real bezier curves (`C`) for drawn shapes. Straight `<line>` and shape-by-`<polygon>` read as
  clip-art, which is the exact failure the move from SDF to SVG exists to fix. Small accents — a
  bead, an eye, a centre dot — may be `<circle>`.

## The quality gate

```sh
node tools/motifstats.mjs           # full table
node tools/motifstats.mjs --quiet   # failures only, exits non-zero
```

It counts role-class density in each file's **source** and fails on:

| rule | why |
|---|---|
| ground rect present | otherwise the marks float on the page background |
| fill B used somewhere | the project's rule is *always multi-colour, varied* |
| beads ≤ 30% (bharni ≤ 25%) | a tile denser in dots than fill reads as noise |
| ink (`fi`+`si`) ≤ 45–55% by style | too much ink renders nearly black — the "blown out / fat black lines" failure |
| ≤ 20–24 elements | density must come from stroke width and spacing, not from piling on elements |
| no literal colour in source | keeps the palette system intact |

Limits are per-style because the families differ by nature: `katchni` (line work) is mostly stroke so
it gets 55% ink; `bharni` (filled) must be mostly mass so it gets 45%. See `LIMITS` in the tool.

The gate is a guard rail, not an art authority. If you deliberately want a bead-heavy or very black
tile, change it — but change the threshold in `tools/motifstats.mjs` too, so the gate keeps telling
the truth.

## The twelve per style

Each style owns twelve motifs. **Eight are claimed one-per-body-zone** and **four are spares**.

- The zone map is in `src/core/render/madhubani/zones.js`. Every zone takes a *distinct* tile — no
  motif is reused across two zones. (The old four-per-style layout put `scallop` tile 0 on four
  zones, which is why the anatomy row read as the same motif repeated.)
- The spares are what the shader can swap in per seed, so two individuals of one species are not
  identically marked. They are also where authored placement goes later — lotus on the shoulder, a
  border along the back.
- Names and the drawing intent each must satisfy: `TILES` in `app/motifs/manifest.js`.

The zone assignments are a **proposal**, not a decision. They are meant to be argued with and moved.

## Workflow if you use a drawing tool

Editing the XML directly is the clean path. If you draw in Illustrator / Figma / Inkscape instead:

1. Draw the motif. Keep it inside `0 0 100 100`.
2. Export as SVG.
3. **Map your colours back onto roles** before saving — pick each of your flat colours and replace it
   with the role class whose palette slot it represents. This is the step that matters; an export
   will carry literal `fill="#..."` and break palette switching.
4. Set an explicit `stroke-width` on every stroked element.
5. Drop it in `app/motifs/<style>/<index>.svg` and refresh.
6. Run `node tools/motifstats.mjs --quiet`.

Step 3 is the only fiddly bit. If you would rather not do it by hand, say so and I will write a
small tool that takes an exported SVG and rewrites literal fills into role classes from a colour
picker.

## Step 2 after every edit: re-bake

The animals do not read the SVG files directly. SVG has no mipmaps, so the shader cannot filter it at
distance — the coat would shimmer into static as the animal moved away from camera. Instead each SVG
is rasterized once into a **role-mask texture**:

| channel | role |
| --- | --- |
| R | ink coverage |
| G | fill A coverage |
| B | fill B coverage |
| A | bead coverage |

Ground is simply where all four are zero. Because each channel is a coverage mask and not a colour,
averaging them is exactly correct — mip reduction blurs a motif into a paler version of itself and
never bleeds one role's colour into another.

So after editing any SVG:

```sh
npm run bake:motifs           # writes app/atlas/<style>.bin for all 7 styles
npm run bake:motifs:verify    # re-reads them and prints per-layer coverage
node tools/motifstats.mjs --quiet   # the source-quality gate
```

`app/atlas/*.bin` is **committed**, so a clone renders the real motifs without needing a headless
browser. Re-bake and commit whenever you change a drawing.

To see it on an animal rather than on the swatch page:

```
http://localhost:5175/?style=madhubani&species=boar&mstyle=<style>&seed=7
```

Untick **fins** in the toolbar — the fur shells are drawn over the coat and hide the pattern.

## How a motif reaches the animal

The pattern lives in **body space**, not in a mesh UV map and not in per-cell tangent planes. Every
vertex already carries, from `src/core/build/coatFields.js`:

- `aMad1.y` = **designGroup** — which anatomical region the vertex is on
- `aMad2.z` = **arc length along** that part, in metres
- `aMad2.x` = **angle around** it, 0..1
- `aMad2.w` = mean radius, so angle × 2π × radius = **arc length around**, in metres

So the shader's pattern coordinate is `(around, along)` in metres on both axes. A square motif stays
square and the same size everywhere, rows compress where the body curves away, and the motif
orientation runs continuously across the whole animal instead of restarting at every cell boundary.

`designGroup` is derived from bone regions, so the eight zones are real anatomy:

| group | region |
| --- | --- |
| 0 | trunk |
| 1 | neck |
| 2 | head (incl. jaw, ear) |
| 3 | legs (upper + lower) |
| 4 | paws |
| 5 | tail |
| 6 | wing |
| 7 | fin |

Each style maps those eight zones to eight **distinct** motifs via `STYLE_ZONES` in
`src/core/render/madhubani/zones.js`, plus a palette slot. Change that table to re-zone any style.

Motif scale is `uMotifM` in `color.js` — metres per motif repeat, default `0.06`.

## Known rough edges

- **The angular wrap shows a seam** where `angle` goes 0→1. Real Madhubani work has this join line
  too, so it is currently left visible rather than hidden.
- **Motif scale is global.** `uMotifM` is one number for the whole animal, so a sparrow and an elephant
  get the same physical motif size. Per-species scale is still open.
- **`pv` uses a smoothed mean radius**, so on a strongly tapered torso the circumference is
  approximated and the pattern can stretch slightly along the body.
- **WGSL is unverified.** The atlas has only ever been rendered through the WebGL2 fallback, because
  headless Chromium here has no WebGPU adapter. `.depth()` on a TSL texture node is documented in
  three r186 (`TextureNode.js:88`) and should emit `textureSample(t, s, uv, layer)`, but confirm it in
  a real browser before trusting it.
- **`?mtiles=bomb` still exists** — the old Voronoi path — purely for comparison. It is the wrong
  placement model and should not be used.

See `PROGRESS.md` for the session log.
