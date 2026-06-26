import type { Hazard, Intent, SimState, Zombie } from './types';
import { applyCrash } from './health';
import { chunkAt } from './world';
import {
  BARREL_TUNING,
  BEAM_TUNING,
  BRUTE_TUNING,
  CAR_TUNING,
  CHUNK_LENGTH,
  CRASH_TUNING,
  DRIFT_TUNING,
  METEOR_TUNING,
  ECONOMY_TUNING,
  LANE_WIDTH,
  LOOKAHEAD,
  MOW_TUNING,
  PICKUP_TUNING,
  QUAKE_TUNING,
  RAMP_TUNING,
  WEAPON_TUNING,
  laneCenterX,
} from '../content/tuning';
import { weaponStats } from '../content/weapons';

// Collision footprint, in meters (lane-space × world-forward). Height is only a
// jump flag. A car above the clearance sails over ground-class hazards
// (docs/ARCHITECTURE.md → Collision).
const CAR_HALF_WIDTH = 0.95;
const CAR_LENGTH = 4;
const HAZARD_HALF_WIDTH = 1.0;
const HAZARD_HALF_LENGTH = 1.6;
// The toppled rig is a longer, slightly wider blocker than a car wreck.
const RIG_HALF_WIDTH = 1.15;
const RIG_HALF_LENGTH = 2.8;
// The concrete barrier is a wide, shallow wall: it fills the lane side to side but
// is shallow front-to-back, so it reads as a wall, not a long vehicle.
const BARRIER_HALF_WIDTH = 1.2;
const BARRIER_HALF_LENGTH = 0.8;
// The crashed bus is the longest blocker, a wall along the whole lane.
const BUS_HALF_WIDTH = 1.15;
const BUS_HALF_LENGTH = 4.6;
// A spike strip is a thin band across the lane: lane-wide, shallow front-to-back.
const SPIKES_HALF_WIDTH = 1.3;
const SPIKES_HALF_LENGTH = 0.9;
// A boulder is a compact rubble mound, narrower and shorter than a wreck, so it
// leaves a little more room to thread, but it is still squarely in the lane.
const BOULDER_HALF_WIDTH = 0.85;
const BOULDER_HALF_LENGTH = 0.95;
// A barrel is a slim drum, the smallest footprint of any blocker.
const BARREL_HALF_WIDTH = 0.6;
const BARREL_HALF_LENGTH = 0.6;
// A landed meteor is a crater of rock filling much of its lane.
const METEOR_HALF_WIDTH = 1.1;
const METEOR_HALF_LENGTH = 1.1;
// A road gap spans most of its lane (you can't straddle it) and a short run of
// road (short enough to clear with one jump).
const GAP_HALF_WIDTH = 1.35;
const GAP_HALF_LENGTH = 3.5;
// The UFO beam's lethal strip: about a lane wide, a thin band across the road. You
// jump it or be off its settled lane (the safe lane is always clear of it).
const BEAM_HALF_WIDTH = 1.2;
const BEAM_HALF_LENGTH = 2.2;
// The collapse ramp: a lane-wide wedge of rubble a few meters deep. Touching its
// near base launches the car, so its footprint only needs to cover the run-up.
const RAMP_HALF_WIDTH = 1.2;
const RAMP_HALF_LENGTH = 2.0;
// Zombies are slimmer than a wreck. The car has to be genuinely on the line to
// mow them, but the bumper's reach still does the work.
const ZOMBIE_HALF_WIDTH = 0.6;
const ZOMBIE_HALF_LENGTH = 0.55;
// A lift pickup hovers in the lane; the car gathers it on a generous footprint
// so a clean pass down the lane reliably scoops it.
const PICKUP_HALF_WIDTH = 0.9;
const PICKUP_HALF_LENGTH = 0.9;
const JUMP_CLEARANCE = 0.7;
const PRUNE_BEHIND = 14;

/**
 * Materialize spawns for any chunk that has entered the lookahead window, purely
 * from `(seed, index)`, routing each by kind: wrecks/rigs/boulders/barrels become
 * damaging hazards, zombies become mowable fodder, the rest become pickups.
 * Mirrors the renderer's pull-based streaming: nothing is generated until it is
 * about to matter. Runs only when the car
 * crosses a chunk boundary, not every tick.
 */
