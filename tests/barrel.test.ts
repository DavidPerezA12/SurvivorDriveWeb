import { describe, expect, it } from 'vitest';
import { createSim, step, NO_INTENT, type FrameEvent, type SimState } from '../src/sim';
import { resolveCollisions, resolveShots } from '../src/sim/collision';
import { laneCenterX } from '../src/content/tuning';

/**
 * The explosive barrel (docs/DESIGN.md → roster): the gun's area tool. A shot
 * detonates it and the blast clears the lanes around it (paying scrap and chaining
 * to nearby barrels); ramming one is a big crash that also sets it off; a jump
 * sails over it like any ground-class blocker. These are headless sim tests — no
 * renderer, pure determinism.
 */

function driveCollecting(state: SimState, ticks: number): FrameEvent[] {
  const all: FrameEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    step(state, NO_INTENT);
    all.push(...state.events);
  }
  return all;
}

describe('explosive barrel', () => {
  it('a shot detonates a barrel in the lane and clears zombies around it', () => {
    const s = createSim(1);
    const bx = laneCenterX(2);
    s.car.ammo = 10;
    s.hazards.push({ kind: 'barrel', lane: 2, x: bx, forward: 40, hit: false });
    // One zombie in the barrel's lane, one in the lane beside it — both inside the
    // blast box, so the detonation should take both.
    s.zombies.push({ lane: 2, x: bx, forward: 42, phase: 0, mowed: false });
    s.zombies.push({ lane: 1, x: laneCenterX(1), forward: 39, phase: 0, mowed: false });

    resolveShots(s, { steer: 0, jump: false, fire: true });

    expect(s.hazards[0].hit).toBe(true);
    expect(s.zombies.every((z) => z.mowed)).toBe(true);
    expect(s.scrap).toBeGreaterThan(0);
    expect(s.events.some((e) => e.type === 'exploded')).toBe(true);
  });

  it('detonating one barrel chains to a neighbour', () => {
    const s = createSim(1);
    s.car.ammo = 10;
    s.hazards.push({ kind: 'barrel', lane: 2, x: laneCenterX(2), forward: 40, hit: false });
    s.hazards.push({ kind: 'barrel', lane: 1, x: laneCenterX(1), forward: 41, hit: false });

    resolveShots(s, { steer: 0, jump: false, fire: true });

    expect(s.hazards[0].hit).toBe(true);
    expect(s.hazards[1].hit).toBe(true); // the chain reached it
    const explosions = s.events.filter((e) => e.type === 'exploded').length;
    expect(explosions).toBe(2);
  });

  it('does not waste a shot on a far barrel when a zombie is at the bumper', () => {
    const s = createSim(1);
    const lane = laneCenterX(2);
    s.car.ammo = 10;
    s.hazards.push({ kind: 'barrel', lane: 2, x: lane, forward: 50, hit: false });
    s.zombies.push({ lane: 2, x: lane, forward: 5, phase: 0, mowed: false });

    resolveShots(s, { steer: 0, jump: false, fire: true });

    // The near zombie takes the shot; the distant barrel is left for later.
    expect(s.zombies[0].mowed).toBe(true);
    expect(s.hazards[0].hit).toBe(false);
  });

  it('ramming a barrel hits the hull harder than a wreck and detonates it', () => {
    const barrelRun = createSim(1);
    barrelRun.hazards.push({ kind: 'barrel', lane: 2, x: laneCenterX(2), forward: 6, hit: false });
    const events = driveCollecting(barrelRun, 60);

    const wreckRun = createSim(1);
    wreckRun.hazards.push({ kind: 'wreck', lane: 2, x: laneCenterX(2), forward: 6, hit: false });
    driveCollecting(wreckRun, 60);

    expect(barrelRun.car.health).toBeLessThan(wreckRun.car.health); // the bigger hit
    expect(events.some((e) => e.type === 'exploded')).toBe(true); // and it went off
  });

  it('a jump sails over a barrel (it is ground-class, unlike the rig)', () => {
    const s = createSim(1);
    s.hazards.push({ kind: 'barrel', lane: 2, x: laneCenterX(2), forward: 6, hit: false });
    s.distance = 6;
    s.car.height = 1.2; // airborne above the clearance
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
  });
});
