import type { ObstacleKind, RunState } from './types';
import { EXPLOSION_DAMAGE } from './explosions';

export const DAMAGE_BY_OBSTACLE: Record<ObstacleKind, number> = {
  abandonedCar: 28,
  barricade: 22,
  lightBarricade: 12,
  barrel: 38,
  mine: 45,
  crack: 26,
  zombie: 8
};

export function applyDamage(state: RunState, obstacle: ObstacleKind): RunState {
  if (state.invulnerableS > 0) {
    return state;
  }

  const damage = DAMAGE_BY_OBSTACLE[obstacle];
  const health = Math.max(0, state.health - damage);

  return {
    ...state,
    health,
    invulnerableS: 0.6,
    score: Math.max(0, state.score - damage),
    status: health <= 0 ? 'ended' : state.status
  };
}

export function applyExplosionDamage(state: RunState): RunState {
  if (state.invulnerableS > 0) {
    return state;
  }

  const health = Math.max(0, state.health - EXPLOSION_DAMAGE);

  return {
    ...state,
    health,
    invulnerableS: 0.6,
    score: Math.max(0, state.score - EXPLOSION_DAMAGE),
    status: health <= 0 ? 'ended' : state.status
  };
}
