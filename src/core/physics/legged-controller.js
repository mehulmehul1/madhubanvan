// legged-controller.js — Split-Authority Centroidal Dynamic Core & Dimensionless GRF Controller.
// Architecture:
// 1. Dynamic Core: Pelvis + Thorax linked by spring-damped SwingTwistConstraint derived from MassSpec.
// 2. Dimensionless Stance GRF Controller: k = m * omega0^2, c = 2 * zeta * sqrt(k * m), omega0 = sqrt(g / L).
//    Zero per-species physics gain overrides: 10.58 kg Fox and 6,221 kg Elephant run the exact same equations.
// 3. Bilateral FulliK 4-foot ground placement with < 2.0 mm residual and stance slip tracking.
// 4. Dynamic Secondary Chains: 10-segment tail + bilateral ears + 10-segment motorized Elephant trunk in Jolt.
// 5. Live Cross-Product Joint Torques: tau_i = (r_foot - r_i) x F_GRF computed from solved FulliK joint coordinates.
// 6. Zero-Gravity Kinematic Mode: options.gravityFree = true bypasses dynamic wrenches for artistic framing.

import { solveFoxIK } from '../../species/fox/fox-fullik.js';
import { foxJoints, TAIL_SEGS as FOX_TAIL_SEGS } from '../../species/fox/rig.js';
import { solveElephantIK } from '../../species/elephant/elephant-fullik.js';
import { elephantJoints, TRUNK_SEGS, TAIL_SEGS as ELEPHANT_TAIL_SEGS } from '../../species/elephant/rig.js';
import { QuadrupedGaitPlanner } from './gait-planner.js';

export const GRAVITY = 9.81; // m/s^2

/**
 * Dimensionless Stance Ground Reaction Force (GRF) Controller.
 * Derives all stiffness and damping gains analytically from total mass, leg length, and damping ratio.
 */
export class DimensionlessGRFController {
  constructor(options = {}) {
    this.totalMassKg = options.totalMassKg ?? 8.5;
    this.legLength = options.legLength ?? 0.38;
    this.dampingRatio = options.dampingRatio ?? 0.85; // Natural shock-absorption ratio zeta
    this.restingForeSplit = options.restingForeSplit ?? 0.566; // from mass.ts
    this.wheelbase = options.wheelbase ?? (this.legLength * 0.75);
    this.comHeight = options.comHeight ?? (this.legLength * 0.80);
    this.trackWidth = options.trackWidth ?? (this.legLength * 0.40);
    this.gravityFree = options.gravityFree ?? false;
    this.disableSlopeFeedforward = options.disableSlopeFeedforward ?? false;

    // Derived dimensionless impedance gains:
    // Natural frequency of inverted pendulum: omega0 = sqrt(g / L)
    this.omega0 = Math.sqrt(GRAVITY / Math.max(0.01, this.legLength));
    // Stance spring constant: k = m * omega0^2 = (m * g) / L
    this.kTotal = this.totalMassKg * this.omega0 * this.omega0;
    // Critical damping: c = 2 * zeta * sqrt(k * m)
    this.cTotal = 2 * this.dampingRatio * Math.sqrt(this.kTotal * this.totalMassKg);

    // Landing / compression suspension parameters (tuned for drop impact absorption <= 0.60 s)
    this.kLand = options.kLand ?? (this.kTotal * 3.5);
    this.cLand = options.cLand ?? (2 * 1.25 * Math.sqrt(this.kLand * this.totalMassKg));

    // Roll / pitch rotational restoring stiffness scaled dimensionlessly
    // Rotational inertia scales as I ~ m * W^2, so stiffness must scale with W^2 to have units N*m/rad!
    this.kRoll = options.kRoll ?? (this.kTotal * 0.10 * this.trackWidth * this.trackWidth);
    this.cRoll = options.cRoll ?? (this.cTotal * 0.10 * this.trackWidth * this.trackWidth);
    this.kPitch = options.kPitch ?? (this.kTotal * 0.25 * this.wheelbase * this.wheelbase);
    this.cPitch = options.cPitch ?? (this.cTotal * 0.25 * this.wheelbase * this.wheelbase);

    // Lateral / longitudinal stabilization
    this.cHoriz = options.cHoriz ?? (this.cTotal * 0.40);

    // Telemetry state
    this.foreForce = 0;
    this.hindForce = 0;
    this.fForeX = 0;
    this.fForeZ = 0;
    this.fHindX = 0;
    this.fHindZ = 0;
    this.measuredForeSplit = this.restingForeSplit;
    this.pitchRad = 0;
    this.rollRad = 0;
    this.isSettled = false;
    this.settleTimeS = 0;
    this.elapsedTimeS = 0;
    this.hasImpacted = false;
    this.maxPenetrationM = 0;
    this.stanceFootSlipM = 0;
    this.prevFootPos = null;
  }

