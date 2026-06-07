import * as THREE from 'three';
import type { Entity, Upgrades } from '../game/types';
import { materials } from './materials';

function enableShadows(object: THREE.Object3D, cast: boolean, receive: boolean): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.material instanceof THREE.Material && child.material.transparent) {
        return;
      }
      if (child.material === materials.projectile || child.material === materials.lightBulb || child.material === materials.glowRed) {
        return;
      }
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

export function createCarMesh(): THREE.Group {
  const group = new THREE.Group();

  // 1. Sleek muscle car body / chassis
  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 2.5), materials.carBody);
  body.position.y = 0.42;

  // Sloped hood / nose
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.28, 0.8), materials.carBody);
  nose.position.set(0, 0.48, 0.85);

  // Sloped cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.42, 1.0), materials.carGlass);
  cabin.position.set(0, 0.75, -0.2);

  // Spoiler
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 0.22), materials.carBody);
  spoiler.position.set(0, 0.8, -1.1);

  const spoilerPostL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), materials.metal);
  spoilerPostL.position.set(-0.6, 0.61, -1.1);

  const spoilerPostR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), materials.metal);
  spoilerPostR.position.set(0.6, 0.61, -1.1);

  // Headlights
  const lightL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.04), materials.lightBulb);
  lightL.position.set(-0.45, 0.48, 1.25);

  const lightR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.04), materials.lightBulb);
  lightR.position.set(0.45, 0.48, 1.25);

  // Volumetric Headlight Beams
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: '#fffae0',
    transparent: true,
    opacity: 0.12,
    depthWrite: false
  });

  const beamL = new THREE.Mesh(new THREE.ConeGeometry(0.38, 9.0, 8), beamMaterial);
  beamL.rotation.x = -Math.PI / 2;
  beamL.position.set(-0.45, 0.48, 5.76); // center of 9m cone is offset by 4.5m forward

  const beamR = new THREE.Mesh(new THREE.ConeGeometry(0.38, 9.0, 8), beamMaterial);
  beamR.rotation.x = -Math.PI / 2;
  beamR.position.set(0.45, 0.48, 5.76);

  group.add(body, nose, cabin, spoiler, spoilerPostL, spoilerPostR, lightL, lightR, beamL, beamR);

  // 2. Chunky wheels / rims
  for (const x of [-0.85, 0.85]) {
    for (const z of [-0.8, 0.8]) {
      const wheelGroup = new THREE.Group();
      wheelGroup.name = 'wheel';
      
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.26, 16), materials.tire);
      tire.rotation.z = Math.PI / 2;

      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.28, 8), materials.metal);
      rim.rotation.z = Math.PI / 2;

      wheelGroup.add(tire, rim);
      wheelGroup.position.set(x, 0.32, z);
      group.add(wheelGroup);
    }
  }

  // 3. Armor upgrade parts
  const armorGroup = new THREE.Group();
  armorGroup.name = 'armor';

  // Front plow
  const plow = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.5, 0.25), materials.metal);
  plow.position.set(0, 0.35, 1.35);
  plow.rotation.x = 0.25;

  // Side armor panels (left/right)
  const leftArmor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 1.5), materials.metal);
  leftArmor.position.set(-0.8, 0.45, -0.1);

  const rightArmor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 1.5), materials.metal);
  rightArmor.position.set(0.8, 0.45, -0.1);

  armorGroup.add(plow, leftArmor, rightArmor);
  armorGroup.visible = false;
  group.add(armorGroup);

  // 4. Weapon upgrade parts
  const weaponGroup = new THREE.Group();
  weaponGroup.name = 'weapon';

  // Turret base
  const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.12, 12), materials.metal);
  turretBase.position.set(0, 0.95, -0.2);

  // Dual gun barrels
  const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), materials.metal);
  barrelL.rotation.x = Math.PI / 2;
  barrelL.position.set(-0.12, 1.05, 0.1);

  const barrelR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), materials.metal);
  barrelR.rotation.x = Math.PI / 2;
  barrelR.position.set(0.12, 1.05, 0.1);

  // Tip glows
  const tipL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), materials.projectile);
  tipL.rotation.x = Math.PI / 2;
  tipL.position.set(-0.12, 1.05, 0.42);

  const tipR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), materials.projectile);
  tipR.rotation.x = Math.PI / 2;
  tipR.position.set(0.12, 1.05, 0.42);

  weaponGroup.add(turretBase, barrelL, barrelR, tipL, tipR);
  weaponGroup.visible = false;
  group.add(weaponGroup);

  enableShadows(group, true, true);

  return group;
}

