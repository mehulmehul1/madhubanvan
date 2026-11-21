// jolt-world.js — Main-thread single-threaded deterministic JoltPhysics.js WASM wrapper.
// Features: fixed-timestep accumulator (dt = 1/60 s), pre-allocated scratch Vec3/RVec3/Quat pool
// (zero per-step allocations), explicit dispose() lifecycle tracking, terrain collider builders,
// raycast API, and pluggable WrenchGenerator interface.

import initJolt from 'jolt-physics/wasm-compat';

export const LAYER_NON_MOVING = 0;
export const LAYER_MOVING = 1;
export const LAYER_SENSOR = 2;
export const NUM_OBJECT_LAYERS = 3;

export const BP_LAYER_NON_MOVING = 0;
export const BP_LAYER_MOVING = 1;
export const NUM_BROAD_PHASE_LAYERS = 2;

let joltPromise = null;

/**
 * Acquire cached Jolt WASM instance
 */
export async function getJolt() {
  if (!joltPromise) {
    joltPromise = initJolt();
  }
  return joltPromise;
}

export class JoltWorld {
  constructor(Jolt, options = {}) {
    this.Jolt = Jolt;
    this.options = options;
    this.fixedDt = options.fixedDt ?? (1 / 60);
    this.maxSubSteps = options.maxSubSteps ?? 10;
    this.accumulator = 0;
    this.stepCount = 0;
    this.isDisposed = false;

    // Active allocation tracking
    this.activeBodies = new Set();
    this.activeShapes = new Set();
    this.activeConstraints = new Set();
    this.activeConstraintSettings = new Set();
    this.bodyToShape = new Map();
    this.constraintToSettings = new Map();
    this.trackedDisposables = new Set();
    this.wrenchGenerators = new Set();

    // Setup collision filters
    this.objectFilter = new Jolt.ObjectLayerPairFilterJS();
    this.objectFilter.ShouldCollide = (layer1, layer2) => {
      if (layer1 === LAYER_NON_MOVING) return layer2 === LAYER_MOVING;
      if (layer1 === LAYER_MOVING) return true;
      if (layer1 === LAYER_SENSOR || layer2 === LAYER_SENSOR) return true;
      return false;
    };

    this.bpLayerNonMoving = new Jolt.BroadPhaseLayer(BP_LAYER_NON_MOVING);
    this.bpLayerMoving = new Jolt.BroadPhaseLayer(BP_LAYER_MOVING);

    this.bpInterface = new Jolt.BroadPhaseLayerInterfaceJS();
    this.bpInterface.GetNumBroadPhaseLayers = () => NUM_BROAD_PHASE_LAYERS;
    this.bpInterface.GetBPLayer = (layer) => {
      return layer === LAYER_NON_MOVING ? this.bpLayerNonMoving : this.bpLayerMoving;
    };

    this.objectVsBroadPhase = new Jolt.ObjectVsBroadPhaseLayerFilterJS();
    this.objectVsBroadPhase.ShouldCollide = (layer, bpLayer) => {
      if (layer === LAYER_NON_MOVING) {
        return bpLayer.GetValue() === this.bpLayerMoving.GetValue();
      }
      return true;
    };

    // System Settings
    this.settings = new Jolt.JoltSettings();
    this.settings.mMaxBodies = options.maxBodies ?? 1024;
    this.settings.mMaxBodyPairs = options.maxBodyPairs ?? 2048;
    this.settings.mMaxContactConstraints = options.maxContactConstraints ?? 1024;
    this.settings.mBroadPhaseLayerInterface = this.bpInterface;
    this.settings.mObjectVsBroadPhaseLayerFilter = this.objectVsBroadPhase;
    this.settings.mObjectLayerPairFilter = this.objectFilter;

    // Create Jolt Interface
    this.jolt = new Jolt.JoltInterface(this.settings);
    this.physicsSystem = this.jolt.GetPhysicsSystem();
    this.bodyInterface = this.physicsSystem.GetBodyInterface();
    this.narrowPhaseQuery = this.physicsSystem.GetNarrowPhaseQuery();

    // Set Gravity (-9.81 m/s² by default, or customizable)
    const gravity = options.gravity ?? [0, -9.81, 0];
    const gravV3 = new Jolt.Vec3(gravity[0], gravity[1], gravity[2]);
    this.physicsSystem.SetGravity(gravV3);
    Jolt.destroy(gravV3);

    // Pre-allocated Scratch Pool (Zero per-step allocations)
    this.scratchVec3 = [];
    for (let i = 0; i < 24; i++) {
      this.scratchVec3.push(new Jolt.Vec3(0, 0, 0));
    }
    this.scratchRVec3 = [];
    for (let i = 0; i < 12; i++) {
      this.scratchRVec3.push(new Jolt.RVec3(0, 0, 0));
    }
    this.scratchQuat = [];
    for (let i = 0; i < 12; i++) {
      this.scratchQuat.push(new Jolt.Quat(0, 0, 0, 1));
    }

    // Scratch Raycast Objects & Filters (Pre-allocated, 0 per-frame allocations)
    this.scratchRay = new Jolt.RRayCast();
    this.raySettings = new Jolt.RayCastSettings();
    this.bpRayFilter = new Jolt.DefaultBroadPhaseLayerFilter(this.objectVsBroadPhase, LAYER_MOVING);
    this.objRayFilter = new Jolt.DefaultObjectLayerFilter(this.objectFilter, LAYER_MOVING);
    this.bodyFilter = new Jolt.BodyFilter();
    this.shapeFilter = new Jolt.ShapeFilter();
    this.rayCollector = new Jolt.CastRayClosestHitCollisionCollector();
  }

