import { describe, expect, it } from 'vitest';
import { SaveStore, loadSave, type KeyValueStore } from '../src/app/save';
import { DEFAULT_SETTINGS } from '../src/app/settings';
import { chassisDef } from '../src/content/chassis';

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
    const buggyPrice = chassisDef('buggy').price;
    a.bankScrap(200 + buggyPrice);
    a.buyCar('buggy', buggyPrice);
    a.setChassis('buggy');
    a.buyGlobal('liftTank', 50); // global (jump charges) — shared across cars
    a.buyChassis('buggy', 'reinforcedPlating', 60); // per-chassis armor on the buggy
    a.flush();

    const b = new SaveStore(store);
    expect(b.wallet).toBe(90); // 200 − 50 − 60
    expect(b.chassis).toBe('buggy');
    expect(b.ownsChassis('buggy')).toBe(true);
    expect(b.globalUpgrades()).toEqual(['liftTank']);
    expect(b.chassisUpgrades('buggy')).toEqual(['reinforcedPlating']);
    // A different chassis has its own (empty) per-car progress.
    expect(b.chassisUpgrades('survivor')).toEqual([]);
  });

  it('defaults to an empty wallet, the Survivor, and no upgrades', () => {
    const fresh = loadSave(memoryStore());
    expect(fresh.wallet).toBe(0);
    expect(fresh.chassis).toBe('survivor');
    expect(fresh.ownedChassis).toEqual(['survivor']); // the rest are bought
    expect(fresh.paint).toBe('factory');
    expect(fresh.globalUpgrades).toEqual([]);
    expect(fresh.chassisUpgrades).toEqual({});
  });

  it('locks chassis bodies until bought and refuses to select an unowned one', () => {
    const store = memoryStore();
    const s = new SaveStore(store);
    expect(s.ownsChassis('survivor')).toBe(true);
    expect(s.ownsChassis('coupe')).toBe(false);

    s.setChassis('coupe'); // not bought yet — the selection must not move
    expect(s.chassis).toBe('survivor');

    const price = chassisDef('coupe').price;
    s.bankScrap(price + 40);
    s.buyCar('coupe', price);
    s.setChassis('coupe');
    s.flush();

    const b = new SaveStore(store);
    expect(b.wallet).toBe(40); // the body cost its full price
    expect(b.ownsChassis('coupe')).toBe(true);
    expect(b.chassis).toBe('coupe');
  });

  it('buying an already-owned chassis is a no-op and never double-charges', () => {
    const s = new SaveStore(memoryStore());
    s.bankScrap(1000);
    s.buyCar('rig', 400);
    s.buyCar('rig', 400); // second buy must not spend again
    expect(s.wallet).toBe(600);
    expect(s.ownedChassis().filter((id) => id === 'rig')).toHaveLength(1);
  });

  it('rejects a tampered chassis id or price at the save boundary', () => {
    const s = new SaveStore(memoryStore());
    s.bankScrap(1000);
    s.buyCar('rig', 0);
    s.buyCar('unknown' as never, 0);
    expect(s.ownsChassis('rig')).toBe(false);
    expect(s.wallet).toBe(1000);
  });

  it('refuses to unlock a chassis without enough scrap', () => {
    const s = new SaveStore(memoryStore());
    s.bankScrap(399);
    s.buyCar('rig', 400);
    expect(s.wallet).toBe(399);
    expect(s.ownsChassis('rig')).toBe(false);
  });

  it('refuses to install a per-chassis upgrade on a locked car', () => {
    const s = new SaveStore(memoryStore());
    s.bankScrap(100);
    s.buyChassis('coupe', 'stickyTires', 40);
    expect(s.wallet).toBe(100);
    expect(s.chassisUpgrades('coupe')).toEqual([]);
  });

  it('migrates a pre-purchase save: keeps the driven car and any upgraded car', () => {
    const store = memoryStore();
    // Before ownedChassis existed, every car was selectable; grandfather in the
    // one being driven and any car with scrap already invested in its upgrades.
    store.map.set(
      'sdw.save.v1',
      JSON.stringify({
        wallet: 100,
        chassis: 'buggy',
        chassisUpgrades: { rig: ['reinforcedPlating'] },
      }),
    );
    const data = loadSave(store);
    expect([...data.ownedChassis].sort()).toEqual(['buggy', 'rig', 'survivor']);
    expect(data.chassis).toBe('buggy');
  });

  it('falls back to the Survivor when the stored selection is not owned', () => {
    const store = memoryStore();
    store.map.set('sdw.save.v1', JSON.stringify({ chassis: 'coupe', ownedChassis: ['survivor'] }));
    expect(loadSave(store).chassis).toBe('survivor');
  });

  it('round-trips the paint job and falls back to factory for an unknown id', () => {
    const store = memoryStore();
    const a = new SaveStore(store);
    a.setPaint('toxic');
    a.flush();
    expect(new SaveStore(store).paint).toBe('toxic');

    store.map.set('sdw.save.v1', JSON.stringify({ paint: 'chartreuse-sparkle' }));
    expect(loadSave(store).paint).toBe('factory');
  });

  it('routes a per-chassis buy to its car and a global buy to every car', () => {
    const store = memoryStore();
    const s = new SaveStore(store);
    const coupePrice = chassisDef('coupe').price;
    s.bankScrap(coupePrice + 500);
    s.buyCar('coupe', coupePrice);
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
      JSON.stringify({
        wallet: 30,
        upgrades: ['liftTank', 'gunMkII', 'reinforcedPlating', 'stickyTires'],
      }),
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
    s.bankScrap(50);
    s.buyGlobal('liftTank', 50);
    s.globalUpgrades().push('gunMkII'); // mutate the returned copy
    expect(s.globalUpgrades()).toEqual(['liftTank']); // the save is untouched
  });

  it('ignores invalid scrap deposits instead of corrupting the wallet', () => {
    const s = new SaveStore(memoryStore());
    s.bankScrap(25);
    s.bankScrap(Number.NaN);
    s.bankScrap(Number.POSITIVE_INFINITY);
    s.bankScrap(0);
    s.bankScrap(-10);
    expect(s.wallet).toBe(25);
  });

  it('rejects invalid, duplicate, wrong-scope, unaffordable, and out-of-order buys', () => {
    const s = new SaveStore(memoryStore());
    s.bankScrap(200);

    s.buyGlobal('stickyTires', 0);
    s.buyGlobal('unknown' as never, 0);
    s.buyGlobal('liftTank2', 0);
    s.buyGlobal('liftTank', Number.NaN);
    s.buyGlobal('liftTank', 201);
    expect(s.globalUpgrades()).toEqual([]);
    expect(s.wallet).toBe(200);

    s.buyGlobal('liftTank', 0);
    expect(s.globalUpgrades()).toEqual([]);
    s.buyGlobal('liftTank', 50);
    s.buyGlobal('liftTank', 50);
    expect(s.globalUpgrades()).toEqual(['liftTank']);
    expect(s.wallet).toBe(150);

    s.buyChassis('survivor', 'liftTank2', 0);
    s.buyChassis('survivor', 'unknown' as never, 0);
    s.buyChassis('survivor', 'reinforcedPlating2', 0);
    s.buyChassis('survivor', 'reinforcedPlating', -1);
    expect(s.chassisUpgrades('survivor')).toEqual([]);

    s.buyChassis('survivor', 'reinforcedPlating', 0);
    expect(s.chassisUpgrades('survivor')).toEqual([]);
    s.buyChassis('survivor', 'reinforcedPlating', 60);
    s.buyChassis('survivor', 'reinforcedPlating', 60);
    expect(s.chassisUpgrades('survivor')).toEqual(['reinforcedPlating']);
    expect(s.wallet).toBe(90);
  });

  it('ignores an invalid paint id at the mutation boundary', () => {
    const s = new SaveStore(memoryStore());
    s.setPaint('toxic');
    s.setPaint('ultraviolet' as never);
    expect(s.paint).toBe('toxic');
  });
});
