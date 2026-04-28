// Car collision AABB constants (shared across all collision checks)
export const CAR_Z = 1.2;
export const CAR_HALF_X = 0.85;
export const CAR_HALF_Z = 2.2;

export function collidesWithCar(x, z, radius, y = 1.1, verticalRadius = 1.8) {
  return function (run) {
    if (!run) return false;
    const dx = Math.abs(x - run.x);
    const dz = Math.abs(z - CAR_Z);
    const dy = Math.abs(y - (run.y + 1));
    return dx < CAR_HALF_X + 0.4 + radius && dz < CAR_HALF_Z + radius && dy < verticalRadius;
  };
}

export function pointToObstacleFootprintDistSq(px, pz, cx, cz, halfX, halfZ) {
  const dx = Math.max(0, Math.abs(px - cx) - halfX);
  const dz = Math.max(0, Math.abs(pz - cz) - halfZ);
  return dx * dx + dz * dz;
}

export function circleIntersectsCarAabb(cx, cz, radius, run, carZ = CAR_Z, carHalfX = CAR_HALF_X, carHalfZ = CAR_HALF_Z) {
  const nx = Math.max(run.x - carHalfX, Math.min(cx, run.x + carHalfX));
  const nz = Math.max(carZ - carHalfZ, Math.min(cz, carZ + carHalfZ));
  const dx = cx - nx;
  const dz = cz - nz;
  return dx * dx + dz * dz <= radius * radius;
}

export function firePulseTouchesObstacle(obstacle, run, fireReach, originZ = 1.5) {
  const px = run.x;
  const pz = originZ;
  const ox = obstacle.position.x;
  const oz = obstacle.position.z;
  if (obstacle.userData.collisionFootprint === "circle") {
    const r =
      obstacle.userData.collisionRadius ??
      Math.max(
        obstacle.userData.collisionHalfX ?? 1,
        obstacle.userData.collisionHalfZ ?? 1,
      );
    return Math.hypot(ox - px, oz - pz) <= fireReach + r;
  }
  const hx = obstacle.userData.collisionHalfX ?? obstacle.userData.radius ?? 1;
  const hz = obstacle.userData.collisionHalfZ ?? obstacle.userData.radius ?? 1;
  return (
    pointToObstacleFootprintDistSq(px, pz, ox, oz, hx, hz) <=
    fireReach * fireReach
  );
}

/**
 * Checks collision between an obstacle and the car.
 * Returns false if no collision, or a collision data object with:
 *   dx, dz        – absolute distances (car center → obstacle center)
 *   signedDx      – signed X distance (obstacle.x - run.x)
 *   signedDz      – signed Z distance (obstacle.z - carZ)
 *   isScrape      – true if the car only barely clips the edge
 *   xOverlap      – X-axis penetration depth
 *   zOverlap      – Z-axis penetration depth
 *   halfX, halfZ  – obstacle half-extents used
 */
export function obstacleHitsCar(obstacle, run) {
  if (!run) return false;
  const x = obstacle.position.x;
  const z = obstacle.position.z;
  const halfX = obstacle.userData.collisionHalfX ?? obstacle.userData.radius ?? 1;
  const halfZ = obstacle.userData.collisionHalfZ ?? obstacle.userData.radius ?? 1;

  const signedDx = x - run.x;
  const signedDz = z - CAR_Z;
  const dx = Math.abs(signedDx);
  const dz = Math.abs(signedDz);

  let xzOverlap;
  const footprint = obstacle.userData.collisionFootprint || "box";
  if (footprint === "circle") {
    const rObs = obstacle.userData.collisionRadius ?? Math.max(halfX, halfZ);
    xzOverlap = circleIntersectsCarAabb(x, z, rObs, run, CAR_Z, CAR_HALF_X, CAR_HALF_Z);
  } else {
    xzOverlap = dx < CAR_HALF_X + halfX && dz < CAR_HALF_Z + halfZ;
  }
  if (!xzOverlap) return false;

  // Vertical overlap check
  const carBase = 0.1 + run.y;
  const carLow = carBase + 0.02;
  const carHigh = carBase + 1.56;
  const by = obstacle.position.y;
  let yMin = by + (obstacle.userData.collisionYMin ?? -1.2);
  let yMax = by + (obstacle.userData.collisionYMax ?? 1.2);
  if (obstacle.userData.collisionBottom != null && obstacle.userData.collisionYMin == null) {
    yMin = obstacle.userData.collisionBottom;
    yMax = obstacle.userData.collisionTop ?? by + 1.15;
  }

  const clearAbove = 0.34;
  if (carLow >= yMax - clearAbove) return false;
  if (carHigh <= yMin + 0.05) return false;

  // Penetration depths
  const xOverlap = Math.max(0, CAR_HALF_X + halfX - dx);
  const zOverlap = Math.max(0, CAR_HALF_Z + halfZ - dz);

  // Scrape = barely clipping the edge of the obstacle footprint
  const totalX = CAR_HALF_X + halfX;
  const totalZ = CAR_HALF_Z + halfZ;
  const marginX = (totalX - dx) / totalX; // 0 = barely touching, 1 = fully overlapping
  const marginZ = (totalZ - dz) / totalZ;
  const isScrape = Math.max(marginX, marginZ) < 0.38;

  return { dx, dz, signedDx, signedDz, isScrape, xOverlap, zOverlap, halfX, halfZ, footprint };
}

export function randomLane() {
  return [-4.2, -1.4, 1.4, 4.2][Math.floor(Math.random() * 4)];
}
