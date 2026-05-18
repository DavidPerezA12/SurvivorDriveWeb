import * as THREE from "three";

import { getAllZones, getZoneByDistance, zoneBlendFactor } from "../game/zones.js";
import { prepareFadableObject } from "./meshes/roadside.js";

const URBAN_ZONES = new Set(["ghost_town", "military", "refuge"]);
const DESERT_ZONES = new Set(["garage", "broken_highway", "desert"]);

export function isUrbanZone(zoneId) {
  return URBAN_ZONES.has(zoneId);
}

export function isDesertZone(zoneId) {
  return DESERT_ZONES.has(zoneId);
}

export function hydrateEnvironmentProfiles(rawProfiles) {
  return Object.fromEntries(
    Object.entries(rawProfiles).map(([key, profile]) => [
      key,
      {
        ...profile,
        tint: new THREE.Color(profile.tint),
      },
    ]),
  );
}

export function hydrateSkyPalette(rawPalette) {
  return Object.fromEntries(
    Object.entries(rawPalette).map(([zoneId, palette]) => [
      zoneId,
      Object.fromEntries(
        Object.entries(palette).map(([key, color]) => [key, new THREE.Color(color)]),
      ),
    ]),
  );
}

export function resolveZoneTransition(distanceKm) {
  const zone = getZoneByDistance(distanceKm);
  const zones = getAllZones();
  const zoneIndex = zones.findIndex((entry) => entry.id === zone.id);
  const nextZone = zoneIndex >= 0 && zoneIndex < zones.length - 1 ? zones[zoneIndex + 1] : null;
  const blend = nextZone
    ? zoneBlendFactor(distanceKm, nextZone.distanceStart, nextZone.distanceEnd)
    : 0;

  return {
    zone,
    nextZone,
    blend,
    zones,
    zoneIndex,
  };
}

export function resolveCycleLabel(cycle) {
  if (cycle < 0.18 || cycle > 0.82) return "Night";
  if (cycle < 0.34) return "Dawn";
  if (cycle < 0.66) return "Day";
  return "Dusk";
}

export function chooseNextWeather(current, environmentProfiles, zoneId, random = Math.random) {
  const keys = Object.keys(environmentProfiles)
    .filter((key) => key !== current)
    .filter((key) => (isUrbanZone(zoneId) ? key !== "dust" : key !== "smog"));

  return keys[Math.floor(random() * keys.length)] ?? "clear";
}