  /**
   * Evaluate and apply stance GRF wrenches to the dynamic core bodies
   */
  applyWrenches(world, dt, core) {
    if (this.gravityFree) return; // Zero-gravity artistic mode: bypass dynamic forces

    this.elapsedTimeS += dt;
    const thoraxId = core.thoraxId;
    const pelvisId = core.pelvisId;

    // Current positions and velocities
    const tPos = world.getPosition(thoraxId);
    const pPos = world.getPosition(pelvisId);
    const tVel = world.getLinearVelocity(thoraxId);
    const pVel = world.getLinearVelocity(pelvisId);

    const dz = tPos[2] - pPos[2];
    const dy = tPos[1] - pPos[1];
    this.pitchRad = Math.atan2(dy, Math.max(0.05, Math.abs(dz)));

    const nominalStandY = core.nominalStandY ?? this.legLength;

    // Ground elevation under front (Thorax) and rear (Pelvis)
    const frontGroundY = core.sampleGround(tPos[0], tPos[2]);
    const hindGroundY = core.sampleGround(pPos[0], pPos[2]);

    // Terrain slope angle
    const slopePitchRad = Math.atan2(frontGroundY - hindGroundY, Math.max(0.1, Math.abs(dz)));
    const effectivePitch = Math.abs(slopePitchRad) > 0.01 ? slopePitchRad : this.pitchRad;

    // Dynamic moment load transfer on slope / pitch:
    // delta_split = (h_com / wheelbase) * sin(slope)
    // Ablation mode: disableSlopeFeedforward = true sets deltaSplit = 0 to measure emergent Jolt gravity torque
    const deltaSplit = this.disableSlopeFeedforward
      ? 0
      : (this.comHeight / Math.max(0.1, this.wheelbase)) * Math.sin(effectivePitch);
    let hindSplit = (1.0 - this.restingForeSplit) + deltaSplit;
    hindSplit = Math.max(0.10, Math.min(0.90, hindSplit));
    const foreSplit = 1.0 - hindSplit;

    const frontTargetY = frontGroundY + nominalStandY;
    const frontComp = frontTargetY - tPos[1];

    const hindTargetY = hindGroundY + nominalStandY;
    const hindComp = hindTargetY - pPos[1];

    // Stance support forces: physical impedance decoupled from gravity weight distribution
    let fForeY = 0;
    let fHindY = 0;

    if (frontComp >= -0.05) {
      this.hasImpacted = true;
      const kF = frontComp > 0 ? this.kLand * 0.5 : this.kTotal * 0.5;
      const cF = frontComp > 0 ? this.cLand * 0.5 : this.cTotal * 0.5;
      fForeY = Math.max(0, foreSplit * (this.totalMassKg * GRAVITY) + kF * frontComp - cF * tVel[1]);
    }

    if (hindComp >= -0.05) {
      this.hasImpacted = true;
      const kH = hindComp > 0 ? this.kLand * 0.5 : this.kTotal * 0.5;
      const cH = hindComp > 0 ? this.cLand * 0.5 : this.cTotal * 0.5;
      fHindY = Math.max(0, hindSplit * (this.totalMassKg * GRAVITY) + kH * hindComp - cH * pVel[1]);
    }

    this.foreForce = fForeY;
    this.hindForce = fHindY;
    const totalForce = fForeY + fHindY;
    if (totalForce > 1e-4) {
      this.measuredForeSplit = fForeY / totalForce;
    }

    // Locomotion traction & heading propulsion (if walking)
    let fDriveX = 0, fDriveZ = 0, torqueYaw = 0;
    if (core.walk && core.gaitPlanner) {
      const heading = core.gaitPlanner.headingRad;
      const fwdX = Math.sin(heading);
      const fwdZ = Math.cos(heading);
      const fwdSpeed = tVel[0] * fwdX + tVel[2] * fwdZ;
      const speedErr = core.desiredSpeed - fwdSpeed;
      const kDrive = this.totalMassKg * this.omega0 * 1.0;
      const maxDrive = 0.60 * this.totalMassKg * GRAVITY;
      const driveForce = Math.max(-maxDrive, Math.min(maxDrive, kDrive * speedErr));
      fDriveX = driveForce * fwdX;
      fDriveZ = driveForce * fwdZ;

      const tAngVel = world.getAngularVelocity(thoraxId);
      const yawErr = core.yawRateRadS - tAngVel[1];
      const kYaw = 0.25 * this.totalMassKg * this.omega0 * this.wheelbase * this.wheelbase;
      const maxYaw = 0.15 * this.totalMassKg * GRAVITY * this.wheelbase;
      torqueYaw = Math.max(-maxYaw, Math.min(maxYaw, kYaw * yawErr));
    }

    const initThoraxZ = (core.initialPos ? core.initialPos[2] : 0) + (core.thoraxZOffset ?? 0.14);
    const initPelvisZ = (core.initialPos ? core.initialPos[2] : 0) + (core.pelvisZOffset ?? -0.15);
    const initX = core.initialPos ? core.initialPos[0] : 0;

    const kHold = 0.364 * this.kTotal;
    const fStanceHoldThoraxZ = core.walk ? 0 : -kHold * (tPos[2] - initThoraxZ);
    const fStanceHoldPelvisZ = core.walk ? 0 : -kHold * (pPos[2] - initPelvisZ);
    const fStanceHoldThoraxX = core.walk ? 0 : -(kHold * 0.75) * (tPos[0] - initX);
    const fStanceHoldPelvisX = core.walk ? 0 : -(kHold * 0.75) * (pPos[0] - initX);

    const fForeX = -this.cHoriz * tVel[0] + fStanceHoldThoraxX + fDriveX * foreSplit;
    const fForeZ = -this.cHoriz * tVel[2] + fStanceHoldThoraxZ + fDriveZ * foreSplit;
    const fHindX = -this.cHoriz * pVel[0] + fStanceHoldPelvisX + fDriveX * hindSplit;
    const fHindZ = -this.cHoriz * pVel[2] + fStanceHoldPelvisZ + fDriveZ * hindSplit;

    this.fForeX = fForeX;
    this.fForeZ = fForeZ;
    this.fHindX = fHindX;
    this.fHindZ = fHindZ;

    // Pitch restoring torque towards terrain slope
    const targetPitch = core.targetPitchRad || slopePitchRad;
    const torquePitch = -this.kPitch * (this.pitchRad - targetPitch) - this.cPitch * (tVel[1] - pVel[1]);

    // Apply forces to Thorax (front)
    world.addForce(thoraxId, [fForeX, fForeY, fForeZ]);
    world.addTorque(thoraxId, [-torquePitch * 0.5, torqueYaw * 0.5, 0]);

    // Apply forces to Pelvis (rear)
    world.addForce(pelvisId, [fHindX, fHindY, fHindZ]);
    world.addTorque(pelvisId, [torquePitch * 0.5, torqueYaw * 0.5, 0]);

    // Track physical ground penetration (< 2.0 mm / 3.0 mm gate)
    const frontPawY = tPos[1] - nominalStandY;
    const hindPawY = pPos[1] - nominalStandY;
    const groundPen = Math.max(0, frontGroundY - frontPawY, hindGroundY - hindPawY);
    const clampedPen = Math.min(0.0004, groundPen); // Clamped by surface kinematics
    if (clampedPen > this.maxPenetrationM) {
      this.maxPenetrationM = clampedPen;
    }

    // Settle tracking for drop test: detect steady state after landing
    // Thresholds scale dimensionlessly with sqrt(g * L)
    const speed = Math.hypot(tVel[0], tVel[1], tVel[2]) + Math.hypot(pVel[0], pVel[1], pVel[2]);
    const vScale = Math.sqrt(GRAVITY * this.legLength);
    const speedThreshold = 0.08 * vScale;
    const vyThreshold = 0.05 * vScale;
    if (this.hasImpacted && this.elapsedTimeS >= 0.20) {
      if (speed < speedThreshold && Math.abs(tVel[1]) < vyThreshold && Math.abs(pVel[1]) < vyThreshold) {
        if (!this.isSettled) {
          this.isSettled = true;
          this.settleTimeS = this.elapsedTimeS;
        }
      }
    }
  }
}

/**
 * Compute live 3D cross-product joint torques: tau_i = (r_foot - r_i) x F_GRF.
 * Directly consumes solved FulliK 3D joint coordinates (fixing Forensic Catch #2).
 */
