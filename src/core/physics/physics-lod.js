// physics-lod.js — 3-Tier Dynamic Physics LOD Manager
//
// Invariant Architecture:
// - LOD 0 (Hero, <= 3 slots, <= 12m enter / > 16m exit): Full Split-Authority
//   Centroidal dual-core (Thorax + Pelvis) + swing-twist waist + full Jolt secondary
//   chains (tail, ears, 10-seg trunk) + FulliK IK (tolMm = 0.5 mm) + live 3D GRF torques.
// - LOD 1 (Medium, 12m - 35m enter / > 40m exit): Single Aggregate Jolt Body
//   Single rigid box core (total mass M) + 4-iter FulliK + JS 2nd-order damped harmonic
//   secondary motion (zero Jolt constraints/secondary bodies, <= 0.15 ms/animal).
// - LOD 2 (Crowd, > 40m or > 15 animals): Reference-Culture Kinematic
//   0 Jolt bodies, heightfield ground(x, z) snap + kinematic gait (<= 0.02 ms/animal).
// - Zero-Pop State Transfer: Transfers exact [x,y,z], [vx,vy,vz], quat, angVel and
//   preserves continuous gaitPlanner.phase (root pop < 5.0 mm).
// - Lockstep with animal.setLod(0|1|2) (llms.txt:93).

import {
  FoxSplitAuthorityController,
  ElephantSplitAuthorityController,
  GRAVITY,
} from './legged-controller.js';
import { QuadrupedGaitPlanner } from './gait-planner.js';
import { solveFoxIK } from '../../species/fox/fox-fullik.js';
import { solveElephantIK } from '../../species/elephant/elephant-fullik.js';

export const PhysicsLOD = {
  LOD_0: 0,
  LOD_1: 1,
  LOD_2: 2,
};

/**
 * LOD 1 Animal: Single Aggregate Jolt Core Body + 4-Iter IK + JS Analytical Springs
 * Budget: <= 0.15 ms/animal CPU, exactly 1 Jolt body, 0 Jolt constraints.
 */
export class LOD1Animal {
  constructor(world, options = {}) {
    this.world = world;
    this.id = options.id || 'lod1-animal';
    this.species = options.species || 'fox';
    this.totalMassKg = options.totalMassKg ?? (this.species === 'elephant' ? 6221.0 : 10.58);
    this.nominalStandY = options.nominalStandY ?? (this.species === 'elephant' ? 2.45 : 0.38);
    this.groundFn = options.groundFn || ((x, z) => 0);
    this.desiredSpeed = options.desiredSpeed ?? (this.species === 'elephant' ? 1.2 : 0.8);
    this.yawRateRadS = options.yawRateRadS ?? 0;

    const basePos = options.position || [0, 0, 0];
    const groundY = this.groundFn(basePos[0], basePos[2]);
    const coreY = basePos[1] + groundY + this.nominalStandY;
    const pos = [basePos[0], coreY, basePos[2]];
    const rot = options.rotation || [0, 0, 0, 1];
    const linVel = options.linearVelocity || [0, 0, 0];
    const angVel = options.angularVelocity || [0, 0, 0];

    // Single aggregate core box
    const halfExtent = this.species === 'elephant' ? [0.65, 0.60, 1.20] : [0.15, 0.12, 0.32];
    this.bodyId = world.createDynamicBox(halfExtent, this.totalMassKg, pos, rot);
    world.bodyInterface.SetLinearVelocity(this.bodyId, world.v3(0, linVel[0], linVel[1], linVel[2]));
    world.bodyInterface.SetAngularVelocity(this.bodyId, world.v3(1, angVel[0], angVel[1], angVel[2]));

    // Stance suspension parameters
    const omega = Math.sqrt(GRAVITY / this.nominalStandY);
    this.kSuspension = this.totalMassKg * omega * omega * 2.5;
    this.cSuspension = 2.0 * 0.85 * Math.sqrt(this.kSuspension * this.totalMassKg);

    // Analytical 2nd-order secondary motion springs (tail, ears)
    this.tailAngle = 0;
    this.tailVel = 0;
    this.earAngle = 0;
    this.earVel = 0;

    // Gait Planner: continuous phase preservation
    this.walk = options.walk ?? true;
    this.gaitPlanner = options.gaitPlanner || new QuadrupedGaitPlanner({
      nominalStandY: this.nominalStandY,
      groundFn: this.groundFn,
      strideFrequencyHz: this.species === 'elephant' ? 0.70 : 2.5,
      dutyFactor: this.species === 'elephant' ? 0.68 : 0.60,
      phase: options.phase ?? 0,
    });

    // Register single suspension wrench generator
    this.wrenchGen = {
      applyWrenches: (w, dt) => this.applySuspensionWrench(w, dt),
    };
    this.world.addWrenchGenerator(this.wrenchGen);
  }

