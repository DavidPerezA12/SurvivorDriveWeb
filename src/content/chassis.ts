/**
 * Chassis — the car you drive, as data (docs/DESIGN.md → chassis classes). Five
 * starting bodies with distinct silhouettes and base feel. Picking one is the
 * garage's CAR tab; the render layer builds the matching model and the bolt-on
 * upgrades hang off whichever chassis is selected.
 *
 * Upgrades split two ways (the player's mental model): global upgrades, jump
 * charges (TANK) and the GUN, ride with you across every chassis, while
 * per-chassis upgrades, ARMOR, TIRES, MAGNET, are bought for the specific
 * car. A chassis also carries small base modifiers so the five genuinely handle
 * differently before a single upgrade.
 */

import { computeLoadout, type Loadout, type UpgradeId } from './upgrades';

export type ChassisId = 'survivor' | 'rig' | 'hauler' | 'buggy' | 'coupe';

export interface ChassisDef {
  readonly id: ChassisId;
  /** Display name (garage CAR tab). */
  readonly name: string;
  /** One-line character note. */
  readonly blurb: string;
  /**
   * Base loadout modifiers the chassis brings before any upgrade: what makes a
   * buggy hop better and a rig tank hits. Multiplicative dials default to 1, the
   * damage dial < 1 = tougher. Folded into the run loadout alongside upgrades.
   */
  readonly base: {
    steerOmegaMul: number;
    jumpImpulseMul: number;
    damageMul: number;
  };
}

export const CHASSIS: readonly ChassisDef[] = [
  {
    id: 'survivor',
    name: 'Survivor',
    blurb: 'The all-rounder muscle car — the one that made it this far.',
    base: { steerOmegaMul: 1, jumpImpulseMul: 1, damageMul: 1 },
  },
  {
    id: 'rig',
    name: 'Wrecker Rig',
    blurb: 'A brute pickup — soaks crashes, but heavy and slow to turn.',
    base: { steerOmegaMul: 0.85, jumpImpulseMul: 0.9, damageMul: 0.78 },
  },
  {
    id: 'hauler',
    name: 'Box Hauler',
    blurb: 'A boxy van — armored slab on wheels, no fun in the air.',
    base: { steerOmegaMul: 0.8, jumpImpulseMul: 0.82, damageMul: 0.7 },
  },
  {
    id: 'buggy',
    name: 'Dune Buggy',
    blurb: 'A skeletal hopper — darts and flies, but folds on a hard hit.',
    base: { steerOmegaMul: 1.3, jumpImpulseMul: 1.25, damageMul: 1.3 },
  },
  {
    id: 'coupe',
    name: 'Razor Coupe',
    blurb: 'A low sports body — knife-sharp handling, thin skin.',
    base: { steerOmegaMul: 1.25, jumpImpulseMul: 1.05, damageMul: 1.15 },
  },
];

/** Look up a chassis definition by id, falling back to the Survivor. */
export function chassisDef(id: ChassisId): ChassisDef {
  return CHASSIS.find((c) => c.id === id) ?? CHASSIS[0];
}

/**
 * The run loadout for driving `id` with `owned` upgrades: the chassis's base
 * feel folded onto the upgrade modifiers. Pure run input (chassis + owned set +
 * seed fully determine the run), so determinism holds.
 */
export function runLoadout(id: ChassisId, owned: Iterable<UpgradeId>): Loadout {
  const l = computeLoadout(owned);
  const base = chassisDef(id).base;
  l.steerOmegaMul *= base.steerOmegaMul;
  l.jumpImpulseMul *= base.jumpImpulseMul;
  l.damageMul *= base.damageMul;
  return l;
}
