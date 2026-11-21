more_vert
Part 1 — Verification Manifest, IK-vs-Dynamics Architecture Call & Risk Ledger
0. Verification Manifest (What Was Actually Read)

VERIFIED (read directly via URL context):

madhubanvan/README.md[1]

madhubanvan/src/species/fox/fox-fullik.ts (all 130 lines + symbol extents)[2]

handwired/madhuban-morphology/PLAN-form-follows-function.md (Section 0 through Phase 6)[3]

handwired/madhuban-morphology/README.md (through The scaffold is not the animal)[4]

UNVERIFIED (blocked by browse proxy on this turn — zero line numbers or quotes fabricated):
5. madhubanvan/PROGRESS.md (artist’s verbatim note and sessions 6–8 remain unread directly)
6. madhubanvan/llms.txt
7. handwired/madhuban-morphology/AUDIT.md (key numbers cross-verified only where summarized in PLAN-form-follows-function.md[3])
8. handwired/madhuban-morphology/mass.ts

1. Architecture Read & Call on IK-versus-Dynamics
Definitive Call: Split-Authority Dynamics (Reject Both Naive Extremes)

The boundary between JoltPhysics and FulliK should be neither a full dynamic ragdoll with post-physics IK clamping nor pure kinematic animation with passive constraints. Divide every physics-enabled animal into three authorities:

Dynamic Core in Jolt (Mass, Momentum & Balance Authority):

Pelvis + thorax (1 or 2 dynamic rigid bodies linked by a spring-damped SwingTwistConstraint) driven by real mass, local CoM, and positive-definite 3×3 inertia tensors from madhuban-morphology/mass.ts.

Kept upright by computed Ground-Reaction Force (GRF) wrenches applied at planted foot contacts inside the support polygon, using dimensionless spring-damper equations derived solely from measured mass 
𝑚
m
, leg length 
𝐿
L
, gravity 
𝑔
g
, and target damping ratio 
𝜁
ζ
 (zero species-specific force constants).

Pluggable Wrench Interface: The Jolt core consumes (worldPoint, worldForce) wrenches from a pluggable generator—Legged GRF for quadrupeds today, swapping cleanly to Quasi-Steady Blade-Element Aero (matching PLAN-form-follows-function.md Phase 1 item 5[3]) for the eagle wing acceptance test and Griffin/Garuda later.

Locomotor Limbs in FulliK (Precision, Foot Contact & Madhubani Silhouette Authority):

A velocity-proportional foothold planner (Raibert / capture-point stepping) computes swing/stance ground targets from the Jolt core’s real velocity and Jolt terrain raycasts.

FulliK solves bilateral limb, spine/neck, and jaw chains from the Jolt core’s physics-driven hip/shoulder sockets onto terrain targets using anatomical hinge constraints for elbows/stifles/hocks and calibrated cones for ball joints (not blanket 30° cones).

Foot bodies in Jolt act as kinematic contact/query shapes (pushing props and reporting contact without fighting the solver).

Joint stress and bone-loading metrics required by PLAN-form-follows-function.md Phase 1 item 2[3] are computed via exact inverse dynamics (
𝜏
=
𝐽
𝑇
𝐹
GRF
τ=J
T
F
GRF
	​

) from the solved IK Jacobian and stance GRFs.

Dynamic Motorized Chains in Jolt (Secondary Motion Authority):

Non-balance appendages — elephant trunk, tails, ears — run as true dynamic Jolt SwingTwistConstraint chains with soft motors (DriveToPoseUsingMotors). They droop, sway, track authored targets, and collide with terrain naturally.

Full dynamic ragdoll is reserved strictly for discrete state transitions (hit/stumble/death) or an offline morphology collapse test — never primary locomotion.

Why This Beats Both Alternatives

Against Active Ragdoll + Post-IK: Jolt’s DriveToPoseUsingMotors acts in local joint space and provides no world-space root balance torque. Standing a 35-joint dynamic animal across 6 body plans and a ~1,000× mass span (fox to elephant) requires per-body-plan closed-loop balance controllers and 120–240 Hz substeps, and post-physics FulliK foot clamping fights Jolt’s contact solver—causing silhouette jitter that directly violates Art first. Furthermore, PLAN-form-follows-function.md confirms the fore/hind load split is currently wrong in 6 of 7 force-plate-referenced animals[3]; a free active ragdoll on uncalibrated mass distribution will simply pitch onto its nose or sit back on its haunches.

