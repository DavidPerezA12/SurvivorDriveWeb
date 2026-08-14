import { describe, expect, it } from 'vitest';
import { createSim, step, NO_INTENT, type Hazard, type SimState } from '../src/sim';
import { resolveCollisions, updateDrifters } from '../src/sim/collision';
import { chunkAt, safeLane } from '../src/sim';
import { DRIFT_TUNING, LANE_WIDTH, SPAWN_TUNING, laneCenterX } from '../src/content/tuning';

/**
 * The drifting wreck (docs/DESIGN.md → roster): the only *moving* blocker, a wreck
 * that eases one lane over as it nears. Its slide is the telegraph — it settles in
 * its committed lane before the bumper and never crosses the safe line. Headless
 * sim tests; the slide is a pure function of position, so it is fully determinate.
 */

function drifter(lane: number, fromX: number, toX: number, forward: number): Hazard {
  return {
    kind: 'drifter',
    lane,
    x: fromX,
    forward,
    hit: false,
    driftFromX: fromX,
    driftToX: toX,
  };
}

const THREAT_LANE = 1;
const FROM_X = laneCenterX(THREAT_LANE) - 0.8;
const TO_X = laneCenterX(THREAT_LANE) + 0.8;

describe('drifting wreck', () => {
  it('sits in its origin lane while far away', () => {
    const s = createSim(1);
    const h = drifter(THREAT_LANE, FROM_X, TO_X, 500);
    s.hazards.push(h);
    s.distance = 0; // gap 500 ≫ startGap
    updateDrifters(s);
    expect(h.x).toBeCloseTo(FROM_X, 5);
  });

  it('eases toward the target lane as the gap closes, monotonically', () => {
    const h = drifter(THREAT_LANE, FROM_X, TO_X, 1000);
    const from = FROM_X;
    const to = TO_X;
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
    const h = drifter(THREAT_LANE, FROM_X, TO_X, forward);
    s.hazards.push(h);
    s.distance = forward - (DRIFT_TUNING.endGap - 5); // gap < endGap
    updateDrifters(s);
    expect(h.x).toBeCloseTo(TO_X, 5);
  });

  it('a settled drifter crashes like a wreck in its target lane', () => {
    const s = createSim(1);
    // A drifter already settled in the car's start lane (lane 1), dead ahead.
    const h = drifter(1, laneCenterX(1) - 0.8, laneCenterX(1), 6);
    h.x = laneCenterX(1);
    s.hazards.push(h);
    s.distance = 6;
    s.car.speed = 40;
    resolveCollisions(s);
    expect(h.hit).toBe(true);
    expect(s.car.health).toBeLessThan(1);
  });

  it('a jump sails over a drifter (it is ground-class)', () => {
    const s = createSim(1);
    const h = drifter(1, laneCenterX(1) - 0.8, laneCenterX(1), 6);
    h.x = laneCenterX(1);
    s.hazards.push(h);
    s.distance = 6;
    s.car.height = 1.2;
    resolveCollisions(s);
    expect(h.hit).toBe(false);
    expect(s.car.health).toBe(1);
  });

  it('materializes with distinct drift endpoints when driven into existence', () => {
    // Drive far enough that drifters are generated and check the live hazard carries
    // both sweep endpoints and that they differ (it sweeps, it is not static).
    const s: SimState = createSim(123);
    let found = false;
    // Drifters first appear in Swarm (act III, 7000 m+ at 3500 m/act), so drive
    // well past it (the car cruises ~66 m/s, ~1.1 m per 60 Hz step). Which formation
    // each chunk draws depends on the whole formation library's weights, so where
    // this seed rolls its first live (non-degraded) drifter shifts whenever the
    // library grows; give it a generous horizon rather than a tuned one.
    for (let i = 0; i < 45000 && !found; i += 1) {
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
  it('sweeps within its own non-safe lane, never reaching the safe line', () => {
    for (const seed of [1, 42, 7777, 0xc0ffee]) {
      for (let i = SPAWN_TUNING.graceChunks; i < 600; i += 1) {
        const safe = safeLane(seed, i);
        for (const spawn of chunkAt(seed, i).spawns) {
          if (spawn.kind !== 'drifter') continue;
          expect(spawn.lane).not.toBe(safe); // it sweeps a non-safe lane
          // Both sweep endpoints stay inside that lane, so the wreck's body (bounded by
          // its half-width when the endpoints were chosen) never reaches the safe line.
          const laneMin = laneCenterX(spawn.lane) - LANE_WIDTH / 2;
          const laneMax = laneCenterX(spawn.lane) + LANE_WIDTH / 2;
          for (const x of [spawn.fromX, spawn.toX]) {
            expect(x).toBeGreaterThanOrEqual(laneMin - 1e-6);
            expect(x).toBeLessThanOrEqual(laneMax + 1e-6);
          }
        }
      }
    }
  });
});
