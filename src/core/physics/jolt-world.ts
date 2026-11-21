// jolt-world.ts — TypeScript contract for JoltWorld wrapper

export interface WrenchGenerator {
  applyWrenches(world: any, dt: number): void
}

export interface RaycastHit {
  hit: boolean
  fraction: number
  distance: number
  point: [number, number, number]
  bodyID: any
}

export interface JoltWorldOptions {
  fixedDt?: number
  maxSubSteps?: number
  maxBodies?: number
  maxBodyPairs?: number
  maxContactConstraints?: number
  gravity?: [number, number, number]
}

export { JoltWorld, getJolt, LAYER_NON_MOVING, LAYER_MOVING, LAYER_SENSOR } from './jolt-world.js'