Against Passive Constraints Only: Kinematic gaits with height/limit clamping fake inertia and scale; an elephant and a fox land and turn identically unless hand-authored, and the engine gains no real force/dynamics layer to validate derived morphologies.

Clean Integration Seam Verified in madhubanvan/README.md

madhubanvan/README.md (Quickstart snippet) confirms the engine already exposes animal.follow(body.position, body.velocity) ("or follow your physics body, every frame"), animal.move({ speed, heading }), and animal.on('footstep', ...)[1]. This lets the 24 hand-authored Reference Culture animals stay completely untouched while Split-Authority physics animals plug into the same external steering contract and render side-by-side.

Layer Diagram (m, s, rad, Y-up, heading 0 = +Z)
code
Text
download
content_copy
expand_less
OFFLINE / MORPHOLOGY (handwired/madhuban-morphology/)
  mass.ts + converge.ts + species.ts + elephant.ts
    └──> MassSpec { totalMassKg, com, supportPolygon, uncertaintyBound,
                    segments: [{ boneName, massKg, localCom, inertia3x3 }] }

BUILD-TIME (madhubanvan — Seed -> Deterministic Animal; Web Worker or .animal bake)
  [1. Sculpt (SDF)] -> [2. Mass Bind] -> [3. Surface-Nets + Body-Space (around, along) Coat]
                    -> [4. Rig + Anatomical Limits + DQ Skin + Jolt Core/Chain Descriptors]

RUNTIME FIXED-STEP LOOP (madhubanvan — Main Thread, dt = 1/60 s, Zero Per-Frame Allocs)
  [5. Gait & Footholds]  desired vel/heading + Jolt core state -> stance/swing + Jolt raycasts
           │
           ▼
  [6. Jolt Core Step]    single-threaded deterministic JoltPhysics.js WASM
                         apply pluggable WrenchList -> step core + dynamic chains (trunk/tail/ears)
           │
           ▼
  [7. FulliK & Torque]   read Jolt core sockets -> solve bilateral limbs/neck/jaw -> log error & tau
           │
           ▼
  [8. Skin & TSL Coat]   DQ skin -> Madhubani role-mask array + toon/banding (WebGPU / WebGL2)
How the Two Provisional Defaults Shape This Architecture (Flagged for Mehul)

Provisional Default #1 (Serial: Art Gate first, then Measurement/Physics): Delays all Jolt WASM integration until Madhubani distance-readability and per-species tile sizing / row-locked scales are signed off across WebGPU and WebGL2. (Override impact: Art Gate and Ruler/Fox-IK touch disjoint files and can run in parallel if Mehul prefers.)

Provisional Default #2 (1–3 Hero physics @ 60 fps, dropping to 10–15 at reduced Physics LOD): Locks Jolt to main-thread synchronous single-threaded WASM (~42 dynamic bodies total for 3 Hero + 12 LOD1, zero Worker latency, no COOP/COEP headers) with a 3-tier Physics LOD:

LOD 0 (Hero, max 3, < 12 m enter / > 16 m exit): 2-body core + GRF wrenches + full bilateral FulliK + Jolt secondary chains.

