import type { Upgrades } from './types';

export const LANE_X = [-4, 0, 4] as const;
export const ROAD_HALF_WIDTH = 6;
export const CAR_RADIUS = 0.9;

export const DEFAULT_UPGRADES: Upgrades = {
  armor: 0,
  chassis: 0,
  tires: 0,
  weapon: 0
};

export const UPGRADE_MAX_LEVEL = 5;

export const UPGRADE_BASE_COST: Record<keyof Upgrades, number> = {
  armor: 45,
  chassis: 40,
  tires: 35,
  weapon: 50
};

export const STARTING_AMMO = 10;
export const STARTING_JUMP_CHARGES = 2;

export const DIFFICULTY = {
  baseSpeedMps: 21,
  maxSpeedMps: 42,
  speedGainPerMeter: 0.006,
  chunkLength: 28,
  startingClearM: 44,
  visibleAheadM: 150,
  cleanupBehindM: -26
} as const;