  static async create(options = {}) {
    const Jolt = await getJolt();
    return new JoltWorld(Jolt, options);
  }

  // --- Scratch Pool Accessors (In-place mutation, 0 GC churn) ---
  v3(idx, x = 0, y = 0, z = 0) {
    const v = this.scratchVec3[idx];
    v.Set(x, y, z);
    return v;
  }

  rv3(idx, x = 0, y = 0, z = 0) {
    const v = this.scratchRVec3[idx];
    v.Set(x, y, z);
    return v;
  }

  quat(idx, x = 0, y = 0, z = 0, w = 1) {
    const q = this.scratchQuat[idx];
    q.Set(x, y, z, w);
    return q;
  }

  // --- Terrain Collider Builders ---

  /**
   * Create static ground box collider
   */
  createGroundBox(halfExtent = [100, 1, 100], position = [0, -1, 0]) {
    const Jolt = this.Jolt;
    const hx = this.v3(0, halfExtent[0], halfExtent[1], halfExtent[2]);
    const shapeSettings = new Jolt.BoxShapeSettings(hx);
    const shape = shapeSettings.Create().Get();
    this.activeShapes.add(shape);

    const pos = this.rv3(0, position[0], position[1], position[2]);
    const rot = this.quat(0, 0, 0, 0, 1);

    const creationSettings = new Jolt.BodyCreationSettings(
      shape, pos, rot,
      Jolt.EMotionType_Static, LAYER_NON_MOVING
    );

    const body = this.bodyInterface.CreateBody(creationSettings);
    const bodyID = body.GetID();
    this.bodyInterface.AddBody(bodyID, Jolt.EActivation_DontActivate);
    this.activeBodies.add(bodyID);
    this.bodyToShape.set(bodyID, shape);

    Jolt.destroy(creationSettings);
    Jolt.destroy(shapeSettings);

    return bodyID;
  }

  /**
   * Create static 15° inclined ramp
   */
  createRamp(length = 10, width = 4, thickness = 0.5, angleDeg = 15, position = [0, 0, 0]) {
    if (Array.isArray(length)) {
      const arr = length;
      position = thickness || [0, 0, 0];
      angleDeg = width || 15;
      length = arr[0];
      width = arr[1];
      thickness = arr[2] || 0.5;
    }
    const Jolt = this.Jolt;
    const hx = this.v3(0, width * 0.5, thickness * 0.5, length * 0.5);
    const shapeSettings = new Jolt.BoxShapeSettings(hx);
    const shape = shapeSettings.Create().Get();
    this.activeShapes.add(shape);

    const rad = (angleDeg * Math.PI) / 180;
    // Lower center so that top surface at z=0 lands exactly at position[1]
    const topOffset = (thickness * 0.5) / Math.cos(rad);
    const pos = this.rv3(0, position[0], position[1] - topOffset, position[2]);
    // Rotation around X axis (negative angle lifts +Z forward side uphill)
    const rot = this.quat(0, Math.sin(-rad * 0.5), 0, 0, Math.cos(-rad * 0.5));

    const creationSettings = new Jolt.BodyCreationSettings(
      shape, pos, rot,
      Jolt.EMotionType_Static, LAYER_NON_MOVING
    );
    creationSettings.mFriction = 0.6;

    const body = this.bodyInterface.CreateBody(creationSettings);
    const bodyID = body.GetID();
    this.bodyInterface.AddBody(bodyID, Jolt.EActivation_DontActivate);
    this.activeBodies.add(bodyID);
    this.bodyToShape.set(bodyID, shape);

    Jolt.destroy(creationSettings);
    Jolt.destroy(shapeSettings);

    return bodyID;
  }