export function materializeSpawns(state: SimState): void {
  while (state.nextSpawnChunk * CHUNK_LENGTH <= state.distance + LOOKAHEAD) {
    const chunk = chunkAt(state.seed, state.nextSpawnChunk);
    const base = state.nextSpawnChunk * CHUNK_LENGTH;
    for (const spawn of chunk.spawns) {
      if (spawn.kind === 'zombie') {
        state.zombies.push({
          lane: spawn.lane,
          x: laneCenterX(spawn.lane),
          forward: base + spawn.z,
          phase: spawn.phase,
          mowed: false,
          // A brute is a damaging heavy zombie with several hit points; a plain
          // zombie leaves both unset and dies in one hit, never costing hull.
          brute: spawn.brute ? true : undefined,
          hp: spawn.brute ? BRUTE_TUNING.hp : undefined,
        });
      } else if (spawn.kind === 'jump' || spawn.kind === 'health' || spawn.kind === 'ammo') {
        // The three on-ground collectibles.
        state.pickups.push({
          kind: spawn.kind,
          lane: spawn.lane,
          x: laneCenterX(spawn.lane),
          forward: base + spawn.z,
          phase: spawn.phase,
          taken: false,
        });
      } else if (spawn.kind === 'drifter') {
        // A wreck that slides from its lane to an adjacent one as it nears.
        const fromX = laneCenterX(spawn.lane);
        state.hazards.push({
          kind: 'drifter',
          lane: spawn.lane,
          x: fromX,
          forward: base + spawn.z,
          hit: false,
          driftFromX: fromX,
          driftToX: laneCenterX(spawn.toLane),
          hp: WEAPON_TUNING.wreckHp,
        });
      } else if (spawn.kind === 'beam') {
        // A UFO beam: a lethal strip that sweeps from its start lane across to its
        // target lane as it nears (`updateBeams`). Both lanes are non-safe.
        const fromX = laneCenterX(spawn.lane);
        state.hazards.push({
          kind: 'beam',
          lane: spawn.lane,
          x: fromX,
          forward: base + spawn.z,
          hit: false,
          beamFromX: fromX,
          beamToX: laneCenterX(spawn.toLane),
        });
      } else if (spawn.kind === 'meteor') {
        // A sky meteor: harmless until `updateMeteors` lands it on this lane.
        state.hazards.push({
          kind: 'meteor',
          lane: spawn.lane,
          x: laneCenterX(spawn.lane),
          forward: base + spawn.z,
          hit: false,
          landed: false,
        });
      } else {
        // wreck | rig | barrier | bus | boulder | barrel | spikes | gap | ramp —
        // the static road objects. A gap flagged `opening` is a quake crack:
        // harmless until `updateQuakes` opens it. A ramp is the lone non-damaging
        // one (it launches the car; `resolveCollisions`).
        state.hazards.push({
          kind: spawn.kind,
          lane: spawn.lane,
          x: laneCenterX(spawn.lane),
          forward: base + spawn.z,
          hit: false,
          open: spawn.kind === 'gap' && spawn.opening ? false : undefined,
          hp: spawn.kind === 'wreck' ? WEAPON_TUNING.wreckHp : undefined,
        });
      }
    }
    state.nextSpawnChunk += 1;
  }
}

/**
 * Ease every live drifter toward its target lane based on how close it is. The
 * slide runs as the gap (forward − distance) closes from `startGap` to `endGap`,
 * smoothstepped so it accelerates in and settles softly; past `endGap` it sits in
 * the target lane for the final approach (docs/DESIGN.md → roster: the slide is
 * the telegraph). Deterministic: a pure function of position, no RNG. It is
 * allocation-free. Runs before collisions so a hit reads the wreck's current X.
 */
export function updateDrifters(state: SimState): void {
  const d = DRIFT_TUNING;
  for (const h of state.hazards) {
    if (h.kind !== 'drifter' || h.hit) continue;
    if (h.driftFromX === undefined || h.driftToX === undefined) continue;
    const gap = h.forward - state.distance;
    let t = (d.startGap - gap) / (d.startGap - d.endGap);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const s = t * t * (3 - 2 * t); // smoothstep
    h.x = h.driftFromX + (h.driftToX - h.driftFromX) * s;
  }
}