export function updateCarMeshUpgrades(carMesh: THREE.Group, upgrades: Upgrades): void {
  const armorGroup = carMesh.getObjectByName('armor');
  if (armorGroup) {
    armorGroup.visible = upgrades.armor > 0;
    const scaleFactor = 1.0 + (upgrades.armor - 1) * 0.12;
    armorGroup.scale.set(1.0, Math.min(1.4, scaleFactor), Math.min(1.4, scaleFactor));
  }

  const weaponGroup = carMesh.getObjectByName('weapon');
  if (weaponGroup) {
    weaponGroup.visible = upgrades.weapon > 0;
    const scaleFactor = 1.0 + (upgrades.weapon - 1) * 0.12;
    weaponGroup.scale.set(Math.min(1.4, scaleFactor), Math.min(1.4, scaleFactor), Math.min(1.4, scaleFactor));
  }
}

export function createRoadMesh(): THREE.Group {
  const group = new THREE.Group();
  const scrollLayer = new THREE.Group();
  const roadsideLayer = new THREE.Group();

  scrollLayer.name = 'road-scroll-layer';
  roadsideLayer.name = 'roadside-layer';
  group.add(scrollLayer, roadsideLayer);

  // 1. Asphalt main road (spans from z = -46 to 174)
  const road = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.12, 220), materials.asphalt);
  road.position.set(0, -0.06, 64);
  group.add(road);

  // Yellow border lines
  const borderL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 220), materials.warning);
  borderL.position.set(-5.9, 0.01, 64);

  const borderR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 220), materials.warning);
  borderR.position.set(5.9, 0.01, 64);

  group.add(borderL, borderR);

  // 2. Dash lane markings (tile repeat 13m)
  for (const x of [-2, 2]) {
    for (let i = 0; i < 17; i += 1) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 5.8), materials.lane);
      stripe.position.set(x, 0.01, -40 + i * 13);
      scrollLayer.add(stripe);
    }
  }

  // 3. Dirt shoulders
  for (const x of [-8.7, 8.7]) {
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 220), materials.dirt);
    shoulder.position.set(x, -0.1, 64);
    group.add(shoulder);
  }

  // 4. Infinite Fence along the outer shoulders
  for (let i = 0; i < 18; i += 1) {
    const zPos = -44 + i * 13;

    for (const x of [-10.4, 10.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), materials.rust);
      post.position.set(x, 0.35, zPos);
      roadsideLayer.add(post);

      if (i < 17) {
        const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 13.0), materials.rust);
        railTop.position.set(x, 0.65, zPos + 6.5);
        
        const railBot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 13.0), materials.rust);
        railBot.position.set(x, 0.35, zPos + 6.5);

        roadsideLayer.add(railTop, railBot);
      }
    }
  }

  // 5. Streetlights (spaced every 26m, alternating sides)
  for (let i = 0; i < 9; i += 1) {
    const leftSide = i % 2 === 0;
    const xPos = leftSide ? -7.0 : 7.0;
    const zPos = -35 + i * 26;

    const streetlight = new THREE.Group();
    
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6), materials.metal);
    pole.position.y = 2.1;
    
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), materials.metal);
    arm.position.set(leftSide ? 0.5 : -0.5, 4.15, 0);
    
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.15), materials.lightBulb);
    bulb.position.set(leftSide ? 1.0 : -1.0, 4.08, 0);

    streetlight.add(pole, arm, bulb);
    streetlight.position.set(xPos, 0, zPos);
    roadsideLayer.add(streetlight);
  }

  // 6. Rusted Signs (spaced every 39m, alternating sides)
  for (let i = 0; i < 6; i += 1) {
    const leftSide = i % 2 === 1;
    const xPos = leftSide ? -7.5 : 7.5;
    const zPos = -30 + i * 39;

    const signGroup = new THREE.Group();

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.0, 4), materials.metal);
    post.position.y = 1.0;

    const signPlate = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.03), i % 2 === 0 ? materials.warning : materials.danger);
    signPlate.position.set(0, 1.8, 0);
    signPlate.rotation.z = Math.PI / 4;

    signGroup.add(post, signPlate);
    signGroup.position.set(xPos, 0, zPos);
    signGroup.rotation.set(0.08, 0.15, leftSide ? 0.08 : -0.08);
    roadsideLayer.add(signGroup);
  }

  // 7. Small Debris on shoulders
  for (let i = 0; i < 12; i += 1) {
    const leftSide = i % 3 === 0;
    const xPos = leftSide ? -7.8 : 7.8;
    const zPos = -40 + i * 19;

    if (i % 2 === 0) {
      const stack = new THREE.Group();
      for (let h = 0; h < 3; h++) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 8), materials.tire);
        tire.position.set(Math.sin(h) * 0.04, 0.06 + h * 0.11, Math.cos(h) * 0.04);
        tire.rotation.set(0.05 * h, 0.2 * h, 0.05 * h);
        stack.add(tire);
      }
      stack.position.set(xPos + (leftSide ? -0.2 : 0.2), 0, zPos);
      roadsideLayer.add(stack);
    } else {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.14, 0.32, 6), materials.warning);
      cone.position.set(xPos, 0.16, zPos);
      roadsideLayer.add(cone);
    }
  }

  // Enable shadows for everything in the road mesh
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (
        child.material === materials.asphalt ||
        child.material === materials.lane ||
        child.material === materials.dirt ||
        child.position.x === -5.9 ||
        child.position.x === 5.9
      ) {
        child.receiveShadow = true;
      } else {
        if (child.material === materials.lightBulb) {
          return;
        }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    }
  });

  return group;
}

