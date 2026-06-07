import { describe, expect, it } from 'vitest';
import { applyDamage } from '../src/game/damage';
import {
  canExplosionDestroy,
  createExplosionEntity,
  isCarInExplosion,
  isEntityInExplosion,
  isExplosiveObstacle
} from '../src/game/explosions';
import { applyPickup } from '../src/game/resources';
import {
  createDefaultProgression,
  createRunState,
  purchaseUpgrade
} from '../src/game/upgrades';
import { createChunk } from '../src/world/chunks';
import { ensureChunks } from '../src/world/chunks';
import { getDecisionRow } from '../src/world/spawnRules';
import { createCarState, updateCar } from '../src/entities/car';
import { collidesWithCar } from '../src/entities/collision';
import { screenInputToSteer } from '../src/core/input';
import { DIFFICULTY } from '../src/game/config';

describe('run resources', () => {
  it('caps health pickups at the maximum value', () => {
    const run = {
      ...createRunState(createDefaultProgression()),
      health: 94
    };

    expect(applyPickup(run, 'parts').health).toBe(run.maxHealth);
  });

  it('restores one jump charge with spare parts without exceeding the cap', () => {
    const run = {
      ...createRunState(createDefaultProgression()),
      jumpCharges: 0
    };
    const restored = applyPickup(run, 'parts');
    const capped = applyPickup({ ...restored, jumpCharges: restored.maxJumpCharges }, 'parts');

    expect(restored.jumpCharges).toBe(1);
    expect(capped.jumpCharges).toBe(capped.maxJumpCharges);
  });
});

describe('damage', () => {
  it('applies obstacle damage and ends destroyed runs', () => {
    const run = { ...createRunState(createDefaultProgression()), status: 'running' as const, health: 20 };

    const damaged = applyDamage(run, 'mine');

    expect(damaged.health).toBe(0);
    expect(damaged.status).toBe('ended');
  });
});

describe('upgrades', () => {
  it('spends scrap and increases an upgrade level', () => {
    const progression = {
      ...createDefaultProgression(),
      totalScrap: 100
    };

    const upgraded = purchaseUpgrade(progression, 'armor');

    expect(upgraded.totalScrap).toBeLessThan(progression.totalScrap);
    expect(upgraded.upgrades.armor).toBe(1);
  });

  it('gives higher tire upgrades extra jump capacity', () => {
    const base = createRunState(createDefaultProgression());
    const upgraded = createRunState({
      ...createDefaultProgression(),
      upgrades: { ...createDefaultProgression().upgrades, tires: 4 }
    });

    expect(upgraded.maxJumpCharges).toBeGreaterThan(base.maxJumpCharges);
    expect(upgraded.jumpCharges).toBe(upgraded.maxJumpCharges);
  });

  it('uses chassis upgrades to increase maximum health', () => {
    const base = createRunState(createDefaultProgression());
    const upgraded = createRunState({
      ...createDefaultProgression(),
      upgrades: { ...createDefaultProgression().upgrades, chassis: 3 }
    });

    expect(upgraded.maxHealth).toBeGreaterThan(base.maxHealth);
    expect(upgraded.health).toBe(upgraded.maxHealth);
  });
});

describe('car handling', () => {
  it('maps controls to screen direction with the chase camera perspective', () => {
    expect(screenInputToSteer(true, false)).toBe(1);
    expect(screenInputToSteer(false, true)).toBe(-1);
    expect(screenInputToSteer(false, false)).toBe(0);
    expect(screenInputToSteer(true, true)).toBe(0);
  });

  it('responds quickly and brakes lateral drift when steering is released', () => {
    const upgrades = createDefaultProgression().upgrades;
    const steered = updateCar(
      createCarState(),
      { steer: 1, jump: false, shoot: false },
      upgrades,
      0.18,
      0
    );
    const released = updateCar(
      steered,
      { steer: 0, jump: false, shoot: false },
      upgrades,
      0.18,
      0
    );

    expect(steered.x).toBeGreaterThan(0.9);
    expect(Math.abs(released.lateralVelocity)).toBeLessThan(Math.abs(steered.lateralVelocity) * 0.15);
  });

  it('stops pushing outward when it reaches the road edge', () => {
    const upgrades = createDefaultProgression().upgrades;
    const car = {
      ...createCarState(),
      x: 5,
      lateralVelocity: 6
    };

    const updated = updateCar(car, { steer: 1, jump: false, shoot: false }, upgrades, 0.2, 0);

    expect(updated.x).toBeLessThanOrEqual(5.1);
    expect(updated.lateralVelocity).toBe(0);
  });

  it('lets jumps clear low ground hazards but not tall blockers', () => {
    const jumpingCar = { x: 0, y: 1.2, lateralVelocity: 0, isJumping: true };

    expect(collidesWithCar(jumpingCar, obstacle('crack', 0, 0))).toBe(false);
    expect(collidesWithCar(jumpingCar, obstacle('mine', 0, 0))).toBe(false);
    expect(collidesWithCar(jumpingCar, obstacle('barrel', 0, 0))).toBe(false);
    expect(collidesWithCar(jumpingCar, obstacle('barricade', 0, 0))).toBe(true);
  });
});

