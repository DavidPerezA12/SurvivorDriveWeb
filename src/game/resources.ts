import type { ResourceKind, RunState } from './types';

export function applyPickup(state: RunState, resource: ResourceKind): RunState {
  switch (resource) {
    case 'ammo':
      return { ...state, ammo: state.ammo + 5, score: state.score + 15 };
    case 'scrap':
      return { ...state, scrap: state.scrap + 8, score: state.score + 30 };
    case 'parts':
      return {
        ...state,
        health: Math.min(state.maxHealth, state.health + 22),
        jumpCharges: Math.min(state.maxJumpCharges, state.jumpCharges + 1),
        score: state.score + 20
      };
  }
}