export function createEntityMesh(entity: Entity): THREE.Object3D {
  const mesh = createEntityMeshRaw(entity);
  enableShadows(mesh, true, true);
  return mesh;
}

function createEntityMeshRaw(entity: Entity): THREE.Object3D {
  switch (entity.type) {
    case 'abandonedCar':
      return abandonedCarMesh();
    case 'barricade':
      return barricadeMesh(false);
    case 'lightBarricade':
      return barricadeMesh(true);
    case 'barrel':
      return barrelMesh();
    case 'mine':
      return mineMesh();
    case 'crack':
      return crackMesh();
    case 'zombie':
      return zombieMesh();
    case 'ammo':
      return boxPickupMesh(materials.ammo);
    case 'scrap':
      return scrapMesh();
    case 'parts':
      return toolboxMesh();
    case 'bullet':
      return new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), materials.projectile);
    case 'explosion':
      return explosionMesh(entity.radius);
  }
}

function explosionMesh(radius: number): THREE.Group {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 12), materials.explosion);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.8, 0.08, 8, 24),
    materials.warning
  );

  core.scale.y = 0.32;
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  group.add(core, ring);

  return group;
}

function abandonedCarMesh(): THREE.Group {
  const group = new THREE.Group();
  
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 2.3), materials.rust);
  body.position.y = 0.36;

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.28, 0.75), materials.rust);
  nose.position.set(0, 0.42, 0.78);

  const pillarFL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), materials.rust);
  pillarFL.position.set(-0.5, 0.65, 0.25);

  const pillarFR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), materials.rust);
  pillarFR.position.set(0.5, 0.65, 0.25);

  const pillarBL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), materials.rust);
  pillarBL.position.set(-0.5, 0.65, -0.65);

  const pillarBR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), materials.rust);
  pillarBR.position.set(0.5, 0.65, -0.65);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.06, 1.1), materials.rust);
  roof.position.set(0, 0.88, -0.2);

  group.add(body, nose, pillarFL, pillarFR, pillarBL, pillarBR, roof);

  const tireFR = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.24, 10), materials.tire);
  tireFR.rotation.z = Math.PI / 2;
  tireFR.position.set(0.85, 0.3, 0.8);

  const tireBL = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.24, 10), materials.tire);
  tireBL.rotation.z = Math.PI / 2;
  tireBL.position.set(-0.85, 0.3, -0.8);

  const tireBR = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.24, 10), materials.tire);
  tireBR.rotation.z = Math.PI / 2;
  tireBR.position.set(0.85, 0.3, -0.8);

  group.add(tireFR, tireBL, tireBR);
  group.rotation.set(0.06, Math.PI * 0.04, -0.06);

  return group;
}

