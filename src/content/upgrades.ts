/**
 * Upgrades — data, not code (docs/DESIGN.md → Upgrades: "feel first, numbers
 * second"). Upgrades are grouped into **families**, each a short ordered chain of
 * tiers bought with banked scrap: owning tier N requires tier N-1, and each tier
 * pushes one numeric dial further — TIRES 0/2, JUMP 0/3, the GUN 0/4, modeled on
 * *The Last Driver*'s levelled garage. A single owned set drives everything, so
 * `Loadout` stays pure run input and the save schema never changes.
 *
 * The build is also *visible on the car* (docs/DESIGN.md → Upgrades render on the
 * car model); the render layer reads the same owned set to dress the hero car.
 * Every tier must pass the blindfold test, and all of it is earned with in-run
 * scrap — no numeric-only filler, no soft paywall.
 */

export type UpgradeId =
  // ARMOR family
  | 'reinforcedPlating'
  | 'reinforcedPlating2'
  | 'reinforcedPlating3'
  // TIRES family
  | 'stickyTires'
  | 'stickyTires2'
  // JUMP family
  | 'hydraulicJump'
  | 'hydraulicJump2'
  | 'hydraulicJump3'
  // TANK family (jump charges)
  | 'liftTank'
  | 'liftTank2'
  | 'liftTank3'
  // MAGNET family (loot reach)
  | 'scrapMagnet'
  | 'scrapMagnet2'
  // GUN family (weapon tiers)
  | 'gunMkII'
  | 'gunMkIII'
  | 'gunMkIV'
  | 'gunMkV';

/** Which garage tab a family lives under. */
export type UpgradeCategory = 'upgrade' | 'weapon';

export interface UpgradeDef {
  readonly id: UpgradeId;
  /** Display name (used in tooltips / detail). */
  readonly name: string;
  /** Blindfold-test phrasing: what this tier changes in the hands. */
  readonly blurb: string;
  /** Permanent cost in banked scrap. */
  readonly cost: number;
}

/**
 * A family of ordered upgrade tiers shown as one garage card. `tiers` is the buy
 * order (each owned tier raises the family's level by one); a single-tier family
 * is just a one-shot upgrade.
 */
export interface UpgradeFamily {
  readonly key: string;
  /** Short label on the card. */
  readonly label: string;
  /** A glyph for the card icon. */
  readonly glyph: string;
  readonly category: UpgradeCategory;
  /**
   * Ownership scope: `global` upgrades (jump charges, the gun) ride with you
   * across every chassis; `chassis` upgrades (armor, tires, jump arc, magnet) are
   * bought per car and progress separately on each.
   */
  readonly scope: 'global' | 'chassis';
  readonly tiers: readonly UpgradeId[];
}

export const UPGRADE_FAMILIES: readonly UpgradeFamily[] = [
  { key: 'armor', label: 'ARMOR', glyph: '◆', category: 'upgrade', scope: 'chassis', tiers: ['reinforcedPlating', 'reinforcedPlating2', 'reinforcedPlating3'] },
  { key: 'tires', label: 'TIRES', glyph: '◯', category: 'upgrade', scope: 'chassis', tiers: ['stickyTires', 'stickyTires2'] },
  { key: 'jump', label: 'JUMP', glyph: '↑', category: 'upgrade', scope: 'chassis', tiers: ['hydraulicJump', 'hydraulicJump2', 'hydraulicJump3'] },
  { key: 'magnet', label: 'MAGNET', glyph: '✦', category: 'upgrade', scope: 'chassis', tiers: ['scrapMagnet', 'scrapMagnet2'] },
  { key: 'tank', label: 'TANK', glyph: '⬢', category: 'upgrade', scope: 'global', tiers: ['liftTank', 'liftTank2', 'liftTank3'] },
  { key: 'gun', label: 'GUN', glyph: '✜', category: 'weapon', scope: 'global', tiers: ['gunMkII', 'gunMkIII', 'gunMkIV', 'gunMkV'] },
];

/** The ordered gun-tier upgrades — kept as a named export the sim/UI already use. */
export const GUN_UPGRADES: readonly UpgradeId[] = ['gunMkII', 'gunMkIII', 'gunMkIV', 'gunMkV'];