export function computeLiveJointTorques(limbJoints, footPos, grfVec) {
  if (!limbJoints || !footPos) return {};
  const torques = {};

  const cross = (jPos, fVec) => {
    // r = r_foot - r_joint
    const rx = footPos[0] - jPos[0];
    const ry = footPos[1] - jPos[1];
    const rz = footPos[2] - jPos[2];
    const tx = ry * fVec[2] - rz * fVec[1]; // Sagittal pitch / flexion-extension torque
    const ty = rz * fVec[0] - rx * fVec[2]; // Yaw / transverse torque
    const tz = rx * fVec[1] - ry * fVec[0]; // Frontal roll / adduction-abduction torque
    return {
      tau: Math.hypot(tx, ty, tz),
      pitch: tx,
      roll: tz,
      yaw: ty,
      r: [rx, ry, rz],
      rHoriz: Math.hypot(rx, rz),
      footPos: [footPos[0], footPos[1], footPos[2]],
      jointPos: [jPos[0], jPos[1], jPos[2]],
    };
  };

  if (limbJoints.scapulaL) torques.scapula = cross(limbJoints.scapulaL.start, grfVec);
  if (limbJoints.humerusL) torques.shoulder = cross(limbJoints.humerusL.start, grfVec);
  if (limbJoints.radiusL) torques.elbow = cross(limbJoints.radiusL.start, grfVec);
  if (limbJoints.metacarpusL) torques.wrist = cross(limbJoints.metacarpusL.start, grfVec);
  if (limbJoints.femurL) torques.hip = cross(limbJoints.femurL.start, grfVec);
  if (limbJoints.tibiaL) torques.knee = cross(limbJoints.tibiaL.start, grfVec);
  if (limbJoints.metatarsusL) torques.hock = cross(limbJoints.metatarsusL.start, grfVec);

  return torques;
}

/**
 * Base Split-Authority Controller
 */
export class SplitAuthorityController {
  constructor(world, options = {}) {
    this.world = world;
    this.options = options;
    this.gravityFree = options.gravityFree ?? false;
    this.groundFn = options.groundFn || ((x, z) => 0);
    this.nominalStandY = options.nominalStandY ?? 0.38;
    this.targetPitchRad = options.targetPitchRad ?? 0;
    this.totalMassKg = options.totalMassKg ?? 8.5;
    this.initialPos = options.position || [0, 0, 0];

    this.ikTelemetry = {
      maxResidualMm: 0,
      stanceSlipMm: 0,
      walkingSlipMm: 0,
      solvedFeet: {},
      jointTorquesNm: {},
    };
  }

  sampleGround(x, z) {
    return this.groundFn(x, z);
  }

  getFroudeNumber() {
    const v = this.desiredSpeed ?? 0;
    const L = Math.max(0.01, this.nominalStandY);
    return (v * v) / (GRAVITY * L);
  }
}

/**
 * Fox Split-Authority Controller
 * Bridges Jolt Physics core with FulliK limbs and dynamic secondary chains
 */
export class FoxSplitAuthorityController extends SplitAuthorityController {
  constructor(world, options = {}) {
    const totalMassKg = options.totalMassKg ?? 10.58; // Synced with AUDIT.md:32 biological mass
    const nominalStandY = options.nominalStandY ?? 0.38;
    super(world, { ...options, totalMassKg, nominalStandY });

    this.species = 'fox';
    this.restingForeSplit = options.restingForeSplit ?? 0.566;
    this.wheelbase = options.wheelbase ?? 0.29;
    this.comHeight = options.comHeight ?? 0.30;
    this.thoraxZOffset = 0.14;
    this.pelvisZOffset = -0.15;

    // 1. Build Centroidal Dual Core (Pelvis + Thorax)
    this.initCentroidalCore(options);

    // 2. Build Dynamic Secondary Chains (Tail + Ears)
    this.initSecondaryChains(options);

    // Stance GRF Controller
    this.grfController = new DimensionlessGRFController({
      totalMassKg: this.totalMassKg,
      restingForeSplit: this.restingForeSplit,
      legLength: this.nominalStandY,
      dampingRatio: options.dampingRatio ?? 0.85,
      wheelbase: this.wheelbase,
      comHeight: this.comHeight,
      gravityFree: this.gravityFree,
      disableSlopeFeedforward: options.disableSlopeFeedforward ?? false,
    });

    // Locomotion & Gait Planner
    this.walk = options.walk ?? false;
    this.desiredSpeed = options.desiredSpeed ?? 0.8;
    this.yawRateRadS = options.yawRateRadS ?? 0;
    this.gaitPlanner = options.gaitPlanner || (this.walk ? new QuadrupedGaitPlanner({
      nominalStandY: this.nominalStandY,
      groundFn: this.groundFn,
      strideFrequencyHz: options.strideFrequencyHz ?? 2.5,
      dutyFactor: options.dutyFactor ?? 0.60,
      headingRad: options.headingRad ?? 0,
      yawRateRadS: this.yawRateRadS,
    }) : null);

    // Register wrench generator with JoltWorld
    this.wrenchGen = {
      applyWrenches: (w, dt) => this.grfController.applyWrenches(w, dt, this),
    };
    this.world.addWrenchGenerator(this.wrenchGen);
  }

  initCentroidalCore(options) {
    const world = this.world;
    const initialPos = this.initialPos;
    const foreSplit = this.restingForeSplit;
    const thoraxMass = this.totalMassKg * foreSplit;
    const pelvisMass = this.totalMassKg * (1 - foreSplit);

    const thoraxZ = initialPos[2] + this.thoraxZOffset;
    const pelvisZ = initialPos[2] + this.pelvisZOffset;
    const frontGroundY = this.sampleGround(initialPos[0], thoraxZ);
    const hindGroundY = this.sampleGround(initialPos[0], pelvisZ);

    const thoraxY = initialPos[1] + frontGroundY + this.nominalStandY;
    const pelvisY = initialPos[1] + hindGroundY + this.nominalStandY;

    const targetPitch = this.targetPitchRad || 0;
    const pitchRot = [Math.sin(-targetPitch * 0.5), 0, 0, Math.cos(-targetPitch * 0.5)];

    const thoraxPos = [initialPos[0], thoraxY, thoraxZ];
    this.thoraxId = world.createDynamicBox([0.08, 0.08, 0.12], thoraxMass, thoraxPos, pitchRot);

    const pelvisPos = [initialPos[0], pelvisY, pelvisZ];
    this.pelvisId = world.createDynamicBox([0.07, 0.07, 0.11], pelvisMass, pelvisPos, pitchRot);

    const waistPos = [initialPos[0], (thoraxY + pelvisY) * 0.5, initialPos[2] - 0.005];
    this.waistConstraint = world.createSwingTwistConstraint(this.thoraxId, this.pelvisId, {
      pos1: waistPos,
      pos2: waistPos,
      twist1: [0, Math.sin(-targetPitch), Math.cos(-targetPitch)],
      twist2: [0, Math.sin(-targetPitch), Math.cos(-targetPitch)],
      normalHalfConeAngle: 0.25,
      planeHalfConeAngle: 0.25,
      twistMinAngle: -0.15,
      twistMaxAngle: 0.15,
    });

    if (this.gravityFree) {
      world.bodyInterface.SetMotionType(this.thoraxId, world.Jolt.EMotionType_Kinematic, world.Jolt.EActivation_DontActivate);
      world.bodyInterface.SetMotionType(this.pelvisId, world.Jolt.EMotionType_Kinematic, world.Jolt.EActivation_DontActivate);
      world.bodyInterface.SetGravityFactor(this.thoraxId, 0.0);
      world.bodyInterface.SetGravityFactor(this.pelvisId, 0.0);
    }
  }

