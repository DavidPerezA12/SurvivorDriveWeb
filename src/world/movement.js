import { recycleRoadDetail } from "./meshes/roadDetails.js";
import {
  recycleFarBackdrop,
  recycleBackdrop,
  recycleCityBackdrop,
} from "./meshes/backdrops.js";
import { recycleEnvironmentObject } from "./environment.js";

export function moveWorld(world, dt, speedFactor) {
  const flow = world.run ? world.run.speed : 18;
  const amount = flow * dt * speedFactor;

  if (world.propPool) {
    for (let i = world.propPool.length - 1; i >= 0; i--) {
      const prop = world.propPool[i];
      prop.position.z -= amount * (prop.userData.speedFactor ?? 1);

      if (prop.position.z < -42) {
        world.scene.remove(prop);
        world.propPool.splice(i, 1);
      }
    }
  }

  if (world.overheadPool) {
    for (let i = world.overheadPool.length - 1; i >= 0; i--) {
      const oh = world.overheadPool[i];
      oh.position.z -= amount * (oh.userData.speedFactor ?? 1);

      if (oh.position.z < -42) {
        world.scene.remove(oh);
        world.overheadPool.splice(i, 1);
      }
    }
  }

  scrollTextureSet(world, "road", amount);
  scrollTextureSet(world, "terrain", amount);
  scrollTextureSet(world, "shoulder", amount);

  for (const band of world.dustBands) {
    band.position.z -= amount * 0.8;
    band.position.x += Math.sin(performance.now() * 0.0003 + band.userData.offset) * 0.02;

    if (band.position.z < -20) band.position.z += 320;
  }

  for (const shim of world.heatShimmer) {
    shim.position.z -= amount * (shim.userData.speedFactor ?? 1);
    shim.userData.wobble += dt;
    shim.position.y =
      shim.userData.baseY +
      Math.sin(shim.userData.wobble * 0.5) * 0.3 +
      Math.cos(shim.userData.wobble * 0.7) * 0.2;
    shim.position.x += Math.sin(shim.userData.wobble * 0.3) * dt * 1.5;

    if (shim.position.z < -20) {
      shim.position.z += 320;
      shim.position.y = shim.userData.baseY;
      shim.userData.speedFactor = 0.6 + Math.random() * 0.4;
    }
  }

  for (const prop of world.roadsideProps) {
    prop.position.z -= amount * (prop.userData.speedFactor ?? 1);

    if (prop.position.z < -42) {
      recycleRoadsideProp(prop);
    }
  }

  for (const backdrop of world.roadsideBackdrop) {
    backdrop.position.z -= amount * backdrop.userData.speedFactor;

    if (backdrop.position.z < -58) {
      recycleBackdrop(backdrop);
    }
  }

  for (const prop of world.cityProps) {
    prop.position.z -= amount * (prop.userData.speedFactor ?? 1);

    if (prop.position.z < -42) {
      recycleCityRoadsideProp(prop);
    }

    if (Math.random() < 0.015) {
      prop.traverse((child) => {
        if (child.material && child.material.emissive) {
          child.material.emissiveIntensity = Math.random() > 0.2 ? 0.45 : 0.05;
        }
      });
    }
  }

  for (const backdrop of world.cityBackdrop) {
    backdrop.position.z -= amount * backdrop.userData.speedFactor;

    if (backdrop.position.z < -68) {
      recycleCityBackdrop(backdrop);
    }
  }

  for (const dune of world.dunes) {
    dune.position.z -= amount;

    if (dune.position.z < -40) {
      recycleEnvironmentObject(dune, false, 10, 80, 240, 300);
    }
  }

  for (const boulder of world.boulders) {
    boulder.position.z -= amount;

    if (boulder.position.z < -40) {
      recycleEnvironmentObject(boulder, false, 10, 85, 240, 320);
    }
  }

  for (const far of world.farBackdrop) {
    far.position.z -= amount * far.userData.speedFactor;

    if (far.position.z < -100) {
      recycleFarBackdrop(far);
    }
  }

  for (const detail of world.roadDetails) {
    detail.position.z -= amount;

    if (detail.position.z < -20) {
      recycleRoadDetail(detail);
    }
  }
}

function scrollTextureSet(world, prefix, amount) {
  const map = world[`${prefix}Texture`];
  if (!map) return;

  map.offset.y -= amount / 30;

  const bumpMap = world[`${prefix}BumpTexture`];
  const roughnessMap = world[`${prefix}RoughnessTexture`];

  if (bumpMap) bumpMap.offset.y -= amount / 30;
  if (roughnessMap) roughnessMap.offset.y -= amount / 30;
}

export function recycleCityRoadsideProp(prop, initial = false) {
  const side = Math.random() > 0.5 ? 1 : -1;
  const dist = prop.userData.isCurb ? 8.5 : 12 + Math.random() * 24;

  prop.position.set(
    side * dist,
    0,
    (initial ? Math.random() * 220 : 220) + Math.random() * 90,
  );

  prop.rotation.y = prop.userData.isCurb ? 0 : side === 1 ? -0.04 : 0.04;
}

export function recycleRoadsideProp(prop, initial = false) {
  if (prop.userData.isGantry) {
    prop.position.set(
      0,
      0,
      (initial ? Math.random() * 240 : 200) + Math.random() * 120,
    );

    prop.rotation.set(0, 0, 0);
    return;
  }

  const side = Math.random() > 0.5 ? 1 : -1;
  const dist = 12 + Math.random() * 38;

  prop.position.set(
    side * dist,
    0,
    (initial ? Math.random() * 240 : 200) + Math.random() * 120,
  );

  prop.rotation.y =
    (side === 1 ? -1 : 1) * (0.1 + Math.random() * 0.4) + (Math.random() - 0.5) * 0.2;

  prop.rotation.x = (Math.random() - 0.5) * 0.08;
  prop.rotation.z = (Math.random() - 0.5) * 0.08;
}
