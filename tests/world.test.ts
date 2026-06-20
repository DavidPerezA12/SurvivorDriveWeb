import { describe, expect, it } from 'vitest';
import { chunkAt, safeLane } from '../src/sim';
import { CHUNK_LENGTH, LANE_COUNT, SPAWN_TUNING, roadHalfWidth } from '../src/content/tuning';
import { ACT_SPAN_M, spawnWeightsAt } from '../src/content/acts';

/**
 * World generation is pull-based and order-independent: a chunk is a pure
 * function of `(seed, index)` (docs/ARCHITECTURE.md → Chunks). It asserts that
 * contract, the flat-road baseline, the safe-line invariant, and the spawn mix
 * (wrecks, zombie clusters) that hangs off it.
 */
describe('world generation', () => {
  it('is deterministic per (seed, index)', () => {
    expect(chunkAt(42, 7)).toEqual(chunkAt(42, 7));
  });

  it('does not depend on generation order', () => {
    const forward = [0, 1, 2, 3].map((i) => chunkAt(42, i));
    const backward = [3, 2, 1, 0].map((i) => chunkAt(42, i)).reverse();
    expect(forward).toEqual(backward);
  });

  it('carries its own index and the M0 flat variant', () => {
    const chunk = chunkAt(42, 12);
    expect(chunk.index).toBe(12);
    expect(chunk.variant).toBe('flat');
  });

  it('keeps all decoration off the drivable road (readability rule)', () => {
    const edge = roadHalfWidth();
    let total = 0;
    for (let index = 0; index < 200; index += 1) {
      for (const prop of chunkAt(7, index).props) {
        expect(Math.abs(prop.x)).toBeGreaterThan(edge);
        expect(prop.z).toBeGreaterThanOrEqual(0);
        total += 1;
      }
    }
    // The seed should actually produce *some* decoration across 200 chunks.
    expect(total).toBeGreaterThan(0);
  });
});

describe('safe-line invariant', () => {
  const seeds = [1, 42, 7777, 0xc0ffee];

  it('moves the safe lane by at most one lane per chunk (always reachable)', () => {
    for (const seed of seeds) {
      for (let i = 1; i < 500; i += 1) {
        const delta = Math.abs(safeLane(seed, i) - safeLane(seed, i - 1));
        expect(delta).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps the safe lane in bounds', () => {
    for (const seed of seeds) {
      for (let i = 0; i < 500; i += 1) {
        const lane = safeLane(seed, i);
        expect(lane).toBeGreaterThanOrEqual(0);
        expect(lane).toBeLessThan(LANE_COUNT);
      }
    }
  });

  it('leaves the safe lane empty — both unblocked and unpaid (greed pillar)', () => {
    // Nothing spawns in the safe lane: no wreck (so it is damage-free) and no
    // zombie (so it pays no scrap). That is what makes the safe line always the
    // worst-paying line (docs/DESIGN.md → Pillar 3).
    for (const seed of seeds) {
      for (let i = 0; i < 500; i += 1) {
        const safe = safeLane(seed, i);
        for (const spawn of chunkAt(seed, i).spawns) {
          expect(spawn.lane).not.toBe(safe);
        }
      }
    }
  });

  it('leaves the opening grace chunks completely empty', () => {
    for (let i = 0; i < SPAWN_TUNING.graceChunks; i += 1) {
      expect(chunkAt(123, i).spawns).toHaveLength(0);
    }
  });

  it('eventually spawns wrecks, boulders, barrels, zombies, and lift pickups past the grace zone', () => {
    let wrecks = 0;
    let boulders = 0;
    let barrels = 0;
    let zombies = 0;
    let pickups = 0;
    for (let i = 0; i < 300; i += 1) {
      for (const spawn of chunkAt(123, i).spawns) {
        if (spawn.kind === 'wreck') wrecks += 1;
        else if (spawn.kind === 'boulder') boulders += 1;
        else if (spawn.kind === 'barrel') barrels += 1;
        else if (spawn.kind === 'zombie') zombies += 1;
        else if (spawn.kind === 'jump' || spawn.kind === 'health' || spawn.kind === 'ammo') pickups += 1;
      }
    }
    expect(wrecks).toBeGreaterThan(0);
    expect(boulders).toBeGreaterThan(0);
    expect(barrels).toBeGreaterThan(0);
    expect(zombies).toBeGreaterThan(0);
    expect(pickups).toBeGreaterThan(0);
  });
});

describe('zombie clusters', () => {
  it('spawns zombies as contiguous lines within a single lane', () => {
    // Find a chunk with a zombie cluster and check it reads as one line: same
    // lane, evenly spaced, fitting inside the chunk so the renderer can stream
    // it like any other spawn.
    let checked = 0;
    for (let i = SPAWN_TUNING.graceChunks; i < 400 && checked < 6; i += 1) {
      const zombies = chunkAt(99, i).spawns.filter((s) => s.kind === 'zombie');
      if (zombies.length < 2) continue;
      // Group by lane and verify spacing within each lane's run.
      const byLane = new Map<number, number[]>();
      for (const z of zombies) {
        const list = byLane.get(z.lane) ?? [];
        list.push(z.z);
        byLane.set(z.lane, list);
      }
      for (const zs of byLane.values()) {
        if (zs.length < 2) continue;
        zs.sort((a, b) => a - b);
        for (let k = 1; k < zs.length; k += 1) {
          expect(zs[k] - zs[k - 1]).toBeCloseTo(SPAWN_TUNING.clusterSpacing, 5);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("respects each act's cluster size bounds", () => {
    for (let i = SPAWN_TUNING.graceChunks; i < 400; i += 1) {
      // Cluster size bounds are per-act now, so check against this chunk's act.
      const w = spawnWeightsAt(i * CHUNK_LENGTH);
      const byLane = new Map<number, number>();
      for (const s of chunkAt(7, i).spawns) {
        if (s.kind === 'zombie') byLane.set(s.lane, (byLane.get(s.lane) ?? 0) + 1);
      }
      for (const count of byLane.values()) {
        expect(count).toBeGreaterThanOrEqual(w.clusterMin);
        expect(count).toBeLessThanOrEqual(w.clusterMax);
      }
    }
  });
});

describe('acts shape the spawn mix by tramo', () => {
  it('keeps the early Rust band free of late-act threats (meteors, rigs rare)', () => {
    // Act I (the first ACT_SPAN_M meters) teaches: no meteors at all, drifters
    // not yet, rigs only a trickle.
    let meteors = 0;
    let drifters = 0;
    const actIChunks = Math.floor(ACT_SPAN_M / CHUNK_LENGTH);
    for (const seed of [1, 7, 42]) {
      for (let i = SPAWN_TUNING.graceChunks; i < actIChunks; i += 1) {
        for (const s of chunkAt(seed, i).spawns) {
          if (s.kind === 'meteor') meteors += 1;
          if (s.kind === 'drifter') drifters += 1;
        }
      }
    }
    expect(meteors).toBe(0);
    expect(drifters).toBe(0);
  });

  it('introduces meteors only from the Visitors act on', () => {
    const actIIIStart = Math.floor((2 * ACT_SPAN_M) / CHUNK_LENGTH);
    let meteors = 0;
    for (let i = actIIIStart; i < actIIIStart + 200; i += 1) {
      for (const s of chunkAt(123, i).spawns) if (s.kind === 'meteor') meteors += 1;
    }
    expect(meteors).toBeGreaterThan(0);
  });
});
