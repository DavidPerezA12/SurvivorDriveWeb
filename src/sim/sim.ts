import type { Intent, SimState } from './types';
import { makeRng } from './rng';
import { cruisingSpeed, makeCar, stepCar } from './car';
import {
  materializeSpawns,
  pruneSpawns,
  resolveCollisions,
  resolveGas,
  resolveJumpers,
  resolveMows,
  resolvePickups,
  resolveShots,
  updateBeams,
  updateClingers,
  updateDrifters,
  updateMeteors,
  updateQuakes,
} from './collision';
import { BASE_LOADOUT, type Loadout } from '../content/upgrades';
import { biomeStateAt, createBiomeState } from '../content/biomes';

/**
 * Fixed simulation timestep: 60 Hz. Every tuning value is per-second and scaled
 * by this, so changing the rate is a one-line edit (docs/ARCHITECTURE.md).
 */
export const FIXED_DT = 1 / 60;

/** Deceleration (m/s²) of the wreck once the run is over. */
const DEAD_DECEL = 16;

/** Reused biome sample; sampling the current grip allocates nothing per tick. */
const BIOME_STATE = createBiomeState();
/** Reused adapter from biome fields to the car's handling input. */
const BIOME_HANDLING = { omegaMul: 1, dampingMul: 1 };

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
    gas: [],
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

  // The biome the car is driving through sets its handling: open road is a crisp
  // wheel, an ice field slides (docs/DESIGN.md → biomes). Pure function of distance,
  // so the road's grip is as deterministic as its layout.
  const biome = biomeStateAt(state.seed, state.distance, BIOME_STATE);
  BIOME_HANDLING.omegaMul = biome.steerOmegaMul;
  BIOME_HANDLING.dampingMul = biome.steerDampingMul;
  stepCar(state.car, intent, topSpeed, FIXED_DT, state.events, state.loadout, BIOME_HANDLING);
  state.distance += state.car.speed * FIXED_DT;

  // Slide any drifting wrecks toward their target lane before collisions read X.
  updateDrifters(state);
  // Sweep any UFO beam toward its target lane before collisions read X.
  updateBeams(state);
  // Land any meteor that has reached its impact point (turns it lethal this tick).
  updateMeteors(state);
  // Tear open any quake crack the car has reached (turns it lethal this tick).
  updateQuakes(state);

  // Jumpers latch first (a contact a hair before the mow box), so a leaper is taken
  // as a hood passenger, never mowed for scrap. Then kills — ramming (a surge) and
  // the gun, which also peels a clinger off — then harmless refills, then the
  // damaging hits (which cut speed, shake clingers loose, and break the streak the
  // kills just built). Finally the clinging jumpers drain the hull for the tick.
  resolveJumpers(state);
  resolveMows(state, topSpeed);
  resolveShots(state, intent);
  resolvePickups(state);
  resolveCollisions(state);
  updateClingers(state);
  // Age the toxic gas clouds and drain the hull for any the car is sitting in. After
  // collisions, so a drum ruptured this tick blooms its cloud before it is ticked.
  resolveGas(state);
  pruneSpawns(state);

  state.tick += 1;
  return state;
}