/**
 * Sweep each UFO beam's lethal strip from its start lane across to its target lane
 * as the gap closes from `BEAM_TUNING.startGap` to `endGap`, then hold it there for
 * the final approach. The sweep is the telegraph: the strip is visible crossing the
 * lanes long before the car arrives, and it settles on a committed lane before the
 * crossing, so a square hit is always on a lane it plainly moved to. The strip stays
 * among non-safe lanes, so fleeing to the safe lane is always the out. Deterministic
 * (a function of the gap) and allocation-free; runs before collisions read `x`.
 */
export function updateBeams(state: SimState): void {
  const b = BEAM_TUNING;
  for (const h of state.hazards) {
    if (h.kind !== 'beam' || h.hit) continue;
    if (h.beamFromX === undefined || h.beamToX === undefined) continue;
    const gap = h.forward - state.distance;
    let t = (b.startGap - gap) / (b.startGap - b.endGap);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const s = t * t * (3 - 2 * t); // smoothstep
    h.x = h.beamFromX + (h.beamToX - h.beamFromX) * s;
  }
}

/**
 * Land any falling meteor whose target has come within `impactGap`. While it
 * falls it is harmless (collisions skip it); the tick it lands it latches
 * `landed`, turning into a lethal, un-jumpable blocker, and emits one `exploded`
 * event so the renderer throws the impact burst. Deterministic (a function of the
 * gap) and allocation-free. Runs before collisions so a landing this tick can hit.
 */
export function updateMeteors(state: SimState): void {
  for (const h of state.hazards) {
    if (h.kind !== 'meteor' || h.landed || h.hit) continue;
    if (h.forward - state.distance <= METEOR_TUNING.impactGap) {
      h.landed = true;
      state.events.push({ type: 'exploded', x: h.x, forward: h.forward });
    }
  }
}

/**
 * Tear open any quake crack the car has reached (`QUAKE_TUNING.openGap`). While a
 * quake gap is a crack it is `open: false` and collisions skip it (a harmless
 * telegraph); the tick it opens it latches `open: true`, becoming a lethal hole,
 * and emits one `exploded` event so the renderer kicks up the dust burst. The gaps
 * sit at staggered forward positions, so they open in a wave as the car advances.
 * Deterministic (a function of the gap) and allocation-free. Runs before collisions
 * so a gap that opens this tick can already swallow the car.
 */
export function updateQuakes(state: SimState): void {
  for (const h of state.hazards) {
    if (h.kind !== 'gap' || h.open !== false || h.hit) continue;
    if (h.forward - state.distance <= QUAKE_TUNING.openGap) {
      h.open = true;
      state.events.push({ type: 'exploded', x: h.x, forward: h.forward });
    }
  }
}

/**
 * Swept overlap of the car against live hazards. The car's front is at
 * `distance`; a hazard within the forward span and lane band is a hit unless the
 * car is jumping over it. A square hit costs more hull and momentum than a
 * glancing scrape. One hazard damages the car once.
 */
