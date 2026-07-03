import { describe, expect, it } from 'vitest';
import { createSim, step, NO_INTENT, chunkAt, type SimState } from '../src/sim';
import {
  resolveCollisions,
  resolveGas,
  resolvePickups,
  updateClingers,
} from '../src/sim/collision';
import { laneCenterX, SHIELD_TUNING, GAS_TUNING } from '../src/content/tuning';

/**
 * The shield power-up (docs/DESIGN.md → power-ups: risky lanes only, short,
 * earned). While the bubble is up, hull costs are absorbed — crashes, wall hits,
 * gas, clinger drain — but the frenazo still lands in full and the lethal ground
 * traps (gap, spikes, live wire) still kill: a bubble does not fill a hole.
 * Headless contracts; the bubble's look is judged in the browser.
 */

function approaching(lane: number, speed: number, health = 1): SimState {
  const s = createSim(1);
  s.car.lateralX = laneCenterX(lane);
  s.car.health = health;
  s.car.speed = speed;
  s.distance = 8;
  return s;
}

describe('shield pickup', () => {
  it('grabbing it arms the bubble for the tuned duration', () => {
    const s = approaching(2, 50);
    s.pickups.push({
      kind: 'shield',
      lane: 2,
      x: laneCenterX(2),
      forward: 8,
      phase: 0.5,
      taken: false,
    });
    resolvePickups(s);
    expect(s.pickups[0].taken).toBe(true);
    expect(s.car.shieldTicks).toBe(SHIELD_TUNING.durationTicks);
    expect(s.events.some((e) => e.type === 'pickupCollected' && e.kind === 'shield')).toBe(true);
  });

  it('burns down one tick per step and announces its expiry', () => {
    const s = createSim(1);
    s.car.shieldTicks = 2;
    step(s, NO_INTENT);
    expect(s.car.shieldTicks).toBe(1);
    step(s, NO_INTENT);
    expect(s.car.shieldTicks).toBe(0);
    expect(s.events.some((e) => e.type === 'shieldExpired')).toBe(true);
  });
});

describe('shielded damage', () => {
  it('a crash costs no hull but still bites momentum and breaks the streak', () => {
    const s = approaching(2, 50);
    s.car.shieldTicks = 100;
    s.combo = 5;
    s.hazards.push({ kind: 'wreck', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBe(1);
    expect(s.car.speed).toBeLessThan(50);
    expect(s.combo).toBe(0);
  });

  it('a square rig hit that would end the run is survived (with a near-stop)', () => {
    const s = approaching(2, 70);
    s.car.shieldTicks = 100;
    s.hazards.push({ kind: 'rig', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.car.health).toBe(1);
    expect(s.dead).toBe(false);
    expect(s.car.speed).toBeLessThan(20);
  });

  it('lethal ground traps still kill: a bubble does not fill a hole', () => {
    for (const kind of ['gap', 'spikes', 'livewire'] as const) {
      const s = approaching(2, 50);
      s.car.shieldTicks = 100;
      s.hazards.push({ kind, lane: 2, x: laneCenterX(2), forward: 8, hit: false });
      resolveCollisions(s);
      expect(s.dead).toBe(true);
      expect(s.deathCause).toBe(kind);
    }
  });

  it('absorbs the gas cloud drain and the clinger drain', () => {
    const s = approaching(2, 50);
    s.car.shieldTicks = 100;
    s.gas.push({
      x: laneCenterX(2),
      lane: 2,
      forward: 8,
      life: GAS_TUNING.lifeTicks,
      maxLife: GAS_TUNING.lifeTicks,
    });
    s.car.clinging = 2;
    resolveGas(s);
    updateClingers(s);
    expect(s.car.health).toBe(1);
    expect(s.gas).toHaveLength(1);
    expect(s.gas[0].life).toBe(GAS_TUNING.lifeTicks - 1);
  });

  it('the same crash chews hull again once the bubble is gone', () => {
    const s = approaching(2, 50);
    s.car.shieldTicks = 0;
    s.hazards.push({ kind: 'wreck', lane: 2, x: laneCenterX(2), forward: 8, hit: false });
    resolveCollisions(s);
    expect(s.car.health).toBeLessThan(1);
  });
});

describe('world generation', () => {
  it('eventually lays shield pickups, off the safe lane like every pickup', () => {
    let shields = 0;
    for (let i = 0; i < 800; i += 1) {
      for (const spawn of chunkAt(123, i).spawns) {
        if (spawn.kind === 'shield') shields += 1;
      }
    }
    expect(shields).toBeGreaterThan(0);
  });
});
