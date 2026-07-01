import { describe, expect, it } from 'vitest';
import { createSim, step, NO_INTENT } from '../src/sim';
import { CHUNK_LENGTH, INTRO_TUNING, SPAWN_TUNING } from '../src/content/tuning';

/**
 * The run-opening cinematic contract: the sim runs `INTRO_TUNING.ticks` with no
 * input before the player gets control, so that whole stretch must be harmless —
 * a hit the player cannot dodge would be an unattributable death
 * (docs/DESIGN.md → death is always a player decision). The intro must therefore
 * fit inside the spawn-free grace chunks for any seed.
 */
describe('run-opening intro', () => {
  it('stays inside the spawn-free grace, so no seed can touch the car', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const s = createSim(seed);
      for (let t = 0; t < INTRO_TUNING.ticks; t += 1) step(s, NO_INTENT);
      expect(s.dead).toBe(false);
      expect(s.car.health).toBe(1);
      expect(s.car.clinging).toBe(0);
      // Not just unhurt by luck: the whole intro fits before spawns can exist.
      expect(s.distance).toBeLessThan(SPAWN_TUNING.graceChunks * CHUNK_LENGTH);
    }
  });

  it('leaves the camera beats a sane split', () => {
    expect(INTRO_TUNING.dollyFrac).toBeGreaterThan(0);
    expect(INTRO_TUNING.dollyFrac).toBeLessThan(1);
  });
});
