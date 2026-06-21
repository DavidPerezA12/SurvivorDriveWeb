import type { Intent, SimState } from './types';
import { makeRng } from './rng';
import { cruisingSpeed, makeCar, stepCar } from './car';
import {
  materializeSpawns,
  pruneSpawns,
  resolveCollisions,
  resolveMows,
  resolvePickups,
  resolveShots,
  updateDrifters,
  updateMeteors,
  updateQuakes,
} from './collision';
import { BASE_LOADOUT, type Loadout } from '../content/upgrades';

/**
 * Fixed simulation timestep: 60 Hz. Every tuning value is per-second and scaled
 * by this, so changing the rate is a one-line edit (docs/ARCHITECTURE.md).
 */
export const FIXED_DT = 1 / 60;

/** Deceleration (m/s²) of the wreck once the run is over. */
const DEAD_DECEL = 16;

/**
 * Create a fresh run from a seed and an optional garage loadout. Same
 * `(seed, loadout)` ⇒ same starting state and same road, always. The loadout
 * defaults to the stock car, so a seed alone still fully determines a run.
 */
export function createSim(seed: number, loadout: Loadout = BASE_LOADOUT): SimState {
  return {
    seed,
    loadout,
    tick: 0,
    distance: 0,
    car: makeCar(loadout),
    hazards: [],
    zombies: [],
    pickups: [],
    nextSpawnChunk: 0,
    scrap: 0,
    zombiesMowed: 0,
    combo: 0,
    comboTicks: 0,
    dead: false,
    deathCause: null,
    rng: makeRng(seed),
    events: [],
  };
}

/**
 * Advance the simulation by exactly one fixed tick.
 *
 * Pure with respect to its inputs: `(state, intent)` fully determines the next
 * state and the events emitted — no wall-clock time, no `Math.random`. Mutates
 * `state` in place (events array reused, length-reset) so the tick path
 * allocates nothing after warm-up. Returns the same reference for convenience.
 *
 * Determinism contract (CI replay test): two sims created from the same seed
 * and fed the same intent sequence end byte-for-byte equal.
 */
export function step(state: SimState, intent: Intent): SimState {
  state.events.length = 0;

  if (state.dead) {
    // The run is over: the wreck coasts to a stop and input is ignored.
    state.car.speed = Math.max(0, state.car.speed - DEAD_DECEL * FIXED_DT);
    state.distance += state.car.speed * FIXED_DT;
    state.tick += 1;
    return state;
  }

  // The mow streak lapses if no fresh kill lands within its window. Counted
  // before collisions so a kill this tick refreshes it rather than racing it.
  if (state.comboTicks > 0) {
    state.comboTicks -= 1;
    if (state.comboTicks === 0) state.combo = 0;
  }

  materializeSpawns(state);

  // The car always reaches full cruising speed — a battered hull never slows it
  // (docs/DESIGN.md → Pillar 2). The only speed cost is the crash frenazo.
  const topSpeed = cruisingSpeed(state.distance);

  stepCar(state.car, intent, topSpeed, FIXED_DT, state.events, state.loadout);
  state.distance += state.car.speed * FIXED_DT;

  // Slide any drifting wrecks toward their target lane before collisions read X.
  updateDrifters(state);
  // Land any meteor that has reached its impact point (turns it lethal this tick).
  updateMeteors(state);
  // Tear open any quake crack the car has reached (turns it lethal this tick).
  updateQuakes(state);

  // Kills first — ramming (a surge) and the gun — then harmless refills, then the
  // damaging hits (which cut speed and break the streak the kills just built).
  resolveMows(state, topSpeed);
  resolveShots(state, intent);
  resolvePickups(state);
  resolveCollisions(state);
  pruneSpawns(state);

  state.tick += 1;
  return state;
}
