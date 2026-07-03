import type { CarState, FrameEvent, Intent } from './types';
import {
  CAR_HALF_WIDTH,
  CAR_TUNING,
  LANE_COUNT,
  LANE_WIDTH,
  laneCenterX,
  roadHalfWidth,
} from '../content/tuning';
import { weaponStats } from '../content/weapons';
import type { Loadout } from '../content/upgrades';

/**
 * Per-tick handling modifiers from the biome the car is in (`src/content/biomes.ts`).
 * With the free wheel, `omegaMul` scales how fast the car responds to the steer axis
 * (a looser wheel on ice is slower to bite) and `dampingMul` below 1 weakens the
 * brake that stops the car when the wheel centers, so on ice it keeps gliding and
 * overshoots where you aimed. Neutral on the open road. A deliberate, telegraphed
 * exception to "terrain never touches the controls"; damage still never does
 * (docs/DESIGN.md).
 */
export interface Handling {
  readonly omegaMul: number;
  readonly dampingMul: number;
}

/** Open-road handling: a crisp wheel that bites and stops on a dime. */
export const NEUTRAL_HANDLING: Handling = { omegaMul: 1, dampingMul: 1 };

/** Move `value` toward `target` by at most `maxDelta`. */
function moveTowards(value: number, target: number, maxDelta: number): number {
  const diff = target - value;
  if (Math.abs(diff) <= maxDelta) return target;
  return value + Math.sign(diff) * maxDelta;
}

function clampLane(lane: number): number {
  // `<= 0` (rather than `< 0`) also normalizes a -0 from Math.round to +0, so a -0
  // never leaks into a lane index or a `laneChanged` event.
  if (lane <= 0) return 0;
  if (lane > LANE_COUNT - 1) return LANE_COUNT - 1;
  return lane;
}

export function makeCar(loadout: Loadout): CarState {
  // Start in the middle spawn lane. On the two-lane road that is one of the two
  // lanes; the car is free to steer across the whole width from there.
  const startLane = Math.floor(LANE_COUNT / 2);
  return {
    lane: startLane,
    lateralX: laneCenterX(startLane),
    lateralVel: 0,
    // The run opens already at cruising speed: there is no spool-up from a dead
    // stop. The car is rolling from the first tick (the opening cinematic runs the
    // sim, so the world is already streaming past under it) — accelerating from rest
    // off the line felt wrong (the car crawled and steered sideways faster than it
    // drove forward). The speed ramp still climbs with distance.
    speed: cruisingSpeed(0),
    height: 0,
    vertVel: 0,
    airborne: false,
    // Lift Tank adds to the starting charges (and the cap, enforced on refill).
    jumpCharges: CAR_TUNING.jumpStartCharges + loadout.bonusJumpCharges,
    health: CAR_TUNING.startHealth,
    // The mag the run starts with is the current weapon tier's (Mk-V carries far
    // more than the scrap shotgun).
    ammo: weaponStats(loadout.weaponLevel).startAmmo,
    fireCooldown: 0,
    clinging: 0,
    shieldTicks: 0,
  };
}

/**
 * Advance the car one fixed tick. `topSpeed` is the current cruising speed (the
 * speed ramp lives in the sim, which owns distance). Mutates `car` in place and
 * pushes frame events — the tick path never allocates (docs/ARCHITECTURE.md).
 */
