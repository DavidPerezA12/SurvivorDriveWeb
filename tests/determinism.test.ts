import { describe, expect, it } from 'vitest';
import { createSim, step, NO_INTENT, type Intent, type SimState } from '../src/sim';

/**
 * The prime determinism gate (docs/ARCHITECTURE.md → Testing strategy).
 * Same `(seed, intents)` twice ⇒ byte-for-byte identical final state. Everything
 * downstream — shareable death-card seeds, the Daily Apocalypse, replay debugging
 * — depends on this holding from M0 onward.
 */
function run(seed: number, intents: Intent[], totalTicks: number): SimState {
  const state = createSim(seed);
  for (let i = 0; i < totalTicks; i += 1) {
    step(state, intents[i] ?? NO_INTENT);
  }
  return state;
}

const script: Intent[] = [
  { steer: 1, jump: false, fire: false },
  { steer: 0, jump: true, fire: false },
  { steer: 1, jump: false, fire: true },
  { steer: -1, jump: false, fire: true },
  { steer: -1, jump: true, fire: false },
  { steer: -1, jump: false, fire: true },
  { steer: 1, jump: false, fire: true },
];

describe('determinism', () => {
  it('produces identical state for the same seed and intents', () => {
    // 600 ticks (~10 s) drives well past the grace zone, so this now exercises
    // the full seeded world — spawns, mowing, scrap, damage — not just the car.
    const a = run(1337, script, 600);
    const b = run(1337, script, 600);
    expect(a).toEqual(b);
  });

  it('keeps the car path seed-independent inside the opening grace zone', () => {
    // Before any spawned content is reached, the car path cannot depend on the
    // seed — there is nothing seeded to interact with yet.
    const a = run(1, script, 120);
    const b = run(2, script, 120);
    expect(a.car).toEqual(b.car);
  });

  it('diverges between seeds once it reaches the seeded world', () => {
    // Far enough in to hit different roads: the worlds — and therefore what the
    // car mows and crashes into — must differ between seeds.
    const a = run(1, script, 1500);
    const b = run(2, script, 1500);
    expect(a).not.toEqual(b);
    // Something seeded actually happened in at least one of the runs.
    expect(a.zombiesMowed + a.scrap + b.zombiesMowed + b.scrap).toBeGreaterThan(0);
  });
});
