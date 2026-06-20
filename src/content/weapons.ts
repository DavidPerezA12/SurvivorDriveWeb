/**
 * Weapon tiers — data, not code (docs/DESIGN.md → Pillar 2 / Upgrades).
 *
 * The gun has a **level**, 1..MAX, derived from owned garage upgrades (see
 * `weaponLevel` in `Loadout`). Each level is a flat data row the sim reads at
 * fire time, so balancing the whole weapon track is editing this table — never
 * touching engine code. Modeled on *The Last Driver*'s "default shotgun → bigger
 * guns, more ammo" progression: every tier raises **destruction** (zombies one
 * shot drops), **range** (how far ahead it reaches), **cadence** (shots/sec),
 * the **spread** (how many lanes wide it shreds), and the **ammo** it carries.
 *
 * Pure data: this module imports nothing impure and is safe for the sim to read.
 */

export interface WeaponStats {
  /** 1-based tier. */
  readonly level: number;
  /** Display name (HUD / garage flavour). */
  readonly name: string;
  /** How far ahead of the car a shot reaches, in meters (the "distance"). */
  readonly range: number;
  /** Ticks between shots while the trigger is held — lower = faster cadence. */
  readonly fireIntervalTicks: number;
  /** Destruction: how many zombies a single shot drops (nearest first). */
  readonly killsPerShot: number;
  /** How many lanes wide the shot shreds: 1 = own lane, 3 = ±1, 5 = ±2. */
  readonly laneSpread: number;
  /** Rounds the mag starts a run with. */
  readonly startAmmo: number;
  /** Rounds the gun can hold — ammo boxes never refill past this. */
  readonly maxAmmo: number;
}

/**
 * Five tiers, from the scavenged shotgun to a road-clearing autocannon. Each step
 * is meant to pass the blindfold test — you feel the extra reach, rate, and
 * carnage within seconds, not read it on a stat screen.
 */
export const WEAPON_LEVELS: readonly WeaponStats[] = [
  { level: 1, name: 'Scrap Shotgun', range: 60, fireIntervalTicks: 9, killsPerShot: 1, laneSpread: 1, startAmmo: 45, maxAmmo: 90 },
  { level: 2, name: 'Pump Repeater', range: 76, fireIntervalTicks: 8, killsPerShot: 2, laneSpread: 1, startAmmo: 70, maxAmmo: 140 },
  { level: 3, name: 'Street Sweeper', range: 92, fireIntervalTicks: 7, killsPerShot: 3, laneSpread: 3, startAmmo: 100, maxAmmo: 200 },
  { level: 4, name: 'Twin Autocannon', range: 110, fireIntervalTicks: 6, killsPerShot: 4, laneSpread: 3, startAmmo: 140, maxAmmo: 280 },
  { level: 5, name: 'Apocalypse Cannon', range: 132, fireIntervalTicks: 5, killsPerShot: 6, laneSpread: 5, startAmmo: 180, maxAmmo: 360 },
] as const;

/** The highest weapon tier the garage can reach. */
export const MAX_WEAPON_LEVEL = WEAPON_LEVELS.length;

/** Clamp a level to the table and return its stats. Level 1 is the stock gun. */
export function weaponStats(level: number): WeaponStats {
  const i = Math.max(1, Math.min(level, MAX_WEAPON_LEVEL)) - 1;
  return WEAPON_LEVELS[i];
}
