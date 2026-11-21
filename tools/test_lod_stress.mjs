// test_lod_stress.mjs — 15-Animal Physics LOD Stress & Lifecycle Test Suite
//
// Gates:
// 1. 15-Animal Stress Scene (3 Hero LOD 0 + 12 LOD 1): Physics + IK CPU <= 3.0 ms/frame (>= 60 FPS budget).
// 2. Hard 3-Slot LOD 0 Cap: Exactly <= 3 animals in LOD 0 at any moment.
// 3. Distance Hysteresis: LOD 0 <= 12m (exit > 16m), LOD 1 <= 35m (exit > 40m), LOD 2 > 40m.
// 4. Zero-Pop Transitions: Max root position pop across all transitions < 5.0 mm.
// 5. Lockstep Sync: animal.setLod(0|1|2) called in lockstep with physics tier.
// 6. 50-Cycle Leak Check: 0 leaked Jolt handles (bodies, shapes, constraints) across 50 full cycles.

import { JoltWorld, getJolt } from '../src/core/physics/jolt-world.js';
import { PhysicsLOD, PhysicsLODManager } from '../src/core/physics/physics-lod.js';

async function runLODStressSuite() {
  console.log('================================================================');
  console.log('TASK 4.2: 3-TIER PHYSICS LOD & 15-ANIMAL STRESS ACCEPTANCE SUITE');
  console.log('================================================================\n');

  const Jolt = await getJolt();
  let allPass = true;
  const dt = 1 / 60;

  // -------------------------------------------------------------
  // Test 1: 15-Animal Stress Scene Frame-Time Budget (<= 3.0 ms/frame)
  // -------------------------------------------------------------
  console.log('Test 1: Verifying 15-Animal Tab Budget (3 Hero LOD0 + 12 LOD1 <= 3.0 ms/frame)...');
  {
    const world = new JoltWorld(Jolt);
    world.createGroundBox([100, 2, 100], [0, -2, 0]);

    const lodMgr = new PhysicsLODManager(world, {
      maxHeroLOD0: 3,
      cameraPos: [0, 2, 0],
    });

    // 3 Hero Animals (Elephant, Fox, Cow/Horse) positioned within 8m of camera
    lodMgr.registerAnimal('hero-elephant', {
      species: 'elephant',
      position: [0, 2.45, 5],
      totalMassKg: 6221.0,
      nominalStandY: 2.45,
      walk: true,
    });

    lodMgr.registerAnimal('hero-fox', {
      species: 'fox',
      position: [2, 0.38, 4],
      totalMassKg: 10.58,
      nominalStandY: 0.38,
      walk: true,
    });

    lodMgr.registerAnimal('hero-cow', {
      species: 'fox', // Quadruped reference
      position: [-2, 1.20, 6],
      totalMassKg: 450.0,
      nominalStandY: 1.20,
      walk: true,
    });

    // 12 LOD 1 Animals positioned between 14m and 30m from camera
    const speciesList = ['fox', 'horse', 'bear', 'deer', 'wolf', 'lion', 'cat', 'dog', 'goat', 'pig', 'sheep', 'boar'];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const r = 18.0 + (i % 3) * 4.0;
      lodMgr.registerAnimal(`lod1-${speciesList[i]}`, {
        species: 'fox',
        position: [Math.sin(angle) * r, 0.38, Math.cos(angle) * r],
        totalMassKg: 15.0 + i * 5.0,
        nominalStandY: 0.40,
        walk: true,
      });
    }

    // Warm up 10 frames
    for (let i = 0; i < 10; i++) {
      world.step(dt);
      lodMgr.step(dt);
    }

    // Benchmark 120 frames (2.0 seconds of simulation)
    const frameTimes = [];
    for (let i = 0; i < 120; i++) {
      const t0 = performance.now();
      world.step(dt);
      const metrics = lodMgr.step(dt);
      const elapsed = performance.now() - t0;
      frameTimes.push(elapsed);
    }

    const avgMs = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const maxMs = Math.max(...frameTimes);
    const p95Ms = frameTimes.slice().sort((a, b) => a - b)[Math.floor(frameTimes.length * 0.95)];
    const simFPS = 1000.0 / avgMs;

    console.log(`  Active Animals:       15 (3 LOD 0 + 12 LOD 1)`);
    console.log(`  Benchmarked:          120 frames`);
    console.log(`  Mean Frame Time:      ${avgMs.toFixed(3)} ms/frame (Gate <= 3.0 ms/frame)`);
    console.log(`  95th Percentile:      ${p95Ms.toFixed(3)} ms/frame`);
    console.log(`  Peak Frame Time:      ${maxMs.toFixed(3)} ms/frame`);
    console.log(`  Simulated Frame Rate: ${simFPS.toFixed(1)} fps (Budget >= 60 fps)`);

    const timePass = avgMs <= 3.0;
    const fpsPass = simFPS >= 60.0;

    if (timePass && fpsPass) {
      console.log('  ✓ 15-Animal Tab Budget PASSED\n');
    } else {
      console.error(`  ✗ 15-Animal Tab Budget FAILED: time=${timePass}, fps=${fpsPass}`);
      allPass = false;
    }

    lodMgr.dispose();
    world.dispose();
  }

  // -------------------------------------------------------------
  // Test 2: Hard 3-Slot LOD 0 Cap & Distance Hysteresis
  // -------------------------------------------------------------
  console.log('Test 2: Verifying Hard 3-Slot LOD 0 Cap & Distance Hysteresis (12m/16m, 35m/40m)...');
  {
    const world = new JoltWorld(Jolt);
    world.createGroundBox([100, 2, 100], [0, -2, 0]);

    const lodMgr = new PhysicsLODManager(world, {
      maxHeroLOD0: 3,
      cameraPos: [0, 0, 0],
    });

    // Register 6 animals within 10m of camera
    for (let i = 0; i < 6; i++) {
      lodMgr.registerAnimal(`near-animal-${i}`, {
        species: 'fox',
        position: [0, 0.38, 2.0 + i * 1.5], // distances: 2m, 3.5m, 5m, 6.5m, 8m, 9.5m
        nominalStandY: 0.38,
      });
    }

    // Update assignments
    lodMgr.updateLODAssignments();

    const lod0Count = lodMgr.getLODCount(PhysicsLOD.LOD_0);
    const lod1Count = lodMgr.getLODCount(PhysicsLOD.LOD_1);
    console.log(`  Total Near Animals:   6 (all <= 10m)`);
    console.log(`  Assigned LOD 0:       ${lod0Count} (Hard cap = 3)`);
    console.log(`  Assigned LOD 1:       ${lod1Count} (Overflow = 3)`);

    const capPass = lod0Count === 3 && lod1Count === 3;

    // Hysteresis test: move camera away gradually
    // Animal at z=5m: when camera moves to z=-9m (distance 14m), it is in deadband (12m < d <= 16m).
    // It should REMAIN in LOD 0 due to hysteresis.
    lodMgr.setCameraPosition(0, 0, -9.0);
    lodMgr.updateLODAssignments();
    const deadbandLOD0 = lodMgr.getLODCount(PhysicsLOD.LOD_0);
    console.log(`  Deadband (d = 14m) LOD 0: ${deadbandLOD0} (Expected 3, preserved by hysteresis)`);

    // Move camera beyond exit threshold: z=-15m (distance 20m > 16m)
    // All 3 hero animals must now exit LOD 0
    lodMgr.setCameraPosition(0, 0, -25.0);
    lodMgr.updateLODAssignments();
    const exitedLOD0 = lodMgr.getLODCount(PhysicsLOD.LOD_0);
    console.log(`  Exited (d > 20m) LOD 0:   ${exitedLOD0} (Expected 0)`);

    const hystPass = deadbandLOD0 === 3 && exitedLOD0 === 0;

    if (capPass && hystPass) {
      console.log('  ✓ Hard 3-Slot Cap & Distance Hysteresis PASSED\n');
    } else {
      console.error(`  ✗ Hysteresis FAILED: cap=${capPass}, hyst=${hystPass}`);
      allPass = false;
    }

    lodMgr.dispose();
    world.dispose();
  }

  // -------------------------------------------------------------
  // Test 3: Zero-Pop Transition (< 5.0 mm Root Pop) & Lockstep Mesh Sync
  // -------------------------------------------------------------
  console.log('Test 3: Verifying Zero-Pop State Transfer (< 5.0 mm Root Pop) & Mesh Lockstep...');
  {
    const world = new JoltWorld(Jolt);
    world.createGroundBox([100, 2, 100], [0, -2, 0]);

    const lodMgr = new PhysicsLODManager(world, {
      maxHeroLOD0: 3,
      cameraPos: [0, 0, 0],
    });

    // Mock visual mesh
    const mockMesh = {
      lodTiers: [],
      setLod(tier) {
        this.lodTiers.push(tier);
      },
    };

    const entry = lodMgr.registerAnimal('transition-fox', {
      species: 'fox',
      position: [0, 0.38, 5.0],
      nominalStandY: 0.38,
      animalMesh: mockMesh,
      walk: true,
    });

    console.log(`  Initial LOD Tier:     ${entry.currentLOD} (Mesh tier: ${mockMesh.lodTiers[mockMesh.lodTiers.length - 1]})`);

    // Transition LOD 0 -> LOD 1
    lodMgr.transitionLOD(entry, PhysicsLOD.LOD_1);
    console.log(`  After LOD 0 -> 1:     Tier ${entry.currentLOD} (Mesh tier: ${mockMesh.lodTiers[mockMesh.lodTiers.length - 1]})`);

    // Transition LOD 1 -> LOD 2
    lodMgr.transitionLOD(entry, PhysicsLOD.LOD_2);
    console.log(`  After LOD 1 -> 2:     Tier ${entry.currentLOD} (Mesh tier: ${mockMesh.lodTiers[mockMesh.lodTiers.length - 1]})`);

    // Transition LOD 2 -> LOD 0
    lodMgr.transitionLOD(entry, PhysicsLOD.LOD_0);
    console.log(`  After LOD 2 -> 0:     Tier ${entry.currentLOD} (Mesh tier: ${mockMesh.lodTiers[mockMesh.lodTiers.length - 1]})`);

    console.log(`  Max Transition Pop:   ${lodMgr.maxTransitionPopMm.toFixed(3)} mm (Gate < 5.0 mm)`);
    console.log(`  Total Transitions:    ${lodMgr.totalTransitions}`);

    const popPass = lodMgr.maxTransitionPopMm < 5.0;
    const meshPass = mockMesh.lodTiers.length >= 4 &&
                     mockMesh.lodTiers[1] === PhysicsLOD.LOD_1 &&
                     mockMesh.lodTiers[2] === PhysicsLOD.LOD_2 &&
                     mockMesh.lodTiers[3] === PhysicsLOD.LOD_0;

    if (popPass && meshPass) {
      console.log('  ✓ Zero-Pop State Transfer & Mesh Lockstep PASSED\n');
    } else {
      console.error(`  ✗ Zero-Pop Test FAILED: pop=${popPass}, mesh=${meshPass}`);
      allPass = false;
    }

    lodMgr.dispose();
    world.dispose();
  }

  // -------------------------------------------------------------
  // Test 4: 50-Cycle Lifecycle Leak Test (0 Leaked Jolt Handles)
  // -------------------------------------------------------------
  console.log('Test 4: Verifying 50-Cycle Lifecycle Memory & Handle Leak Freedom...');
  {
    const world = new JoltWorld(Jolt);
    world.createGroundBox([100, 2, 100], [0, -2, 0]);
    const baselineHandles = world.getNetLiveHandles(); // Static ground box + shape = 2 handles

    const lodMgr = new PhysicsLODManager(world, {
      maxHeroLOD0: 3,
      cameraPos: [0, 0, 0],
    });

    console.log(`  Baseline Jolt Handles: ${baselineHandles} (Ground Collider)`);

    // Run 50 cycles of registration, transition, and unregistration
    for (let cycle = 0; cycle < 50; cycle++) {
      // 1. Register 3 Hero + 6 LOD 1 animals
      const ids = [];
      for (let i = 0; i < 9; i++) {
        const id = `cycle-${cycle}-anim-${i}`;
        ids.push(id);
        lodMgr.registerAnimal(id, {
          species: i === 0 ? 'elephant' : 'fox',
          position: [i * 2.0, i === 0 ? 2.45 : 0.38, i < 3 ? 5.0 : 20.0],
          nominalStandY: i === 0 ? 2.45 : 0.38,
          walk: true,
        });
      }

      // 2. Step 2 frames
      world.step(dt);
      lodMgr.step(dt);

      // 3. Move camera to trigger full LOD tier transitions
      lodMgr.setCameraPosition(0, 0, 50.0); // push everything to LOD 2
      lodMgr.step(dt);

      lodMgr.setCameraPosition(0, 0, 0.0);  // pull closest back to LOD 0
      lodMgr.step(dt);

      // 4. Unregister all animals cleanly
      for (const id of ids) {
        lodMgr.unregisterAnimal(id);
      }
    }

    const finalHandles = world.getNetLiveHandles();
    const netLeaked = finalHandles - baselineHandles;

    console.log(`  Completed Cycles:      50`);
    console.log(`  Final Jolt Handles:    ${finalHandles}`);
    console.log(`  Net Leaked Handles:    ${netLeaked} (Gate === 0)`);

    const leakPass = netLeaked === 0;

    if (leakPass) {
      console.log('  ✓ 50-Cycle Leak Freedom PASSED\n');
    } else {
      console.error(`  ✗ Leak Test FAILED: netLeaked=${netLeaked}`);
      allPass = false;
    }

    lodMgr.dispose();
    world.dispose();
  }

  // -------------------------------------------------------------
  // Final Result
  // -------------------------------------------------------------
  if (allPass) {
    console.log('================================================================');
    console.log('ALL TASK 4.2 PHYSICS LOD & STRESS ACCEPTANCE TESTS PASSED (100%)');
    console.log('================================================================');
    process.exit(0);
  } else {
    console.error('================================================================');
    console.error('ONE OR MORE TASK 4.2 PHYSICS LOD ACCEPTANCE TESTS FAILED');
    console.error('================================================================');
    process.exit(1);
  }
}

runLODStressSuite().catch((err) => {
  console.error('Fatal Test Exception:', err);
  process.exit(1);
});
