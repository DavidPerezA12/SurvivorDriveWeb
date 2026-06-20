/**
 * The pure simulation core. Renderer-agnostic, deterministic, dependency-free.
 * This barrel is the only surface the impure layers import from.
 */
export type {
  SimState,
  ReadonlyState,
  CarState,
  Chunk,
  ChunkVariant,
  Prop,
  PropKind,
  Spawn,
  SpawnKind,
  PickupKind,
  Hazard,
  Zombie,
  Pickup,
  Intent,
  FrameEvent,
} from './types';
export { NO_INTENT } from './types';
export { createSim, step, FIXED_DT } from './sim';
export { chunkAt, safeLane } from './world';
export { isCritical } from './health';
