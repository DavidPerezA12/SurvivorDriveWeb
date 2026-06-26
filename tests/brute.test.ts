import { describe, expect, it } from 'vitest';
import { createSim, type Intent, type SimState } from '../src/sim';
import { resolveMows, resolveShots } from '../src/sim/collision';
import { BASE_LOADOUT } from '../src/content/upgrades';
import { BRUTE_TUNING, CRASH_TUNING, laneCenterX } from '../src/content/tuning';

/**
 * The brute zombie (docs/DESIGN.md → roster). The one fodder that bites back: a
 * heavy zombie that is a damaging obstacle, not free scrap. Ramming it is a crash
 * (hull + frenazo, and it breaks the streak); the gun needs several hits to drop
 * it. The smart play is to shoot it from range or dodge it. Headless contracts.
 */

const FIRE: Intent = { steer: 0, jump: false, fire: true };

function putBrute(s: SimState, lane: number, forward: number): void {
  s.zombies.push({
    lane,
    x: laneCenterX(lane),
    forward,
    phase: 0,
    mowed: false,
    brute: true,
    hp: BRUTE_TUNING.hp,
  });
}

describe('ramming a brute', () => {
  it('costs hull and momentum, unlike mowing fodder', () => {
    const s = createSim(1);
    s.car.lateralX = laneCenterX(2);
    s.car.speed = 50;
    s.distance = 10;
    putBrute(s, 2, 8);
    resolveMows(s, 50);

    expect(s.zombies[0].mowed).toBe(true); // you do bulldoze through it
    expect(s.car.health).toBeLessThan(1); // but it bit you
    expect(s.car.speed).toBeCloseTo(50 * CRASH_TUNING.bruteSpeedKeep, 4); // the frenazo
  });

  it('breaks the streak (a hull hit ends a run of mows)', () => {
    const s = createSim(1);
    s.car.lateralX = laneCenterX(2);
    s.car.speed = 50;
    s.distance = 10;
    s.combo = 8;
    s.comboTicks = 60;
    putBrute(s, 2, 8);
    resolveMows(s, 50);
    // The kill banks a fresh streak of one, never continuing the broken run.
    expect(s.combo).toBe(1);
  });

  it('pays its scrap bonus on top of the mow payout', () => {
    const s = createSim(1);
    s.car.lateralX = laneCenterX(2);
    s.car.speed = 50;
    s.distance = 10;
    putBrute(s, 2, 8);
    resolveMows(s, 50);
    expect(s.scrap).toBeGreaterThan(BRUTE_TUNING.scrapBonus);
  });

  it('is lethal and attributable when it empties a low hull', () => {
    const s = createSim(1);
    s.car.lateralX = laneCenterX(2);
    s.car.speed = 60;
    s.car.health = 0.1;
    s.distance = 10;
    putBrute(s, 2, 8);
    resolveMows(s, 60);
    expect(s.car.health).toBe(0);
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('brute');
  });
});

describe('shooting a brute', () => {
  it('takes several level-1 shots to drop (it soaks the gun)', () => {
    const s = createSim(1, BASE_LOADOUT);
    s.distance = 100;
    putBrute(s, s.car.lane, s.distance + 20);

    // One shot only chips it — a single hit point per level-1 shot.
    resolveShots(s, FIRE);
    expect(s.zombies[0].mowed).toBe(false);
    expect(s.zombies[0].hp).toBe(BRUTE_TUNING.hp - 1);

    // Keep firing (reset the cadence gate each tick) until it finally drops.
    for (let i = 0; i < BRUTE_TUNING.hp; i += 1) {
      s.car.fireCooldown = 0;
      resolveShots(s, FIRE);
    }
    expect(s.zombies[0].mowed).toBe(true);
  });

  it('a high-tier cannon fells it in one shot', () => {
    const s = createSim(1, { ...BASE_LOADOUT, weaponLevel: 5 }); // killsPerShot 6 > hp
    s.distance = 100;
    putBrute(s, s.car.lane, s.distance + 20);
    resolveShots(s, FIRE);
    expect(s.zombies[0].mowed).toBe(true);
  });

  it('ranged kills never cost hull (only ramming does)', () => {
    const s = createSim(1, { ...BASE_LOADOUT, weaponLevel: 5 });
    s.distance = 100;
    putBrute(s, s.car.lane, s.distance + 20);
    resolveShots(s, FIRE);
    expect(s.car.health).toBe(1);
  });
});
