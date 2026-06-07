import { CAR_RADIUS } from '../game/config';
import type { CarState, Entity } from '../game/types';

export function collidesWithCar(car: CarState, entity: Entity): boolean {
  if (entity.destroyed || entity.collected) {
    return false;
  }

  const dx = car.x - entity.position.x;
  const dz = entity.position.z;
  const radius = CAR_RADIUS + entity.radius;

  if (car.isJumping && isJumpClearable(entity)) {
    return false;
  }

  return dx * dx + dz * dz <= radius * radius;
}

export function isJumpClearable(entity: Entity): boolean {
  return entity.kind === 'obstacle' && ['barrel', 'mine', 'crack'].includes(entity.type);
}

export function projectileHitsEntity(projectile: Entity, entity: Entity): boolean {
  if (projectile.destroyed || entity.destroyed || entity.kind !== 'obstacle') {
    return false;
  }

  const dx = projectile.position.x - entity.position.x;
  const dz = projectile.position.z - entity.position.z;
  const radius = projectile.radius + entity.radius;

  return dx * dx + dz * dz <= radius * radius;
}
