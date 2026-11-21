edit
more_vert
0. Tool Access & Integrity Notice

Before presenting the breakdown, one mandatory truth under Constraint #5 (nothing is claimed until measured; unmeasured is labelled unmeasured):

I invoked my browse and search tools on https://github.com/mehulmehul1/madhubanvan and https://github.com/mehulmehul1/handwired. Both returned an access error from the browse proxy, and Google search returned zero indexed pages for both newly pushed commits (722aa0d and 6b221ae). My browse tool also rejects template-derived raw URLs (raw.githubusercontent.com/...) unless each file URL appears verbatim or is indexed in search.

Therefore, I have NOT read the source lines inside those files yet. I will not fabricate line numbers, invent quotes from the artist’s verbatim note in PROGRESS.md, or pretend to have audited code I could not fetch.

Because you asked me not to wait, below is the complete, execution-ready orchestration plan anchored to every repo path, measurement, and contract you provided. Every task includes mandatory read-first files and [VERIFY LINE REF] audit gates so a local coding agent with repo checkout can execute immediately without fabricating anything.

1. Architecture Read & Call on IK-vs-Dynamics
Definitive Call: Split-Authority Dynamics

Between (A) Active Jolt Ragdoll + Post-Physics FulliK and (B) Pure Kinematic Gait + Passive Physics Constraints, the right architecture for Madhuban is Split-Authority Dynamics — dividing every animal into three explicit physical authorities:

Dynamic Core in Jolt (Mass, Momentum & Balance Authority):

Pelvis + thorax (1 or 2 dynamic rigid bodies linked by a spring-damped SwingTwistConstraint) parameterized directly from handwired/madhuban-morphology/mass.ts (mass, local CoM, positive-definite 3×3 inertia tensor).

Subject to real gravity, inertia, terrain collision, landing compression, and turn banking.

Supported upright by computed Ground-Reaction Force (GRF) wrenches applied at planted foot contacts inside the support polygon, using dimensionless spring-damper equations derived strictly from measured mass 
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

Locomotor Limbs in FulliK (Foot Precision & Madhubani Silhouette Authority):

A velocity-proportional foothold planner (Raibert / capture-point stepping) computes swing/stance ground targets from the Jolt core’s actual velocity and Jolt terrain raycasts.

FulliK solves bilateral leg, spine/neck, and jaw chains from the Jolt core’s physics-driven hip/shoulder sockets to ground targets inside anatomical joint limits.

Foot bodies in Jolt are kinematic contact/query shapes (pushing world props and reporting contact without fighting the solver).

Joint loads needed by PLAN-form-follows-function.md are computed analytically via inverse dynamics (
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

) from the solved limb Jacobian and stance GRFs — exact joint torques without active-ragdoll instability.

Dynamic Motorized Chains in Jolt (Secondary Motion Authority):

Non-balance appendages — elephant trunk, tails, ears — run as true dynamic Jolt SwingTwistConstraint chains with soft motors (DriveToPoseUsingMotors). They swing, droop, track authored poses, and collide cleanly with terrain.

Full dynamic ragdoll exists only as a discrete failure/hit/death state or an offline stability stress-test harness in madhuban-morphology — never as the primary locomotion driver.

Defense Against the Two Alternatives

Why reject Active Ragdoll + Post-IK (Option A): Jolt joint motors operate in local joint space and provide no world-space balance torque on the root. Standing a 35-joint active ragdoll across 6 body plans and ~1,000× mass scaling (fox to elephant) requires a full closed-loop balance/ZMP controller per body plan, 120–240 Hz substeps to survive high mass ratios (torso-to-paw), and causes physics–IK fighting (post-step FulliK overrides contact impulses, creating foot jitter or energy injection that ruins the Madhubani silhouette). Worse, AUDIT.md already proved 6 of 7 fore/hind load splits are currently off — an active ragdoll will faithfully faceplant on uncalibrated mass properties.

Why reject Passive Constraints Only (Option B): Kinematic curves with gravity/limit clamps fake inertia; a 4,000 kg elephant and a 6 kg fox accelerate, bank, and absorb landings identically unless hand-authored. It also provides no physical force/torque layer to evaluate derived creatures (eagle wing test, griffin, Ganesha/Hanuman/Garuda).