export function createEnvironmentRuntime({
  world,
  state,
  atmosphere,
  environmentProfiles,
  skyPalette,
  flashMessage = () => {},
}) {
  const tempColorA = new THREE.Color();
  const tempColorB = new THREE.Color();
  const tempColorC = new THREE.Color();
  const tempColorD = new THREE.Color();
  let lastBiomePresentationKey = null;

  function setMaterialBlend(material, blend) {
    const clamped = THREE.MathUtils.clamp(blend, 0, 1);
    if (material.userData.baseOpacity == null) {
      material.userData.baseOpacity = material.opacity ?? 1;
    }
    material.transparent = clamped < 0.999;
    material.opacity = material.userData.baseOpacity * clamped;
    material.depthWrite = clamped > 0.35;
  }

  function setNodeBlend(node, blend) {
    const clamped = THREE.MathUtils.clamp(blend, 0, 1);
    node.visible = clamped > 0.015;

    if (!node.userData.fadeMaterials) {
      prepareFadableObject(node);
    }

    for (const material of node.userData.fadeMaterials) {
      setMaterialBlend(material, clamped);
    }
  }

  function syncBiomePresentation() {
    const distance = world.run?.distance ?? 0;
    const { zone, nextZone, blend } = resolveZoneTransition(distance);

    const vA = zone.visual;
    const vB = blend > 0 && nextZone ? nextZone.visual : vA;
    const currentUrban = isUrbanZone(zone.id) ? 1 : 0;
    const nextUrban = nextZone ? (isUrbanZone(nextZone.id) ? 1 : 0) : currentUrban;
    const urbanFactor = THREE.MathUtils.lerp(currentUrban, nextUrban, blend);
    const desertFactor = 1 - urbanFactor;
    const presentationKey = `${zone.id}:${nextZone?.id ?? "none"}:${blend.toFixed(3)}:${urbanFactor.toFixed(3)}`;

    if (presentationKey === lastBiomePresentationKey) {
      return;
    }

    lastBiomePresentationKey = presentationKey;

    for (const prop of world.roadsideProps) setNodeBlend(prop, desertFactor);
    for (const prop of world.roadsideBackdrop) setNodeBlend(prop, desertFactor);
    for (const prop of world.dunes) setNodeBlend(prop, desertFactor);
    for (const prop of world.boulders) setNodeBlend(prop, desertFactor);
    for (const prop of world.cityProps) setNodeBlend(prop, urbanFactor);
    for (const prop of world.cityBackdrop) setNodeBlend(prop, urbanFactor);

    if (world.materials.ground) {
      world.materials.ground.color.set(vA.groundColor).lerp(tempColorA.set(vB.groundColor), blend);
    }

    if (world.materials.road) {
      world.materials.road.color.set(vA.roadColor).lerp(tempColorA.set(vB.roadColor), blend);
    }

    if (world.materials.shoulder) {
      world.materials.shoulder.color
        .set(vA.groundColor)
        .lerp(tempColorA.set(vB.groundColor), blend);
    }
  }

  function pickNextWeather(current, zoneId) {
    return chooseNextWeather(current, environmentProfiles, zoneId);
  }

  function updateEnvironment(dt) {
    const env = world.environment;
    const distance = world.run?.distance ?? 0;
    const { zone, nextZone, blend } = resolveZoneTransition(distance);

    const palA = skyPalette[zone.id] || skyPalette.desert;
    const palB = blend > 0 && nextZone ? skyPalette[nextZone.id] || palA : palA;

    if (state.options.dayNight) {
      env.cycle = (env.cycle + dt * 0.012) % 1;
    } else {
      env.cycle = 0.5;
    }

    if (state.options.weatherFx) {
      env.weatherTimer -= dt;
      if (env.weatherTimer <= 0) {
        const nextWeather = pickNextWeather(env.targetWeather, zone.id);
        env.targetWeather = nextWeather;
        env.weatherTimer = 14 + Math.random() * 10;
        flashMessage(`Clima: ${environmentProfiles[nextWeather].label}`);
      }
    } else {
      env.targetWeather = isUrbanZone(zone.id) ? "smog" : "clear";
      env.weatherTimer = 12;
    }

    const targetStrength = env.targetWeather === "clear" ? 0 : 1;
    env.weatherStrength = THREE.MathUtils.lerp(env.weatherStrength, targetStrength, dt * 0.7);

    if (env.weatherStrength < 0.08) {
      env.weather = "clear";
    } else if (env.weatherStrength > 0.92) {
      env.weather = env.targetWeather;
    }

    const profile =
      environmentProfiles[env.weatherStrength > 0.5 ? env.targetWeather : env.weather];
    const eventEffects = world.eventEffects ?? {};
    const daylight = Math.max(0.1, Math.sin(env.cycle * Math.PI));
    const phaseLabel = resolveCycleLabel(env.cycle);

    env.bg.copy(tempColorA.set(palA.bgNight).lerp(tempColorB.set(palB.bgNight), blend));
    env.bg.lerp(tempColorC.set(palA.bgDay).lerp(tempColorD.set(palB.bgDay), blend), daylight);

    env.fog.copy(tempColorA.set(palA.fogNight).lerp(tempColorB.set(palB.fogNight), blend));
    env.fog.lerp(tempColorC.set(palA.fogDay).lerp(tempColorD.set(palB.fogDay), blend), daylight);

    env.bg.lerp(profile.tint, env.weatherStrength * 0.18);
    env.fog.lerp(profile.tint, env.weatherStrength * 0.28);

    world.scene.background.copy(env.bg);
    world.scene.fog.color.copy(env.fog);
    world.scene.fog.density =
      0.005 +
      (1 - daylight) * 0.003 +
      profile.fogBoost * env.weatherStrength +
      (eventEffects.fogBoost ?? 0);

    const starOpacity = THREE.MathUtils.clamp((1 - daylight) * 2 - 1.0, 0, 0.8);
    if (world.lights.stars) world.lights.stars.material.opacity = starOpacity;

    if (world.car && world.car.userData.headlights) {
      const lightsOn =
        daylight < 0.35 || env.weatherStrength > 0.6 || eventEffects.headlightsForced;
      const targetIntensity = lightsOn ? (isUrbanZone(zone.id) ? 4 : 6) : 0;
      world.car.userData.headlights.forEach((light) => {
        light.intensity = THREE.MathUtils.lerp(light.intensity, targetIntensity, dt * 2.5);
        light.color.lerp(
          tempColorC.set(lightsOn && isUrbanZone(zone.id) ? "#aaddff" : "#fffdeb"),
          dt,
        );
      });
    }

    if (world.lights.ambient) {
      const ambNight = tempColorA
        .set(palA.ambientNight)
        .lerp(tempColorB.set(palB.ambientNight), blend);
      const ambDay = tempColorC.set(palA.ambientDay).lerp(tempColorD.set(palB.ambientDay), blend);
      world.lights.ambient.color.copy(ambNight).lerp(ambDay, daylight);

      const gndNight = tempColorA
        .set(palA.groundNight)
        .lerp(tempColorB.set(palB.groundNight), blend);
      const gndDay = tempColorC.set(palA.groundDay).lerp(tempColorD.set(palB.groundDay), blend);
      world.lights.ambient.groundColor.copy(gndNight).lerp(gndDay, daylight);

      world.lights.ambient.intensity =
        0.45 +
        daylight * 0.55 -
        env.weatherStrength * 0.2 -
        (eventEffects.ambientDarken ?? 0) * 0.25;
    }

    if (world.lights.sun) {
      const baseIntensity = isUrbanZone(zone.id) ? 1.35 : 1.5;
      world.lights.sun.intensity = 0.2 + daylight * baseIntensity - env.weatherStrength * 0.2;
      world.lights.sun.position.set(Math.cos(env.cycle * Math.PI * 2) * 24, 8 + daylight * 30, 10);

      const sunColorNight = tempColorA.set(daylight < 0.3 ? "#ffb08a" : "#fff0d4");
      const sunColorDay = tempColorB.set(daylight < 0.3 ? "#d0c9d9" : "#f0f2f7");
      const isCityFactor = isUrbanZone(zone.id) ? 1 : 0;
      world.lights.sun.color.copy(sunColorNight).lerp(sunColorDay, isCityFactor);
    }

    for (const band of world.dustBands) {
      band.material.opacity = Math.min(
        0.035 + env.weatherStrength * 0.12 + (1 - daylight) * 0.015,
        0.08,
      );
    }

    const shimmerTarget = isDesertZone(zone.id) ? daylight * 0.04 : 0.005;
    for (const shim of world.heatShimmer) {
      shim.material.opacity += (shimmerTarget - shim.material.opacity) * dt * 0.5;
    }

    if (atmosphere) {
      atmosphere.style.background = `
        linear-gradient(180deg, rgba(0, 0, 0, ${0.1 + env.weatherStrength * 0.15}), rgba(7, 4, 3, ${0.25 + (1 - daylight) * 0.2})),
        radial-gradient(circle at 50% 10%, rgba(180, 110, 60, ${0.04 + daylight * 0.08}), transparent 32%)
      `;
    }

    if (world.run) {
      world.run.biomeLabel = zone.label;
      world.run.weatherLabel = profile.label;
      world.run.cycleLabel = phaseLabel;
      world.run.weatherFuelUse = profile.fuelUse ?? 1;
      world.run.weatherHandling = profile.handling;
      world.run.weatherThreat = profile.threatBoost * env.weatherStrength;
    }

    env.biome = zone.id;
    env.weatherLabel = profile.label;
    env.cycleLabel = phaseLabel;

    syncBiomePresentation();
  }

  return {
    syncBiomePresentation,
    updateEnvironment,
    pickNextWeather,
  };
}
