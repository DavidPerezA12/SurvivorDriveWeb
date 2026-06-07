import { createDefaultProgression } from '../game/upgrades';
import type { ProgressionState } from '../game/types';

const SAVE_KEY = 'survivor-drive-web:progression:v1';

export function loadProgression(): ProgressionState {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);

    if (!raw) {
      return createDefaultProgression();
    }

    return normalizeProgression(JSON.parse(raw));
  } catch {
    return createDefaultProgression();
  }
}

export function saveProgression(progression: ProgressionState): void {
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(progression));
}

function normalizeProgression(saved: Partial<ProgressionState> & { upgrades?: Record<string, number> }): ProgressionState {
  const defaults = createDefaultProgression();
  const legacyFuelTank = saved.upgrades?.fuelTank ?? 0;

  return {
    ...defaults,
    ...saved,
    upgrades: {
      ...defaults.upgrades,
      ...saved.upgrades,
      chassis: saved.upgrades?.chassis ?? legacyFuelTank
    }
  };
}
