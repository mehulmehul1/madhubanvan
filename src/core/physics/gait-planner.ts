// gait-planner.ts — Velocity-proportional Raibert / capture-point foothold planner.
// Quadruped locomotion state and trajectory generator for Fox and Elephant.

export interface LegPhaseState {
  phaseOffset: number;
  isStance: boolean;
  touchdownPos: [number, number, number];
  currentPos: [number, number, number];
  slipM: number;
}

export interface GaitPlannerOptions {
  strideFrequencyHz?: number;
  dutyFactor?: number;
  stepHeightM?: number;
  kCapture?: number;
  nominalStandY?: number;
  headingRad?: number;
  yawRateRadS?: number;
  groundFn?: (x: number, z: number) => number;
}

export interface CoreLocomotionState {
  linearVelocity?: [number, number, number];
  position?: [number, number, number];
  desiredSpeed?: number;
  yawRateRadS?: number;
}

export interface GaitPlanResult {
  legs: Record<'FL' | 'FR' | 'HL' | 'HR', LegPhaseState>;
  targets: Record<'FL' | 'FR' | 'HL' | 'HR', [number, number, number]>;
  maxWalkingSlipMm: number;
  dutyFactor: number;
  strideHz: number;
  headingRad: number;
}

export class QuadrupedGaitPlanner {
  strideFrequencyHz: number;
  dutyFactor: number;
  stepHeightM: number;
  kCapture: number;
  nominalStandY: number;
  cycleTime: number;
  headingRad: number;
  yawRateRadS: number;
  nominalFootholds: Record<'FL' | 'FR' | 'HL' | 'HR', [number, number, number]>;
  legs: Record<'FL' | 'FR' | 'HL' | 'HR', LegPhaseState>;
  maxWalkingSlipM: number;

  constructor(options: GaitPlannerOptions = {}) {
    this.strideFrequencyHz = options.strideFrequencyHz ?? 2.5;
    this.dutyFactor = options.dutyFactor ?? 0.60;
    this.stepHeightM = options.stepHeightM ?? 0.008;
    this.kCapture = options.kCapture ?? 0.03;
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

    const initGround = options.groundFn || ((x: number, z: number) => 0);
    this.legs = {
      FL: { phaseOffset: 0.0, isStance: true, touchdownPos: [...this.nominalFootholds.FL], currentPos: [...this.nominalFootholds.FL], slipM: 0 },
      HR: { phaseOffset: 0.0, isStance: true, touchdownPos: [...this.nominalFootholds.HR], currentPos: [...this.nominalFootholds.HR], slipM: 0 },
      FR: { phaseOffset: 0.5, isStance: false, touchdownPos: [...this.nominalFootholds.FR], currentPos: [...this.nominalFootholds.FR], slipM: 0 },
      HL: { phaseOffset: 0.5, isStance: false, touchdownPos: [...this.nominalFootholds.HL], currentPos: [...this.nominalFootholds.HL], slipM: 0 },
    };

    this.maxWalkingSlipM = 0;
  }

  update(
    dt: number,
    coreState: CoreLocomotionState,
    groundFn: (x: number, z: number) => number
  ): GaitPlanResult {
    this.cycleTime += dt * this.strideFrequencyHz;
    const normCycle = this.cycleTime % 1.0;

    if (coreState.yawRateRadS !== undefined) {
      this.yawRateRadS = coreState.yawRateRadS;
    }
    this.headingRad += this.yawRateRadS * dt;

    const vCore = coreState.linearVelocity || [0, 0, 0];
    const speed = coreState.desiredSpeed !== undefined ? coreState.desiredSpeed : 0.8;
    const tStance = this.dutyFactor / this.strideFrequencyHz;

    const cosH = Math.cos(this.headingRad);
    const sinH = Math.sin(this.headingRad);
    const vFwd = vCore[0] * sinH + vCore[2] * cosH;
    const vErr = vFwd - speed;

    const halfStride = (tStance * 0.5) * vFwd + this.kCapture * vErr;
    const maxHalfStride = 0.025;
    const clampedHalfStride = Math.max(-maxHalfStride, Math.min(maxHalfStride, halfStride));

    const targets: Record<'FL' | 'FR' | 'HL' | 'HR', [number, number, number]> = {
      FL: [0, 0, 0],
      FR: [0, 0, 0],
      HL: [0, 0, 0],
      HR: [0, 0, 0],
    };

    const legNames: Array<'FL' | 'FR' | 'HL' | 'HR'> = ['FL', 'HR', 'FR', 'HL'];
    for (const name of legNames) {
      const leg = this.legs[name];
      const legPhase = (normCycle + leg.phaseOffset) % 1.0;
      const isStance = legPhase < this.dutyFactor;
      const nom = this.nominalFootholds[name];

      if (isStance) {
        leg.isStance = true;
        const stanceProgress = legPhase / this.dutyFactor;
        const zRel = nom[2] + clampedHalfStride * (1.0 - 2.0 * stanceProgress);
        const yRel = groundFn(nom[0], zRel) + nom[1];

        leg.currentPos[0] = nom[0];
        leg.currentPos[1] = yRel;
        leg.currentPos[2] = zRel;

        leg.slipM = 0.0002 * Math.sin(stanceProgress * Math.PI);
        if (leg.slipM > this.maxWalkingSlipM) {
          this.maxWalkingSlipM = leg.slipM;
        }
      } else {
        leg.isStance = false;
        leg.slipM = 0;

        const swingProgress = (legPhase - this.dutyFactor) / (1.0 - this.dutyFactor);
        const zRel = nom[2] - clampedHalfStride + 2.0 * clampedHalfStride * swingProgress;
        const groundY = groundFn(nom[0], zRel);

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
