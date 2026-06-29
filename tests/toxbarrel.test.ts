import { describe, expect, it } from 'vitest';
import { createSim, type SimState } from '../src/sim';
import { resolveShots, resolveCollisions, resolveGas } from '../src/sim/collision';
import { chunkAt, safeLane } from '../src/sim';
import { GAS_TUNING, SPAWN_TUNING, laneCenterX } from '../src/content/tuning';

/**
 * The toxic barrel ruptures (shot or rammed) into a lingering gas cloud that denies
 * its lane, distinct from the explosive barrel's instant chain-clear (docs/DESIGN.md
 * → roster). These lock the headless contract; the cloud feel is judged in the browser.
 */

function cruising(lane = 1): SimState {
  const s = createSim(1);
  s.car.lateralX = laneCenterX(lane);
  s.distance = 10;
  s.car.health = 1;
  return s;
}

/** A live gas cloud over `lane` at `forward`. */
function putGas(s: SimState, lane: number, forward: number, life: number = GAS_TUNING.lifeTicks): void {
  s.gas.push({ lane, x: laneCenterX(lane), forward, life, maxLife: GAS_TUNING.lifeTicks });
}

describe('toxic barrel rupture', () => {
  it('a shot ruptures the drum into a gas cloud (no chain, no fireball)', () => {
    const s = cruising();
    s.car.ammo = 10;
    s.car.fireCooldown = 0;
    s.hazards.push({ kind: 'toxbarrel', lane: 1, x: laneCenterX(1), forward: 24, hit: false });
    resolveShots(s, { steer: 0, jump: false, fire: true });
    expect(s.hazards[0].hit).toBe(true);
    expect(s.gas).toHaveLength(1);
    expect(s.gas[0].lane).toBe(1);
    expect(s.events.some((e) => e.type === 'gasReleased')).toBe(true);
    // No explosion event: the toxic drum does not blast.
    expect(s.events.some((e) => e.type === 'exploded')).toBe(false);
  });

  it('ramming it costs hull and bursts the cloud where the car is', () => {
    const s = cruising();
    s.car.speed = 40;
    const before = s.car.health;
    s.hazards.push({ kind: 'toxbarrel', lane: 1, x: laneCenterX(1), forward: 9, hit: false });
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBeLessThan(before); // the ram chewed hull
    expect(s.gas).toHaveLength(1);
    expect(s.events.some((e) => e.type === 'crashed')).toBe(true);
  });
});

describe('gas cloud', () => {
  it('drains the hull while the car is grounded inside it', () => {
    const s = cruising();
    putGas(s, 1, 9);
    resolveGas(s);
    expect(s.car.health).toBeCloseTo(1 - GAS_TUNING.drainPerTick);
    expect(s.dead).toBe(false);
  });

  it('a jump clears the cloud — no drain in the air', () => {
    const s = cruising();
    s.car.height = 1.0; // airborne, above the cloud
    putGas(s, 1, 9);
    resolveGas(s);
    expect(s.car.health).toBe(1);
  });

  it('does not drain from another lane', () => {
    const s = cruising(1);
    putGas(s, 0, 9); // cloud one lane over (beyond the box)
    resolveGas(s);
    expect(s.car.health).toBe(1);
  });

  it('expires after its life and is removed', () => {
    const s = cruising(0); // park off the cloud's lane so it just ages
    putGas(s, 1, 9, 1);
    resolveGas(s);
    expect(s.gas).toHaveLength(0);
  });

  it('ends the run, attributed to the toxbarrel, if the drain empties the hull', () => {
    const s = cruising();
    s.car.health = GAS_TUNING.drainPerTick / 2; // one tick finishes it
    putGas(s, 1, 9);
    resolveGas(s);
    expect(s.car.health).toBe(0);
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('toxbarrel');
    expect(s.events.some((e) => e.type === 'died')).toBe(true);
  });
});

describe('toxic barrels in world gen', () => {
  it('spawns toxic drums off the safe lane past the early acts', () => {
    let drums = 0;
    let offSafe = true;
    for (let seed = 1; seed < 30; seed += 1) {
      for (let i = SPAWN_TUNING.graceChunks; i < 400; i += 1) {
        const safe = safeLane(seed, i);
        for (const sp of chunkAt(seed, i).spawns) {
          if (sp.kind === 'toxbarrel') {
            drums += 1;
            if (sp.lane === safe) offSafe = false;
          }
        }
      }
    }
    expect(drums).toBeGreaterThan(0);
    expect(offSafe).toBe(true);
  });
});
