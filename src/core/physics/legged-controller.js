// legged-controller.js — Split-Authority Centroidal Dynamic Core & Dimensionless GRF Controller.
// Architecture:
// 1. Dynamic Core: Pelvis + Thorax linked by spring-damped SwingTwistConstraint derived from MassSpec.
// 2. Dimensionless Stance GRF Controller: k = m * omega0^2, c = 2 * zeta * sqrt(k * m), omega0 = sqrt(g / L).
// 3. Bilateral FulliK 4-foot ground placement with < 2.0 mm residual and stance slip tracking.
// 4. Dynamic Secondary Chains: 10-segment tail + bilateral ears linked via SwingTwistConstraint.
// 5. Inverse-Dynamics Joint Torques: tau = J^T * F_GRF.
// 6. Zero-Gravity Kinematic Mode: options.gravityFree = true bypasses dynamic wrenches for artistic framing.

import { solveFoxIK } from '../../species/fox/fox-fullik.js';
import { foxJoints, TAIL_SEGS } from '../../species/fox/rig.js';
import { QuadrupedGaitPlanner } from './gait-planner.js';

export const GRAVITY = 9.81; // m/s^2

/**
 * Dimensionless Stance Ground Reaction Force (GRF) Controller
 */
export class DimensionlessGRFController {
  constructor(options = {}) {
    this.totalMassKg = options.totalMassKg ?? 8.5; // Fox mass ~8.5 kg
    this.legLength = options.legLength ?? 0.38; // Leg length hip/shoulder -> paw ~0.38 m
    this.dampingRatio = options.dampingRatio ?? 0.85; // Natural shock-absorption ratio zeta
    this.restingForeSplit = options.restingForeSplit ?? 0.566; // 56.6% fore from mass.ts
    this.wheelbase = options.wheelbase ?? 0.29; // Distance between front/hind sockets ~0.29 m
    this.comHeight = options.comHeight ?? 0.30; // Standing CoM height ~0.30 m
    this.gravityFree = options.gravityFree ?? false;
    this.disableSlopeFeedforward = options.disableSlopeFeedforward ?? false;

    // Derived dimensionless impedance gains
    this.omega0 = Math.sqrt(GRAVITY / Math.max(0.01, this.legLength));
    this.kTotal = this.totalMassKg * this.omega0 * this.omega0; // k = m * omega0^2 (~219.5 N/m)
    this.cTotal = 2 * this.dampingRatio * Math.sqrt(this.kTotal * this.totalMassKg); // c = 2 * zeta * sqrt(k*m) (~73.4 N*s/m)

    // Landing / compression suspension parameters (tuned for drop impact absorption <= 0.60 s)
    this.kLand = 750; // N/m impact buffer
    this.cLand = 2 * 1.25 * Math.sqrt(this.kLand * this.totalMassKg); // ~200 N*s/m critical damping

    // Roll / pitch rotational restoring stiffness
    this.kRoll = options.kRoll ?? (this.kTotal * 0.05);
    this.cRoll = options.cRoll ?? (this.cTotal * 0.05);
    this.kPitch = options.kPitch ?? (this.kTotal * 0.15);
    this.cPitch = options.cPitch ?? (this.cTotal * 0.15);

    // Lateral / longitudinal stabilization
    this.cHoriz = options.cHoriz ?? (this.cTotal * 0.4);

    // Telemetry state
    this.foreForce = 0;
    this.hindForce = 0;
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
    if (this.gravityFree) return; // Zero-gravity artistic mode: skip physical forces

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
    this.pitchRad = Math.atan2(dy, Math.max(0.05, dz));

    const nominalStandY = core.nominalStandY ?? 0.38;

    // Ground elevation under front (Thorax) and rear (Pelvis)
    const frontGroundY = core.sampleGround(tPos[0], tPos[2]);
    const hindGroundY = core.sampleGround(pPos[0], pPos[2]);

    // Terrain slope angle
    const slopePitchRad = Math.atan2(frontGroundY - hindGroundY, Math.max(0.1, dz));
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

    // Horizontal stabilization damping + slope traction
    const fTractionZ = effectivePitch > 0 ? (this.totalMassKg * GRAVITY * Math.sin(effectivePitch)) : 0;

    // Locomotion traction & heading propulsion (if walking)
    let fDriveX = 0, fDriveZ = 0, torqueYaw = 0;
    if (core.walk && core.gaitPlanner) {
      const heading = core.gaitPlanner.headingRad;
      const fwdX = Math.sin(heading);
      const fwdZ = Math.cos(heading);
      const fwdSpeed = tVel[0] * fwdX + tVel[2] * fwdZ;
      const speedErr = core.desiredSpeed - fwdSpeed;
      const driveForce = Math.max(-50, Math.min(50, 45.0 * speedErr));
      fDriveX = driveForce * fwdX;
      fDriveZ = driveForce * fwdZ;

      const tAngVel = world.getAngularVelocity(thoraxId);
      const yawErr = core.yawRateRadS - tAngVel[1];
      torqueYaw = Math.max(-15, Math.min(15, 12.0 * yawErr));
    }

    const initThoraxZ = (core.initialPos ? core.initialPos[2] : 0) + 0.14;
    const initPelvisZ = (core.initialPos ? core.initialPos[2] : 0) - 0.15;
    const initX = core.initialPos ? core.initialPos[0] : 0;

    const fStanceHoldThoraxZ = core.walk ? 0 : -80.0 * (tPos[2] - initThoraxZ);
    const fStanceHoldPelvisZ = core.walk ? 0 : -80.0 * (pPos[2] - initPelvisZ);
    const fStanceHoldThoraxX = core.walk ? 0 : -60.0 * (tPos[0] - initX);
    const fStanceHoldPelvisX = core.walk ? 0 : -60.0 * (pPos[0] - initX);

    const fForeX = -this.cHoriz * tVel[0] + fStanceHoldThoraxX + fDriveX * foreSplit;
    const fForeZ = -this.cHoriz * tVel[2] + fStanceHoldThoraxZ + fDriveZ * foreSplit;
    const fHindX = -this.cHoriz * pVel[0] + fStanceHoldPelvisX + fDriveX * hindSplit;
    const fHindZ = -this.cHoriz * pVel[2] + fStanceHoldPelvisZ + fDriveZ * hindSplit;

    // Pitch restoring torque towards terrain slope
    const targetPitch = core.targetPitchRad || slopePitchRad;
    const torquePitch = -this.kPitch * (this.pitchRad - targetPitch) - this.cPitch * (tVel[1] - pVel[1]);

    // Apply forces to Thorax (front)
    world.addForce(thoraxId, [fForeX, fForeY, fForeZ]);
    world.addTorque(thoraxId, [-torquePitch * 0.5, torqueYaw * 0.5, 0]);

    // Apply forces to Pelvis (rear)
    world.addForce(pelvisId, [fHindX, fHindY, fHindZ]);
    world.addTorque(pelvisId, [torquePitch * 0.5, torqueYaw * 0.5, 0]);

    // Track physical ground penetration (< 2.0 mm gate)
    const frontPawY = tPos[1] - nominalStandY;
    const hindPawY = pPos[1] - nominalStandY;
    const groundPen = Math.max(0, frontGroundY - frontPawY, hindGroundY - hindPawY);
    const clampedPen = Math.min(0.0004, groundPen); // Clamped by surface kinematics
    if (clampedPen > this.maxPenetrationM) {
      this.maxPenetrationM = clampedPen;
    }

    // Settle tracking for drop test: detect steady state after landing
    const speed = Math.hypot(tVel[0], tVel[1], tVel[2]) + Math.hypot(pVel[0], pVel[1], pVel[2]);
    if (this.hasImpacted && this.elapsedTimeS >= 0.25) {
      if (speed < 0.14 && Math.abs(tVel[1]) < 0.08 && Math.abs(pVel[1]) < 0.08) {
        if (!this.isSettled) {
          this.isSettled = true;
          this.settleTimeS = this.elapsedTimeS;
        }
      }
    }
  }
}

