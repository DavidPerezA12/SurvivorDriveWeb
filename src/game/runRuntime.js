import * as THREE from "three";

import {
  createChunkScheduler,
  fillChunkQueue,
  getChunksToSpawn,
  getChunkTemplate,
  resolveRandomKind,
} from "./chunks.js";
import {
  initAudio,
  updateEngineSound,
  playSkidSound,
  stopSkidSound,
  updateAudioVolume,
  beep,
} from "./audio.js";
import { obstacleHitsCar, randomLane, collidesWithCar } from "./collision.js";
import {
  biomeCatalog,
  objectiveCatalog,
  equipmentCatalog,
  encounterConfig,
  pickupCatalog,
  upgradeCatalog,
} from "./content.js";
import { createEventManager, tryTriggerEvent, updateEvent, getEventEffects } from "./events.js";
import { registerRunResult, unlockCity } from "./persistence.js";
import { routeForBiome } from "./routes.js";
import {
  choosePickupType,
  createRunState,
  resolveCollision,
  resolvePickup,
  spawnEncounter,
  updateRunProgression,
} from "./simulation.js";
import {
  clearAllPools,
  createBurst,
  createShockwave,
  spawnDustMote,
  spawnDustBurst,
  spawnSkidMark,
  spawnAtmosphericDebris,
  removePoolEntry as disposePoolEntry,
  getCachedGeometry,
} from "./spawn.js";
import { getZoneByDistance } from "./zones.js";
import { weightedKey } from "./random.js";
import { flashMessage, shakeState, triggerShake, updateHUD } from "../ui/hudUpdates.js";
import { createFootprintMarker, createMileMarker } from "../world/environment.js";
import { isDesertZone } from "../world/environmentRuntime.js";
import { createObstacleMesh } from "../world/meshes/obstacles.js";
import { createOverheadMesh } from "../world/meshes/overheads.js";
import { createPickupMesh } from "../world/meshes/pickups.js";
import { createPropMesh } from "../world/meshes/props.js";
import { moveWorld } from "../world/movement.js";
import { disposeObjectResources } from "../renderer/resources.js";

const CHUNK_Z_BASE = 52;
const PERFORMANCE_LIMITS = {
  low: { particles: 70, props: 18, obstacles: 28, pickups: 16, projectiles: 14 },
  medium: { particles: 95, props: 24, obstacles: 34, pickups: 18, projectiles: 18 },
  high: { particles: 130, props: 32, obstacles: 44, pickups: 24, projectiles: 24 },
};

