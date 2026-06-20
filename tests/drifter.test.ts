import { describe, expect, it } from 'vitest';
import { createSim, step, NO_INTENT, type Hazard, type SimState } from '../src/sim';
import { resolveCollisions, updateDrifters } from '../src/sim/collision';
import { chunkAt, safeLane } from '../src/sim';
import { DRIFT_TUNING, LANE_COUNT, SPAWN_TUNING, laneCenterX } from '../src/content/tuning';

/**
 * The drifting wreck (docs/DESIGN.md → roster): the only *moving* blocker, a wreck
 * that eases one lane over as it nears. Its slide is the telegraph — it settles in
 * its committed lane before the bumper and never crosses the safe line. Headless
 * sim tests; the slide is a pure function of position, so it is fully determinate.
 */

function drifter(from: number, to: number, forward: number): Hazard {
  return {
    kind: 'drifter',
    lane: from,
    x: laneCenterX(from),
    forward,
    hit: false,
    driftFromX: laneCenterX(from),
    driftToX: laneCenterX(to),
  };
}

describe('drifting wreck', () => {
  it('sits in its origin lane while far away', () => {
    const s = createSim(1);
    const h = drifter(1, 2, 500);
    s.hazards.push(h);
    s.distance = 0; // gap 500 ≫ startGap
    updateDrifters(s);
    expect(h.x).toBeCloseTo(laneCenterX(1), 5);
  });

  it('eases toward the target lane as the gap closes, monotonically', () => {
    const h = drifter(1, 2, 1000);
    const from = laneCenterX(1);
    const to = laneCenterX(2);
    let prev = from;
    // Walk the car forward in big steps and sample the drifter's X.
    for (let distance = 0; distance <= 1000; distance += 50) {
      const s = createSim(1);
      s.hazards.push(h);
      h.x = from; // reset; updateDrifters recomputes from gap alone
      s.distance = distance;
      updateDrifters(s);
      // Never overshoots the endpoints, and only ever moves toward the target.
      expect(h.x).toBeGreaterThanOrEqual(from - 1e-6);
      expect(h.x).toBeLessThanOrEqual(to + 1e-6);
      expect(h.x).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = h.x;
    }
  });

  it('has fully settled in the target lane before the bumper', () => {
    const s = createSim(1);
    // Place it so the gap is below endGap: the slide must be complete.
    const forward = 100;
    const h = drifter(1, 2, forward);
    s.hazards.push(h);
    s.distance = forward - (DRIFT_TUNING.endGap - 5); // gap < endGap
    updateDrifters(s);
    expect(h.x).toBeCloseTo(laneCenterX(2), 5);
  });

  it('a settled drifter crashes like a wreck in its target lane', () => {
    const s = createSim(1);
    // A drifter already settled in lane 2 (the car's start lane), dead ahead.
    const h = drifter(1, 2, 6);
    h.x = laneCenterX(2);
    s.hazards.push(h);
    s.distance = 6;
    s.car.speed = 40;
    resolveCollisions(s);
    expect(h.hit).toBe(true);
    expect(s.car.health).toBeLessThan(1);
  });

  it('a jump sails over a drifter (it is ground-class)', () => {
    const s = createSim(1);
    const h = drifter(1, 2, 6);
    h.x = laneCenterX(2);
    s.hazards.push(h);
    s.distance = 6;
    s.car.height = 1.2;
    resolveCollisions(s);
    expect(h.hit).toBe(false);
    expect(s.car.health).toBe(1);
  });

  it('materializes with drift endpoints when driven into existence', () => {
    // Drive far enough that drifters are generated and check the live hazard
    // carries both endpoints and that they are an adjacent, non-safe pair.
    const s: SimState = createSim(123);
    let found = false;
    // Drifters first appear in Swarm (act III ≈ 12000 m+ at 6000 m/act), so drive
    // well past it (the car cruises ~66 m/s, ~1.1 m per 60 Hz step).
    for (let i = 0; i < 18000 && !found; i += 1) {
      step(s, NO_INTENT);
      // Keep the run alive long enough to stream plenty of world.
      s.car.health = 1;
      s.dead = false;
      const d = s.hazards.find((h) => h.kind === 'drifter');
      if (d) {
        expect(d.driftFromX).toBeDefined();
        expect(d.driftToX).toBeDefined();
        expect(d.driftFromX).not.toBe(d.driftToX);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('drifter safe-line invariant', () => {
  it('only ever drifts to an adjacent, non-safe lane (never toward safety)', () => {
    for (const seed of [1, 42, 7777, 0xc0ffee]) {
      for (let i = SPAWN_TUNING.graceChunks; i < 600; i += 1) {
        const safe = safeLane(seed, i);
        for (const spawn of chunkAt(seed, i).spawns) {
          if (spawn.kind !== 'drifter') continue;
          expect(spawn.lane).not.toBe(safe); // origin is non-safe
          expect(spawn.toLane).not.toBe(safe); // target is non-safe
          expect(Math.abs(spawn.toLane - spawn.lane)).toBe(1); // exactly one lane
          expect(spawn.toLane).toBeGreaterThanOrEqual(0);
          expect(spawn.toLane).toBeLessThan(LANE_COUNT);
        }
      }
    }
  });
});