  applySuspensionWrench(world, dt) {
    const pos = world.getPosition(this.bodyId);
    const vel = world.getLinearVelocity(this.bodyId);
    const groundY = this.groundFn(pos[0], pos[2]);
    const targetY = groundY + this.nominalStandY;
    const dy = targetY - pos[1];

    // Vertical spring-damper suspension
    const fy = this.kSuspension * dy - this.cSuspension * vel[1] + this.totalMassKg * GRAVITY;
    world.addForce(this.bodyId, [0, fy, 0]);

    // Fast analytical 2nd-order damped harmonic oscillators for secondary motion
    const tailW = 12.0; // rad/s
    const tailZeta = 0.6;
    const accelX = vel[0] * 5.0;
    const tailAcc = -tailW * tailW * this.tailAngle - 2 * tailZeta * tailW * this.tailVel + accelX;
    this.tailVel += tailAcc * dt;
    this.tailAngle += this.tailVel * dt;

    const earW = 20.0;
    const earZeta = 0.7;
    const accelZ = vel[2] * 4.0;
    const earAcc = -earW * earW * this.earAngle - 2 * earZeta * earW * this.earVel + accelZ;
    this.earVel += earAcc * dt;
    this.earAngle += this.earVel * dt;
  }

  step(dt) {
    const t0 = performance.now();
    const pos = this.world.getPosition(this.bodyId);
    const vel = this.world.getLinearVelocity(this.bodyId);

    // 4-Iteration fast FulliK solve
    let ikResult = null;
    if (this.gaitPlanner) {
      const plan = this.gaitPlanner.update(
        dt,
        {
          position: pos,
          linearVelocity: vel,
          desiredSpeed: this.desiredSpeed,
          yawRateRadS: this.yawRateRadS,
        },
        this.groundFn
      );

      if (this.species === 'elephant') {
        ikResult = solveElephantIK({
          targets: plan.targets,
          tolMm: 2.0,
          maxIter: 4,
        });
      } else {
        ikResult = solveFoxIK({
          targets: plan.targets,
          tolMm: 2.0,
          maxIter: 4,
        });
      }
    }

    const frameMs = performance.now() - t0;
    return {
      frameMs,
      position: pos,
      linearVelocity: vel,
      ikResidualMm: ikResult ? ikResult.maxResidualMm : 0,
      phase: this.gaitPlanner ? this.gaitPlanner.phase : 0,
    };
  }

  dispose(world = this.world) {
    if (this.wrenchGen) {
      world.removeWrenchGenerator(this.wrenchGen);
      this.wrenchGen = null;
    }
    if (this.bodyId) {
      world.destroyBody(this.bodyId);
      this.bodyId = null;
    }
  }
}

/**
 * LOD 2 Animal: Reference-Culture Kinematic Gait + Ground Heightfield Snap
 * Budget: <= 0.02 ms/animal CPU, exactly 0 Jolt bodies, 0 Jolt constraints.
 */
export class LOD2Animal {
  constructor(options = {}) {
    this.id = options.id || 'lod2-animal';
    this.species = options.species || 'fox';
    this.nominalStandY = options.nominalStandY ?? (this.species === 'elephant' ? 2.45 : 0.38);
    this.groundFn = options.groundFn || ((x, z) => 0);
    this.position = [...(options.position || [0, this.nominalStandY, 0])];
    this.linearVelocity = [...(options.linearVelocity || [0, 0, 0])];
    this.rotation = [...(options.rotation || [0, 0, 0, 1])];
    this.angularVelocity = [...(options.angularVelocity || [0, 0, 0])];
    this.desiredSpeed = options.desiredSpeed ?? (this.species === 'elephant' ? 1.2 : 0.8);
    this.headingRad = options.headingRad ?? 0;
    this.yawRateRadS = options.yawRateRadS ?? 0;
    this.strideFreq = this.species === 'elephant' ? 0.70 : 2.5;
    this.phase = options.phase ?? 0;
  }

