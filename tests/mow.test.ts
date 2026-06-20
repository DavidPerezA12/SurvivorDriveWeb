import { describe, expect, it } from 'vitest';
import { createSim, step, NO_INTENT, type SimState } from '../src/sim';
import { resolveMows } from '../src/sim/collision';
import { ECONOMY_TUNING, LANE_COUNT, MOW_TUNING, laneCenterX } from '../src/content/tuning';

/**
 * Mowing is the game's free fun (docs/DESIGN.md → Pillar 2): plowing zombies is
 * safe, pays scrap, builds a streak, and only ever surges the car forward. These
 * are the headless contracts; the feel of it is judged in the browser.
 */

/** A live zombie sitting at `forward` in `lane`, ready to be mowed. */
function putZombie(state: SimState, lane: number, forward: number): void {
  state.zombies.push({ lane, x: laneCenterX(lane), forward, phase: 0, mowed: false });
}

/** A state with the car cruising in the centre lane at a known speed and place. */
function cruising(speed: number): SimState {
  const s = createSim(1);
  s.car.speed = speed;
  s.car.lateralX = laneCenterX(2);
  s.distance = 10;
  return s;
}

describe('mowing', () => {
  it('mows a zombie in the car’s lane: scrap, a kill, a streak, one event', () => {
    const s = cruising(50);
    putZombie(s, 2, 8);
    resolveMows(s, 50);

    expect(s.zombies[0].mowed).toBe(true);
    expect(s.zombiesMowed).toBe(1);
    expect(s.combo).toBe(1);
    expect(s.scrap).toBe(ECONOMY_TUNING.mowScrapBase);
    expect(s.events.filter((e) => e.type === 'zombieMowed')).toHaveLength(1);
  });

  it('never dents the hull — fodder is safe', () => {
    const s = cruising(50);
    putZombie(s, 2, 8);
    resolveMows(s, 50);
    expect(s.car.health).toBe(1);
    expect(s.dead).toBe(false);
  });

  it('surges the car forward and never slows it', () => {
    const s = cruising(50);
    putZombie(s, 2, 8);
    resolveMows(s, 50);
    expect(s.car.speed).toBeCloseTo(50 + MOW_TUNING.speedBoost, 6);

    // At the overspeed ceiling a mow cannot push past it — but it must not drag
    // the car back down either.
    const capped = cruising(50 + MOW_TUNING.overspeedCap + 5);
    putZombie(capped, 2, 8);
    const before = capped.car.speed;
    resolveMows(capped, 50);
    expect(capped.car.speed).toBe(before);
  });

  it('does not mow while jumping — the air trades the scrap away', () => {
    const s = cruising(50);
    s.car.height = 1.0; // above the jump clearance
    putZombie(s, 2, 8);
    resolveMows(s, 50);
    expect(s.zombies[0].mowed).toBe(false);
    expect(s.scrap).toBe(0);
    expect(s.zombiesMowed).toBe(0);
  });

  it('pays each zombie exactly once', () => {
    const s = cruising(50);
    putZombie(s, 2, 8);
    resolveMows(s, 50);
    const after = s.scrap;
    resolveMows(s, 50);
    expect(s.scrap).toBe(after);
    expect(s.zombiesMowed).toBe(1);
  });

  it('does not mow a zombie a lane over', () => {
    const s = cruising(50);
    putZombie(s, 4, 8); // car is in lane 2
    resolveMows(s, 50);
    expect(s.zombies[0].mowed).toBe(false);
    expect(s.scrap).toBe(0);
  });

  it('racks the streak across a cluster and scales scrap with it', () => {
    const s = cruising(50);
    // Three zombies all inside the car’s swept span this tick.
    putZombie(s, 2, 6);
    putZombie(s, 2, 8);
    putZombie(s, 2, 10);
    resolveMows(s, 50);

    expect(s.combo).toBe(3);
    expect(s.zombiesMowed).toBe(3);
    // base + (base+step) + (base+2·step)
    const b = ECONOMY_TUNING.mowScrapBase;
    const step2 = ECONOMY_TUNING.mowScrapStep;
    expect(s.scrap).toBe(b + (b + step2) + (b + 2 * step2));
    const combos = s.events
      .filter((e) => e.type === 'zombieMowed')
      .map((e) => (e.type === 'zombieMowed' ? e.combo : 0));
    expect(combos).toEqual([1, 2, 3]);
  });
});

