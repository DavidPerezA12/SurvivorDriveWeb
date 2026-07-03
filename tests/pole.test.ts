import { describe, expect, it } from 'vitest';
import { createSim, chunkAt, type SimState } from '../src/sim';
import { resolveCollisions } from '../src/sim/collision';
import { laneCenterX, LANE_WIDTH } from '../src/content/tuning';

/**
 * The two lane-spanning obstacles (docs/DESIGN.md → roster). The downed `pole` is
 * ground-class and survivable but as wide as its lane: there is no within-lane
 * dodge, so the outs are the hop or the lane change. The `livewire` is its lethal
 * sibling: a ground trap like the spikes (grounded contact is an outright,
 * attributable death; a jump clears it), equally lane-wide. Headless contracts;
 * the look is judged in the browser.
 */

/** A car cruising on a lane, overlapping a hazard placed just ahead of its nose. */
function approaching(lane: number, speed: number, health = 1): SimState {
  const s = createSim(1);
  s.car.lateralX = laneCenterX(lane);
  s.car.health = health;
  s.car.speed = speed;
  s.distance = 8; // nose level with a hazard placed at forward 8
  return s;
}

describe('downed pole (wide survivable blocker)', () => {
  it('a grounded hit costs hull and momentum but is survivable at full health', () => {
    const s = approaching(2, 50);
    s.hazards.push({ kind: 'pole', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBeLessThan(1);
    expect(s.car.health).toBeGreaterThan(0);
    expect(s.car.speed).toBeLessThan(50);
    expect(s.dead).toBe(false);
  });

  it('spans its whole lane — a within-lane dodge that clears a boulder still hits it', () => {
    // Park the car near the lane edge: outside a boulder footprint, inside the pole's.
    const s = approaching(2, 50);
    s.car.lateralX = laneCenterX(2) + LANE_WIDTH * 0.4;
    s.hazards.push({ kind: 'pole', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBeLessThan(1);
  });

  it('a hop clears it', () => {
    const s = approaching(2, 50);
    s.car.height = 0.65; // above POLE_CLEAR, below a full arc
    s.hazards.push({ kind: 'pole', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
  });

  it('an emptied hull is attributed to the pole', () => {
    const s = approaching(2, 80, 0.01);
    s.hazards.push({ kind: 'pole', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('pole');
  });
});

describe('live wire (lane-wide lethal ground trap)', () => {
  it('is an outright, attributable death when hit grounded', () => {
    const s = approaching(2, 40, 0.9);
    s.hazards.push({ kind: 'livewire', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBe(0);
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('livewire');
  });

  it('reaches a car parked near the lane edge (no within-lane dodge)', () => {
    const s = approaching(2, 40);
    s.car.lateralX = laneCenterX(2) + LANE_WIDTH * 0.4;
    s.hazards.push({ kind: 'livewire', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.dead).toBe(true);
  });

  it('a jump clears it — airborne, the car is untouched', () => {
    const s = approaching(2, 50);
    s.car.height = 1.0;
    s.hazards.push({ kind: 'livewire', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
    expect(s.dead).toBe(false);
  });
});

describe('world generation', () => {
  it('eventually spawns both new kinds, never on the safe lane', () => {
    let poles = 0;
    let livewires = 0;
    for (let i = 0; i < 800; i += 1) {
      for (const spawn of chunkAt(123, i).spawns) {
        if (spawn.kind === 'pole') poles += 1;
        else if (spawn.kind === 'livewire') livewires += 1;
      }
    }
    expect(poles).toBeGreaterThan(0);
    expect(livewires).toBeGreaterThan(0);
  });
});
