import { describe, expect, it } from 'vitest';
import { type ChassisId } from '../src/content/chassis';
import { UPGRADE_FAMILIES } from '../src/content/upgrades';
import { familyLockedForPreview, garageStatReadouts } from '../src/ui/garage';

describe('garage CAR INFO readouts', () => {
  it('shows the real stock strengths and weaknesses of each chassis', () => {
    const survivor = garageStatReadouts('survivor', []);
    const rig = garageStatReadouts('rig', []);
    const buggy = garageStatReadouts('buggy', []);

    expect(rig.armor.fraction).toBeGreaterThan(survivor.armor.fraction);
    expect(rig.handling.fraction).toBeLessThan(survivor.handling.fraction);
    expect(rig.jump.fraction).toBeLessThan(survivor.jump.fraction);

    expect(buggy.armor.fraction).toBeLessThan(survivor.armor.fraction);
    expect(buggy.handling.fraction).toBeGreaterThan(survivor.handling.fraction);
    expect(buggy.jump.fraction).toBeGreaterThan(survivor.jump.fraction);
  });

  it('derives upgraded bars from the same loadout and weapon data as the run', () => {
    const stock = garageStatReadouts('survivor', []);
    const upgraded = garageStatReadouts('survivor', [
      'reinforcedPlating',
      'stickyTires',
      'hydraulicJump',
      'scrapMagnet',
      'gunMkII',
    ]);

    expect(upgraded.armor.fraction).toBeGreaterThan(stock.armor.fraction);
    expect(upgraded.handling.fraction).toBeGreaterThan(stock.handling.fraction);
    expect(upgraded.jump.fraction).toBeGreaterThan(stock.jump.fraction);
    expect(upgraded.reach.fraction).toBeGreaterThan(stock.reach.fraction);
    expect(upgraded.gun.fraction).toBeGreaterThan(stock.gun.fraction);
    expect(upgraded.gun.text).toContain('Pump Repeater');
  });

  it('normalizes each bar against the strongest build for that capability', () => {
    const everyUpgrade = UPGRADE_FAMILIES.flatMap((family) => family.tiers);

    expect(garageStatReadouts('hauler', everyUpgrade).armor.fraction).toBeCloseTo(1);
    expect(garageStatReadouts('buggy', everyUpgrade).handling.fraction).toBeCloseTo(1);
    expect(garageStatReadouts('buggy', everyUpgrade).jump.fraction).toBeCloseTo(1);
    expect(garageStatReadouts('survivor', everyUpgrade).gun.fraction).toBeCloseTo(1);
    expect(garageStatReadouts('survivor', everyUpgrade).reach.fraction).toBeCloseTo(1);
  });
});

describe('locked chassis upgrade state', () => {
  const family = (key: string) => {
    const result = UPGRADE_FAMILIES.find((candidate) => candidate.key === key);
    if (!result) throw new Error(`Missing upgrade family: ${key}`);
    return result;
  };

  it('blocks only per-chassis upgrades while previewing an unowned car', () => {
    const ownedCars = new Set<ChassisId>(['survivor']);

    expect(familyLockedForPreview(family('armor'), 'rig', ownedCars)).toBe(true);
    expect(familyLockedForPreview(family('tires'), 'rig', ownedCars)).toBe(true);
    expect(familyLockedForPreview(family('jump'), 'rig', ownedCars)).toBe(true);
    expect(familyLockedForPreview(family('magnet'), 'rig', ownedCars)).toBe(true);
    expect(familyLockedForPreview(family('tank'), 'rig', ownedCars)).toBe(false);
    expect(familyLockedForPreview(family('gun'), 'rig', ownedCars)).toBe(false);
  });

  it('allows per-chassis upgrades after the previewed car is owned', () => {
    const ownedCars = new Set<ChassisId>(['survivor', 'rig']);
    expect(familyLockedForPreview(family('armor'), 'rig', ownedCars)).toBe(false);
  });
});
