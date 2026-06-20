import { describe, expect, it } from 'vitest';
import { createSim, step, NO_INTENT, type Intent, type SimState } from '../src/sim';
import { resolveCollisions, resolveMows, resolvePickups } from '../src/sim/collision';
import {
  BASE_LOADOUT,
  computeLoadout,
  familyLevel,
  familyNextTier,
  UPGRADE_FAMILIES,
  UPGRADES,
  upgradePrereq,
  type UpgradeId,
} from '../src/content/upgrades';
import { CAR_TUNING, laneCenterX } from '../src/content/tuning';

function intent(steer: -1 | 0 | 1, jump = false): Intent {
  return { steer, jump, fire: false };
}

/** A wreck blocker sitting at `forward` in the car's lane, ready to be hit. */
function putWreck(state: SimState, lane: number, forward: number): void {
  state.hazards.push({ kind: 'wreck', lane, x: laneCenterX(lane), forward, hit: false });
}

describe('computeLoadout', () => {
  it('an empty owned set is the stock loadout', () => {
    expect(computeLoadout([])).toEqual(BASE_LOADOUT);
  });

  it('each upgrade moves exactly the modifier it should', () => {
    expect(computeLoadout(['hydraulicJump']).jumpImpulseMul).toBeGreaterThan(1);
    expect(computeLoadout(['stickyTires']).steerOmegaMul).toBeGreaterThan(1);
    expect(computeLoadout(['liftTank']).bonusJumpCharges).toBeGreaterThan(0);
    expect(computeLoadout(['scrapMagnet']).grabRadiusMul).toBeGreaterThan(1);
    expect(computeLoadout(['reinforcedPlating']).damageMul).toBeLessThan(1);
  });

  it('is order-independent up to float rounding (same owned set ⇒ same loadout)', () => {
    const all = UPGRADES.map((u) => u.id);
    const a = computeLoadout(all);
    const b = computeLoadout([...all].reverse());
    for (const k of Object.keys(a) as (keyof typeof a)[]) {
      expect(b[k]).toBeCloseTo(a[k], 10);
    }
  });

  it('stacks a family’s tiers (each owned tier pushes the dial further)', () => {
    const one = computeLoadout(['hydraulicJump']);
    const two = computeLoadout(['hydraulicJump', 'hydraulicJump2']);
    const three = computeLoadout(['hydraulicJump', 'hydraulicJump2', 'hydraulicJump3']);
    expect(two.jumpImpulseMul).toBeGreaterThan(one.jumpImpulseMul);
    expect(three.jumpImpulseMul).toBeGreaterThan(two.jumpImpulseMul);

    // Armor compounds downward; more plating = less hull damage taken.
    expect(computeLoadout(['reinforcedPlating', 'reinforcedPlating2']).damageMul).toBeLessThan(
      computeLoadout(['reinforcedPlating']).damageMul,
    );
  });
});

describe('upgrade families', () => {
  it('every family tier chains to the one below it (climbs in order)', () => {
    for (const fam of UPGRADE_FAMILIES) {
      expect(upgradePrereq(fam.tiers[0])).toBeNull();
      for (let i = 1; i < fam.tiers.length; i += 1) {
        expect(upgradePrereq(fam.tiers[i])).toBe(fam.tiers[i - 1]);
      }
    }
  });

  it('reports the owned level and the next buyable tier of a family', () => {
    const jump = UPGRADE_FAMILIES.find((f) => f.key === 'jump')!;
    expect(familyLevel(jump, new Set())).toBe(0);
    expect(familyNextTier(jump, new Set())).toBe(jump.tiers[0]);

    const owned = new Set<UpgradeId>([jump.tiers[0]]);
    expect(familyLevel(jump, owned)).toBe(1);
    expect(familyNextTier(jump, owned)).toBe(jump.tiers[1]);

    const maxed = new Set<UpgradeId>(jump.tiers);
    expect(familyLevel(jump, maxed)).toBe(jump.tiers.length);
    expect(familyNextTier(jump, maxed)).toBeNull();
  });
});