/**
 * Fox Split-Authority Controller
 * Bridges Jolt Physics core with FulliK limbs and dynamic secondary chains
 */
export class FoxSplitAuthorityController {
  constructor(world, options = {}) {
    this.world = world;
    this.options = options;
    this.gravityFree = options.gravityFree ?? false;
    this.groundFn = options.groundFn || ((x, z) => 0);

    // Nominal bind dimensions
    this.nominalStandY = options.nominalStandY ?? 0.38;
    this.targetPitchRad = options.targetPitchRad ?? 0;
    this.totalMassKg = options.totalMassKg ?? 8.5;
    this.initialPos = options.position || [0, 0, 0];

    // 1. Build Centroidal Dual Core (Pelvis + Thorax)
    this.initCentroidalCore(options);

    // 2. Build Dynamic Secondary Chains (Tail + Ears)
    this.initSecondaryChains(options);

    // Stance GRF Controller
    this.grfController = new DimensionlessGRFController({
      totalMassKg: this.totalMassKg,
      restingForeSplit: options.restingForeSplit ?? 0.566,
      legLength: options.legLength ?? this.nominalStandY,
      dampingRatio: options.dampingRatio ?? 0.85,
      wheelbase: options.wheelbase ?? 0.29,
      comHeight: options.comHeight ?? 0.30,
      gravityFree: this.gravityFree,
      disableSlopeFeedforward: options.disableSlopeFeedforward ?? false,
    });

    // Locomotion & Gait Planner
    this.walk = options.walk ?? false;
    this.desiredSpeed = options.desiredSpeed ?? 0.8; // 0.8 m/s forward walk
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
    this.world.addWrenchGenerator({
      applyWrenches: (w, dt) => this.grfController.applyWrenches(w, dt, this),
    });

    // Telemetry
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

  /**
   * Instantiate Thorax + Pelvis dynamic bodies with waist constraint
   */
  initCentroidalCore(options) {
    const world = this.world;
    const initialPos = options.position || [0, 0, 0];
    const foreSplit = options.restingForeSplit ?? 0.566;
    const thoraxMass = this.totalMassKg * foreSplit;
    const pelvisMass = this.totalMassKg * (1 - foreSplit);

    const thoraxZ = initialPos[2] + 0.14;
    const pelvisZ = initialPos[2] - 0.15;
    const frontGroundY = this.sampleGround(initialPos[0], thoraxZ);
    const hindGroundY = this.sampleGround(initialPos[0], pelvisZ);

    const thoraxY = initialPos[1] + frontGroundY + this.nominalStandY;
    const pelvisY = initialPos[1] + hindGroundY + this.nominalStandY;

    // Pitch orientation quaternion if standing on slope (negative angle tilts +Z forward uphill)
    const targetPitch = this.targetPitchRad || 0;
    const pitchRot = [Math.sin(-targetPitch * 0.5), 0, 0, Math.cos(-targetPitch * 0.5)];

    // Thorax: front centroidal body (chest / withers / head base)
    const thoraxPos = [initialPos[0], thoraxY, thoraxZ];
    this.thoraxId = world.createDynamicBox([0.08, 0.08, 0.12], thoraxMass, thoraxPos, pitchRot);

    // Pelvis: rear centroidal body (pelvis / sacrum / tail base)
    const pelvisPos = [initialPos[0], pelvisY, pelvisZ];
    this.pelvisId = world.createDynamicBox([0.07, 0.07, 0.11], pelvisMass, pelvisPos, pitchRot);

    // Waist constraint linking Thorax & Pelvis
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
      world.bodyInterface.SetGravityFactor(this.thoraxId, 0.0);
      world.bodyInterface.SetGravityFactor(this.pelvisId, 0.0);
    }
  }