  /**
   * Create dynamic rigid sphere
   */
  createDynamicSphere(radius = 0.5, massKg = 10, position = [0, 5, 0]) {
    const Jolt = this.Jolt;
    const shapeSettings = new Jolt.SphereShapeSettings(radius);
    const shape = shapeSettings.Create().Get();
    this.activeShapes.add(shape);

    const pos = this.rv3(0, position[0], position[1], position[2]);
    const rot = this.quat(0, 0, 0, 0, 1);

    const creationSettings = new Jolt.BodyCreationSettings(
      shape, pos, rot,
      Jolt.EMotionType_Dynamic, LAYER_MOVING
    );
    creationSettings.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
    creationSettings.mMassPropertiesOverride.mMass = massKg;

    const body = this.bodyInterface.CreateBody(creationSettings);
    const bodyID = body.GetID();
    this.bodyInterface.AddBody(bodyID, Jolt.EActivation_Activate);
    this.activeBodies.add(bodyID);
    this.bodyToShape.set(bodyID, shape);

    Jolt.destroy(creationSettings);
    Jolt.destroy(shapeSettings);

    return bodyID;
  }

  /**
   * Create dynamic box (e.g. core torso)
   */
  createDynamicBox(halfExtent = [0.2, 0.2, 0.4], massKg = 15, position = [0, 1, 0], rotation = [0, 0, 0, 1]) {
    const Jolt = this.Jolt;
    const hx = this.v3(0, halfExtent[0], halfExtent[1], halfExtent[2]);
    const shapeSettings = new Jolt.BoxShapeSettings(hx);
    const shape = shapeSettings.Create().Get();
    this.activeShapes.add(shape);

    const pos = this.rv3(0, position[0], position[1], position[2]);
    const rot = this.quat(0, rotation[0], rotation[1], rotation[2], rotation[3]);

    const creationSettings = new Jolt.BodyCreationSettings(
      shape, pos, rot,
      Jolt.EMotionType_Dynamic, LAYER_MOVING
    );
    creationSettings.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
    creationSettings.mMassPropertiesOverride.mMass = massKg;

    const body = this.bodyInterface.CreateBody(creationSettings);
    const bodyID = body.GetID();
    this.bodyInterface.AddBody(bodyID, Jolt.EActivation_Activate);
    this.activeBodies.add(bodyID);
    this.bodyToShape.set(bodyID, shape);

    Jolt.destroy(creationSettings);
    Jolt.destroy(shapeSettings);

    return bodyID;
  }

  // --- State Accessors (Zero Allocations) ---

  getPosition(bodyID, out = [0, 0, 0]) {
    const p = this.bodyInterface.GetPosition(bodyID);
    out[0] = p.GetX();
    out[1] = p.GetY();
    out[2] = p.GetZ();
    return out;
  }

  getBodyPosition(bodyID, out = [0, 0, 0]) {
    return this.getPosition(bodyID, out);
  }

  getRotation(bodyID, out = [0, 0, 0, 1]) {
    const q = this.bodyInterface.GetRotation(bodyID);
    out[0] = q.GetX();
    out[1] = q.GetY();
    out[2] = q.GetZ();
    out[3] = q.GetW();
    return out;
  }

  getBodyRotation(bodyID, out = [0, 0, 0, 1]) {
    return this.getRotation(bodyID, out);
  }

  getLinearVelocity(bodyID, out = [0, 0, 0]) {
    const v = this.bodyInterface.GetLinearVelocity(bodyID);
    out[0] = v.GetX();
    out[1] = v.GetY();
    out[2] = v.GetZ();
    return out;
  }

  getBodyLinearVelocity(bodyID, out = [0, 0, 0]) {
    return this.getLinearVelocity(bodyID, out);
  }

  getAngularVelocity(bodyID, out = [0, 0, 0]) {
    const w = this.bodyInterface.GetAngularVelocity(bodyID);
    out[0] = w.GetX();
    out[1] = w.GetY();
    out[2] = w.GetZ();
    return out;
  }

