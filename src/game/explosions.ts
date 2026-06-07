import type { CarState, Entity } from './types';

export type ExplosiveObstacleKind = 'barrel' | 'mine';

export const EXPLOSION_DAMAGE = 32;

export const EXPLOSION_RADIUS_BY_OBSTACLE: Record<ExplosiveObstacleKind, number> = {
  barrel: 3.2,
  mine: 2.4
};

export function isExplosiveObstacle(type: Entity['type']): type is ExplosiveObstacleKind {
  return type === 'barrel' || type === 'mine';
}

export function canExplosionDestroy(entity: Entity): boolean {
  return (
    entity.kind === 'obstacle' &&
    (entity.type === 'barrel' ||
      entity.type === 'mine' ||
      entity.type === 'lightBarricade' ||
      entity.type === 'zombie')
  );
}

export function isEntityInExplosion(entity: Entity, origin: Entity): boolean {
  const dx = entity.position.x - origin.position.x;
  const dz = entity.position.z - origin.position.z;
  const radius = getExplosionRadius(origin) + entity.radius;

  return dx * dx + dz * dz <= radius * radius;
}

export function isCarInExplosion(car: CarState, origin: Entity): boolean {
  const dx = car.x - origin.position.x;
  const dz = origin.position.z;
  const radius = getExplosionRadius(origin);

  return !car.isJumping && dx * dx + dz * dz <= radius * radius;
}

export function createExplosionEntity(origin: Entity): Entity {
  return {
    id: `explosion-${origin.id}`,
    kind: 'effect',
    type: 'explosion',
    position: { ...origin.position, y: 0.42 },
    radius: getExplosionRadius(origin),
    lifetimeS: 0.28
  };
}

function getExplosionRadius(origin: Entity): number {
  return isExplosiveObstacle(origin.type) ? EXPLOSION_RADIUS_BY_OBSTACLE[origin.type] : 0;
}
