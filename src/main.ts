import './styles/main.css';
import { AudioEngine } from './audio/audioEngine';
import { bindInput, readInput } from './core/input';
import { GameLoop } from './core/gameLoop';
import { DIFFICULTY } from './game/config';
import { applyDamage, applyExplosionDamage } from './game/damage';
import {
  canExplosionDestroy,
  createExplosionEntity,
  isCarInExplosion,
  isEntityInExplosion,
  isExplosiveObstacle
} from './game/explosions';
import { applyPickup } from './game/resources';
import { finishRun, createRunState, purchaseUpgrade } from './game/upgrades';
import type { Entity, ObstacleKind, ProgressionState, ResourceKind } from './game/types';
import { distanceScore } from './game/scoring';
import { createCarState, updateCar } from './entities/car';
import { collidesWithCar, projectileHitsEntity } from './entities/collision';
import { ensureChunks, type RoadChunk } from './world/chunks';
import { GameScene } from './render/scene';
import { Hud } from './ui/hud';
import { loadProgression, saveProgression } from './save/storage';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root element.');
}

app.innerHTML = '<main class="game-shell"><div id="scene"></div><div id="ui"></div></main>';

const sceneRoot = document.querySelector<HTMLDivElement>('#scene');
const uiRoot = document.querySelector<HTMLDivElement>('#ui');

if (!sceneRoot || !uiRoot) {
  throw new Error('Failed to create game roots.');
}

let progression: ProgressionState = loadProgression();
let run = createRunState(progression);
let car = createCarState();
let chunks: RoadChunk[] = ensureChunks([], DIFFICULTY.visibleAheadM);
let entities: Entity[] = chunks.flatMap((chunk) => chunk.entities);
let runCommitted = false;
let jumpPressed = false;

const audio = new AudioEngine();
const scene = new GameScene(sceneRoot);
const disposeInput = bindInput(sceneRoot);

const hud = new Hud(uiRoot, {
  onStart: () => {
    audio.resume();
    audio.play('start');
    startRun();
  },
  onRestart: () => {
    run = createRunState(progression);
    car = createCarState();
    chunks = ensureChunks([], DIFFICULTY.visibleAheadM);
    entities = chunks.flatMap((chunk) => chunk.entities);
    runCommitted = false;
    jumpPressed = false;
    hud.invalidate();
  },
  onUpgrade: (key) => {
    const next = purchaseUpgrade(progression, key);

    if (next !== progression) {
      progression = next;
      saveProgression(progression);
      run = createRunState(progression);
      audio.resume();
      audio.play('upgrade');
      hud.invalidate();
    }
  }
});

const observer = new ResizeObserver(() => {
  scene.resize(sceneRoot.clientWidth, sceneRoot.clientHeight);
});
observer.observe(sceneRoot);

const loop = new GameLoop((deltaS) => {
  update(deltaS);
  scene.update(car, entities, run.distanceM, progression.upgrades, deltaS);
  scene.render();
  hud.render(run, progression);
});

loop.start();

window.addEventListener('beforeunload', () => {
  disposeInput();
  observer.disconnect();
  scene.dispose();
  loop.stop();
});

function startRun(): void {
  run = { ...createRunState(progression), status: 'running' };
  car = createCarState();
  chunks = ensureChunks([], DIFFICULTY.visibleAheadM);
  entities = chunks.flatMap((chunk) => chunk.entities);
  runCommitted = false;
  jumpPressed = false;
  hud.invalidate();
}

function update(deltaS: number): void {
  if (run.status !== 'running') {
    return;
  }

  const input = readInput();
  const speedTarget = Math.min(
    DIFFICULTY.maxSpeedMps,
    DIFFICULTY.baseSpeedMps + run.distanceM * DIFFICULTY.speedGainPerMeter
  );

  run = {
    ...run,
    speedMps: speedTarget,
    distanceM: run.distanceM + speedTarget * deltaS,
    score: distanceScore(run.distanceM),
    weaponCooldownS: Math.max(0, run.weaponCooldownS - deltaS),
    jumpTimeS: Math.max(0, run.jumpTimeS - deltaS),
    invulnerableS: Math.max(0, run.invulnerableS - deltaS)
  };

  if (input.jump && !jumpPressed && run.jumpTimeS <= 0 && run.jumpCharges > 0) {
    run = { ...run, jumpTimeS: 0.72, jumpCharges: run.jumpCharges - 1 };
  }
  jumpPressed = input.jump;

  if (input.shoot && run.weaponCooldownS <= 0 && run.ammo > 0) {
    run = {
      ...run,
      ammo: run.ammo - 1,
      weaponCooldownS: Math.max(0.16, 0.34 - progression.upgrades.weapon * 0.025)
    };
    entities.push(createProjectile(car.x));
    audio.play('shoot');
  }

  car = updateCar(car, input, progression.upgrades, deltaS, run.jumpTimeS);
  moveWorld(speedTarget * deltaS);
  handleCollisions();
  ensureWorld();

  if (run.status === 'ended') {
    commitRun();
  }
}

