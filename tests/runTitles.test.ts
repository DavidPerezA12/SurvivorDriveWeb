import { describe, expect, it } from 'vitest';
import {
  runTitle,
  DEATH_CAUSES,
  type DeathCause,
  type RunStats,
} from '../src/content/runTitles';

/**
 * The procedural run-title generator (docs/DESIGN.md → tone). It is a pure,
 * deterministic function of `(seed, cause, stats)` that uses only the sim's
 * seeded RNG, so these checks are cheap and platform-independent.
 */

const STATS: RunStats = { distance: 1234.6, zombiesKilled: 42, scrap: 99 };

describe('runTitle', () => {
  it('is deterministic for the same seed, cause, and stats', () => {
    for (const cause of DEATH_CAUSES) {
      expect(runTitle(7, cause, STATS)).toBe(runTitle(7, cause, STATS));
    }
  });

  it('produces a non-empty, fully-resolved title for every cause', () => {
    for (const cause of DEATH_CAUSES) {
      const title = runTitle(123, cause, STATS);
      expect(title.length).toBeGreaterThan(0);
      // No unfilled template slots should survive.
      expect(title).not.toMatch(/\{[^}]+\}/);
    }
  });

  it('varies across seeds (not a constant string)', () => {
    const titles = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      titles.add(runTitle(seed, 'wreck', STATS));
    }
    expect(titles.size).toBeGreaterThan(1);
  });

  it('different causes can read differently from the same seed', () => {
    const byCause = new Set(DEATH_CAUSES.map((c) => runTitle(99, c, STATS)));
    expect(byCause.size).toBeGreaterThan(1);
  });

  it('weaves the distance stat in when a template asks for it', () => {
    // The `{dist}` token rounds distance; find a seed whose wreck title uses it.
    const stats: RunStats = { distance: 8888, zombiesKilled: 0, scrap: 0 };
    let found = false;
    for (let seed = 0; seed < 200 && !found; seed++) {
      if (runTitle(seed, 'wreck', stats).includes('8888')) found = true;
    }
    expect(found).toBe(true);
  });

  it('rounds and clamps stat tokens to clean non-negative integers', () => {
    const stats: RunStats = { distance: -5.4, zombiesKilled: 3.7, scrap: 0 };
    for (let seed = 0; seed < 200; seed++) {
      const title = runTitle(seed, 'attrition', stats);
      expect(title).not.toMatch(/-\d/); // no negative numbers leak through
      expect(title).not.toMatch(/\d+\.\d/); // no fractional kills/distance
    }
  });

  it('keeps determinism regardless of the stats passed for slotless templates', () => {
    // Pick a seed/cause whose template has no stat tokens; the stats must not
    // change the outcome. We assert across many seeds that a stats-only change
    // never alters a title that contains no digits.
    const a: RunStats = { distance: 1, zombiesKilled: 1, scrap: 1 };
    const b: RunStats = { distance: 9999, zombiesKilled: 9999, scrap: 9999 };
    for (let seed = 0; seed < 50; seed++) {
      for (const cause of DEATH_CAUSES) {
        const ta = runTitle(seed, cause, a);
        if (!/\d/.test(ta)) {
          expect(runTitle(seed, cause, b)).toBe(ta);
        }
      }
    }
  });

  it('covers all declared causes without throwing', () => {
    const causes: DeathCause[] = [
      'wreck',
      'rig',
      'boulder',
      'barrel',
      'drifter',
      'meteor',
      'beam',
      'gap',
      'attrition',
    ];
    expect(causes).toEqual([...DEATH_CAUSES]);
    for (const cause of causes) {
      expect(() => runTitle(1, cause, STATS)).not.toThrow();
    }
  });
});
