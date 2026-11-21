import { JoltWorld } from '../src/core/physics/jolt-world.js';

async function runAcceptanceTest() {
  console.log('============================================================');
  console.log('TASK 3.1: JOLTPHYSICS WASM WRAPPER ACCEPTANCE TEST SUITE');
  console.log('============================================================\n');

  // -------------------------------------------------------------
  // Test 1: 50-Cycle Lifecycle & Memory Leak Test
  // -------------------------------------------------------------
  console.log('Test 1: Running 50-cycle create/destroy test (20 bodies per cycle)...');
  const initialMemory = process.memoryUsage().heapUsed;

  for (let cycle = 1; cycle <= 50; cycle++) {
    const world = await JoltWorld.create();

    // 1. Ground collider
    world.createGroundBox([50, 1, 50], [0, -1, 0]);

    // 2. 15° ramp
    world.createRamp(10, 4, 0.5, 15, [0, 0, 0]);

    // 3. 18 dynamic bodies (total 20 bodies in scene)
    for (let i = 0; i < 9; i++) {
      world.createDynamicSphere(0.3 + i * 0.02, 5 + i, [i * 0.5 - 2, 3 + i * 0.4, 0]);
      world.createDynamicBox([0.2, 0.2, 0.2], 8 + i, [i * 0.5 - 2, 6 + i * 0.4, 0]);
    }

    const liveHandlesBefore = world.getNetLiveHandles();
    if (liveHandlesBefore < 20) {
      throw new Error(`Cycle ${cycle}: Expected >= 20 live handles, got ${liveHandlesBefore}`);
    }

    // Step 5 frames
    for (let s = 0; s < 5; s++) {
      world.fixedStep();
    }

    // Explicit Dispose
    world.dispose();

    const liveHandlesAfter = world.getNetLiveHandles();
    if (liveHandlesAfter !== 0) {
      throw new Error(`Cycle ${cycle}: Expected 0 net live handles after dispose, got ${liveHandlesAfter}`);
    }

    if (cycle % 10 === 0) {
      console.log(`  ✓ Cycle ${cycle}/50 complete (0 net live handles)`);
    }
  }

  const finalMemory = process.memoryUsage().heapUsed;
  const memoryDeltaMB = (finalMemory - initialMemory) / (1024 * 1024);
  console.log(`✓ 50-cycle leak test PASSED: 0 net leaked handles across all cycles (Heap delta: ${memoryDeltaMB.toFixed(2)} MB)\n`);

  // -------------------------------------------------------------
  // Test 2: Raycast API Verification
  // -------------------------------------------------------------
  console.log('Test 2: Verifying Raycast API...');
  {
    const world = await JoltWorld.create();
    world.createGroundBox([100, 1, 100], [0, -1, 0]); // Ground top is at y = 0
    world.createDynamicSphere(0.5, 10, [0, 10, 0]);

    // Raycast straight down from [0, 5, 0] toward ground
    const hitFloor = world.raycast([0, 5, 0], [0, -1, 0], 20);
    if (!hitFloor || Math.abs(hitFloor.point[1] - 0.0) > 1e-4) {
      throw new Error(`Raycast to floor failed: expected y=0, got ${hitFloor?.point}`);
    }
    console.log(`  ✓ Floor raycast hit at y=${hitFloor.point[1].toFixed(5)} m (distance=${hitFloor.distance.toFixed(4)} m)`);

    // Raycast up toward sphere
    const hitSphere = world.raycast([0, 5, 0], [0, 1, 0], 20);
    // Sphere is at y=10 with radius 0.5 -> bottom at y=9.5
    if (!hitSphere || Math.abs(hitSphere.point[1] - 9.5) > 1e-3) {
      throw new Error(`Raycast to sphere failed: expected y=9.5, got ${hitSphere?.point}`);
    }
    console.log(`  ✓ Sphere raycast hit at y=${hitSphere.point[1].toFixed(5)} m (distance=${hitSphere.distance.toFixed(4)} m)`);

    // Raycast that misses
    const hitMiss = world.raycast([0, 5, 0], [1, 0, 0], 20);
    if (hitMiss !== null) {
      throw new Error('Raycast expected null on miss, but got hit');
    }
    console.log('  ✓ Miss raycast correctly returned null');

    world.dispose();
    console.log('✓ Raycast API PASSED\n');
  }

  // -------------------------------------------------------------
  // Test 3: 600-Step Determinism Drop Test (< 1e-6 m tolerance)
  // -------------------------------------------------------------
  console.log('Test 3: Running 600-step (10.0 s) Determinism Test across 2 fresh initializations...');

  async function runSim() {
    const world = await JoltWorld.create();
    world.createGroundBox([100, 1, 100], [0, -1, 0]);
    world.createRamp(10, 4, 0.5, 15, [0, 0, 2]);

    const s1 = world.createDynamicSphere(0.4, 8.5, [0.5, 4.0, 2.0]);
    const b1 = world.createDynamicBox([0.25, 0.25, 0.25], 12.0, [-0.5, 5.0, 2.0]);

    for (let step = 0; step < 600; step++) {
      world.fixedStep();
    }

    const posS1 = world.getPosition(s1);
    const rotS1 = world.getRotation(s1);
    const posB1 = world.getPosition(b1);
    const rotB1 = world.getRotation(b1);

    world.dispose();

    return { posS1, rotS1, posB1, rotB1 };
  }

  const runA = await runSim();
  const runB = await runSim();

  let maxPosDelta = 0;
  for (let i = 0; i < 3; i++) {
    maxPosDelta = Math.max(maxPosDelta, Math.abs(runA.posS1[i] - runB.posS1[i]));
    maxPosDelta = Math.max(maxPosDelta, Math.abs(runA.posB1[i] - runB.posB1[i]));
  }

  let maxRotDelta = 0;
  for (let i = 0; i < 4; i++) {
    maxRotDelta = Math.max(maxRotDelta, Math.abs(runA.rotS1[i] - runB.rotS1[i]));
    maxRotDelta = Math.max(maxRotDelta, Math.abs(runA.rotB1[i] - runB.rotB1[i]));
  }

  console.log(`  Run A Sphere final pos: [${runA.posS1.map(v => v.toFixed(7)).join(', ')}]`);
  console.log(`  Run B Sphere final pos: [${runB.posS1.map(v => v.toFixed(7)).join(', ')}]`);
  console.log(`  Run A Box final pos:    [${runA.posB1.map(v => v.toFixed(7)).join(', ')}]`);
  console.log(`  Run B Box final pos:    [${runB.posB1.map(v => v.toFixed(7)).join(', ')}]`);
  console.log(`  Max position delta:     ${maxPosDelta.toExponential(4)} m`);
  console.log(`  Max rotation delta:     ${maxRotDelta.toExponential(4)}`);

  const TOLERANCE = 1e-6;
  if (maxPosDelta > TOLERANCE || maxRotDelta > TOLERANCE) {
    throw new Error(`Determinism test FAILED: delta exceeds ${TOLERANCE}`);
  }

  console.log(`✓ 600-step determinism test PASSED: max delta < 1e-6 m (${maxPosDelta.toExponential(3)} m)\n`);

  console.log('============================================================');
  console.log('ALL TASK 3.1 ACCEPTANCE TESTS PASSED (100%)');
  console.log('============================================================');
}

runAcceptanceTest().catch(err => {
  console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
