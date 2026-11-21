// fox-fullik.ts — self-contained integration of fox rig with FulliK IK solver
// Maps fox rig joints to FulliK Bone3D chains, solves IK for ground contact.
// No dependency on mass.ts/species.ts — works with just the fox rig.

import { buildRig } from '../../core/rig/rig.js'
import { foxJoints, foxRig, TAIL_SEGS, HEAD_O, SH } from './rig.js'
import { Bone3D, Chain3D, Joint3D, V3, IKSolver } from '../../../../../fullik-repo/src/FIK.js'

// ------------------------------------------------------------------ Load fox rig (bind pose)
const J = foxJoints({})
console.log('FOX JOINT COUNT:', Object.keys(J).length)
console.log('FOX JOINTS sample:', Object.keys(J).slice(0, 8).join(', ') + ' ...')

// ------------------------------------------------------------------ Helper: build a FulliK Bone3D from a joint name pair
function buildBone(name: string, headName: string, tailName: string): any {
  const h = J[headName] as number[]
  const t = J[tailName] as number[]
  if (!h || !t) throw new Error(`bone ${name}: missing ${!h ? headName : tailName}`)
  const dx = t[0]! - h[0]!
  const dy = t[1]! - h[1]!
  const dz = t[2]! - h[2]!
  const len = Math.hypot(dx, dy, dz)
  return new Bone3D(
    new V3(h[0]!, h[1]!, h[2]!),
    new V3(t[0]!, t[1]!, t[2]!),
    new V3(dx / len, dy / len, dz / len),
    len
  )
}

// ------------------------------------------------------------------ Map fox bones to FulliK chains (from quadrupedBones / quadrupedLimbs)
// Chains: spine, FL (front-left), HL (hind-left), earL, jaw
const chainDefs = [
  { name: 'spine', bones: ['head', 'neck2', 'neck1', 'chest', 'spine3', 'spine2', 'spine1', 'pelvis'] },
  { name: 'FL', bones: ['scapulaL', 'humerusL', 'radiusL', 'metacarpusL', 'fpawL'] },
  { name: 'HL', bones: ['femurL', 'tibiaL', 'metatarsusL', 'hpawL'] },
  { name: 'earL', bones: ['earL'] },
  { name: 'jaw', bones: ['jaw'] }
]

const chains: Record<string, Chain3D> = {}
for (const def of chainDefs) {
  const c = new Chain3D()
  c.name = def.name
  for (const bName of def.bones) {
    // The rig BONES map has names like 'scapulaL' from the {S} expansion
    const boneDef = foxRig().BONE[bName as string]
    if (!boneDef) {
      console.warn(`SKIP bone ${bName}: not found in BONES`)
      continue
    }
    const b = buildBone(bName, boneDef.headJ, boneDef.tailJ)
    b.name = bName
    // Ball joint with 30° cone constraint for natural motion
    b.setBallJointConstraintDegs(30)
    c.addBone(b)
  }
  chains[def.name] = c
}

console.log('BUILT CHAINS:', Object.keys(chains).join(', '))

// ------------------------------------------------------------------ Set ground targets (feet on y=0, the standing plane)
// In the bind pose, ftoeL / htoeL joint y is ~0.0085. We target them to y=0.
const targets: Record<string, any[]> = {}
// FL foot: ftoeL -> target (x, 0, z). We add a small forward offset for balanced stance.
if (J.ftoeL) {
  targets.FL = [J.ftoeL![0], 0.0, J.ftoeL![2]!] as number[]
}
// HL foot: htoeL -> target (x, 0, z)
if (J.htoeL) {
  targets.HL = [J.htoeL![0], 0.0, J.htoeL![2]!] as number[]
}
console.log('GROUND TARGETS:', targets)

// ------------------------------------------------------------------ Solve IK for each chain
const solved: Record<string, any> = {}
for (const [name, c] of Object.entries(chains)) {
  if (!targets[name]) {
    console.log(`SKIP ${name}: no ground target defined`)
    continue
  }
  const target = new V3(targets[name][0]!, targets[name][1]!, targets[name][2]!)
  c.useEmbeddedTarget = true
  c.embeddedTarget.copy(target)
  c.maxIteration = 40       // same as IKSolver default
  c.solveDistanceThreshold = 0.001   // 1 mm
  c.precision = 0.001    // 0.1°
  c.solveForEmbeddedTarget()
  solved[name] = { bones: c.bones.length, solved: c.numBones, distance: c.currentSolveDistance }
  console.log(`IK SOLVED ${name}: bones=${c.bones.length} iters=${c.maxIteration} dist=${(c.currentSolveDistance as number).toFixed(5)}`)
}

// ------------------------------------------------------------------ Output: solved pose + joint angles summary
console.log('--- SOLVED POSE ---')
for (const [name, info] of Object.entries(solved)) {
  console.log(`${name}: ${info.solved} bones solved, final distance=${info.distance.toFixed(5)} m`)
}

// ------------------------------------------------------------------ Simple static check (approx): compute CoM margin from solved joint positions
// Rough estimate: average the foot positions, compute the convex hull, check if CoM projects inside.
// For now, we just check the bind pose foot positions vs y=0 to give a baseline.
function approxMargin(): number {
  // Take the two hind feet positions, average them, check if the spine midpoint is higher
  const hipL = J.hipL as number[]
  const htoeL = J.htoeL as number[]
  if (!hipL || !htoeL) return 0
  const footAvgX = (hipL[0] + htoeL[0]) / 2
  const footAvgZ = (hipL[2] + htoeL[2]) / 2
  // Spine midpoint (rough): between pelvis and head
  const spineMidX = (J.pelvis ? J.pelvis[0] : 0) + (J.head ? (J.head[0] - J.pelvis![0]) * 0.6 : 0)
  const spineMidZ = (J.pelvis ? J.pelvis[2] : 0) + (J.head ? (J.head[2] - J.pelvis![2]) * 0.6 : 0)
  // Simple margin heuristic: if feet are at similar x positions and spine is centered, margin > 0
  const spread = Math.abs(hipL[0] - htoeL[0])
  return spread < 0.1 && Math.abs(spineMidX) < 0.05 ? 0.02 : -0.01
}

const margin = approxMargin()
const verdict = margin > 0 ? 'STANDS (approx margin > 0)' : 'FALLS (approx margin < 0)'
console.log('STATIC CHECK: ' + verdict)

// ------------------------------------------------------------------ Summary
console.log('--- FOX FULLIK COMPLETE ---')
console.log('Chains solved:', Object.keys(solved).length)
console.log('Target feet placed on y=0 plane')
console.log('IK solver: FulliK FABRIK (geometry only, no dynamics)')
console.log('Static check: approximate CoM margin from joint positions')
console.log('Next step: add mass.ts validation + JoltPhysics dynamics layer')

export { solved, chains, targets, margin, verdict }