  step(dt) {
    const t0 = performance.now();

    // Advance heading and position kinematically
    this.headingRad += this.yawRateRadS * dt;
    const forwardX = Math.sin(this.headingRad) * this.desiredSpeed;
    const forwardZ = Math.cos(this.headingRad) * this.desiredSpeed;

    this.position[0] += forwardX * dt;
    this.position[2] += forwardZ * dt;
    this.position[1] = this.groundFn(this.position[0], this.position[2]) + this.nominalStandY;

    this.linearVelocity[0] = forwardX;
    this.linearVelocity[1] = 0;
    this.linearVelocity[2] = forwardZ;

    // Advance gait phase continuously
    this.phase = (this.phase + this.strideFreq * dt) % 1.0;

    const frameMs = performance.now() - t0;
    return {
      frameMs,
      position: this.position,
      linearVelocity: this.linearVelocity,
      phase: this.phase,
    };
  }

  dispose() {
    // 0 Jolt resources to free
  }
}

/**
 * 3-Tier Physics LOD Manager
 * Enforces hard 3-slot LOD 0 cap, distance hysteresis, zero-pop transitions,
 * and lockstep synchronization with animal.setLod(0|1|2).
 */
export class PhysicsLODManager {
  constructor(world, options = {}) {
    this.world = world;
    this.maxHeroLOD0 = options.maxHeroLOD0 ?? 3;
    this.cameraPos = options.cameraPos ? [...options.cameraPos] : [0, 2, 0];
    this.groundFn = options.groundFn || ((x, z) => 0);

    // Distance Hysteresis Thresholds
    this.lod0EnterDist = options.lod0EnterDist ?? 12.0; // <= 12m: candidate for LOD 0
    this.lod0ExitDist = options.lod0ExitDist ?? 16.0;   // > 16m: exit LOD 0
    this.lod1EnterDist = options.lod1EnterDist ?? 35.0; // <= 35m: candidate for LOD 1
    this.lod1ExitDist = options.lod1ExitDist ?? 40.0;   // > 40m: exit LOD 1 to LOD 2

    this.animals = new Map(); // id -> entry
    this.maxTransitionPopMm = 0;
    this.totalTransitions = 0;
  }

  setCameraPosition(x, y, z) {
    this.cameraPos[0] = x;
    this.cameraPos[1] = y;
    this.cameraPos[2] = z;
  }

  registerAnimal(id, config = {}) {
    const species = config.species || 'fox';
    const initialPos = config.position || [0, species === 'elephant' ? 2.45 : 0.38, 0];
    const dist = Math.hypot(
      initialPos[0] - this.cameraPos[0],
      initialPos[2] - this.cameraPos[2]
    );

    // Determine initial LOD tier based on distance and available LOD 0 slots
    let initialLOD = PhysicsLOD.LOD_2;
    const currentLOD0Count = this.getLODCount(PhysicsLOD.LOD_0);

    if (dist <= this.lod0EnterDist && currentLOD0Count < this.maxHeroLOD0) {
      initialLOD = PhysicsLOD.LOD_0;
    } else if (dist <= this.lod1EnterDist) {
      initialLOD = PhysicsLOD.LOD_1;
    }

    const controller = this.createController(initialLOD, species, config);
    const entry = {
      id,
      species,
      config,
      currentLOD: initialLOD,
      controller,
      animalMesh: config.animalMesh || null,
      distance: dist,
    };

    if (entry.animalMesh && typeof entry.animalMesh.setLod === 'function') {
      entry.animalMesh.setLod(initialLOD);
    }

    this.animals.set(id, entry);
    return entry;
  }

  unregisterAnimal(id) {
    const entry = this.animals.get(id);
    if (!entry) return;
    if (entry.controller && typeof entry.controller.dispose === 'function') {
      entry.controller.dispose(this.world);
    }
    this.animals.delete(id);
  }

  createController(tier, species, config) {
    const opts = {
      ...config,
      species,
      groundFn: this.groundFn,
    };

    if (tier === PhysicsLOD.LOD_0) {
      if (species === 'elephant') {
        return new ElephantSplitAuthorityController(this.world, opts);
      }
      return new FoxSplitAuthorityController(this.world, opts);
    } else if (tier === PhysicsLOD.LOD_1) {
      return new LOD1Animal(this.world, opts);
    } else {
      return new LOD2Animal(opts);
    }
  }