export const UPGRADES: readonly UpgradeDef[] = [
  // ----- ARMOR: each tier shaves more hull off every crash.
  { id: 'reinforcedPlating', name: 'Reinforced Plating I', blurb: 'Plated panels — every crash costs the hull less.', cost: 60 },
  { id: 'reinforcedPlating2', name: 'Reinforced Plating II', blurb: 'Heavier plate — crashes barely dent you.', cost: 110 },
  { id: 'reinforcedPlating3', name: 'Reinforced Plating III', blurb: 'Battle armor — shrug off the hits that ended past runs.', cost: 180 },
  // ----- TIRES: snappier lane changes.
  { id: 'stickyTires', name: 'Sticky Tires I', blurb: 'Lane changes snap instead of slide.', cost: 40 },
  { id: 'stickyTires2', name: 'Sticky Tires II', blurb: 'Knife-sharp — the car darts between lanes.', cost: 80 },
  // ----- JUMP: taller, longer arc.
  { id: 'hydraulicJump', name: 'Hydraulic Jump I', blurb: 'Higher, longer arc — rooftop and trench lines open.', cost: 45 },
  { id: 'hydraulicJump2', name: 'Hydraulic Jump II', blurb: 'Big air — clear wider gaps.', cost: 85 },
  { id: 'hydraulicJump3', name: 'Hydraulic Jump III', blurb: 'Moon hops — sail clean over whole pileups.', cost: 140 },
  // ----- TANK: more jump charges.
  { id: 'liftTank', name: 'Lift Tank I', blurb: 'Carry more jump charges, and bank more before they spill.', cost: 50 },
  { id: 'liftTank2', name: 'Lift Tank II', blurb: 'A deeper tank — more hops between refills.', cost: 90 },
  { id: 'liftTank3', name: 'Lift Tank III', blurb: 'Long-haul tank — jump almost at will.', cost: 150 },
  // ----- MAGNET: wider loot/mow reach.
  { id: 'scrapMagnet', name: 'Scrap Magnet I', blurb: 'Wider reach — scoop loot and fodder you used to skim past.', cost: 55 },
  { id: 'scrapMagnet2', name: 'Scrap Magnet II', blurb: 'Full-lane pull — nothing in your lane escapes.', cost: 100 },
  // ----- GUN: weapon tiers (the level lives in content/weapons.ts).
  { id: 'gunMkII', name: 'Gun Mk II — Pump Repeater', blurb: 'Faster, farther, two fodder per shot instead of one.', cost: 55 },
  { id: 'gunMkIII', name: 'Gun Mk III — Street Sweeper', blurb: 'Shreds the neighbouring lanes too — three down a shot.', cost: 95 },
  { id: 'gunMkIV', name: 'Gun Mk IV — Twin Autocannon', blurb: 'Long reach, rapid fire, four a shot — the road clears ahead.', cost: 150 },
  { id: 'gunMkV', name: 'Gun Mk V — Apocalypse Cannon', blurb: 'Every lane in front turns to mist — six a shot, held down.', cost: 220 },
] as const;

const BY_ID = new Map<UpgradeId, UpgradeDef>(UPGRADES.map((u) => [u.id, u]));
const FAMILY_OF = new Map<UpgradeId, UpgradeFamily>();
for (const fam of UPGRADE_FAMILIES) for (const id of fam.tiers) FAMILY_OF.set(id, fam);

