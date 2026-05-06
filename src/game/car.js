import * as THREE from "three";

export function stateColor(state, equipmentCatalog) {
  return (
    equipmentCatalog.chassis.find((item) => item.id === state.equipment.chassis)?.color ?? "#d8b36b"
  );
}

export function createCar(world, state, equipmentCatalog) {
  const group = new THREE.Group();

  const mainHull = new THREE.Group();
  const chassisName = state.equipment.chassis || "interceptor";

  // Use GLTF model if loaded
  if (world.assets.models["player"]) {
    const clone = world.assets.models["player"].clone();
    const wheels = [];
    const carColor = stateColor(state, equipmentCatalog);

    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        const name = child.name.toLowerCase();
        if (
          name.includes("body") ||
          name.includes("paint") ||
          name.includes("chassis") ||
          name.includes("car_body")
        ) {
          child.material = child.material.clone();
          child.material.color.set(carColor);
          if (child.material.isMeshPhysicalMaterial) {
            child.material.clearcoat = 1.0;
            child.material.clearcoatRoughness = 0.1;
          }
        }

        if (name.includes("wheel")) {
          wheels.push(child);
        }
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

    // --- External Visual Rig Attachments ---
    const rig = state.equipment.rig;
    const rigGroup = new THREE.Group();
    mainHull.add(rigGroup);

    if (rig === "ram") {
      const ramMat = new THREE.MeshStandardMaterial({
        color: "#222",
        metalness: 0.8,
        roughness: 0.3,
      });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 0.4), ramMat);
      beam.position.set(0, 0.35, 1.85);
      rigGroup.add(beam);
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 4), ramMat);
        spike.position.set(-0.8 + i * 0.4, 0.35, 2.1);
        spike.rotation.x = Math.PI / 2;
        rigGroup.add(spike);
      }
    } else if (rig === "tank") {
      const plateMat = new THREE.MeshStandardMaterial({
        color: "#333",
        metalness: 0.6,
        roughness: 0.7,
      });
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 2.2), plateMat);
        plate.position.set(side * 0.85, 0.7, 0);
        rigGroup.add(plate);
        // Window bars
        const bars = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.1), plateMat);
        bars.position.set(side * 0.6, 1.1, 0);
        bars.rotation.y = Math.PI / 2;
        rigGroup.add(bars);
      }
    } else if (rig === "booster") {
      const boostMat = new THREE.MeshStandardMaterial({ color: "#555", metalness: 0.9 });
      const flames = [];
      for (const side of [-1, 1]) {
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 8), boostMat);
        nozzle.position.set(side * 0.5, 0.6, -1.9);
        nozzle.rotation.x = Math.PI / 2;
        rigGroup.add(nozzle);
        // Small blue flame glow
        const flame = new THREE.PointLight("#0088ff", 0, 3);
        flame.position.set(side * 0.5, 0.6, -2.2);
        rigGroup.add(flame);
        flames.push(flame);

        const flameGeo = new THREE.ConeGeometry(0.12, 0.5, 6);
        const flameMat = new THREE.MeshBasicMaterial({
          color: "#00ccff",
          transparent: true,
          opacity: 0,
        });
        const fMesh = new THREE.Mesh(flameGeo, flameMat);
        fMesh.position.set(side * 0.5, 0.6, -2.1);
        fMesh.rotation.x = -Math.PI / 2;
        rigGroup.add(fMesh);
        flame.userData.mesh = fMesh;
      }
      group.userData.boosterFlames = flames;
    }

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
    // BUGGY / SCOUT (Detailed, rugged off-road buggy - EXAGGERATED)
    const bodyGeo = new THREE.BoxGeometry(1.8, 0.5, 3.8);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.position.y = 0.6;
    body.castShadow = true;
    mainHull.add(body);

    const fenderFL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.8), darkMetal);
    fenderFL.position.set(0.85, 0.55, 1.3);
    fenderFL.rotation.z = -0.15;
    mainHull.add(fenderFL);
    const fenderFR = fenderFL.clone();
    fenderFR.position.x = -0.85;
    fenderFR.rotation.z = 0.15;
    mainHull.add(fenderFR);
    const fenderRL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.7), darkMetal);
    fenderRL.position.set(0.85, 0.5, -1.3);
    fenderRL.rotation.z = -0.12;
    mainHull.add(fenderRL);
    const fenderRR = fenderRL.clone();
    fenderRR.position.x = -0.85;
    fenderRR.rotation.z = 0.12;
    mainHull.add(fenderRR);

    const cabinGeo = new THREE.BoxGeometry(1.35, 0.55, 1.5);
    const cabin = new THREE.Mesh(cabinGeo, carbonFiber);
    cabin.position.set(0, 1.05, -0.15);
    cabin.castShadow = true;
    mainHull.add(cabin);

    const windshieldFront = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.05), glassMaterial);
    windshieldFront.position.set(0, 1.35, 0.55);
    windshieldFront.rotation.x = -0.35;
    mainHull.add(windshieldFront);

    const windshieldRear = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.05), glassMaterial);
    windshieldRear.position.set(0, 1.3, -0.75);
    windshieldRear.rotation.x = 0.2;
    mainHull.add(windshieldRear);

    const rollCageGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8);
    const rollCageMat = new THREE.MeshStandardMaterial({
      color: "#aa0000",
      roughness: 0.6,
      metalness: 0.5,
    });
    const rcTop = new THREE.Mesh(rollCageGeo, rollCageMat);
    rcTop.rotation.z = Math.PI / 2;
    rcTop.position.set(0, 1.55, -0.1);
    mainHull.add(rcTop);

    const rcLeft1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), rollCageMat);
    rcLeft1.position.set(0.7, 1.2, -0.85);
    rcLeft1.rotation.x = -0.35;
    mainHull.add(rcLeft1);

    const rcRight1 = rcLeft1.clone();
    rcRight1.position.set(-0.7, 1.2, -0.85);
    mainHull.add(rcRight1);

    const rcLeft2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.35, 8), rollCageMat);
    rcLeft2.position.set(0.7, 1.1, 0.65);
    rcLeft2.rotation.x = 0.55;
    mainHull.add(rcLeft2);

    const rcRight2 = rcLeft2.clone();
    rcRight2.position.set(-0.7, 1.1, 0.65);
    mainHull.add(rcRight2);

    const rcFrontBar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), rollCageMat);
    rcFrontBar.rotation.z = Math.PI / 2;
    rcFrontBar.position.set(0, 1.5, 0.6);
    mainHull.add(rcFrontBar);

    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.65, 1.0), darkMetal);
    engineBlock.position.set(0, 0.78, -1.6);
    mainHull.add(engineBlock);

    const engineTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.15, 0.6),
      new THREE.MeshStandardMaterial({ color: "#333", roughness: 0.7, metalness: 0.5 }),
    );
    engineTop.position.set(0, 1.13, -1.6);
    mainHull.add(engineTop);

    const exGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.8, 10);
    const ex1 = new THREE.Mesh(exGeo, darkMetal);
    ex1.position.set(0.35, 1.15, -1.95);
    ex1.rotation.x = -0.25;
    mainHull.add(ex1);
    const ex2 = new THREE.Mesh(exGeo, darkMetal);
    ex2.position.set(-0.35, 1.15, -1.95);
    ex2.rotation.x = -0.25;
    mainHull.add(ex2);

    const glowGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 8);
    const glow1 = new THREE.Mesh(glowGeo, engineGlow);
    glow1.position.set(0.35, 1.55, -2.0);
    glow1.rotation.x = -0.25;
    mainHull.add(glow1);
    const glow2 = new THREE.Mesh(glowGeo, engineGlow);
    glow2.position.set(-0.35, 1.55, -2.0);
    glow2.rotation.x = -0.25;
    mainHull.add(glow2);

    const exLight = new THREE.PointLight("#ff5500", 1.5, 5);
    exLight.position.set(0, 1.4, -2.1);
    mainHull.add(exLight);

    const strutGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4);
    const strutMat = new THREE.MeshStandardMaterial({
      color: "#cc0000",
      metalness: 0.6,
      roughness: 0.4,
    });
    for (let i = 0; i < 4; i++) {
      const strut = new THREE.Mesh(strutGeo, strutMat);
      const x = i % 2 === 0 ? 0.7 : -0.7;
      const z = i < 2 ? 1.5 : -1.5;
      strut.position.set(x, 0.55, z);
      strut.rotation.z = i % 2 === 0 ? -0.45 : 0.45;
      mainHull.add(strut);

      const springGeo = new THREE.TorusGeometry(0.15, 0.02, 6, 12);
      const spring = new THREE.Mesh(springGeo, strutMat);
      spring.position.set(x, 0.35, z);
      spring.rotation.x = Math.PI / 2;
      spring.rotation.z = i % 2 === 0 ? -0.45 : 0.45;
      mainHull.add(spring);
    }
  } else if (chassisName === "hauler") {
    // ARMORED TRUCK / HAULER (Heavy, detailed rig - EXAGGERATED)
    const bodyGeo = new THREE.BoxGeometry(2.6, 0.95, 5.2);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.position.y = 0.9;
    body.castShadow = true;
    mainHull.add(body);

    const underPlate = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 5.0), darkMetal);
    underPlate.position.y = 0.38;
    mainHull.add(underPlate);

    const cabinGeo = new THREE.BoxGeometry(2.3, 1.15, 2.0);
    const cabin = new THREE.Mesh(cabinGeo, darkMetal);
    cabin.position.set(0, 1.85, 0.9);
    cabin.castShadow = true;
    mainHull.add(cabin);

    for (let i = 0; i < 3; i++) {
      const windowSlit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 2.02), glassMaterial);
      windowSlit.position.set((i - 1) * 0.7, 1.9, 0.9);
      mainHull.add(windowSlit);
    }

    const windowBarMat = new THREE.MeshStandardMaterial({
      color: "#222",
      metalness: 0.8,
      roughness: 0.4,
    });
    for (const wx of [-0.7, 0, 0.7]) {
      for (const wy of [1.7, 2.05]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 2.04), windowBarMat);
        bar.position.set(wx - 0.35 + (wx === 0 ? 0.35 : 0), wy, 0.9);
        mainHull.add(bar);
      }
    }

    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 2.8), darkMetal);
    bed.position.set(0, 1.55, -1.2);
    mainHull.add(bed);

    const bedRailL = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.35, 2.82),
      new THREE.MeshStandardMaterial({ color: "#333", metalness: 0.7, roughness: 0.4 }),
    );
    bedRailL.position.set(1.18, 1.95, -1.2);
    mainHull.add(bedRailL);
    const bedRailR = bedRailL.clone();
    bedRailR.position.x = -1.18;
    mainHull.add(bedRailR);

    const stackGeo = new THREE.CylinderGeometry(0.15, 0.18, 2.2, 10);
    const stack1 = new THREE.Mesh(stackGeo, darkMetal);
    stack1.position.set(1.3, 2.2, 0);
    mainHull.add(stack1);
    const stack2 = stack1.clone();
    stack2.position.set(-1.3, 2.2, 0);
    mainHull.add(stack2);

    const stackCapL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.18, 0.15, 10),
      new THREE.MeshStandardMaterial({ color: "#444", metalness: 0.8, roughness: 0.3 }),
    );
    stackCapL.position.set(1.3, 3.32, 0);
    mainHull.add(stackCapL);
    const stackCapR = stackCapL.clone();
    stackCapR.position.set(-1.3, 3.32, 0);
    mainHull.add(stackCapR);

    const tipGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.5, 10);
    const tip1 = new THREE.Mesh(tipGeo, engineGlow);
    tip1.position.set(1.3, 3.45, 0);
    mainHull.add(tip1);
    const tip2 = tip1.clone();
    tip2.position.set(-1.3, 3.45, 0);
    mainHull.add(tip2);

    const stackLight = new THREE.PointLight("#ff5500", 1.0, 5);
    stackLight.position.set(0, 3.5, 0);
    mainHull.add(stackLight);

    const skirtGeo = new THREE.BoxGeometry(2.8, 0.25, 2.6);
    const skirt = new THREE.Mesh(skirtGeo, carbonFiber);
    skirt.position.set(0, 0.42, 0);
    mainHull.add(skirt);

    const nudgeBar = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 0.3), darkMetal);
    nudgeBar.position.set(0, 0.55, 2.65);
    mainHull.add(nudgeBar);

    for (const nx of [-1.2, -0.6, 0, 0.6, 1.2]) {
      const nBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 6), windowBarMat);
      nBolt.position.set(nx, 0.75, 2.72);
      mainHull.add(nBolt);
    }

    const tL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.12), tailLampMaterial);
    tL.position.set(0.9, 0.9, -2.65);
    mainHull.add(tL);
    const tR = tL.clone();
    tR.position.set(-0.9, 0.9, -2.65);
    mainHull.add(tR);

    const tailLightGlow = new THREE.PointLight("#ff0000", 0.8, 4);
    tailLightGlow.position.set(0, 0.9, -2.8);
    mainHull.add(tailLightGlow);
  } else {
    // INTERCEPTOR (Sleek, aggressive muscle car - EXAGGERATED)
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(2.2, 0.18);
    bodyShape.lineTo(2.2, 0.72);
    bodyShape.lineTo(1.0, 0.95);
    bodyShape.lineTo(-1.2, 1.08);
    bodyShape.lineTo(-2.4, 0.82);
    bodyShape.lineTo(-2.4, 0.28);
    bodyShape.lineTo(-2.0, 0.18);
    bodyShape.lineTo(2.2, 0.18);
    const extrudeSettings = {
      depth: 2.0,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 2,
      bevelSize: 0.12,
      bevelThickness: 0.12,
    };
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
    bodyGeo.translate(0, 0, -1.0);
    bodyGeo.rotateY(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    mainHull.add(body);

    const hoodScoop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.2), darkMetal);
    hoodScoop.position.set(0, 0.92, 1.0);
    mainHull.add(hoodScoop);
    const hoodScoopVent = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.04, 0.8),
      new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.8, metalness: 0.3 }),
    );
    hoodScoopVent.position.set(0, 0.99, 1.0);
    mainHull.add(hoodScoopVent);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 1.9), glassMaterial);
    cabin.position.set(0, 1.15, -0.15);
    mainHull.add(cabin);

    const roofStrip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.7), darkMetal);
    roofStrip.position.set(0, 1.42, -0.15);
    mainHull.add(roofStrip);

    const spoilerWing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.55), carbonFiber);
    spoilerWing.position.set(0, 1.4, -2.3);
    mainHull.add(spoilerWing);

    const spoilerEndplateL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.55), carbonFiber);
    spoilerEndplateL.position.set(1.3, 1.35, -2.3);
    mainHull.add(spoilerEndplateL);
    const spoilerEndplateR = spoilerEndplateL.clone();
    spoilerEndplateR.position.x = -1.3;
    mainHull.add(spoilerEndplateR);

    const strutGeo = new THREE.BoxGeometry(0.08, 0.45, 0.25);
    const strutL = new THREE.Mesh(strutGeo, carbonFiber);
    strutL.position.set(0.85, 1.12, -2.2);
    strutL.rotation.x = -0.2;
    mainHull.add(strutL);
    const strutR = strutL.clone();
    strutR.position.set(-0.85, 1.12, -2.2);
    mainHull.add(strutR);

    const grillGeo = new THREE.BoxGeometry(1.6, 0.25, 0.12);
    const grill = new THREE.Mesh(grillGeo, darkMetal);
    grill.position.set(0, 0.42, 2.2);
    mainHull.add(grill);

    const grillSlats = new THREE.MeshStandardMaterial({ color: "#0a0a0a", roughness: 0.9 });
    for (let gs = 0; gs < 5; gs++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.025, 0.06), grillSlats);
      slat.position.set(0, 0.33 + gs * 0.045, 2.18);
      mainHull.add(slat);
    }

    const exGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.4, 10);
    const ex1 = new THREE.Mesh(exGeo, darkMetal);
    ex1.position.set(0.7, 0.35, -2.35);
    ex1.rotation.x = Math.PI / 2;
    mainHull.add(ex1);
    const ex2 = ex1.clone();
    ex2.position.set(-0.7, 0.35, -2.35);
    mainHull.add(ex2);
    const ex3 = ex1.clone();
    ex3.position.set(0.45, 0.35, -2.35);
    mainHull.add(ex3);
    const ex4 = ex1.clone();
    ex4.position.set(-0.45, 0.35, -2.35);
    mainHull.add(ex4);

    const exGlow1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.08, 8), engineGlow);
    exGlow1.rotation.x = Math.PI / 2;
    exGlow1.position.set(0.7, 0.35, -2.55);
    mainHull.add(exGlow1);
    const exGlow2 = exGlow1.clone();
    exGlow2.position.set(-0.7, 0.35, -2.55);
    mainHull.add(exGlow2);

    const sideSkirtL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 3.5), darkMetal);
    sideSkirtL.position.set(0.95, 0.25, -0.2);
    mainHull.add(sideSkirtL);
    const sideSkirtR = sideSkirtL.clone();
    sideSkirtR.position.x = -0.95;
    mainHull.add(sideSkirtR);

    const tlGeo = new THREE.BoxGeometry(0.6, 0.18, 0.12);
    const tL = new THREE.Mesh(tlGeo, tailLampMaterial);
    tL.position.set(0.7, 0.75, -2.35);
    mainHull.add(tL);
    const tR = tL.clone();
    tR.position.set(-0.7, 0.75, -2.35);
    mainHull.add(tR);

    const tailLight = new THREE.PointLight("#ff0000", 0.5, 4);
    tailLight.position.set(0, 0.7, -2.5);
    mainHull.add(tailLight);
  }

  // Rig attachments for procedural cars
  const rig = state.equipment.rig;
  const rigGroup = new THREE.Group();
  mainHull.add(rigGroup);

  if (rig === "ram") {
    const ramMat = new THREE.MeshStandardMaterial({
      color: "#222",
      metalness: 0.85,
      roughness: 0.25,
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.5), ramMat);
    beam.position.set(
      0,
      0.45,
      chassisName === "hauler" ? 2.7 : chassisName === "scout" ? 2.1 : 2.35,
    );
    rigGroup.add(beam);
    for (let i = 0; i < 7; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.55, 5), ramMat);
      spike.position.set(
        -1.0 + i * 0.33,
        0.55,
        chassisName === "hauler" ? 2.95 : chassisName === "scout" ? 2.35 : 2.6,
      );
      spike.rotation.x = Math.PI / 2;
      rigGroup.add(spike);
    }
  } else if (rig === "tank") {
    const plateMat = new THREE.MeshStandardMaterial({
      color: "#333",
      metalness: 0.7,
      roughness: 0.6,
    });
    const chassisW = chassisName === "hauler" ? 1.5 : chassisName === "scout" ? 1.0 : 0.95;
    for (const side of [-1, 1]) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 1.0, chassisName === "hauler" ? 2.8 : 2.4),
        plateMat,
      );
      plate.position.set(side * (chassisW + 0.06), 0.85, 0);
      rigGroup.add(plate);
      for (let b = 0; b < 3; b++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(chassisW * 2 + 0.2, 0.06, 0.12), plateMat);
        bar.position.set(0, 1.2 + b * 0.2, -0.5 + b * 0.5);
        rigGroup.add(bar);
      }
    }
  } else if (rig === "booster") {
    const boostMat = new THREE.MeshStandardMaterial({
      color: "#444",
      metalness: 0.95,
      roughness: 0.2,
    });
    const flames = [];
    const nozzlePositions =
      chassisName === "hauler"
        ? [
            [0.6, 0.8, -2.6],
            [-0.6, 0.8, -2.6],
          ]
        : chassisName === "scout"
          ? [
              [0.4, 0.7, -2.0],
              [-0.4, 0.7, -2.0],
            ]
          : [
              [0.5, 0.5, -2.5],
              [-0.5, 0.5, -2.5],
            ];
    for (const [nx, ny, nz] of nozzlePositions) {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.9, 10), boostMat);
      nozzle.position.set(nx, ny, nz);
      nozzle.rotation.x = Math.PI / 2;
      rigGroup.add(nozzle);
      const flame = new THREE.PointLight("#0088ff", 0, 4);
      flame.position.set(nx, ny, nz - 0.35);
      rigGroup.add(flame);
      flames.push(flame);
      const flameGeo = new THREE.ConeGeometry(0.14, 0.6, 8);
      const flameMat = new THREE.MeshBasicMaterial({
        color: "#00ccff",
        transparent: true,
        opacity: 0,
      });
      const fMesh = new THREE.Mesh(flameGeo, flameMat);
      fMesh.position.set(nx, ny, nz - 0.3);
      fMesh.rotation.x = -Math.PI / 2;
      rigGroup.add(fMesh);
      flame.userData.mesh = fMesh;
    }
    group.userData.boosterFlames = flames;
  }

  // Ram/Rig (Attached to front of any chassis)
  const ram = new THREE.Group();
  const ramBar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.4), carbonFiber);
  ramBar.position.set(0, 0.4, chassisName === "hauler" ? 2.6 : chassisName === "scout" ? 2.0 : 2.2);
  ramBar.castShadow = true;
  ram.add(ramBar);
  const drlL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.45), drlMaterial);
  drlL.position.set(0.8, 0.4, chassisName === "hauler" ? 2.6 : chassisName === "scout" ? 2.0 : 2.2);
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
  const wheelZFront = chassisName === "hauler" ? 1.9 : 1.5;
  const wheelZRear = chassisName === "hauler" ? -1.9 : -1.5;
  const wheelX = chassisName === "hauler" ? 1.4 : 1.15;
  const wheelRad = chassisName === "hauler" ? 0.52 : chassisName === "scout" ? 0.48 : 0.38;

  const wheelsSpec = [
    [wheelX, wheelRad, wheelZFront, true],
    [-wheelX, wheelRad, wheelZFront, true],
    [wheelX, wheelRad, wheelZRear, false],
    [-wheelX, wheelRad, wheelZRear, false],
  ];

  const tireMat = new THREE.MeshStandardMaterial({
    color: "#0a0a0a",
    roughness: 0.95,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: "#555",
    metalness: 0.85,
    roughness: 0.15,
  });
  const hubAccentMat = new THREE.MeshStandardMaterial({
    color: chassisName === "hauler" ? "#cc0000" : chassisName === "scout" ? "#ffaa00" : "#0088ff",
    metalness: 0.7,
    roughness: 0.3,
  });

  group.userData.wheels = wheelsSpec.map(([x, y, z, steerable], i) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, y, z);

    const rollGroup = new THREE.Group();
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRad, wheelRad, chassisName === "hauler" ? 0.4 : 0.32, 20),
      tireMat,
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    rollGroup.add(tire);

    const sideWall = new THREE.Mesh(
      new THREE.RingGeometry(wheelRad * 0.75, wheelRad * 0.98, 16),
      new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.9 }),
    );
    sideWall.rotation.z = Math.PI / 2;
    sideWall.position.x = 0.16 * (i % 2 === 0 ? 1 : -1);
    rollGroup.add(sideWall);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(
        wheelRad * 0.62,
        wheelRad * 0.62,
        chassisName === "hauler" ? 0.42 : 0.34,
        8,
      ),
      rimMat,
    );
    rim.rotation.z = Math.PI / 2;
    rollGroup.add(rim);

    const spokeCount = chassisName === "hauler" ? 8 : chassisName === "scout" ? 5 : 6;
    const spokeMat = new THREE.MeshStandardMaterial({
      color: "#666",
      metalness: 0.7,
      roughness: 0.25,
    });
    for (let s = 0; s < spokeCount; s++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(wheelRad * 0.55, 0.06, 0.05), spokeMat);
      spoke.position.x = wheelRad * 0.32;
      spoke.rotation.z = (s / spokeCount) * Math.PI * 2;
      rim.add(spoke);
    }
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(
        wheelRad * 0.16,
        wheelRad * 0.16,
        chassisName === "hauler" ? 0.43 : 0.35,
        10,
      ),
      hubAccentMat,
    );
    cap.rotation.z = Math.PI / 2;
    rollGroup.add(cap);

    const capRing = new THREE.Mesh(new THREE.TorusGeometry(wheelRad * 0.16, 0.01, 6, 10), rimMat);
    capRing.rotation.y = Math.PI / 2;
    capRing.position.x = 0.17 * (i % 2 === 0 ? 1 : -1);
    rollGroup.add(capRing);

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
  world.car.userData.ram.scale.x = rig === "tank" ? 1.25 : rig === "booster" ? 0.9 : 1.0;
  world.car.userData.ram.scale.z = rig === "ram" ? 1.2 : 1.0;
}
