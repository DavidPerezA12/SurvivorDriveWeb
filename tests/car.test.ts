import { describe, expect, it } from 'vitest';
import { createSim, step, NO_INTENT, type Intent } from '../src/sim';
import { cruisingSpeed } from '../src/sim/car';
import {
  CAR_HALF_WIDTH,
  CAR_TUNING,
  LANE_COUNT,
  LANE_WIDTH,
  laneCenterX,
  roadHalfWidth,
} from '../src/content/tuning';

function intent(steer: -1 | 0 | 1, jump = false): Intent {
  return { steer, jump, fire: false };
}

function drive(seed: number, intents: Intent[], totalTicks: number) {
  const state = createSim(seed);
  for (let i = 0; i < totalTicks; i += 1) {
    step(state, intents[i] ?? NO_INTENT);
  }
  return state;
}

const startLane = Math.floor(LANE_COUNT / 2);

describe('car kinematics', () => {
  it('starts centered, grounded, and already at cruising speed', () => {
    const s = createSim(0);
    expect(s.car.lane).toBe(startLane);
    expect(s.car.lateralX).toBeCloseTo(laneCenterX(startLane));
    expect(s.car.lateralVel).toBe(0);
    // The run opens mid-cruise, not from a standstill (the intro hands it off rolling).
    expect(s.car.speed).toBeCloseTo(cruisingSpeed(0));
    expect(s.car.airborne).toBe(false);
    expect(s.car.height).toBe(0);
  });

  it('rolls forward at cruising speed within the hazard-free grace zone', () => {
    const s = drive(0, [], 30); // ~0.5 s, still inside the opening grace zone
    // It cruises (tracking the distance ramp), never spooling up from a standstill.
    expect(s.car.speed).toBeCloseTo(cruisingSpeed(s.distance), 1);
    expect(s.car.speed).toBeGreaterThanOrEqual(cruisingSpeed(0));
    expect(s.distance).toBeGreaterThan(0);
    expect(s.dead).toBe(false);
  });

  it('the speed ramp raises cruising speed with distance', () => {
    expect(cruisingSpeed(2200)).toBeGreaterThan(cruisingSpeed(0));
  });

  it('drives continuously while the wheel is held, not in lane snaps', () => {
    // A single tick of held steer moves only a sliver, far less than a whole lane:
    // there is no one-tap lane jump anymore.
    const oneTick = drive(0, [intent(1)], 1);
    expect(oneTick.car.lateralX).toBeGreaterThan(laneCenterX(startLane));
    expect(oneTick.car.lateralX - laneCenterX(startLane)).toBeLessThan(LANE_WIDTH * 0.25);

    // Held a short while, it comes to rest between lane centers, not snapped onto
    // one: the wheel is free, not a per-lane ratchet.
    const held = drive(
      0,
      Array.from({ length: 8 }, () => intent(1)),
      8,
    );
    expect(held.car.lateralX).toBeGreaterThan(laneCenterX(startLane));
    expect(held.car.lateralX).toBeLessThan(laneCenterX(startLane + 1));
  });

  it('coasts to a stop when the wheel centers, without snapping back to a lane', () => {
    const startX = laneCenterX(startLane);
    // Hold left a good while (there is room toward the far edge), then release.
    const intents: Intent[] = Array.from({ length: 80 }, (_, i) => (i < 18 ? intent(-1) : intent(0)));
    const s = drive(0, intents, 80);
    // It stayed where it was steered (well left of where it started), not pulled
    // back to its start lane by any magnet.
    expect(s.car.lateralX).toBeLessThan(startX - LANE_WIDTH * 0.4);
    // And it has come to rest: the free wheel brakes to zero, it does not drift on.
    expect(Math.abs(s.car.lateralVel)).toBeLessThan(1e-3);
  });

  it('cannot steer off the road', () => {
    // The car roams the full drivable width but plants at the road edge (road
    // half-width minus the car's half-width), not at the outer lane center.
    const edge = roadHalfWidth() - CAR_HALF_WIDTH;
    const spam: Intent[] = Array.from({ length: 600 }, () => intent(-1));
    const s = drive(0, spam, 600);
    expect(s.car.lane).toBe(0);
    expect(s.car.lateralX).toBeCloseTo(-edge);
    expect(s.car.lateralVel).toBeCloseTo(0);
  });
});

describe('jump', () => {
  it('launches off the ground, arcs, and lands back at height 0', () => {
    const sim = createSim(0);
    step(sim, intent(0, true));
    expect(sim.car.airborne).toBe(true);
    expect(sim.car.vertVel).toBeGreaterThan(0);

    // Mid-arc the car is off the ground.
    for (let i = 0; i < 18; i += 1) step(sim, NO_INTENT);
    expect(sim.car.height).toBeGreaterThan(0);

    // It comes back down within a second.
    let landed = false;
    for (let i = 0; i < 60 && !landed; i += 1) {
      step(sim, NO_INTENT);
      if (!sim.car.airborne) landed = true;
    }
    expect(sim.car.airborne).toBe(false);
    expect(sim.car.height).toBe(0);
  });

  it('cannot double-jump while airborne', () => {
    const sim = createSim(0);
    step(sim, intent(0, true));
    const apexVel = sim.car.vertVel;
    // A second jump request mid-air must be ignored.
    step(sim, intent(0, true));
    expect(sim.car.vertVel).toBeLessThan(apexVel); // gravity only, no relaunch
  });

  it('emits jumped then landed frame events', () => {
    const sim = createSim(0);
    step(sim, intent(0, true));
    expect(sim.events.some((e) => e.type === 'jumped')).toBe(true);

    let sawLanded = false;
    for (let i = 0; i < 120 && !sawLanded; i += 1) {
      step(sim, NO_INTENT);
      if (sim.events.some((e) => e.type === 'landed')) sawLanded = true;
    }
    expect(sawLanded).toBe(true);
  });
});

describe('jump charges', () => {
  it('starts with the configured charges in hand', () => {
    expect(createSim(0).car.jumpCharges).toBe(CAR_TUNING.jumpStartCharges);
  });

  it('spends exactly one charge per jump', () => {
    const sim = createSim(0);
    step(sim, intent(0, true));
    expect(sim.car.jumpCharges).toBe(CAR_TUNING.jumpStartCharges - 1);
  });

  it('jumps the same height regardless of a battered hull — the arc never degrades', () => {
    const healthy = createSim(0);
    step(healthy, intent(0, true));
    const healthyVel = healthy.car.vertVel;

    const hurt = createSim(0);
    hurt.car.health = 0.2; // hull nearly gone — must not change the jump
    step(hurt, intent(0, true));

    expect(hurt.car.airborne).toBe(true);
    expect(hurt.car.vertVel).toBeCloseTo(healthyVel, 6);
  });

  it('refuses to launch once the charges run out', () => {
    const sim = createSim(0);
    // Spend every charge, landing between each so the launch is allowed.
    for (let c = 0; c < CAR_TUNING.jumpStartCharges; c += 1) {
      step(sim, intent(0, true));
      for (let i = 0; i < 60 && sim.car.airborne; i += 1) step(sim, NO_INTENT);
    }
    expect(sim.car.jumpCharges).toBe(0);

    step(sim, intent(0, true));
    expect(sim.car.airborne).toBe(false);
    expect(sim.events.some((e) => e.type === 'jumped')).toBe(false);
  });
});
