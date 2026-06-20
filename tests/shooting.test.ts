import { describe, expect, it } from 'vitest';
import { createSim, type Intent, type SimState } from '../src/sim';
import { resolveShots } from '../src/sim/collision';
import { BASE_LOADOUT, computeLoadout, upgradePrereq, type Loadout } from '../src/content/upgrades';
import { laneCenterX } from '../src/content/tuning';
import { weaponStats } from '../src/content/weapons';

/**
 * The gun (docs/DESIGN.md → Pillar 2). Holding fire drops fodder down the car's
 * lane(s) at range, burning ammo on a cadence; run dry and the player goes back
 * to mowing. The weapon **level** (from garage gun tiers) raises range, cadence,
 * kills-per-shot, and lane spread. These are the headless contracts; the feel is
 * judged in the browser.
 */

const FIRE: Intent = { steer: 0, jump: false, fire: true };
const HOLD: Intent = { steer: 0, jump: false, fire: false };
/** The car's starting lane (centre). */
const CAR_LANE = createSim(1).car.lane;

function gunner(loadout: Loadout = BASE_LOADOUT): SimState {
  const s = createSim(1, loadout);
  s.distance = 100; // the car already sits centred at its start lane
  return s;
}

function putZombie(s: SimState, lane: number, forward: number): void {
  s.zombies.push({ lane, x: laneCenterX(lane), forward, phase: 0, mowed: false });
}

describe('the gun (level 1)', () => {
  it('a held trigger drops the nearest zombie ahead, spends ammo, pays scrap', () => {
    const s = gunner();
    putZombie(s, CAR_LANE, s.distance + 20);
    const ammo0 = s.car.ammo;
    resolveShots(s, FIRE);

    expect(s.zombies[0].mowed).toBe(true);
    expect(s.car.ammo).toBe(ammo0 - 1);
    expect(s.scrap).toBeGreaterThan(0);
    expect(s.zombiesMowed).toBe(1);
    expect(s.events.some((e) => e.type === 'shotFired' && e.level === 1)).toBe(true);
    expect(s.events.some((e) => e.type === 'zombieMowed')).toBe(true);
  });

  it('hits the closest of several zombies in lane (one kill at level 1)', () => {
    const s = gunner();
    putZombie(s, CAR_LANE, s.distance + 40);
    putZombie(s, CAR_LANE, s.distance + 12); // nearest
    putZombie(s, CAR_LANE, s.distance + 25);
    resolveShots(s, FIRE);
    expect(s.zombies[1].mowed).toBe(true);
    expect(s.zombies[0].mowed).toBe(false);
    expect(s.zombies[2].mowed).toBe(false);
  });

  it('fires on a cadence, not every tick', () => {
    const s = gunner();
    for (let i = 0; i < 4; i += 1) putZombie(s, CAR_LANE, s.distance + 10 + i * 6);
    resolveShots(s, FIRE);
    const ammoAfterFirst = s.car.ammo;
    resolveShots(s, FIRE); // cooldown still ticking — no second shot
    expect(s.car.ammo).toBe(ammoAfterFirst);
  });

  it('an empty mag fires nothing — go mow instead', () => {
    const s = gunner();
    s.car.ammo = 0;
    putZombie(s, CAR_LANE, s.distance + 20);
    resolveShots(s, FIRE);
    expect(s.zombies[0].mowed).toBe(false);
    expect(s.events.some((e) => e.type === 'shotFired')).toBe(false);
  });

  it('cannot shoot mid-jump', () => {
    const s = gunner();
    s.car.airborne = true;
    putZombie(s, CAR_LANE, s.distance + 20);
    resolveShots(s, FIRE);
    expect(s.zombies[0].mowed).toBe(false);
    expect(s.car.ammo).toBe(weaponStats(1).startAmmo);
  });

  it('ignores fodder out of range or in another lane (but still burns the round)', () => {
    const s = gunner();
    putZombie(s, CAR_LANE, s.distance + weaponStats(1).range + 20); // beyond reach
    putZombie(s, 0, s.distance + 10); // another lane (level 1 is one lane wide)
    resolveShots(s, FIRE);
    expect(s.zombies.every((z) => !z.mowed)).toBe(true);
    expect(s.car.ammo).toBeLessThan(weaponStats(1).startAmmo);
  });

  it('a released trigger holds fire', () => {
    const s = gunner();
    putZombie(s, CAR_LANE, s.distance + 20);
    resolveShots(s, HOLD);
    expect(s.zombies[0].mowed).toBe(false);
    expect(s.car.ammo).toBe(weaponStats(1).startAmmo);
  });
});

describe('weapon tiers', () => {
  it('each owned gun tier raises the weapon level by one', () => {
    expect(computeLoadout([]).weaponLevel).toBe(1);
    expect(computeLoadout(['gunMkII']).weaponLevel).toBe(2);
    expect(computeLoadout(['gunMkII', 'gunMkIII', 'gunMkIV', 'gunMkV']).weaponLevel).toBe(5);
  });

  it('the gun tiers chain — each requires the one below; feel upgrades stand alone', () => {
    expect(upgradePrereq('gunMkII')).toBeNull();
    expect(upgradePrereq('gunMkIII')).toBe('gunMkII');
    expect(upgradePrereq('gunMkIV')).toBe('gunMkIII');
    expect(upgradePrereq('gunMkV')).toBe('gunMkIV');
    expect(upgradePrereq('hydraulicJump')).toBeNull();
  });

  it('a higher tier destroys more fodder per shot', () => {
    // Level 3 drops killsPerShot zombies in one trigger pull.
    const s = gunner(computeLoadout(['gunMkII', 'gunMkIII']));
    for (let i = 0; i < 5; i += 1) putZombie(s, CAR_LANE, s.distance + 10 + i * 6);
    resolveShots(s, FIRE);
    expect(s.zombies.filter((z) => z.mowed)).toHaveLength(weaponStats(3).killsPerShot);
  });

  it('a wider tier shreds the neighbouring lane; the base gun cannot', () => {
    const wide = gunner(computeLoadout(['gunMkII', 'gunMkIII'])); // spread 3
    putZombie(wide, CAR_LANE + 1, wide.distance + 12);
    resolveShots(wide, FIRE);
    expect(wide.zombies[0].mowed).toBe(true);

    const narrow = gunner(); // level 1, one lane
    putZombie(narrow, CAR_LANE + 1, narrow.distance + 12);
    resolveShots(narrow, FIRE);
    expect(narrow.zombies[0].mowed).toBe(false);
  });

  it('a higher tier reaches fodder the base gun cannot', () => {
    const far = weaponStats(1).range + 15; // beyond level 1, inside level 5
    const top = gunner(computeLoadout(['gunMkII', 'gunMkIII', 'gunMkIV', 'gunMkV']));
    putZombie(top, CAR_LANE, top.distance + far);
    resolveShots(top, FIRE);
    expect(top.zombies[0].mowed).toBe(true);
  });

  it('a fresh run starts with the tier’s bigger mag', () => {
    expect(createSim(1).car.ammo).toBe(weaponStats(1).startAmmo);
    expect(createSim(1, computeLoadout(['gunMkII'])).car.ammo).toBe(weaponStats(2).startAmmo);
    expect(createSim(1, computeLoadout(['gunMkII'])).car.ammo).toBeGreaterThan(
      createSim(1).car.ammo,
    );
  });
});
