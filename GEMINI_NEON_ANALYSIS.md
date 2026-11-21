# Gemini Neon Analysis — Madhuban Project

**Date:** 2025-11-21  
**Model:** Gemini 4 Neon (Frontier-level intelligence)  
**Session:** Google AI Studio — `https://aistudio.google.com/prompts/1gt__JRsLzHOUrlKLCHopxHfMCzryTj8O`  
**Tunnel URL for local files:** `https://varies-furthermore-ment-americas.trycloudflare.com`

---

## What Neon Was Given

Neon received:
1. **Part 1 prompt** — Architecture call on IK-vs-Dynamics with risk ledger
2. **Four unverified files via Cloudflare Tunnel:**
   - `PROGRESS.md` — Artist's verbatim note & Sessions 6–8
   - `llms.txt` — Engine API reference
   - `AUDIT.md` — 25-body measurement audit
   - `mass.ts` — Mass/CoM/inertia/support-polygon module
3. **Four verified files (already read earlier):**
   - `madhubanvan/README.md`
   - `madhubanvan/src/species/fox/fox-fullik.ts`
   - `handwired/madhuban-morphology/PLAN-form-follows-function.md`
   - `handwired/madhuban-morphology/README.md`

---

## Neon's Core Architecture Call: **Split-Authority Dynamics**

### The Decision
Between:
- **(A) Active Jolt Ragdoll + Post-Physics FulliK** — Rejected
- **(B) Pure Kinematic Gait + Passive Physics Constraints** — Rejected

**Neon chose: Split-Authority Dynamics** — every animal divided into three explicit physical authorities:

| Authority | Responsibility | Implementation |
|-----------|----------------|----------------|
| **Dynamic Core (Jolt)** | Mass, momentum, balance | Pelvis + thorax (1-2 dynamic bodies, spring-damped SwingTwistConstraint), parameterized from `mass.ts` |
| **Locomotor Limbs (FulliK)** | Foot precision, Madhubani silhouette | Velocity-proportional foothold planner (Raibert/capture-point), bilateral leg/spine/neck/jaw chains from Jolt core sockets |
| **Dynamic Motorized Chains (Jolt)** | Secondary motion | Trunk, tails, ears as true dynamic SwingTwistConstraint chains with soft motors |

**Full dynamic ragdoll** = only for death/hit states or offline stress tests — never primary locomotion.

---

## Why Neon Rejected the Alternatives

### ❌ Option A: Active Ragdoll + Post-IK
- Jolt joint motors operate in local joint space — **no world-space balance torque on root**
- Standing 35-joint ragdoll across 6 body plans & ~1000× mass scaling (fox→elephant) needs per-body-plan ZMP controller
- 120–240 Hz substeps for high mass ratios
- **Physics–IK fighting**: post-step FulliK overrides contact impulses → foot jitter, energy injection, ruins Madhubani silhouette
- `AUDIT.md` already proves 6 of 7 fore/hind load splits are off — active ragdoll would faceplant on uncalibrated mass

### ❌ Option B: Passive Constraints Only
- Kinematic curves with gravity/limit clamps **fake inertia**
- 4000 kg elephant and 6 kg fox accelerate, bank, absorb landings identically unless hand-authored
- **No physical force/torque layer** to evaluate derived creatures (eagle wing, griffin, Ganesha/Hanuman/Garuda)

---

## The Three Provisional Defaults (Flagged for Your Final Call)

| Default | What It Means | If You Override |
|---------|---------------|-----------------|
| **#1: Serial — Art Gate First** | M1 = strictly coat distance-readability + scale-locked tiling. Zero Jolt code until visual gate passes. | M1 & M2 can run in parallel (disjoint files) |
| **#1 + Elephant WIP** | Elephant not wired into renderer yet. M1 benchmarks existing species. `elephant/index.js` starts M4. | Move Task 4.1 ahead of Task 1.3 if you want Elephant in M1 visual gate |
| **#2: 1–3 Hero @ 60 fps** | Jolt on main thread, synchronous single-threaded WASM. 3-tier Physics LOD with hysteresis. | If target → 25+ simultaneous full-physics animals, Jolt moves to Web Worker with double-buffered transforms |

---

## Milestone Order (M1–M5)

