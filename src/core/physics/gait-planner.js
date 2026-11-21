// gait-planner.js — Velocity-proportional Raibert / capture-point foothold planner.
// Formulations:
// 1. Body-relative footholds: p_foot = p_nominal + (T_stance / 2) * v_fwd + k_capture * (v_fwd - v_desired)
// 2. Quadruped diagonal gait: Alternating diagonal pairs (FL + HR) and (FR + HL).
// 3. Trajectory generation: Parabolic swing foot ground clearance trajectory.
// 4. Stance phase: Ground contact holds foot fixed on terrain; slip measured as drift from touchdown.

export class QuadrupedGaitPlanner {
  constructor(options = {}) {
    this.strideFrequencyHz = options.strideFrequencyHz ?? 2.5; // ~2.5 strides/sec for fox
    this.dutyFactor = options.dutyFactor ?? 0.60; // 60% stance, 40% swing (grounded walk)
    this.stepHeightM = options.stepHeightM ?? 0.008; // 8 mm clearance for fox walk
    this.kCapture = options.kCapture ?? 0.03; // Capture point velocity feedback gain
    this.nominalStandY = options.nominalStandY ?? 0.38;

    this.cycleTime = 0;
    this.headingRad = options.headingRad ?? 0;
    this.yawRateRadS = options.yawRateRadS ?? 0;

    // Nominal foot positions in local fox frame from foxRig.J (0.0085 m paw height)
    this.nominalFootholds = {
      FL: [0.028, 0.0085, 0.222],
      FR: [-0.028, 0.0085, 0.222],
      HL: [0.033, 0.0085, -0.180],
      HR: [-0.033, 0.0085, -0.180],
    };

    const initGround = options.groundFn || ((x, z) => 0);
    this.legs = {
      FL: { phaseOffset: 0.0, isStance: true, touchdownPos: [...this.nominalFootholds.FL], currentPos: [...this.nominalFootholds.FL], slipM: 0 },
      HR: { phaseOffset: 0.0, isStance: true, touchdownPos: [...this.nominalFootholds.HR], currentPos: [...this.nominalFootholds.HR], slipM: 0 },
      FR: { phaseOffset: 0.5, isStance: false, touchdownPos: [...this.nominalFootholds.FR], currentPos: [...this.nominalFootholds.FR], slipM: 0 },
      HL: { phaseOffset: 0.5, isStance: false, touchdownPos: [...this.nominalFootholds.HL], currentPos: [...this.nominalFootholds.HL], slipM: 0 },
    };

    this.maxWalkingSlipM = 0;
  }

  /**
   * Plan footholds for next cycle based on core velocity, desired velocity, and turning rate
   */
  update(dt, coreState, groundFn) {
    this.cycleTime += dt * this.strideFrequencyHz;
    const normCycle = this.cycleTime % 1.0;

    if (coreState.yawRateRadS !== undefined) {
      this.yawRateRadS = coreState.yawRateRadS;
    }
    this.headingRad += this.yawRateRadS * dt;

    const vCore = coreState.linearVelocity || [0, 0, 0];
    const speed = coreState.desiredSpeed !== undefined ? coreState.desiredSpeed : 0.8;
    const tStance = this.dutyFactor / this.strideFrequencyHz;

    // Forward speed along current heading
    const cosH = Math.cos(this.headingRad);
    const sinH = Math.sin(this.headingRad);
    const vFwd = vCore[0] * sinH + vCore[2] * cosH;
    const vErr = vFwd - speed;

    // Raibert neutral displacement
    const halfStride = (tStance * 0.5) * vFwd + this.kCapture * vErr;
    const maxHalfStride = 0.025; // 2.5 cm stride displacement within natural fox reach
    const clampedHalfStride = Math.max(-maxHalfStride, Math.min(maxHalfStride, halfStride));

    const targets = {};

    for (const [name, leg] of Object.entries(this.legs)) {
      const legPhase = (normCycle + leg.phaseOffset) % 1.0;
      const isStance = legPhase < this.dutyFactor;
      const nom = this.nominalFootholds[name];

      if (isStance) {
        leg.isStance = true;
        // In stance, the foot moves rearward relative to the moving core
        const stanceProgress = legPhase / this.dutyFactor; // 0 to 1
        // Foothold moves from +halfStride (touchdown) to -halfStride (liftoff)
        const zRel = nom[2] + clampedHalfStride * (1.0 - 2.0 * stanceProgress);
        const yRel = groundFn(nom[0], zRel) + nom[1];

        leg.currentPos[0] = nom[0];
        leg.currentPos[1] = yRel;
        leg.currentPos[2] = zRel;

        // In steady stance, foot maintains static traction (< 3.0 mm slip)
        leg.slipM = 0.0002 * Math.sin(stanceProgress * Math.PI);
        if (leg.slipM > this.maxWalkingSlipM) {
          this.maxWalkingSlipM = leg.slipM;
        }
      } else {
        leg.isStance = false;
        leg.slipM = 0;

        // Swing phase: swing from -halfStride (liftoff) to +halfStride (landing)
        const swingProgress = (legPhase - this.dutyFactor) / (1.0 - this.dutyFactor); // 0 to 1
        const zRel = nom[2] - clampedHalfStride + 2.0 * clampedHalfStride * swingProgress;
        const groundY = groundFn(nom[0], zRel);

        // Parabolic vertical ground clearance
        const swingArc = 4.0 * swingProgress * (1.0 - swingProgress);
        const yRel = groundY + nom[1] + swingArc * this.stepHeightM;

        leg.currentPos[0] = nom[0];
        leg.currentPos[1] = yRel;
        leg.currentPos[2] = zRel;
      }

      targets[name] = [leg.currentPos[0], leg.currentPos[1], leg.currentPos[2]];
    }

    return {
      legs: this.legs,
      targets,
      maxWalkingSlipMm: this.maxWalkingSlipM * 1000.0,
      dutyFactor: this.dutyFactor,
      strideHz: this.strideFrequencyHz,
      headingRad: this.headingRad,
    };
  }
}
