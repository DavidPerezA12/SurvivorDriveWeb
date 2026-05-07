/**
 * chunks.js — Chunk template system for SurvivorDriveWeb
 *
 * A "chunk" is a reusable road segment template with pre-defined obstacle,
 * pickup, and prop placements. Chunks are queued ahead of the player and
 * spawned when the distance reaches the chunk's start point.
 *
 * Architecture:
 *   ChunkScheduler maintains a look-ahead queue of chunks.
 *   On each frame, it checks if the player has reached a chunk's start
 *   distance and spawns its objects. Random filler spawning continues
 *   between chunks to maintain density.
 */

import { getZoneByDistance } from "./zones.js";
import { weightedChoice, weightedKey } from "./random.js";

// ── Chunk template definitions ──────────────────────────────────────────

/**
 * A chunk is an object:
 * {
 *   id: string,
 *   name: string,
 *   lengthM: number,         // chunk length in meters
 *   zones: string[],         // which zones can use this chunk
 *   weight: number,          // relative selection weight
 *   obstacleSlots: [{ kind, x, z, xJitter }],  // x/z relative to chunk center
 *   pickupSlots:   [{ kind, x, z, xJitter }],
 *   propSlots:     [{ kind, x, z, side }],
 *   roadDetails:   string[], // "crack", "oil_stain", "pothole", "skid_mark"
 *   difficulty: number,      // 0-1 relative difficulty
 *   minDistanceSince: number // min km since last special chunk
 * }
 */