function barricadeMesh(light: boolean): THREE.Group {
  const group = new THREE.Group();
  const material = light ? materials.warning : materials.metal;

  const baseL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.65), materials.metal);
  baseL.position.set(-1.2, 0.11, 0);

  const baseR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.65), materials.metal);
  baseR.position.set(1.2, 0.11, 0);

  const postL1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.12), materials.metal);
  postL1.position.set(-1.2, 0.58, -0.15);
  postL1.rotation.x = 0.2;

  const postL2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.12), materials.metal);
  postL2.position.set(-1.2, 0.58, 0.15);
  postL2.rotation.x = -0.2;

  const postR1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.12), materials.metal);
  postR1.position.set(1.2, 0.58, -0.15);
  postR1.rotation.x = 0.2;

  const postR2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.12), materials.metal);
  postR2.position.set(1.2, 0.58, 0.15);
  postR2.rotation.x = -0.2;

  group.add(baseL, baseR, postL1, postL2, postR1, postR2);

  const railTop = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.22, 0.08), material);
  railTop.position.set(0, 0.88, 0);

  const railBot = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.18, 0.08), material);
  railBot.position.set(0, 0.44, 0);

  group.add(railTop, railBot);

  const stripeMaterial = light ? materials.tire : materials.warning;
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.02), stripeMaterial);
    stripe.position.set(-1.0 + i * 0.4, 0.88, 0.05);
    stripe.rotation.z = -0.55;
    group.add(stripe);
  }

  return group;
}

function barrelMesh(): THREE.Object3D {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.0, 12), materials.danger);
  body.position.y = 0.5;
  group.add(body);

  const ringTop = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), materials.tire);
  ringTop.position.y = 0.76;

  const ringBot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), materials.tire);
  ringBot.position.y = 0.24;

  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.18, 12), materials.warning);
  stripe.position.y = 0.5;

  group.add(ringTop, ringBot, stripe);

  return group;
}

function mineMesh(): THREE.Object3D {
  const group = new THREE.Group();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.08, 12), materials.metal);
  base.position.y = 0.04;

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.08, 12), materials.metal);
  cap.position.y = 0.1;

  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8), materials.glowRed);
  button.position.y = 0.15;

  group.add(base, cap, button);

  for (let i = 0; i < 4; i++) {
    const prong = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.18), materials.metal);
    const angle = (i * Math.PI) / 2;
    prong.position.set(Math.cos(angle) * 0.48, 0.06, Math.sin(angle) * 0.48);
    prong.rotation.y = -angle;
    group.add(prong);
  }

  return group;
}

function crackMesh(): THREE.Object3D {
  const group = new THREE.Group();

  const base1 = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.03, 1.1), new THREE.MeshBasicMaterial({ color: '#050608' }));
  base1.position.y = 0.015;

  const base2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.03, 1.2), new THREE.MeshBasicMaterial({ color: '#050608' }));
  base2.position.y = 0.015;
  base2.rotation.y = 0.22;

  const base3 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 1.3), new THREE.MeshBasicMaterial({ color: '#050608' }));
  base3.position.y = 0.015;
  base3.rotation.y = -0.22;

  group.add(base1, base2, base3);

  const debrisMaterial = materials.metal;
  for (let i = 0; i < 5; i++) {
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.18 + (i % 2) * 0.1, 0.08, 0.18 + (i % 3) * 0.08),
      debrisMaterial
    );
    const angle = (i / 5) * Math.PI * 2 + 0.3;
    chunk.position.set(Math.cos(angle) * 1.4, 0.04, Math.sin(angle) * 0.6);
    chunk.rotation.set(Math.random() * 0.3, Math.random() * 0.5, Math.random() * 0.3);
    group.add(chunk);
  }

  return group;
}