  getBodyAngularVelocity(bodyID, out = [0, 0, 0]) {
    return this.getAngularVelocity(bodyID, out);
  }

  setPositionAndRotation(bodyID, pos, rot) {
    const p = this.rv3(0, pos[0], pos[1], pos[2]);
    const q = this.quat(0, rot[0], rot[1], rot[2], rot[3]);
    this.bodyInterface.SetPositionAndRotation(bodyID, p, q, this.Jolt.EActivation_Activate);
  }

  addForce(bodyID, force, point = null) {
    const f = this.v3(0, force[0], force[1], force[2]);
    if (point) {
      const pt = this.rv3(0, point[0], point[1], point[2]);
      this.bodyInterface.AddForce(bodyID, f, pt, this.Jolt.EActivation_Activate);
    } else {
      this.bodyInterface.AddForce(bodyID, f);
    }
  }

  addImpulse(bodyID, impulse, point = null) {
    const imp = this.v3(0, impulse[0], impulse[1], impulse[2]);
    if (point) {
      const pt = this.rv3(0, point[0], point[1], point[2]);
      this.bodyInterface.AddImpulse(bodyID, imp, pt, this.Jolt.EActivation_Activate);
    } else {
      this.bodyInterface.AddImpulse(bodyID, imp);
    }
  }

  addTorque(bodyID, torque) {
    const tq = this.v3(0, torque[0], torque[1], torque[2]);
    this.bodyInterface.AddTorque(bodyID, tq);
  }

  // --- Constraints (SwingTwist, Point, Distance) ---

  createSwingTwistConstraint(bodyID1, bodyID2, options = {}) {
    const Jolt = this.Jolt;
    const s = new Jolt.SwingTwistConstraintSettings();
    const p1 = options.pos1 || [0, 0, 0];
    const p2 = options.pos2 || [0, 0, 0];
    const twist1 = options.twist1 || [0, 0, 1];
    const twist2 = options.twist2 || [0, 0, 1];
    const plane1 = options.plane1 || [0, 1, 0];
    const plane2 = options.plane2 || [0, 1, 0];

    s.mPosition1 = this.v3(1, p1[0], p1[1], p1[2]);
    s.mPosition2 = this.v3(2, p2[0], p2[1], p2[2]);
    s.mTwistAxis1 = this.v3(3, twist1[0], twist1[1], twist1[2]);
    s.mTwistAxis2 = this.v3(4, twist2[0], twist2[1], twist2[2]);
    s.mPlaneAxis1 = this.v3(5, plane1[0], plane1[1], plane1[2]);
    s.mPlaneAxis2 = this.v3(6, plane2[0], plane2[1], plane2[2]);

    s.mNormalHalfConeAngle = options.normalHalfConeAngle ?? 0.35;
    s.mPlaneHalfConeAngle = options.planeHalfConeAngle ?? 0.35;
    s.mTwistMinAngle = options.twistMinAngle ?? -0.25;
    s.mTwistMaxAngle = options.twistMaxAngle ?? 0.25;

    const body1 = this.physicsSystem.GetBodyLockInterface().TryGetBody(bodyID1);
    const body2 = this.physicsSystem.GetBodyLockInterface().TryGetBody(bodyID2);
    const constraint = s.Create(body1, body2);
    this.physicsSystem.AddConstraint(constraint);
    this.activeConstraints.add(constraint);
    this.activeConstraintSettings.add(s);
    this.constraintToSettings.set(constraint, s);
    return constraint;
  }

  // --- Raycast API (Zero Allocations) ---

  raycast(origin, direction, maxDistance = 100) {
    const ray = this.scratchRay;
    ray.mOrigin.Set(origin[0], origin[1], origin[2]);
    ray.mDirection.Set(
      direction[0] * maxDistance,
      direction[1] * maxDistance,
      direction[2] * maxDistance
    );

    this.rayCollector.Reset();
    this.narrowPhaseQuery.CastRay(
      ray,
      this.raySettings,
      this.rayCollector,
      this.bpRayFilter,
      this.objRayFilter,
      this.bodyFilter,
      this.shapeFilter
    );

    if (this.rayCollector.HadHit()) {
      const hit = this.rayCollector.mHit;
      const frac = hit.mFraction;
      const hitX = origin[0] + direction[0] * maxDistance * frac;
      const hitY = origin[1] + direction[1] * maxDistance * frac;
      const hitZ = origin[2] + direction[2] * maxDistance * frac;
      return {
        hit: true,
        fraction: frac,
        distance: maxDistance * frac,
        point: [hitX, hitY, hitZ],
        bodyID: hit.mBodyID,
      };
    }
    return null;
  }

