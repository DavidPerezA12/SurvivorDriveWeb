import * as THREE from "three";

import { getZoneByDistance, getNextCheckpoint } from "../game/zones.js";
import { updateZoneHud } from "../game/ui.js";
import { speedPips, biomeCatalog } from "../game/content.js";
import { eventCatalog } from "../game/events.js";

let messageTimer = 0;
let runtime = {
  world: null,
  hud: null,
  totalRouteDistance: 7.2,
  isPlaying: () => false,
};

export const shakeState = {
  timer: 0,
  intensity: 0,
};

export function configureHudUpdates({
  world,
  hud,
  totalRouteDistance = 7.2,
  isPlaying = () => false,
}) {
  runtime = {
    world,
    hud,
    totalRouteDistance,
    isPlaying,
  };
}

export function updateHUD() {
  const { world, hud, totalRouteDistance, isPlaying } = runtime;
  const run = world?.run;
  if (!run || !hud) return;

  const zone = getZoneByDistance(run.distance);
  const nextCp = getNextCheckpoint(run.distance);

  updateZoneHud(hud, {
    zoneName: zone.id,
    zoneLabel: zone.label,
    distanceKm: run.distance,
    nextCheckpointKm: nextCp?.distance,
    nextCheckpointLabel: nextCp?.zoneName,
    threatLevel: run.threat,
    totalDistance: totalRouteDistance,
  });

  if (hud.coins) hud.coins.textContent = run.coins;

  if (hud.scrap) hud.scrap.textContent = run.scrap ?? 0;

  if (hud.ammo) hud.ammo.textContent = run.ammo;

  if (hud.nitro) {
    hud.nitro.textContent = run.nitroTimer > 0 ? `${run.nitroTimer.toFixed(1)}s` : "--";
    hud.nitro.closest(".stat")?.classList.toggle("nitro-active", run.nitroTimer > 0);
  }

  hud.jumps.textContent = run.jumps;

  hud.fire.textContent = run.fire;

  hud.jumpStock.textContent = run.jumps;

  hud.fireStock.textContent = run.fire;

  hud.health.textContent = Math.max(0, Math.ceil(run.health));

  if (hud.healthFill) {
    hud.healthFill.style.width = `${THREE.MathUtils.clamp(run.health, 0, 100)}%`;
  }

  if (hud.fuel) {
    hud.fuel.textContent = Math.max(0, Math.ceil(run.fuel));
  }

  if (hud.fuelFill) {
    const fuelMax = run.fuelMax ?? 100;
    hud.fuelFill.style.width = `${THREE.MathUtils.clamp((run.fuel / fuelMax) * 100, 0, 100)}%`;
  }

  if (hud.threat) hud.threat.textContent = `${Math.round(run.threat)}%`;

  if (hud.eventChip) {
    const activeEvent = world.eventManager.activeEvent;
    if (activeEvent) {
      const eventDef = eventCatalog[activeEvent];
      hud.eventChip.style.display = "flex";
      if (hud.eventName) hud.eventName.textContent = eventDef.name;
    } else {
      hud.eventChip.style.display = "none";
    }
  }

  if (hud.weather) hud.weather.textContent = run.weatherLabel;

  if (hud.cycle) hud.cycle.textContent = run.cycleLabel;

  const activeEventId = world.eventManager?.activeEvent;
  if (hud.eventChip) {
    hud.eventChip.style.display = activeEventId ? "" : "none";
  }
  if (hud.eventName) {
    hud.eventName.textContent = activeEventId ? (eventCatalog[activeEventId]?.name ?? activeEventId) : "—";
  }

  hud.distance.textContent = run.distance.toFixed(1);

  hud.biome.textContent = biomeCatalog[run.biome].label;

  hud.objective.textContent = run.objective;

  hud.objectiveProgress.textContent = formatObjectiveProgress(run);

  if (hud.jumpButton) {
    hud.jumpButton.disabled = !run.grounded || run.jumps <= 0 || !isPlaying();
  }

  if (hud.fireButton) {
    hud.fireButton.disabled = run.fire <= 0 || run.ammo < 2 || !isPlaying();
  }

  if (hud.pauseButton) hud.pauseButton.disabled = !isPlaying();

  const pips = hud.speedBar.querySelectorAll(".speed-pip");

  const sf = run.speedFactor ?? 1;

  const braking = (run.throttleSmoothed ?? 0) < -0.08;

  const activePips = Math.round(sf * speedPips);

  pips.forEach((pip, i) => {
    pip.classList.toggle("active", !braking && i < activePips);

    pip.classList.toggle(
      "brake",

      braking && i < Math.round((1 - sf) * speedPips),
    );
  });
}

export function formatObjectiveProgress(run) {
  if (!Number.isFinite(run.objectiveTarget)) {
    return `${run.objectiveProgress.toFixed(1)} km`;
  }

  return `${Math.min(run.objectiveProgress, run.objectiveTarget).toFixed(1)} / ${run.objectiveTarget.toFixed(1)} km`;
}

export function flashMessage(text) {
  const { hud } = runtime;
  if (!hud?.message) return;

  hud.message.textContent = text;

  hud.message.classList.add("visible");

  clearTimeout(messageTimer);

  messageTimer = window.setTimeout(() => {
    hud.message.classList.remove("visible");
  }, 1400);
}

export function triggerShake(intensity = 1) {
  shakeState.timer = 0.25;

  shakeState.intensity = Math.max(shakeState.intensity, intensity);
}
