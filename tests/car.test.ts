import { describe, expect, it } from 'vitest';
import { createSim, step, NO_INTENT, type Intent } from '../src/sim';
import { cruisingSpeed } from '../src/sim/car';
import { CAR_TUNING, LANE_COUNT, laneCenterX } from '../src/content/tuning';

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
  it('starts centered, grounded, and stationary', () => {
    const s = createSim(0);
    expect(s.car.targetLane).toBe(startLane);
    expect(s.car.lateralX).toBeCloseTo(laneCenterX(startLane));
    expect(s.car.speed).toBe(0);
    expect(s.car.airborne).toBe(false);
    expect(s.car.height).toBe(0);
  });

  it('accelerates from rest within the hazard-free grace zone', () => {
    const s = drive(0, [], 150); // ~2.5 s, still inside the opening grace zone
    expect(s.car.speed).toBeGreaterThan(0);
    expect(s.distance).toBeGreaterThan(0);
    expect(s.dead).toBe(false);
  });

  it('the speed ramp raises cruising speed with distance', () => {
    expect(cruisingSpeed(2200)).toBeGreaterThan(cruisingSpeed(0));
  });

  it('a single steer tap settles at exactly one lane over', () => {
    const s = drive(0, [intent(1)], 120);
    expect(s.car.targetLane).toBe(startLane + 1);
    expect(s.car.lateralX).toBeCloseTo(laneCenterX(startLane + 1));
    expect(s.car.lane).toBe(startLane + 1);
  });

  it('the steering spring slides analog and does not overshoot the target', () => {
    // One tick after a tap: moving, but not arrived.
    const oneTick = drive(0, [intent(1)], 1);
    expect(oneTick.car.lateralX).toBeGreaterThan(laneCenterX(startLane));
    expect(oneTick.car.lateralX).toBeLessThan(laneCenterX(startLane + 1));

    // Critically damped: it never crosses past the target lane center.
    const target = laneCenterX(startLane + 1);
    const sim = createSim(0);
    let maxX = -Infinity;
    for (let i = 0; i < 200; i += 1) {
      step(sim, i === 0 ? intent(1) : NO_INTENT);
      maxX = Math.max(maxX, sim.car.lateralX);
    }
    expect(maxX).toBeLessThanOrEqual(target + 1e-6);
  });

  it('cannot steer past the outer shoulders', () => {
    const spam: Intent[] = Array.from({ length: 50 }, () => intent(1));
    const s = drive(0, spam, 600);
    expect(s.car.targetLane).toBe(LANE_COUNT - 1);
    expect(s.car.lateralX).toBeCloseTo(laneCenterX(LANE_COUNT - 1));
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