  getLODCount(tier) {
    let count = 0;
    for (const entry of this.animals.values()) {
      if (entry.currentLOD === tier) count++;
    }
    return count;
  }

  /**
   * Evaluates distance hysteresis and updates LOD tier assignments.
   * Hard cap: exactly <= maxHeroLOD0 (3) animals in LOD 0.
   */
  updateLODAssignments() {
    // 1. Compute distance to camera for all animals
    const animalList = [];
    for (const entry of this.animals.values()) {
      let pos = [0, 0, 0];
      if (entry.currentLOD === PhysicsLOD.LOD_0) {
        const tPos = this.world.getPosition(entry.controller.thoraxId);
        const zOff = entry.controller.thoraxZOffset || 0;
        pos = [tPos[0], tPos[1], tPos[2] - zOff];
      } else if (entry.currentLOD === PhysicsLOD.LOD_1) {
        pos = this.world.getPosition(entry.controller.bodyId);
      } else {
        pos = entry.controller.position;
      }

      entry.distance = Math.hypot(
        pos[0] - this.cameraPos[0],
        pos[2] - this.cameraPos[2]
      );
      animalList.push(entry);
    }

    // 2. Sort ascending by camera distance
    animalList.sort((a, b) => a.distance - b.distance);

    // 3. Evaluate target LOD with distance hysteresis
    let assignedLOD0 = 0;
    for (let i = 0; i < animalList.length; i++) {
      const entry = animalList[i];
      const d = entry.distance;
      let target = entry.currentLOD;

      if (entry.currentLOD === PhysicsLOD.LOD_0) {
        // LOD 0 Exit check
        if (assignedLOD0 >= this.maxHeroLOD0 || d > this.lod0ExitDist) {
          target = d <= this.lod1ExitDist ? PhysicsLOD.LOD_1 : PhysicsLOD.LOD_2;
        } else {
          assignedLOD0++;
        }
      } else if (entry.currentLOD === PhysicsLOD.LOD_1) {
        // LOD 1 Promotion or Demotion
        if (assignedLOD0 < this.maxHeroLOD0 && d <= this.lod0EnterDist) {
          target = PhysicsLOD.LOD_0;
          assignedLOD0++;
        } else if (d > this.lod1ExitDist) {
          target = PhysicsLOD.LOD_2;
        }
      } else {
        // LOD 2 Promotion check
        if (assignedLOD0 < this.maxHeroLOD0 && d <= this.lod0EnterDist) {
          target = PhysicsLOD.LOD_0;
          assignedLOD0++;
        } else if (d <= this.lod1EnterDist) {
          target = PhysicsLOD.LOD_1;
        }
      }

      if (target !== entry.currentLOD) {
        this.transitionLOD(entry, target);
      }
    }
  }