export function stepCar(
  car: CarState,
  intent: Intent,
  topSpeed: number,
  dt: number,
  out: FrameEvent[],
  loadout: Loadout,
  handling: Handling = NEUTRAL_HANDLING,
): void {
  // Forward speed ramps toward the current cruising speed.
  car.speed = moveTowards(car.speed, topSpeed, CAR_TUNING.accel * dt);

  // Free steering: the held steer axis (-1/0/+1) sets a target lateral velocity and
  // the car eases toward it, so you drive continuously across the lane band instead
  // of snapping from one lane center to the next. Holding pushes the car; centering
  // the wheel brakes it back to rest where you left it (no rails, no magnet). Sticky
  // Tires raises the top lateral speed (`steerOmegaMul`) so a cut crosses faster.
  // Damage never touches the controls (docs/DESIGN.md → Pillar 2). The biome
  // `handling` is the lone terrain exception: ice slows the bite (`omegaMul`) and
  // weakens the brake (`dampingMul` < 1), so the car glides and overshoots where you
  // aimed — a telegraphed slip, not mushy damage handling.
  const targetVel = intent.steer * CAR_TUNING.lateralMaxSpeed * loadout.steerOmegaMul;
  // Sticky Tires (`steerOmegaMul` > 1) both raises the top lateral speed and quickens
  // the bite and the stop, so a cut crosses and settles faster. The biome scales only
  // the terrain side: `omegaMul` the bite while steering, `dampingMul` the brake when
  // the wheel centers (ice underbrakes, so it slides).
  const rate =
    intent.steer !== 0
      ? CAR_TUNING.lateralAccel * loadout.steerOmegaMul * handling.omegaMul
      : CAR_TUNING.lateralBrake * loadout.steerOmegaMul * handling.dampingMul;
  car.lateralVel = moveTowards(car.lateralVel, targetVel, rate * dt);
  car.lateralX += car.lateralVel * dt;

  // Stay on the road: the car roams the full drivable width freely but never lets its
  // body poke off the asphalt (road half-width minus the car's half-width). A hit wall
  // kills only the outward velocity, so the car settles against the edge rather than
  // bouncing.
  const edge = roadHalfWidth() - CAR_HALF_WIDTH;
  if (car.lateralX > edge) {
    car.lateralX = edge;
    if (car.lateralVel > 0) car.lateralVel = 0;
  } else if (car.lateralX < -edge) {
    car.lateralX = -edge;
    if (car.lateralVel < 0) car.lateralVel = 0;
  }

  // The current lane is whichever center the car is nearest right now — the inverse
  // of `laneCenterX`, rounded to the closest lane index. Crossing into a new lane
  // fires one `laneChanged` cue (a tire chirp), so the render/audio read still marks
  // every line you cross even though the motion is now continuous.
  const lane = clampLane(Math.round(car.lateralX / LANE_WIDTH + (LANE_COUNT - 1) / 2));
  if (lane !== car.lane) out.push({ type: 'laneChanged', lane });
  car.lane = lane;

  // Jump: launch only from the ground, and only with a charge to spend. The arc
  // is always full height — the cost of jumping is the charge, refilled by lift
  // pickups, not a weaker hop (docs/DESIGN.md → Pillar 2). A press with an empty
  // tank is silently ignored.
  if (intent.jump && !car.airborne && car.jumpCharges > 0) {
    car.airborne = true;
    car.jumpCharges -= 1;
    // Hydraulic Jump scales the launch impulse — a taller, longer arc.
    car.vertVel = CAR_TUNING.jumpImpulse * loadout.jumpImpulseMul;
    out.push({ type: 'jumped' });
  }
  if (car.airborne) {
    car.vertVel -= CAR_TUNING.gravity * dt;
    car.height += car.vertVel * dt;
    if (car.height <= 0) {
      // Landing impact is the downward speed at touchdown — drives squash/dust.
      out.push({ type: 'landed', impact: -car.vertVel });
      car.height = 0;
      car.vertVel = 0;
      car.airborne = false;
    }
  }
}

/**
 * Current cruising speed for a given distance. Two stages (see CAR_TUNING): a
 * quick early ramp to a comfortable cruise (the M1 feel ramp), then a slow climb
 * that runs the whole length of a run so deep distance keeps tightening reaction
 * time. Both terms are clamped, so the car tops out fast but bounded.
 */
export function cruisingSpeed(distance: number): number {
  const d = Math.max(0, distance);
  const early = Math.min(d / CAR_TUNING.earlyRampDistance, 1);
  const late = Math.min(d / CAR_TUNING.lateRampDistance, 1);
  return CAR_TUNING.baseTopSpeed + CAR_TUNING.earlyGain * early + CAR_TUNING.lateGain * late;
}