export function resolveCollisions(state: SimState): void {
  const car = state.car;
  for (const h of state.hazards) {
    if (h.hit) continue;
    // A meteor is harmless until it lands; a falling rock never collides.
    if (h.kind === 'meteor' && !h.landed) continue;
    // A quake gap is harmless while it is still just a telegraph crack.
    if (h.kind === 'gap' && h.open === false) continue;

    // The collapse ramp is the lone friendly object: it launches the car over the
    // rubble instead of crashing it. Handled here on its own footprint so it skips
    // the wall/crash machinery below, and so the rest of the loop narrows `h.kind`
    // to the damaging kinds (the death-cause assignment relies on that).
    if (h.kind === 'ramp') {
      const onRamp =
        state.distance >= h.forward - RAMP_HALF_LENGTH &&
        state.distance - CAR_LENGTH <= h.forward + RAMP_HALF_LENGTH;
      if (!onRamp) continue;
      if (Math.abs(car.lateralX - h.x) >= CAR_HALF_WIDTH + RAMP_HALF_WIDTH) continue;
      h.hit = true;
      // A grounded car is vaulted into a free arc (no charge spent, no hull cost,
      // momentum kept). An airborne car is already clearing the debris, so it just
      // passes over without a second launch.
      if (!car.airborne) {
        car.airborne = true;
        car.vertVel = RAMP_TUNING.launchImpulse;
        state.events.push({ type: 'ramped', x: h.x, forward: h.forward });
      }
      continue;
    }

    const rig = h.kind === 'rig';
    const barrier = h.kind === 'barrier';
    const bus = h.kind === 'bus';
    const boulder = h.kind === 'boulder';
    const barrel = h.kind === 'barrel';
    const meteor = h.kind === 'meteor';
    const gap = h.kind === 'gap';
    const spikes = h.kind === 'spikes';
    const beam = h.kind === 'beam';
    // Lethal walls (rig, concrete barrier, crashed bus, landed meteor) are too
    // tall/solid to jump: the only out is a lane change. Everything else is
    // ground-class — a jump clears it (the beam, gap, and spikes included)
    // (docs/DESIGN.md → readability: lethal reads as a wall; jump it or take the lane).
    const tall = rig || barrier || bus || meteor;
    // A road gap and a spike strip are lethal ground traps: not things you ram but
    // things you must not be on while grounded (jump or change lane, or die).
    const lethalTrap = gap || spikes;
    const halfWidth = rig
      ? RIG_HALF_WIDTH
      : barrier
        ? BARRIER_HALF_WIDTH
        : bus
          ? BUS_HALF_WIDTH
          : boulder
            ? BOULDER_HALF_WIDTH
            : barrel
              ? BARREL_HALF_WIDTH
              : meteor
                ? METEOR_HALF_WIDTH
                : gap
                  ? GAP_HALF_WIDTH
                  : spikes
                    ? SPIKES_HALF_WIDTH
                    : beam
                      ? BEAM_HALF_WIDTH
                      : HAZARD_HALF_WIDTH;
    const halfLength = rig
      ? RIG_HALF_LENGTH
      : barrier
        ? BARRIER_HALF_LENGTH
        : bus
          ? BUS_HALF_LENGTH
          : boulder
            ? BOULDER_HALF_LENGTH
            : barrel
              ? BARREL_HALF_LENGTH
              : meteor
                ? METEOR_HALF_LENGTH
                : gap
                  ? GAP_HALF_LENGTH
                  : spikes
                    ? SPIKES_HALF_LENGTH
                    : beam
                      ? BEAM_HALF_LENGTH
                      : HAZARD_HALF_LENGTH;

    // Forward overlap: car spans [distance - CAR_LENGTH, distance].
    const forwardOverlap =
      state.distance >= h.forward - halfLength && state.distance - CAR_LENGTH <= h.forward + halfLength;
    if (!forwardOverlap) continue;

    const dx = Math.abs(car.lateralX - h.x);
    if (dx >= CAR_HALF_WIDTH + halfWidth) continue;

    // A jump clears every ground-class hazard (wreck, boulder, barrel, gap, spikes,
    // beam), but the lethal walls (rig, barrier, bus, landed meteor) are too
    // tall/solid to clear, so the only out is a lane change (docs/DESIGN.md →
    // telegraphed, dodgeable, safe lane open).
    if (!tall && car.height > JUMP_CLEARANCE) continue;

    h.hit = true;

    // A lethal ground trap (a road gap, a spike strip) is not a thing you ram; it is
    // a thing you fall into / shred on while grounded. Armor can't save you from
    // missing asphalt or a bed of spikes: it is an outright, attributable death (you
    // should have jumped or changed lane). No frenazo math beyond a lurch.
    if (lethalTrap) {
      state.events.push({ type: 'crashed', impact: car.speed, lane: h.lane });
      state.events.push({ type: 'hullDamaged', amount: car.health, destroyed: true });
      car.health = 0;
      car.speed *= CRASH_TUNING.frontalSpeedKeep;
      state.combo = 0;
      state.comboTicks = 0;
      if (!state.dead) {
        state.dead = true;
        state.deathCause = gap ? 'gap' : 'spikes';
        state.events.push({ type: 'died' });
      }
      continue;
    }
    const impact = car.speed;
    const glancing = dx > halfWidth;
    state.events.push({ type: 'crashed', impact, lane: h.lane });
    // The lethal walls (rig, barrier, bus, meteor) scale the hull cost up so a
    // square hit at speed empties the bar outright. The boulder's is scaled down, a
    // ram you survive to regret; the barrel's is scaled up (the blast in your face).
    const hazardMul = rig
      ? CRASH_TUNING.rigDamageMul
      : barrier
        ? CRASH_TUNING.barrierDamageMul
        : bus
          ? CRASH_TUNING.busDamageMul
          : boulder
            ? CRASH_TUNING.boulderDamageMul
            : barrel
              ? CRASH_TUNING.barrelDamageMul
              : meteor
                ? CRASH_TUNING.meteorDamageMul
                : beam
                  ? CRASH_TUNING.beamDamageMul
                  : 1;
    applyCrash(car, impact, glancing, state.events, state.loadout.damageMul * hazardMul);
    // The frenazo: a square hit bites momentum, a clip less so; a square wall hit
    // (rig, barrier, bus, meteor) stops the car near-dead, a boulder less than a
    // wreck, a barrel hard. Handling is never touched, only speed and hull.
    car.speed *= glancing
      ? CRASH_TUNING.glancingSpeedKeep
      : rig
        ? CRASH_TUNING.rigSpeedKeep
        : barrier
          ? CRASH_TUNING.barrierSpeedKeep
          : bus
            ? CRASH_TUNING.busSpeedKeep
            : boulder
              ? CRASH_TUNING.boulderSpeedKeep
              : barrel
                ? CRASH_TUNING.barrelSpeedKeep
                : meteor
                  ? CRASH_TUNING.meteorSpeedKeep
                  : beam
                    ? CRASH_TUNING.beamSpeedKeep
                    : CRASH_TUNING.frontalSpeedKeep;
    // Taking a hull hit breaks the streak. Greed has a cost (docs/DESIGN.md).
    state.combo = 0;
    state.comboTicks = 0;

    // Ramming a barrel sets it off: the blast clears the lanes around it (and the
    // kills start a fresh streak), but you still ate the crash above. `h.hit` is
    // already latched, so detonate the core directly.
    if (barrel) explodeBarrel(state, h);

    if (car.health <= 0 && !state.dead) {
      state.dead = true;
      // The blocker that emptied the hull is the death cause. Every HazardKind
      // is a DeathCause, so the kind maps straight through for the death card.
      state.deathCause = h.kind;
      state.events.push({ type: 'died' });
    }
  }
}

