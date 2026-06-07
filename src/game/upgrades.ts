import {
  DEFAULT_UPGRADES,
  STARTING_AMMO,
  STARTING_JUMP_CHARGES,
  UPGRADE_BASE_COST,
  UPGRADE_MAX_LEVEL
} from './config';
import type { ProgressionState, RunState, Upgrades } from './types';

export function createDefaultProgression(): ProgressionState {
  return {
    totalScrap: 0,
    bestDistanceM: 0,
    upgrades: { ...DEFAULT_UPGRADES }
  };
}

export function getUpgradeCost(upgrades: Upgrades, key: keyof Upgrades): number {
  const level = upgrades[key];
  return Math.round(UPGRADE_BASE_COST[key] * Math.pow(1.55, level));
}

export function canPurchaseUpgrade(progression: ProgressionState, key: keyof Upgrades): boolean {
  return (
    progression.upgrades[key] < UPGRADE_MAX_LEVEL &&
    progression.totalScrap >= getUpgradeCost(progression.upgrades, key)
  );
}

export function purchaseUpgrade(
  progression: ProgressionState,
  key: keyof Upgrades
): ProgressionState {
  if (!canPurchaseUpgrade(progression, key)) {
    return progression;
  }

  const cost = getUpgradeCost(progression.upgrades, key);

  return {
    ...progression,
    totalScrap: progression.totalScrap - cost,
    upgrades: {
      ...progression.upgrades,
      [key]: progression.upgrades[key] + 1
    }
  };
}

export function createRunState(progression: ProgressionState): RunState {
  const { upgrades } = progression;
  const maxJumpCharges = STARTING_JUMP_CHARGES + Math.floor(upgrades.tires / 2);

  return {
    status: 'ready',
    distanceM: 0,
    speedMps: 0,
    health: 100 + upgrades.armor * 18 + upgrades.chassis * 12,
    maxHealth: 100 + upgrades.armor * 18 + upgrades.chassis * 12,
    ammo: STARTING_AMMO + upgrades.weapon * 2,
    scrap: 0,
    score: 0,
    zoneId: 'broken-highway',
    weaponCooldownS: 0,
    jumpTimeS: 0,
    jumpCharges: maxJumpCharges,
    maxJumpCharges,
    invulnerableS: 0
  };
}

export function finishRun(
  progression: ProgressionState,
  run: RunState
): ProgressionState {
  return {
    ...progression,
    totalScrap: progression.totalScrap + run.scrap,
    bestDistanceM: Math.max(progression.bestDistanceM, Math.floor(run.distanceM))
  };
}