describe('mow streak lifecycle', () => {
  it('lapses after its window with no fresh kills', () => {
    const s = createSim(5);
    putZombie(s, 2, 8);

    let mowed = false;
    for (let i = 0; i < 120 && !mowed; i += 1) {
      step(s, NO_INTENT);
      if (s.events.some((e) => e.type === 'zombieMowed')) mowed = true;
    }
    expect(s.combo).toBeGreaterThanOrEqual(1);

    // Nothing left to mow inside the grace zone, so the streak must time out.
    for (let i = 0; i < ECONOMY_TUNING.comboWindowTicks + 2; i += 1) step(s, NO_INTENT);
    expect(s.combo).toBe(0);
  });

  it('resets the streak the instant a crash dents the hull', () => {
    const s = createSim(5);
    putZombie(s, 2, 8); // mowed early, builds a streak
    s.hazards.push({ kind: 'wreck', lane: 2, x: laneCenterX(2), forward: 30, hit: false });

    let crashedTick = -1;
    for (let i = 0; i < 140; i += 1) {
      step(s, NO_INTENT);
      if (s.events.some((e) => e.type === 'crashed')) {
        crashedTick = i;
        break;
      }
    }

    expect(s.zombiesMowed).toBeGreaterThanOrEqual(1); // the streak existed
    expect(crashedTick).toBeGreaterThanOrEqual(0); // and a crash happened
    expect(s.car.health).toBeLessThan(1); // which dented the hull
    expect(s.combo).toBe(0); // so the streak was wiped, not merely lapsed
  });
});

/**
 * The whole chain in real play — generate → materialize → mow → pay — not just
 * injected entities. A car that sweeps every lane through the seeded world must
 * find and mow zombies and bank scrap. This is the seed of the headless economy
 * bot (docs/ARCHITECTURE.md → Testing strategy).
 */
describe('the mow loop in real play', () => {
  /** Sweep slowly across all lanes so we cross the infested ones (never jump). */
  function driveSweeping(seed: number, ticks: number): SimState {
    const s = createSim(seed);
    // Ping-pong across every lane (0..N-1..1) so the sweep is independent of the
    // configured LANE_COUNT and always crosses the infested, non-safe lanes.
    const up = Array.from({ length: LANE_COUNT }, (_, i) => i);
    const down = up.slice(1, -1).reverse();
    const lanes = [...up, ...down];
    for (let i = 0; i < ticks; i += 1) {
      const desired = lanes[Math.floor(i / 45) % lanes.length];
      const diff = desired - s.car.targetLane;
      step(s, { steer: diff > 0 ? 1 : diff < 0 ? -1 : 0, jump: false, fire: false });
      // This is an economy smoke test, not a survival one: a dumb bot that sweeps
      // every lane without jumping eats every blocker (jumpable boulders and the
      // un-jumpable, lethal rig alike). Pin the hull so the sweep samples the
      // whole generated world and we measure the generate→materialize→mow→pay
      // chain itself, not the bot's ability to dodge. Real safe-line pathing is
      // the M3 windowed pather (docs/ARCHITECTURE.md).
      s.car.health = 1;
      s.dead = false;
    }
    return s;
  }

  it('mows zombies and banks scrap across many seeds', () => {
    for (const seed of [1, 2, 42, 7777, 0xc0ffee]) {
      // Drive well into the horde acts: the opening Outbreak band is deliberately
      // calm (sparse infected), so at 6000 m/act we sweep past it into Rust/Swarm
      // where the dense clusters guarantee the generate→mow→pay chain fires.
      const s = driveSweeping(seed, 14000);
      expect(s.zombiesMowed).toBeGreaterThan(0);
      expect(s.scrap).toBeGreaterThan(0);
      // Every mow pays at least the base, so scrap can never lag the kill count.
      expect(s.scrap).toBeGreaterThanOrEqual(s.zombiesMowed * ECONOMY_TUNING.mowScrapBase);
    }
  });
});
