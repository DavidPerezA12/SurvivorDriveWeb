import { describe, expect, it } from 'vitest';
import { createSim, chunkAt, safeLane } from '../src/sim';
import { resolveCollisions } from '../src/sim/collision';
import { RAMP_TUNING, laneCenterX, CHUNK_LENGTH } from '../src/content/tuning';
import { ACT_SPAN_M } from '../src/content/acts';

/**
 * The collapse ramp (docs/DESIGN.md → Pillar 1: the road is the boss). A fallen
 * building's rubble piled into a launch ramp: driving onto it grounded vaults the
 * car over the debris beyond, a free launch with no hull cost. It is the lone
 * friendly on-road object. Headless sim tests.
 */

const LANE = 2; // the car's start lane center

function ramp(lane: number, forward: number) {
  return {
    kind: 'ramp' as const,
    lane,
    x: laneCenterX(lane),
    forward,
    hit: false,
  };
}

describe('collapse ramp', () => {
  it('launches a grounded car over the debris: airborne, no hull cost, no charge spent', () => {
    const s = createSim(1);
    const charges = s.car.jumpCharges;
    s.hazards.push(ramp(LANE, 8));
    s.distance = 7; // car front overlapping the ramp's run-up
    s.car.speed = 60;
    resolveCollisions(s);

    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.airborne).toBe(true);
    expect(s.car.vertVel).toBeCloseTo(RAMP_TUNING.launchImpulse);
    // No crash: the hull is untouched, the run is alive, and no jump charge was spent.
    expect(s.car.health).toBe(1);
    expect(s.dead).toBe(false);
    expect(s.deathCause).toBeNull();
    expect(s.car.jumpCharges).toBe(charges);
    expect(s.events.some((e) => e.type === 'ramped')).toBe(true);
  });

  it('never kills, even hit square at top speed (it is friendly, not a wall)', () => {
    const s = createSim(1);
    s.car.health = 0.05;
    s.hazards.push(ramp(LANE, 8));
    s.distance = 7;
    s.car.speed = 84; // late-run top speed
    resolveCollisions(s);

    expect(s.car.airborne).toBe(true);
    expect(s.car.health).toBe(0.05);
    expect(s.dead).toBe(false);
  });

  it('does not relaunch a car already in the air (it is already over the debris)', () => {
    const s = createSim(1);
    s.hazards.push(ramp(LANE, 8));
    s.distance = 7;
    s.car.airborne = true;
    s.car.height = 1.2;
    s.car.vertVel = -2;
    resolveCollisions(s);

    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.vertVel).toBe(-2); // untouched
    expect(s.events.some((e) => e.type === 'ramped')).toBe(false);
  });

  it('does not touch a car off the ramp lane', () => {
    const s = createSim(1);
    s.hazards.push(ramp(0, 8)); // far-left lane, away from the lane-2 car
    s.distance = 7;
    s.car.speed = 60;
    resolveCollisions(s);

    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.airborne).toBe(false);
  });

  it('only appears from the Rust act on, and never on the safe lane', () => {
    let early = 0;
    let late = 0;
    const actIIStart = Math.floor(ACT_SPAN_M / CHUNK_LENGTH);
    for (const seed of [1, 7, 42, 123]) {
      for (let i = 0; i < actIIStart; i += 1) {
        for (const sp of chunkAt(seed, i).spawns) if (sp.kind === 'ramp') early += 1;
      }
      for (let i = actIIStart; i < actIIStart + 300; i += 1) {
        const safe = safeLane(seed, i);
        for (const sp of chunkAt(seed, i).spawns) {
          if (sp.kind !== 'ramp') continue;
          late += 1;
          expect(sp.lane).not.toBe(safe);
        }
      }
    }
    expect(early).toBe(0);
    expect(late).toBeGreaterThan(0);
  });
});
