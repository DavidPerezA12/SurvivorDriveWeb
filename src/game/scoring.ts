export function formatMeters(distanceM: number): string {
  if (distanceM < 1000) {
    return `${Math.floor(distanceM)} m`;
  }

  return `${(distanceM / 1000).toFixed(2)} km`;
}

export function distanceScore(distanceM: number): number {
  return Math.floor(distanceM * 1.5);
}