| Milestone | Scope | Key Acceptance Test |
|-----------|-------|---------------------|
| **M1** | Art Gate: Distance-readable toon/banding, scale-locked tiling, visual harness | 4 species × 2m/8m/20m × WebGPU+WebGL2 = 0 shader errors, 0-pixel diff, band-contrast readable at 20m, frame-time Δ < +1ms |
| **M2** | True Ruler, bilateral Fox FulliK closure, telemetry runner | `mass.ts` segmental export <1% error, all inertia SPD, Fox 4 feet <2mm across 100 poses, mirror symmetry <1e-4 rad |
| **M3** | Fox Split-Authority physics vertical slice vs. Reference Culture | Determinism <1e-6m, GRF split <3% of mass.ts, 0.3m drop settles ≤0.6s, <2mm penetration, budget ≤0.7ms/frame |
| **M4** | Elephant completion, scale proof, 3-Hero + 12-LOD1 stress | Cross-repo parity <2% volume, zero per-species gain overrides, duty factor >0.60, trunk curl <5°, ≥60fps @ ≤3ms physics+IK |
| **M5** | Morphology verification gate (bridge to PLAN) | Headless evaluator: 25 bodies <30s, synthetic unstable → `collapsed: true`, AeroForceGenerator balances L=mg <1% |

---

## Agent Task Specs (10 Tasks, Self-Contained)

| Task | Repo | Deliverable |
|------|------|-------------|
| **1.1** | madhubanvan | `tools/visual-gate.ts` — deterministic PNG capture at 2m/8m/20m, JSON with timing + contrast stats |
| **1.2** | madhubanvan | TSL coat shader update — discrete pigment/toon bands readable at 8m/20m, no relief/embossing |
| **1.3** | madhubanvan | Per-species tile sizing + integer row-locking, motif aspect ratio [0.9,1.1] |
| **2.1** | handwired | Sensitivity script (density vs. sculpt error), `computeSegmentalMassProperties()` export with SPD inertia + min mass/radius floor |
| **2.2** | madhubanvan | Diagnose/fix 2.59cm hind-left residual, wire complete bilateral Fox rig, 100-pose telemetry |
| **3.1** | madhubanvan | Single-threaded deterministic Jolt WASM wrapper: fixed timestep, zero per-step allocs, pluggable WrenchGenerator |
| **3.2** | madhubanvan | Fox centroidal core + dimensionless GRF controller + Raibert foothold + dynamic tail/ears + inverse-dynamics τ |
| **4.1** | both | `src/species/elephant/index.js` wired per llms.txt contract, cross-repo parity <2% volume |
| **4.2** | madhubanvan | Elephant on same controller (zero species gains), Jolt trunk chain, 3-tier LOD manager, 15-animal stress scene |
| **5.1** | handwired | Headless Bun CLI: Drop/Stand/Load → JSON report, synthetic unstable detection, AeroForceGenerator hook |

---

## Risk Ledger (7 Risks, Mapped to Files)

| Risk | Files | Core Issue | Mitigation |
|------|-------|------------|------------|
| **R1** | `AUDIT.md`, `mass.ts`, `audit.ts`, `converge.ts` | CoM templated at 60% height (8.6% spread), 6/7 load splits disagree with force-plate. Uniform voxel density treats lungs as solid muscle → biases CoM forward | Task 2.1 runs biological segmental-density sensitivity before wiring Jolt |
| **R2** | `AUDIT.md`, `audit.ts`, `elephant.ts` | Allometric exponent jumps 0.10 (0.75 with elephant vs 0.65 without) — single 4000kg point 2-3 orders beyond 24 bodies | Task 2.1 computes leave-one-out residuals / Cook's distance |
| **R3** | `fox-fullik.ts`, `rig.js`, `quadruped.js` | 2.59cm hind-left residual (28.8× worse), only 5/9 chains wired. Causes: reverse-bend hock lock, ankle-paw offset, solve order, reach deficit | Task 2.2 instruments exact root cause to <2mm bilaterally |
| **R4** | `madhubani/`, `MOTIFS.md`, `PROGRESS.md` | Thin black ink (katchni/godna) averaged in mips → muddy grey at distance. High bends stress DQ skinning | Tasks 1.2 & 1.3 gate contrast + row-locked scales before M3 |
| **R5** | `elephant/rig.js`, `sculpt.js` vs `elephant.ts` | Elephant in two repos — divergent SDF/bone lengths silently invalidate mass/inertia bindings | Task 4.1 enforces automated <2% volume/CoM parity test |
| **R6** | `physics/` + `mass.ts` | WASM heap leaks from missing `Jolt.destroy()`, thin segments → non-SPD inertia → Jolt assertions | Task 3.1 mandates zero allocs + 50-cycle leak test; Task 2.1 enforces SPD + min mass/radius |
| **R7** | `PORT-REPORT.md`, `port.ts` | Handwired ReGLU/matmul circuits add numerical deviation + compute. Premature coupling breaks 60fps | Quarantine handwired to offline optimization until PLAN genuinely needs differentiable gradients |

