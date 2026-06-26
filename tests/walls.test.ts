import { describe, expect, it } from 'vitest';
import { createSim, chunkAt, type SimState } from '../src/sim';
import { resolveCollisions } from '../src/sim/collision';
import { laneCenterX } from '../src/content/tuning';

/**
 * Lethal walls and ground traps (docs/DESIGN.md → readability: lethal looks
 * lethal). The concrete `barrier` and the crashed `bus` are un-jumpable walls like
 * the rig — a square hit at speed ends the run, and a jump cannot clear them. The
 * `spikes` strip is a lethal ground trap like the gap — fatal if you are on it
 * grounded, but a jump clears it. Headless sim contracts; the look is judged in
 * the browser.
 */

/** A car cruising on a lane, overlapping a hazard placed just ahead of its nose. */
function approaching(lane: number, speed: number, health = 1): SimState {
  const s = createSim(1);
  s.car.lateralX = laneCenterX(lane);
  s.car.health = health;
  s.car.speed = speed;
  s.distance = 8; // nose level with a hazard placed at forward 8 (overlaps shallow footprints)
  return s;
}

describe('concrete barrier (lethal wall)', () => {
  it('a square hit at speed empties the hull and is attributed to the barrier', () => {
    const s = approaching(2, 60);
    s.hazards.push({ kind: 'barrier', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBe(0);
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('barrier');
  });

  it('cannot be jumped — it hits even mid-air, unlike a wreck', () => {
    const s = approaching(2, 50);
    s.car.height = 1.2; // airborne, well above the jump clearance
    s.hazards.push({ kind: 'barrier', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBeLessThan(1);
  });

  it('breaks the streak on contact', () => {
    const s = approaching(2, 40, 0.5);
    s.combo = 7;
    s.comboTicks = 50;
    s.hazards.push({ kind: 'barrier', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.combo).toBe(0);
  });
});

describe('crashed bus (lethal wall)', () => {
  it('a square hit at speed empties the hull and is attributed to the bus', () => {
    const s = approaching(2, 60);
    s.hazards.push({ kind: 'bus', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.car.health).toBe(0);
    expect(s.deathCause).toBe('bus');
  });

  it('cannot be jumped — it hits even mid-air', () => {
    const s = approaching(2, 50);
    s.car.height = 1.2;
    s.hazards.push({ kind: 'bus', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBeLessThan(1);
  });
});

describe('spike strip (lethal ground trap)', () => {
  it('is an outright, attributable death when hit grounded', () => {
    const s = approaching(2, 40, 0.8);
    s.hazards.push({ kind: 'spikes', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBe(0);
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('spikes');
  });

  it('a jump clears it — airborne, the car is untouched (unlike a wall)', () => {
    const s = approaching(2, 50);
    s.car.height = 1.2; // airborne above the jump clearance
    s.hazards.push({ kind: 'spikes', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
    expect(s.dead).toBe(false);
  });
});

describe('world generation', () => {
  it('eventually spawns each new wall/trap kind past the grace zone', () => {
    let barriers = 0;
    let buses = 0;
    let spikes = 0;
    for (let i = 0; i < 600; i += 1) {
      for (const spawn of chunkAt(123, i).spawns) {
        if (spawn.kind === 'barrier') barriers += 1;
        else if (spawn.kind === 'bus') buses += 1;
        else if (spawn.kind === 'spikes') spikes += 1;
      }
    }
    expect(barriers).toBeGreaterThan(0);
    expect(buses).toBeGreaterThan(0);
    expect(spikes).toBeGreaterThan(0);
  });
});