function moveWorld(distance: number): void {
  for (const entity of entities) {
    entity.position.z -= distance;

    if (entity.kind === 'projectile') {
      entity.position.z += distance * 2.45;
      if (entity.position.z > DIFFICULTY.visibleAheadM) {
        entity.destroyed = true;
      }
    }

    if (entity.kind === 'effect') {
      entity.lifetimeS = Math.max(0, (entity.lifetimeS ?? 0) - distance / Math.max(1, run.speedMps));
      entity.destroyed = entity.lifetimeS <= 0;
    }
  }

  for (const chunk of chunks) {
    chunk.startZ -= distance;
  }
}

function handleCollisions(): void {
  for (const projectile of entities.filter((entity) => entity.kind === 'projectile')) {
    for (const entity of entities) {
      if (!projectileHitsEntity(projectile, entity)) {
        continue;
      }

      const obstacle = entity.type as ObstacleKind;
      projectile.destroyed = true;

      if (isExplosiveObstacle(obstacle)) {
        detonate(entity, true);
        continue;
      }

      if (['lightBarricade', 'zombie'].includes(obstacle)) {
        entity.destroyed = true;
        run = { ...run, score: run.score + 80 };
      }
    }
  }

  for (const entity of entities) {
    if (!collidesWithCar(car, entity)) {
      continue;
    }

    if (entity.kind === 'pickup') {
      entity.collected = true;
      run = applyPickup(run, entity.type as ResourceKind);
      audio.play('pickup');
      continue;
    }

    if (entity.kind !== 'obstacle') {
      continue;
    }

    if (isExplosiveObstacle(entity.type)) {
      detonate(entity, false);
      continue;
    }

    entity.destroyed = entity.type === 'zombie' || entity.type === 'lightBarricade';
    run = applyDamage(run, entity.type as ObstacleKind);
    audio.play('crash');
  }

  entities = entities.filter(
    (entity) => entity.position.z > DIFFICULTY.cleanupBehindM && !entity.destroyed && !entity.collected
  );
}

function detonate(origin: Entity, awardScore: boolean): void {
  if (origin.destroyed) {
    return;
  }

  origin.destroyed = true;
  entities.push(createExplosionEntity(origin));
  audio.play('explosion');

  if (awardScore) {
    run = { ...run, score: run.score + 80 };
  }

  if (isCarInExplosion(car, origin)) {
    run = applyExplosionDamage(run);
  }

  const blastTargets = entities.filter(
    (entity) =>
      entity.id !== origin.id && canExplosionDestroy(entity) && isEntityInExplosion(entity, origin)
  );

  for (const entity of blastTargets) {
    if (isExplosiveObstacle(entity.type)) {
      detonate(entity, awardScore);
      continue;
    }

    entity.destroyed = true;
    if (awardScore) {
      run = { ...run, score: run.score + 80 };
    }
  }
}

function ensureWorld(): void {
  const farthest = Math.max(0, ...chunks.map((chunk) => chunk.startZ + chunk.length));
  chunks = ensureChunks(chunks, farthest + DIFFICULTY.visibleAheadM);
  const knownIds = new Set(entities.map((entity) => entity.id));

  for (const chunk of chunks) {
    for (const entity of chunk.entities) {
      if (!knownIds.has(entity.id)) {
        entities.push(entity);
      }
    }
  }
}

function commitRun(): void {
  if (runCommitted) {
    return;
  }

  progression = finishRun(progression, run);
  saveProgression(progression);
  runCommitted = true;
  hud.invalidate();
}

function createProjectile(x: number): Entity {
  return {
    id: `projectile-${crypto.randomUUID()}`,
    kind: 'projectile',
    type: 'bullet',
    position: { x, y: 0.8, z: 2.2 },
    radius: 0.22
  };
}