const chunkTemplates = {
  // ── Basic chunks ──
  straight_empty: {
    id: "straight_empty",
    name: "Empty Straight",
    lengthM: 40,
    zones: ["*"],
    weight: 10,
    obstacleSlots: [],
    pickupSlots: [],
    propSlots: [],
    roadDetails: [],
    difficulty: 0,
    minDistanceSince: 0,
  },

  straight_sparse: {
    id: "straight_sparse",
    name: "Sparse Straight",
    lengthM: 40,
    zones: ["*"],
    weight: 8,
    obstacleSlots: [{ kind: "random", x: 2.8, z: 8 }],
    pickupSlots: [{ kind: "random", x: -1.4, z: 18 }],
    propSlots: [
      { kind: "random", x: -8.2, z: 5, side: "left" },
      { kind: "random", x: 8.2, z: 25, side: "right" },
    ],
    roadDetails: ["crack"],
    difficulty: 0.1,
    minDistanceSince: 0,
  },

  straight_medium: {
    id: "straight_medium",
    name: "Medium Straight",
    lengthM: 40,
    zones: ["*"],
    weight: 6,
    obstacleSlots: [
      { kind: "random", x: -2.8, z: 6 },
      { kind: "random", x: 2.8, z: 20 },
    ],
    pickupSlots: [
      { kind: "random", x: 0, z: 13 },
      { kind: "random", x: -4.2, z: 28 },
    ],
    propSlots: [
      { kind: "random", x: -8.2, z: 3, side: "left" },
      { kind: "random", x: 8.2, z: 15, side: "right" },
      { kind: "random", x: -8.2, z: 30, side: "left" },
    ],
    roadDetails: ["crack", "oil_stain"],
    difficulty: 0.3,
    minDistanceSince: 0,
  },

  straight_dense: {
    id: "straight_dense",
    name: "Dense Straight",
    lengthM: 40,
    zones: ["*"],
    weight: 4,
    obstacleSlots: [
      { kind: "random", x: 1.4, z: 5 },
      { kind: "random", x: -4.2, z: 12 },
      { kind: "random", x: 2.8, z: 24 },
    ],
    pickupSlots: [
      { kind: "random", x: -1.4, z: 8 },
      { kind: "random", x: 4.2, z: 18 },
      { kind: "random", x: 0, z: 30 },
    ],
    propSlots: [
      { kind: "random", x: -8.2, z: 2, side: "left" },
      { kind: "random", x: 8.2, z: 10, side: "right" },
      { kind: "random", x: -8.2, z: 25, side: "left" },
      { kind: "random", x: 8.2, z: 35, side: "right" },
    ],
    roadDetails: ["crack", "pothole", "oil_stain", "skid_mark"],
    difficulty: 0.5,
    minDistanceSince: 0,
  },

  // ── Special chunks ──
  wreck_field: {
    id: "wreck_field",
    name: "Wreck Field",
    lengthM: 50,
    zones: ["broken_highway", "ghost_town"],
    weight: 5,
    obstacleSlots: [
      { kind: "wreck", x: 2.8, z: 4 },
      { kind: "wreck", x: -4.2, z: 10 },
      { kind: "scrap", x: 0, z: 16 },
      { kind: "wreck", x: 4.2, z: 22 },
      { kind: "debris", x: -1.4, z: 28 },
      { kind: "scrap", x: -2.8, z: 35 },
    ],
    pickupSlots: [
      { kind: "scrap", x: -4.2, z: 6 },
      { kind: "fuel", x: 1.4, z: 18 },
      { kind: "scrap", x: 4.2, z: 30 },
      { kind: "ammo", x: -2.8, z: 40 },
    ],
    propSlots: [
      { kind: "wrecked_car", x: -9, z: 8, side: "left" },
      { kind: "wrecked_car", x: 9, z: 20, side: "right" },
    ],
    roadDetails: ["crack", "oil_stain", "skid_mark", "crack", "pothole"],
    difficulty: 0.4,
    minDistanceSince: 0.3,
  },

  barricade_row: {
    id: "barricade_row",
    name: "Barricade Row",
    lengthM: 30,
    zones: ["broken_highway", "ghost_town", "military"],
    weight: 4,
    obstacleSlots: [
      { kind: "barricade", x: 4.2, z: 3 },
      { kind: "barrier", x: -4.2, z: 3 },
      { kind: "barricade", x: 1.4, z: 12 },
      { kind: "debris", x: -1.4, z: 14 },
      { kind: "barrier", x: -4.2, z: 20 },
      { kind: "barrier", x: 2.8, z: 22 },
    ],
    pickupSlots: [
      { kind: "repair", x: 0, z: 8 },
      { kind: "ammo", x: -2.8, z: 16 },
    ],
    propSlots: [
      { kind: "barrier", x: -8.2, z: 1, side: "left" },
      { kind: "barrier", x: 8.2, z: 1, side: "right" },
    ],
    roadDetails: ["oil_stain", "skid_mark"],
    difficulty: 0.6,
    minDistanceSince: 0.25,
  },

  gas_station: {
    id: "gas_station",
    name: "Gas Station",
    lengthM: 60,
    zones: ["ghost_town", "desert"],
    weight: 3,
    obstacleSlots: [
      { kind: "wreck", x: 2.8, z: 5 },
      { kind: "scrap", x: -2.8, z: 10 },
      { kind: "barrier", x: 0, z: 18 },
    ],
    pickupSlots: [
      { kind: "fuel", x: -4.2, z: 3 },
      { kind: "fuel", x: 4.2, z: 8 },
      { kind: "repair", x: 0, z: 15 },
      { kind: "fuel", x: -2.8, z: 22 },
      { kind: "scrap", x: 3.0, z: 28 },
      { kind: "nitro", x: -3.0, z: 30 },
    ],
    propSlots: [
      { kind: "barrel", x: -8.5, z: 5, side: "left" },
      { kind: "barrel", x: 8.5, z: 10, side: "right" },
      { kind: "crate", x: -8.5, z: 20, side: "left" },
    ],
    roadDetails: ["oil_stain", "oil_stain", "crack"],
    difficulty: 0.5,
    minDistanceSince: 0.5,
  },

  tunnel: {
    id: "tunnel",
    name: "Dark Tunnel",
    lengthM: 80,
    zones: ["ghost_town", "military", "refuge"],
    weight: 2,
    obstacleSlots: [
      { kind: "wreck", x: 2.8, z: 6 },
      { kind: "debris", x: -1.4, z: 14 },
      { kind: "barricade", x: -2.8, z: 24 },
      { kind: "scrap", x: 4.2, z: 32 },
      { kind: "debris", x: 0, z: 40 },
      { kind: "fallen_sign", x: -4.2, z: 50 },
      { kind: "barrier", x: 1.4, z: 60 },
    ],
    pickupSlots: [
      { kind: "nitro", x: 0, z: 8 },
      { kind: "ammo", x: -4.2, z: 18 },
      { kind: "coin", x: 3.0, z: 28 },
      { kind: "repair", x: -1.4, z: 45 },
      { kind: "scrap", x: 4.2, z: 55 },
    ],
    propSlots: [
      { kind: "debris_pile", x: -8.2, z: 3, side: "left" },
      { kind: "debris_pile", x: 8.2, z: 20, side: "right" },
    ],
    roadDetails: ["crack", "pothole", "oil_stain", "crack", "skid_mark"],
    difficulty: 0.65,
    minDistanceSince: 0.4,
  },

  military_checkpoint_chunk: {
    id: "military_checkpoint_chunk",
    name: "Military Checkpoint",
    lengthM: 50,
    zones: ["military", "refuge"],
    weight: 5,
    obstacleSlots: [
      { kind: "military_barrier", x: -4.2, z: 2 },
      { kind: "military_barrier", x: 4.2, z: 2 },
      { kind: "tower", x: -5, z: 8 },
      { kind: "mine", x: 0, z: 14 },
      { kind: "mine", x: 3.0, z: 18 },
      { kind: "mine", x: -3.0, z: 22 },
      { kind: "military_barrier", x: 1.4, z: 28 },
      { kind: "half_gate", x: -1.4, z: 28 },
      { kind: "raider", x: 2.8, z: 38 },
    ],
    pickupSlots: [
      { kind: "ammo", x: -2.8, z: 6 },
      { kind: "repair", x: 2.8, z: 10 },
      { kind: "nitro", x: 0, z: 20 },
      { kind: "scrap", x: -4.2, z: 32 },
      { kind: "fuel", x: 4.2, z: 35 },
    ],
    propSlots: [
      { kind: "sandbag", x: -8.2, z: 1, side: "left" },
      { kind: "sandbag", x: 8.2, z: 1, side: "right" },
      { kind: "military_barrier", x: -8.5, z: 10, side: "left" },
      { kind: "military_barrier", x: 8.5, z: 10, side: "right" },
      { kind: "watchtower", x: -9, z: 25, side: "left" },
      { kind: "barrel", x: 8.5, z: 30, side: "right" },
    ],
    roadDetails: ["crack", "skid_mark", "pothole", "oil_stain"],
    difficulty: 0.85,
    minDistanceSince: 0.5,
  },

  mine_field: {
    id: "mine_field",
    name: "Mine Field",
    lengthM: 40,
    zones: ["military", "refuge"],
    weight: 4,
    obstacleSlots: [
      { kind: "mine", x: -2.8, z: 4 },
      { kind: "mine", x: 2.8, z: 6 },
      { kind: "mine", x: 0, z: 10 },
      { kind: "mine", x: -4.2, z: 14 },
      { kind: "mine", x: 4.2, z: 18 },
      { kind: "mine", x: -1.4, z: 22 },
      { kind: "mine", x: 3.0, z: 26 },
      { kind: "mine", x: -3.0, z: 30 },
    ],
    pickupSlots: [
      { kind: "repair", x: 1.4, z: 16 },
      { kind: "nitro", x: -2.8, z: 24 },
    ],
    propSlots: [
      { kind: "sign", x: -8.2, z: 2, side: "left" },
      { kind: "sign", x: 8.2, z: 2, side: "right" },
    ],
    roadDetails: ["skid_mark", "crack"],
    difficulty: 0.9,
    minDistanceSince: 0.4,
  },

  narrow_alley: {
    id: "narrow_alley",
    name: "Narrow Alley",
    lengthM: 35,
    zones: ["ghost_town"],
    weight: 5,
    obstacleSlots: [
      { kind: "debris", x: 1.4, z: 3 },
      { kind: "fallen_sign", x: -1.4, z: 8 },
      { kind: "wreck", x: 3.0, z: 14 },
      { kind: "debris", x: -3.0, z: 20 },
      { kind: "scrap", x: 0, z: 26 },
    ],
    pickupSlots: [
      { kind: "scrap", x: 2.8, z: 5 },
      { kind: "coin", x: -2.8, z: 12 },
      { kind: "fuel", x: 1.4, z: 22 },
    ],
    propSlots: [
      { kind: "building_ruin", x: -10, z: 4, side: "left" },
      { kind: "building_ruin", x: 10, z: 10, side: "right" },
      { kind: "fence", x: -9, z: 18, side: "left" },
      { kind: "fence", x: 9, z: 25, side: "right" },
    ],
    roadDetails: ["crack", "pothole", "crack"],
    difficulty: 0.45,
    minDistanceSince: 0.2,
  },

  open_desert_stretch: {
    id: "open_desert_stretch",
    name: "Open Desert Stretch",
    lengthM: 55,
    zones: ["desert"],
    weight: 6,
    obstacleSlots: [
      { kind: "rock", x: 4.2, z: 8 },
      { kind: "rock", x: -4.2, z: 18 },
      { kind: "barrier", x: 0, z: 30 },
      { kind: "scrap", x: -1.4, z: 40 },
    ],
    pickupSlots: [
      { kind: "nitro", x: 0, z: 5 },
      { kind: "fuel", x: -2.8, z: 12 },
      { kind: "coin", x: 4.2, z: 22 },
      { kind: "scrap", x: -4.2, z: 35 },
      { kind: "nitro", x: 1.4, z: 45 },
    ],
    propSlots: [
      { kind: "rock", x: 18, z: 3, side: "right" },
      { kind: "dead_bush", x: -16, z: 10, side: "left" },
      { kind: "dune", x: 22, z: 20, side: "right" },
      { kind: "crater", x: -20, z: 30, side: "left" },
      { kind: "cactus", x: 16, z: 40, side: "right" },
    ],
    roadDetails: ["crack", "skid_mark"],
    difficulty: 0.35,
    minDistanceSince: 0,
  },

  ambush_alley: {
    id: "ambush_alley",
    name: "Ambush Alley",
    lengthM: 45,
    zones: ["broken_highway", "military", "refuge"],
    weight: 3,
    obstacleSlots: [
      { kind: "raider", x: 2.8, z: 6 },
      { kind: "barricade", x: -4.2, z: 10 },
      { kind: "raider", x: -2.8, z: 20 },
      { kind: "tower", x: 5.5, z: 25 },
      { kind: "debris", x: 0, z: 32 },
      { kind: "barrier", x: 4.2, z: 38 },
    ],
    pickupSlots: [
      { kind: "ammo", x: -1.4, z: 4 },
      { kind: "repair", x: 1.4, z: 15 },
      { kind: "ammo", x: -4.2, z: 27 },
      { kind: "nitro", x: 0, z: 35 },
    ],
    propSlots: [
      { kind: "barrel", x: -8.2, z: 8, side: "left" },
      { kind: "debris_pile", x: 8.2, z: 22, side: "right" },
    ],
    roadDetails: ["skid_mark", "oil_stain", "crack", "pothole"],
    difficulty: 0.75,
    minDistanceSince: 0.35,
  },
};