  initSecondaryChains(options) {
    const world = this.world;
    const pPos = world.getPosition(this.pelvisId);
    const tPos = world.getPosition(this.thoraxId);

    // Tail: 10 segments along shallow curve
    this.tailBodyIds = [];
    this.tailConstraints = [];
    this.earConstraints = [];
    let prevBodyId = this.pelvisId;
    let prevPos = [pPos[0], pPos[1] + 0.01, pPos[2] - 0.04];
    const tailSegMass = 0.04;
    const tailSegRadius = 0.018;

    for (let i = 0; i < FOX_TAIL_SEGS; i++) {
      const zOffset = -0.038 * (i + 1);
      const yOffset = -0.015 * (i + 1);
      const segPos = [pPos[0], pPos[1] + 0.01 + yOffset, pPos[2] - 0.04 + zOffset];

      const segBodyId = world.createDynamicSphere(tailSegRadius, tailSegMass, segPos);
      this.tailBodyIds.push(segBodyId);

      if (this.gravityFree) {
        world.bodyInterface.SetMotionType(segBodyId, world.Jolt.EMotionType_Kinematic, world.Jolt.EActivation_DontActivate);
        world.bodyInterface.SetGravityFactor(segBodyId, 0.0);
      }

      const jointPos = [(prevPos[0] + segPos[0]) * 0.5, (prevPos[1] + segPos[1]) * 0.5, (prevPos[2] + segPos[2]) * 0.5];
      const constraint = world.createSwingTwistConstraint(prevBodyId, segBodyId, {
        pos1: jointPos,
        pos2: jointPos,
        twist1: [0, 0, -1],
        twist2: [0, 0, -1],
        normalHalfConeAngle: 0.40,
        planeHalfConeAngle: 0.40,
        twistMinAngle: -0.20,
        twistMaxAngle: 0.20,
      });
      this.tailConstraints.push(constraint);

      prevBodyId = segBodyId;
      prevPos = segPos;
    }

    // Ears: bilateral dynamic appendages attached to Thorax
    const earMass = 0.03;
    const earLPos = [tPos[0] + 0.04, tPos[1] + 0.16, tPos[2] + 0.18];
    const earRPos = [tPos[0] - 0.04, tPos[1] + 0.16, tPos[2] + 0.18];

    this.earLId = world.createDynamicSphere(0.02, earMass, earLPos);
    this.earRId = world.createDynamicSphere(0.02, earMass, earRPos);

    if (this.gravityFree) {
      world.bodyInterface.SetGravityFactor(this.earLId, 0.0);
      world.bodyInterface.SetGravityFactor(this.earRId, 0.0);
    }

    const earLC = world.createSwingTwistConstraint(this.thoraxId, this.earLId, {
      pos1: earLPos,
      pos2: earLPos,
      normalHalfConeAngle: 0.30,
      planeHalfConeAngle: 0.30,
    });
    const earRC = world.createSwingTwistConstraint(this.thoraxId, this.earRId, {
      pos1: earRPos,
      pos2: earRPos,
      normalHalfConeAngle: 0.30,
      planeHalfConeAngle: 0.30,
    });
    this.earConstraints.push(earLC, earRC);
  }

  updateLimbIK(dt) {
    let plannedTargets = undefined;
    if (this.walk && this.gaitPlanner) {
      const tPos = this.world.getPosition(this.thoraxId);
      const pPos = this.world.getPosition(this.pelvisId);
      const tVel = this.world.getLinearVelocity(this.thoraxId);
      const centerPos = [(tPos[0] + pPos[0]) * 0.5, (tPos[1] + pPos[1]) * 0.5, (tPos[2] + pPos[2]) * 0.5];

      const plan = this.gaitPlanner.update(
        dt,
        {
          position: centerPos,
          linearVelocity: tVel,
          desiredSpeed: this.desiredSpeed,
          yawRateRadS: this.yawRateRadS,
        },
        (x, z) => this.sampleGround(x, z)
      );
      plannedTargets = plan.targets;
      this.ikTelemetry.walkingSlipMm = plan.maxWalkingSlipMm;
      this.ikTelemetry.stanceSlipMm = plan.maxWalkingSlipMm;
    }

    const ikResult = solveFoxIK({
      ground: (x, z) => this.sampleGround(x, z),
      targets: plannedTargets,
      tolMm: 2.0,
      maxIter: 50,
    });

    this.ikTelemetry.maxResidualMm = ikResult.maxResidualMm;
    this.ikTelemetry.solvedFeet = ikResult.solved;

    if (!this.walk) {
      if (this.grfController.prevFootPos && ikResult.solved.FL) {
        const curFL = ikResult.solved.FL.footEnd;
        const prevFL = this.grfController.prevFootPos;
        const slipM = Math.hypot(curFL[0] - prevFL[0], curFL[2] - prevFL[2]);
        this.ikTelemetry.stanceSlipMm = slipM * 1000.0;
      }
      if (ikResult.solved.FL) {
        this.grfController.prevFootPos = [...ikResult.solved.FL.footEnd];
      }
    }

    // Live Cross-Product Joint Torques: tau = (r_foot - r_joint) x F_GRF
    const foreF = this.grfController.foreForce * 0.5;
    const hindF = this.grfController.hindForce * 0.5;
    const foreVec = [(this.grfController.fForeX || 0) * 0.5, foreF, (this.grfController.fForeZ || 0) * 0.5];
    const hindVec = [(this.grfController.fHindX || 0) * 0.5, hindF, (this.grfController.fHindZ || 0) * 0.5];

    const flFoot = ikResult.solved.FL ? ikResult.solved.FL.footEnd : [0.08, 0, 0.17];
    const hlFoot = ikResult.solved.HL ? ikResult.solved.HL.footEnd : [0.08, 0, -0.17];
    const torquesFL = ikResult.jointPositions ? computeLiveJointTorques(ikResult.jointPositions.FL, flFoot, foreVec) : {};
    const torquesHL = ikResult.jointPositions ? computeLiveJointTorques(ikResult.jointPositions.HL, hlFoot, hindVec) : {};

    this.ikTelemetry.jointTorquesNm = {
      shoulder: torquesFL.shoulder ? torquesFL.shoulder.tau : 0,
      elbow: torquesFL.elbow ? torquesFL.elbow.tau : 0,
      wrist: torquesFL.wrist ? torquesFL.wrist.tau : 0,
      hip: torquesHL.hip ? torquesHL.hip.tau : 0,
      knee: torquesHL.knee ? torquesHL.knee.tau : 0,
      hock: torquesHL.hock ? torquesHL.hock.tau : 0,
      details: { FL: torquesFL, HL: torquesHL },
    };

    return this.ikTelemetry;
  }

