/**
 * Player settings: the small, persisted bundle the pause menu edits and the
 * impure layers (renderer, overlay, later audio) read. This lives in `app/`,
 * not `sim/`. Settings are presentation, never simulation, so they can never
 * touch determinism (the same seed must drive the same road regardless of
 * graphics quality or screenshake). The renderer reads these; the sim never
 * sees them.
 *
 * The roster mirrors what a player of the inspiration (The Last Driver) reaches
 * for: graphics quality and sound, plus the accessibility controls our juice
 * rules require (docs/DESIGN.md → Juice): reduced motion and a shake dial.
 */

/** Render fidelity. Maps to a device-pixel-ratio cap. */
export type Quality = 'low' | 'medium' | 'high';

/** Reduced motion: follow the OS preference, or force it on/off. */
export type MotionPref = 'auto' | 'on' | 'off';

export interface Settings {
  /** Pixel-ratio cap tier. Main fill-rate lever on phones. */
  quality: Quality;
  /** Camera shake / FOV-punch suppression (docs/DESIGN.md → Juice). */
  motion: MotionPref;
  /** Screenshake scale, 0..1, independent of the reduced-motion switch. */
  shake: number;
  /** Master volume, 0..1. Persisted now; inert until the audio layer is wired. */
  volume: number;
  /** Show the frame-time / draw-call overlay (docs/ARCHITECTURE.md → Budgets). */
  debugOverlay: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  motion: 'auto',
  shake: 1,
  volume: 0.7,
  debugOverlay: true,
};

/** Device-pixel-ratio cap for a quality tier (applied as `min(dpr, cap)`). */
export function qualityPixelCap(quality: Quality): number {
  switch (quality) {
    case 'low':
      return 1;
    case 'medium':
      return 1.5;
    case 'high':
      return 2;
  }
}

/** Resolve `motion` to a concrete boolean, consulting the OS when set to auto. */
export function reducedMotion(pref: MotionPref): boolean {
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];
const MOTIONS: readonly MotionPref[] = ['auto', 'on', 'off'];

function clamp01(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/**
 * Coerce arbitrary stored/parsed data into a valid `Settings`, filling any
 * missing or malformed field from the defaults. A save written by an older or
 * tampered build can never crash the game or smuggle in an out-of-range value.
 */
export function normalizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    quality: QUALITIES.includes(r.quality as Quality)
      ? (r.quality as Quality)
      : DEFAULT_SETTINGS.quality,
    motion: MOTIONS.includes(r.motion as MotionPref)
      ? (r.motion as MotionPref)
      : DEFAULT_SETTINGS.motion,
    shake: clamp01(r.shake, DEFAULT_SETTINGS.shake),
    volume: clamp01(r.volume, DEFAULT_SETTINGS.volume),
    debugOverlay:
      typeof r.debugOverlay === 'boolean' ? r.debugOverlay : DEFAULT_SETTINGS.debugOverlay,
  };
}
