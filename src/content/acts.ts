/**
 * Acts — the run's named distance bands and the per-act spawn mix that gives each
 * one its own character (docs/DESIGN.md → Run structure: "acts are tuned, not
 * procedural; each act's event mix and spawn weights are data tables"). The world
 * is **not** one uniform random sheet: every band throws a different challenge —
 * Outbreak eases you in, Rust teaches, the Swarm floods you with the dead, the
 * Visitors rain meteors, the Colossus walls you in with rigs, and Static turns
 * everything to eleven.
 *
 * Pure data: the sim reads this to weight each chunk's spawns by where it sits in
 * the run. The render side has its own act *mood/scenery* tables in
 * `src/render/mood.ts`; both walk the same six acts at the same `ACT_SPAN_M`
 * cadence, so "I died in act III" lines up between what you see and what you fight.
 */

/**
 * Meters each act spans before the next begins; the last act holds forever. Must
 * stay in lock-step with `ACT_SPAN` in `src/render/mood.ts` so gameplay and
 * scenery change place together.
 */
export const ACT_SPAN_M = 6000;

/** Human-readable act names, in order — for death cards and debugging. */
export const ACT_NAMES = ['Outbreak', 'Rust', 'Swarm', 'Visitors', 'Colossus', 'Static'] as const;

/** The per-act spawn mix. Each value is a per-non-safe-lane chance, per chunk. */
export interface SpawnWeights {
  /** Abandoned-car blocker — steer or ram. */
  readonly wreck: number;
  /** Toppled big rig — lethal wall, lane-change only. */
  readonly rig: number;
  /** Low rubble mound — jump or eat a small crash. */
  readonly boulder: number;
  /** Explosive barrel — shoot to clear a crowd. */
  readonly barrel: number;
  /** Drifting wreck — slides one lane over as it nears. */
  readonly drifter: number;
  /** Sky meteor — falls onto its lane, lethal once landed. */
  readonly meteor: number;
  /** Road gap — a hole in the surface; jump it or change lane, or fall in and die. */
  readonly gap: number;
  /** Zombie cluster — mowable/shootable fodder + scrap. */
  readonly zombieCluster: number;
  /** Lift pickup — a jump-charge refill. */
  readonly jumpPickup: number;
  /** Health pickup — repairs the hull. */
  readonly healthPickup: number;
  /** Ammo box — refills the gun. */
  readonly ammoPickup: number;
  /** Zombie cluster size bounds (inclusive). */
  readonly clusterMin: number;
  readonly clusterMax: number;
}

/**
 * Six hand-tuned profiles, one per act. Per-lane chances sum to < 1 so a lane can
 * still come up empty (and the safe lane is always skipped). The character of each
 * band is in the *shape* of its mix, not just its density.
 */
export const ACT_SPAWNS: readonly SpawnWeights[] = [
  // I · Outbreak — day one in the city, things just starting to go wrong. The
  // calmest act of all: a few stalled cars to thread, the first stray infected,
  // generous pickups, almost open road. No rigs, drifters, meteors or gaps yet —
  // it teaches the controls before the world properly ends.
  {
    wreck: 0.13,
    rig: 0.0,
    boulder: 0.03,
    barrel: 0.04,
    drifter: 0.0,
    meteor: 0.0,
    gap: 0.0,
    zombieCluster: 0.1,
    jumpPickup: 0.1,
    healthPickup: 0.08,
    ammoPickup: 0.1,
    clusterMin: 1,
    clusterMax: 2,
  },
  // II · Rust — abandoned suburbia. Gentle and teaching: wrecks to steer, boulders
  // to learn the jump, lone zombies, generous pickups, lots of open road. No rigs
  // to speak of, no drifters, no sky.
  {
    wreck: 0.16,
    rig: 0.02,
    boulder: 0.12,
    barrel: 0.03,
    drifter: 0.0,
    meteor: 0.0,
    gap: 0.0,
    zombieCluster: 0.14,
    jumpPickup: 0.12,
    healthPickup: 0.08,
    ammoPickup: 0.08,
    clusterMin: 1,
    clusterMax: 2,
  },
  // III · Swarm — the dead flood the lanes. Big hordes, barrels to clear them, ammo
  // to feed the gun. Blockers thin out so the threat is the crowd, not the walls.
  {
    wreck: 0.12,
    rig: 0.03,
    boulder: 0.04,
    barrel: 0.08,
    drifter: 0.02,
    meteor: 0.0,
    gap: 0.0,
    zombieCluster: 0.38,
    jumpPickup: 0.05,
    healthPickup: 0.06,
    ammoPickup: 0.12,
    clusterMin: 2,
    clusterMax: 5,
  },
  // IV · Visitors — the sky turns hostile. Meteors are the signature threat;
  // drifting wrecks and barrels keep the lanes shifting under you.
  {
    wreck: 0.12,
    rig: 0.04,
    boulder: 0.05,
    barrel: 0.06,
    drifter: 0.06,
    meteor: 0.07,
    gap: 0.03,
    zombieCluster: 0.22,
    jumpPickup: 0.05,
    healthPickup: 0.06,
    ammoPickup: 0.09,
    clusterMin: 1,
    clusterMax: 4,
  },
  // V · Colossus — giants stomp through. The wall act: rigs and wrecks everywhere,
  // boulders and drifters on top, pickups scarce. Reading the open line is the game.
  {
    wreck: 0.15,
    rig: 0.12,
    boulder: 0.1,
    barrel: 0.05,
    drifter: 0.06,
    meteor: 0.03,
    gap: 0.05,
    zombieCluster: 0.16,
    jumpPickup: 0.05,
    healthPickup: 0.05,
    ammoPickup: 0.07,
    clusterMin: 1,
    clusterMax: 3,
  },
  // VI · Static — reality fraying. Everything at once, maxed: every blocker, the
  // biggest hordes, meteors raining. Just enough pickups to keep a great run alive.
  {
    wreck: 0.14,
    rig: 0.09,
    boulder: 0.09,
    barrel: 0.07,
    drifter: 0.07,
    meteor: 0.07,
    gap: 0.06,
    zombieCluster: 0.16,
    jumpPickup: 0.05,
    healthPickup: 0.06,
    ammoPickup: 0.08,
    clusterMin: 2,
    clusterMax: 6,
  },
];

/** Which act (0-based, clamped to the last) a given distance falls in. */
export function actAt(distance: number): number {
  const i = Math.floor(Math.max(0, distance) / ACT_SPAN_M);
  return Math.min(i, ACT_SPAWNS.length - 1);
}

/** The spawn mix for the act a given distance sits in. */
export function spawnWeightsAt(distance: number): SpawnWeights {
  return ACT_SPAWNS[actAt(distance)];
}
