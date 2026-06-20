import { describe, expect, it } from 'vitest';
import { createSim, step, NO_INTENT, type FrameEvent, type SimState } from '../src/sim';
import { resolveCollisions } from '../src/sim/collision';
import { laneCenterX } from '../src/content/tuning';

/** Drive forward N ticks, collecting every frame event emitted. */
function driveCollecting(state: SimState, ticks: number): FrameEvent[] {
  const all: FrameEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    step(state, NO_INTENT);
    all.push(...state.events);
  }
  return all;
}

describe('collision', () => {
  it('chews the hull when it drives into a wreck in its lane', () => {
    const state = createSim(1);
    // Inject a wreck dead ahead in the car's starting lane (centered).
    state.hazards.push({ kind: 'wreck', lane: 2, x: laneCenterX(2), forward: 6, hit: false });

    const events = driveCollecting(state, 60);
    expect(events.some((e) => e.type === 'crashed')).toBe(true);
    expect(state.car.health).toBeLessThan(1);
  });

  it('does not hit a wreck one lane over', () => {
    const state = createSim(1);
    state.hazards.push({ kind: 'wreck', lane: 3, x: laneCenterX(3), forward: 6, hit: false });

    const events = driveCollecting(state, 60);
    expect(events.some((e) => e.type === 'crashed')).toBe(false);
    expect(state.car.health).toBe(1);
  });

  it('ends the run when the hull is destroyed', () => {
    const state = createSim(1);
    state.car.health = 0.2; // one full-speed hit from death
    // Far enough that the car reaches cruising speed before impact.
    state.hazards.push({ kind: 'wreck', lane: 2, x: laneCenterX(2), forward: 90, hit: false });

    const events = driveCollecting(state, 260);
    expect(state.dead).toBe(true);
    expect(events.some((e) => e.type === 'died')).toBe(true);
    // The death card reads the killing blocker as the cause (feeds `runTitle`).
    expect(state.deathCause).toBe('wreck');
  });

  it('records the killing blocker kind as the death cause', () => {
    const state = createSim(1);
    state.car.health = 0.05; // one hit from death
    state.hazards.push({ kind: 'rig', lane: 2, x: laneCenterX(2), forward: 90, hit: false });
    driveCollecting(state, 260);
    expect(state.dead).toBe(true);
    expect(state.deathCause).toBe('rig');
  });

  it('leaves the death cause null while the hull holds', () => {
    const state = createSim(1);
    driveCollecting(state, 120);
    expect(state.dead).toBe(false);
    expect(state.deathCause).toBeNull();
  });

  it('hits each wreck only once', () => {
    const state = createSim(1);
    state.hazards.push({ kind: 'wreck', lane: 2, x: laneCenterX(2), forward: 6, hit: false });

    const events = driveCollecting(state, 120);
    const crashes = events.filter((e) => e.type === 'crashed').length;
    expect(crashes).toBe(1);
  });
});

describe('boulder', () => {
  it('ramming one costs hull, but less than ramming a wreck at the same speed', () => {
    const boulderRun = createSim(1);
    boulderRun.hazards.push({ kind: 'boulder', lane: 2, x: laneCenterX(2), forward: 6, hit: false });
    driveCollecting(boulderRun, 60);

    // Same seed, same forward → identical impact speed, so the only difference is
    // the kind's damage scaling.
    const wreckRun = createSim(1);
    wreckRun.hazards.push({ kind: 'wreck', lane: 2, x: laneCenterX(2), forward: 6, hit: false });
    driveCollecting(wreckRun, 60);

    expect(boulderRun.car.health).toBeLessThan(1); // it still hurt
    expect(boulderRun.car.health).toBeGreaterThan(wreckRun.car.health); // but less than a wreck
  });

  it('a jump sails over a boulder (it is ground-class, unlike the rig)', () => {
    const state = createSim(1);
    state.hazards.push({ kind: 'boulder', lane: 2, x: laneCenterX(2), forward: 6, hit: false });
    // Airborne above the clearance, with the car's front squarely on the boulder.
    state.distance = 6;
    state.car.height = 1.2;
    resolveCollisions(state);
    expect(state.hazards[0].hit).toBe(false);
    expect(state.car.health).toBe(1);
  });

  it('a grounded car cannot drive through a boulder in its lane', () => {
    const state = createSim(1);
    state.hazards.push({ kind: 'boulder', lane: 2, x: laneCenterX(2), forward: 6, hit: false });
    state.distance = 6;
    state.car.height = 0; // on the ground — no clearance
    state.car.speed = 40; // moving, so the crash actually bites hull
    resolveCollisions(state);
    expect(state.hazards[0].hit).toBe(true);
    expect(state.car.health).toBeLessThan(1);
  });
});