/**
 * Set off a barrel that has not gone yet: latch it and run the blast. Shots route
 * here; a ram runs `explodeBarrel` directly because the collision already latched
 * `hit`. Idempotent via the `hit` guard, so a chain can never double-fire one
 * barrel (docs/DESIGN.md → roster: the gun's area tool).
 */
export function detonateBarrel(state: SimState, h: Hazard): void {
  if (h.hit) return;
  h.hit = true;
  explodeBarrel(state, h);
}

/**
 * The blast core: emit the render event, kill every live zombie in the blast box,
 * and chain to any other barrel close enough. Allocation-free: it scans the live
 * lists in place and recurses through `detonateBarrel`, whose `hit` guard bounds
 * the chain to each barrel once.
 */
function explodeBarrel(state: SimState, h: Hazard): void {
  const t = BARREL_TUNING;
  state.events.push({ type: 'exploded', x: h.x, forward: h.forward });
  for (const z of state.zombies) {
    if (z.mowed) continue;
    if (Math.abs(z.forward - h.forward) > t.blastForward) continue;
    if (Math.abs(z.x - h.x) > t.blastLateral) continue;
    payKill(state, z);
  }
  for (const b of state.hazards) {
    if (b === h || b.hit || b.kind !== 'barrel') continue;
    if (Math.abs(b.forward - h.forward) > t.chainForward) continue;
    if (Math.abs(b.x - h.x) > t.chainLateral) continue;
    detonateBarrel(state, b);
  }
}

