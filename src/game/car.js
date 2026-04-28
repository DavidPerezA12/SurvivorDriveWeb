import * as THREE from "three";

export function stateColor(state, equipmentCatalog) {
  return (
    equipmentCatalog.chassis.find((item) => item.id === state.equipment.chassis)
      ?.color ?? "#d8b36b"
  );
}

export function createCar(world, state, equipmentCatalog) {
  const group = new THREE.Group();

  const mainHull = new THREE.Group();
  const chassisName = state.equipment.chassis.id || "interceptor";

  // Use GLTF model if loaded
  if (world.assets.models["player"]) {
    const clone = world.assets.models["player"].clone();
    // Re-assign wheels array by finding objects named 'wheel' or creating dummy ones
    const wheels = [];
    clone.traverse((child) => {
      if (child.isMesh && child.name.toLowerCase().includes("wheel")) {
        wheels.push(child);
      }
    });

    mainHull.add(clone);
    group.userData.hull = mainHull;

    // Provide dummy or extracted wheels logic so simulation doesn't crash
    if (wheels.length >= 4) {
      group.userData.wheels = wheels.map((w) => {
        w.userData = {
          steerable: w.position.z > 0,
          defaultX: w.position.x,
          defaultY: w.position.y,
          defaultZ: w.position.z,
        };
        return w;
      });
    } else {
      group.userData.wheels = [
        new THREE.Group(),
        new THREE.Group(),
        new THREE.Group(),
        new THREE.Group(),
      ].map((w, i) => {
        w.userData = { steerable: i < 2 };
        return w;
      });
    }

    // Add dummy ram logic to avoid crash
    const ram = new THREE.Group();
    mainHull.add(ram);
    group.userData.ram = ram;

    // Faros (Headlights)
    const headlights = [];
    for (let i = 0; i < 2; i++) {
      const light = new THREE.SpotLight("#fffdeb", 0, 18, Math.PI / 4, 0.5, 1);
      light.position.set(i === 0 ? 0.6 : -0.6, 0.5, 1.8);
      light.target.position.set(i === 0 ? 0.8 : -0.8, 0.4, 10);
      group.add(light);
      group.add(light.target);
      headlights.push(light);
    }
    group.userData.headlights = headlights;

    // Luces de freno (Brake lights)
    const brakeLights = [];
    for (let i = 0; i < 2; i++) {
      const bLight = new THREE.PointLight("#ff0000", 0, 3);
      bLight.position.set(i === 0 ? 0.7 : -0.7, 0.6, -1.8);
      group.add(bLight);
      brakeLights.push(bLight);
    }
    group.userData.brakeLights = brakeLights;

    group.add(mainHull);
    return group;
  }

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: stateColor(state, equipmentCatalog),
    metalness: 0.7,
    roughness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMap: world.envTexture,
    envMapIntensity: 0.7,
  });

  const darkMetal = new THREE.MeshStandardMaterial({
    color: "#111",
    roughness: 0.8,
    metalness: 0.7,
    envMap: world.envTexture,
    envMapIntensity: 0.4,
  });
  const carbonFiber = new THREE.MeshStandardMaterial({
    color: "#1a1a1c",
    roughness: 0.5,
    metalness: 0.6,
    envMap: world.envTexture,
    envMapIntensity: 0.5,
  });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: "#010101",
    metalness: 0.2,
    roughness: 0.0,
    transmission: 0.98,
    ior: 1.6,
    transparent: true,
    envMap: world.envTexture,
    envMapIntensity: 0.7,
  });
  const engineGlow = new THREE.MeshStandardMaterial({
    color: "#ffaa00",
    emissive: "#ff4400",
    emissiveIntensity: 4.0,
  });
  const tailLampMaterial = new THREE.MeshStandardMaterial({
    color: "#aa0000",
    emissive: "#ff0500",
    emissiveIntensity: 5.0,
  });
  const drlMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#ddffff",
    emissiveIntensity: 6.0,
  });

  world.carMaterials = [bodyMaterial];

  if (chassisName === "scout") {
    // BUGGY / SCOUT (Detailed, rugged off-road buggy)
    const bodyGeo = new THREE.BoxGeometry(1.6, 0.45, 3.6);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.position.y = 0.55;
    body.castShadow = true;
    mainHull.add(body);

    const cabinGeo = new THREE.BoxGeometry(1.3, 0.5, 1.4);
    const cabin = new THREE.Mesh(cabinGeo, carbonFiber);
    cabin.position.set(0, 1.0, -0.1);
    cabin.castShadow = true;
    mainHull.add(cabin);

    // Roll cage structure (detailed)
    const rollCageGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.0, 8);
    const rollCageMat = new THREE.MeshStandardMaterial({
      color: "#111",
      roughness: 0.7,
    });
    const rcTop = new THREE.Mesh(rollCageGeo, rollCageMat);
    rcTop.rotation.z = Math.PI / 2;
    rcTop.position.set(0, 1.5, -0.1);
    mainHull.add(rcTop);

    const rcLeft1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.0),
      rollCageMat,
    );
    rcLeft1.position.set(0.65, 1.1, -0.8);
    rcLeft1.rotation.x = -0.3;
    mainHull.add(rcLeft1);

    const rcRight1 = rcLeft1.clone();
    rcRight1.position.set(-0.65, 1.1, -0.8);
    mainHull.add(rcRight1);

    const rcLeft2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.2),
      rollCageMat,
    );
    rcLeft2.position.set(0.65, 1.0, 0.6);
    rcLeft2.rotation.x = 0.5;
    mainHull.add(rcLeft2);

    const rcRight2 = rcLeft2.clone();
    rcRight2.position.set(-0.65, 1.0, 0.6);
    mainHull.add(rcRight2);

    // Rear Engine Block
    const engineBlock = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.55, 0.9),
      darkMetal,
    );
    engineBlock.position.set(0, 0.75, -1.6);
    mainHull.add(engineBlock);

    // Exhaust pipes pointing upwards
    const exGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.6, 8);
    const ex1 = new THREE.Mesh(exGeo, darkMetal);
    ex1.position.set(0.3, 1.1, -1.8);
    ex1.rotation.x = -0.2;
    mainHull.add(ex1);
    const ex2 = new THREE.Mesh(exGeo, darkMetal);
    ex2.position.set(-0.3, 1.1, -1.8);
    ex2.rotation.x = -0.2;
    mainHull.add(ex2);

    // Inner glowing cores
    const glowGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8);
    const glow1 = new THREE.Mesh(glowGeo, engineGlow);
    glow1.position.set(0.3, 1.4, -1.85);
    glow1.rotation.x = -0.2;
    mainHull.add(glow1);
    const glow2 = new THREE.Mesh(glowGeo, engineGlow);
    glow2.position.set(-0.3, 1.4, -1.85);
    glow2.rotation.x = -0.2;
    mainHull.add(glow2);

    // Suspension struts
    const strutGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.2);
    const strutMat = new THREE.MeshStandardMaterial({
      color: "#aa0000",
      metalness: 0.5,
    });
    for (let i = 0; i < 4; i++) {
      const strut = new THREE.Mesh(strutGeo, strutMat);
      const x = i % 2 === 0 ? 0.6 : -0.6;
      const z = i < 2 ? 1.4 : -1.4;
      strut.position.set(x, 0.5, z);
      strut.rotation.z = i % 2 === 0 ? -0.4 : 0.4;
      mainHull.add(strut);
    }
  } else if (chassisName === "hauler") {
    // ARMORED TRUCK / HAULER (Heavy, detailed rig)
    const bodyGeo = new THREE.BoxGeometry(2.4, 0.85, 4.8);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.position.y = 0.8;
    body.castShadow = true;
    mainHull.add(body);

    const cabinGeo = new THREE.BoxGeometry(2.1, 1.0, 1.8);
    const cabin = new THREE.Mesh(cabinGeo, darkMetal);
    cabin.position.set(0, 1.7, 0.8);
    cabin.castShadow = true;
    mainHull.add(cabin);

    // Armored Window slits instead of full glass
    for (let i = 0; i < 3; i++) {
      const windowSlit = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.25, 1.85),
        glassMaterial,
      );
      windowSlit.position.set((i - 1) * 0.65, 1.7, 0.8);
      mainHull.add(windowSlit);
    }

    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 2.6), darkMetal);
    bed.position.set(0, 1.45, -1.1);
    mainHull.add(bed);

    // Smokestacks (Exhausts)
    const stackGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.8);
    const stack1 = new THREE.Mesh(stackGeo, darkMetal);
    stack1.position.set(1.2, 1.8, 0);
    mainHull.add(stack1);
    const stack2 = stack1.clone();
    stack2.position.set(-1.2, 1.8, 0);
    mainHull.add(stack2);

    // Exhaust tips
    const tipGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.4);
    const tip1 = new THREE.Mesh(tipGeo, engineGlow);
    tip1.position.set(1.2, 2.7, 0);
    mainHull.add(tip1);
    const tip2 = tip1.clone();
    tip2.position.set(-1.2, 2.7, 0);
    mainHull.add(tip2);

    // Side steps / armor skirts
    const skirtGeo = new THREE.BoxGeometry(2.6, 0.2, 2.4);
    const skirt = new THREE.Mesh(skirtGeo, carbonFiber);
    skirt.position.set(0, 0.4, 0);
    mainHull.add(skirt);

    // Tail lights
    const tL = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.2, 0.1),
      tailLampMaterial,
    );
    tL.position.set(0.8, 0.8, -2.45);
    mainHull.add(tL);
    const tR = tL.clone();
    tR.position.set(-0.8, 0.8, -2.45);
    mainHull.add(tR);
  } else {
    // INTERCEPTOR (Sleek, aggressive muscle car)
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(2.0, 0.2);
    bodyShape.lineTo(2.0, 0.65);
    bodyShape.lineTo(0.8, 0.85); // Hood curve
    bodyShape.lineTo(-1.0, 0.95); // Trunk line
    bodyShape.lineTo(-2.2, 0.8); // Rear drop
    bodyShape.lineTo(-2.2, 0.3);
    bodyShape.lineTo(-1.8, 0.2);
    bodyShape.lineTo(2.0, 0.2);
    const extrudeSettings = {
      depth: 1.8,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 2,
      bevelSize: 0.1,
      bevelThickness: 0.1,
    };
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
    bodyGeo.translate(0, 0, -0.9);
    bodyGeo.rotateY(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    mainHull.add(body);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.5, 1.8),
      glassMaterial,
    );
    cabin.position.set(0, 1.05, -0.1);
    mainHull.add(cabin);

    // Aggressive spoiler
    const spoilerWing = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.08, 0.5),
      carbonFiber,
    );
    spoilerWing.position.set(0, 1.3, -2.1);
    mainHull.add(spoilerWing);

    // Angled struts for spoiler
    const strutGeo = new THREE.BoxGeometry(0.08, 0.4, 0.3);
    const strutL = new THREE.Mesh(strutGeo, carbonFiber);
    strutL.position.set(0.8, 1.05, -2.0);
    strutL.rotation.x = -0.2;
    mainHull.add(strutL);
    const strutR = strutL.clone();
    strutR.position.set(-0.8, 1.05, -2.0);
    mainHull.add(strutR);

    // Front intake grill
    const grillGeo = new THREE.BoxGeometry(1.4, 0.2, 0.1);
    const grill = new THREE.Mesh(grillGeo, darkMetal);
    grill.position.set(0, 0.4, 2.05);
    mainHull.add(grill);

    // Dual exhausts
    const exGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.3);
    const ex1 = new THREE.Mesh(exGeo, darkMetal);
    ex1.position.set(0.6, 0.35, -2.15);
    ex1.rotation.x = Math.PI / 2;
    mainHull.add(ex1);

    const ex2 = ex1.clone();
    ex2.position.set(-0.6, 0.35, -2.15);
    mainHull.add(ex2);

    // Tail lights
    const tlGeo = new THREE.BoxGeometry(0.5, 0.15, 0.1);
    const tL = new THREE.Mesh(tlGeo, tailLampMaterial);
    tL.position.set(0.6, 0.7, -2.18);
    mainHull.add(tL);
    const tR = tL.clone();
    tR.position.set(-0.6, 0.7, -2.18);
    mainHull.add(tR);
  }
  // Ram/Rig (Attached to front of any chassis)
  const ram = new THREE.Group();
  const ramBar = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.3, 0.4),
    carbonFiber,
  );
  ramBar.position.set(
    0,
    0.4,
    chassisName === "hauler" ? 2.6 : chassisName === "scout" ? 2.0 : 2.2,
  );
  ramBar.castShadow = true;
  ram.add(ramBar);
  const drlL = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.1, 0.45),
    drlMaterial,
  );
  drlL.position.set(
    0.8,
    0.4,
    chassisName === "hauler" ? 2.6 : chassisName === "scout" ? 2.0 : 2.2,
  );
  ram.add(drlL);
  const drlR = drlL.clone();
  drlR.position.set(
    -0.8,
    0.4,
    chassisName === "hauler" ? 2.6 : chassisName === "scout" ? 2.0 : 2.2,
  );
  ram.add(drlR);
  mainHull.add(ram);
  group.userData.ram = ram;

  group.add(mainHull);
  group.userData.hull = mainHull;

  // Wheels (Placed generically enough for all chassis)
  const wheelZFront = chassisName === "hauler" ? 1.8 : 1.4;
  const wheelZRear = chassisName === "hauler" ? -1.8 : -1.4;
  const wheelX = chassisName === "hauler" ? 1.3 : 1.1;
  const wheelRad =
    chassisName === "hauler" ? 0.45 : chassisName === "scout" ? 0.4 : 0.35;

  const wheelsSpec = [
    [wheelX, wheelRad, wheelZFront, true],
    [-wheelX, wheelRad, wheelZFront, true],
    [wheelX, wheelRad, wheelZRear, false],
    [-wheelX, wheelRad, wheelZRear, false],
  ];

  const tireMat = new THREE.MeshStandardMaterial({
    color: "#111",
    roughness: 0.9,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: "#444",
    metalness: 0.8,
    roughness: 0.2,
  });

  group.userData.wheels = wheelsSpec.map(([x, y, z, steerable], i) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, y, z);

    const rollGroup = new THREE.Group();
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRad, wheelRad, 0.3, 16),
      tireMat,
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    rollGroup.add(tire);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRad * 0.6, wheelRad * 0.6, 0.32, 8),
      rimMat,
    );
    rim.rotation.z = Math.PI / 2;
    rollGroup.add(rim);

    // Rim spokes (radial bars for detail)
    const spokeCount = 5 + Math.floor(Math.random() * 3);
    const spokeMat = new THREE.MeshStandardMaterial({ color: "#555", metalness: 0.6, roughness: 0.3 });
    for (let s = 0; s < spokeCount; s++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(wheelRad * 0.5, 0.04, 0.04),
        spokeMat,
      );
      spoke.position.x = wheelRad * 0.3;
      spoke.rotation.z = (s / spokeCount) * Math.PI * 2;
      rim.add(spoke);
    }
    // center cap
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRad * 0.15, wheelRad * 0.15, 0.33, 8),
      rimMat,
    );
    cap.rotation.z = Math.PI / 2;
    rollGroup.add(cap);

    wheelGroup.add(rollGroup);
    group.add(wheelGroup);

    wheelGroup.userData = {
      steerable,
      roll: rollGroup,
      defaultX: x,
      defaultY: y,
      defaultZ: z,
    };
    return wheelGroup;
  });

  // Faros (Headlights)
  const headlights = [];
  for (let i = 0; i < 2; i++) {
    const light = new THREE.SpotLight("#fffdeb", 0, 18, Math.PI / 4, 0.5, 1);
    const lx = (i === 0 ? 0.6 : -0.6) * (chassisName === "hauler" ? 1.4 : 1);
    light.position.set(lx, 0.6, 2);
    light.target.position.set(lx * 1.2, 0.5, 10);
    group.add(light);
    group.add(light.target);
    headlights.push(light);
  }
  group.userData.headlights = headlights;

  // Luces de freno (Brake lights)
  const brakeLights = [];
  for (let i = 0; i < 2; i++) {
    const bLight = new THREE.PointLight("#ff0000", 0, 3);
    const lx = (i === 0 ? 0.7 : -0.7) * (chassisName === "hauler" ? 1.4 : 1);
    bLight.position.set(lx, 0.7, -2);
    group.add(bLight);
    brakeLights.push(bLight);
  }
  group.userData.brakeLights = brakeLights;

  return group;
}

export function rebuildCarAppearance(world, state, equipmentCatalog) {
  const oldCar = world.car;
  const newCar = createCar(world, state, equipmentCatalog);

  newCar.position.copy(oldCar.position);
  newCar.rotation.copy(oldCar.rotation);

  world.scene.remove(oldCar);
  world.scene.add(newCar);
  world.car = newCar;

  const rig = state.equipment.rig;
  world.car.userData.ram.scale.x =
    rig === "tank" ? 1.25 : rig === "booster" ? 0.9 : 1.0;
  world.car.userData.ram.scale.z = rig === "ram" ? 1.2 : 1.0;
}
