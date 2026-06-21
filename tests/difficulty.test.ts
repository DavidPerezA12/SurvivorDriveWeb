import { describe, expect, it } from 'vitest';
import { chunkAt, safeLane, type Spawn } from '../src/sim';
import { cruisingSpeed } from '../src/sim/car';
import { CAR_TUNING, CHUNK_LENGTH } from '../src/content/tuning';
import {
  DIFFICULTY_TUNING,
  intensityAt,
  lethalityAt,
  openChanceAt,
  pickupScaleAt,
} from '../src/content/acts';

/**
 * Difficulty escalation (docs/DESIGN.md → greed is the slider; the run must keep
 * tightening rather than plateau). The act tables set each band's character; these
 * distance-driven curves ride on top so pressure climbs continuously across a run
 * and into the endless tail. All pure functions of distance, so the road stays
 * deterministic per seed.
 */

const THREATS = new Set<Spawn['kind']>([
  'wreck',
  'rig',
  'boulder',
  'barrel',
  'drifter',
  'meteor',
  'gap',
  'zombie',
]);

/** The "read the line or die" hazards the lethality curve over-weights deep in. */
const LETHAL = new Set<Spawn['kind']>(['rig', 'meteor', 'gap']);

/** Count threat spawns over a window of chunks at a given starting distance. */
function threatsOverWindow(seed: number, startMeters: number, chunks: number): number {
  const start = Math.floor(startMeters / CHUNK_LENGTH);
  let count = 0;
  for (let i = start; i < start + chunks; i += 1) {
    for (const s of chunkAt(seed, i).spawns) if (THREATS.has(s.kind)) count += 1;
  }
  return count;
}

/** Share of threats that are deadly-line hazards over a window of chunks. */
function lethalShare(startMeters: number, chunks: number, seeds: number[]): number {
  const start = Math.floor(startMeters / CHUNK_LENGTH);
  let threats = 0;
  let lethal = 0;
  for (const seed of seeds) {
    for (let i = start; i < start + chunks; i += 1) {
      for (const s of chunkAt(seed, i).spawns) {
        if (!THREATS.has(s.kind)) continue;
        threats += 1;
        if (LETHAL.has(s.kind)) lethal += 1;
      }
    }
  }
  return threats === 0 ? 0 : lethal / threats;
}

describe('speed ramp', () => {
  it('keeps climbing past the early ramp instead of plateauing', () => {
    // The old ramp flattened at earlyRampDistance, inside act I; difficulty stops
    // escalating after that. The late ramp must keep raising cruising speed well
    // beyond it.
    const early = cruisingSpeed(CAR_TUNING.earlyRampDistance);
    expect(cruisingSpeed(20000)).toBeGreaterThan(early);
    expect(cruisingSpeed(50000)).toBeGreaterThan(cruisingSpeed(20000));
  });

  it('is bounded by the full two-stage gain', () => {
    const max = CAR_TUNING.baseTopSpeed + CAR_TUNING.earlyGain + CAR_TUNING.lateGain;
    expect(cruisingSpeed(0)).toBeCloseTo(CAR_TUNING.baseTopSpeed);
    expect(cruisingSpeed(1e9)).toBeCloseTo(max);
    expect(cruisingSpeed(1e9)).toBeLessThanOrEqual(max + 1e-6);
  });
});

