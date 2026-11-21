# Neon Verified Forensics Delta & Locked Spec Update

**Source:** Gemini 4 Neon — Verified Forensics Delta response  
**Date:** 2025-11-21  
**Files Verified:** 8 of 8 core files (4 previously verified + 4 newly read: `PROGRESS.md`, `llms.txt`, `AUDIT.md`, `mass.ts`, plus artist journal `input_file_1.md`)

---

## 1. Verified Forensics Delta (New Bugs & Findings From the 5 Uploaded Files)

### A. Concrete Code Bugs Found in `handwired/madhuban-morphology/mass.ts` (493 lines, VERIFIED)

| ID | Exact Location | Verified Finding |
|----|----------------|------------------|
| **M-B1** | `mass.ts:91–99` | **1-voxel AABB index shift:** Line 91 shifts the grid origin `o = lo - h`, but lines 94–99 compute `cell` bounds by subtracting **`lo`** instead of **`o`** (`Math.floor((b.c[0] - b.r - lo[0]) / h) - 1`). Every primitive’s voxel range is shifted −1 cell along all 3 axes, eating the `+1` safety padding on the `+x/+y/+z` side. |
| **M-B2** | `mass.ts:42–62` vs `261` | **TypeScript contract error:** `measure()` returns `hRequested` on line 261, which is not declared on `export type Mass` (lines 42–62) — will fail `bun run check` once `madhuban-morphology/` is wired into `scripts/check.ts`. |
| **M-B3** | `mass.ts:433` | **Inverted up/down sign in console report:** `+Y` is up, so `comTissue[1] > com[1]` means tissue pulled CoM **up**, not `'down'` — both the sign `(com[1] - comTissue[1])` and the ternary `${el.m.comTissue[1]! > el.m.com[1]! ? 'down' : 'up'}` are inverted. |
| **M-B4** | `mass.ts:432` | **Hidden `minY === 0` assumption:** `el.m.com[1]! / el.m.height` omits `- minY`, giving wrong CoM height percentages for any sculpt whose lowest voxel is not at `y = 0`. |
| **M-B5** | `mass.ts:255–258, 274` | **Unguarded empty fore/hind centroid:** `centroid([])` returns `[0, 0]` (line 274), so when `fore` or `hind` is empty (birds leaning past toes, snakes, swimmers) line 258 computes a bogus finite `loadFore` instead of `NaN`. Also splits strictly by `p[1] > com[2]`, which cannot separate mass error from foot-placement error (`AUDIT.md:82–91`). |
| **M-B6** | `mass.ts:28–35, 75, 109–153, 249` | **Physics-readiness gaps:** (1) `TISSUE` (line 32) sets `ribcage` to `1000 kg/m³` (no air-filled lung reduction); (2) lines 109–153 integrate 0th (`vol`) and 1st (`com`) moments only — **no 2nd-moment inertia tensor** and **no per-bone segmentation** for Jolt; (3) line 75 hard-floors `h >= 0.01 m` (causing rat `+5.2%` non-convergence and thin-body failure at `AUDIT.md:163, 170–171`); (4) line 249 `polyArea > 1e-4` drops valid small-animal footprints (`< 1 cm²`); (5) lines 54 & 162 still claim `limbArea` is *"at 15% of height"* while lines 196–208 actually integrate below the `0.5 * maxArea` belly line. |

### B. Critical Findings in `madhubanvan/PROGRESS.md` (583 lines, VERIFIED) & Artist Journal (684 lines, VERIFIED)

1. **The Library Still Defaults to Abandoned Voronoi (`PROGRESS.md:440–443`):** `animalObject-tsl.js:78` still sets `madhubaniTiles: 'bomb'`; only `app/main.js:90` overrides it to `'chain'`. Any package caller, headless test, or variation viewer calling `createAnimal()` silently renders Voronoi blobs.

2. **The Artist’s Verbatim Note (`PROGRESS.md:504–511`) Adds Two Non-Negotiable Product Gates:**
   - **Per-creature SDF muscle-mass variation viewer (`PROGRESS.md:510, 529–531`):** *"for example the horse creature, changing its muscle mass size shape etc might give us 12 distinct looking horses, so show me all 12 and i will decide which looks good and which dont."* (`tools/variations.mjs`, currently not done.)
   - **Gravity-free choreographed composition mode (`PROGRESS.md:510, 544–547` + artist dev journal `input_file_1.md`):** The artist’s larger vision is **3D decorative Madhubani compositions** — extracted 3D motifs (circles, lotus, borders/ribbons/knots/frames from `input_file_1.md`) and animals moving in rhythm on complex paths/frames **without falling from gravity** (*"font view frame, horses on it moving in 3d not falling because of gravity"*). This **strongly validates** keeping the 24 Reference Culture kinematic animals first-class and making Split-Authority Jolt physics an explicit mode rather than forcing gravity onto every scene.

