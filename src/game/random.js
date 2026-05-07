export function weightedChoice(entries, getWeight, fallback = null, random = Math.random) {
  const weightedEntries = entries.filter((entry) => getWeight(entry) > 0);
  const totalWeight = weightedEntries.reduce((sum, entry) => sum + getWeight(entry), 0);

  if (totalWeight <= 0) return fallback;

  let roll = random() * totalWeight;
  for (const entry of weightedEntries) {
    roll -= getWeight(entry);
    if (roll <= 0) return entry;
  }

  return weightedEntries[0] ?? fallback;
}

export function weightedKey(weights = {}, fallback = null, random = Math.random) {
  const entry = weightedChoice(Object.entries(weights), ([, weight]) => weight, null, random);
  return entry?.[0] ?? fallback;
}

export function buildWeightedPool(weights = {}, targetCount = 20) {
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (totalWeight <= 0) return [];

  const weightedPool = [];
  for (const [key, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;

    const count = Math.max(1, Math.round((weight / totalWeight) * targetCount));
    for (let i = 0; i < count; i += 1) {
      weightedPool.push(key);
    }
  }

  return weightedPool;
}
