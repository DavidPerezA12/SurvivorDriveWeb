/**
 * events.js — Event system for SurvivorDriveWeb
 *
 * Events are special gameplay modifiers that temporarily change the game
 * state. They are triggered by the zone system based on distance and
 * probability weights.
 *
 * Event types:
 *   dust_storm          — Reduced visibility, wind, dust particles
 *   chase_light         — Weak enemy vehicle pursuit
 *   chase_medium        — Moderate pursuit
 *   chase_heavy         — Heavy pursuit with multiple enemies
 *   cut_road            — Road partially blocked, forces lane change or detour
 *   gas_station         — Risk/reward zone: lots of pickups but heavy ambush
 *   dark_tunnel         — Very low visibility, headlights forced on
 *   military_checkpoint — Dense barrier wall, mines, towers
 */

import { getZoneByDistance } from "./zones.js";

// ── Event definitions ───────────────────────────────────────────────────

export const eventCatalog = {
  dust_storm: {
    id: "dust_storm",
    name: "Dust Storm",
    description: "Una tormenta de polvo reduce la visibilidad drásticamente.",
    durationMin: 8,
    durationMax: 16,
    effects: {
      fogBoost: 0.012,     // added to base fog
      handlingMult: 0.85,  // reduced grip
      speedMult: 0.9,      // slight speed penalty
      windStrength: 1.5,   // lateral wind push
      ambientDarken: 0.3,
      headlightsForced: true,
      particleSpawn: "dust_storm",
    },
    hudMessage: "¡Tormenta de polvo!",
    hudColor: "#c49a6c",
    canCancel: false,
  },

  chase_light: {
    id: "chase_light",
    name: "Pursuit – Light",
    description: "Un coche enemigo aparece detrás y te persigue.",
    durationMin: 10,
    durationMax: 18,
    effects: {
      spawnChaser: 1,       // number of chaser vehicles
      chaserSpeed: 1.05,    // slightly faster than player base
      chaserDamage: 15,
      chaserShootInterval: 1.5,
    },
    hudMessage: "¡Te persiguen!",
    hudColor: "#ff4444",
    canCancel: false,
  },

  chase_medium: {
    id: "chase_medium",
    name: "Pursuit – Medium",
    description: "Dos vehículos enemigos te persiguen.",
    durationMin: 12,
    durationMax: 20,
    effects: {
      spawnChaser: 2,
      chaserSpeed: 1.08,
      chaserDamage: 20,
      chaserShootInterval: 1.2,
    },
    hudMessage: "¡Persecución!",
    hudColor: "#ff2222",
    canCancel: false,
  },

  chase_heavy: {
    id: "chase_heavy",
    name: "Pursuit – Heavy",
    description: "Múltiples vehículos blindados te persiguen.",
    durationMin: 14,
    durationMax: 25,
    effects: {
      spawnChaser: 3,
      chaserSpeed: 1.12,
      chaserDamage: 28,
      chaserShootInterval: 0.9,
    },
    hudMessage: "¡Persecución pesada!",
    hudColor: "#ff0000",
    canCancel: false,
  },

  cut_road: {
    id: "cut_road",
    name: "Road Cut",
    description: "La carretera está cortada. Busca un desvío o cambia de carril.",
    durationMin: 6,
    durationMax: 10,
    effects: {
      spawnBarrierWall: true,  // full-width barrier wall with gaps
      gapCount: 1,             // number of passable gaps
      gapWidth: 1.8,           // width of each gap in world units
    },
    hudMessage: "¡Carretera cortada!",
    hudColor: "#ffaa00",
    canCancel: true,  // ends when player passes through
  },

  gas_station: {
    id: "gas_station",
    name: "Gas Station",
    description: "Una gasolinera abandonada. Muchos recursos pero puede haber emboscada.",
    durationMin: 8,
    durationMax: 12,
    effects: {
      spawnFuelPickups: 4,
      spawnRepairPickups: 2,
      spawnAmbush: true,         // enemies after collecting
      ambushDelay: 3,            // seconds after first pickup
      ambushEnemies: 3,
    },
    hudMessage: "Gasolinera avistada",
    hudColor: "#78d36f",
    canCancel: false,
  },

  dark_tunnel: {
    id: "dark_tunnel",
    name: "Dark Tunnel",
    description: "Un túnel oscuro. Visibilidad mínima.",
    durationMin: 10,
    durationMax: 18,
    effects: {
      fogBoost: 0.02,
      ambientDarken: 0.7,
      headlightsForced: true,
      speedMult: 0.85,
    },
    hudMessage: "Túnel oscuro",
    hudColor: "#444444",
    canCancel: false,
  },

  military_checkpoint: {
    id: "military_checkpoint",
    name: "Military Checkpoint",
    description: "Un puesto de control militar fuertemente defendido.",
    durationMin: 12,
    durationMax: 20,
    effects: {
      spawnBarriers: 6,
      spawnTowers: 2,
      spawnMines: 4,
      fogBoost: 0.005,
    },
    hudMessage: "¡Control militar!",
    hudColor: "#cc4444",
    canCancel: true,
  },
};

