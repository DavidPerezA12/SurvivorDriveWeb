import { describe, expect, it } from 'vitest';
import { createSim, chunkAt, safeLane } from '../src/sim';
import { resolveCollisions, updateMeteors } from '../src/sim/collision';
import { METEOR_TUNING, laneCenterX, CHUNK_LENGTH } from '../src/content/tuning';
import { ACT_SPAN_M } from '../src/content/acts';
import { DEATH_CAUSES, runTitle } from '../src/content/runTitles';

/**
 * The mecha barrage (docs/DESIGN.md → Phase 3 bosses; spectacle in the background). A
 * walking war machine shells the road: each round shares the meteor fall→land pipeline
 * (`kind: 'shell'`), harmless falling, a lethal un-jumpable crater on impact, attributed
 * to the mecha. Its signature is that a volley shells *both* flanking lanes at once, so
 * the safe lane is the only gap each beat. Headless sim tests; the body is spectacle.
 */
describe('mecha shell', () => {
  it('is harmless while the shell is still falling', () => {
    const s = createSim(1);
    s.hazards.push({ kind: 'shell', lane: 1, x: laneCenterX(1), forward: 8, hit: false, landed: false });
    s.distance = 7;
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
  });

  it('bursts only once the gap closes to impact, emitting the burst', () => {
    const s = createSim(1);
    s.hazards.push({ kind: 'shell', lane: 1, x: laneCenterX(1), forward: 100, hit: false, landed: false });
    s.distance = 100 - METEOR_TUNING.impactGap - 5;
    updateMeteors(s);
    expect(s.hazards[0].landed).toBe(false);
    s.distance = 100 - METEOR_TUNING.impactGap + 1;
    updateMeteors(s);
    expect(s.hazards[0].landed).toBe(true);
    expect(s.events.some((e) => e.type === 'exploded')).toBe(true);
  });

  it('a burst shell is a lethal blocker and records itself as the death cause', () => {
    const s = createSim(1);
    s.car.health = 0.5;
    s.hazards.push({ kind: 'shell', lane: 1, x: laneCenterX(1), forward: 8, hit: false, landed: false });
    s.distance = 7;
    s.car.speed = 60;
    updateMeteors(s);
    resolveCollisions(s);
    expect(s.hazards[0].landed).toBe(true);
    expect(s.car.health).toBe(0);
    expect(s.deathCause).toBe('shell');
  });

  it('cannot be jumped — a burst shell hits even mid-air (it is a lethal crater)', () => {
    const s = createSim(1);
    s.hazards.push({ kind: 'shell', lane: 1, x: laneCenterX(1), forward: 8, hit: false, landed: true });
    s.distance = 7;
    s.car.height = 1.2;
    s.car.speed = 40;
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBeLessThan(1);
  });

  it('has an attributable death cause and an absurd run title', () => {
    expect(DEATH_CAUSES).toContain('shell');
    const title = runTitle(7, 'shell', { distance: 5200, zombiesKilled: 20, scrap: 140 });
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
  });
});

describe('mecha barrage in the world', () => {
  it('only appears from the Visitors act on, and never shells the safe lane', () => {
    let early = 0;
    let late = 0;
    const actIVStart = Math.floor((3 * ACT_SPAN_M) / CHUNK_LENGTH);
    for (const seed of [1, 7, 42, 123]) {
      for (let i = 0; i < actIVStart; i += 1) {
        for (const sp of chunkAt(seed, i).spawns) if (sp.kind === 'shell') early += 1;
      }
      for (let i = actIVStart; i < actIVStart + 400; i += 1) {
        const safe = safeLane(seed, i);
        for (const sp of chunkAt(seed, i).spawns) {
          if (sp.kind !== 'shell') continue;
          late += 1;
          expect(sp.lane).not.toBe(safe);
        }
      }
    }
    expect(early).toBe(0);
    expect(late).toBeGreaterThan(0);
  });

  it('a volley rakes the threat lane in a staggered pattern, never the safe lane', () => {
    // On any chunk the barrage laid, the shells walk across the wide threat lane at
    // several distinct lateral offsets (the zigzag pattern), and never touch the safe
    // lane, which stays the clean out.
    const actIVStart = Math.floor((3 * ACT_SPAN_M) / CHUNK_LENGTH);
    let volleysSeen = 0;
    for (const seed of [1, 7, 42, 123, 2024]) {
      for (let i = actIVStart; i < actIVStart + 600; i += 1) {
        const chunk = chunkAt(seed, i);
        const safe = safeLane(seed, i);
        const shells = chunk.spawns.filter((s) => s.kind === 'shell');
        if (shells.length < 4) continue; // not a barrage volley chunk
        volleysSeen += 1;
        // All on the one threat lane, never the safe lane.
        for (const sh of shells) expect(sh.lane).not.toBe(safe);
        // Staggered across the lane: several distinct lateral offsets, not one column.
        const offsets = new Set(shells.map((s) => Math.round(('dx' in s ? (s.dx ?? 0) : 0) * 100)));
        expect(offsets.size).toBeGreaterThan(1);
      }
    }
    expect(volleysSeen).toBeGreaterThan(0);
  });
});