/**
 * Bank one zombie kill, rammed or shot. Marks it mowed (so it pays once),
 * climbs the streak, pays scrap scaled by the streak, and emits the kill event
 * the renderer turns into a ragdoll + scrap ping. The ramming speed surge is
 * applied by `resolveMows` only, never by a ranged shot. A brute pays its
 * `BRUTE_TUNING.scrapBonus` on top, so clearing one is a real greed reward.
 */
function payKill(state: SimState, z: Zombie): void {
  z.mowed = true;
  state.combo += 1;
  state.comboTicks = ECONOMY_TUNING.comboWindowTicks;
  state.zombiesMowed += 1;
  const streakBonus = Math.min(state.combo - 1, ECONOMY_TUNING.comboScrapCap);
  const bruteBonus = z.brute ? BRUTE_TUNING.scrapBonus : 0;
  state.scrap += ECONOMY_TUNING.mowScrapBase + streakBonus * ECONOMY_TUNING.mowScrapStep + bruteBonus;
  state.events.push({ type: 'zombieMowed', lane: z.lane, combo: state.combo, x: z.x });
}

/**
 * Apply one gun hit to a target. A normal zombie dies outright; a brute is chipped
 * by `damage` (the weapon's killsPerShot) and only pays out (`payKill`) once its
 * `hp` is spent. Returns true when the target died this hit, so the shot loop can
 * advance to the next target. A brute that merely takes a chip still absorbed the
 * hit, so the loop stops there for this slot.
 */
function damageZombie(state: SimState, z: Zombie, damage: number): boolean {
  if (!z.brute) {
    payKill(state, z);
    return true;
  }
  z.hp = (z.hp ?? BRUTE_TUNING.hp) - damage;
  if (z.hp <= 0) {
    payKill(state, z);
    return true;
  }
  return false;
}

/**
 * Fire the gun for one tick. The trigger is held (`intent.fire`); the sim gates
 * the cadence with the current weapon tier's `fireIntervalTicks`, so holding it
 * auto-fires. The tier (`weaponStats(loadout.weaponLevel)`) sets how far the shot
 * reaches (`range`), how many lanes wide it shreds (`laneSpread`), and how many
 * zombies one shot destroys (`killsPerShot`), nearest in the covered column
 * first. Each kill pays scrap and feeds the streak exactly like a mow but without
 * the ramming surge. With no ammo the gun is silent and the player goes back to
 * mowing (docs/DESIGN.md → Pillar 2). You can't shoot mid-jump. Allocation-free:
 * `killsPerShot` nearest-scans, no temporary arrays.
 */
