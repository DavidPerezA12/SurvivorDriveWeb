import type { CarState, FrameEvent, Intent } from './types';
import { CAR_TUNING, LANE_COUNT, LANE_WIDTH, laneCenterX } from '../content/tuning';
import { weaponStats } from '../content/weapons';
import type { Loadout } from '../content/upgrades';

/** Move `value` toward `target` by at most `maxDelta`. */
function moveTowards(value: number, target: number, maxDelta: number): number {
  const diff = target - value;
  if (Math.abs(diff) <= maxDelta) return target;
  return value + Math.sign(diff) * maxDelta;
}

function clampLane(lane: number): number {
  if (lane < 0) return 0;
  if (lane > LANE_COUNT - 1) return LANE_COUNT - 1;
  return lane;
}

export function makeCar(loadout: Loadout): CarState {
  const startLane = Math.floor(LANE_COUNT / 2);
  return {
    lane: startLane,
    targetLane: startLane,
    lateralX: laneCenterX(startLane),
    lateralVel: 0,
    speed: 0,
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
): void {
  // Forward speed ramps toward the current cruising speed.
  car.speed = moveTowards(car.speed, topSpeed, CAR_TUNING.accel * dt);

  // Edge-triggered steering: one tap shifts the target lane by one.
  if (intent.steer !== 0) {
    const next = clampLane(car.targetLane + intent.steer);
    if (next !== car.targetLane) {
      car.targetLane = next;
      out.push({ type: 'laneChanged', lane: next });
    }
  }

  // Lateral motion as a critically-damped spring toward the target lane center.
  // Semi-implicit Euler (update velocity, then position) stays stable at 60 Hz.
  // The car always handles clean — damage never touches the controls
  // (docs/DESIGN.md → Pillar 2). Sticky Tires snaps the spring (higher omega) so
  // lane changes land faster — felt the instant you change lanes.
  const targetX = laneCenterX(car.targetLane);
  const omega = CAR_TUNING.lateralOmega * loadout.steerOmegaMul;
  const accel = omega * omega * (targetX - car.lateralX) - 2 * omega * car.lateralVel;
  car.lateralVel += accel * dt;
  car.lateralX += car.lateralVel * dt;

  // The settled lane is whichever center the car is nearest right now — the
  // inverse of `laneCenterX`, rounded to the closest lane index.
  car.lane = clampLane(Math.round(car.lateralX / LANE_WIDTH + (LANE_COUNT - 1) / 2));

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
