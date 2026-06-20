import { hash2 } from '../sim/rng';

/**
 * The road's vertical profile — **mostly flat, with the occasional purposeful
 * hill** (docs/DESIGN.md → the road is the boss). Not a constant up-and-down: the
 * road runs level for long stretches and then climbs over a single smooth crest
 * and back down, so an incline reads as a *feature* of that stretch, not noise.
 * Pure data: a function of `(seed, forward)`, deterministic everywhere, no
 * DOM/Three/time.
 *
 * Each ~half-kilometre cell independently rolls whether it holds a hill. A hill is
 * a raised cosine — height and slope are both **zero at its edges**, so it blends
 * seamlessly into the flat road on either side (no kink where it starts). Height
 * is therefore always ≥ 0 (the road only ever rises above the flat floor, never
 * sinks below it, so it can't clip under the ground plane), and slopes stay gentle
 * enough that the spawn horizon clears the crest and the kinematic car rides it
 * with no handling change — elevation is a shared *render* offset, so the lane-grid
 * collision math is untouched (see `src/render/elevation.ts`).
 */

/** Distance (m) per cell; at most one hill per cell, so hills are spaced out. */
const CELL = 620;
/** Fraction of cells that actually hold a hill — the rest stay dead flat. */
const HILL_CHANCE = 0.5;
/**
 * Hill half-width (m): how far from its centre the climb reaches before flat.
 * Long and low on purpose — a gentle highway grade, not a lump: it keeps the
 * slope shallow (the car stays glued, the horizon clears the crest) and keeps the
 * road from rising far above the flat surroundings (no berm/float look).
 */
const HW_MIN = 170;
const HW_MAX = 280;
/** Hill height (m) at the crest — deliberately modest. */
const AMP_MIN = 1.6;
const AMP_MAX = 3.4;

interface Hill {
  readonly center: number;
  readonly half: number;
  readonly amp: number;
}

function rand(seed: number, salt: number): number {
  return hash2(seed, salt) / 0x100000000;
}

/** The hill in cell `c`, or `null` if that cell is flat. */
function cellHill(seed: number, c: number): Hill | null {
  if (rand(seed, c * 4 + 101) >= HILL_CHANCE) return null;
  return {
    // Centre sits in the middle half of the cell so a hill never straddles a join.
    center: c * CELL + (0.25 + 0.5 * rand(seed, c * 4 + 102)) * CELL,
    half: HW_MIN + rand(seed, c * 4 + 103) * (HW_MAX - HW_MIN),
    amp: AMP_MIN + rand(seed, c * 4 + 104) * (AMP_MAX - AMP_MIN),
  };
}

/** Road surface height (m) above the floor at a world-forward position. */
export function roadHeightAt(seed: number, forward: number): number {
  const cell = Math.floor(forward / CELL);
  let h = 0;
  // A hill can spill a little past its cell, so check the neighbours too.
  for (let c = cell - 1; c <= cell + 1; c += 1) {
    const hill = cellHill(seed, c);
    if (!hill) continue;
    const d = forward - hill.center;
    if (Math.abs(d) >= hill.half) continue;
    // Raised cosine: 1 at the centre, 0 (with zero slope) at ±half.
    h += hill.amp * 0.5 * (1 + Math.cos((Math.PI * d) / hill.half));
  }
  return h;
}

/** Slope dHeight/dForward at a world-forward position (small; for pitching tiles). */
export function roadSlopeAt(seed: number, forward: number): number {
  const cell = Math.floor(forward / CELL);
  let s = 0;
  for (let c = cell - 1; c <= cell + 1; c += 1) {
    const hill = cellHill(seed, c);
    if (!hill) continue;
    const d = forward - hill.center;
    if (Math.abs(d) >= hill.half) continue;
    s += hill.amp * 0.5 * -Math.sin((Math.PI * d) / hill.half) * (Math.PI / hill.half);
  }
  return s;
}