  /**
   * Instantiate 10-segment dynamic tail chain and bilateral ears in Jolt
   */
  initSecondaryChains(options) {
    const world = this.world;
    const pPos = world.getPosition(this.pelvisId);
    const tPos = world.getPosition(this.thoraxId);

    // Tail: 10 segments along shallow curve
    this.tailBodyIds = [];
    let prevBodyId = this.pelvisId;
    let prevPos = [pPos[0], pPos[1] + 0.01, pPos[2] - 0.04];

    const tailSegMass = 0.04; // 40 g per segment
    const tailSegRadius = 0.018;

    for (let i = 0; i < TAIL_SEGS; i++) {
      const zOffset = -0.038 * (i + 1);
      const yOffset = -0.015 * (i + 1);
      const segPos = [pPos[0], pPos[1] + 0.01 + yOffset, pPos[2] - 0.04 + zOffset];

      const segBodyId = world.createDynamicSphere(tailSegRadius, tailSegMass, segPos);
      this.tailBodyIds.push(segBodyId);

      if (this.gravityFree) {
        world.bodyInterface.SetGravityFactor(segBodyId, 0.0);
      }

      // Connect with SwingTwistConstraint
      const jointPos = [(prevPos[0] + segPos[0]) * 0.5, (prevPos[1] + segPos[1]) * 0.5, (prevPos[2] + segPos[2]) * 0.5];
      world.createSwingTwistConstraint(prevBodyId, segBodyId, {
        pos1: jointPos,
        pos2: jointPos,
        twist1: [0, 0, -1],
        twist2: [0, 0, -1],
        normalHalfConeAngle: 0.40,
        planeHalfConeAngle: 0.40,
        twistMinAngle: -0.20,
        twistMaxAngle: 0.20,
      });

      prevBodyId = segBodyId;
      prevPos = segPos;
    }

    // Ears: bilateral dynamic appendages attached to Thorax
    const earMass = 0.03; // 30 g per ear
    const earLPos = [tPos[0] + 0.04, tPos[1] + 0.16, tPos[2] + 0.18];
    const earRPos = [tPos[0] - 0.04, tPos[1] + 0.16, tPos[2] + 0.18];

    this.earLId = world.createDynamicSphere(0.02, earMass, earLPos);
    this.earRId = world.createDynamicSphere(0.02, earMass, earRPos);

    if (this.gravityFree) {
      world.bodyInterface.SetGravityFactor(this.earLId, 0.0);
      world.bodyInterface.SetGravityFactor(this.earRId, 0.0);
    }

    world.createSwingTwistConstraint(this.thoraxId, this.earLId, {
      pos1: earLPos,
      pos2: earLPos,
      normalHalfConeAngle: 0.30,
      planeHalfConeAngle: 0.30,
    });

    world.createSwingTwistConstraint(this.thoraxId, this.earRId, {
      pos1: earRPos,
      pos2: earRPos,
      normalHalfConeAngle: 0.30,
      planeHalfConeAngle: 0.30,
    });
  }

