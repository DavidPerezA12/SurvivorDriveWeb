import { describe, expect, it } from 'vitest';
import { createSim, chunkAt, safeLane } from '../src/sim';
import { resolveCollisions, updateBeams } from '../src/sim/collision';
import { BEAM_TUNING, laneCenterX, CHUNK_LENGTH } from '../src/content/tuning';
import { ACT_SPAN_M } from '../src/content/acts';

/**
 * The UFO strafe beam (docs/DESIGN.md → Pillar 1: the road is the boss). A lethal
 * strip that sweeps across the flanking lanes toward the safe line, settling on a
 * committed lane before the car arrives. Jump it or flee to the safe lane (never in
 * its arc). The sweep is the telegraph. Headless sim tests.
 */

const LANE = 2; // the car's start lane center

function beam(fromLane: number, toLane: number, forward: number) {
  return {
    kind: 'beam' as const,
    lane: fromLane,
    x: laneCenterX(fromLane),
    forward,
    hit: false,
    beamFromX: laneCenterX(fromLane),
    beamToX: laneCenterX(toLane),
  };
}

describe('UFO beam sweep', () => {
  it('eases from its start lane to its target lane as the gap closes, then holds', () => {
    const s = createSim(1);
    s.hazards.push(beam(0, LANE, 200));

    s.distance = 200 - BEAM_TUNING.startGap - 10; // before the sweep
    updateBeams(s);
    expect(s.hazards[0].x).toBeCloseTo(laneCenterX(0));

    s.distance = 200 - (BEAM_TUNING.startGap + BEAM_TUNING.endGap) / 2; // mid-sweep
    updateBeams(s);
    expect(s.hazards[0].x).toBeGreaterThan(laneCenterX(0));
    expect(s.hazards[0].x).toBeLessThan(laneCenterX(LANE));

    s.distance = 200 - BEAM_TUNING.endGap + 1; // settled on the target lane
    updateBeams(s);
    expect(s.hazards[0].x).toBeCloseTo(laneCenterX(LANE));
  });

  it('is a heavy, lethal strike on its settled lane and records itself as the cause', () => {
    const s = createSim(1);
    s.car.health = 0.5;
    s.hazards.push(beam(0, LANE, 8));
    s.distance = 7; // gap 1 < endGap → settled on lane 2, overlapping the grounded car
    s.car.speed = 60;
    updateBeams(s);
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(true);
    expect(s.car.health).toBe(0);
    expect(s.deathCause).toBe('beam');
  });

  it('can be jumped — it is ground-class, unlike a meteor', () => {
    const s = createSim(1);
    s.hazards.push(beam(0, LANE, 8));
    s.distance = 7;
    s.car.height = 1.2; // airborne, clear over the strip
    s.car.speed = 50;
    updateBeams(s);
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
  });

  it('does not touch a car off its settled lane (flee-to-safe is always an out)', () => {
    const s = createSim(1);
    s.hazards.push(beam(0, 0, 8)); // settles on lane 0, far from the lane-2 car
    s.distance = 7;
    s.car.speed = 50;
    updateBeams(s);
    resolveCollisions(s);
    expect(s.hazards[0].hit).toBe(false);
    expect(s.car.health).toBe(1);
  });

  it('only appears from the Visitors act on, and never sweeps onto the safe lane', () => {
    let early = 0;
    let late = 0;
    const actIVStart = Math.floor((3 * ACT_SPAN_M) / CHUNK_LENGTH);
    for (const seed of [1, 7, 42, 123]) {
      for (let i = 0; i < actIVStart; i += 1) {
        for (const sp of chunkAt(seed, i).spawns) if (sp.kind === 'beam') early += 1;
      }
      for (let i = actIVStart; i < actIVStart + 300; i += 1) {
        const safe = safeLane(seed, i);
        for (const sp of chunkAt(seed, i).spawns) {
          if (sp.kind !== 'beam') continue;
          late += 1;
          // Both ends of the sweep are valid non-safe lanes on the same side of the
          // refuge, so the moving strip never crosses through the safe line.
          expect(sp.lane).not.toBe(safe);
          expect(sp.toLane).not.toBe(safe);
          expect((sp.lane - safe) * (sp.toLane - safe)).toBeGreaterThan(0);
        }
      }
    }
    expect(early).toBe(0);
    expect(late).toBeGreaterThan(0);
  });
});