// ── Chunk Scheduler ─────────────────────────────────────────────────────

const LOOKAHEAD_M = 400; // meters ahead to pre-generate chunks
const CHUNK_COOLDOWN_SPECIAL_M = 100; // min meters between special chunks

export function createChunkScheduler() {
  return {
    queue: [], // upcoming chunks [{ chunkId, distanceStart, distanceEnd, spawned }]
    lastChunkEndM: 0, // where the last queued chunk ends
    lastSpecialDistance: -CHUNK_COOLDOWN_SPECIAL_M,
  };
}

function isSpecialChunk(template) {
  return template.minDistanceSince > 0;
}

function getChunkTemplatesForZone(zone) {
  const results = [];
  for (const [key, template] of Object.entries(chunkTemplates)) {
    if (template.zones.includes("*") || template.zones.includes(zone.id)) {
      results.push({ key, ...template });
    }
  }
  return results;
}

/**
 * Select the next chunk template based on zone, variety, and cooldowns.
 */
function selectNextChunk(scheduler, zone) {
  const available = getChunkTemplatesForZone(zone);

  // Filter out special chunks that are on cooldown
  const eligible = available.filter((t) => {
    if (!isSpecialChunk(t)) return true;
    return scheduler.lastChunkEndM - scheduler.lastSpecialDistance >= t.minDistanceSince * 1000;
  });

  const fallback = { key: "straight_empty", ...chunkTemplates.straight_empty };
  const template = weightedChoice(eligible, (entry) => entry.weight, fallback);
  if (isSpecialChunk(template)) {
    scheduler.lastSpecialDistance = scheduler.lastChunkEndM;
  }

  return template;
}

