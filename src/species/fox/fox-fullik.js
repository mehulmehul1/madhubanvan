// fox-fullik.js — Fox rig mapped to FulliK IK solver with 4 bilateral legs & anatomical hinges.
// In-tree vendor: imports directly from ../../core/ik/fullik/fik.module.js with zero external path dependencies.

import { foxJoints, foxRig } from './rig.js';
import * as FIK from '../../core/ik/fullik/fik.module.js';

const { Bone3D, Chain3D, Joint3D, V3, J_BALL, J_GLOBAL, J_LOCAL } = FIK;

/**
 * Build a FulliK Bone3D from joint coordinates
 */
export function buildBone(J, name, headName, tailName) {
  const h = J[headName];
  const t = J[tailName];
  if (!h || !t) throw new Error(`bone ${name}: missing ${!h ? headName : tailName}`);
  const bone = new Bone3D(new V3(h[0], h[1], h[2]), new V3(t[0], t[1], t[2]));
  bone.name = name;
  return bone;
}

/**
 * Configure anatomical constraints on a FulliK bone
 */
function applyBoneConstraint(b, bName) {
  const dir = b.getDirectionUV();
  const rotAxis = new V3(1, 0, 0); // transverse / lateral flexion-extension axis
  const refAxis = dir.clone();
  refAxis.projectOnPlane(rotAxis);

  // Knee (tibia), hock (metatarsus), elbow (radius), carpus (metacarpus) are hinges
  // Flexion-extension allows 120° hinge swing clearance
  if (
    bName.startsWith('tibia') ||
    bName.startsWith('metatarsus') ||
    bName.startsWith('radius') ||
    bName.startsWith('metacarpus')
  ) {
    b.joint.setHinge(J_GLOBAL, rotAxis, 120, 120, refAxis);
  } else {
    // Scapula, shoulder, hip, paws have ball joint freedom
    b.setBallJointConstraintDegs(85);
  }
}

/**
 * Solve 4-limb Fox IK for ground contact
 */
export function solveFoxIK(options = {}) {
  const rig = foxRig(options.params || {});
  const J = rig.J;
  const tolMm = options.tolMm ?? 2.0;
  const tolM = tolMm / 1000.0;
  const maxIters = options.maxIter ?? 40;

  // 4 Bilateral Limb Chains + Spine
  const chainDefs = [
    { name: 'FL', bones: ['scapulaL', 'humerusL', 'radiusL', 'metacarpusL', 'fpawL'], toe: 'ftoeL', isLeg: true },
    { name: 'FR', bones: ['scapulaR', 'humerusR', 'radiusR', 'metacarpusR', 'fpawR'], toe: 'ftoeR', isLeg: true },
    { name: 'HL', bones: ['femurL', 'tibiaL', 'metatarsusL', 'hpawL'], toe: 'htoeL', isLeg: true },
    { name: 'HR', bones: ['femurR', 'tibiaR', 'metatarsusR', 'hpawR'], toe: 'htoeR', isLeg: true },
    { name: 'spine', bones: ['head', 'neck2', 'neck1', 'chest', 'spine3', 'spine2', 'spine1', 'pelvis'], isLeg: false },
  ];

  const chains = {};
  const rigBones = rig.BONE;

  for (const def of chainDefs) {
    const c = new Chain3D();
    c.name = def.name;
    for (const bName of def.bones) {
      const boneDef = rigBones[bName];
      if (!boneDef) continue;
      const b = buildBone(J, bName, boneDef.headJ, boneDef.tailJ);
      applyBoneConstraint(b, bName);
      c.addBone(b);
    }
    chains[def.name] = c;
  }

  // Ground plane foothold targets (default y=0 or custom ground callback, or explicit foothold targets from gait planner)
  const groundFn = options.ground || ((x, z) => 0);
  const targets = options.targets ? { ...options.targets } : {};

  if (!targets.FL && J.ftoeL) targets.FL = [J.ftoeL[0], groundFn(J.ftoeL[0], J.ftoeL[2]), J.ftoeL[2]];
  if (!targets.FR && J.ftoeR) targets.FR = [J.ftoeR[0], groundFn(J.ftoeR[0], J.ftoeR[2]), J.ftoeR[2]];
  if (!targets.HL && J.htoeL) targets.HL = [J.htoeL[0], groundFn(J.htoeL[0], J.htoeL[2]), J.htoeL[2]];
  if (!targets.HR && J.htoeR) targets.HR = [J.htoeR[0], groundFn(J.htoeR[0], J.htoeR[2]), J.htoeR[2]];

  const solved = {};
  let maxResidualMm = 0;
  let allConverged = true;

  for (const [name, c] of Object.entries(chains)) {
    if (!targets[name]) continue;
    const t = targets[name];
    const targetV3 = new V3(t[0], t[1], t[2]);
    c.useEmbeddedTarget = true;
    c.embeddedTarget.copy(targetV3);
    c.maxIteration = maxIters;
    c.solveDistanceThreshold = tolM;
    c.precision = 0.001;
    c.solveForEmbeddedTarget();

    const distMm = (c.currentSolveDistance || 0) * 1000.0;
    const endBone = c.bones[c.bones.length - 1];
    const endPos = endBone ? [endBone.end.x, endBone.end.y, endBone.end.z] : [0, 0, 0];
    const converged = distMm <= tolMm;

    if (distMm > maxResidualMm) maxResidualMm = distMm;
    if (!converged) allConverged = false;

    solved[name] = {
      bones: c.bones.length,
      solved: c.numBones,
      distance: c.currentSolveDistance,
      footEnd: endPos,
      distMm,
      converged,
    };
  }

  // 4-point Support Polygon & Stability Margin
  const footPoints = [
    solved.FL ? [solved.FL.footEnd[0], solved.FL.footEnd[2]] : [J.ftoeL[0], J.ftoeL[2]],
    solved.FR ? [solved.FR.footEnd[0], solved.FR.footEnd[2]] : [J.ftoeR[0], J.ftoeR[2]],
    solved.HR ? [solved.HR.footEnd[0], solved.HR.footEnd[2]] : [J.htoeR[0], J.htoeR[2]],
    solved.HL ? [solved.HL.footEnd[0], solved.HL.footEnd[2]] : [J.htoeL[0], J.htoeL[2]],
  ];

  // Shoelace area of quadrilateral
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += footPoints[i][0] * footPoints[j][1] - footPoints[j][0] * footPoints[i][1];
  }
  area = Math.abs(area) * 0.5;

  // Center of mass projection (fox CoM is around lumbarRear/spineMid)
  const comZ = J.lumbarMid ? J.lumbarMid[2] : 0;
  const comX = 0; // Bilateral symmetry plane

  // Shortest distance to boundary (margin)
  let minMargin = Infinity;
  for (let i = 0; i < 4; i++) {
    const p1 = footPoints[i];
    const p2 = footPoints[(i + 1) % 4];
    const dx = p2[0] - p1[0];
    const dz = p2[1] - p1[1];
    const len = Math.hypot(dx, dz);
    if (len > 1e-6) {
      const dist = Math.abs((p2[0] - p1[0]) * (p1[1] - comZ) - (p1[0] - comX) * (p2[1] - p1[1])) / len;
      if (dist < minMargin) minMargin = dist;
    }
  }

  return {
    solved,
    chains,
    targets,
    maxResidualMm,
    converged: allConverged,
    stance: {
      hull: footPoints,
      area,
      inside: minMargin > 0,
      margin: minMargin,
    },
  };
}

export { foxJoints, foxRig };
