import { describe, expect, it } from 'vitest';
import { createSim, chunkAt } from '../src/sim';
import { resolveCollisions, updateMeteors } from '../src/sim/collision';
import { METEOR_TUNING, laneCenterX } from '../src/content/tuning';

/**
 * The sky meteor (docs/DESIGN.md → roster; every killer telegraphs ≥ 2 s). It is
 * harmless while it falls — only a growing shadow — and turns into a lethal,
 * un-jumpable crater the moment it lands on its target lane. Headless sim tests.
 */

describe('sky meteor', () => {
  it('is harmless while still falling (collisions skip an un-landed meteor)', () => {
    const s = createSim(1);
    s.hazards.push({ kind: 'meteor', lane: 2, x: laneCenterX(2), forward: 8, hit: false, landed: false });
    s.distance = 7; // overlapping in forward/lateral, but not landed yet
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
  });

  it('lands only once the gap closes to the impact distance, emitting the burst', () => {
    const s = createSim(1);
    s.hazards.push({ kind: 'meteor', lane: 2, x: laneCenterX(2), forward: 100, hit: false, landed: false });

    s.distance = 100 - METEOR_TUNING.impactGap - 5; // still falling
    updateMeteors(s);
    expect(s.hazards[0].landed).toBe(false);

    s.distance = 100 - METEOR_TUNING.impactGap + 1; // within impact
    updateMeteors(s);
    expect(s.hazards[0].landed).toBe(true);
    expect(s.events.some((e) => e.type === 'exploded')).toBe(true);
  });

  it('a landed meteor is a lethal blocker and records itself as the death cause', () => {
    const s = createSim(1);
    s.car.health = 0.5;
    s.hazards.push({ kind: 'meteor', lane: 2, x: laneCenterX(2), forward: 8, hit: false, landed: false });
    s.distance = 7; // gap 1 < impactGap → lands; and overlaps the car
    s.car.speed = 60;
    updateMeteors(s);
    resolveCollisions(s);
    expect(s.hazards[0].landed).toBe(true);
    expect(s.car.health).toBe(0);
    expect(s.deathCause).toBe('meteor');
  });

  it('cannot be jumped — a landed meteor hits even mid-air (unlike a boulder)', () => {
    const s = createSim(1);
    s.hazards.push({ kind: 'meteor', lane: 2, x: laneCenterX(2), forward: 8, hit: false, landed: true });
    s.distance = 7;
    s.car.height = 1.2; // airborne, well above the jump clearance
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBeLessThan(1);
  });

  it('eventually spawns meteors past the grace zone', () => {
    let meteors = 0;
    for (let i = 0; i < 400; i += 1) {
      for (const spawn of chunkAt(123, i).spawns) if (spawn.kind === 'meteor') meteors += 1;
    }
    expect(meteors).toBeGreaterThan(0);
  });
});
