import { describe, expect, it } from 'vitest';
import { createSim, type SimState } from '../src/sim';
import { resolvePickups } from '../src/sim/collision';
import { CAR_TUNING, PICKUP_TUNING, laneCenterX } from '../src/content/tuning';

/**
 * Lift pickups are the jump economy (docs/DESIGN.md → Part-based damage: jump is
 * a charge resource, not a degrading hop). These are the headless contracts:
 * running one over on the ground banks a charge up to the cap, the air trades it
 * away, and each pickup pays once. The feel is judged in the browser.
 */

/** A live lift pickup sitting at `forward` in `lane`, ready to be gathered. */
function putPickup(state: SimState, lane: number, forward: number): void {
  state.pickups.push({ kind: 'jump', lane, x: laneCenterX(lane), forward, phase: 0, taken: false });
}

/** A state with the car cruising in the centre lane at a known place. */
function cruising(): SimState {
  const s = createSim(1);
  s.car.lateralX = laneCenterX(2);
  s.distance = 10;
  s.car.jumpCharges = 0; // start empty so a refill is unambiguous
  return s;
}

describe('lift pickups', () => {
  it('banks one jump charge and consumes the pickup', () => {
    const s = cruising();
    putPickup(s, 2, 8);
    resolvePickups(s);

    expect(s.pickups[0].taken).toBe(true);
    expect(s.car.jumpCharges).toBe(1);
    expect(s.events.filter((e) => e.type === 'pickupCollected')).toHaveLength(1);
  });

  it('never refills past the cap', () => {
    const s = cruising();
    s.car.jumpCharges = CAR_TUNING.jumpMaxCharges;
    putPickup(s, 2, 8);
    resolvePickups(s);
    expect(s.car.jumpCharges).toBe(CAR_TUNING.jumpMaxCharges);
    // The pickup is still consumed even when it tops out — no free re-grab later.
    expect(s.pickups[0].taken).toBe(true);
  });

  it('cannot be gathered while jumping — the air trades the fuel away', () => {
    const s = cruising();
    s.car.height = 1.0; // above the jump clearance
    putPickup(s, 2, 8);
    resolvePickups(s);
    expect(s.pickups[0].taken).toBe(false);
    expect(s.car.jumpCharges).toBe(0);
  });

  it('pays each pickup exactly once', () => {
    const s = cruising();
    putPickup(s, 2, 8);
    resolvePickups(s);
    resolvePickups(s);
    expect(s.car.jumpCharges).toBe(1);
  });

  it('ignores a pickup in another lane', () => {
    const s = cruising();
    putPickup(s, 0, 8); // far lane, car is in lane 2
    resolvePickups(s);
    expect(s.pickups[0].taken).toBe(false);
    expect(s.car.jumpCharges).toBe(0);
  });
});

describe('health and ammo pickups', () => {
  it('a health pickup repairs the hull, capped at full', () => {
    const s = createSim(1);
    s.car.lateralX = laneCenterX(2);
    s.distance = 10;
    s.car.health = 0.5;
    s.pickups.push({ kind: 'health', lane: 2, x: laneCenterX(2), forward: 8, phase: 0, taken: false });
    resolvePickups(s);
    expect(s.car.health).toBeCloseTo(
      Math.min(0.5 + PICKUP_TUNING.healthRestore, CAR_TUNING.maxHealth),
    );
    expect(s.pickups[0].taken).toBe(true);
    expect(s.events.some((e) => e.type === 'pickupCollected' && e.kind === 'health')).toBe(true);
  });

  it('never repairs past full hull', () => {
    const s = createSim(1);
    s.car.lateralX = laneCenterX(2);
    s.distance = 10;
    s.car.health = CAR_TUNING.maxHealth;
    s.pickups.push({ kind: 'health', lane: 2, x: laneCenterX(2), forward: 8, phase: 0, taken: false });
    resolvePickups(s);
    expect(s.car.health).toBe(CAR_TUNING.maxHealth);
    expect(s.pickups[0].taken).toBe(true);
  });

  it('an ammo box refills the gun, capped at the max', () => {
    const s = createSim(1);
    s.car.lateralX = laneCenterX(2);
    s.distance = 10;
    s.car.ammo = 0;
    s.pickups.push({ kind: 'ammo', lane: 2, x: laneCenterX(2), forward: 8, phase: 0, taken: false });
    resolvePickups(s);
    expect(s.car.ammo).toBe(PICKUP_TUNING.ammoRestore);
    expect(s.pickups[0].taken).toBe(true);
    expect(s.events.some((e) => e.type === 'pickupCollected' && e.kind === 'ammo')).toBe(true);
  });
});
