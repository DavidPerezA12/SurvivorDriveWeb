import { describe, expect, it } from 'vitest';
import { FORMATIONS } from '../src/content/formations';
import {
  BEAM_TUNING,
  CAR_TUNING,
  LOOKAHEAD,
  METEOR_TUNING,
  MIN_LETHAL_TELEGRAPH_SECONDS,
  MOW_TUNING,
} from '../src/content/tuning';

/**
 * Cross-cutting fairness contracts for the authored set-pieces. These tests use
 * the fastest speed the car can actually reach, including the capped mow surge,
 * so a tuning change cannot silently shorten a warning below the design floor.
 */
describe('set-piece contracts', () => {
  const maxCruise = CAR_TUNING.baseTopSpeed + CAR_TUNING.earlyGain + CAR_TUNING.lateGain;
  const maxForwardSpeed = maxCruise + MOW_TUNING.overspeedCap;

  it('keeps every distance-driven lethal telegraph at or above two seconds', () => {
    const meteorSeconds = (METEOR_TUNING.telegraphGap - METEOR_TUNING.impactGap) / maxForwardSpeed;
    const beamSeconds = BEAM_TUNING.startGap / maxForwardSpeed;
    const horizonSeconds = LOOKAHEAD / maxForwardSpeed;

    expect(meteorSeconds).toBeGreaterThanOrEqual(MIN_LETHAL_TELEGRAPH_SECONDS);
    expect(beamSeconds).toBeGreaterThanOrEqual(MIN_LETHAL_TELEGRAPH_SECONDS);
    // Quakes and static lethal blockers telegraph by being visible from the
    // materialization horizon rather than by starting a moving phase.
    expect(horizonSeconds).toBeGreaterThanOrEqual(MIN_LETHAL_TELEGRAPH_SECONDS);
  });

  it('ships every named set-piece as typed data with an open relative line', () => {
    const ids = [
      'quake-split',
      'beam-sweep',
      'collapse-ramp',
      'horde-surge',
      'trex-rampage',
      'mecha-barrage',
      'meteor-storm',
    ] as const;

    for (const id of ids) {
      const formation = FORMATIONS.find((candidate) => candidate.id === id);
      expect(formation, id).toBeDefined();
      if (!formation) continue;
      expect(formation.cells.length, id).toBeGreaterThan(0);
      // `off: 0` is the current chunk's safe line. Keeping every event cell off
      // it means the formation always leaves at least one route open.
      expect(
        formation.cells.every((cell) => cell.off !== 0),
        id,
      ).toBe(true);
      expect(
        formation.acts.some((weight) => weight > 0),
        id,
      ).toBe(true);
    }
  });
});