describe('upgrade effects in the sim', () => {
  it('Hydraulic Jump launches a taller arc than the stock car', () => {
    const stock = createSim(0);
    step(stock, intent(0, true));

    const hydro = createSim(0, computeLoadout(['hydraulicJump']));
    step(hydro, intent(0, true));

    expect(hydro.car.vertVel).toBeGreaterThan(stock.car.vertVel);
  });

  it('Lift Tank starts with more charges and banks past the stock cap', () => {
    const tank = createSim(0, computeLoadout(['liftTank']));
    expect(tank.car.jumpCharges).toBeGreaterThan(CAR_TUNING.jumpStartCharges);

    // Sit on the stock cap, then scoop one more pickup: the raised cap lets it in.
    tank.car.jumpCharges = CAR_TUNING.jumpMaxCharges;
    tank.car.lateralX = laneCenterX(2);
    tank.distance = 10;
    tank.pickups.push({ kind: 'jump', lane: 2, x: laneCenterX(2), forward: 8, phase: 0, taken: false });
    resolvePickups(tank);
    expect(tank.car.jumpCharges).toBeGreaterThan(CAR_TUNING.jumpMaxCharges);
  });

  it('Sticky Tires settles a lane change sooner than the stock car', () => {
    const ticks = 6;
    const stock = createSim(0);
    const sticky = createSim(0, computeLoadout(['stickyTires']));
    for (let i = 0; i < ticks; i += 1) {
      step(stock, i === 0 ? intent(1) : NO_INTENT);
      step(sticky, i === 0 ? intent(1) : NO_INTENT);
    }
    const target = laneCenterX(3);
    // Closer to the new lane centre after the same number of ticks.
    expect(target - sticky.car.lateralX).toBeLessThan(target - stock.car.lateralX);
  });

  it('Reinforced Plating loses less hull from the same crash', () => {
    const stock = createSim(0);
    stock.car.speed = 40;
    stock.distance = 10;
    stock.car.lateralX = laneCenterX(2);
    putWreck(stock, 2, 10);
    resolveCollisions(stock);

    const plated = createSim(0, computeLoadout(['reinforcedPlating']));
    plated.car.speed = 40;
    plated.distance = 10;
    plated.car.lateralX = laneCenterX(2);
    putWreck(plated, 2, 10);
    resolveCollisions(plated);

    // The plated hull keeps more health after an identical head-on.
    expect(plated.car.health).toBeGreaterThan(stock.car.health);
  });

  it('Scrap Magnet mows fodder the stock bumper skims past', () => {
    const offset = 1.7; // beyond stock reach (~1.55 m), inside the magnet's (~1.9 m)
    const place = (s: SimState): void => {
      s.car.lateralX = laneCenterX(2);
      s.distance = 10;
      s.zombies.push({ lane: 2, x: laneCenterX(2) + offset, forward: 8, phase: 0, mowed: false });
    };

    const stock = createSim(0);
    place(stock);
    resolveMows(stock, 50);
    expect(stock.zombies[0].mowed).toBe(false);

    const magnet = createSim(0, computeLoadout(['scrapMagnet']));
    place(magnet);
    resolveMows(magnet, 50);
    expect(magnet.zombies[0].mowed).toBe(true);
  });
});

describe('determinism with a loadout', () => {
  it('same (seed, loadout, intents) reproduces the run', () => {
    const script: Intent[] = [intent(1), intent(0, true), intent(-1), intent(0, true)];
    const run = (): SimState => {
      const s = createSim(1337, computeLoadout(['hydraulicJump', 'stickyTires', 'liftTank']));
      for (let i = 0; i < 400; i += 1) step(s, script[i] ?? NO_INTENT);
      return s;
    };
    expect(run()).toEqual(run());
  });
});
