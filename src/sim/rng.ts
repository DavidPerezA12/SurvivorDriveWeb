/**
 * The single seeded RNG stream for the whole simulation.
 *
 * State is one 32-bit integer, so it is trivially serializable for replays and
 * structured-clone-able to a worker later. The algorithm is mulberry32: fast,
 * tiny, and good enough for spawn weighting and event scheduling — never used
 * for anything cryptographic.
 *
 * Determinism contract: a given `(seed, call sequence)` always yields the same
 * numbers, on every platform. No `Math.random`, ever (enforced by lint).
 */
export interface Rng {
  /** Internal state. Plain number so the whole sim state stays clonable. */
  s: number;
}

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

/** Advance the stream and return a uint32. */
export function nextU32(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) | 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** A float in [0, 1). */
export function nextFloat(rng: Rng): number {
  return nextU32(rng) / 0x100000000;
}

/** An integer in [min, max). */
export function nextInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min));
}

/**
 * Derive a stable, independent seed from two integers.
 *
 * Used to give every chunk its own RNG purely from `(seed, chunkIndex)`, so a
 * chunk can be materialized on demand without threading RNG state through the
 * ones before it (docs/ARCHITECTURE.md → Spawning).
 */
export function hash2(a: number, b: number): number {
  let h = (a >>> 0) ^ Math.imul(b >>> 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