3. **5 Unfixed Zone-Map Bugs (`PROGRESS.md:491–500`) Must Precede Variety Work:** `other(15)` paints bird toes/flight feathers & snake tongue/fangs as **tail**; bird legs lose upper/lower split; spiders lose fore/hind entirely; swimmer median fins inherit torso/tail instead of `fin(14)`; `f[2]` is unreachable at `ccount < 4`.

4. **3 Already-Baked Unread Variety Levers (`PROGRESS.md:449–460`):** `aMad1.x` (16 islands), `aMad1.w` (`spineT` 0→1 nose→tail — exact input for Cow barrel bands), and `weights.limbWhich` / discarded `partA` (`coatFields.js:152–153`), plus 4 spare motifs/style (`PROGRESS.md:340–345`). Also `uMotifM` has **no setter** (`PROGRESS.md:478`), `tools/shot3d.mjs` already exists (`PROGRESS.md:579`), and dead code sits in `params.js:18` (`vyaghra_tiger`), `params.js:40–41`, `zones.js:44`, and `color.js:8` (`PROGRESS.md:434–445`).

### C. Binding Engine Contracts Verified in `madhubanvan/llms.txt` (191 lines, VERIFIED)

1. **Identity Transform Rule (`llms.txt:47, 172`):** `animal.object` **must keep an identity transform** — the engine writes bone matrices directly; modifying `animal.object.position/rotation/scale` causes double transforms. Therefore, Split-Authority Jolt core transforms **must drive root/pelvis bone sockets**, never `animal.object`.

2. **`follow()` Ignores Y for Walkers (`llms.txt:86`):** `follow(position, velocity)` treats `position` as a ground point (`y` ignored) for walkers. So `follow()` works for LOD 2 / horizontal steering, while **LOD 0/1 vertical dynamics (drops, squat, pitch/roll)** must write directly to the skeleton’s root sockets.

3. **No Raycasting Inside `ground(x, z)` (`llms.txt:48`):** `ground(x, z)` is called many times per frame and must stay analytic or height-grid cheap. Our physics terrain must expose a **shared analytic/heightfield sampler** for `ground(x, z)` alongside the Jolt `HeightFieldShape`, reserving Jolt raycasts strictly for discrete props/steps.

4. **Existing LOD & CPU Baseline (`llms.txt:93, 140`):** `animal.setLod(0|1|2)` already exists; upstream CPU budget is `<= 0.12 ms/frame` (LOD 0) and `<= 0.08 ms/frame` (crowd + `setLod(2)`). Our Physics LOD 0/1/2 binds cleanly onto `setLod(0|1|2)`.

5. **Vite Constraint (`llms.txt:54, 144, 174–175`):** Never use top-level `await` in app entry modules (deadlocks dynamic species chunks); keep `optimizeDeps.exclude: ['procedural-animals']`.

### D. Scientific Gate Warning Verified in `handwired/madhuban-morphology/AUDIT.md` (229 lines, VERIFIED)

- **Uncited Reference Masses (`AUDIT.md:176–179`):** *"The reference masses are literature values carried in memory, not cited this session... none of them should become a gate before it is cited."* No automated test or evolution fitness function may gate on `audit.ts` biological targets until Task 2.1 replaces them with cited sources.

- **Elephant Benchmark (`AUDIT.md:57–60`):** Confirmed exact baseline: `5,939 kg`, `62%` fore, `0.600 m` stability margin, `82 kPa` limb load (`7×` mass leverage on the `0.749` vs. `0.65` exponent at `AUDIT.md:96–106`).

---

## 2. Locked Patches to Part 2 (Milestones) & Part 3 (Agent Task Specs)

All Part 1–3 structure remains intact; apply these **six surgical locks** before dispatching agents:

### Lock 1 — Task 1.1 (Tooling + WGSL Gate)
- **Patch:** Extend existing `tools/shot3d.mjs` (`PROGRESS.md:579`) and `tools/shot.mjs` (`PROGRESS.md:171–172`) instead of writing a duplicate renderer harness; fix `animalObject-tsl.js:78` default `'bomb'` → `'chain'` (`PROGRESS.md:440–443`) immediately so library callers stop getting Voronoi blobs; remove dead code (`vyaghra_tiger` at `params.js:18`, unused `MAD_SEED_SPACING`/`MAD_TILE` at `params.js:40–41`, unused `slotForRow` at `zones.js:44`, stale `color.js:8` comment).

### Lock 2 — Task 1.3 (Per-Species Tiling, Zone Bugs & Variety Levers)
- **Patch:** Add a proper `uMotifM` setter (`PROGRESS.md:478`), fix the **5 zone-map bugs** (`PROGRESS.md:491–500`) before enabling per-seed variety, and wire `aMad1.w` (`spineT`, `PROGRESS.md:454–456`) for Cow-style barrel banding while keeping the authentic vertical wrap seam (`PROGRESS.md:297–298`).

