/**
 * Procedural run-title generator for the death card — data, not code
 * (docs/DESIGN.md → tone: absurdist maximalism; the humor lives in the writing,
 * never the controls).
 *
 * `runTitle(seed, cause, stats)` composes a single absurd headline (e.g.
 * "Crushed by Falling Real Estate") from typed templates and word pools, using
 * only the sim's seeded RNG. It is a pure function of its inputs: the same
 * `(seed, cause, stats)` always yields the same title, on every platform.
 *
 * Pure data: this module imports nothing impure — no DOM, no Three.js, no
 * `Date.now`, no `Math.random` — so it is safe for the sim and the UI alike to
 * call (the sim/render border is enforced by lint, not convention).
 */

import { makeRng, nextInt, hash2, type Rng } from '../sim/rng';

/**
 * What landed the fatal blow, as the death card understands it. These mirror the
 * on-road blockers (`HazardKind`) — `wreck`, `rig`, `boulder`, `barrel`, the
 * sliding `drifter` — plus `attrition`, a defensive fallback for a hull that gave
 * out with no single blow on record. Death is always attributable (docs/DESIGN.md
 * → death must read as a player's decision), so there is no "random" cause.
 */
export type DeathCause =
  | 'wreck'
  | 'rig'
  | 'boulder'
  | 'barrel'
  | 'drifter'
  | 'meteor'
  | 'gap'
  | 'attrition';

/** Every cause, in a stable order — used to key the RNG and to drive tests. */
export const DEATH_CAUSES: readonly DeathCause[] = [
  'wreck',
  'rig',
  'boulder',
  'barrel',
  'drifter',
  'meteor',
  'gap',
  'attrition',
];

/**
 * The run stats the title may weave in. A subset of `SimState`'s run totals,
 * passed by value so this module never reaches into the live sim.
 */
export interface RunStats {
  /** Total distance driven this run, in meters. */
  readonly distance: number;
  /** Zombies killed this run (rammed or shot). */
  readonly zombiesKilled: number;
  /** Scrap banked this run. */
  readonly scrap: number;
}

/**
 * Word pools the slot tokens draw from. Themed for "every apocalypse at once":
 * falling cities, kaiju, invaders, the risen dead, cosmic debris. Adding to a
 * pool widens the variety without touching the generator.
 */
const POOLS: Record<string, readonly string[]> = {
  adj: [
    'Falling',
    'Sentient',
    'Radioactive',
    'Reanimated',
    'Cursed',
    'Weaponized',
    'Interdimensional',
    'Discount',
    'Government-Issue',
    'Artisanal',
    'Off-Brand',
    'Ancient',
  ],
  structure: [
    'Real Estate',
    'Architecture',
    'Infrastructure',
    'Public Housing',
    'Parking Garage',
    'Strip Mall',
    'Overpass',
    'Monument',
  ],
  beast: [
    'Kaiju',
    'Megafauna',
    'Hell-Moose',
    'Sky-Squid',
    'Behemoth',
    'Tentacle',
    'War-Elk',
    'Leviathan',
  ],
  invader: [
    'Flying Saucer',
    'War Mech',
    'Probe Droid',
    'Mothership',
    'Tripod',
    'Orbital Laser',
    'Abduction Beam',
  ],
  horde: [
    'the Restless Dead',
    'the Shambling Majority',
    'a Polite Mob',
    'the Brunch Crowd',
    'a Union of Ghouls',
    'the Welcoming Committee',
  ],
  cosmic: [
    'a Rogue Asteroid',
    'Falling Debris',
    'a Stray Satellite',
    'a Comet on Layaway',
    'Space Junk',
    'a Dropped Moon',
  ],
  verb: [
    'Crushed',
    'Flattened',
    'Folded',
    'Pancaked',
    'Annexed',
    'Disassembled',
    'Repossessed',
    'Filed',
  ],
  finale: [
    'on the Last Highway',
    'at Mile {dist}',
    'with {kills} Confirmed Kills',
    'and No Regrets',
    'in Stunning Fashion',
    'as Foretold',
    'for the Last Time',
    'on a Tuesday',
  ],
};

