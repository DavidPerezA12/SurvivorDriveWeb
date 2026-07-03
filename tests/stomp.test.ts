import { describe, expect, it } from 'vitest';
import { createSim, chunkAt, safeLane } from '../src/sim';
import { resolveCollisions, updateMeteors } from '../src/sim/collision';
import { METEOR_TUNING, laneCenterX, CHUNK_LENGTH } from '../src/content/tuning';
import { ACT_SPAN_M } from '../src/content/acts';
import { DEATH_CAUSES, runTitle } from '../src/content/runTitles';
import { usesDedicatedCraterField } from '../src/render/hazards';

/**
 * The T-Rex stomp (docs/DESIGN.md → Phase 3 bosses; spectacle in the background, the
 * road legible). A foot-slam shares the meteor's fall→land pipeline: harmless while it
 * falls (a telegraph), a lethal un-jumpable footprint the moment it lands, attributed
 * to the rex. Headless sim tests; the looming body is render-only spectacle.
 */
describe('T-Rex stomp', () => {
  it('routes the crater family away from the generic wreck renderer', () => {
    expect(usesDedicatedCraterField('meteor')).toBe(true);
    expect(usesDedicatedCraterField('stomp')).toBe(true);
    expect(usesDedicatedCraterField('shell')).toBe(true);
    expect(usesDedicatedCraterField('wreck')).toBe(false);
  });

  it('hunts: locks onto the car when the telegraph begins, once, inside its lane', () => {
    const s = createSim(1);
    const LANE_WIDTH = laneCenterX(1) - laneCenterX(0);
    // Car parked off-centre inside the threat lane; the foot must find it.
    s.car.lateralX = laneCenterX(1) + 0.9;
    s.hazards.push({
      kind: 'stomp',
      lane: 1,
      x: laneCenterX(1),
      forward: 1000,
      hit: false,
      landed: false,
    });
    // Beyond the telegraph: still on its pre-laid line, no lock yet.
    s.distance = 1000 - METEOR_TUNING.telegraphGap - 10;
    updateMeteors(s);
    expect(s.hazards[0].aimed).toBeUndefined();
    expect(s.hazards[0].x).toBeCloseTo(laneCenterX(1), 5);
    // Telegraph begins: the shadow locks onto the car's position.
    s.distance = 1000 - METEOR_TUNING.telegraphGap + 1;
    updateMeteors(s);
    expect(s.hazards[0].aimed).toBe(true);
    expect(s.hazards[0].x).toBeCloseTo(laneCenterX(1) + 0.9, 5);
    // The lock is once: dodging afterwards does not drag the shadow along.
    s.car.lateralX = laneCenterX(1) - 1.2;
    s.distance += 30;
    updateMeteors(s);
    expect(s.hazards[0].x).toBeCloseTo(laneCenterX(1) + 0.9, 5);
    // And the clamp holds the body inside its lane: a car parked on the far side
    // of the road never pulls the foot across the safe line.
    const s2 = createSim(1);
    s2.car.lateralX = laneCenterX(0) - 2; // far side, beyond the safe lane
    s2.hazards.push({
      kind: 'stomp',
      lane: 1,
      x: laneCenterX(1),
      forward: 1000,
      hit: false,
      landed: false,
    });
    s2.distance = 1000 - METEOR_TUNING.telegraphGap + 1;
    updateMeteors(s2);
    expect(Math.abs(s2.hazards[0].x - laneCenterX(1))).toBeLessThanOrEqual(LANE_WIDTH / 2);
  });

  it('is harmless while the foot is still falling (collisions skip an un-landed stomp)', () => {
    const s = createSim(1);
    s.hazards.push({
      kind: 'stomp',
      lane: 1,
      x: laneCenterX(1),
      forward: 8,
      hit: false,
      landed: false,
    });
    s.distance = 7; // overlapping, but not slammed down yet
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
  });

  it('slams down only once the gap closes to the impact distance, emitting the burst', () => {
    const s = createSim(1);
    s.hazards.push({
      kind: 'stomp',
      lane: 1,
      x: laneCenterX(1),
      forward: 100,
      hit: false,
      landed: false,
    });

    s.distance = 100 - METEOR_TUNING.impactGap - 5; // still falling
    updateMeteors(s);
    expect(s.hazards[0].landed).toBe(false);

    s.distance = 100 - METEOR_TUNING.impactGap + 1; // within impact
    updateMeteors(s);
    expect(s.hazards[0].landed).toBe(true);
    expect(s.events.some((e) => e.type === 'exploded')).toBe(true);
  });

  it('a landed stomp is a lethal blocker and records itself as the death cause', () => {
    const s = createSim(1);
    s.car.health = 0.5;
    s.hazards.push({
      kind: 'stomp',
      lane: 1,
      x: laneCenterX(1),
      forward: 8,
      hit: false,
      landed: false,
    });
    s.distance = 7; // gap 1 < impactGap → lands; and overlaps the car
    s.car.speed = 60;
    updateMeteors(s);
    resolveCollisions(s);
    expect(s.hazards[0].landed).toBe(true);
    expect(s.car.health).toBe(0);
    expect(s.deathCause).toBe('stomp');
  });

  it('cannot be jumped — a slammed footprint hits even mid-air (it is a lethal wall)', () => {
    const s = createSim(1);
    s.hazards.push({
      kind: 'stomp',
      lane: 1,
      x: laneCenterX(1),
      forward: 8,
      hit: false,
      landed: true,
    });
    s.distance = 7;
    s.car.height = 1.2; // airborne, well above any jump clearance
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBeLessThan(1);
  });

  it('does not threaten a car one lane over', () => {
    const s = createSim(1);
    s.hazards.push({
      kind: 'stomp',
      lane: 0,
      x: laneCenterX(0),
      forward: 8,
      hit: false,
      landed: true,
    });
    s.distance = 7;
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
  });

  it('has an attributable death cause and an absurd run title', () => {
    expect(DEATH_CAUSES).toContain('stomp');
    const title = runTitle(123, 'stomp', { distance: 4200, zombiesKilled: 12, scrap: 90 });
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
  });
});

describe('T-Rex rampage in the world', () => {
  it('only appears from the Swarm act on, and never stomps the safe lane', () => {
    // The rex is act III's headline now (docs/DESIGN.md → Acts: the spectacle
    // starts in Swarm), so this gate moved up one act.
    let early = 0;
    let late = 0;
    const actIIIStart = Math.floor((2 * ACT_SPAN_M) / CHUNK_LENGTH);
    for (const seed of [1, 7, 42, 123]) {
      for (let i = 0; i < actIIIStart; i += 1) {
        for (const sp of chunkAt(seed, i).spawns) if (sp.kind === 'stomp') early += 1;
      }
      for (let i = actIIIStart; i < actIIIStart + 400; i += 1) {
        const safe = safeLane(seed, i);
        for (const sp of chunkAt(seed, i).spawns) {
          if (sp.kind !== 'stomp') continue;
          late += 1;
          expect(sp.lane).not.toBe(safe);
        }
      }
    }
    expect(early).toBe(0);
    expect(late).toBeGreaterThan(0);
  });
});
