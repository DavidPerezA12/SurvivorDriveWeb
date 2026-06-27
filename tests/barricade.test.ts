import { describe, expect, it } from 'vitest';
import { createSim, type Intent, type SimState } from '../src/sim';
import { resolveCollisions, resolveShots } from '../src/sim/collision';
import { CRASH_TUNING, WEAPON_TUNING, laneCenterX } from '../src/content/tuning';

/**
 * The light barricade (docs/DESIGN.md → roster: the soft blocker). Its whole reason
 * to exist is a counterplay the wreck does not have: you can barge straight through
 * it for almost nothing, or pop it with the gun. Headless contracts; the look is
 * judged in the browser.
 */

const FIRE: Intent = { steer: 0, jump: false, fire: true };

function putBarricade(s: SimState, lane: number, forward: number): void {
  s.hazards.push({
    kind: 'barricade',
    lane,
    x: laneCenterX(lane),
    forward,
    hit: false,
    hp: WEAPON_TUNING.barricadeHp,
  });
}

function putWreck(s: SimState, lane: number, forward: number): void {
  s.hazards.push({ kind: 'wreck', lane, x: laneCenterX(lane), forward, hit: false, hp: WEAPON_TUNING.wreckHp });
}

describe('ramming a light barricade', () => {
  it('barely dents the hull and barely slows — far cheaper than a wreck', () => {
    const barricadeRun = createSim(1);
    barricadeRun.car.lateralX = laneCenterX(2);
    barricadeRun.car.speed = 50;
    barricadeRun.distance = 6;
    putBarricade(barricadeRun, 2, 6);
    resolveCollisions(barricadeRun);

    const wreckRun = createSim(1);
    wreckRun.car.lateralX = laneCenterX(2);
    wreckRun.car.speed = 50;
    wreckRun.distance = 6;
    putWreck(wreckRun, 2, 6);
    resolveCollisions(wreckRun);

    // It did cost something (it is a blocker), but the soft barricade chews far less
    // hull than the wreck and keeps far more speed.
    expect(barricadeRun.car.health).toBeLessThan(1);
    expect(barricadeRun.car.health).toBeGreaterThan(wreckRun.car.health);
    expect(barricadeRun.car.speed).toBeGreaterThan(wreckRun.car.speed);
    expect(barricadeRun.car.speed).toBeCloseTo(50 * CRASH_TUNING.barricadeSpeedKeep, 4);
  });

  it('is attributable if it ever empties an already-battered hull', () => {
    const s = createSim(1);
    s.car.lateralX = laneCenterX(2);
    s.car.speed = 50;
    s.car.health = 0.02; // limping in
    s.distance = 6;
    putBarricade(s, 2, 6);
    resolveCollisions(s);
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('barricade');
  });
});

describe('shooting a light barricade', () => {
  it('pops in a single shot, even with the stock gun', () => {
    const s = createSim(1);
    s.car.lateralX = laneCenterX(2);
    putBarricade(s, 2, 40); // dead ahead, in range
    resolveShots(s, FIRE);
    expect(s.hazards[0].hit).toBe(true);
  });
});

describe('jumping a light barricade', () => {
  it('a hop near the top of the arc clears it (it is low, ground-class)', () => {
    const s = createSim(1);
    s.car.lateralX = laneCenterX(2);
    s.car.speed = 50;
    s.distance = 6;
    s.car.height = 1.0; // airborne, above the barricade's clearance
    putBarricade(s, 2, 6);
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
  });
});