/** Look up an upgrade definition by id. */
export function upgradeDef(id: UpgradeId): UpgradeDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown upgrade: ${id}`);
  return def;
}

/** The family `id` belongs to. */
export function familyOf(id: UpgradeId): UpgradeFamily {
  const fam = FAMILY_OF.get(id);
  if (!fam) throw new Error(`Upgrade ${id} is in no family`);
  return fam;
}

/** True if `id` is a global upgrade (shared across chassis), false if per-chassis. */
export function isGlobalUpgrade(id: UpgradeId): boolean {
  return familyOf(id).scope === 'global';
}

/**
 * The tier that must be owned before `id` can be bought, or `null` if `id` is the
 * first tier of its family. Every family chains in order, so a level always
 * climbs one step at a time.
 */
export function upgradePrereq(id: UpgradeId): UpgradeId | null {
  const fam = familyOf(id);
  const i = fam.tiers.indexOf(id);
  return i > 0 ? fam.tiers[i - 1] : null;
}

/** How many tiers of a family the owned set holds (its current level). */
export function familyLevel(fam: UpgradeFamily, owned: ReadonlySet<UpgradeId>): number {
  let n = 0;
  for (const id of fam.tiers) if (owned.has(id)) n += 1;
  return n;
}

/** The next buyable tier of a family, or `null` if it is maxed. */
export function familyNextTier(fam: UpgradeFamily, owned: ReadonlySet<UpgradeId>): UpgradeId | null {
  return fam.tiers.find((id) => !owned.has(id)) ?? null;
}

/**
 * The numeric modifiers the sim derives from the owned upgrade set — pure run
 * input, exactly like the seed. `createSim(seed, loadout)` with the same loadout
 * and intents reproduces the run byte-for-byte.
 */
export interface Loadout {
  /** Jump launch impulse multiplier (JUMP family). */
  jumpImpulseMul: number;
  /** Lateral-spring frequency multiplier — higher snaps lane changes (TIRES). */
  steerOmegaMul: number;
  /** Extra jump charges added to both the starting count and the cap (TANK). */
  bonusJumpCharges: number;
  /** Grab-footprint multiplier for pickups and mow reach (MAGNET). */
  grabRadiusMul: number;
  /** Hull-damage multiplier on every crash, < 1 = tougher armor (ARMOR). */
  damageMul: number;
  /** The gun tier, 1..5 (each GUN tier adds one), indexing `WEAPON_LEVELS`. */
  weaponLevel: number;
}

/** The stock car: no upgrades, every modifier neutral, the base gun. */
export const BASE_LOADOUT: Loadout = {
  jumpImpulseMul: 1,
  steerOmegaMul: 1,
  bonusJumpCharges: 0,
  grabRadiusMul: 1,
  damageMul: 1,
  weaponLevel: 1,
};

/**
 * Fold an owned upgrade set into a `Loadout`. Pure and order-independent: each
 * owned tier multiplies/adds its step, so the same owned set always yields the
 * same modifiers (and therefore the same run).
 */
export function computeLoadout(owned: Iterable<UpgradeId>): Loadout {
  const l: Loadout = { ...BASE_LOADOUT };
  for (const id of owned) {
    switch (id) {
      // ARMOR — compounding hull-damage reduction.
      case 'reinforcedPlating':
        l.damageMul *= 0.6;
        break;
      case 'reinforcedPlating2':
        l.damageMul *= 0.8;
        break;
      case 'reinforcedPlating3':
        l.damageMul *= 0.8;
        break;
      // TIRES — snappier steering.
      case 'stickyTires':
        l.steerOmegaMul *= 1.4;
        break;
      case 'stickyTires2':
        l.steerOmegaMul *= 1.2;
        break;
      // JUMP — taller arc.
      case 'hydraulicJump':
        l.jumpImpulseMul *= 1.28;
        break;
      case 'hydraulicJump2':
        l.jumpImpulseMul *= 1.12;
        break;
      case 'hydraulicJump3':
        l.jumpImpulseMul *= 1.12;
        break;
      // TANK — more jump charges.
      case 'liftTank':
        l.bonusJumpCharges += 2;
        break;
      case 'liftTank2':
        l.bonusJumpCharges += 1;
        break;
      case 'liftTank3':
        l.bonusJumpCharges += 1;
        break;
      // MAGNET — wider reach.
      case 'scrapMagnet':
        l.grabRadiusMul *= 1.6;
        break;
      case 'scrapMagnet2':
        l.grabRadiusMul *= 1.3;
        break;
      // GUN — each tier is one weapon level.
      case 'gunMkII':
      case 'gunMkIII':
      case 'gunMkIV':
      case 'gunMkV':
        l.weaponLevel += 1;
        break;
    }
  }
  return l;
}
