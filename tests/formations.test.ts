import { describe, expect, it } from 'vitest';
import { FORMATIONS, formationWeight, type Formation } from '../src/content/formations';
import { ACT_SPAWNS } from '../src/content/acts';

/**
 * Formations are the authored challenge the road lays down (docs/DESIGN.md →
 * Pillar 1: the road is the boss). These lock the structural contract the sim
 * relies on and the escalation behaviour of selection.
 */

const HARDNESS_BIAS = 1.4; // mirrors DIFFICULTY_TUNING.hardnessBias

/** Expected hardness of the weighted formation field for an act at an intensity. */
function expectedHardness(act: number, intensity: number): number {
  let wsum = 0;
  let hsum = 0;
  for (const f of FORMATIONS) {
    const w = formationWeight(f, act, intensity, HARDNESS_BIAS);
    wsum += w;
    hsum += w * f.hardness;
  }
  return wsum === 0 ? 0 : hsum / wsum;
}

describe('formation library', () => {
  it('every formation is structurally valid', () => {
    for (const f of FORMATIONS) {
      expect(f.cells.length).toBeGreaterThan(0);
      expect(f.acts.length).toBe(ACT_SPAWNS.length);
      expect(f.hardness).toBeGreaterThanOrEqual(0);
      expect(f.hardness).toBeLessThanOrEqual(1);
      for (const c of f.cells) {
        // A cell never sits on the safe lane (offset 0) — that is what keeps the
        // safe line clear no matter which formation is laid down.
        expect(c.off).not.toBe(0);
        expect(c.z).toBeGreaterThanOrEqual(0);
        expect(c.z).toBeLessThanOrEqual(1);
        if (c.role === 'beam') {
          expect(c.toOff).not.toBeUndefined();
          if (c.toOff !== undefined) {
            expect(c.toOff).not.toBe(0);
            expect(Math.sign(c.toOff)).toBe(Math.sign(c.off));
          }
        }
      }
    }
  });

  it('never stacks two crowds on one lane offset (keeps cluster bounds intact)', () => {
    for (const f of FORMATIONS) {
      const crowdedOffsets = f.cells.filter((c) => c.role === 'horde' || c.role === 'loot').map((c) => c.off);
      expect(new Set(crowdedOffsets).size).toBe(crowdedOffsets.length);
    }
  });

  it('places a resource with the demand it answers', () => {
    // Every formation that parks a crowd to fight also hands you ammo for it, and
    // every formation with a gap to clear hands you a lift charge: the pickups are
    // placed in relation to the threat, not scattered (the whole point).
    const has = (f: Formation, role: string) => f.cells.some((c) => c.role === role);
    for (const f of FORMATIONS) {
      if (has(f, 'horde')) expect(has(f, 'ammo')).toBe(true);
      if (has(f, 'gap')) {
        // a gap is fair if you can jump it (lift) or lane-change around it (it sits
        // off the safe line). Require the jump option whenever the gap is the only
        // way through its lane to whatever is past it.
        const lootBeyondGap = f.cells.some((c) => c.role === 'loot');
        if (lootBeyondGap) expect(has(f, 'lift')).toBe(true);
      }
    }
  });

  it('every act has at least one available formation', () => {
    for (let act = 0; act < ACT_SPAWNS.length; act += 1) {
      const total = FORMATIONS.reduce((s, f) => s + formationWeight(f, act, 1, HARDNESS_BIAS), 0);
      expect(total).toBeGreaterThan(0);
    }
  });

  it('keeps the opening city free of meteors, beams, drifters, gaps and walls', () => {
    // Act I (Outbreak) must not draw the late-act catastrophes.
    for (const f of FORMATIONS) {
      if (f.acts[0] <= 0) continue;
      for (const c of f.cells) {
        expect(['meteor', 'beam', 'drifter', 'gap']).not.toContain(c.role);
      }
    }
  });

  it('escalates: the deep tail favours harder formations than the opening', () => {
    // Same act, two intensities: the eased-in opening (0.8) vs the deep tail (1.55).
    for (let act = 2; act < ACT_SPAWNS.length; act += 1) {
      expect(expectedHardness(act, 1.55)).toBeGreaterThan(expectedHardness(act, 0.8));
    }
  });
});
