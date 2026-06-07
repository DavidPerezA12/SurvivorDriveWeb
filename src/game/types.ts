export type RunStatus = 'ready' | 'running' | 'paused' | 'ended';

export type ResourceKind = 'ammo' | 'scrap' | 'parts';

export type ObstacleKind =
  | 'abandonedCar'
  | 'barricade'
  | 'lightBarricade'
  | 'barrel'
  | 'mine'
  | 'crack'
  | 'zombie';

export type EffectKind = 'explosion';

export type EntityKind = 'obstacle' | 'pickup' | 'projectile' | 'effect';

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type Entity = {
  id: string;
  kind: EntityKind;
  type: ObstacleKind | ResourceKind | 'bullet' | EffectKind;
  position: Vec3;
  radius: number;
  width?: number;
  depth?: number;
  lifetimeS?: number;
  collected?: boolean;
  destroyed?: boolean;
};

export type Upgrades = {
  armor: number;
  chassis: number;
  tires: number;
  weapon: number;
};

export type RunState = {
  status: RunStatus;
  distanceM: number;
  speedMps: number;
  health: number;
  maxHealth: number;
  ammo: number;
  scrap: number;
  score: number;
  zoneId: string;
  weaponCooldownS: number;
  jumpTimeS: number;
  jumpCharges: number;
  maxJumpCharges: number;
  invulnerableS: number;
};

export type ProgressionState = {
  totalScrap: number;
  bestDistanceM: number;
  upgrades: Upgrades;
};

export type InputState = {
  steer: number;
  jump: boolean;
  shoot: boolean;
};

export type CarState = {
  x: number;
  y: number;
  lateralVelocity: number;
  isJumping: boolean;
};
