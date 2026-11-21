Orchestrator Review: Conditional Hold (Do Not Merge to main or Start M3 Yet)

First: strong engineering progress. Fixing the hidden animalObject-tsl.js:78 Voronoi default, proving the 84-layer atlas on real hardware WebGPU, shipping the 12-horse variation viewer (horse_sheet.png), fixing mass.ts M-B1–M-B6 with SPD inertia tensors, and dropping the Fox hind-left FulliK residual from 25.9 mm → 0.004 mm are all major wins.

However, under Constraint #5 (review against criteria, not vibes; unmeasured is labelled unmeasured), neither branch is ready to merge into main yet. Below are the exact failed criteria, repo misplacements, and unmeasured claims that must be closed before I approve merge and release Milestone 3.

(Transparency note: this review audits your reported results against the locked M1/M2 acceptance tests; I have not directly fetched commits 6cb6398 / a4f1b36.)

1. Milestone 1 (feat/milestone-1-art-gate, 6cb6398) — Audit
Criterion	Status	Gap / Unmeasured Claim
WebGPU + WebGL2 dual parity (Constraint #2)	UNMEASURED	Real WebGPU is reported clean, but WebGL2 fallback is never mentioned after editing color.js, atlas.js, and zones.js. Must verify 0 errors and visual match on WebGL2.
Toon shading readability + moved-light proof (Task 1.2)	UNMEASURED / NO ARTIST SIGN-OFF	Three required proofs are missing: (1) rotated key-light test (+60° azimuth) proving shading actually tracks light (PROGRESS.md:187–189); (2) 20 m band-contrast delta vs. 722aa0d and hero frame-time delta (< +1.0 ms); (3) Mehul’s explicit visual sign-off on 2 m / 8 m / 20 m renders (PROGRESS.md:177).
Mip ink-retention bloom check (atlas.js)	RISK — UNMEASURED	Math.max(avg, (avg + mx * 2 + 1) >> 2) boosts peak ink ~2.2× per mip level. Over 4–5 mip levels at 20 m, fine katchni/godna hatching may bloom back into dark slabs (PROGRESS.md:208–215). Must visually inspect katchni & godna at 20 m.
Per-species tile sizing & aspect ratio (Task 1.3)	INCOMPLETE / UNMEASURED	Exposing setMotifM(m) is only a setter — report does not show automatic per-species sizing replacing global uMotifM = 0.06 m, nor measured motif aspect ratio [0.9, 1.1] across frog/fox → horse/shark (clamping nCirc to 1 on thin parts with global 0.06 m will stretch motifs).
Render check of 5 zone-map fixes (Task 1.3)	UNMEASURED	tools/test.mjs boar eagle fish spider validates build/bake, not rendered pixels (PROGRESS.md:486–500 explicitly requires a render check on bird legs/feathers, spider fore/hind, and swimmer median fins).
Determinism & Reference Culture seed 1 (Task 1.1 / 1.4)	UNMEASURED	0-pixel diff across repeated seeded runs not reported; verify warp.js boundary hardening left Reference Culture seed 1 geometry unchanged.
2. Milestone 2 (feat/milestone-2-mass-and-fox-fullik, a4f1b36) — Audit
Criterion	Status	Gap / Unmeasured Claim
Task 2.2 committed in WRONG repo	HARD BLOCKER	FulliK was vendored and fox-fullik.ts fixed inside handwired (madhuban-morphology/fullik/), not in madhubanvan/src/species/fox/fox-fullik.ts. Milestone 3 runs in madhubanvan — madhubanvan still has the broken line-7 external path and line-55 30° cone unless mirrored/synced cleanly into madhubanvan.
Rat convergence < 2.0% (Task 2.1)	FAILED (2.62% > 2.0%)	Report logs rat convergence at 2.62%, missing the < 2.0% PASS threshold. Drop the rat voxel step one level finer (within the 8M budget) or explain and fix the convergence ceiling so it passes < 2.0%.
Biological lung density (350 kg/m³) impact on 6-of-7 fore/hind splits & Elephant (Task 2.1)	CRITICAL UNMEASURED	Changing `ribcage
Segmental mass sum < 1.0% + Elephant + LOD0/LOD1 (Task 2.1)	UNMEASURED	Report states 39 fox bones have SPD inertia, but omits: (1) exact % delta between sum(segment.massKg) and whole-SDF mass on Fox AND Elephant (< 1.0% gate); (2) confirmation that mass.ts exports both LOD 0 (pelvis/thorax core + chains) and LOD 1 (single aggregate core) specs for Split-Authority.
Repo check & Phase 0 doc contradictions (PLAN Phase 0)	UNMEASURED	bun test ./madhuban-morphology passed, but bun run check (scripts/check.ts) was not reported, nor resolution of the 33-vs-48 and 127-vs-131 doc contradictions.
Fox FulliK 100-pose suite, mirror symmetry & spine/tail (Task 2.2)	UNMEASURED	Sub-15 µm residuals are reported for 1 flat stand pose, not the 100-pose suite (flat + 15° slope + asymmetric uneven step). Missing: (1) worst-case residual across all 100 poses (< 2.0 mm); (2) L/R mirror symmetry (< 1e-4 rad); (3) confirmation that spine is reversed to pelvis → head and socket-coupled for M3 Jolt handoff; (4) tail chain status; (5) quick sanity check on Fox support area 0.0245 m² vs. mass.json fox supportArea.
3. Closure Checklist to Unlock Merge & Milestone 3

Complete these targeted closures and reply with the exact measured outputs (no prose summaries without numbers):

In madhubanvan (feat/milestone-1-art-gate):

Run visual-gate on both WebGPU and WebGL2 for fox, boar, horse, eagle, fish, spider at 2 m, 8 m, 20 m plus a +60° rotated key light; report:

WebGL2 & WebGPU error counts, 0-pixel repeat-run diff, hero frame-time delta vs. 722aa0d (< +1.0 ms),

20 m band-contrast delta + explicit check that katchni/godna ink does not bloom black at 20 m,

visual confirmation of the 5 zone-map fixes on eagle, fish, spider.

Wire automatic per-species uMotifM scaling (not just a manual setter) and report measured motif aspect ratio [0.9, 1.1] from frog/fox to horse/shark.

Sync the fixed FulliK vendor + bilateral fox-fullik.ts into madhubanvan (removing the line-7 external path so M3 can import it in-browser).

Artist Gate (Mehul): Inspect out/variations/horse_sheet.png and the 2 m / 8 m / 20 m toon renders and confirm "yes, the toon shading reads and the 12 horses are distinct."

In handwired (feat/milestone-2-mass-and-fox-fullik):

Bring rat voxel convergence below < 2.0% (from 2.62%) and run bun run check cleanly across the whole repo (plus reconcile 33-vs-48 / 127-vs-131 in README.md / docs).

Print the Uniform vs. Biological-Density (350 kg/m³ thorax) table for all 7 force-plate animals + Elephant (mass kg, fore %, CoM height %), plus Elephant leave-one-out allometric slope/leverage.

Report sum(segment.massKg) vs. whole-SDF mass % delta on Fox and Elephant (< 1.0%), and confirm LOD 0 (pelvis/thorax) + LOD 1 (aggregate) inertia export.

Run the 100-pose Fox FulliK suite (flat, 15° slope, asymmetric step) and report: maxResidualMm across all 4 feet, maxMirrorDiffRad (< 1e-4 rad), spine pelvis→head socket coupling, tail chain status, and supportArea cross-check against mass.json.

Once those numbers come back green and Mehul signs off on the M1 renders, I will approve merging both branches to main and release Milestone 3 (Tasks 3.1 & 3.2).