Repo-Mapped Layer Diagram (m, s, rad, Y-up, heading 0 = +Z)
code
Text
download
content_copy
expand_less
OFFLINE MORPHOLOGY (handwired/madhuban-morphology/)
  mass.ts + converge.ts + species.ts + elephant.ts
    └──> MassSpec contract: { totalMassKg, com, supportPolygon, restingForeHindSplit,
                              segments: [{ boneName, massKg, localCom, inertia3x3 }] }

BUILD-TIME (madhubanvan — Deterministic per Seed; Web Worker or .animal bake)
  [1. Sculpt]       src/species/<name>/sculpt.js (SDF)
        │
        ▼
  [2. Mass Bind]    MassSpec derived from SDF (shared math with mass.ts; < 1% integral error)
        │
        ▼
  [3. Mesh & Coat]  surface-nets mesh + body-space (around, along) m + 8 designGroups + 4 landmarks
        │           + per-species tile sizing & row-locked scales (src/core/render/madhubani/)
        ▼
  [4. Rig & Proxy]  src/core/rig/quadruped.js + src/species/<name>/rig.js
                    skeleton, anatomical limits, DQ skin weights, Jolt capsule/convex descriptors

RUNTIME FIXED-STEP LOOP (madhubanvan — Main Thread, dt = 1/60 s, Zero Per-Frame Allocs)
  [5. Gait/Targets] desired vel/heading + Jolt core state -> stance/swing phase + Jolt raycasts
        │
        ▼
  [6. Jolt Core]    single-threaded deterministic JoltPhysics.js WASM (src/core/physics/)
                    consumes pluggable WrenchList (Legged GRF now; Aero/Hydro/Slither later)
                    steps core bodies + dynamic motorized chains (trunk/tail/ears)
        │
        ▼
  [7. FulliK Pose]  reads Jolt core sockets -> bilateral limb/neck/jaw solve -> writes bones
                    logs telemetry: foot error (mm), stance slip (mm), joint torques (N·m)
        │
        ▼
  [8. Skin & Coat]  DQ skin -> src/core/render/madhubani/ TSL shader (WebGPU primary, WebGL2 fallback)
