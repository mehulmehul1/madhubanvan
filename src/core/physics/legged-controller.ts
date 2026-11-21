// legged-controller.ts — TypeScript contract for FoxSplitAuthorityController

export interface ControllerTelemetry {
  frameMs: number
  foreHindSplit: number
  foreForceN: number
  hindForceN: number
  pitchDeg: number
  isSettled: boolean
  settleTimeS: number
  maxPenetrationMm: number
  ikResidualMm: number
  stanceSlipMm: number
  jointTorquesNm: {
    shoulder: number
    elbow: number
    wrist: number
    hip: number
    knee: number
    hock: number
  }
}

export interface SplitAuthorityOptions {
  totalMassKg?: number
  restingForeSplit?: number
  nominalStandY?: number
  targetPitchRad?: number
  gravityFree?: boolean
  groundFn?: (x: number, z: number) => number
  position?: [number, number, number]
}

export {
  DimensionlessGRFController,
  FoxSplitAuthorityController,
  GRAVITY,
} from './legged-controller.js'