export function resolveShots(state: SimState, intent: Intent): void {
  const car = state.car;
  if (car.fireCooldown > 0) car.fireCooldown -= 1;
  if (!intent.fire || car.airborne || car.ammo <= 0 || car.fireCooldown > 0) return;

  const w = weaponStats(state.loadout.weaponLevel);
  car.fireCooldown = w.fireIntervalTicks;
  car.ammo = Math.max(0, car.ammo - WEAPON_TUNING.ammoPerShot);
  state.events.push({ type: 'shotFired', x: car.lateralX, level: w.level });

  // The column the shot covers: the car's lane plus (laneSpread-1)/2 lanes each
  // side. laneSpread 1 = own lane, 3 = ±1, 5 = ±2.
  const halfWidth = WEAPON_TUNING.laneHalfWidth + ((w.laneSpread - 1) / 2) * LANE_WIDTH;

  // A barrel in the column is the priority target: if one is at least as near as
  // the nearest zombie, the shot detonates it and its blast clears the crowd
  // behind it (docs/DESIGN.md → roster: the gun's area tool). The shot is spent
  // on the barrel; the blast does the killing, so we return before the zombie
  // pass. A far barrel never steals a shot from a zombie at the bumper.
  let barrel: Hazard | null = null;
  let barrelAhead = Infinity;
  for (const h of state.hazards) {
    if (h.kind !== 'barrel' || h.hit) continue;
    const ahead = h.forward - state.distance;
    if (ahead <= 0 || ahead > w.range) continue;
    if (Math.abs(h.x - car.lateralX) > halfWidth) continue;
    if (ahead < barrelAhead) {
      barrelAhead = ahead;
      barrel = h;
    }
  }
  if (barrel) {
    let nearestZombie = Infinity;
    for (const z of state.zombies) {
      if (z.mowed) continue;
      const ahead = z.forward - state.distance;
      if (ahead <= 0 || ahead > w.range) continue;
      if (Math.abs(z.x - car.lateralX) > halfWidth) continue;
      if (ahead < nearestZombie) nearestZombie = ahead;
    }
    if (barrelAhead <= nearestZombie) {
      detonateBarrel(state, barrel);
      return;
    }
  }

  // A car (wreck or drifting wreck) in the column is shot apart by the gun: a shot
  // chips its integrity by `killsPerShot`, and at 0 it blows up. The car blocks the
  // shot, so one nearer than the nearest zombie eats this shot (the zombies behind
  // it are spared this round). The bigger the cannon, the fewer shots a car takes.
  let wreck: Hazard | null = null;
  let wreckAhead = Infinity;
  for (const h of state.hazards) {
    if ((h.kind !== 'wreck' && h.kind !== 'drifter') || h.hit) continue;
    const ahead = h.forward - state.distance;
    if (ahead <= 0 || ahead > w.range) continue;
    if (Math.abs(h.x - car.lateralX) > halfWidth) continue;
    if (ahead < wreckAhead) {
      wreckAhead = ahead;
      wreck = h;
    }
  }
  if (wreck) {
    let nearestZombie = Infinity;
    for (const z of state.zombies) {
      if (z.mowed) continue;
      const ahead = z.forward - state.distance;
      if (ahead <= 0 || ahead > w.range) continue;
      if (Math.abs(z.x - car.lateralX) > halfWidth) continue;
      if (ahead < nearestZombie) nearestZombie = ahead;
    }
    if (wreckAhead <= nearestZombie) {
      wreck.hp = (wreck.hp ?? WEAPON_TUNING.wreckHp) - w.killsPerShot;
      if (wreck.hp <= 0) {
        wreck.hit = true;
        state.events.push({ type: 'exploded', x: wreck.x, forward: wreck.forward });
      }
      return;
    }
  }

  // Spend `killsPerShot` points of damage, nearest first, within range and column.
  // A normal zombie costs one point (one kill); a brute soaks several before it
  // drops, so a strong cannon can fell one in a single shot while a weak one chips
  // it over several. Each point re-scans for the current nearest, so once a brute
  // drops the remaining points spill onto the crowd behind it.
  for (let k = 0; k < w.killsPerShot; k += 1) {
    let target: Zombie | null = null;
    let nearest = Infinity;
    for (const z of state.zombies) {
      if (z.mowed) continue;
      const ahead = z.forward - state.distance;
      if (ahead <= 0 || ahead > w.range) continue;
      if (Math.abs(z.x - car.lateralX) > halfWidth) continue;
      if (ahead < nearest) {
        nearest = ahead;
        target = z;
      }
    }
    if (!target) break;
    damageZombie(state, target, 1);
  }
}

/**
 * Mow the fodder: any live zombie the car overlaps on the ground is plowed,
 * never damage, never a slowdown, always scrap and a tiny surge, with the streak
 * climbing per kill (docs/DESIGN.md → Pillar 2). A jump sails clean over them,
 * trading the scrap for the air. `topSpeed` bounds how far a streak can push the
 * car past cruising. Each zombie pays once.
 *
 * A brute is the exception: ramming one is a crash, not a free mow. It costs hull
 * and momentum (`CRASH_TUNING.brute*`), breaks the streak, and only then is the
 * brute plowed (you do bulldoze through it). Shooting or dodging it is the smart
 * play; the crash is the price of ramming it.
 */