### Lock 3 — NEW Task 1.4 — Artist Gate: Per-Creature SDF Muscle-Mass Variation Viewer (`PROGRESS.md:510, 529–531`)
- **Scope:** Add `madhubanvan/tools/variations.mjs` + `app/variations.html` (using `createAnimal` `overrides` from `llms.txt:68` and fixed body-space `'chain'` default).
- **Ideal State:** Renders a contact sheet / grid of **12 distinct seeded/muscle-mass-varied individuals** of any chosen species (starting with `horse`) side-by-side at once so the artist can curate keepers directly by looking.
- **Acceptance Test:** Generating 12 horse variants produces 12 visibly distinct, non-degenerate meshes with `0` console/shader errors on WebGPU and WebGL2, deterministic by seed.
- **What Must Not Be Touched:** Core SDF sculpt defaults for seed 1 (Reference Culture yardstick).

### Lock 4 — Task 2.1 (`mass.ts` & `AUDIT.md` Ruler Lock)
- **Patch:** Fix all 6 verified `mass.ts` bugs (**M-B1** through **M-B6**: `lo` vs `o` lines 91–99, `hRequested` type line 62/261, inverted up/down line 433, `minY` offset line 432, empty `fore`/`hind` guard lines 255–258, stale 15% comment lines 54/162, adaptive `h` below 1 cm floor line 75, scale-free support-area check line 249); add 2nd-moment SPD inertia tensors + LOD0/LOD1 segmental exports; **cite every reference mass & force-plate target in `audit.ts` before promoting any of them to a PASS/FAIL gate (`AUDIT.md:176–179`)**.

### Lock 5 — Task 3.1 & 3.2 (Split-Authority Runtime Contracts from `llms.txt`)
- **Patch:** Enforce `llms.txt:47, 172` (**never transform `animal.object`** — drive skeleton root/sockets directly); enforce `llms.txt:48` (shared analytic/heightgrid `ground(x, z)`, never raycast inside it); do **not** route LOD 0/1 vertical physics through `follow()` (`llms.txt:86` ignores `y`); bind Physics LOD 0/1/2 cleanly to `animal.setLod(0|1|2)` (`llms.txt:93`); ensure **no top-level `await`** in new app pages (`llms.txt:54, 174`); preserve a zero-gravity kinematic mode so the artist’s front-view choreographed frame POC (`PROGRESS.md:510, 546–547`) works alongside Split-Authority physics.

### Lock 6 — Task 4.1 (Elephant Parity)
- **Patch:** Verify against `AUDIT.md:57–60` exact authored Elephant baseline (`5,939 kg`, `62%` fore, `0.600 m` margin, `82 kPa`) and cross-check `mass.ts:394–400` (`species/elephant/rig.js` + `sculpt.js`) so both repos share identical geometry.

---

## 3. Current Session State

| Status | Item |
|--------|------|
| ✅ Complete | Part 1 verified (Split-Authority architecture + Risk Ledger R1–R7) |
| ✅ Complete | Part 2 verified (Milestones M1–M5 with acceptance tests) |
| ✅ Complete | Part 3 verified (Agent Tasks 1.1–5.1 self-contained specs) |
| ✅ Complete | Raw Neon responses saved to `raw-responses/` |
| ✅ Complete | Human-readable analysis saved to `GEMINI_NEON_ANALYSIS.md` |
| ✅ Complete | This file saved: `NEON_VERIFIED_FORENSICS_DELTA.md` |
| ⏳ Ready | Task 1.1 clear for immediate dispatch |
| 🔒 Blocked | Tasks 1.2–5.1 await verification of the 6 `mass.ts` bugs + zone-map fixes |

**All 8 core files are now verified, every risk has an exact file/line anchor, and Task 1.1 is clear for immediate dispatch.**

---

## 4. Repo Paths Reference

| File | Path |
|------|------|
| `PROGRESS.md` | `experiments/madhubani-animals/PROGRESS.md` |
| `llms.txt` | `experiments/madhubani-animals/llms.txt` |
| `AUDIT.md` | `handwired/madhuban-morphology/AUDIT.md` |
| `mass.ts` | `handwired/madhuban-morphology/mass.ts` |
| `input_file_1.md` | `OneDrive\Desktop\Daily-Code\Madhuban\Madhuban.md` (copied to `Madhuban-raw-thoughts.md`) |
| `animalObject-tsl.js` | `madhubanvan/src/...` (needs exact path confirmation) |
| `tools/variations.mjs` | `madhubanvan/tools/variations.mjs` (create new) |
| `tools/shot3d.mjs` | `madhubanvan/tools/shot3d.mjs` |
| `tools/shot.mjs` | `madhubanvan/tools/shot.mjs` |