describe('chunk generation', () => {
  it('keeps the opening stretch clear so a run starts readable', () => {
    const chunks = ensureChunks([], DIFFICULTY.visibleAheadM);
    const nearestEntityZ = Math.min(...chunks.flatMap((chunk) => chunk.entities.map((entity) => entity.position.z)));

    expect(nearestEntityZ).toBeGreaterThanOrEqual(DIFFICULTY.startingClearM);
  });

  it('limits encounter density so chunks have readable decisions', () => {
    for (let index = 0; index < 80; index += 1) {
      const chunk = createChunk(index, 20 + index * 28);
      const rows = new Map<number, number>();

      expect(chunk.entities.length).toBeLessThanOrEqual(4);

      for (const entity of chunk.entities) {
        const row = getDecisionRow(entity.position.z - chunk.startZ, chunk.length);
        rows.set(row, (rows.get(row) ?? 0) + 1);
      }

      for (const rowCount of rows.values()) {
        expect(rowCount).toBeLessThanOrEqual(2);
      }
    }
  });

  it('does not spawn fuel pickups because health is the only survival meter', () => {
    for (let index = 0; index < 80; index += 1) {
      const chunk = createChunk(index, 20 + index * 28);

      expect(chunk.entities.some((entity) => String(entity.type) === 'fuel')).toBe(false);
    }
  });

  it('keeps the first chunks sparse while the player reads the road', () => {
    for (let index = 0; index < 2; index += 1) {
      const chunk = createChunk(index, 20 + index * 28);
      const obstacleCount = chunk.entities.filter((entity) => entity.kind === 'obstacle').length;

      expect(obstacleCount).toBeLessThanOrEqual(1);
      expect(chunk.entities.length).toBeLessThanOrEqual(2);
    }
  });

  it('does not fully block every lane in the same decision row', () => {
    const blockers = new Set(['abandonedCar', 'barricade', 'crack']);

    for (let index = 0; index < 80; index += 1) {
      const chunk = createChunk(index, 20 + index * 28);
      const blockedByRow = new Map<number, number>();

      for (const entity of chunk.entities) {
        if (!blockers.has(String(entity.type))) {
          continue;
        }

        const row = getDecisionRow(entity.position.z - chunk.startZ, chunk.length);
        blockedByRow.set(row, (blockedByRow.get(row) ?? 0) + 1);
      }

      for (const blockedCount of blockedByRow.values()) {
        expect(blockedCount).toBeLessThan(3);
      }
    }
  });
});

describe('explosions', () => {
  it('marks barrels and mines as explosive hazards', () => {
    expect(isExplosiveObstacle('barrel')).toBe(true);
    expect(isExplosiveObstacle('mine')).toBe(true);
    expect(isExplosiveObstacle('barricade')).toBe(false);
  });

  it('destroys only tactical light obstacles in the blast radius', () => {
    const barrel = obstacle('barrel', 0, 0);
    const lightBarricade = obstacle('lightBarricade', 2.5, 0);
    const abandonedCar = obstacle('abandonedCar', 2.5, 0);
    const farZombie = obstacle('zombie', 8, 0);

    expect(canExplosionDestroy(lightBarricade)).toBe(true);
    expect(isEntityInExplosion(lightBarricade, barrel)).toBe(true);
    expect(canExplosionDestroy(abandonedCar)).toBe(false);
    expect(isEntityInExplosion(farZombie, barrel)).toBe(false);
  });

  it('lets jumps clear ground explosions', () => {
    const mine = obstacle('mine', 0, 0);

    expect(isCarInExplosion({ x: 0, y: 0, lateralVelocity: 0, isJumping: false }, mine)).toBe(true);
    expect(isCarInExplosion({ x: 0, y: 1.5, lateralVelocity: 0, isJumping: true }, mine)).toBe(false);
  });

  it('creates a short-lived explosion effect entity', () => {
    const effect = createExplosionEntity(obstacle('barrel', 0, 0));

    expect(effect.kind).toBe('effect');
    expect(effect.type).toBe('explosion');
    expect(effect.radius).toBeGreaterThan(3);
    expect(effect.lifetimeS).toBeGreaterThan(0);
  });
});

function obstacle(type: Parameters<typeof isExplosiveObstacle>[0], x: number, z: number) {
  return {
    id: `${type}-${x}-${z}`,
    kind: 'obstacle' as const,
    type,
    position: { x, y: 0.4, z },
    radius: 0.7
  };
}
