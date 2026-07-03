import { describe, expect, it } from 'vitest';
import {
  BIOME_BAND_M,
  biomeAt,
  biomeForBand,
  biomeStateAt,
  createBiomeState,
} from '../src/content/biomes';
import { makeCar, stepCar, NEUTRAL_HANDLING } from '../src/sim/car';
import { BASE_LOADOUT } from '../src/content/upgrades';
import { CHUNK_LENGTH } from '../src/content/tuning';
import { chunkAt } from '../src/sim';
import type { FrameEvent } from '../src/sim';

/**
 * Biomes are the geographic layer (docs/DESIGN.md → biomes): deterministic bands of
 * environment over distance that modify handling (the snow slide) and the look. The
 * sim reads the handling, so these lock the determinism contract and the slip feel.
 */
describe('biome layer', () => {
  const sample = (seed: number, distance: number) =>
    biomeStateAt(seed, distance, createBiomeState());

  it('is deterministic per (seed, distance)', () => {
    for (const seed of [1, 42, 7777]) {
      for (const d of [0, 1234, 6000, 25000]) {
        expect(sample(seed, d)).toEqual(sample(seed, d));
      }
    }
  });

  it('reuses the caller-owned state and look buffers', () => {
    const out = createBiomeState();
    const look = out.look;
    expect(biomeStateAt(7, BIOME_BAND_M + 100, out)).toBe(out);
    expect(out.look).toBe(look);
    expect(biomeStateAt(7, BIOME_BAND_M * 3 + 200, out)).toBe(out);
    expect(out.look).toBe(look);
  });

  it('always opens on the neutral open road (band 0)', () => {
    for (const seed of [1, 42, 7777, 0xc0ffee]) {
      const b = biomeForBand(seed, 0);
      expect(b.id).toBe('highway');
      expect(b.steerOmegaMul).toBe(1);
      expect(b.steerDampingMul).toBe(1);
      expect(b.look.amount).toBe(0);
      expect(b.precip).toBe(0);
      // The first band start is the neutral wheel, no biome look.
      const s = sample(seed, 10);
      expect(s.steerOmegaMul).toBe(1);
      expect(s.look.amount).toBe(0);
    }
  });

  it('lays every biome across a run (the rotation is real, not stuck)', () => {
    const ids = new Set<string>();
    for (const seed of [1, 7, 42]) {
      for (let band = 0; band < 120; band += 1) ids.add(biomeForBand(seed, band).id);
    }
    for (const id of ['highway', 'snow', 'desert', 'tunnel', 'bridge', 'lava']) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('holds the deep biomes (bridge, lava) out of the opening bands', () => {
    // Bridge/lava have a `minBand`, so the opening stays the intact teaching ground
    // (and the early-acts-gap-free invariant in gap.test holds). With the compressed
    // pacing (bands of 1800 m, bridge from band 4 = 7.2 km) the guarded opening is
    // bands 0-3: acts I-II, before the act III spectacle starts.
    for (const seed of [1, 7, 42, 123, 2024, 0xc0ffee]) {
      for (let band = 0; band < 4; band += 1) {
        const id = biomeForBand(seed, band).id;
        expect(id).not.toBe('bridge');
        expect(id).not.toBe('lava');
      }
    }
  });

  it('keeps every modifier in range and the look amount blends 0..1', () => {
    for (const seed of [1, 7, 42]) {
      for (let d = 0; d < 40000; d += 137) {
        const s = sample(seed, d);
        expect(s.look.amount).toBeGreaterThanOrEqual(0);
        expect(s.look.amount).toBeLessThanOrEqual(1);
        expect(s.precip).toBeGreaterThanOrEqual(0);
        expect(s.precip).toBeLessThanOrEqual(1);
        expect(s.steerOmegaMul).toBeGreaterThan(0);
        expect(s.steerOmegaMul).toBeLessThanOrEqual(1);
        expect(s.steerDampingMul).toBeGreaterThan(0);
        expect(s.steerDampingMul).toBeLessThanOrEqual(1);
        // The sightline multipliers are always positive (fog distances stay valid).
        expect(s.look.fogNearMul).toBeGreaterThan(0);
        expect(s.look.fogFarMul).toBeGreaterThan(0);
      }
    }
  });

  it('eases the look across a band transition (no snap into a biome)', () => {
    // Find a seed/band where the look amount actually changes, then sample just inside
    // the new band: the effective amount must sit between the two biomes, not snap.
    let checked = false;
    for (let band = 1; band < 40 && !checked; band += 1) {
      const prev = biomeForBand(1, band - 1);
      const cur = biomeForBand(1, band);
      if (prev.look.amount === cur.look.amount) continue;
      const start = band * BIOME_BAND_M;
      const blended = sample(1, start + 1); // 1 m into the new band
      const lo = Math.min(prev.look.amount, cur.look.amount);
      const hi = Math.max(prev.look.amount, cur.look.amount);
      expect(blended.look.amount).toBeGreaterThanOrEqual(lo);
      expect(blended.look.amount).toBeLessThanOrEqual(hi);
      // Right at the boundary it is still mostly the previous biome, not the full new one.
      expect(blended.look.amount).not.toBe(cur.look.amount);
      checked = true;
    }
    expect(checked).toBe(true);
  });

  it('reports the band liquid flat mid-band and eased across the boundary', () => {
    // Mid-band the state is the band's own liquid, full strength; just inside a
    // band boundary it must be partial (the sea wells up / drains away, no snap).
    let flatChecked = false;
    let blendChecked = false;
    for (const seed of [1, 7, 42, 123, 2024]) {
      for (let band = 5; band < 80; band += 1) {
        const cur = biomeForBand(seed, band);
        const mid = sample(seed, band * BIOME_BAND_M + BIOME_BAND_M / 2);
        expect(mid.sea).toBe(cur.liquid === 'sea' ? 1 : 0);
        expect(mid.lava).toBe(cur.liquid === 'lava' ? 1 : 0);
        if (cur.liquid !== 'none') flatChecked = true;
        const prev = biomeForBand(seed, band - 1);
        if (prev.liquid === 'none' && cur.liquid !== 'none') {
          const inBlend = sample(seed, band * BIOME_BAND_M + 100); // 100 m in
          const amt = cur.liquid === 'sea' ? inBlend.sea : inBlend.lava;
          expect(amt).toBeGreaterThan(0);
          expect(amt).toBeLessThan(1);
          blendChecked = true;
        }
      }
    }
    expect(flatChecked).toBe(true);
    expect(blendChecked).toBe(true);
  });

  it('discrete biomeAt matches biomeForBand', () => {
    for (const seed of [1, 42]) {
      for (let band = 0; band < 20; band += 1) {
        const d = band * BIOME_BAND_M + BIOME_BAND_M / 2; // mid-band
        expect(biomeAt(seed, d).id).toBe(biomeForBand(seed, band).id);
      }
    }
  });

  it('the bridge/lava jump bias fills those stretches with holes and ramps', () => {
    // Across many deep chunks, the gap/ramp spawn rate inside a jump-biased biome must
    // clearly beat the rate in the neutral open road — the bias actually surfaces leaps.
    let jumpInBias = 0;
    let chunksInBias = 0;
    let jumpInHighway = 0;
    let chunksInHighway = 0;
    for (const seed of [1, 7, 42, 123, 2024]) {
      // Deep range (past bridge/lava minBand) where both kinds of band occur.
      for (let i = 260; i < 1400; i += 1) {
        const biome = biomeAt(seed, i * CHUNK_LENGTH).id;
        const inBias = biome === 'bridge' || biome === 'lava';
        if (!inBias && biome !== 'highway') continue;
        const jumps = chunkAt(seed, i).spawns.filter(
          (s) => s.kind === 'gap' || s.kind === 'ramp',
        ).length;
        if (inBias) {
          chunksInBias += 1;
          jumpInBias += jumps;
        } else {
          chunksInHighway += 1;
          jumpInHighway += jumps;
        }
      }
    }
    expect(chunksInBias).toBeGreaterThan(0);
    expect(chunksInHighway).toBeGreaterThan(0);
    const biasRate = jumpInBias / chunksInBias;
    const highwayRate = jumpInHighway / chunksInHighway;
    expect(biasRate).toBeGreaterThan(highwayRate);
  });
});

describe('snow handling slides where the open road grips', () => {
  /**
   * Cut the wheel hard then centre it from a fixed lateral speed, and return how far
   * the car coasts before it settles. With the free wheel, ice's tell is the brake:
   * `dampingMul` < 1 weakens it, so the car keeps gliding after you let go where the
   * open road plants and stops almost on the spot.
   */
  function coastDistance(handling: { omegaMul: number; dampingMul: number }): number {
    const car = makeCar(BASE_LOADOUT);
    car.lateralVel = 12; // the wheel was just cut; now it centres
    const startX = car.lateralX;
    const out: FrameEvent[] = [];
    for (let i = 0; i < 120; i += 1) {
      stepCar(car, { steer: 0, jump: false, fire: false }, 60, 1 / 60, out, BASE_LOADOUT, handling);
    }
    return car.lateralX - startX;
  }

  it('the open road grips: the car stops promptly when you let the wheel go', () => {
    expect(coastDistance(NEUTRAL_HANDLING)).toBeLessThan(1);
  });

  it('ice slides: the car coasts noticeably further before settling', () => {
    const ice = coastDistance({ omegaMul: 0.82, dampingMul: 0.6 });
    expect(ice).toBeGreaterThan(coastDistance(NEUTRAL_HANDLING) + 0.3);
  });
});
