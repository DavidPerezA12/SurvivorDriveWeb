import { describe, expect, it } from 'vitest';
import { createSim, step, NO_INTENT, type SimState } from '../src/sim';
import {
  resolveJumpers,
  resolveShots,
  resolveCollisions,
  updateClingers,
} from '../src/sim/collision';
import { chunkAt, safeLane } from '../src/sim';
import { JUMPER_TUNING, CAR_TUNING, SPAWN_TUNING, laneCenterX } from '../src/content/tuning';

/**
 * The jumper zombie is the one threat that reaches the safe line (docs/DESIGN.md):
 * a leaper that latches onto the hood and drains hull regardless of lane, shaken off
 * by shooting (one per shot) or crashing (all at once), never mowed for scrap. These
 * lock the headless contract; the leap/cling feel is judged in the browser.
 */

/** A live jumper sitting at `forward` in `lane`, ready to leap. */
function putJumper(state: SimState, lane: number, forward: number): void {
  state.zombies.push({
    lane,
    x: laneCenterX(lane),
    forward,
    phase: 0,
    mowed: false,
    jumper: true,
  });
}

/** A grounded car at a known place in the centre lane. */
function cruising(): SimState {
  const s = createSim(1);
  s.car.lateralX = laneCenterX(1);
  s.distance = 10;
  return s;
}

describe('jumper latch', () => {
  it('leaps onto the hood from the adjacent lane — it reaches the safe line', () => {
    const s = cruising(); // car in lane 1
    putJumper(s, 0, 9); // one lane over (dx = one lane width < leapLateral)
    resolveJumpers(s);
    expect(s.car.clinging).toBe(1);
    expect(s.zombies[0].mowed).toBe(true);
    expect(s.events.some((e) => e.type === 'jumperLatched')).toBe(true);
  });

  it('pays no scrap — a latch is hull pressure, not a kill reward', () => {
    const s = cruising();
    const before = s.scrap;
    putJumper(s, 1, 9);
    resolveJumpers(s);
    expect(s.car.clinging).toBe(1);
    expect(s.scrap).toBe(before);
  });

  it('a jump sails over the leap', () => {
    const s = cruising();
    s.car.height = 1.0; // airborne
    putJumper(s, 1, 9);
    resolveJumpers(s);
    expect(s.car.clinging).toBe(0);
    expect(s.zombies[0].mowed).toBe(false);
  });

  it('never latches more than the cling cap', () => {
    const s = cruising();
    for (let i = 0; i < JUMPER_TUNING.maxClinging + 3; i += 1) putJumper(s, 1, 9);
    resolveJumpers(s);
    expect(s.car.clinging).toBe(JUMPER_TUNING.maxClinging);
  });
});

describe('jumper drain and death', () => {
  it('drains the hull every tick while clinging', () => {
    const s = cruising();
    s.car.clinging = 1;
    s.car.health = 1;
    updateClingers(s);
    expect(s.car.health).toBeCloseTo(1 - JUMPER_TUNING.drainPerTick);
    expect(s.dead).toBe(false);
  });

  it('drains faster with more clingers', () => {
    const s = cruising();
    s.car.clinging = 2;
    s.car.health = 1;
    updateClingers(s);
    expect(s.car.health).toBeCloseTo(1 - 2 * JUMPER_TUNING.drainPerTick);
  });

  it('ends the run, attributed to the jumper, when the drain empties the hull', () => {
    const s = cruising();
    s.car.clinging = 1;
    s.car.health = JUMPER_TUNING.drainPerTick / 2; // one tick finishes it
    updateClingers(s);
    expect(s.car.health).toBe(0);
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('jumper');
    expect(s.events.some((e) => e.type === 'died')).toBe(true);
  });
});

describe('shaking jumpers off', () => {
  it('a fired shot peels one clinger off', () => {
    const s = cruising();
    s.car.clinging = 2;
    s.car.ammo = 10;
    s.car.fireCooldown = 0;
    resolveShots(s, { steer: 0, jump: false, fire: true });
    expect(s.car.clinging).toBe(1);
    expect(s.events.some((e) => e.type === 'jumperShed')).toBe(true);
  });

  it('a crash shakes them all loose', () => {
    const s = cruising();
    s.car.clinging = 2;
    s.car.health = 1;
    s.car.speed = 40;
    // A wreck squarely in the car's lane this tick: the ram is the shed counter.
    s.hazards.push({ kind: 'wreck', lane: 1, x: laneCenterX(1), forward: 9, hit: false });
    resolveCollisions(s);
    expect(s.car.clinging).toBe(0);
    expect(s.events.some((e) => e.type === 'jumperShed')).toBe(true);
  });
});

describe('jumper vs the gun and the bumper', () => {
  it('is shootable before it leaps, and pays scrap like a normal kill', () => {
    const s = cruising();
    const before = s.scrap;
    s.car.ammo = 10;
    s.car.fireCooldown = 0;
    putJumper(s, 1, 18); // ahead in the lane, within gun range
    resolveShots(s, { steer: 0, jump: false, fire: true });
    expect(s.zombies[0].mowed).toBe(true);
    expect(s.car.clinging).toBe(0);
    expect(s.scrap).toBeGreaterThan(before);
  });

  it('is not mowed for scrap on contact — it latches instead', () => {
    const s = cruising();
    const before = s.scrap;
    putJumper(s, 1, 9);
    step(s, NO_INTENT); // a full tick: resolveJumpers runs before resolveMows
    expect(s.car.clinging).toBe(1);
    expect(s.scrap).toBe(before);
  });
});

describe('jumpers in world gen', () => {
  it('spawns jumpers off the safe lane past the early acts', () => {
    let jumpers = 0;
    let offSafe = true;
    for (let seed = 1; seed < 30; seed += 1) {
      for (let i = SPAWN_TUNING.graceChunks; i < 400; i += 1) {
        const safe = safeLane(seed, i);
        for (const sp of chunkAt(seed, i).spawns) {
          if (sp.kind === 'zombie' && sp.jumper) {
            jumpers += 1;
            if (sp.lane === safe) offSafe = false;
          }
        }
      }
    }
    expect(jumpers).toBeGreaterThan(0);
    expect(offSafe).toBe(true);
    // sanity: the cling cap and drain are sane numbers
    expect(JUMPER_TUNING.drainPerTick).toBeGreaterThan(0);
    expect(CAR_TUNING.startHealth).toBeGreaterThan(JUMPER_TUNING.drainPerTick);
  });
});