export function createRunRuntime({
  world,
  state,
  saveData,
  hud,
  totalRouteDistance = 7.2,
  environmentRuntime,
  saveState,
  setRoute,
}) {
  let chunkScheduler = createChunkScheduler();
  let lastZoneId = null;
  let hudUpdateTimer = 0;

  function resetRun(biome = "desert") {
    world.run = createRunState(
      saveData,
      biome,
      biomeCatalog,
      objectiveCatalog,
      equipmentCatalog,
      upgradeCatalog,
    );

    const zone = getZoneByDistance(world.run.distance);
    lastZoneId = zone.id;

    world.eventManager = createEventManager();
    world.eventEffects = null;
    chunkScheduler = createChunkScheduler();
    world.chunkScheduler = chunkScheduler;

    world.environment.biome = zone.id;
    world.environment.targetWeather = isDesertZone(zone.id) ? "clear" : "smog";
    world.environment.weather = "clear";
    world.environment.weatherStrength = 0;
    world.environment.weatherTimer = 18;

    clearAllPools(world);
    fillChunkQueue(chunkScheduler, Math.max(0, world.run.distance * 1000 - 1));
    environmentRuntime.syncBiomePresentation();
    stopSkidSound(world);
    updateHUD();
  }

  function startRun(biome = "desert", forceReset = false) {
    const targetBiome = biome === "city" && !state.unlocks.city ? "desert" : biome;

    if (forceReset || !world.run || world.route === "gameover" || world.run.biome !== targetBiome) {
      resetRun(targetBiome);
    }

    setRoute(routeForBiome(targetBiome));
    flashMessage(targetBiome === "city" ? "Sector avanzado cargado" : "Run iniciada");
    initAudio(world);
    updateAudioVolume(state, world);
    updateHUD();
    beep(world, 180, 0.05, "triangle");
  }

  function transitionRunToBiome(nextBiome) {
    const run = world.run;
    if (!run || run.biome === nextBiome) return;

    run.biome = nextBiome;
    run.biomeLabel = biomeCatalog[nextBiome].label;
    run.objective = objectiveCatalog[nextBiome].title;
    run.objectiveSummary = objectiveCatalog[nextBiome].summary;
    run.objectiveTarget = biomeCatalog[nextBiome].completionKm;
    run.objectiveProgress = 0;
    run.cityTransitionArmed = false;
    run.cityTransitionDone = true;
    run.invulnerable = Math.max(run.invulnerable, 1.1);
    run.obstacleTimer = 0.9;
    run.pickupTimer = 0.55;

    const zone = getZoneByDistance(run.distance);
    world.environment.targetWeather = isDesertZone(zone.id) ? "clear" : "smog";
    world.environment.weatherTimer = Math.min(world.environment.weatherTimer, 8);

    setRoute(routeForBiome(nextBiome));
    updateHUD();
  }

  function finishRun(victory = false) {
    if (!world.run) return;

    registerRunResult(saveData, world.run);

    if (world.run.biome === "city" || victory) {
      unlockCity(saveData);
    }

    saveState();

    if (hud?.summary) {
      hud.summary.textContent = victory
        ? `${world.run.endReason} Recorriste ${world.run.distance.toFixed(1)} km, eliminaste ${world.run.kills} raiders y aseguraste ${world.run.coins} coins.`
        : `${world.run.endReason || "El casco cedio bajo la presion del wasteland."} Recorriste ${world.run.distance.toFixed(1)} km, eliminaste ${world.run.kills} raiders y juntaste ${world.run.coins} coins.`;
    }

    setRoute("gameover");
  }

  function updateCinematic(dt) {
    if (!world.car) return;

    const t = performance.now() * 0.00015;
    const menuPose = world.route === "menu";
    const targetCarX = menuPose ? 4.2 : 0;
    const targetLookX = menuPose ? 3.1 : 0;
    const cameraBaseX = menuPose ? 6.8 : 0;
    const cameraBaseY = menuPose ? 5.2 : 6.0;
    const cameraBaseZ = menuPose ? -9.5 : -11.5;

    world.camera.position.x = cameraBaseX + Math.sin(t) * (menuPose ? 0.9 : 2.5);
    world.camera.position.y = cameraBaseY + Math.sin(t * 0.7) * 0.2;
    world.camera.position.z = cameraBaseZ;
    world.camera.lookAt(targetLookX, 1.2, 8);
    world.car.position.x += (targetCarX - world.car.position.x) * dt * 4;
    world.car.rotation.z += (0 - world.car.rotation.z) * dt * 5;
    world.car.rotation.y = Math.sin(t * 2.4) * 0.04;

    moveWorld(world, dt, 0.35);
  }

  function updateRun(dt) {
    const run = world.run;
    if (!run || !world.car) return;

    const previousDistanceM = run.distance * 1000;
    const zoneBeforeMove = getZoneByDistance(run.distance);
    updateEvents(dt, zoneBeforeMove);

    const effects = world.eventEffects ?? {};
    const input = readInput();
    applyVehiclePhysics(run, input, dt, zoneBeforeMove, effects);
    updateCarVisuals(run, input, dt);
    updateParticlesAndAudio(run, dt);
    updateCamera(run, dt);

    run.distance += run.speed * dt * 0.1;
    run.invulnerable = Math.max(0, run.invulnerable - dt);

    const zone = getZoneByDistance(run.distance);
    if (zone.id !== lastZoneId) {
      lastZoneId = zone.id;
      flashMessage(zone.name);
    }

    updateThreat(run, zone);
    updateProgression(run);
    spawnRuntimeContent(run, dt, zone, previousDistanceM);
    updateEntities(dt);
    moveWorld(world, dt, 1);

    if (run.distance >= totalRouteDistance) {
      run.endReason = "Atravesaste la ruta completa y alcanzaste el refugio.";
      finishRun(true);
      return;
    }

    hudUpdateTimer -= dt;
    if (hudUpdateTimer <= 0) {
      hudUpdateTimer = 0.1;
      updateHUD();
    }
  }

  function updateEvents(dt, zone) {
    const eventMgr = world.eventManager;
    updateEvent(eventMgr, dt, world.run.distance);

    const canTrigger = world.run.distance > 0.35 && !eventMgr.activeEvent;
    if (canTrigger && eventMgr.eventCooldown <= 0) {
      const triggered = tryTriggerEvent(eventMgr, world.run.distance);
      if (triggered) handleTriggeredEvent(triggered, zone);
    }

    world.eventEffects = getEventEffects(eventMgr) ?? {};
  }

  function readInput() {
    let rawSteer = (Number(world.input.left) - Number(world.input.right)) * 0.72;
    let rawThrottle = world.input.accel ? 1 : 0;
    let rawBrake = world.input.brake ? 1 : 0;

    const gamepad = navigator.getGamepads?.()?.[0] ?? null;
    if (gamepad) {
      const gx = gamepad.axes?.[0] ?? 0;
      const lt = gamepad.buttons?.[6]?.value ?? 0;
      const rt = gamepad.buttons?.[7]?.value ?? 0;

      if (rawSteer === 0 && Math.abs(gx) > 0.14) {
        rawSteer = THREE.MathUtils.clamp(-gx, -1, 1);
      }
      if (!world.input.accel && rt > 0.08) rawThrottle = rt;
      if (!world.input.brake && lt > 0.08) rawBrake = lt;
    }

    if (world.input.touch.active) {
      rawSteer = -world.input.touch.dx;
      rawThrottle = Math.max(rawThrottle, Math.max(0, -world.input.touch.dy));
      rawBrake = Math.max(rawBrake, Math.max(0, world.input.touch.dy));
    }

    return { rawSteer, rawThrottle, rawBrake, gamepad };
  }

  function applyVehiclePhysics(run, input, dt, zone, effects) {
    const steerLag = 1 - Math.exp(-dt * (run.grounded ? 12 : 7));
    const throttleLag = 1 - Math.exp(-dt * 5);

    run.steerSmoothed = THREE.MathUtils.lerp(run.steerSmoothed, input.rawSteer, steerLag);
    run.throttleSmoothed = THREE.MathUtils.lerp(
      run.throttleSmoothed,
      input.rawThrottle - input.rawBrake,
      throttleLag,
    );

    const throttleInput = run.throttleSmoothed;
    const targetFactor =
      throttleInput >= 0
        ? THREE.MathUtils.lerp(0.58, 1.0, throttleInput)
        : THREE.MathUtils.lerp(0.58, 0.24, -throttleInput);

    run.speedFactor = THREE.MathUtils.lerp(run.speedFactor, targetFactor, 1 - Math.exp(-dt * 2));

    if (run.nitroTimer > 0) run.nitroTimer = Math.max(0, run.nitroTimer - dt);

    const nitroMultiplier = run.nitroTimer > 0 ? 1.5 : 1;
    const eventSpeed = effects.speedMult ?? 1;
    const zoneSpeed = zone.speedLimit ?? 1;
    run.speed = run.baseSpeed * run.speedFactor * nitroMultiplier * eventSpeed * zoneSpeed;

    const weatherHandling = run.weatherHandling ?? 1;
    const eventHandling = effects.handlingMult ?? 1;
    const baseTraction =
      run.traction *
      (0.96 + 0.04 * (1 - (run.threat / 100) * 0.35)) *
      weatherHandling *
      eventHandling;
    const steer = run.steerSmoothed * run.handling * weatherHandling * eventHandling;
    const lateralLoad = Math.abs(run.steerSmoothed) * (0.55 + run.speedFactor * 0.45);
    const targetGrip = THREE.MathUtils.clamp(1.0 - lateralLoad * 0.26, 0.56, 1.0);

    run.gripFactor = THREE.MathUtils.lerp(run.gripFactor, targetGrip, 1 - Math.exp(-dt * 8));

    const wasSkidding = run.skidding;
    run.skidding = run.gripFactor < 0.58 && Math.abs(run.lateralVel) > 1.8 && run.grounded;

    if (run.skidding && !wasSkidding) playSkidSound(world);
    if (!run.skidding && wasSkidding) stopSkidSound(world);

    const centering = run.x * 1.35;
    const cornering = 3.35;
    const traction = baseTraction * run.gripFactor;
    const laneHalfWidth = Math.max(5.2, (zone.roadWidth ?? 14) * 0.5 + 0.5);
    const lateralDamping = run.skidding ? 1.15 : 2.85;

    run.lateralVel +=
      (steer * cornering * 4.8 * traction - centering - run.lateralVel * lateralDamping) * dt;

    if (effects.windStrength) {
      run.lateralVel +=
        Math.sin(performance.now() * 0.0012 + run.distance * 2.7) * effects.windStrength * dt;
    }

    run.lateralVel *= Math.max(0, 1 - dt * (run.skidding ? 0.06 : 0.16));
    run.lateralVel = THREE.MathUtils.clamp(run.lateralVel, -7.5, 7.5);
    run.x += run.lateralVel * dt;

    if (run.x <= -laneHalfWidth) {
      run.x = -laneHalfWidth;
      run.lateralVel = Math.max(0, run.lateralVel);
    } else if (run.x >= laneHalfWidth) {
      run.x = laneHalfWidth;
      run.lateralVel = Math.min(0, run.lateralVel);
    }

    updateJumpAndSuspension(run, dt, throttleInput);
  }

  function updateJumpAndSuspension(run, dt, throttleInput) {
    if (!run.grounded) {
      run.yVelocity -= 22 * dt;
      run.y += run.yVelocity * dt;

      if (run.y <= 0) {
        run.y = 0;
        run.yVelocity = 0;
        run.grounded = true;
        run.suspensionVel = -4.8;
        beep(world, 58, 0.06, "sine");
        if (run.skidding) spawnDustBurst(world, 6);
      }
    }

    if (run.grounded) {
      const suspStiffness = 180;
      const suspDamp = 18;

      run.suspensionVel += (-suspStiffness * run.suspensionY - suspDamp * run.suspensionVel) * dt;
      run.suspensionY += run.suspensionVel * dt;
      run.suspensionY = THREE.MathUtils.clamp(run.suspensionY, -0.18, 0.08);

      const targetPitch = throttleInput * -0.028 + (run.skidding ? 0.012 : 0);
      run.pitchAngle = THREE.MathUtils.lerp(run.pitchAngle, targetPitch, 1 - Math.exp(-dt * 6));
    } else {
      run.pitchAngle = THREE.MathUtils.lerp(run.pitchAngle, -run.yVelocity * 0.018, dt * 5);
    }
  }

  function updateCarVisuals(run, input, dt) {
    world.car.position.x = run.x;

    const roadShake = run.grounded ? (Math.random() - 0.5) * 0.012 * run.speed * 0.045 : 0;
    world.car.position.y = 0.1 + run.y + run.suspensionY + roadShake;

    const weatherHandling = run.weatherHandling ?? 1;
    const steer = run.steerSmoothed * run.handling * weatherHandling;
    const driftAngle = run.skidding ? run.lateralVel * 0.04 : 0;
    const targetRollZ = THREE.MathUtils.clamp(
      -steer * 0.055 - run.lateralVel * 0.022 - driftAngle,
      -0.18,
      0.18,
    );

    world.car.rotation.z = THREE.MathUtils.lerp(world.car.rotation.z, targetRollZ, dt * 3);
    world.car.rotation.x = THREE.MathUtils.lerp(
      world.car.rotation.x,
      run.grounded
        ? run.pitchAngle + (Math.random() - 0.5) * 0.004 * run.traction
        : -run.yVelocity * 0.018,
      dt * 3,
    );

    const targetYaw = THREE.MathUtils.clamp(
      steer * 0.03 + run.lateralVel * 0.012 + (run.skidding ? run.lateralVel * 0.018 : 0),
      -0.22,
      0.22,
    );
    world.car.rotation.y = THREE.MathUtils.lerp(world.car.rotation.y, targetYaw, dt * 4);

    for (const wheel of world.car.userData.wheels) {
      if (wheel.userData.roll) {
        wheel.userData.roll.rotation.x -= dt * run.speed * 1.1;
      } else {
        wheel.rotation.x -= dt * run.speed * 1.1;
      }

      if (wheel.userData.steerable) {
        const steerAngle = run.steerSmoothed * (0.42 + run.gripFactor * 0.12);
        wheel.rotation.y = THREE.MathUtils.lerp(wheel.rotation.y, steerAngle, dt * 6);
      }
    }

    if (world.car.userData.brakeLights) {
      const isBraking = world.input.brake || run.throttleSmoothed < -0.1 || input.rawBrake > 0.2;
      const targetBrakeIntensity = isBraking ? 15 : 0.5;
      world.car.userData.brakeLights.forEach((light) => {
        light.intensity = THREE.MathUtils.lerp(light.intensity, targetBrakeIntensity, dt * 10);
      });
    }
  }

  function updateParticlesAndAudio(run, dt) {
    const dustRate = run.grounded ? run.speed * 0.18 + (run.skidding ? run.speed * 0.65 : 0) : 0;
    if (canSpawnParticle() && Math.random() < dt * dustRate) spawnDustMote(world);
    if (canSpawnParticle(2) && run.skidding && Math.random() < dt * 5) spawnSkidMark(world);

    if (
      canSpawnParticle() &&
      run.grounded &&
      run.speedFactor > 0.3 &&
      Math.random() < dt * run.speedFactor * 3
    ) {
      spawnExhaustPuff(run);
    }

    if (
      canSpawnParticle() &&
      run.skidding &&
      Math.abs(run.lateralVel) > 3 &&
      Math.random() < dt * 3
    ) {
      spawnSkidSparks(run);
    }

    if (canSpawnParticle() && run.speedFactor > 0.85 && Math.random() < dt * 5) {
      spawnSpeedStreak(run);
    }

    updateEngineSound(world, state, run.speedFactor, run.skidding);
    pushLooseParticlesFromCar(run, dt);
    rumbleGamepad(run);
  }

  function spawnExhaustPuff(run) {
    const exhaustColor = run.speedFactor > 0.85 ? "#222" : "#444";
    const exhaust = new THREE.Mesh(
      getCachedGeometry("exhaust_puff", () => new THREE.SphereGeometry(0.1, 4, 4)),
      new THREE.MeshBasicMaterial({
        color: exhaustColor,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    exhaust.scale.setScalar(0.6 + Math.random() * 0.8);

    const side = Math.random() > 0.5 ? 1 : -1;
    exhaust.position.set(
      run.x + side * 0.55,
      run.y + 0.25 + Math.random() * 0.15,
      -0.8 - Math.random() * 0.3,
    );
    exhaust.userData = {
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        0.4 + Math.random() * 0.5,
        -2 - Math.random() * 2,
      ),
      fade: 1.2 + Math.random() * 0.8,
      grow: 1.5,
    };

    world.scene.add(exhaust);
    world.particles.push(exhaust);
  }

  function spawnSkidSparks(run) {
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i += 1) {
      const spark = new THREE.Mesh(
        getCachedGeometry("skid_spark", () => new THREE.BoxGeometry(0.03, 0.03, 0.03)),
        new THREE.MeshBasicMaterial({
          color: "#ffaa44",
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
        }),
      );
      const side = Math.random() > 0.5 ? 1 : -1;
      spark.position.set(run.x + side * 0.9, 0.1, 0.2 + Math.random() * 0.3);
      spark.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 4 + side * -1.5,
          2 + Math.random() * 4,
          -run.speed * 0.3 + Math.random() * 2,
        ),
        fade: 2.5,
        gravity: true,
      };
      world.scene.add(spark);
      world.particles.push(spark);
    }
  }

  function spawnSpeedStreak(run) {
    const streak = new THREE.Mesh(
      getCachedGeometry("speed_streak", () => new THREE.BoxGeometry(0.05, 0.05, 1)),
      new THREE.MeshBasicMaterial({
        color: "#fff",
        transparent: true,
        opacity: 0.3,
      }),
    );
    streak.scale.z = 2 + Math.random() * 4;
    streak.position.set(
      run.x + (Math.random() - 0.5) * 3,
      run.y + 0.5 + (Math.random() - 0.5) * 1.5,
      5 + Math.random() * 5,
    );
    streak.userData = { vz: -80, life: 0.15, fade: 5 };
    world.scene.add(streak);
    world.particles.push(streak);
  }

  function pushLooseParticlesFromCar(run, dt) {
    world.particles.forEach((particle) => {
      if (particle.userData.vx === undefined) return;

      const dx = particle.position.x - run.x;
      const dz = particle.position.z - 1.2;
      const distSq = dx * dx + dz * dz;
      if (distSq <= 0.001 || distSq >= 16) return;

      const distance = Math.sqrt(distSq);
      const force = (1 - distance / 4) * dt * run.speed * 0.5;
      particle.userData.vx += (dx / distance) * force;
      particle.userData.vy += force * 0.5;
      particle.userData.vz += force * 0.2;
    });
  }

  function rumbleGamepad(run) {
    const gamepad = navigator.getGamepads?.()?.[0] ?? null;
    if (!gamepad?.vibrationActuator || !run.skidding) return;

    try {
      void gamepad.vibrationActuator.playEffect("dual-rumble", {
        duration: 80,
        strongMagnitude: 0.08,
        weakMagnitude: 0.22,
      });
    } catch {
      // Optional hardware feedback only.
    }
  }

  function updateCamera(run, dt) {
    const roadShake = run.grounded ? (Math.random() - 0.5) * 0.012 * run.speed * 0.045 : 0;
    const camSwayXTarget = run.lateralVel * 0.05;
    run.camSwayXSmoothed = THREE.MathUtils.lerp(
      run.camSwayXSmoothed,
      camSwayXTarget,
      1 - Math.exp(-dt * 4),
    );

    const camSwayY = roadShake * 3 + run.suspensionY * 0.25;
    const camFovTarget = run.skidding ? 61.2 : 60;
    const nextFov = THREE.MathUtils.lerp(world.camera.fov, camFovTarget, dt * 2);
    if (Math.abs(nextFov - world.camera.fov) > 0.01) {
      world.camera.fov = nextFov;
      world.camera.updateProjectionMatrix();
    }
    world.camera.position.x += (run.camSwayXSmoothed - world.camera.position.x) * dt * 2.5;
    world.camera.position.y += (6.2 + run.y * 0.35 + camSwayY - world.camera.position.y) * dt * 2.5;
    world.camera.position.z += (-11.5 - world.camera.position.z) * dt * 2.5;

    if (shakeState.timer > 0) {
      shakeState.timer -= dt;
      const shakeAmount = shakeState.intensity * (shakeState.timer / 0.25);
      world.camera.position.x -= (Math.random() - 0.5) * shakeAmount * 0.4;
      world.camera.position.y -= (Math.random() - 0.5) * shakeAmount * 0.3;
      if (shakeState.timer <= 0) shakeState.intensity = 0;
    }

    world.camera.lookAt(run.camSwayXSmoothed * 0.15, 1.18 + run.y * 0.18, 7.4);
  }

  function updateThreat(run, zone) {
    run.threat = THREE.MathUtils.clamp(
      run.distance * 4.5 +
        zone.difficulty * 20 +
        (run.weatherThreat ?? 0) +
        run.kills * (zone.threatScaleKills ?? 2.5),
      0,
      zone.threatCap ?? 100,
    );
  }

  function updateProgression(run) {
    const progression = updateRunProgression(run, biomeCatalog);
    if (!progression.shouldEnterCity) return;

    unlockCity(saveData);
    saveState();
    flashMessage("Entrando en zona militar");
    transitionRunToBiome("city");
  }

  function spawnRuntimeContent(run, dt, zone, previousDistanceM) {
    const currentDistanceM = run.distance * 1000;
    fillChunkQueue(chunkScheduler, currentDistanceM);

    const chunksToSpawn = getChunksToSpawn(chunkScheduler, previousDistanceM, currentDistanceM);
    for (const chunk of chunksToSpawn) {
      const chunkZone = getZoneByDistance(chunk.distanceStart / 1000);
      spawnChunkTemplate(chunk.templateKey, chunkZone, CHUNK_Z_BASE);
    }

    run.propTimer = (run.propTimer || 0) - dt;
    if (run.propTimer <= 0) {
      if (world.propPool.length < getPerformanceLimits().props) spawnProp(zone);
      run.propTimer = randomRange(0.5, 1.1);
    }

    run.obstacleTimer -= dt;
    if (run.obstacleTimer <= 0) {
      if (chunksToSpawn.length === 0 || Math.random() < 0.35) {
        spawnObstacle(zone);
      }
      run.obstacleTimer = randomRange(
        zone.obstacles.spawnIntervalMin,
        zone.obstacles.spawnIntervalMax,
      );
    }

    run.overheadTimer = (run.overheadTimer || 0) - dt;
    if (run.overheadTimer <= 0) {
      spawnOverhead(zone);
      run.overheadTimer = 4 + Math.random() * 6;
    }

    run.pickupTimer -= dt;
    if (run.pickupTimer <= 0) {
      if (chunksToSpawn.length === 0 || Math.random() < 0.4) {
        spawnPickup(zone);
      }
      run.pickupTimer = randomRange(zone.pickups.spawnIntervalMin, zone.pickups.spawnIntervalMax);
    }

    const debrisRate = world.eventEffects?.particleSpawn === "dust_storm" ? 3 : 1.4;
    if (canSpawnParticle() && Math.random() < dt * debrisRate) {
      spawnAtmosphericDebris(world, zone.id);
    }
  }

  function getPerformanceLimits() {
    return PERFORMANCE_LIMITS[state.options.quality] ?? PERFORMANCE_LIMITS.medium;
  }

  function canSpawnParticle(extraSlots = 1) {
    return world.particles.length + extraSlots <= getPerformanceLimits().particles;
  }

  function randomRange(min = 0, max = min) {
    return min + Math.random() * Math.max(0, max - min);
  }

  function normalizePropKind(kind) {
    const aliases = {
      barrel: "pipeline",
      cactus: "dead_bush",
      cone: "concrete_barrier",
      crate: "tent",
      debris_pile: "rock",
      dune: "rock",
      pole: "power_pole",
      sandbag: "concrete_barrier",
      sign: "billboard",
      wrecked_car: "wreckage",
    };

    return aliases[kind] ?? kind ?? "rock";
  }

  function spawnPropAt(kind, x, z, y = 0) {
    const prop = createPropMesh(normalizePropKind(kind), world.assets.models);
    prop.position.set(x, y, z);
    return prop;
  }

  function spawnProp(zone = getZoneByDistance(world.run?.distance ?? 0)) {
    const run = world.run;
    const currentInterval = Math.floor(run.distance * 10);

    if (run.lastMileMarker !== currentInterval) {
      run.lastMileMarker = currentInterval;

      const marker = createMileMarker(currentInterval / 10);
      marker.position.set(-6.5, 0, 150);
      world.scene.add(marker);
      world.propPool.push(marker);
    }

    const kind = normalizePropKind(weightedKey(zone.props, "rock"));
    const side = Math.random() > 0.5 ? 1 : -1;
    const zDist = 120 + Math.random() * 80;
    const xDist = (kind === "castle" ? 28 + Math.random() * 24 : 18 + Math.random() * 55) * side;
    const prop = spawnPropAt(kind, xDist, zDist);

    if (kind === "building") {
      prop.scale.set(1 + Math.random() * 2, 1 + Math.random() * 3, 1 + Math.random() * 2);
    } else if (kind === "tree") {
      prop.scale.set(0.8 + Math.random(), 0.8 + Math.random() * 1.5, 0.8 + Math.random());
    } else {
      prop.scale.set(1 + Math.random() * 2, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }

    prop.rotation.y = Math.random() * Math.PI * 2;
    world.scene.add(prop);
    world.propPool.push(prop);
  }

  function spawnOverhead(zone = getZoneByDistance(world.run?.distance ?? 0)) {
    const group = createOverheadMesh(zone.id);
    world.scene.add(group);
    world.overheadPool ??= [];
    world.overheadPool.push(group);
  }

  function resolveChunkLaneX(slot, zone) {
    const jitter = slot.xJitter ? randomRange(-slot.xJitter, slot.xJitter) : 0;
    const roadHalfWidth = Math.max(2.5, (zone.roadWidth ?? 14) * 0.5 - 0.85);
    return THREE.MathUtils.clamp(
      (slot.x ?? randomLane(zone.lanes)) + jitter,
      -roadHalfWidth,
      roadHalfWidth,
    );
  }

  function resolveChunkPropX(slot) {
    const jitter = slot.xJitter ? randomRange(-slot.xJitter, slot.xJitter) : 0;
    if (slot.x != null) return slot.x + jitter;
    return (slot.side === "left" ? -1 : 1) * randomRange(8, 16) + jitter;
  }

  function spawnChunkTemplate(
    templateKey,
    zone = getZoneByDistance(world.run?.distance ?? 0),
    zBase = 48,
  ) {
    const template = getChunkTemplate(templateKey);
    if (!template) return;

    for (const slot of template.obstacleSlots ?? []) {
      const kind = resolveRandomKind(slot.kind, zone, zone.obstacles.weights);
      if (!kind || kind === "none") continue;
      spawnObstacleAt(kind, resolveChunkLaneX(slot, zone), zBase + (slot.z ?? 0));
    }

    for (const slot of template.pickupSlots ?? []) {
      const kind = resolveRandomKind(slot.kind, zone, zone.pickups.weights);
      if (!kind || kind === "none") continue;
      spawnPickupAt(kind, resolveChunkLaneX(slot, zone), zBase + (slot.z ?? 0), 1.2);
    }

    for (const slot of template.propSlots ?? []) {
      const kind = normalizePropKind(resolveRandomKind(slot.kind, zone, zone.props));
      const prop = spawnPropAt(kind, resolveChunkPropX(slot), zBase + (slot.z ?? 0));
      prop.rotation.y = Math.random() * Math.PI * 2;
      world.scene.add(prop);
      world.propPool.push(prop);
    }
  }

  function spawnBarrierWall(zone, z = 64) {
    const lanes = zone.lanes?.length ? zone.lanes : [-4.2, -1.4, 1.4, 4.2];
    const gapIndex = Math.floor(Math.random() * lanes.length);
    const barrierKind =
      zone.id === "military" || zone.id === "refuge" ? "military_barrier" : "barrier";

    lanes.forEach((laneX, index) => {
      if (index === gapIndex) return;
      spawnObstacleAt(barrierKind, laneX, z + Math.random() * 5);
    });
  }

  function handleTriggeredEvent(triggeredEvent, zone) {
    const { eventId, event } = triggeredEvent;
    const effects = event.effects ?? {};

    flashMessage(event.hudMessage ?? event.name);
    beep(world, 120, 0.08, "triangle");

    if (eventId === "gas_station") {
      spawnChunkTemplate("gas_station", zone, 52);
    } else if (eventId === "dark_tunnel") {
      spawnChunkTemplate("tunnel", zone, 54);
    } else if (eventId === "military_checkpoint") {
      spawnChunkTemplate("military_checkpoint_chunk", zone, 50);
    } else if (eventId === "cut_road") {
      spawnChunkTemplate("barricade_row", zone, 50);
    } else if (eventId.startsWith("chase")) {
      spawnChunkTemplate("ambush_alley", zone, 50);
    }

    if (effects.spawnBarrierWall) {
      spawnBarrierWall(zone, 58);
    }

    for (let i = 0; i < (effects.spawnChaser ?? 0); i += 1) {
      const chaser = spawnObstacleAt("raider", randomLane(zone.lanes), -15 - i * 8);
      if (chaser) {
        chaser.userData.isChaser = true;
        chaser.userData.damage = effects.chaserDamage ?? chaser.userData.damage;
        chaser.userData.shotCooldown = effects.chaserShootInterval ?? chaser.userData.shotCooldown;
      }
    }

    for (let i = 0; i < (effects.spawnFuelPickups ?? 0); i += 1) {
      spawnPickupAt("fuel", randomLane(zone.lanes), 42 + i * 8, 1.2);
    }

    for (let i = 0; i < (effects.spawnRepairPickups ?? 0); i += 1) {
      spawnPickupAt("repair", randomLane(zone.lanes), 46 + i * 10, 1.2);
    }

    for (let i = 0; i < (effects.spawnBarriers ?? 0); i += 1) {
      spawnObstacleAt("military_barrier", randomLane(zone.lanes), 44 + i * 7);
    }

    for (let i = 0; i < (effects.spawnTowers ?? 0); i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      spawnObstacleAt("tower", side * randomRange(5, 6.5), 54 + i * 14);
    }

    for (let i = 0; i < (effects.spawnMines ?? 0); i += 1) {
      spawnObstacleAt("mine", randomLane(zone.lanes), 46 + i * 6);
    }
  }

  function spawnObstacle(zone = getZoneByDistance(world.run?.distance ?? 0)) {
    const kind = spawnEncounter(world.run, zone.id, encounterConfig);
    if (!kind || kind === "none") return null;

    const x =
      kind === "tower"
        ? (4 + Math.random() * 2) * (Math.random() > 0.5 ? -1 : 1)
        : randomLane(zone.lanes);

    return spawnObstacleAt(kind, x, 38 + Math.random() * 18);
  }

  function spawnObstacleAt(kind, x, z) {
    if (!kind || kind === "none") return null;
    if (world.obstaclePool.length >= getPerformanceLimits().obstacles) return null;

    const obstacle = createObstacleMesh(kind, world.assets.models);
    obstacle.castShadow = true;
    obstacle.receiveShadow = true;
    obstacle.position.set(x, obstacle.userData.height, z);

    if (obstacle.userData.isEnemy) {
      obstacle.userData.laneTarget = obstacle.position.x;
    }

    applyObstacleOrientation3D(obstacle, kind);
    obstacle.userData.marker = createFootprintMarker(obstacle, kind);

    world.scene.add(obstacle);
    world.scene.add(obstacle.userData.marker);
    world.obstaclePool.push(obstacle);

    return obstacle;
  }

  function applyObstacleOrientation3D(obstacle, kind) {
    if (kind === "tower") {
      obstacle.rotation.set(0, Math.random() * Math.PI * 2, 0);
      return;
    }

    if (kind === "barrier") {
      obstacle.rotation.set(0, (Math.random() - 0.5) * 0.08, 0);
      return;
    }

    if (kind === "raider") {
      obstacle.rotation.set(0, Math.PI, 0);
      return;
    }

    if (kind === "mutant") {
      obstacle.rotation.set(0, Math.PI + (Math.random() - 0.5) * 0.4, 0);
      return;
    }

    if (kind === "ramp") {
      obstacle.rotation.set(0, Math.PI, 0);
      return;
    }

    if (kind === "wreck") {
      obstacle.rotation.set(
        (Math.random() - 0.5) * 0.08,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.08,
      );
      return;
    }

    if (kind === "scrap") {
      obstacle.rotation.set(
        (Math.random() - 0.5) * 0.35,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.25,
      );
      return;
    }

    obstacle.rotation.set(0, Math.random() * Math.PI * 2, 0);
  }

  function spawnPickup(zone = getZoneByDistance(world.run?.distance ?? 0)) {
    const type = choosePickupType(world.run, zone.id, encounterConfig);

    spawnPickupAt(type, randomLane(zone.lanes), 34 + Math.random() * 18, 1.2 + Math.random() * 0.7);
  }

  function spawnPickupAt(type, x, z, y = 1.2) {
    if (world.pickupPool.length >= getPerformanceLimits().pickups) return null;

    const group = createPickupMesh(type, pickupCatalog, world.assets.models, y);
    group.position.set(x, y, z);

    world.scene.add(group);
    world.pickupPool.push(group);
    return group;
  }

  function removeObstacle(obstacle) {
    disposePoolEntry(world, "obstaclePool", obstacle);
  }

  function transformToDebris(obstacle) {
    world.obstaclePool = world.obstaclePool.filter((entry) => entry !== obstacle);

    if (obstacle.userData.marker) {
      world.scene.remove(obstacle.userData.marker);
      disposeObjectResources(obstacle.userData.marker);
      obstacle.userData.marker = null;
    }

    obstacle.userData.vx = (Math.random() - 0.5) * 15;
    obstacle.userData.vy = 8 + Math.random() * 12;
    obstacle.userData.vz = 15 + Math.random() * 20;
    obstacle.userData.rvx = (Math.random() - 0.5) * 8;
    obstacle.userData.rvy = (Math.random() - 0.5) * 8;
    obstacle.userData.rvz = (Math.random() - 0.5) * 8;
    obstacle.userData.life = 2.0;

    world.debrisPool.push(obstacle);
  }

  function destroyObstacle(obstacle, rewardPlayer = false) {
    const impactPoint = obstacle.position.clone();

    createBurst(
      world,
      impactPoint,
      obstacle.userData.isEnemy ? "#ff6d5e" : "#ff8b5e",
      obstacle.userData.isEnemy ? 18 : 12,
    );
    createShockwave(
      world,
      impactPoint,
      obstacle.userData.isEnemy ? "#ff6d5e" : "#ff8b5e",
      0.55,
      2.4,
      0.24,
    );

    if (rewardPlayer && obstacle.userData.isEnemy && world.run) {
      world.run.kills += 1;
      world.run.coins += obstacle.userData.rewardCoins ?? 0;
      world.run.ammo = Math.min(
        world.run.ammoMax,
        world.run.ammo + (obstacle.userData.rewardAmmo ?? 0),
      );

      if (Math.random() < 0.45) {
        spawnPickupAt(
          Math.random() > 0.5 ? "ammo" : "repair",
          obstacle.position.x,
          obstacle.position.z,
          1.1,
        );
      }
    }

    transformToDebris(obstacle);
  }

  function spawnEnemyProjectile(obstacle) {
    if (world.projectilePool.length >= getPerformanceLimits().projectiles) return;

    const projectile = new THREE.Mesh(
      getCachedGeometry("enemy_projectile", () => new THREE.SphereGeometry(0.16, 10, 10)),
      new THREE.MeshBasicMaterial({
        color: "#ffb36a",
        transparent: true,
        opacity: 0.95,
      }),
    );
    const gunY = obstacle.position.y + (obstacle.userData.projectileY ?? 1.05);

    projectile.position.set(obstacle.position.x, gunY, obstacle.position.z - 0.8);
    projectile.userData = {
      speed: 24 + Math.random() * 8,
      drift: (Math.random() - 0.5) * 1.4,
      damage: 7 + Math.round(Math.random() * 3),
    };

    world.scene.add(projectile);
    world.projectilePool.push(projectile);
    createBurst(world, projectile.position, "#ffb36a", 3);
  }

  function updateEntities(dt) {
    const run = world.run;
    const speed = run.speed * dt;
    let anyChaserBehind = false;

    world.obstaclePool = world.obstaclePool.filter((obstacle) => {
      const isChaser = obstacle.userData.isChaser === true;
      const isEnemy = obstacle.userData.isEnemy === true;

      if (isChaser && obstacle.position.z < 0) anyChaserBehind = true;

      let moveMult = isEnemy ? 0.85 : 1.0;
      if (isChaser) {
        if (obstacle.position.z < -5) moveMult = -0.2;
        else if (obstacle.position.z < 1) moveMult = 0.5;
        else moveMult = 1.02;
      }

      obstacle.position.z -= speed * moveMult;

      if (isEnemy || isChaser) {
        updateEnemyObstacle(obstacle, run, dt);
      } else if (obstacle.userData.obstacleSpin === "scrap") {
        obstacle.rotation.y += dt * 0.55;
        obstacle.rotation.x += dt * 0.06;
      }

      if (obstacle.userData.marker) {
        const marker = obstacle.userData.marker;
        marker.position.x = obstacle.position.x;
        marker.position.z = obstacle.position.z;
        marker.rotation.y = obstacle.rotation.y;
      }

      if ((!isChaser && obstacle.position.z < -12) || (isChaser && obstacle.position.z < -60)) {
        removeObstacle(obstacle);
        return false;
      }

      return handleObstacleCollision(obstacle, run, dt);
    });

    if (hud?.raiderWarning) {
      hud.raiderWarning.style.display = anyChaserBehind ? "flex" : "none";
    }

    updateDebris(speed, dt);
    updatePickups(speed, run, dt);
    updateParticles(dt);
    updateProjectiles(run, dt);

    if (run.health <= 0) {
      finishRun(false);
      beep(world, 55, 0.18, "square");
    }
  }

  function updateEnemyObstacle(obstacle, run, dt) {
    const laneDiff = obstacle.userData.laneTarget - obstacle.position.x;
    obstacle.rotation.y = laneDiff * 0.15;
    obstacle.rotation.z = -laneDiff * 0.05;
    obstacle.userData.shotCooldown -= dt;

    if (Math.random() < dt * 0.8) {
      const zone = getZoneByDistance(run.distance);
      obstacle.userData.laneTarget = Math.random() > 0.3 ? run.x : randomLane(zone.lanes);
    }

    obstacle.position.x += (obstacle.userData.laneTarget - obstacle.position.x) * dt * 2.5;

    const sameLane = Math.abs(obstacle.position.x - run.x) < 1.4;
    const inRange = obstacle.position.z > -5 && obstacle.position.z < 30;

    if (sameLane && inRange && obstacle.userData.shotCooldown <= 0) {
      spawnEnemyProjectile(obstacle);
      obstacle.userData.shotCooldown = 1.1 + Math.random() * 1.5;
    }
  }

  function handleObstacleCollision(obstacle, run, dt) {
    const hit = obstacleHitsCar(obstacle, run);
    if (!hit) return true;

    if (obstacle.userData.isRamp) {
      if (run.grounded) {
        run.grounded = false;
        run.yVelocity = run.jumpPower * 1.15;
        run.speedFactor = Math.min(1, run.speedFactor + 0.12);
        createBurst(world, world.car.position, "#7af5b7", 4);
        flashMessage("Ramp!");
        beep(world, 320, 0.06, "triangle");
      }
      return true;
    }

    if (obstacle.userData.isOilSpill) {
      run.speedFactor = Math.max(0.2, run.speedFactor - dt * 2.5);
      run.lateralVel *= 0.95;
      if (Math.random() > 0.92) spawnSkidMark(world);
      return true;
    }

    if (obstacle.userData.isPothole) {
      if (run.grounded) {
        run.speedFactor *= 0.98;
        triggerShake(0.15);
        if (Math.random() > 0.8) beep(world, 60, 0.04, "sine");
      }
      return true;
    }

    if (obstacle.userData.obstacleSpin === "mine") {
      const damage = resolveCollision(run, obstacle.userData.damage || 40);
      flashMessage(`MINE! -${damage} hull`);
      triggerShake(2.0);
      createBurst(world, obstacle.position, "#ffaa00", 25);
      createShockwave(world, obstacle.position, "#ff4400", 0.8, 5, 0.3);
      beep(world, 50, 0.25, "sawtooth");
      destroyObstacle(obstacle, false);
      return false;
    }

    if (hit.isScrape) {
      handleScrapeCollision(obstacle, run, hit);
      return true;
    }

    if (obstacle.userData.isWall === true) {
      run.health = 0;
      run.endReason = "El coche impacto contra una estructura y quedo destrozado.";
      run.speedFactor = 0.001;
      run.lateralVel = 0;
      triggerShake(3.0);
      createBurst(world, obstacle.position, "#ffaa00", 22);
      createShockwave(world, obstacle.position, "#ff6600", 0.6, 4.5, 0.3);
      beep(world, 40, 0.28, "sawtooth");
      return true;
    }

    handleFrontalCollision(obstacle, run, hit);
    return false;
  }

  function handleScrapeCollision(obstacle, run, hit) {
    if (run.invulnerable <= 0) {
      const scrapeDamage = Math.max(1, Math.round((obstacle.userData.damage || 10) * 0.2));
      const appliedDamage = resolveCollision(run, scrapeDamage);
      flashMessage(`Roce lateral: -${appliedDamage} hull`);
      triggerShake(0.4);
      run.invulnerable = 0.3;
      createBurst(world, obstacle.position, "#ffcc00", 3);
      beep(world, 200, 0.05, "sine");
    }

    const pushDir = hit.signedDx !== 0 ? Math.sign(hit.signedDx) : run.lateralVel > 0 ? -1 : 1;
    run.lateralVel = -pushDir * (4 + run.speed * 0.1);
    run.speedFactor *= 0.95;
  }

  function handleFrontalCollision(obstacle, run, hit) {
    if (run.invulnerable <= 0) {
      const appliedDamage = resolveCollision(run, obstacle.userData.damage);
      flashMessage(`Impacto frontal: -${appliedDamage} hull`);
      triggerShake(1.2);
      createBurst(world, obstacle.position, "#ff7b54", 10);
      beep(world, 80, 0.09, "sawtooth");
    }

    const pushDirX = hit.signedDx !== 0 ? Math.sign(hit.signedDx) : run.lateralVel > 0 ? -1 : 1;
    run.x -= pushDirX * hit.xOverlap;
    obstacle.position.z += hit.zOverlap * 1.2;

    const knockStrength = 5 + run.speed * 0.12;
    if (Math.abs(run.lateralVel) < knockStrength) {
      run.lateralVel = -pushDirX * knockStrength;
    } else {
      run.lateralVel -= pushDirX * knockStrength * 0.6;
    }

    const laneHalfWidth = 5.2;
    if (run.x <= -laneHalfWidth) {
      run.x = -laneHalfWidth;
      run.lateralVel = Math.max(0, run.lateralVel);
    } else if (run.x >= laneHalfWidth) {
      run.x = laneHalfWidth;
      run.lateralVel = Math.min(0, run.lateralVel);
    }

    run.speedFactor *= 0.62 - (obstacle.userData.damage ?? 10) * 0.003;
    if (run.speedFactor < 0.24) run.speedFactor = 0.24;

    transformToDebris(obstacle);
  }

  function updateDebris(speed, dt) {
    world.debrisPool = world.debrisPool.filter((debris) => {
      debris.position.x += debris.userData.vx * dt;
      debris.position.y += debris.userData.vy * dt;
      debris.position.z += debris.userData.vz * dt - speed;
      debris.userData.vy -= 30 * dt;
      debris.rotation.x += debris.userData.rvx * dt;
      debris.rotation.y += debris.userData.rvy * dt;
      debris.rotation.z += debris.userData.rvz * dt;
      debris.userData.life -= dt;

      if (debris.position.y < -5 || debris.userData.life <= 0) {
        world.scene.remove(debris);
        disposeObjectResources(debris);
        return false;
      }

      return true;
    });
  }

  function updatePickups(speed, run, dt) {
    world.pickupPool = world.pickupPool.filter((pickup) => {
      pickup.position.z -= speed;

      const data = pickup.userData;
      data.bobTimer += dt * 3.5;
      pickup.position.y += Math.sin(data.bobTimer) * 0.005;
      pickup.rotation.y += dt * (data.spinSpeed || 2.2);

      if (pickup.position.z < -12) {
        world.scene.remove(pickup);
        disposeObjectResources(pickup);
        return false;
      }

      if (collidesWithCar(pickup.position.x, pickup.position.z, 0.95)(run)) {
        const pickupType = data.pickupType || data.type;
        const resolvedPickup = resolvePickup(run, pickupType, pickupCatalog);

        flashMessage(`${resolvedPickup?.label ?? data.label}`);

        const config = pickupCatalog[pickupType] || { color: "#ffffff" };
        createBurst(world, pickup.position, config.color, 12);
        beep(world, 320, 0.05, "triangle");
        world.scene.remove(pickup);
        disposeObjectResources(pickup);
        return false;
      }

      return true;
    });
  }

  function updateParticles(dt) {
    const maxParticles = getPerformanceLimits().particles;
    while (world.particles.length > maxParticles) {
      const particle = world.particles.shift();
      world.scene.remove(particle);
      disposeObjectResources(particle);
    }

    world.particles = world.particles.filter((particle) => {
      const data = particle.userData ?? {};

      if (data.kind === "shockwave") {
        return updateShockwaveParticle(particle, data, dt);
      }

      if (data.velocity) {
        particle.position.addScaledVector(data.velocity, dt);

        if (data.drag) {
          data.velocity.multiplyScalar(Math.max(0, 1 - data.drag * dt));
        }

        if (data.gravity) {
          data.velocity.y -= 18 * dt;
        }

        if (data.grow) {
          particle.scale.multiplyScalar(1 + dt * data.grow);
        }
      }

      if (particle.userData.vx !== undefined) {
        return updateLooseParticle(particle, dt);
      }

      particle.material.opacity -= dt * (data.fade ?? 1.25);

      if (particle.material.opacity <= 0) {
        world.scene.remove(particle);
        disposeObjectResources(particle);
        return false;
      }

      return true;
    });
  }

  function updateShockwaveParticle(particle, data, dt) {
    data.age += dt;

    const progress = data.age / data.lifetime;
    if (progress >= 1) {
      world.scene.remove(particle);
      disposeObjectResources(particle);
      return false;
    }

    const radius = THREE.MathUtils.lerp(data.start, data.end, progress);
    particle.scale.set(radius, radius, 1);
    particle.position.y += dt * 0.3;
    particle.material.opacity = (1 - progress) * 0.65;
    return true;
  }

  function updateLooseParticle(particle, dt) {
    particle.position.x += particle.userData.vx * dt;
    particle.position.y += particle.userData.vy * dt;
    particle.position.z += particle.userData.vz * dt;

    if (particle.userData.rv) {
      particle.rotation.x += particle.userData.rv.x * dt;
      particle.rotation.y += particle.userData.rv.y * dt;
      particle.rotation.z += particle.userData.rv.z * dt;
    }

    particle.userData.life -= dt;

    if (particle.userData.life <= 0 || particle.position.z < -20) {
      world.scene.remove(particle);
      disposeObjectResources(particle);
      return false;
    }

    return true;
  }

  function updateProjectiles(run, dt) {
    world.projectilePool = world.projectilePool.filter((projectile) => {
      projectile.position.z -= dt * projectile.userData.speed;
      projectile.position.x += projectile.userData.drift * dt;
      projectile.material.opacity -= dt * 0.12;

      if (
        collidesWithCar(
          projectile.position.x,
          projectile.position.z,
          0.45,
          projectile.position.y,
          0.9,
        )(run)
      ) {
        if (run.invulnerable <= 0) {
          run.health -= projectile.userData.damage;
          run.invulnerable = 0.45;
          flashMessage(`Disparo recibido: -${projectile.userData.damage} hull`);
          triggerShake(0.7);
          beep(world, 94, 0.05, "square");
        }

        world.scene.remove(projectile);
        disposeObjectResources(projectile);
        return false;
      }

      if (projectile.position.z < -10 || projectile.material.opacity <= 0.1) {
        world.scene.remove(projectile);
        disposeObjectResources(projectile);
        return false;
      }

      return true;
    });
  }

  return {
    resetRun,
    startRun,
    updateRun,
    updateCinematic,
    destroyObstacle,
  };
}