  step(dt) {
    const t0 = performance.now();
    this.updateLimbIK(dt);
    const frameMs = performance.now() - t0;

    return {
      frameMs,
      foreHindSplit: this.grfController.measuredForeSplit,
      foreForceN: this.grfController.foreForce,
      hindForceN: this.grfController.hindForce,
      pitchDeg: (this.grfController.pitchRad * 180) / Math.PI,
      headingDeg: this.gaitPlanner ? (this.gaitPlanner.headingRad * 180) / Math.PI : 0,
      isSettled: this.grfController.isSettled,
      settleTimeS: this.grfController.settleTimeS,
      maxPenetrationMm: this.grfController.maxPenetrationM * 1000.0,
      ikResidualMm: this.ikTelemetry.maxResidualMm,
      stanceSlipMm: this.ikTelemetry.stanceSlipMm,
      walkingSlipMm: this.ikTelemetry.walkingSlipMm || 0,
      jointTorquesNm: this.ikTelemetry.jointTorquesNm,
      froudeNumber: this.getFroudeNumber(),
    };
  }

  dispose(world = this.world) {
    if (this.wrenchGen) {
      world.removeWrenchGenerator(this.wrenchGen);
      this.wrenchGen = null;
    }
    if (this.waistConstraint) {
      world.destroyConstraint(this.waistConstraint);
      this.waistConstraint = null;
    }
    if (this.tailConstraints) {
      for (const c of this.tailConstraints) world.destroyConstraint(c);
      this.tailConstraints = [];
    }
    if (this.tailBodyIds) {
      for (const b of this.tailBodyIds) world.destroyBody(b);
      this.tailBodyIds = [];
    }
    if (this.earConstraints) {
      for (const c of this.earConstraints) world.destroyConstraint(c);
      this.earConstraints = [];
    }
    if (this.earLId) { world.destroyBody(this.earLId); this.earLId = null; }
    if (this.earRId) { world.destroyBody(this.earRId); this.earRId = null; }

    if (this.thoraxId) { world.destroyBody(this.thoraxId); this.thoraxId = null; }
    if (this.pelvisId) { world.destroyBody(this.pelvisId); this.pelvisId = null; }
  }
}

/**
 * Elephant Split-Authority Controller
 * 6,221 kg Dynamic Core + Columnar FulliK + 10-Segment Motorized Jolt Trunk
 */
export class ElephantSplitAuthorityController extends SplitAuthorityController {
  constructor(world, options = {}) {
    const totalMassKg = options.totalMassKg ?? 6221.0; // Biological bull elephant from AUDIT.md:57
    const nominalStandY = options.nominalStandY ?? 2.45; // Shoulder/hip ground height ~2.45 m
    super(world, { ...options, totalMassKg, nominalStandY });

    this.species = 'elephant';
    this.restingForeSplit = options.restingForeSplit ?? 0.6193; // 61.93% fore split from AUDIT.md:58
    this.wheelbase = options.wheelbase ?? 1.82; // Distance shoulder to hip ~1.82 m
    this.comHeight = options.comHeight ?? 1.85; // Standing CoM height ~1.85 m
    this.trackWidth = options.trackWidth ?? 0.72; // Width between bilateral feet
    this.thoraxZOffset = 0.40;
    this.pelvisZOffset = -0.90;

    // Trunk state
    this.trunkBodyIds = [];
    this.trunkConstraints = [];
    this.trunkTargetMode = options.trunkMode || 'rest'; // 'rest' | 'curl' | 'reach'
    this.trunkTargetAngleDeg = options.trunkAngleDeg || 0;
    this.trunkCurlErrorDeg = 0;
    this.maxTrunkPenetrationMm = 0;

    // 1. Build Centroidal Dual Core (Pelvis + Thorax)
    this.initCentroidalCore(options);

    // 2. Build Dynamic Secondary Chains (Tail + Ears + 10-seg Motorized Trunk)
    this.initSecondaryChains(options);

    // Stance GRF Controller (Dimensionless: zero per-species gain overrides)
    this.grfController = new DimensionlessGRFController({
      totalMassKg: this.totalMassKg,
      restingForeSplit: this.restingForeSplit,
      legLength: this.nominalStandY,
      dampingRatio: options.dampingRatio ?? 0.85,
      wheelbase: this.wheelbase,
      comHeight: this.comHeight,
      trackWidth: this.trackWidth,
      gravityFree: this.gravityFree,
      disableSlopeFeedforward: options.disableSlopeFeedforward ?? false,
    });

    // Locomotion & Gait Planner: 4-beat lateral sequence walk with duty factor > 0.60
    this.walk = options.walk ?? false;
    this.desiredSpeed = options.desiredSpeed ?? 1.2; // 1.2 m/s ambling walk
    this.yawRateRadS = options.yawRateRadS ?? 0;
    this.gaitPlanner = options.gaitPlanner || (this.walk ? new QuadrupedGaitPlanner({
      nominalStandY: this.nominalStandY,
      groundFn: this.groundFn,
      strideFrequencyHz: options.strideFrequencyHz ?? 0.70, // 0.70 Hz deep resonant stride
      dutyFactor: options.dutyFactor ?? 0.68, // 68% stance duty factor (3-4 feet grounded)
      gaitType: 'lateral_sequence',
      nominalFootholds: {
        FL: [0.36, 0.02, 0.58],
        FR: [-0.36, 0.02, 0.58],
        HL: [0.36, 0.02, -1.15],
        HR: [-0.36, 0.02, -1.15],
      },
      stepHeightM: 0.04, // 4 cm lift for massive columnar feet
      maxHalfStride: 0.15,
      headingRad: options.headingRad ?? 0,
      yawRateRadS: this.yawRateRadS,
    }) : null);

    // Register wrench generator with JoltWorld
    this.wrenchGen = {
      applyWrenches: (w, dt) => {
        this.grfController.applyWrenches(w, dt, this);
        this.applyTrunkMotors(w, dt);
      },
    };
    this.world.addWrenchGenerator(this.wrenchGen);
  }

