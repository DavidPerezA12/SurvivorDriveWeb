import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  qualityPixelCap,
  type Settings,
} from '../src/app/settings';
import { SaveStore, loadSave, type KeyValueStore } from '../src/app/save';

/**
 * Settings are presentation, never simulation, so they sit in `app/` and carry
 * no determinism weight. What must hold: a stored blob — old, partial, or
 * tampered — can never crash the game or yield an out-of-range value, and a
 * round-trip through storage preserves valid settings.
 */
describe('settings normalization', () => {
  it('fills missing fields from defaults', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects unknown enum values', () => {
    const s = normalizeSettings({ quality: 'ultra', motion: 'always' });
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.motion).toBe(DEFAULT_SETTINGS.motion);
  });

  it('clamps numeric ranges and bad types', () => {
    expect(normalizeSettings({ shake: 5 }).shake).toBe(1);
    expect(normalizeSettings({ shake: -2 }).shake).toBe(0);
    expect(normalizeSettings({ volume: 'loud' }).volume).toBe(DEFAULT_SETTINGS.volume);
    expect(normalizeSettings({ shake: 0.4 }).shake).toBe(0.4);
  });

  it('coerces non-boolean overlay flags', () => {
    expect(normalizeSettings({ debugOverlay: 'yes' }).debugOverlay).toBe(
      DEFAULT_SETTINGS.debugOverlay,
    );
    expect(normalizeSettings({ debugOverlay: false }).debugOverlay).toBe(false);
  });

  it('maps quality tiers to ascending pixel caps', () => {
    expect(qualityPixelCap('low')).toBeLessThan(qualityPixelCap('medium'));
    expect(qualityPixelCap('medium')).toBeLessThan(qualityPixelCap('high'));
  });
});

/** A throwaway in-memory store standing in for localStorage in node tests. */
function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('save persistence', () => {
  it('returns fresh defaults with no store or empty storage', () => {
    expect(loadSave(null).settings).toEqual(DEFAULT_SETTINGS);
    expect(loadSave(memoryStore()).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips settings through storage', () => {
    const store = memoryStore();
    const a = new SaveStore(store);
    const changed: Settings = { ...DEFAULT_SETTINGS, quality: 'low', shake: 0.25 };
    a.setSettings(changed);
    a.flush();

    const b = new SaveStore(store);
    expect(b.settings).toEqual(changed);
  });

  it('recovers from a corrupt blob instead of throwing', () => {
    const store = memoryStore();
    store.map.set('sdw.save.v1', '{not json');
    expect(loadSave(store).settings).toEqual(DEFAULT_SETTINGS);
  });
});