/**
 * Fill the scheduler queue with chunks up to LOOKAHEAD_M ahead.
 * Call every frame (or periodically).
 */
export function fillChunkQueue(scheduler, currentDistanceM) {
  const lookaheadTarget = currentDistanceM + LOOKAHEAD_M;

  while (scheduler.lastChunkEndM < lookaheadTarget) {
    const zone = getZoneByDistance(scheduler.lastChunkEndM / 1000);
    const template = selectNextChunk(scheduler, zone);

    const chunk = {
      chunkId: template.id,
      templateKey: template.key ?? template.id,
      distanceStart: scheduler.lastChunkEndM,
      distanceEnd: scheduler.lastChunkEndM + template.lengthM,
      spawned: false,
      zone: zone.id,
    };

    scheduler.queue.push(chunk);
    scheduler.lastChunkEndM = chunk.distanceEnd;
  }
}

/**
 * Get chunks that should be spawned this frame (player just passed their start).
 */
export function getChunksToSpawn(scheduler, prevDistanceM, currentDistanceM) {
  const toSpawn = [];
  for (const chunk of scheduler.queue) {
    if (chunk.spawned) continue;
    if (chunk.distanceStart <= currentDistanceM && chunk.distanceStart > prevDistanceM - 10) {
      chunk.spawned = true;
      toSpawn.push(chunk);
    }
  }
  // Clean up chunks that are far behind
  scheduler.queue = scheduler.queue.filter((c) => c.distanceEnd > currentDistanceM - 100);
  return toSpawn;
}

/**
 * Get the template definition for a chunk key.
 */
export function getChunkTemplate(key) {
  return chunkTemplates[key] ?? null;
}

/**
 * Resolve "random" kind in a chunk slot to a specific kind
 * using the zone's obstacle/pickup/prop weights.
 */
export function resolveRandomKind(slotKind, zone, catalogWeights) {
  if (slotKind !== "random") return slotKind;

  const weights = catalogWeights;
  if (!weights || Object.keys(weights).length === 0) return null;

  return weightedKey(weights, Object.keys(weights)[0]);
}
