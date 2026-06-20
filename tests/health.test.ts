import { describe, expect, it } from 'vitest';
import { createSim, type CarState, type FrameEvent } from '../src/sim';
import { applyCrash, isCritical } from '../src/sim/health';

/**
 * Hull damage (docs/DESIGN.md → Pillar 2). The car is one health bar, not a set
 * of parts: a crash chews into the hull scaled by impact and squareness, armor
 * scales the loss, and at 0 the hull is destroyed. Damage never touches the
 * controls — that contract lives in `car.test.ts` (the jump/steer tests).
 */

function freshCar(): CarState {
  return createSim(1).car;
}

describe('hull damage', () => {
  it('a square head-on hit takes more hull than a glancing clip', () => {
    const frontal = freshCar();
    const glancing = freshCar();
    applyCrash(frontal, 58, false, []);
    applyCrash(glancing, 58, true, []);
    expect(frontal.health).toBeLessThan(glancing.health);
    expect(glancing.health).toBeLessThan(1);
  });

  it('scales hull loss with impact speed', () => {
    const slow = freshCar();
    const fast = freshCar();
    applyCrash(slow, 15, false, []);
    applyCrash(fast, 58, false, []);
    expect(fast.health).toBeLessThan(slow.health);
  });

  it('emits a hullDamaged event carrying the amount lost', () => {
    const car = freshCar();
    const out: FrameEvent[] = [];
    applyCrash(car, 58, false, out);
    const ev = out.find((e) => e.type === 'hullDamaged');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'hullDamaged') {
      expect(ev.amount).toBeGreaterThan(0);
      expect(ev.destroyed).toBe(false);
    }
  });

  it('clamps a destroyed hull at zero and flags it', () => {
    const car = freshCar();
    car.health = 0.1;
    const out: FrameEvent[] = [];
    applyCrash(car, 58, false, out);
    expect(car.health).toBe(0);
    expect(out.some((e) => e.type === 'hullDamaged' && e.destroyed)).toBe(true);
  });

  it('armor (damageMul < 1) keeps more hull from the same hit', () => {
    const tough = freshCar();
    const stock = freshCar();
    applyCrash(tough, 58, false, [], 0.6);
    applyCrash(stock, 58, false, []);
    expect(tough.health).toBeGreaterThan(stock.health);
  });

  it('isCritical flags a low but non-empty hull', () => {
    expect(isCritical(0.1)).toBe(true);
    expect(isCritical(0.8)).toBe(false);
    expect(isCritical(0)).toBe(false);
  });
});