describe('intensity curve', () => {
  it('eases in below the table at the start, then climbs to the cap', () => {
    expect(intensityAt(0)).toBeCloseTo(DIFFICULTY_TUNING.intensityStart);
    expect(intensityAt(DIFFICULTY_TUNING.intensityWarmup)).toBeCloseTo(1);
    expect(intensityAt(1e9)).toBeCloseTo(DIFFICULTY_TUNING.intensityMax);
  });

  it('never decreases with distance', () => {
    let prev = -Infinity;
    for (let d = 0; d <= 80000; d += 500) {
      const v = intensityAt(d);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });
});

describe('pickup scarcity curve', () => {
  it('is generous early and scarce deep, within bounds', () => {
    expect(pickupScaleAt(0)).toBeCloseTo(DIFFICULTY_TUNING.pickupScaleStart);
    expect(pickupScaleAt(1e9)).toBeCloseTo(DIFFICULTY_TUNING.pickupScaleMin);
  });

  it('never increases with distance', () => {
    let prev = Infinity;
    for (let d = 0; d <= 80000; d += 500) {
      const v = pickupScaleAt(d);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });
});

describe('lethality curve', () => {
  it('over-weights the deadly-line hazards more the deeper in', () => {
    expect(lethalityAt(0)).toBeCloseTo(DIFFICULTY_TUNING.lethalityStart);
    expect(lethalityAt(1e9)).toBeCloseTo(DIFFICULTY_TUNING.lethalityMax);
    expect(lethalityAt(40000)).toBeGreaterThan(lethalityAt(10000));
  });
});

describe('pacing curve', () => {
  it('leaves more open road in the opening than deep in, within bounds', () => {
    expect(openChanceAt(DIFFICULTY_TUNING.intensityStart)).toBeCloseTo(DIFFICULTY_TUNING.openChanceStart);
    expect(openChanceAt(DIFFICULTY_TUNING.intensityMax)).toBeCloseTo(DIFFICULTY_TUNING.openChanceDeep);
    // Clamped outside the intensity range.
    expect(openChanceAt(0)).toBeCloseTo(DIFFICULTY_TUNING.openChanceStart);
    expect(openChanceAt(10)).toBeCloseTo(DIFFICULTY_TUNING.openChanceDeep);
  });

  it('breathers thin out with distance on the actual road', () => {
    // The eased-in opening must run more open chunks than the deep tail, so the
    // road breathes early and turns near wall-to-wall late.
    const openFrac = (startMeters: number): number => {
      const start = Math.floor(startMeters / CHUNK_LENGTH);
      let open = 0;
      for (let i = start; i < start + 500; i += 1) {
        if (chunkAt(7, i).spawns.length === 0) open += 1;
      }
      return open / 500;
    };
    expect(openFrac(500)).toBeGreaterThan(openFrac(54000));
  });
});

describe('escalation lands on the actual road', () => {
  it('packs more threats into a deep band than into the eased-in opening', () => {
    // The opening eases in below the table; the deep tail rides the full intensity
    // curve into the clamp. A small window in each isolates the band.
    const window = 100;
    for (const seed of [1, 42, 7777]) {
      const opening = threatsOverWindow(seed, 300, window); // act I, intensity eased down
      const deep = threatsOverWindow(seed, 30000, window); // act VI tail, near the clamp
      expect(deep).toBeGreaterThan(opening);
    }
  });

  it('keeps turning the mix deadlier into the endless tail, past where density clamps', () => {
    // Density saturates the clamp early in the tail, so the count flatlines; the
    // composition must not. A band deep in the tail carries a higher share of
    // deadly-line hazards than one at its start.
    const seeds = [1, 42, 7777, 0xc0ffee, 5];
    const tailStart = lethalShare(30000, 300, seeds);
    const tailDeep = lethalShare(70000, 300, seeds);
    expect(tailDeep).toBeGreaterThan(tailStart);
  });

  it('still leaves the safe lane empty deep into the escalation', () => {
    // The safe-line invariant cannot erode as the world gets denser.
    for (const seed of [1, 42, 7777]) {
      for (let i = 1000; i < 1400; i += 1) {
        const safe = safeLane(seed, i);
        for (const s of chunkAt(seed, i).spawns) expect(s.lane).not.toBe(safe);
      }
    }
  });

  it('never turns a non-safe lane into a guaranteed wall (lines stay open)', () => {
    // At full intensity the threat share is clamped, so across a deep stretch some
    // non-safe lanes must still come up without a threat (open road or a pickup),
    // or greed lanes would be impassable.
    let openOrPickupLanes = 0;
    for (const seed of [1, 42, 7777]) {
      for (let i = 1200; i < 1400; i += 1) {
        const safe = safeLane(seed, i);
        const threatened = new Set<number>();
        for (const s of chunkAt(seed, i).spawns) if (THREATS.has(s.kind)) threatened.add(s.lane);
        for (let lane = 0; lane < 4; lane += 1) {
          if (lane !== safe && !threatened.has(lane)) openOrPickupLanes += 1;
        }
      }
    }
    expect(openOrPickupLanes).toBeGreaterThan(0);
  });
});
