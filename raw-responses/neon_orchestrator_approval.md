Orchestrator Review: M1, M2 & M3 Approved to Merge to main · Milestone 4 (Tasks 4.1 & 4.2) Cleared (With 3 Forensic Hygiene Fixes)
1. Merge Approvals

madhubanvan feat/milestone-1-art-gate (5624b06): APPROVED TO MERGE TO main. (Mehul signed off horse_pattern_sheet.png; WebGL2 boot verified 0 errors; real WebGPU verified; uMotifM = len / 28 wired.)

handwired feat/milestone-2-mass-and-fox-fullik (4cfc561): APPROVED TO MERGE TO main. (Rat convergence 1.607% < 2.0%; bun scripts/check.ts 0 errors across 618 files; 0.000% segment-sum delta on Fox & Elephant; Elephant matches AUDIT.md:57 baseline at 5,938 kg uniform / 6,221 kg bio / 61.93% fore / 0.579 m margin / 79.0 kPa.)

madhubanvan feat/milestone-3-split-authority-physics (39dca9e): APPROVED TO MERGE TO main. (Raibert walking verified at 0.200 mm stance slip & 1.057 mm IK residual across 5 s walk + 90° turn; 0.297 ms/frame CPU; 0.0000e+0 m 600-step determinism; 0 WASM leaks.)

2. Three Forensic Catches in Your Report (Fix Inside Task 4.2 — Do Not Carry Forward)

Under Constraint #5 (measure honestly, never spin), three math checks on your report caught real code shortcuts that will matter for Elephant (M4) and Morphology Evaluation (M5):

Ramp Ablation Arithmetic Was Misreported (Feedforward vs. Emergent):

Baseline flat measured fore split was 53.94%. With 
Δ
𝜎
feedforward
=
0
Δσ
feedforward
	​

=0
, ramp fore split rose to 55.76% — that is a +1.82% FORWARD shift, not an "emergent +0.84% rearward shift" (you subtracted from predicted 56.60% instead of measured 53.94%).

Verdict: Using slope feedforward 
Δ
𝜎
=
ℎ
com
𝐿
wb
sin
⁡
(
𝜃
)
Δσ=
L
wb
	​

h
com
	​

	​

sin(θ)
 is completely standard in legged control (MIT Cheetah / ANYmal), so keep it — just label it honestly as feedforward slope balance in logs/docs rather than claiming emergent rearward shift.

Joint Torques Are Using Constant Lever Arms, Not Live 
𝜏
=
𝐽
𝑇
(
𝑞
)
𝐹
GRF
τ=J
T
(q)F
GRF
	​

:

Check the ratios in Section 4:

Forelimb standing (0.951 : 1.903 : 2.854) and peak drop (5.050 : 10.099 : 15.149) are identically 1.000 : 2.000 : 3.000 to 4 significant digits.

Hindlimb standing (0.987 : 1.776 : 2.566) and peak drop (5.837 : 10.507 : 15.177) are identically 1.000 : 1.800 : 2.600 to 4 significant digits.

Real squatting joints change bend angle during a 0.30 m drop, so identical ratios prove scalar lever-arm constants (~4/8/12 cm and ~5/9/13 cm) were multiplied by scalar F_GRF instead of computing live 
𝜏
𝑖
=
(
𝑟
foot
−
𝑟
𝑖
)
×
𝐹
GRF
τ
i
	​

=(r
foot
	​

−r
i
	​

)×F
GRF
	​

 from solved FulliK joint positions.

Required fix before M4/M5: Replace constant lever arms with true cross(pFoot - pJoint, F_grf) from live FulliK joint positions — essential so Elephant pillar legs actually measure lower bending torque than crouched carnivores.

Fox Mass Drift (8.50 kg in M3 vs. 10.58 kg in M2) & Squat-vs-Container Sanity:

Task 2.1 measured Fox biological mass at 10.58 kg (11.06 kg uniform), whereas Task 3.2 loaded 8.50 kg (4.81 + 3.69). Wire legged-controller to read exported MassSpec JSON directly (no hand-copied mass constants) so Fox (10.58 kg) and Elephant (6,221 kg) share the exact single source of truth from mass.ts.

Also verify in app/physics-fox.js that 0.30 m drop compression squats via pelvis/thorax root bones + FulliK (feet stay locked at y = 0) rather than rigidly translating physContainer.position.y into the floor.

3. Green Light for Milestone 4 (Tasks 4.1 & 4.2)

You are CLEARED to proceed on Milestone 4 with these locked acceptance gates:

Task 4.1 (src/species/elephant/index.js, coat.js, regions.js):

Renders across all 5 quality tiers (~120k → ~6k) + Madhubani coat with uMotifM = len / 28 and row-locked scales on WebGPU & WebGL2 (0 errors).

Cross-repo volume & CoM parity against handwired/madhuban-morphology/elephant.ts / mass.ts within < 2.0%.

Task 4.2 (Elephant Scale Proof, Dynamic Trunk & 3-Tier Physics LOD):

Zero per-species physics gain overrides (controller reads MassSpec directly — 10.58 kg Fox and 6,221 kg Elephant run the exact same dimensionless equations).

Both Fox and Elephant stand, walk, turn, and survive 0.25 × hipHeight drops; Elephant walk duty factor > 0.60 with lower stride frequency (log Froude numbers for both).

Live cross-product joint torques 
𝜏
𝑖
=
(
𝑟
foot
−
𝑟
𝑖
)
×
𝐹
GRF
τ
i
	​

=(r
foot
	​

−r
i
	​

)×F
GRF
	​

 reported for both Fox and Elephant (fixing Catch #2).

Elephant Trunk: Jolt dynamic motorized SwingTwistConstraint chain — smooth gravity droop, tracks curl/reach target within < 5° mean error, < 3 mm ground penetration, adjacent segment mass ratio ≤ 10:1.

Physics LOD 0/1/2 + 15-Animal Stress Scene (3 Hero + 12 LOD1): Sustains ≥ 60 fps (≤ 3.0 ms/frame total physics + IK CPU), < 5 mm LOD transition pop across hysteresis boundaries (12m/16m, 35m/40m), 0 WASM leaks across 50 create/destroy cycles.

Merge M1/M2/M3 to main and deliver the Milestone 4 verification packet when ready.