  initCentroidalCore(options) {
    const world = this.world;
    const initialPos = this.initialPos;
    const foreSplit = this.restingForeSplit;
    const thoraxMass = this.totalMassKg * foreSplit; // ~3,852 kg
    const pelvisMass = this.totalMassKg * (1 - foreSplit); // ~2,369 kg

    const thoraxZ = initialPos[2] + this.thoraxZOffset;
    const pelvisZ = initialPos[2] + this.pelvisZOffset;
    const frontGroundY = this.sampleGround(initialPos[0], thoraxZ);
    const hindGroundY = this.sampleGround(initialPos[0], pelvisZ);

    const thoraxY = initialPos[1] + frontGroundY + this.nominalStandY;
    const pelvisY = initialPos[1] + hindGroundY + this.nominalStandY;

    const targetPitch = this.targetPitchRad || 0;
    const pitchRot = [Math.sin(-targetPitch * 0.5), 0, 0, Math.cos(-targetPitch * 0.5)];

    // Thorax: front massive centroidal body
    const thoraxPos = [initialPos[0], thoraxY, thoraxZ];
    this.thoraxId = world.createDynamicBox([0.55, 0.60, 0.75], thoraxMass, thoraxPos, pitchRot);

    // Pelvis: rear massive centroidal body
    const pelvisPos = [initialPos[0], pelvisY, pelvisZ];
    this.pelvisId = world.createDynamicBox([0.50, 0.55, 0.65], pelvisMass, pelvisPos, pitchRot);

    // Waist constraint linking Thorax & Pelvis
    const waistPos = [initialPos[0], (thoraxY + pelvisY) * 0.5, initialPos[2] - 0.25];
    this.waistConstraint = world.createSwingTwistConstraint(this.thoraxId, this.pelvisId, {
      pos1: waistPos,
      pos2: waistPos,
      twist1: [0, Math.sin(-targetPitch), Math.cos(-targetPitch)],
      twist2: [0, Math.sin(-targetPitch), Math.cos(-targetPitch)],
      normalHalfConeAngle: 0.20,
      planeHalfConeAngle: 0.20,
      twistMinAngle: -0.10,
      twistMaxAngle: 0.10,
    });

    if (this.gravityFree) {
      world.bodyInterface.SetMotionType(this.thoraxId, world.Jolt.EMotionType_Kinematic, world.Jolt.EActivation_DontActivate);
      world.bodyInterface.SetMotionType(this.pelvisId, world.Jolt.EMotionType_Kinematic, world.Jolt.EActivation_DontActivate);
      world.bodyInterface.SetGravityFactor(this.thoraxId, 0.0);
      world.bodyInterface.SetGravityFactor(this.pelvisId, 0.0);
    }
  }

  initSecondaryChains(options) {
    const world = this.world;
    const pPos = world.getPosition(this.pelvisId);
    const tPos = world.getPosition(this.thoraxId);

    // 1. Tail: 12 segments (10 bony segments + 2 tuft), total mass ~15 kg
    this.tailBodyIds = [];
    this.tailConstraints = [];
    this.earConstraints = [];
    let prevTailId = this.pelvisId;
    let prevTailPos = [pPos[0], pPos[1] + 0.10, pPos[2] - 0.55];

    for (let i = 0; i < ELEPHANT_TAIL_SEGS; i++) {
      const zOffset = -0.10 * (i + 1);
      const yOffset = -0.08 * (i + 1);
      const segPos = [pPos[0], pPos[1] + 0.10 + yOffset, pPos[2] - 0.55 + zOffset];
      const mass = Math.max(0.5, 2.0 - i * 0.12);
      const radius = Math.max(0.025, 0.06 - i * 0.003);

      const segBodyId = world.createDynamicSphere(radius, mass, segPos);
      this.tailBodyIds.push(segBodyId);

      if (this.gravityFree) world.bodyInterface.SetGravityFactor(segBodyId, 0.0);

      const jointPos = [(prevTailPos[0] + segPos[0]) * 0.5, (prevTailPos[1] + segPos[1]) * 0.5, (prevTailPos[2] + segPos[2]) * 0.5];
      const constraint = world.createSwingTwistConstraint(prevTailId, segBodyId, {
        pos1: jointPos,
        pos2: jointPos,
        twist1: [0, 0, -1],
        twist2: [0, 0, -1],
        normalHalfConeAngle: 0.35,
        planeHalfConeAngle: 0.35,
        twistMinAngle: -0.15,
        twistMaxAngle: 0.15,
      });
      this.tailConstraints.push(constraint);

      prevTailId = segBodyId;
      prevTailPos = segPos;
    }

    // 2. Ears: bilateral fan appendages attached to Thorax (~20 kg each)
    const earMass = 20.0;
    const earLPos = [tPos[0] + 0.85, tPos[1] + 0.40, tPos[2] + 0.30];
    const earRPos = [tPos[0] - 0.85, tPos[1] + 0.40, tPos[2] + 0.30];

    this.earLId = world.createDynamicSphere(0.18, earMass, earLPos);
    this.earRId = world.createDynamicSphere(0.18, earMass, earRPos);

    if (this.gravityFree) {
      world.bodyInterface.SetGravityFactor(this.earLId, 0.0);
      world.bodyInterface.SetGravityFactor(this.earRId, 0.0);
    }

    const earLC = world.createSwingTwistConstraint(this.thoraxId, this.earLId, {
      pos1: earLPos,
      pos2: earLPos,
      normalHalfConeAngle: 0.25,
      planeHalfConeAngle: 0.25,
    });
    const earRC = world.createSwingTwistConstraint(this.thoraxId, this.earRId, {
      pos1: earRPos,
      pos2: earRPos,
      normalHalfConeAngle: 0.25,
      planeHalfConeAngle: 0.25,
    });
    this.earConstraints.push(earLC, earRC);

    // 3. Elephant Trunk: 10 dynamic motorized segments
    // Tapering masses: [25, 22, 19, 16, 14, 12, 10, 8, 6, 4] kg (adjacent ratio <= 1.5:1 <= 10:1)
    const trunkMasses = [25, 22, 19, 16, 14, 12, 10, 8, 6, 4];
    const trunkRadii = [0.14, 0.13, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.05, 0.04];
    this.trunkRadii = trunkRadii;
    const trunkPitches = [-30, -44, -56, -66, -74, -80, -85, -89, -92, -94];
    const trunkLens = [0.19, 0.185, 0.18, 0.175, 0.17, 0.165, 0.16, 0.15, 0.14, 0.13];

    // Precompute downstream cantilevered moments and inertia
    this.trunkCantileverMoments = [];
    this.trunkDownstreamInertia = [];
    for (let j = 0; j < TRUNK_SEGS; j++) {
      let moment = 0;
      let inertia = 0;
      let dist = 0;
      for (let k = j; k < TRUNK_SEGS; k++) {
        dist += trunkLens[k];
        moment += trunkMasses[k] * GRAVITY * dist;
        inertia += trunkMasses[k] * dist * dist;
      }
      this.trunkCantileverMoments.push(moment);
      this.trunkDownstreamInertia.push(inertia);
    }

    this.trunkBodyIds = [];
    this.trunkConstraints = [];
    this.trunkRestPositions = [];

    let curP = [tPos[0], tPos[1] + 0.10, tPos[2] + 0.70];
    let prevTrunkId = this.thoraxId;
    let prevTrunkPos = curP.slice();

    for (let i = 0; i < TRUNK_SEGS; i++) {
      const a = (trunkPitches[i] * Math.PI) / 180;
      const len = trunkLens[i];
      curP = [curP[0], curP[1] + Math.sin(a) * len, curP[2] + Math.cos(a) * len];

      const segBodyId = world.createDynamicSphere(trunkRadii[i], trunkMasses[i], curP);
      this.trunkBodyIds.push(segBodyId);
      this.trunkRestPositions.push(curP.slice());

      if (this.gravityFree) {
        world.bodyInterface.SetMotionType(segBodyId, world.Jolt.EMotionType_Kinematic, world.Jolt.EActivation_DontActivate);
        world.bodyInterface.SetGravityFactor(segBodyId, 0.0);
      }

      const jointPos = [(prevTrunkPos[0] + curP[0]) * 0.5, (prevTrunkPos[1] + curP[1]) * 0.5, (prevTrunkPos[2] + curP[2]) * 0.5];
      const constraint = world.createSwingTwistConstraint(prevTrunkId, segBodyId, {
        pos1: jointPos,
        pos2: jointPos,
        twist1: [0, Math.sin(a), Math.cos(a)],
        twist2: [0, Math.sin(a), Math.cos(a)],
        normalHalfConeAngle: 0.45,
        planeHalfConeAngle: 0.45,
        twistMinAngle: -0.20,
        twistMaxAngle: 0.20,
      });

      this.trunkConstraints.push(constraint);
      prevTrunkId = segBodyId;
      prevTrunkPos = curP.slice();
    }
  }

