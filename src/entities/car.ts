import { CAR_RADIUS, ROAD_HALF_WIDTH } from '../game/config';
import type { CarState, InputState, Upgrades } from '../game/types';

export function createCarState(): CarState {
  return {
    x: 0,
    y: 0,
    lateralVelocity: 0,
    isJumping: false
  };
}

export function updateCar(
  car: CarState,
  input: InputState,
  upgrades: Upgrades,
  deltaS: number,
  jumpTimeS: number
): CarState {
  const maxLateralSpeed = 8.4 + upgrades.tires * 0.65;
  const response = input.steer === 0 ? 13.5 : 10.5 + upgrades.tires * 0.55;
  const targetVelocity = input.steer * maxLateralSpeed;
  const velocityBlend = 1 - Math.exp(-response * deltaS);
  let lateralVelocity = car.lateralVelocity + (targetVelocity - car.lateralVelocity) * velocityBlend;
  const x = Math.max(
    -ROAD_HALF_WIDTH + CAR_RADIUS,
    Math.min(ROAD_HALF_WIDTH - CAR_RADIUS, car.x + lateralVelocity * deltaS)
  );

  if (
    (x <= -ROAD_HALF_WIDTH + CAR_RADIUS && lateralVelocity < 0) ||
    (x >= ROAD_HALF_WIDTH - CAR_RADIUS && lateralVelocity > 0)
  ) {
    lateralVelocity = 0;
  }

  const jumpProgress = jumpTimeS > 0 ? Math.sin((jumpTimeS / 0.72) * Math.PI) : 0;

  return {
    x,
    y: Math.max(0, jumpProgress * 1.75),
    lateralVelocity,
    isJumping: jumpTimeS > 0
  };
}