LOD 1 (Mid/Herd, #4–#15, 12–35 m): 1-body core + vertical/pitch spring + 4-iter FulliK/analytic legs + JS spring secondary motion (zero Jolt constraints).

LOD 2 (Crowd, > 15 or ~6k crowd tier): Reference-culture kinematic gait + terrain snap.
(Override impact: 25+ simultaneous full-physics animals would require moving Jolt into a Web Worker with double-buffered transforms.)

2. Risk Ledger (Verified & Unverified File/Symbol References)
ID	Risk	File / Symbol / Lines	Status	Technical Evidence & Required Mitigation
R1	Blanket 30° ball-cone clamp causes the 2.59 cm hind-left IK failure	madhubanvan/src/species/fox/fox-fullik.ts: b.setBallJointConstraintDegs(30) (line 55), chainDefs HL (femurL, tibiaL, metatarsusL, hpawL, line 36), bind-pose comment (line 64)[2]	VERIFIED	Line 64 states htoeL in bind pose is only ~0.0085 m (8.5 mm) off y = 0, yet solving produces a 25.9 mm residual — pulling the foot 3× farther from the ground. A digitigrade hind leg has acute stifle/hock bend angles > 30°; clamping every bone to a 30° isotropic cone forbids the natural stance itself. Fix: replace blanket ball cones with anatomical local hinges on elbows/stifles/hocks and species-calibrated cones on shoulders/hips.
R2	Disconnected chains, reversed spine, missing bilateral limbs, and external path import	madhubanvan/src/species/fox/fox-fullik.ts: external import '../../../../../fullik-repo/src/FIK.js' (line 7); chainDefs (lines 33–39); foxRig() called per bone (line 47); targets skip loop (lines 79–81)[2]	VERIFIED	(a) Line 7 imports FulliK from 5 directories outside the repo—broken on any other machine/Vite build. (b) Five standalone Chain3Ds are never joined in an IKSolver/Structure3D; spine (line 34) runs backwards (head → pelvis); spine, earL, jaw are skipped (lines 79–81); FR, HR, earR, and tail are absent. (c) Line 66 claims a forward offset for FL, but line 68 applies none. Fix: vendor/depend on FulliK cleanly, connect chains to a pelvis root, and wire full bilateral chains.
R3	Static stability check in fox-fullik.ts is a broken stub, not a measurement	madhubanvan/src/species/fox/fox-fullik.ts: approxMargin() (lines 103–116)[2]	VERIFIED	Despite logging STANDS (approx margin > 0), approxMargin() reads bind-pose J.hipL and J.htoeL (lines 105–106 — hip + toe on one side, not both hind feet), ignores the solved IK pose, discards footAvgX, footAvgZ, and spineMidZ (lines 108, 109, 112), and returns hardcoded 0.02 or -0.01 (line 115). Fix: delete stub; replace with real support-polygon margin computed from solved 4-foot ground contacts and mass.ts CoM.
R4	Unresolved 6-of-7 fore/hind load-split error & 60.0% templated CoM	handwired/madhuban-morphology/PLAN-form-follows-function.md (Phase 1: What the audit already settled)[3]; AUDIT.md & mass.ts	PARTIALLY VERIFIED (PLAN verified; AUDIT.md & mass.ts unread)	PLAN confirms 6 of 7 force-plate-referenced animals disagree on fore/hind load split, CoM is templated at 60.0% height (8.6% spread across 13 species), and the cause (mass placement vs. foot placement) is unresolved[3]. Piping uncalibrated mass/foot geometry straight into Jolt will produce nose-heavy or tail-heavy dynamics. Fix: separate ruler/density error from sculpt/kinematics error before M3.
R5	Voxel convergence failure on small/thin bodies & pessimistic error bounds	handwired/madhuban-morphology/PLAN-form-follows-function.md (Phase 1: Measurement resolution is part of the result, citing converge.ts)[3]; mass.ts	PARTIALLY VERIFIED (PLAN verified; mass.ts unread)	PLAN documents that converge.ts error bounds are 20–30× pessimistic (cat bound 31% vs. 0.9% actual move), the rat fails to converge at 5.2%, and thin bodies (fish, snake, spider) fall below the 1 cm voxel floor where limb numbers are junk[3]. Fix: every MassSpec exported to Jolt must carry its voxel step size and uncertainty bound, enforce positive-definite inertia (
𝐼
𝑥
+
𝐼
𝑦
≥
𝐼
𝑧
I
x
	​

+I
y
	​

≥I
z
	​

), and adapt voxel step to species scale (h ≤ minRadius / 3).
R6	Allometric leverage (0.75 vs. 0.65) & cast eagle non-physicality	handwired/madhuban-morphology/PLAN-form-follows-function.md (Phase 1 & Phase 2, citing core/build/featherCards.js)[3]	VERIFIED	Elephant alone shifts the allometric exponent by 0.10 (0.75 with elephant vs. 0.65 without, 
𝑟
2
=
0.76
r
2
=0.76
 over 12 bodies), signaling high single-point leverage. Additionally, the cast eagle SDF is 14 kg (vs. 5 kg real) with only a 0.381 m folded arm because flight feathers live in core/build/featherCards.js[3]. Fix: validate aero/scaling criteria against biological literature, never against the cast SDF alone.
R7	Repo doc contradictions & untracked/untested morphology checks	handwired/madhuban-morphology/PLAN-form-follows-function.md (Phase 0)[3]; madhuban-morphology/README.md (The mass-construction body vs. The scaffold is not the animal)[4]	VERIFIED	madhuban-morphology/README.md itself contradicts its own primitive count: "roughly 33 primitives per body" in one section and "~48 prims" in the next[4]. PLAN Phase 0 also flags 127-vs-131 prim count and notes published tables lack automated bun test / bun run check (scripts/check.ts) pinning[3]. Fix: pin every published measurement under bun test in M2 before building dynamics on top.
R8	Dead gradients in Handwired circuits & scaffold-vs-sculpt gap	handwired/madhuban-morphology/PLAN-form-follows-function.md (Phases 2–3, citing src/learned-gallery/trainable-geometry.ts)[3]; madhuban-morphology/README.md[4]	VERIFIED	The 115-number canonical vector (masses.ts) drives only a coarse 33/48-prim scaffold, not the 96–956-prim artist sculpts[4], and Handwired’s banded-sqrt ReLU clamps suffer dead gradients (∂circuit ≠ ∂function)[3]. Fix: keep handwired strictly quarantined offline; use evolutionary/CEM search first and never import handwired into the live browser Three.js/Jolt loop.
R9	Madhubani coat distance readability, mip washout & high-bend skinning	madhubanvan/PROGRESS.md, src/core/render/madhubani/, MOTIFS.md, app/patterns.html	UNVERIFIED (files unread)	Brief confirms toon/banded shading still fails to read at distance, relief/embossing is rejected, and per-species tile sizing / row-locked scales are undone. Likely mechanisms (to verify in code): fine dark katchni/godna ink averaging to grey across mip levels, insufficient band separation/contour reading at 8–20 m, and future DQ-skinning compression under dynamic drops/trunk curls. Fix: gate M1 strictly on reading the artist’s verbatim note in PROGRESS.md first.
R10	Cross-repo Elephant drift & incomplete renderer entry	madhubanvan/src/species/elephant/{rig.js,sculpt.js} (no index.js) vs. handwired/madhuban-morphology/elephant.ts	UNVERIFIED (files unread)	Elephant is WIP in madhubanvan without index.js while handwired holds elephant.ts (P1/P2/P3 loop + hand sculpt noted in README.md[4]). Any divergence in joint coordinates or SDF dimensions between repos silently breaks MassSpec → Jolt binding. Fix: enforce an automated < 2% volume/CoM parity test when wiring src/species/elephant/index.js.
R11	JoltPhysics.js WASM heap leaks & non-determinism	madhubanvan/src/core/physics/ (new module)	UNVERIFIED (not yet implemented)	Emscripten JoltPhysics.js objects (Vec3, RVec3, Quat, settings) are not JS-GC’d; any allocation inside the 60 Hz step leaks WASM heap until tab crash. Multi-threaded WASM breaks determinism and requires COOP/COEP. Fix: pin single-threaded deterministic WASM, pre-allocate scratch objects, and gate with a 50-cycle create/destroy leak test + 600-step determinism test.

PART-1-END

Sources
help

madhubanvan/README.md at main · mehulmehul1/madhubanvan · GitHub
madhubanvan/src/species/fox/fox-fullik.ts at main · mehulmehul1/madhubanvan · GitHub
handwired/madhuban-morphology/PLAN-form-follows-function.md at main · mehulmehul1/handwired · GitHub
handwired/madhuban-morphology/README.md at main · mehulmehul1/handwired · GitHub