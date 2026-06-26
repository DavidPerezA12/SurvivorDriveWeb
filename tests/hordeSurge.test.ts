import { describe, expect, it } from 'vitest';
import { FORMATIONS } from '../src/content/formations';
import { LANE_COUNT } from '../src/content/tuning';
import { chunkAt, safeLane } from '../src/sim';
import { ACT_SPAN_M } from '../src/content/acts';
import { CHUNK_LENGTH } from '../src/content/tuning';

/**
 * The horde surge (docs/DESIGN.md → roster: a mass threat; plow for scrap or thread
 * the gap). A crowd floods every flanking lane so the only clean line is the safe
 * lane, with brutes anchoring the wave as the hull cost of plowing it blind and a
 * barrel to pop for a swath. Swarm signature. Headless tests on the authored data.
 */

const surge = FORMATIONS.find((f) => f.id === 'horde-surge');

describe('horde surge', () => {
  it('is an authored Swarm-onward formation, absent from the opening acts', () => {
    expect(surge).toBeDefined();
    if (!surge) return;
    expect(surge.acts[0]).toBe(0); // Outbreak
    expect(surge.acts[1]).toBe(0); // Rust
    expect(surge.acts[2]).toBeGreaterThan(0); // Swarm and on
  });

  it('carries the wave, the teeth, and the tools', () => {
    if (!surge) return;
    const has = (role: string) => surge.cells.some((c) => c.role === role);
    expect(has('loot')).toBe(true); // the crowd
    expect(has('brute')).toBe(true); // the hull cost of plowing blind
    expect(has('barrel')).toBe(true); // the swath tool
    expect(has('ammo')).toBe(true); // the ammo cost is paid for
  });

  it('floods all three non-safe lanes wherever the safe line wanders', () => {
    if (!surge) return;
    const crowdOffsets = surge.cells.filter((c) => c.role === 'loot' || c.role === 'horde').map((c) => c.off);
    // For every possible safe lane, the crowd offsets that land on the road and off
    // the safe lane must cover all three non-safe lanes — the whole point of a surge
    // is that the safe lane is the only gap.
    for (let safe = 0; safe < LANE_COUNT; safe += 1) {
      const flooded = new Set<number>();
      for (const off of crowdOffsets) {
        const lane = safe + off;
        if (lane < 0 || lane >= LANE_COUNT || lane === safe) continue;
        flooded.add(lane);
      }
      expect(flooded.size).toBe(LANE_COUNT - 1);
      expect(flooded.has(safe)).toBe(false);
    }
  });

  it('lays the wave in the world with the safe lane left clear', () => {
    // Drive Swarm chunks across several seeds; on any chunk the surge laid (one with
    // a brute and a wide crowd), the safe lane must hold no spawn at all.
    const swarmStart = Math.floor((2 * ACT_SPAN_M) / CHUNK_LENGTH);
    let surgesSeen = 0;
    for (const seed of [1, 7, 42, 123, 2024]) {
      for (let i = swarmStart; i < swarmStart + 200; i += 1) {
        const chunk = chunkAt(seed, i);
        const safe = safeLane(seed, i);
        const lanes = new Set(chunk.spawns.filter((s) => s.kind === 'zombie').map((s) => s.lane));
        const hasBrute = chunk.spawns.some((s) => s.kind === 'zombie' && s.brute);
        if (!hasBrute || lanes.size < 3) continue; // not a surge chunk
        surgesSeen += 1;
        for (const s of chunk.spawns) expect(s.lane).not.toBe(safe);
      }
    }
    expect(surgesSeen).toBeGreaterThan(0);
  });
});
