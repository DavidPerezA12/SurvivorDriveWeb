import { describe, expect, it } from 'vitest';
import { SaveStore, loadSave, type KeyValueStore } from '../src/app/save';
import { DEFAULT_SETTINGS } from '../src/app/settings';

/**
 * Garage meta-progression persistence (docs/DESIGN.md → chassis classes). The
 * wallet, the selected chassis, the **global** upgrades (jump charges, gun), and
 * the **per-chassis** upgrades (armor, tires, …) survive across runs, and an old
 * flat-`upgrades` save migrates forward by routing each id to the right bucket.
 */
function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('garage persistence', () => {
  it('round-trips wallet, chassis, and split upgrades through storage', () => {
    const store = memoryStore();
    const a = new SaveStore(store);
    a.bankScrap(200);
    a.setChassis('buggy');
    a.buyGlobal('liftTank', 50); // global (jump charges) — shared across cars
    a.buyChassis('buggy', 'reinforcedPlating', 60); // per-chassis armor on the buggy
    a.flush();

    const b = new SaveStore(store);
    expect(b.wallet).toBe(90); // 200 − 50 − 60
    expect(b.chassis).toBe('buggy');
    expect(b.globalUpgrades()).toEqual(['liftTank']);
    expect(b.chassisUpgrades('buggy')).toEqual(['reinforcedPlating']);
    // A different chassis has its own (empty) per-car progress.
    expect(b.chassisUpgrades('survivor')).toEqual([]);
  });

  it('defaults to an empty wallet, the Survivor, and no upgrades', () => {
    const fresh = loadSave(memoryStore());
    expect(fresh.wallet).toBe(0);
    expect(fresh.chassis).toBe('survivor');
    expect(fresh.globalUpgrades).toEqual([]);
    expect(fresh.chassisUpgrades).toEqual({});
  });

  it('routes a per-chassis buy to its car and a global buy to every car', () => {
    const store = memoryStore();
    const s = new SaveStore(store);
    s.bankScrap(500);
    s.buyChassis('coupe', 'stickyTires', 40); // per-chassis: coupe only
    s.buyGlobal('gunMkII', 55); // global: any car
    expect(s.chassisUpgrades('coupe')).toEqual(['stickyTires']);
    expect(s.chassisUpgrades('rig')).toEqual([]); // not the rig's
    expect(s.globalUpgrades()).toEqual(['gunMkII']);
  });

  it('clamps a negative wallet and drops unknown ids on load', () => {
    const store = memoryStore();
    store.map.set(
      'sdw.save.v1',
      JSON.stringify({
        wallet: -50,
        chassis: 'spaceship',
        globalUpgrades: ['liftTank', 'rocketLauncher'],
        chassisUpgrades: { buggy: ['reinforcedPlating', 42] },
      }),
    );
    const data = loadSave(store);
    expect(data.wallet).toBe(0);
    expect(data.chassis).toBe('survivor'); // unknown chassis falls back
    expect(data.globalUpgrades).toEqual(['liftTank']);
    expect(data.chassisUpgrades.buggy).toEqual(['reinforcedPlating']);
  });

  it('migrates an old flat upgrade list into the split buckets', () => {
    const store = memoryStore();
    // The pre-chassis build stored everything in one `upgrades` array.
    store.map.set(
      'sdw.save.v1',
      JSON.stringify({ wallet: 30, upgrades: ['liftTank', 'gunMkII', 'reinforcedPlating', 'stickyTires'] }),
    );
    const data = loadSave(store);
    // Global ids (tank, gun) → global; per-chassis ids → the Survivor's bucket.
    expect(data.globalUpgrades.sort()).toEqual(['gunMkII', 'liftTank']);
    expect(data.chassisUpgrades.survivor?.sort()).toEqual(['reinforcedPlating', 'stickyTires']);
  });

  it('loads a settings-only save forward without losing the settings', () => {
    const store = memoryStore();
    store.map.set('sdw.save.v1', JSON.stringify({ settings: DEFAULT_SETTINGS }));
    const data = loadSave(store);
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
    expect(data.wallet).toBe(0);
    expect(data.globalUpgrades).toEqual([]);
  });

  it('does not let a stored upgrade list be mutated through the getter', () => {
    const store = memoryStore();
    const s = new SaveStore(store);
    s.buyGlobal('liftTank', 0);
    s.globalUpgrades().push('gunMkII'); // mutate the returned copy
    expect(s.globalUpgrades()).toEqual(['liftTank']); // the save is untouched
  });
});