export function resolveMows(state: SimState, topSpeed: number): void {
  const car = state.car;
  if (car.height > JUMP_CLEARANCE) return;
  // Scrap Magnet widens the bumper's reach so you mow fodder you used to skim.
  const reach = ZOMBIE_HALF_WIDTH * state.loadout.grabRadiusMul;
  for (const z of state.zombies) {
    if (z.mowed) continue;

    const forwardOverlap =
      state.distance >= z.forward - ZOMBIE_HALF_LENGTH &&
      state.distance - CAR_LENGTH <= z.forward + ZOMBIE_HALF_LENGTH;
    if (!forwardOverlap) continue;
    if (Math.abs(car.lateralX - z.x) >= CAR_HALF_WIDTH + reach) continue;

    if (z.brute) {
      // Ramming a brute is a crash: a hull hit and a frenazo before you plow it.
      const impact = car.speed;
      state.events.push({ type: 'crashed', impact, lane: z.lane });
      applyCrash(car, impact, false, state.events, state.loadout.damageMul * CRASH_TUNING.bruteDamageMul);
      car.speed *= CRASH_TUNING.bruteSpeedKeep;
      // The hull hit breaks the streak before the kill banks a fresh one.
      state.combo = 0;
      state.comboTicks = 0;
      payKill(state, z);
      if (car.health <= 0 && !state.dead) {
        state.dead = true;
        state.deathCause = 'brute';
        state.events.push({ type: 'died' });
      }
      continue;
    }

    payKill(state, z);

    // A surge, clamped, and never below the current speed. Ramming fodder only
    // ever helps you forward (a ranged shot grants no surge).
    const boosted = Math.min(car.speed + MOW_TUNING.speedBoost, topSpeed + MOW_TUNING.overspeedCap);
    car.speed = Math.max(car.speed, boosted);
  }
}

/**
 * Gather pickups: any live collectible the car overlaps on the ground is
 * consumed and applied by kind: a lift pickup refills a jump charge (up to the
 * cap), a health pickup repairs the hull, an ammo box refills the gun. A jump
 * sails clean over them. You cannot scoop while airborne, so refills reward
 * staying down the infested lane, not bunny-hopping it (docs/DESIGN.md →
 * Pillar 3). Each pickup pays once.
 */
export function resolvePickups(state: SimState): void {
  const car = state.car;
  if (car.height > JUMP_CLEARANCE) return;
  // Scrap Magnet widens the scoop; Lift Tank raises the jump-charge cap.
  const reach = PICKUP_HALF_WIDTH * state.loadout.grabRadiusMul;
  const jumpCap = CAR_TUNING.jumpMaxCharges + state.loadout.bonusJumpCharges;
  for (const p of state.pickups) {
    if (p.taken) continue;

    const forwardOverlap =
      state.distance >= p.forward - PICKUP_HALF_LENGTH &&
      state.distance - CAR_LENGTH <= p.forward + PICKUP_HALF_LENGTH;
    if (!forwardOverlap) continue;
    if (Math.abs(car.lateralX - p.x) >= CAR_HALF_WIDTH + reach) continue;

    p.taken = true;
    if (p.kind === 'jump') {
      car.jumpCharges = Math.min(car.jumpCharges + 1, jumpCap);
    } else if (p.kind === 'health') {
      car.health = Math.min(car.health + PICKUP_TUNING.healthRestore, CAR_TUNING.maxHealth);
    } else {
      const cap = weaponStats(state.loadout.weaponLevel).maxAmmo;
      car.ammo = Math.min(car.ammo + PICKUP_TUNING.ammoRestore, cap);
    }
    state.events.push({ type: 'pickupCollected', kind: p.kind, lane: p.lane, x: p.x });
  }
}

/** Drop entities that have scrolled safely behind the car. Reuses the array. */
function pruneBehind<T extends { forward: number }>(list: T[], distance: number): void {
  let write = 0;
  for (let read = 0; read < list.length; read += 1) {
    if (list[read].forward >= distance - PRUNE_BEHIND) {
      list[write] = list[read];
      write += 1;
    }
  }
  list.length = write;
}

/** Prune hazards, zombies, and pickups that are now behind the car. */
export function pruneSpawns(state: SimState): void {
  pruneBehind(state.hazards, state.distance);
  pruneBehind(state.zombies, state.distance);
  pruneBehind(state.pickups, state.distance);
}