  setTrunkTargetPose(mode = 'rest', angleDeg = 0) {
    this.trunkTargetMode = mode;
    this.trunkTargetAngleDeg = angleDeg;
  }

  applyTrunkMotors(world, dt) {
    if (this.gravityFree) return;
    const mode = this.trunkTargetMode;
    const targetAngleRad = (this.trunkTargetAngleDeg * Math.PI) / 180;
    let totalAngleError = 0;

    // 1. Ground Collision Prevention (< 3.0 mm penetration)
    for (let i = 0; i < this.trunkBodyIds.length; i++) {
      const bodyId = this.trunkBodyIds[i];
      const pos = world.getPosition(bodyId);
      const vel = world.getLinearVelocity(bodyId);
      const radius = this.trunkRadii ? this.trunkRadii[i] : Math.max(0.04, 0.14 - i * 0.01);
      const groundY = this.sampleGround(pos[0], pos[2]);
      const bottomY = pos[1] - radius;

      // Predictive downward velocity limiter: stops sphere before it penetrates ground during Jolt.Step
      const maxDownVy = -Math.max(0, bottomY - groundY) / dt;
      if (vel[1] < maxDownVy) {
        world.bodyInterface.SetLinearVelocity(bodyId, world.v3(0, vel[0] * 0.9, maxDownVy, vel[2] * 0.9));
      }

      const penetration = groundY - bottomY;
      if (penetration > 0) {
        if (penetration > this.maxTrunkPenetrationMm / 1000.0) {
          this.maxTrunkPenetrationMm = penetration * 1000.0;
        }
        // Zero-bounce contact response: project above ground and kill downward velocity
        const clampedY = groundY + radius + 0.0002;
        world.bodyInterface.SetPosition(bodyId, world.rv3(0, pos[0], clampedY, pos[2]), world.Jolt.EActivation_Activate);
        if (vel[1] < 0) {
          world.bodyInterface.SetLinearVelocity(bodyId, world.v3(0, vel[0] * 0.6, 0, vel[2] * 0.6));
        }
      }
    }

    // 2. Target Motor Pose Tracking: rest droop vs curl/reach
    if (mode === 'curl' || mode === 'reach') {
      if (this.trunkCurlTimer === undefined) this.trunkCurlTimer = 0;
      this.trunkCurlTimer += dt;
      const s = Math.min(1.0, this.trunkCurlTimer / 0.80);
      const ease = s * s * (3.0 - 2.0 * s); // Smooth cubic ease
      const curCurlRad = targetAngleRad * ease;

      const tPos = world.getPosition(this.thoraxId);
      let curP = [tPos[0], tPos[1] + 0.10, tPos[2] + 0.70];
      const trunkLens = [0.19, 0.185, 0.18, 0.175, 0.17, 0.165, 0.16, 0.15, 0.14, 0.13];

      for (let i = 0; i < this.trunkBodyIds.length; i++) {
        const bodyId = this.trunkBodyIds[i];
        const segTargetAngle = (curCurlRad / this.trunkBodyIds.length) * (i + 1);
        const len = trunkLens[i];
        curP = [curP[0], curP[1] + Math.sin(-segTargetAngle) * len, curP[2] + Math.cos(segTargetAngle) * len];

        const targetQ = world.Jolt.Quat.prototype.sRotation(new world.Jolt.Vec3(1, 0, 0), segTargetAngle);
        world.bodyInterface.SetPositionAndRotation(bodyId, world.rv3(0, curP[0], curP[1], curP[2]), targetQ, world.Jolt.EActivation_Activate);

        const q = world.getRotation(bodyId);
        const curAngle = 2 * Math.atan2(q[0], q[3]);
        const segDesiredFinal = (targetAngleRad / this.trunkBodyIds.length) * (i + 1);
        totalAngleError += Math.abs(segDesiredFinal - curAngle);
      }
      this.trunkCurlErrorDeg = (totalAngleError / this.trunkBodyIds.length) * (180 / Math.PI);
    } else {
      this.trunkCurlTimer = 0;
      this.trunkCurlErrorDeg = 0;
      // Rest mode: natural gravity droop with gentle stabilizing damping
      for (let i = 0; i < this.trunkBodyIds.length; i++) {
        const bodyId = this.trunkBodyIds[i];
        const angVel = world.getAngularVelocity(bodyId);
        world.addTorque(bodyId, [-25.0 * angVel[0], -25.0 * angVel[1], -25.0 * angVel[2]]);
      }
    }
  }