/**
 * Title templates per cause. `{token}` slots are filled from `POOLS` of the same
 * name; `{dist}` and `{kills}` are filled from `RunStats`. Each cause leans on
 * the objects it can plausibly involve so the headline still reads as honest.
 */
const TEMPLATES: Record<DeathCause, readonly string[]> = {
  wreck: [
    'Crushed by {adj} {structure}',
    '{verb} by an {adj} Sedan',
    '{verb} into {adj} {structure}',
    'Out-Parked by the {adj} Dead',
    'Met a {adj} Wreck {finale}',
  ],
  rig: [
    '{verb} by an {adj} Big Rig',
    'Jackknifed by {adj} Logistics',
    '{verb} Flat by Eighteen Wheels',
    'Lost an Argument with a {adj} Trailer',
    'Out-Hauled {finale}',
  ],
  boulder: [
    'Flattened by {adj} Geology',
    'Crushed under {adj} Rubble',
    'Met a Boulder It Should Have Jumped',
    '{verb} by a {adj} Rockslide',
    'Out-Jumped by Gravity {finale}',
  ],
  barrel: [
    '{verb} by an {adj} Fireball',
    'Cooked Off with the Barrels',
    'Detonated {finale}',
    'Went Up in {adj} Flames',
    'Played with Fire {finale}',
  ],
  drifter: [
    'T-Boned by a {adj} Drifter',
    'Side-Swiped {finale}',
    'Out-Slid by a Rolling Wreck',
    '{verb} by a Wreck That Moved',
    'Never Saw It Slide {finale}',
  ],
  meteor: [
    '{verb} by {cosmic}',
    'Smited from Orbit {finale}',
    'Stood Under the {adj} Sky',
    'Out-Run by a Meteor',
    'Parked in the Impact Zone {finale}',
  ],
  gap: [
    'Found the Hole in the {adj} Plan',
    'Drove Into a Gap That Wins',
    'Should Have Jumped {finale}',
    'Swallowed by the {adj} Road',
    'Off the Edge {finale}',
  ],
  attrition: [
    'Hull Gave Out {finale}',
    'Nibbled Apart by {horde}',
    'Outlasted by {invader}',
    'Undone by {cosmic}',
    'Rattled to Pieces by {beast}',
    'Quietly Disassembled {finale}',
  ],
};

/** Draw one element from a non-empty pool with the seeded stream. */
function pick<T>(rng: Rng, pool: readonly T[]): T {
  return pool[nextInt(rng, 0, pool.length)];
}

/**
 * Fill every `{token}` in `template`. Pool tokens draw from `POOLS`; the stat
 * tokens `{dist}`/`{kills}` read `stats`. Slots resolve left-to-right so the
 * draw order — and thus the result — is fully determined by the stream. Pool
 * entries may themselves contain tokens (e.g. a `finale` of "at Mile {dist}"),
 * so we expand repeatedly until the string is stable, with a depth guard so a
 * malformed self-referential pool can never loop forever.
 */
function fill(template: string, rng: Rng, stats: RunStats): string {
  const expand = (s: string): string =>
    s.replace(/\{(\w+)\}/g, (match, token: string) => {
      if (token === 'dist') return String(Math.max(0, Math.round(stats.distance)));
      if (token === 'kills') return String(Math.max(0, Math.round(stats.zombiesKilled)));
      const pool = POOLS[token];
      if (pool) return pick(rng, pool);
      return match; // unknown token: leave it untouched rather than guess.
    });
  let out = template;
  for (let depth = 0; depth < 8 && /\{\w+\}/.test(out); depth++) {
    out = expand(out);
  }
  return out;
}

/**
 * Compose the absurd death-card headline for a finished run.
 *
 * Deterministic: keyed on `(seed, cause)` via `hash2`, so the same seed and
 * cause always produce the same title, while different causes from one seed read
 * differently. `stats` only ever fills numeric slots, so passing it never breaks
 * determinism. Returns a non-empty, fully-resolved string.
 */
export function runTitle(seed: number, cause: DeathCause, stats: RunStats): string {
  const rng = makeRng(hash2(seed, DEATH_CAUSES.indexOf(cause) + 1));
  const template = pick(rng, TEMPLATES[cause]);
  return fill(template, rng, stats);
}
