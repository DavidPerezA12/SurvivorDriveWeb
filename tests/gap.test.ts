import { describe, expect, it } from 'vitest';
import { createSim, chunkAt } from '../src/sim';
import { resolveCollisions } from '../src/sim/collision';
import { CHUNK_LENGTH, laneCenterX } from '../src/content/tuning';
import { ACT_SPAN_M } from '../src/content/acts';

/**
 * The road gap (docs/DESIGN.md → roster; the road is the boss): a hole in the
 * surface. Not a thing you hit — a thing you must be airborne over. Jump it or
 * change lane; fall in grounded and the run ends, armor or no armor. Headless sim
 * tests.
 */

function gapAhead(forward = 6) {
  return { kind: 'gap' as const, lane: 2, x: laneCenterX(2), forward, hit: false };
}

describe('road gap', () => {
  it('kills a grounded car that drives over it, attributing the death', () => {
    const s = createSim(1);
    s.hazards.push(gapAhead());
    s.distance = 6;
    s.car.height = 0;
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBe(0);
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('gap');
  });

  it('a jump sails clean over it (it is the surface, jump or fall)', () => {
    const s = createSim(1);
    s.hazards.push(gapAhead());
    s.distance = 6;
    s.car.height = 1.2; // airborne over the hole
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
    expect(s.dead).toBe(false);
  });

  it('ignores armor — a missing road does not care about plating', () => {
    const s = createSim(1);
    // Heavy armor (damageMul well below 1) still cannot save a fall.
    s.loadout = { ...s.loadout, damageMul: 0.2 };
    s.hazards.push(gapAhead());
    s.distance = 6;
    s.car.health = 1;
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.car.health).toBe(0);
    expect(s.deathCause).toBe('gap');
  });

  it('does not threaten a car one lane over', () => {
    const s = createSim(1);
    s.hazards.push({ kind: 'gap', lane: 3, x: laneCenterX(3), forward: 6, hit: false });
    s.distance = 6;
    s.car.height = 0;
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
  });
});

describe('gaps only break the road where it makes sense', () => {
  it('never appears in the intact early acts (Rust, Swarm)', () => {
    const lastEarly = Math.floor((2 * ACT_SPAN_M) / CHUNK_LENGTH);
    let gaps = 0;
    for (const seed of [1, 7, 42, 123]) {
      for (let i = 0; i < lastEarly; i += 1) {
        for (const s of chunkAt(seed, i).spawns) if (s.kind === 'gap') gaps += 1;
      }
    }
    expect(gaps).toBe(0);
  });

  it('appears once the road is breaking (Visitors and beyond)', () => {
    const start = Math.floor((2 * ACT_SPAN_M) / CHUNK_LENGTH);
    let gaps = 0;
    for (let i = start; i < start + 300; i += 1) {
      for (const s of chunkAt(123, i).spawns) if (s.kind === 'gap') gaps += 1;
    }
    expect(gaps).toBeGreaterThan(0);
  });
});
