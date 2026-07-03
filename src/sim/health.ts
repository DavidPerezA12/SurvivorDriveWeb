import type { CarState, FrameEvent } from './types';
import { CRASH_TUNING } from '../content/tuning';

/**
 * Hull damage (docs/DESIGN.md → Pillar 2). The car is one health bar, not a set
 * of parts: a crash chews a chunk out of the hull scaled by how fast and how
 * square the hit was, and `damageMul` (armor) scales that loss — but damage
 * never touches the controls. At 0 the hull is destroyed and the run ends; the
 * frenazo (momentum loss) is applied by the collision resolver, not here.
 */

/** Below this fraction the hull reads as critical — used for low-hull feedback. */
const CRITICAL_THRESHOLD = 0.25;

export function isCritical(health: number): boolean {
  return health > 0 && health < CRITICAL_THRESHOLD;
}

/**
 * Apply a collision's hull cost. `impact` is the speed at contact (m/s);
 * `glancing` is true when the car clipped the hazard's edge rather than hitting
 * it square. `damageMul` scales the loss (Reinforced Plating passes < 1 to
 * toughen the hull without ever changing how the car drives). Mutates
 * `car.health` and pushes one `hullDamaged` event, flagged `destroyed` when the
 * hit empties the bar.
 */
export function applyCrash(
  car: CarState,
  impact: number,
  glancing: boolean,
  out: FrameEvent[],
  damageMul = 1,
): void {
  // An active shield absorbs the hull cost outright — the crash still happened
  // (the caller applies the frenazo and breaks the streak), but the bar is
  // untouched. Lethal ground traps never route through here, so a bubble still
  // cannot save you from a hole (docs/DESIGN.md → power-ups).
  if (car.shieldTicks > 0) return;
  const t = CRASH_TUNING;
  const severity = Math.min(impact / t.fullDamageSpeed, 1);
  const loss = severity * (glancing ? t.glancingHealthLoss : t.frontalHealthLoss) * damageMul;
  if (loss <= 0) return;
  const before = car.health;
  const after = Math.max(0, before - loss);
  car.health = after;
  out.push({ type: 'hullDamaged', amount: before - after, destroyed: after === 0 });
}