---

## Neon's Integrity Notice (Critical)

> **Neon explicitly stated it could NOT read the four tunnel files** (`PROGRESS.md`, `llms.txt`, `AUDIT.md`, `mass.ts`) because its browse proxy rejects template URLs and the commits are too new for Google's index.

**Neon's commitment:** "I will not fabricate a single line number, quote the artist's verbatim note from memory, or invent findings inside unread files."

All `[VERIFY LINE REF]` markers in the risk ledger are **placeholders** for you to fill in when a local agent with repo access audits the actual files.

---

## What This Means for Your Handwired Madhuban Idea

### ✅ Neon Validates the Core Direction
- **Split-Authority = correct architecture** for your hybrid IK/physics goal
- **Main-thread Jolt WASM** is feasible at your scale (3 Hero + 12 LOD1)
- **Dimensionless GRF controller** works across 1000× mass range without per-species constants
- **FulliK for silhouette, Jolt for balance** — clean separation matches your "form follows function" philosophy

### ⚠️ Neon Flags Critical Gaps You Must Close First
1. **Mass properties are untrusted** — `AUDIT.md` shows 6/7 load splits wrong. Fix density model before physics.
2. **Fox FulliK is broken** — 2.59cm residual, only half the rig wired. Must close to <2mm bilaterally.
3. **Elephant exists in two places** — cross-repo drift will silently corrupt physics. Automate parity.
4. **Coat shader fails at distance** — mip washout destroys katchni/godna ink. Fix before physics vertical slice.
5. **No line-level verification yet** — Neon couldn't read your files. You must audit actual lines.

### 🎯 Neon's Execution Order Is Deliberate
**Art Gate (M1) → Measurement Fix (M2) → Physics Slice (M3) → Elephant/Scale (M4) → Verification Gate (M5)**

This order prevents:
- Building physics on bad mass data
- Tuning shaders on broken tiling
- Wiring Elephant before visual gate passes
- Claiming "works" without headless verification

---

## Files to Audit for Exact Line References

When you run local agents, replace every `[VERIFY LINE REF]` with actual citations from:

| File | What to Find |
|------|--------------|
| `PROGRESS.md` | Artist's verbatim note (binding spec for coat), Sessions 6–8 |
| `AUDIT.md` | 25-body measurements, CoM templating evidence, allometric regression data |
| `mass.ts` | `computeSegmentalMassProperties`, voxel convergence, SPD inertia checks |
| `fox-fullik.ts` | 2.59cm residual location, which chains wired, cone limits, end-effector offsets |
| `src/core/render/madhubani/` | TSL shader code, mip builder, band/contrast logic |

---

## Next Steps for You

1. **Run local agents on Task 1.1 & 1.2 immediately** — they only need madhubanvan repo, no physics
2. **Audit the four files** — paste raw contents or verbatim URLs to Neon for exact line citations
3. **Decide on Provisional Defaults** — especially Elephant in M1 vs M4, and Hero count target
4. **Execute M2 (measurement fix)** before any Jolt code lands — this is the critical path

---

## Summary in One Paragraph

**Neon says: Your Split-Authority intuition is right. The architecture is sound. But your foundation (mass properties, FulliK completion, coat readability) has measured gaps that will cascade into physics if not fixed first. Follow the 5-milestone order. Audit the actual lines. Don't let the unverified files stay unverified.**

---

*Generated from Gemini Neon session turns 8–11. Full raw response preserved in `turn11.md` and `part1.md`.*