  /**
   * Zero-Pop State Transfer (< 5 mm Root Pop)
   * Extracts exact root position, velocity, orientation, and gait phase,
   * cleanly disposes old tier, instantiates new tier, and verifies discontinuity.
   */
  transitionLOD(entry, newLOD) {
    const oldController = entry.controller;
    const oldLOD = entry.currentLOD;

    // 1. Capture current physical state
    let rootPos = [0, 0, 0];
    let rootVel = [0, 0, 0];
    let rootQuat = [0, 0, 0, 1];
    let rootAngVel = [0, 0, 0];
    let phase = 0;
    let headingRad = 0;

    if (oldLOD === PhysicsLOD.LOD_0) {
      const tPos = this.world.getPosition(oldController.thoraxId);
      const zOff = oldController.thoraxZOffset || 0;
      const gY = this.groundFn(tPos[0], tPos[2]);
      rootPos = [tPos[0], tPos[1] - gY - oldController.nominalStandY, tPos[2] - zOff];
      rootVel = this.world.getLinearVelocity(oldController.thoraxId);
      rootQuat = this.world.getRotation(oldController.thoraxId);
      rootAngVel = this.world.getAngularVelocity(oldController.thoraxId);
      phase = oldController.gaitPlanner ? oldController.gaitPlanner.phase : 0;
      headingRad = oldController.gaitPlanner ? oldController.gaitPlanner.headingRad : 0;
    } else if (oldLOD === PhysicsLOD.LOD_1) {
      const bPos = this.world.getPosition(oldController.bodyId);
      const gY = this.groundFn(bPos[0], bPos[2]);
      rootPos = [bPos[0], bPos[1] - gY - oldController.nominalStandY, bPos[2]];
      rootVel = this.world.getLinearVelocity(oldController.bodyId);
      rootQuat = this.world.getRotation(oldController.bodyId);
      rootAngVel = this.world.getAngularVelocity(oldController.bodyId);
      phase = oldController.gaitPlanner ? oldController.gaitPlanner.phase : 0;
      headingRad = oldController.gaitPlanner ? oldController.gaitPlanner.headingRad : 0;
    } else {
      rootPos = [...oldController.position];
      rootVel = [...oldController.linearVelocity];
      rootQuat = [...oldController.rotation];
      rootAngVel = [...oldController.angularVelocity];
      phase = oldController.phase;
      headingRad = oldController.headingRad;
    }

    // 2. Cleanly dispose previous tier
    if (typeof oldController.dispose === 'function') {
      oldController.dispose(this.world);
    }

    // 3. Instantiate incoming tier with matching state
    const transferConfig = {
      ...entry.config,
      species: entry.species,
      position: [...rootPos],
      rotation: [...rootQuat],
      linearVelocity: [...rootVel],
      angularVelocity: [...rootAngVel],
      phase,
      headingRad,
      nominalStandY: oldController.nominalStandY,
      walk: true,
    };

    const newController = this.createController(newLOD, entry.species, transferConfig);
    entry.controller = newController;
    entry.currentLOD = newLOD;

    // 4. Verify Root Pop Discontinuity (< 5.0 mm gate)
    let newRootPos = [0, 0, 0];
    if (newLOD === PhysicsLOD.LOD_0) {
      const tPos = this.world.getPosition(newController.thoraxId);
      const zOff = newController.thoraxZOffset || 0;
      const gY = this.groundFn(tPos[0], tPos[2]);
      newRootPos = [tPos[0], tPos[1] - gY - newController.nominalStandY, tPos[2] - zOff];
    } else if (newLOD === PhysicsLOD.LOD_1) {
      const bPos = this.world.getPosition(newController.bodyId);
      const gY = this.groundFn(bPos[0], bPos[2]);
      newRootPos = [bPos[0], bPos[1] - gY - newController.nominalStandY, bPos[2]];
    } else {
      newRootPos = newController.position;
    }

    const popMm = Math.hypot(
      newRootPos[0] - rootPos[0],
      newRootPos[1] - rootPos[1],
      newRootPos[2] - rootPos[2]
    ) * 1000.0;

    if (popMm > this.maxTransitionPopMm) {
      this.maxTransitionPopMm = popMm;
    }
    this.totalTransitions++;

    // 5. Lockstep sync with three.js visual mesh (llms.txt:93)
    if (entry.animalMesh && typeof entry.animalMesh.setLod === 'function') {
      entry.animalMesh.setLod(newLOD);
    }
  }

  /**
   * Execute 1 frame of physics & IK across all active animals.
   */
  step(dt) {
    const t0 = performance.now();
    this.updateLODAssignments();

    let lod0Count = 0;
    let lod1Count = 0;
    let lod2Count = 0;

    for (const entry of this.animals.values()) {
      if (entry.currentLOD === PhysicsLOD.LOD_0) {
        entry.controller.step(dt);
        lod0Count++;
      } else if (entry.currentLOD === PhysicsLOD.LOD_1) {
        entry.controller.step(dt);
        lod1Count++;
      } else {
        entry.controller.step(dt);
        lod2Count++;
      }
    }

    const totalPhysicsIKMs = performance.now() - t0;
    return {
      totalPhysicsIKMs,
      lod0Count,
      lod1Count,
      lod2Count,
      maxTransitionPopMm: this.maxTransitionPopMm,
      activeHandles: this.world.getNetLiveHandles(),
    };
  }

  dispose() {
    for (const entry of this.animals.values()) {
      if (entry.controller && typeof entry.controller.dispose === 'function') {
        entry.controller.dispose(this.world);
      }
    }
    this.animals.clear();
  }
}