// ── Event Manager ───────────────────────────────────────────────────────

export function createEventManager() {
  return {
    activeEvent: null,          // currently active event
    eventTimer: 0,              // remaining duration of active event
    eventCooldown: 0,           // cooldown before next event can trigger
    eventHudTimer: 0,           // timer for HUD message display
    chasers: [],                // active chaser vehicles (if chase event)
    eventStartDistance: 0,      // distance when event started
  };
}

/**
 * Get available events for the current zone, respecting cooldowns.
 */
function getAvailableEvents(zone, eventMgr) {
  if (eventMgr.eventCooldown > 0) return [{ id: "none", weight: 1 }];

  const events = [{ id: "none", weight: zone.events.weights.none ?? 0.5 }];

  for (const [eventId, weight] of Object.entries(zone.events.weights)) {
    if (eventId === "none") continue;
    if (weight <= 0) continue;
    events.push({ id: eventId, weight });
  }

  return events;
}

/**
 * Try to trigger a random event for the current zone.
 * Returns null if no event triggered.
 */
export function tryTriggerEvent(eventMgr, distanceKm) {
  // Don't trigger if active event is running
  if (eventMgr.activeEvent) return null;

  const zone = getZoneByDistance(distanceKm);
  if (!zone) return null;

  const available = getAvailableEvents(zone, eventMgr);
  const totalWeight = available.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of available) {
    roll -= entry.weight;
    if (roll <= 0) {
      if (entry.id === "none") {
        // Set cooldown and return
        eventMgr.eventCooldown =
          zone.events.cooldownMin +
          Math.random() * (zone.events.cooldownMax - zone.events.cooldownMin);
        return null;
      }

      const eventDef = eventCatalog[entry.id];
      if (!eventDef) return null;

      const duration =
        eventDef.durationMin +
        Math.random() * (eventDef.durationMax - eventDef.durationMin);

      eventMgr.activeEvent = entry.id;
      eventMgr.eventTimer = duration;
      eventMgr.eventHudTimer = 3.0; // show message for 3 seconds
      eventMgr.eventStartDistance = distanceKm;
      eventMgr.eventCooldown = 0; // cooldown starts after event ends

      return { eventId: entry.id, duration, event: eventDef };
    }
  }

  return null;
}

/**
 * Update the active event. Call every frame.
 * Returns { ended: true } if the event just ended this frame.
 */
export function updateEvent(eventMgr, dt, distanceKm) {
  // Update cooldown
  if (eventMgr.eventCooldown > 0) {
    eventMgr.eventCooldown -= dt;
  }

  // Update HUD message timer
  if (eventMgr.eventHudTimer > 0) {
    eventMgr.eventHudTimer -= dt;
  }

  // Update active event
  if (!eventMgr.activeEvent) return { active: false };

  const eventDef = eventCatalog[eventMgr.activeEvent];
  if (!eventDef) {
    eventMgr.activeEvent = null;
    return { active: false };
  }

  eventMgr.eventTimer -= dt;

  // Check if event should end
  let ended = eventMgr.eventTimer <= 0;

  // Some events can be cancelled by distance threshold
  if (
    eventDef.canCancel &&
    distanceKm - eventMgr.eventStartDistance > eventDef.durationMax * 0.12
  ) {
    // Auto-cancel for road-cut type events after player passes
    ended = true;
  }

  if (ended) {
    const endedEventId = eventMgr.activeEvent;
    const zone = getZoneByDistance(distanceKm);
    eventMgr.activeEvent = null;
    eventMgr.eventTimer = 0;
    eventMgr.eventCooldown =
      (zone?.events?.cooldownMin ?? 15) +
      Math.random() * ((zone?.events?.cooldownMax ?? 30) - (zone?.events?.cooldownMin ?? 15));
    return { active: false, ended: true, endedEventId };
  }

  return { active: true, event: eventDef, remaining: eventMgr.eventTimer };
}

/**
 * Get event effects for the current frame (merged with base game state).
 */
export function getEventEffects(eventMgr) {
  if (!eventMgr.activeEvent) return null;
  const eventDef = eventCatalog[eventMgr.activeEvent];
  if (!eventDef) return null;
  return eventDef.effects;
}

/**
 * Force-start a specific event (for debug or scripted moments).
 */
export function forceEvent(eventMgr, eventId, distanceKm) {
  const eventDef = eventCatalog[eventId];
  if (!eventDef) return false;

  const duration =
    eventDef.durationMin +
    Math.random() * (eventDef.durationMax - eventDef.durationMin);

  eventMgr.activeEvent = eventId;
  eventMgr.eventTimer = duration;
  eventMgr.eventHudTimer = 3.0;
  eventMgr.eventStartDistance = distanceKm;
  eventMgr.eventCooldown = 0;
  return true;
}

/**
 * End the current event immediately.
 */
export function endEvent(eventMgr) {
  eventMgr.activeEvent = null;
  eventMgr.eventTimer = 0;
}