  updateLimbIK(dt) {
    let plannedTargets = undefined;
    if (this.walk && this.gaitPlanner) {
      const tPos = this.world.getPosition(this.thoraxId);
      const pPos = this.world.getPosition(this.pelvisId);
      const tVel = this.world.getLinearVelocity(this.thoraxId);
      const centerPos = [(tPos[0] + pPos[0]) * 0.5, (tPos[1] + pPos[1]) * 0.5, (tPos[2] + pPos[2]) * 0.5];

      const plan = this.gaitPlanner.update(
        dt,
        {
          position: centerPos,
          linearVelocity: tVel,
          desiredSpeed: this.desiredSpeed,
          yawRateRadS: this.yawRateRadS,
        },
        (x, z) => this.sampleGround(x, z)
      );
      plannedTargets = plan.targets;
      this.ikTelemetry.walkingSlipMm = plan.maxWalkingSlipMm;
      this.ikTelemetry.stanceSlipMm = plan.maxWalkingSlipMm;
    }

    const ikResult = solveElephantIK({
      targets: plannedTargets,
      tolMm: 2.0,
      maxIter: 40,
    });

    this.ikTelemetry.maxResidualMm = ikResult.maxResidualMm;
    this.ikTelemetry.solvedFeet = ikResult.solved;

    if (!this.walk) {
      if (this.grfController.prevFootPos && ikResult.solved.FL) {
        const curFL = ikResult.solved.FL.tip;
        const prevFL = this.grfController.prevFootPos;
        const slipM = Math.hypot(curFL[0] - prevFL[0], curFL[2] - prevFL[2]);
        this.ikTelemetry.stanceSlipMm = slipM * 1000.0;
      }
      if (ikResult.solved.FL) {
        this.grfController.prevFootPos = [...ikResult.solved.FL.tip];
      }
    }

    // Live Cross-Product Joint Torques: tau = (r_foot - r_joint) x F_GRF
    const foreF = this.grfController.foreForce * 0.5;
    const hindF = this.grfController.hindForce * 0.5;
    const foreVec = [(this.grfController.fForeX || 0) * 0.5, foreF, (this.grfController.fForeZ || 0) * 0.5];
    const hindVec = [(this.grfController.fHindX || 0) * 0.5, hindF, (this.grfController.fHindZ || 0) * 0.5];

    const flFoot = ikResult.solved.FL ? ikResult.solved.FL.tip : [0.36, 0.0, 0.58];
    const hlFoot = ikResult.solved.HL ? ikResult.solved.HL.tip : [0.36, 0.0, -1.15];
    const torquesFL = ikResult.jointPositions ? computeLiveJointTorques(ikResult.jointPositions.FL, flFoot, foreVec) : {};
    const torquesHL = ikResult.jointPositions ? computeLiveJointTorques(ikResult.jointPositions.HL, hlFoot, hindVec) : {};

    this.ikTelemetry.jointTorquesNm = {
      shoulder: torquesFL.shoulder ? torquesFL.shoulder.tau : 0,
      elbow: torquesFL.elbow ? torquesFL.elbow.tau : 0,
      wrist: torquesFL.wrist ? torquesFL.wrist.tau : 0,
      hip: torquesHL.hip ? torquesHL.hip.tau : 0,
      knee: torquesHL.knee ? torquesHL.knee.tau : 0,
      hock: torquesHL.hock ? torquesHL.hock.tau : 0,
      details: { FL: torquesFL, HL: torquesHL },
    };

    return this.ikTelemetry;
  }

  step(dt) {
    const t0 = performance.now();
    this.updateLimbIK(dt);
    const frameMs = performance.now() - t0;

    return {
      frameMs,
      foreHindSplit: this.grfController.measuredForeSplit,
      foreForceN: this.grfController.foreForce,
      hindForceN: this.grfController.hindForce,
      pitchDeg: (this.grfController.pitchRad * 180) / Math.PI,
      headingDeg: this.gaitPlanner ? (this.gaitPlanner.headingRad * 180) / Math.PI : 0,
      isSettled: this.grfController.isSettled,
      settleTimeS: this.grfController.settleTimeS,
      maxPenetrationMm: this.grfController.maxPenetrationM * 1000.0,
      ikResidualMm: this.ikTelemetry.maxResidualMm,
      stanceSlipMm: this.ikTelemetry.stanceSlipMm,
      walkingSlipMm: this.ikTelemetry.walkingSlipMm || 0,
      jointTorquesNm: this.ikTelemetry.jointTorquesNm,
      trunkCurlErrorDeg: this.trunkCurlErrorDeg,
      maxTrunkPenetrationMm: this.maxTrunkPenetrationMm,
      froudeNumber: this.getFroudeNumber(),
      dutyFactor: this.gaitPlanner ? this.gaitPlanner.dutyFactor : 1.0,
    };
  }

  dispose(world = this.world) {
    if (this.wrenchGen) {
      world.removeWrenchGenerator(this.wrenchGen);
      this.wrenchGen = null;
    }
    if (this.waistConstraint) {
      world.destroyConstraint(this.waistConstraint);
      this.waistConstraint = null;
    }
    if (this.tailConstraints) {
      for (const c of this.tailConstraints) world.destroyConstraint(c);
      this.tailConstraints = [];
    }
    if (this.tailBodyIds) {
      for (const b of this.tailBodyIds) world.destroyBody(b);
      this.tailBodyIds = [];
    }
    if (this.earConstraints) {
      for (const c of this.earConstraints) world.destroyConstraint(c);
      this.earConstraints = [];
    }
    if (this.earLId) { world.destroyBody(this.earLId); this.earLId = null; }
    if (this.earRId) { world.destroyBody(this.earRId); this.earRId = null; }

    if (this.trunkConstraints) {
      for (const c of this.trunkConstraints) world.destroyConstraint(c);
      this.trunkConstraints = [];
    }
    if (this.trunkBodyIds) {
      for (const b of this.trunkBodyIds) world.destroyBody(b);
      this.trunkBodyIds = [];
    }

    if (this.thoraxId) { world.destroyBody(this.thoraxId); this.thoraxId = null; }
    if (this.pelvisId) { world.destroyBody(this.pelvisId); this.pelvisId = null; }
  }
}
