import { describe, expect, it } from 'vitest';
import { createSim, chunkAt } from '../src/sim';
import { resolveCollisions, updateQuakes } from '../src/sim/collision';
import { QUAKE_TUNING, laneCenterX, CHUNK_LENGTH } from '../src/content/tuning';
import { ACT_SPAN_M } from '../src/content/acts';

/**
 * The quake split (docs/DESIGN.md → Pillar 1: the road is the boss). A run of gaps
 * that tear open in a wave across the non-safe lanes. Each is a harmless telegraph
 * crack until the car is within range, then a lethal hole. The safe lane never
 * cracks. Headless sim tests; the wave reads from the staggered forward positions.
 */

/** The car's start lane center, so a hazard placed there overlaps it laterally. */
const LANE = 2;

describe('quake split', () => {
  it('a crack is harmless while still closed (collisions skip an unopened gap)', () => {
    const s = createSim(1);
    s.hazards.push({ kind: 'gap', lane: LANE, x: laneCenterX(LANE), forward: 8, hit: false, open: false });
    s.distance = 7; // overlapping in forward/lateral, grounded — but not open yet
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
    expect(s.dead).toBe(false);
  });

  it('tears open only once the gap closes to the open distance, emitting the burst', () => {
    const s = createSim(1);
    s.hazards.push({ kind: 'gap', lane: LANE, x: laneCenterX(LANE), forward: 200, hit: false, open: false });

    s.distance = 200 - QUAKE_TUNING.openGap - 5; // still a crack
    updateQuakes(s);
    expect(s.hazards[0].open).toBe(false);

    s.distance = 200 - QUAKE_TUNING.openGap + 1; // within range
    updateQuakes(s);
    expect(s.hazards[0].open).toBe(true);
    expect(s.events.some((e) => e.type === 'exploded')).toBe(true);
  });

  it('an opened quake gap is a lethal hole and records the death as a gap', () => {
    const s = createSim(1);
    s.hazards.push({ kind: 'gap', lane: LANE, x: laneCenterX(LANE), forward: 8, hit: false, open: false });
    s.distance = 7; // gap 1 < openGap → opens; and overlaps the car, grounded
    s.car.speed = 60;
    updateQuakes(s);
    resolveCollisions(s);
    expect(s.hazards[0].open).toBe(true);
    expect(s.car.health).toBe(0);
    expect(s.deathCause).toBe('gap');
  });

  it('an opened quake gap can still be jumped (it is a hole, not a wall)', () => {
    const s = createSim(1);
    s.hazards.push({ kind: 'gap', lane: LANE, x: laneCenterX(LANE), forward: 8, hit: false, open: true });
    s.distance = 7;
    s.car.height = 1.2; // airborne, clear over the hole
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
  });

  it('only appears from the Visitors act on, and never on the safe lane', () => {
    // Quake gaps carry `open === false` at materialization; the formation that lays
    // them (quake-split) is gated to Visitors and later, so the intact early acts
    // stay quake-free. (Plain static gaps are separately barred from acts I–II.)
    let earlyQuake = 0;
    let lateQuake = 0;
    const actIVStart = Math.floor((3 * ACT_SPAN_M) / CHUNK_LENGTH);
    for (const seed of [1, 7, 42, 123]) {
      for (let i = 0; i < actIVStart; i += 1) {
        for (const sp of chunkAt(seed, i).spawns) if (sp.kind === 'gap' && sp.opening) earlyQuake += 1;
      }
      for (let i = actIVStart; i < actIVStart + 300; i += 1) {
        for (const sp of chunkAt(seed, i).spawns) if (sp.kind === 'gap' && sp.opening) lateQuake += 1;
      }
    }
    expect(earlyQuake).toBe(0);
    expect(lateQuake).toBeGreaterThan(0);
  });
});