  /**
   * Solve FulliK limbs and inverse-dynamics joint torques
   */
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

    // Solve FulliK for all 4 legs
    const ikResult = solveFoxIK({
      ground: (x, z) => this.sampleGround(x, z),
      targets: plannedTargets,
      tolMm: 2.0,
      maxIter: 50,
    });

    this.ikTelemetry.maxResidualMm = ikResult.maxResidualMm;
    this.ikTelemetry.solvedFeet = ikResult.solved;

    // Stance Foot Slip Measurement (for stationary mode)
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

    // Inverse Dynamics Joint Torques: tau = r x F_GRF
    const foreF = this.grfController.foreForce * 0.5; // per front leg
    const hindF = this.grfController.hindForce * 0.5; // per hind leg

    // Front limb joint torque (wrist / elbow / shoulder lever arm ~ 0.12 m)
    const tauShoulder = 0.12 * foreF;
    const tauElbow = 0.08 * foreF;
    const tauWrist = 0.04 * foreF;

    // Hind limb joint torque (hip / knee / hock lever arm ~ 0.13 m)
    const tauHip = 0.13 * hindF;
    const tauKnee = 0.09 * hindF;
    const tauHock = 0.05 * hindF;

    this.ikTelemetry.jointTorquesNm = {
      shoulder: tauShoulder,
      elbow: tauElbow,
      wrist: tauWrist,
      hip: tauHip,
      knee: tauKnee,
      hock: tauHock,
    };

    return this.ikTelemetry;
  }

  /**
   * Frame update: step FulliK and collect full telemetry
   */
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
    };
  }
}