3-Tier Physics LOD & Main-Thread Execution (Provisional Default #2)

With a target of 1–3 Hero physics animals @ 60 fps, dropping to 10–15 at reduced Physics LOD:

Run Jolt synchronously on the main thread (single-threaded deterministic WASM build). 3 Hero (~10 bodies each) + 12 LOD1 (1 body each) ≈ 42 dynamic bodies — well below the threshold that justifies Web Worker complexity, 1-frame interpolation lag, or COOP/COEP headers.

Hard CPU budget (to be measured): ≤ 3.0 ms/frame total for physics + IK across 3 Hero + 12 LOD1 (≤ 0.7 ms/hero, ≤ 0.07 ms/LOD1), reserving ≥ 13.5 ms for WebGPU/WebGL2 TSL rendering and DQ skinning at 60 fps.

LOD Tiers (paired with mesh quality tiers hero ~120k → crowd ~6k):

Physics LOD 0 (Hero, max 3, enter < 12 m / exit > 16 m hysteresis): 2-body dynamic core + GRF wrenches + bilateral FulliK + Jolt dynamic secondary chains + kinematic foot colliders.

Physics LOD 1 (Mid/Herd, #4–#15, 12–35 m): 1-body dynamic core + vertical/pitch spring + 4-iter FulliK (or analytic 2-bone legs) + cheap JS damped-spring secondary motion (zero Jolt constraints).

Physics LOD 2 (Crowd, > 15 or ~6k crowd tier): Reference-culture kinematic gait + heightfield snap (~0.1 ms/animal, zero Jolt bodies).

Provisional Defaults Impact Ledger (Flagged for Mehul’s Final Call)
Provisional Default	Concrete Effect on This Plan	Impact If Mehul Overrides
Default #1: Serial execution — Art Gate first, then Measurement/Physics	M1 is strictly Art Gate + minimal 3-distance visual capture fixture. Zero Jolt code lands until coat distance-readability and scale-locked tiling pass on WebGPU & WebGL2.	M1 (src/core/render/madhubani/) and M2 (fox-fullik.ts + madhuban-morphology/) touch disjoint files and can execute in parallel with zero merge conflict.
Default #1 + Elephant WIP (rig.js & sculpt.js only, no index.js)	Because Elephant isn't wired into the renderer yet, M1 benchmarks scale-locked tiling across small→large existing reference species, and completing src/species/elephant/index.js is scheduled at the start of M4.	If Mehul wants Elephant inside M1’s visual gate, move Task 4.1 (elephant/index.js) ahead of Task 1.3.
Default #2: 1–3 Hero @ 60 fps, 10–15 at reduced Physics LOD	Locks Jolt to main-thread synchronous single-threaded WASM and introduces the 3-tier Physics LOD contract + hysteresis handoff.	If Mehul raises the target to 25+ simultaneous full-physics animals, Jolt must move into a Web Worker with double-buffered transform snapshots.
2. Milestone Order & Verifiable Acceptance Tests
#	Milestone	Scope	Verifiable Acceptance Test (PASS / FAIL)
M1	Art Gate First: Distance-Readable Toon/Banding, Scale-Locked Tiling & Visual Harness (Default #1)	madhubanvan: src/core/render/madhubani/, app/patterns.html, PROGRESS.md, MOTIFS.md	Deterministic capture runner renders 4 reference species (small→large) at 2 m, 8 m, 20 m in both WebGPU and WebGL2 with 0 console/shader errors and 0-pixel diff across repeated seeded runs; toon bands & primary silhouette contrast remain readable at 20 m (measured via band-luminance contrast metric + sign-off against the artist’s verbatim note in PROGRESS.md, with no relief/embossing); motif aspect ratio within [0.9, 1.1], zero row-seam clipping; hero frame-time delta < +1.0 ms.
M2	True Ruler, Bilateral Fox FulliK Closure & Telemetry Runner	handwired/madhuban-morphology/ + madhubanvan/src/species/fox/	mass.ts segmental export sums within < 1.0% of whole-SDF mass on Fox and Elephant, with all inertia tensors symmetric positive-definite (
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

); AUDIT.md sensitivity report separates density/ruler error from SDF sculpt error and quantifies Elephant leverage on the 0.75 vs. 0.65 exponent; fox-fullik.ts solves all 4 feet to < 2.0 mm (fixing the 2.59 cm hind-left residual) across 100 flat/sloped/uneven poses, with left/right mirror symmetry < 1e-4 rad.
M3	Fox Split-Authority Physics Vertical Slice (vs. Reference Culture)	madhubanvan: src/core/physics/, Fox rig/gait, side-by-side harness	Determinism: 2 fresh runs over 600 fixed steps (10 s) match core pose to < 1e-6 m / < 1e-6 rad. Physics truth: Standing fore/hind GRF split matches mass.ts static prediction within < 3.0%; 15° uphill measurably shifts load rearward; 0.30 m drop settles in ≤ 0.6 s with < 2.0 mm ground penetration. Foot quality: Stance foot slip < 3.0 mm; IK error < 2.0 mm. Budget: ≤ 0.7 ms/frame per hero fox; 0 WASM heap growth across 50 create/destroy cycles. Art parity: Zero coat tearing or silhouette collapse vs. Reference Fox at 2m/8m/20m.
M4	Elephant Completion, Scale Proof & 3-Hero + 12-LOD1 Stress Benchmark	madhubanvan: src/species/elephant/, Physics LOD 0/1/2	src/species/elephant/index.js renders with cross-repo geometry/mass parity against handwired/madhuban-morphology/elephant.ts (< 2% volume delta); zero per-species physics gain overrides in code; Fox (~6 kg) and Elephant (~4,000 kg) both stand, walk, turn, and survive 0.25 × hipHeight drops on the exact same dimensionless controller; Elephant walk duty factor > 0.60 with lower stride frequency (Froude scaling logged); Jolt trunk chain droops smoothly, tracks curl target within < 5° mean error, and stays < 3 mm above ground; 3 Hero + 12 LOD1 scene sustains ≥ 60 fps (≤ 3.0 ms/frame physics+IK) with < 5 mm LOD transition pop.
M5	Morphology Verification Gate (Bridge to PLAN-form-follows-function.md)	handwired/madhuban-morphology/ + headless Bun/Jolt runner	Headless "Drop, Stand & Load" evaluator runs all 25 bodies in < 30 s total, outputting JSON { staticMarginMm, dynamicSettleMm, foreHindGrfSplit, peakJointTorquesNm, collapsed }; synthetic unstable test body (CoM outside footprint by 10 cm) deterministically reports collapsed: true; pluggable AeroForceGenerator wrench hook balances 
𝐿
=
𝑚
𝑔
L=mg
 within < 1.0% on an analytical benchmark — unlocking the Eagle Wing acceptance test and Griffin derivation.
3. Execution-Ready Agent Task Specs

Each spec is self-contained for an executing agent with local checkout of both repos.

Milestone 1 — Art Gate First
Task 1.1: Deterministic Multi-Distance Visual Capture Fixture

Repo: madhubanvan

Read First: README.md, llms.txt, PROGRESS.md (all 8 sessions), app/patterns.html

Deliverable: tools/visual-gate.ts (plus minimal browser runner page) accepting (species, seed, qualityTier, coatStyle, palette, backend: 'webgpu' | 'webgl2'), posing the animal in bind + mid-stride, capturing deterministic PNGs at 2 m, 8 m, 20 m (3/4 front-side, fixed lighting), and emitting JSON with backend tag, shader warning count, median frame ms over 120 frames, and luminance-band contrast stats.

Constraints: Seed-deterministic; zero runtime dependencies added to engine bundle.

Acceptance Test: Two consecutive runs for (fox, seed=42) produce 0 pixel diff on both WebGPU and WebGL2, and log frame timing cleanly.

Task 1.2: Distance-Readable Madhubani Toon/Banded Shading (TSL)

Repo: madhubanvan

Read First (Mandatory): PROGRESS.md (artist’s verbatim note is the binding spec), MOTIFS.md, AUTHORING.md, all files in src/core/render/madhubani/, handwired/madhubani-probe/probe.ts

Deliverable: Update TSL coat shader(s) in src/core/render/madhubani/ (and mip builder if mip averaging is washing out dark katchni/godna ink into mid-grey at distance) so discrete pigment/toon bands and silhouette contours read clearly at 8 m and 20 m.

Constraints: No relief/embossing (explicitly rejected); WebGPU/TSL primary, WebGL2 fallback must compile and match visually; app/patterns.html remains intact.

Acceptance Test: Task 1.1 captures at 2 m / 8 m / 20 m across 4 species × both backends show 0 shader errors, improved measured 20 m band-contrast ratio vs. commit 722aa0d baseline, < +1.0 ms hero frame-time delta, and pass visual review against the artist’s verbatim note.

Task 1.3: Per-Species Tile Sizing & Row-Locked Scales

Repo: madhubanvan

Read First: MOTIFS.md, AUTHORING.md, src/core/render/madhubani/, PROGRESS.md

Deliverable: Replace global body-space (around, along) tiling with deterministic per-species tile sizing (scaled from local girth/length so motif density reads consistently from small to large animals) and integer row-locking around circumference so scallop/scale rows never shear or half-clip across the dorsal/ventral seam.

Constraints: Preserve the 8 designGroup anatomy zones and 4 spare landmark motifs per style; motif aspect ratio stays within [0.9, 1.1].

Acceptance Test: Task 1.1 captures at 2 m and 8 m on smallest and largest existing reference quadrupeds (plus one bird/fish) show zero seam-row half-clipping, aspect ratio within ±10%, and intact shoulder/back/snout landmarks.

Milestone 2 — True Ruler & Bilateral Fox FulliK
Task 2.1: Ruler Sensitivity Audit & Segmental Inertia Export

Repo: handwired (madhuban-morphology/)

Read First: AUDIT.md, PLAN-form-follows-function.md, PORT-REPORT.md, mass.ts, audit.ts, converge.ts, masses.ts, species.ts, elephant.ts, out/converge.txt, out/audit.json

Deliverable:

Add a sensitivity script quantifying (a) uniform density vs. biological segmental density (air-filled thorax/lungs vs. muscle/bone) on the 6-of-7 fore/hind load-split discrepancy, and (b) leave-one-out allometric regression (with vs. without Elephant) to test whether the 0.75 vs. 0.65 shift is a single-point leverage artifact.

Export computeSegmentalMassProperties(sdf, rigSpec) from mass.ts producing { totalMassKg, com, supportPolygon, restingForeHindSplit, segments: [{ boneName, massKg, localCom, inertia3x3 }] } in m, kg, Y-up, +Z forward, with a minimum-mass/radius floor so thin segments (ears/tail tip) never yield degenerate inertia tensors.

Acceptance Test: bun test confirms: (1) sum(segments.massKg) matches whole-SDF mass within < 1.0% on Fox and Elephant; (2) every inertia3x3 is symmetric positive-definite with triangle inequality 
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

 satisfied; (3) voxel convergence bound from converge.ts is recorded in output JSON.

Task 2.2: Diagnose & Fix Fox FulliK (2.59 cm Hind-Left Residual + Full Bilateral Chains)

Repo: madhubanvan (src/species/fox/, src/core/rig/quadruped.js)

Read First: src/species/fox/fox-fullik.ts, src/species/fox/rig.js, src/core/rig/quadruped.js

Deliverable:

Log exact root cause of the 2.59 cm hind-left residual (checking: reverse-bend hock cone-limit lock, ankle vs. paw-pad end-effector offset, spine→pelvis→hind-leg solve order, or geometric reach deficit).

Fix the root cause and wire the complete bilateral Fox rig (all 4 legs, spine, neck, tail root, both ears, jaw).

Add headless Bun telemetry script outputting JSON { perFootErrorMm, maxReachDeficitMm, mirrorAngleDiffRad } over 100 deterministic ground-target poses (flat, 15° slope, asymmetric step).

Acceptance Test: All 4 feet converge to < 2.0 mm across all reachable poses in the 100-pose suite (any unreachable pose proves residual ≈ targetDist - maxReach within < 0.5 mm); left/right mirror test passes within < 1e-4 rad.

Milestone 3 — Fox Split-Authority Physics Vertical Slice
Task 3.1: Single-Threaded Deterministic JoltPhysics.js WASM Wrapper

Repo: madhubanvan (src/core/physics/jolt-world.ts)

Read First: llms.txt, package.json

Deliverable: Main-thread wrapper over single-threaded deterministic JoltPhysics.js WASM with fixed-timestep accumulator (dt = 1/60 s), pre-allocated scratch Vec3/RVec3/Quat pool (zero per-step allocations), explicit dispose() lifecycle tracking live WASM allocations, terrain heightfield/box/ramp collider builder, raycast API, and pluggable WrenchGenerator interface.

Acceptance Test: Unit test creates and destroys a 20-body scene 50 times with 0 net live wrapper handles and stable WASM heap; 600-step drop test reproduces identical final positions (< 1e-6 m) across two fresh world initializations.

Task 3.2: Fox Centroidal Core, Dimensionless GRF Controller & Dynamic Secondary Chains

Repo: madhubanvan (src/core/physics/legged-controller.ts, src/species/fox/)

Read First: Task 2.1 MassSpec, Task 2.2 fox-fullik.ts, src/species/fox/rig.js

Deliverable:

Build Fox Jolt dynamic core (pelvis + thorax linked by spring-damped SwingTwistConstraint) directly from MassSpec.

Implement dimensionless stance GRF controller (
𝑘
=
𝑚
𝜔
0
2
k=mω
0
2
	​

, 
𝑐
=
2
𝜁
𝑘
𝑚
c=2ζ
km
	​

 with 
𝜔
0
ω
0
	​

 derived from 
𝑔
/
𝐿
g/L
) distributing support forces across planted feet inside the support polygon, paired with Raibert/capture-point foothold placement and FulliK limb solves.

Attach Fox tail and ears as Jolt dynamic motorized SwingTwistConstraint chains; compute inverse-dynamics joint torques 
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

.

Build side-by-side comparison scene: Reference Fox vs. Physics Fox on flat ground, 15° ramp, and 0.30 m drop.

Acceptance Test: All M3 criteria in Section 2 pass (determinism < 1e-6 m, standing fore/hind GRF split within < 3.0% of mass.ts, 0.30 m drop settles ≤ 0.6 s with < 2.0 mm penetration, stance foot slip < 3.0 mm, IK error < 2.0 mm, step time ≤ 0.7 ms/frame, visual coat parity verified via Task 1.1).

Milestone 4 — Elephant Completion, Scale Proof & Physics LOD
Task 4.1: Complete src/species/elephant/index.js & Cross-Repo Parity Check

Repo: madhubanvan + handwired/madhuban-morphology/elephant.ts

Read First: src/species/elephant/rig.js, src/species/elephant/sculpt.js, handwired/madhuban-morphology/elephant.ts, handwired/madhuban-morphology/out/port-elephant.json, AUTHORING.md

Deliverable: Wire src/species/elephant/index.js matching the llms.txt species contract (all 5 quality tiers + Madhubani coat + scale-locked tiling from Task 1.3), and run a parity test comparing volume/CoM against handwired/madhuban-morphology/elephant.ts.

Acceptance Test: Elephant builds cleanly in browser & Worker across hero→crowd tiers, passes Task 1.1 visual gate at 2m/8m/20m on WebGPU & WebGL2, and matches elephant.ts total volume within < 2.0%.

Task 4.2: Elephant Scale Proof, Dynamic Jolt Trunk & 3-Tier Physics LOD

Repo: madhubanvan (src/core/physics/, src/species/elephant/)

Deliverable:

Run Elephant on the exact same legged-controller.ts from Task 3.2 (zero species-specific force constants).

Wire the Elephant trunk chain as a Jolt dynamic motorized SwingTwistConstraint chain with ground collision and target pose tracking (rest sway + curl/reach).

Implement Physics LOD 0 / LOD 1 / LOD 2 manager with distance hysteresis (12 m / 16 m, 35 m / 40 m) and velocity/phase continuity.

Build 15-animal stress scene (3 Hero [Fox, Elephant, 3rd species] + 12 LOD1).

Acceptance Test: All M4 criteria in Section 2 pass (zero per-species gain overrides, Elephant walk duty factor > 0.60, trunk curl error < 5° & ground clearance < 3 mm penetration, ≥ 60 fps with ≤ 3.0 ms/frame physics+IK, < 5 mm LOD transition pop).

Milestone 5 — Morphology Verification Gate
Task 5.1: Headless "Drop, Stand & Load" Evaluator + Pluggable Aero Wrench Hook

Repo: handwired/madhuban-morphology/ (consuming src/core/physics/ via shared TS module)

Read First: PLAN-form-follows-function.md, AUDIT.md, audit.ts

Deliverable: Headless Bun CLI running any SDF + rig through 3 s Jolt settle + push perturbation -> JSON report (staticMarginMm, dynamicSettleMm, foreHindGrfSplit, peakJointTorquesNm, collapsed); plus minimal AeroForceGenerator implementing the same WrenchGenerator interface.

Acceptance Test: All 25 current bodies evaluated in < 30 s; synthetic unstable body (CoM shifted 10 cm outside footprint) reports collapsed: true; AeroForceGenerator balances 
𝐿
=
𝑚
𝑔
L=mg
 within < 1.0% on an analytical wing-strip benchmark.

4. Risk Ledger (Mapped to Files & Measured Data)

Because of the browse-tool block noted in Section 0, exact line numbers are marked [VERIFY LINE REF] for the first local agent pass — zero fabricated line numbers.

#	Risk	Target Files	Evidence Already Observed / Mechanism	Mitigation & Gate
R1	Confounded CoM & Load-Split Error (Ruler vs. Sculpt)	handwired/madhuban-morphology/AUDIT.md, mass.ts, audit.ts, converge.ts [VERIFY LINE REF]	AUDIT.md reports CoM templated at 60.0% height (8.6% spread) across 13 species and fore/hind load split disagreeing with force-plate refs in 6 of 7 animals. Uniform voxel density treats air-filled lungs/thorax as solid muscle (~1,000 kg/m³), biasing CoM forward — which could mask or mimic SDF sculpt error.	Task 2.1 runs biological segmental-density sensitivity before wiring Jolt so we never hack physics springs to cover a density bug.
R2	Elephant Leverage Artifact in Allometry	handwired/madhuban-morphology/AUDIT.md, audit.ts, elephant.ts [VERIFY LINE REF]	Allometric exponent jumps by 0.10 (0.75 with elephant vs. 0.65 without). One ~4,000 kg point 2–3 orders of magnitude beyond 24 smaller bodies exerts massive OLS leverage; 0.75 may be a 1-point illusion rather than a scaling law across the 24 bodies.	Task 2.1 computes leave-one-out residuals / Cook’s distance and checks whether elephant.ts obeys a different sculpt scaling law than the upstream 24.
R3	29× Fox FulliK Residual & Incomplete Bilateral Wiring	madhubanvan/src/species/fox/fox-fullik.ts, rig.js, src/core/rig/quadruped.js [VERIFY LINE REF]	Front-left hits 0.90 mm, hind-left stalls at 2.59 cm (28.8× worse), and only spine, front-left, hind-left, ear, jaw are wired (right limbs & tail absent). Classic FABRIK causes: reverse-bend canid hock locking under ball-joint cone limits, ankle-vs-paw-pad end-effector offset (~2.5 cm), stale pelvis root order after spine solve, or geometric reach deficit.	Task 2.2 instruments and resolves exact root cause to < 2.0 mm bilaterally before any Jolt integration.
R4	Madhubani Mip Washout & High-Bend Coat Distortion	madhubanvan/src/core/render/madhubani/, MOTIFS.md, PROGRESS.md [VERIFY LINE REF]	Thin black ink (katchni/godna) averaged with bright pigment across standard mip levels collapses to muddy grey at distance — likely a root cause of why toon/banded shading fails at distance. Under real Jolt drops and trunk curls, sharper bends will also stress DQ skinning and body-space (around, along) metres.	Tasks 1.2 & 1.3 gate 2m/8m/20m contrast and row-locked scale integrity on WebGPU + WebGL2 before M3.
R5	Cross-Repo Elephant Drift (madhubanvan vs. handwired)	madhubanvan/src/species/elephant/{rig.js,sculpt.js} vs. handwired/madhuban-morphology/elephant.ts, out/port-elephant.json [VERIFY LINE REF]	Elephant exists in two repos (elephant.ts in handwired, WIP rig.js/sculpt.js without index.js in madhubanvan). Divergent SDF dimensions or bone lengths will silently invalidate mass.ts mass/inertia bindings when plugged into Jolt.	Task 4.1 enforces an automated < 2% volume/CoM parity test between the two Elephant definitions.
R6	JoltPhysics.js WASM Heap Leaks & Degenerate Inertia Assertions	madhubanvan/src/core/physics/ (new) + handwired/madhuban-morphology/mass.ts [VERIFY LINE REF]	Emscripten bindings require explicit Jolt.destroy() — a single new Jolt.Vec3() inside a 60 Hz step leaks tab memory rapidly. Thin SDF segments (ears, tail tips) can also produce non-positive-definite inertia tensors that trigger Jolt assertions or constraint explosions.	Task 3.1 mandates zero per-step allocations + 50-cycle leak test; Task 2.1 enforces SPD + 
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

 + minimum mass/radius floor on every exported segment.
R7	Premature handwired Circuit Coupling & Approximation Drift	handwired/madhuban-morphology/PORT-REPORT.md, port.ts [VERIFY LINE REF]	Porting SDFs into handwired ReGLU/matmul circuits introduces numerical deviation bounds (tracked in PORT-REPORT.md) and extra compute. Pulling handwired into live Three.js/Jolt runtime would break 60 fps and add approximation error prematurely.	Strictly quarantine handwired to offline madhuban-morphology/ optimization until PLAN-form-follows-function.md’s final phase genuinely needs differentiable gradients.
How to Get Exact Line-Level Audits From Me Immediately (Optional)

Local agents can begin Task 1.1 and Task 1.2 immediately using the specs above. If you want me to audit the actual lines of PROGRESS.md (especially the artist’s verbatim note), fox-fullik.ts, AUDIT.md, mass.ts, and src/core/render/madhubani/ directly, just paste the verbatim raw URLs (not a <path> template) or paste the file contents into your next message, and I will replace every [VERIFY LINE REF] with exact line citations and lock Task 1.2’s shader parameters against the artist’s exact words.