  // --- Pluggable WrenchGenerator Interface ---

  addWrenchGenerator(generator) {
    this.wrenchGenerators.add(generator);
  }

  removeWrenchGenerator(generator) {
    this.wrenchGenerators.delete(generator);
  }

  // --- Stepping ---

  /**
   * Execute exact single fixed step (dt = 1/60)
   */
  fixedStep() {
    if (this.isDisposed) return;
    for (const wg of this.wrenchGenerators) {
      wg.applyWrenches(this, this.fixedDt);
    }
    this.jolt.Step(this.fixedDt, 1);
    this.stepCount++;
  }

  /**
   * Accumulator step for variable frame rates
   */
  step(dt) {
    if (this.isDisposed) return;
    this.accumulator += Math.min(dt, 0.25); // Clamp against huge lag spikes
    let subSteps = 0;
    while (this.accumulator >= this.fixedDt && subSteps < this.maxSubSteps) {
      this.fixedStep();
      this.accumulator -= this.fixedDt;
      subSteps++;
    }
  }

  // --- Diagnostics & Net Handles ---

  getNetLiveHandles() {
    return this.activeBodies.size + this.activeShapes.size + this.activeConstraints.size;
  }

  getTotalMemory() {
    return this.Jolt.JoltInterface?.prototype?.sGetTotalMemory
      ? this.Jolt.JoltInterface.prototype.sGetTotalMemory()
      : 0;
  }

  getFreeMemory() {
    return this.Jolt.JoltInterface?.prototype?.sGetFreeMemory
      ? this.Jolt.JoltInterface.prototype.sGetFreeMemory()
      : 0;
  }

  // --- Dispose Lifecycle ---

  destroyConstraint(constraint) {
    if (this.activeConstraints.has(constraint)) {
      this.physicsSystem.RemoveConstraint(constraint);
      this.activeConstraints.delete(constraint);
    }
    const settings = this.constraintToSettings.get(constraint);
    if (settings) {
      this.activeConstraintSettings.delete(settings);
      this.Jolt.destroy(settings);
      this.constraintToSettings.delete(constraint);
    }
  }

  destroyBody(bodyID) {
    if (this.activeBodies.has(bodyID)) {
      this.bodyInterface.RemoveBody(bodyID);
      this.bodyInterface.DestroyBody(bodyID);
      this.activeBodies.delete(bodyID);
      const shape = this.bodyToShape.get(bodyID);
      if (shape) {
        this.activeShapes.delete(shape);
        this.bodyToShape.delete(bodyID);
      }
    }
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // 0. Remove active constraints & destroy settings
    for (const c of this.activeConstraints) {
      this.physicsSystem.RemoveConstraint(c);
    }
    this.activeConstraints.clear();

    for (const s of this.activeConstraintSettings) {
      this.Jolt.destroy(s);
    }
    this.activeConstraintSettings.clear();

    // 1. Destroy all active bodies
    for (const bodyID of this.activeBodies) {
      this.bodyInterface.RemoveBody(bodyID);
      this.bodyInterface.DestroyBody(bodyID);
    }
    this.activeBodies.clear();

    // 2. Destroy shapes
    this.activeShapes.clear();

    // 3. Destroy pre-allocated scratch pool & raycast helpers
    for (const v of this.scratchVec3) this.Jolt.destroy(v);
    for (const v of this.scratchRVec3) this.Jolt.destroy(v);
    for (const q of this.scratchQuat) this.Jolt.destroy(q);
    this.Jolt.destroy(this.scratchRay);
    this.Jolt.destroy(this.raySettings);
    this.Jolt.destroy(this.bpRayFilter);
    this.Jolt.destroy(this.objRayFilter);
    this.Jolt.destroy(this.bodyFilter);
    this.Jolt.destroy(this.shapeFilter);
    this.Jolt.destroy(this.rayCollector);

    this.scratchVec3.length = 0;
    this.scratchRVec3.length = 0;
    this.scratchQuat.length = 0;

    // 4. Destroy Jolt instance & interfaces
    this.Jolt.destroy(this.jolt);
    this.Jolt.destroy(this.bpLayerNonMoving);
    this.Jolt.destroy(this.bpLayerMoving);

    // 5. Clear wrench generators
    this.wrenchGenerators.clear();
  }
}
