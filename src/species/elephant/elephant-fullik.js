// elephant-fullik.js — Elephant rig mapped to FulliK IK solver with 4 bilateral columnar legs & anatomical hinges.
import { elephantJoints, elephantRig } from './rig.js';
import * as FIK from '../../core/ik/fullik/fik.module.js';

const { Bone3D, Chain3D, Joint3D, V3, J_BALL, J_GLOBAL } = FIK;

export function buildBone(J, name, headName, tailName) {
  const h = J[headName];
  const t = J[tailName];
  if (!h || !t) throw new Error(`bone ${name}: missing ${!h ? headName : tailName}`);
  const bone = new Bone3D(new V3(h[0], h[1], h[2]), new V3(t[0], t[1], t[2]));
  bone.name = name;
  return bone;
}

function applyElephantConstraint(b, bName) {
  const dir = b.getDirectionUV();
  const rotAxis = new V3(1, 0, 0); // lateral / transverse hinge axis
  const refAxis = dir.clone();
  refAxis.projectOnPlane(rotAxis);

  // Columnar pillar legs: elbow and knee have hinge freedom
  if (
    bName.startsWith('tibia') ||
    bName.startsWith('metatarsus') ||
    bName.startsWith('radius') ||
    bName.startsWith('metacarpus')
  ) {
    b.joint.setHinge(J_GLOBAL, rotAxis, 90, 90, refAxis);
  } else {
    // Shoulder, hip have ball joint freedom
    b.setBallJointConstraintDegs(80);
  }
}

export function solveElephantIK(options = {}) {
  const baseJ = options.joints || (options.params ? elephantJoints(options.params) : elephantJoints());
  const rig = elephantRig(baseJ);
  const J = rig.J;
  const tolMm = options.tolMm ?? 2.0;
  const tolM = tolMm / 1000.0;
  const maxIters = options.maxIter ?? 40;

  const chainDefs = [
    { name: 'FL', bones: ['scapulaL', 'humerusL', 'radiusL', 'metacarpusL', 'fpawL'], toe: 'ftoeL' },
    { name: 'FR', bones: ['scapulaR', 'humerusR', 'radiusR', 'metacarpusR', 'fpawR'], toe: 'ftoeR' },
    { name: 'HL', bones: ['femurL', 'tibiaL', 'metatarsusL', 'hpawL'], toe: 'htoeL' },
    { name: 'HR', bones: ['femurR', 'tibiaR', 'metatarsusR', 'hpawR'], toe: 'htoeR' },
  ];

  const boneLookup = {
    scapulaL: ['scapTopL', 'shoulderL'],
    humerusL: ['shoulderL', 'elbowL'],
    radiusL: ['elbowL', 'wristL'],
    metacarpusL: ['wristL', 'mcpL'],
    fpawL: ['mcpL', 'ftoeL'],

    scapulaR: ['scapTopR', 'shoulderR'],
    humerusR: ['shoulderR', 'elbowR'],
    radiusR: ['elbowR', 'wristR'],
    metacarpusR: ['wristR', 'mcpR'],
    fpawR: ['mcpR', 'ftoeR'],

    femurL: ['hipL', 'kneeL'],
    tibiaL: ['kneeL', 'hockL'],
    metatarsusL: ['hockL', 'mtpL'],
    hpawL: ['mtpL', 'htoeL'],

    femurR: ['hipR', 'kneeR'],
    tibiaR: ['kneeR', 'hockR'],
    metatarsusR: ['hockR', 'mtpR'],
    hpawR: ['mtpR', 'htoeR'],
  };

  const solver = new FIK.Structure3D();
  const chains = {};

  for (const def of chainDefs) {
    const chain = new Chain3D();
    for (let i = 0; i < def.bones.length; i++) {
      const bName = def.bones[i];
      const [hName, tName] = boneLookup[bName];
      const bone = buildBone(J, bName, hName, tName);
      applyElephantConstraint(bone, bName);
      chain.addBone(bone);
    }
    chain.setSolveDistanceThreshold(tolM);
    chain.setMaxIterationAttempts(maxIters);
    chains[def.name] = chain;
  }

  // Set target ground footholds
  const targets = options.targets || {};
  let maxResidualMm = 0;
  const solved = {};
  const jointPositions = {};

  for (const def of chainDefs) {
    const chain = chains[def.name];
    const defaultToe = J[def.toe];
    const target = targets[def.name] || [defaultToe[0], 0, defaultToe[2]];
    const tV = new V3(target[0], target[1], target[2]);

    chain.solveForTarget(tV);

    const tip = chain.bones[chain.bones.length - 1].end;
    const errM = Math.hypot(tip.x - target[0], tip.y - target[1], tip.z - target[2]);
    const errMm = errM * 1000.0;
    maxResidualMm = Math.max(maxResidualMm, errMm);

    solved[def.name] = {
      target,
      tip: [tip.x, tip.y, tip.z],
      residualMm: errMm,
      passed: errMm <= tolMm,
    };

    // Store live solved joint coordinates for live torque cross-products
    jointPositions[def.name] = {};
    for (const b of chain.bones) {
      jointPositions[def.name][b.name] = {
        start: [b.start.x, b.start.y, b.start.z],
        end: [b.end.x, b.end.y, b.end.z],
      };
    }
  }

  return {
    success: maxResidualMm <= tolMm,
    maxResidualMm,
    solved,
    jointPositions,
  };
}
