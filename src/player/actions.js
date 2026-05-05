import * as THREE from "three";

import { flashMessage } from "../ui/hudUpdates.js";
import { beep } from "../game/audio.js";
import { firePulseTouchesObstacle } from "../game/collision.js";
import { createBurst, createShockwave, createMissileTrail } from "../game/spawn.js";

let runtime = {
  world: null,
  destroyObstacle: null,
};

export function configurePlayerActions({ world, destroyObstacle }) {
  runtime = { world, destroyObstacle };
}

export function tryJump() {
  const { world } = runtime;
  const run = world?.run;
  if (!run) return;

  if (!run.grounded || run.jumps <= 0) return;

  run.jumps -= 1;

  run.grounded = false;

  run.yVelocity = run.jumpPower;

  createBurst(world, world.car.position, "#7af5b7", 6);

  flashMessage("Salto activado");

  beep(world, 240, 0.05, "triangle");
}

export function useFire() {
  const { world, destroyObstacle } = runtime;
  const run = world?.run;
  if (!run || !destroyObstacle) return;

  if (run.fire <= 0) {
    flashMessage("Sin cargas de fuego");

    return;
  }

  if (run.ammo < 2) {
    flashMessage("Municion insuficiente");

    beep(world, 104, 0.04, "square");

    return;
  }

  run.fire -= 1;

  run.ammo = Math.max(0, run.ammo - 2);

  const radius = run.fireRadius;

  const remaining = [];

  const launchPoint = new THREE.Vector3(run.x, 1.1, 2.2);

  let destroyed = 0;

  createShockwave(world, launchPoint, "#ffb36a", 0.4, 2.8, 0.28);

  const fireReach = radius * 2.2;

  for (const obstacle of world.obstaclePool) {
    if (firePulseTouchesObstacle(obstacle, run, fireReach, 1.5)) {
      const impactPoint = obstacle.position.clone();

      createMissileTrail(world, launchPoint, impactPoint, "#ffb36a");

      destroyObstacle(obstacle, true);

      destroyed += 1;
    } else {
      remaining.push(obstacle);
    }
  }

  world.obstaclePool = remaining;

  world.projectilePool = world.projectilePool.filter((projectile) => {
    const dx = projectile.position.x - run.x;

    const dz = projectile.position.z - 1.5;

    if (Math.hypot(dx, dz) <= radius * 2.6) {
      createBurst(world, projectile.position, "#ffd59a", 4);

      world.scene.remove(projectile);

      return false;
    }

    return true;
  });

  if (destroyed === 0) {
    const missPoint = new THREE.Vector3(run.x, 1.1, 2.2 + radius * 4.4);

    createMissileTrail(world, launchPoint, missPoint, "#ffb36a");

    createShockwave(world, missPoint, "#ffb36a", 0.45, 1.7, 0.2);
  }

  createBurst(world, launchPoint, "#ffb36a", 18);

  flashMessage(destroyed > 0 ? `Pulso incendiario: ${destroyed} objetivos` : "Pulso incendiario");

  beep(world, 150, 0.08, "sawtooth");
}
