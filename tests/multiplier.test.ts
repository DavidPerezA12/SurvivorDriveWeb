import { describe, expect, it } from 'vitest';
import { createSim, NO_INTENT, step } from '../src/sim';
import { resolveCollisions, resolveMows, resolveNearMisses } from '../src/sim/collision';
import { ECONOMY_TUNING } from '../src/content/tuning';

describe('risk multiplier', () => {
  it('raises on kills and multiplies the payout that crosses a level', () => {
    const state = createSim(7);
    for (let i = 0; i < ECONOMY_TUNING.multiplierPointsPerLevel; i += 1) {
      state.zombies = [
        { lane: 0, x: state.car.lateralX, forward: state.distance, phase: 0, mowed: false },
      ];
      resolveMows(state, 100);
    }

    expect(state.multiplier).toBe(2);
    expect(state.multiplierCharge).toBe(0);
    expect(state.peakMultiplier).toBe(2);
    // 3 + 4 + 5 at ×1, then the level-crossing sixth scrap at ×2.
    expect(state.scrap).toBe(24);
  });

  it('awards ramp commitment exactly once', () => {
    const state = createSim(8);
    state.hazards = [{ kind: 'ramp', lane: 0, x: 0, forward: 0, hit: false }];
    state.car.lateralX = 0;
    resolveCollisions(state);
    expect(state.multiplierCharge).toBe(ECONOMY_TUNING.multiplierRampPoints);
  });

  it('arms while close and pays after the exact footprint even if the car moves away', () => {
    const state = createSim(12);
    state.hazards = [{ kind: 'barrel', lane: 0, x: 0, forward: 10, hit: false }];
    state.distance = 10;
    state.car.lateralX = 2;

    resolveNearMisses(state);
    expect(state.hazards[0].nearMissArmed).toBe(true);
    expect(state.multiplierCharge).toBe(0);

    // A barrel ends at 10.6 m. The rear is now just beyond it, much sooner than
    // the old bus-sized wait, and lateral X no longer affects the latched clear.
    state.distance = 14.61;
    state.car.lateralX = -2.4;
    resolveNearMisses(state);
    resolveNearMisses(state);

    expect(state.multiplierCharge).toBe(ECONOMY_TUNING.multiplierNearMissPoints);
    expect(state.events.filter((event) => event.type === 'nearMiss')).toHaveLength(1);
  });

  it('does not pay when the car only moves close after passing', () => {
    const state = createSim(13);
    state.hazards = [{ kind: 'wreck', lane: 0, x: 0, forward: 10, hit: false }];
    state.distance = 10;
    state.car.lateralX = -3;
    resolveNearMisses(state);
    expect(state.hazards[0].nearMissArmed).not.toBe(true);

    state.distance = 15.61;
    state.car.lateralX = 0;
    resolveNearMisses(state);

    expect(state.hazards[0].nearMissed).toBe(true);
    expect(state.multiplierCharge).toBe(0);
    expect(state.events.some((event) => event.type === 'nearMiss')).toBe(false);
  });

  it('pays a same-lane jump once the whole car clears the hazard', () => {
    const state = createSim(14);
    state.hazards = [{ kind: 'wreck', lane: 0, x: 0, forward: 10, hit: false }];
    state.distance = 10;
    state.car.lateralX = 0;
    state.car.height = 1;

    resolveCollisions(state);
    resolveNearMisses(state);
    expect(state.hazards[0].hit).toBe(false);
    expect(state.hazards[0].nearMissArmed).toBe(true);

    state.distance = 15.61;
    resolveNearMisses(state);

    expect(state.multiplierCharge).toBe(ECONOMY_TUNING.multiplierNearMissPoints);
    expect(state.events.some((event) => event.type === 'nearMiss')).toBe(true);
  });

  it('cancels an armed near-miss if the car collides before clearing it', () => {
    const state = createSim(15);
    state.hazards = [{ kind: 'wreck', lane: 0, x: 0, forward: 10, hit: false }];
    state.distance = 10;
    state.car.lateralX = 2.2;
    resolveCollisions(state);
    resolveNearMisses(state);
    expect(state.hazards[0].nearMissArmed).toBe(true);

    state.car.lateralX = 0;
    resolveCollisions(state);
    expect(state.hazards[0].hit).toBe(true);

    state.distance = 15.61;
    resolveNearMisses(state);

    expect(state.multiplierCharge).toBe(0);
    expect(state.events.some((event) => event.type === 'nearMiss')).toBe(false);
  });

  it('does not reward the ordinary refuge in the opposite lane', () => {
    const state = createSim(9);
    state.car.lateralX = -2.4;
    state.distance = 10;
    state.hazards = [{ kind: 'wreck', lane: 1, x: 2.4, forward: 0, hit: false }];
    resolveNearMisses(state);
    expect(state.multiplierCharge).toBe(0);
  });

  it('resets on a crash and expires after its idle window', () => {
    const state = createSim(10);
    state.multiplier = 3;
    state.multiplierCharge = 2;
    state.multiplierTicks = 100;
    state.hazards = [
      { kind: 'wreck', lane: 0, x: state.car.lateralX, forward: state.distance, hit: false },
    ];
    resolveCollisions(state);
    expect(state.multiplier).toBe(1);
    expect(state.multiplierCharge).toBe(0);

    state.hazards = [];
    state.nextSpawnChunk = 1000;
    state.multiplier = 2;
    state.multiplierTicks = 1;
    step(state, NO_INTENT);
    expect(state.multiplier).toBe(1);
    expect(state.multiplierTicks).toBe(0);
  });

  it('keeps the multiplier when a shield absorbs the hull cost', () => {
    const state = createSim(11);
    state.multiplier = 3;
    state.multiplierTicks = 100;
    state.car.shieldTicks = 60;
    state.hazards = [
      { kind: 'wreck', lane: 0, x: state.car.lateralX, forward: state.distance, hit: false },
    ];
    resolveCollisions(state);
    expect(state.multiplier).toBe(3);
    expect(state.car.health).toBe(1);
  });
});