function zombieMesh(): THREE.Group {
  const group = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.65, 0.26), materials.zombie);
  torso.position.y = 0.32;
  torso.rotation.x = 0.12;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), materials.zombie);
  head.position.set(0, 0.76, 0.05);
  head.rotation.x = 0.18;
  group.add(head);

  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), materials.glowRed);
  eyeL.position.set(-0.07, 0.78, 0.2);
  eyeL.rotation.x = 0.18;

  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), materials.glowRed);
  eyeR.position.set(0.07, 0.78, 0.2);
  eyeR.rotation.x = 0.18;
  group.add(eyeL, eyeR);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.1), materials.zombie);
  armL.rotation.set(Math.PI / 2, 0, -0.1);
  armL.position.set(-0.24, 0.5, 0.22);
  armL.name = 'armL';

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.1), materials.zombie);
  armR.rotation.set(Math.PI / 2, 0, 0.1);
  armR.position.set(0.24, 0.5, 0.22);
  armR.name = 'armR';

  group.add(armL, armR);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.12), materials.zombie);
  legL.position.set(-0.12, -0.14, 0.04);
  legL.rotation.x = 0.22;
  legL.name = 'legL';

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.12), materials.zombie);
  legR.position.set(0.12, -0.14, -0.04);
  legR.rotation.x = -0.22;
  legR.name = 'legR';

  group.add(legL, legR);

  return group;
}

function canisterMesh(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.78, 0.36), material);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.16), materials.metal);
  body.position.y = 0.42;
  handle.position.y = 0.86;
  group.add(body, handle);
  return group;
}

function boxPickupMesh(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.38, 0.48), material);
  box.position.y = -0.05;

  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.52), material);
  lid.position.y = 0.18;

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.04), materials.metal);
  handle.position.y = 0.24;

  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.03), materials.metal);
  latch.position.set(0, 0.08, 0.25);

  group.add(box, lid, handle, latch);

  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.53), materials.warning);
  marker.position.set(-0.16, 0.18, 0);
  group.add(marker);

  return group;
}

function toolboxMesh(): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.36, 0.44), materials.repair);
  body.position.y = -0.05;

  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.03), materials.metal);
  latch.position.set(0, 0.05, 0.23);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.04), materials.metal);
  handle.position.y = 0.18;

  group.add(body, latch, handle);

  const wrenchHandle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.02), materials.metal);
  wrenchHandle.position.set(0.24, 0.1, -0.1);
  wrenchHandle.rotation.set(0.35, 0.2, -0.45);

  const wrenchHead = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), materials.metal);
  wrenchHead.position.set(0.24, 0.23, -0.1);
  wrenchHead.rotation.set(0.35, 0.2, -0.45);

  group.add(wrenchHandle, wrenchHead);

  return group;
}

function scrapMesh(): THREE.Group {
  const group = new THREE.Group();

  const gearGroup = new THREE.Group();
  const gearBase = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 8), materials.scrap);
  gearBase.rotation.x = Math.PI / 2;
  gearGroup.add(gearBase);

  for (let i = 0; i < 6; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.1), materials.scrap);
    const angle = (i * Math.PI) / 3;
    tooth.position.set(Math.cos(angle) * 0.25, Math.sin(angle) * 0.25, 0);
    tooth.rotation.z = angle;
    gearGroup.add(tooth);
  }
  gearGroup.position.set(-0.16, 0.04, -0.1);
  gearGroup.rotation.set(0.2, 0.4, 0.1);
  group.add(gearGroup);

  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6), materials.scrap);
  pipe.position.set(0.12, 0.05, 0.12);
  pipe.rotation.set(1.4, 0.2, -0.6);
  group.add(pipe);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.03, 0.32), materials.scrap);
  plate.position.set(-0.05, -0.04, 0.15);
  plate.rotation.set(-0.15, 0.8, 0.1);
  group.add(plate);

  return group;
}
