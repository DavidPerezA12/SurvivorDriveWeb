const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

// 1. Update Map Scale & Density (spawnProp changes)
// Making the road longer or prop distribution wider.
code = code.replace(
  /const zDist = 80 \+ Math\.random\(\) \* 40;/,
  'const zDist = 120 + Math.random() * 80;'
);
code = code.replace(
  /const xDist = \(12 \+ Math\.random\(\) \* 25\) \* \(isLeft \? -1 : 1\);/,
  'const xDist = (15 + Math.random() * 45) * (isLeft ? -1 : 1);'
);

code = code.replace(
  /run\.propTimer = Math\.random\(\) \* 0\.15;/,
  'run.propTimer = Math.random() * 0.08;' // Spawns props much faster for a denser environment
);

// We need to add some details like guardrails or highway signs
const spawnPropExpansion = `
  const isLeft = Math.random() > 0.5;
  const randType = Math.random();
  let kind = "rock";
  if (randType > 0.9) kind = "billboard";
  else if (randType > 0.6) kind = "building";
  else if (randType > 0.3) kind = "tree";
`;

code = code.replace(
  /const isLeft = Math\.random\(\) > 0\.5;\n\s+const kind = Math\.random\(\) > 0\.7 \? "building" : \(Math\.random\(\) > 0\.4 \? "tree" : "rock"\);/,
  spawnPropExpansion
);

const newPropsMeshStr = `
  } else if (kind === "billboard") {
    const matPole = new THREE.MeshStandardMaterial({color: "#333", roughness: 0.9});
    const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 15), matPole);
    pole1.position.set(-2, 7.5, 0);
    pole1.castShadow = true;
    group.add(pole1);
    
    const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 15), matPole);
    pole2.position.set(2, 7.5, 0);
    pole2.castShadow = true;
    group.add(pole2);
    
    const boardMat = new THREE.MeshStandardMaterial({color: new THREE.Color().setHSL(Math.random(), 0.5, 0.3), roughness: 0.8});
    const board = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.5), boardMat);
    board.position.set(0, 12.5, 0);
    board.castShadow = true;
    group.add(board);
`;

code = code.replace(
  /\} else if \(kind === "rock"\) \{/,
  newPropsMeshStr + '\n  } else if (kind === "rock") {'
);


// 2. Refactor createCar to support different chassis
// Currently state is available via \`state\` global variable in main.js
const carCreateFunctionOld = /function createCar\(\) \{([\s\S]*?)return group;\n\}/;

const carCreateFunctionNew = `function createCar() {
  const group = new THREE.Group();
  const chassisName = state.equipment.chassis.id || "interceptor";

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: stateColor(),
    metalness: 0.7,
    roughness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 2.0,
  });
  
  const darkMetal = new THREE.MeshStandardMaterial({color: "#111", roughness: 0.8, metalness: 0.7});
  const carbonFiber = new THREE.MeshStandardMaterial({color: "#1a1a1c", roughness: 0.5, metalness: 0.6, envMapIntensity: 1.5});
  const glassMaterial = new THREE.MeshPhysicalMaterial({color: "#010101", metalness: 0.2, roughness: 0.0, transmission: 0.98, ior: 1.6, transparent: true});
  const engineGlow = new THREE.MeshStandardMaterial({color: "#ffaa00", emissive: "#ff4400", emissiveIntensity: 4.0});
  const tailLampMaterial = new THREE.MeshStandardMaterial({color: "#aa0000", emissive: "#ff0500", emissiveIntensity: 5.0});
  const drlMaterial = new THREE.MeshStandardMaterial({color: "#ffffff", emissive: "#ddffff", emissiveIntensity: 6.0});

  world.carMaterials = [bodyMaterial];

  const mainHull = new THREE.Group();

  if (chassisName === "scout") {
    // BUGGY / SCOUT (Light, open-wheel style)
    const bodyGeo = new THREE.BoxGeometry(1.6, 0.4, 3.8);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.position.y = 0.5;
    body.castShadow = true;
    mainHull.add(body);

    const cabinGeo = new THREE.BoxGeometry(1.2, 0.6, 1.4);
    const cabin = new THREE.Mesh(cabinGeo, carbonFiber);
    cabin.position.set(0, 1.0, -0.2);
    cabin.castShadow = true;
    mainHull.add(cabin);
    
    const rollCage = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8), darkMetal);
    rollCage.rotation.z = Math.PI / 2;
    rollCage.position.set(0, 1.4, -0.2);
    mainHull.add(rollCage);

    const engine = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.8), darkMetal);
    engine.position.set(0, 0.7, -1.6);
    mainHull.add(engine);

    // Glowing exhausts
    const ex1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4), engineGlow);
    ex1.rotation.x = Math.PI / 2;
    ex1.position.set(0.4, 0.7, -2.1);
    mainHull.add(ex1);
    const ex2 = ex1.clone();
    ex2.position.set(-0.4, 0.7, -2.1);
    mainHull.add(ex2);

  } else if (chassisName === "hauler") {
    // ARMORED TRUCK / HAULER (Heavy, blocky)
    const bodyGeo = new THREE.BoxGeometry(2.4, 0.8, 5.0);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.position.y = 0.8;
    body.castShadow = true;
    mainHull.add(body);

    const cabinGeo = new THREE.BoxGeometry(2.2, 0.9, 1.6);
    const cabin = new THREE.Mesh(cabinGeo, darkMetal);
    cabin.position.set(0, 1.6, 0.8);
    cabin.castShadow = true;
    mainHull.add(cabin);

    const window = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 1.7), glassMaterial);
    window.position.set(0, 1.6, 0.8);
    mainHull.add(window);

    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 2.6), darkMetal);
    bed.position.set(0, 1.4, -1.1);
    mainHull.add(bed);
    
    // Tail lights
    const tL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.1), tailLampMaterial);
    tL.position.set(0.8, 0.8, -2.55);
    mainHull.add(tL);
    const tR = tL.clone();
    tR.position.set(-0.8, 0.8, -2.55);
    mainHull.add(tR);

  } else {
    // INTERCEPTOR (The original sleek muscle/sports car)
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(2.0, 0.2);
    bodyShape.lineTo(2.0, 0.65);
    bodyShape.lineTo(0.8, 0.85); // Hood curve
    bodyShape.lineTo(-1.0, 0.95); // Trunk line
    bodyShape.lineTo(-2.2, 0.8); // Rear drop
    bodyShape.lineTo(-2.2, 0.3);
    bodyShape.lineTo(-1.8, 0.2);
    bodyShape.lineTo(2.0, 0.2);
    const extrudeSettings = { depth: 1.8, bevelEnabled: true, bevelSegments: 3, steps: 2, bevelSize: 0.1, bevelThickness: 0.1 };
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
    bodyGeo.translate(0, 0, -0.9);
    bodyGeo.rotateY(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    mainHull.add(body);
    
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0), glassMaterial);
    cabin.position.set(0, 1.05, -0.2);
    mainHull.add(cabin);
    
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.4), carbonFiber);
    spoiler.position.set(0, 1.2, -2.0);
    mainHull.add(spoiler);
    const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.2), carbonFiber);
    strutL.position.set(0.6, 1.0, -2.0);
    mainHull.add(strutL);
    const strutR = strutL.clone();
    strutR.position.set(-0.6, 1.0, -2.0);
    mainHull.add(strutR);
  }

  // Ram/Rig (Attached to front of any chassis)
  const ram = new THREE.Group();
  const ramBar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.4), carbonFiber);
  ramBar.position.set(0, 0.4, (chassisName === "hauler" ? 2.6 : (chassisName === "scout" ? 2.0 : 2.2)));
  ramBar.castShadow = true;
  ram.add(ramBar);
  const drlL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.45), drlMaterial);
  drlL.position.set(0.8, 0.4, (chassisName === "hauler" ? 2.6 : (chassisName === "scout" ? 2.0 : 2.2)));
  ram.add(drlL);
  const drlR = drlL.clone();
  drlR.position.set(-0.8, 0.4, (chassisName === "hauler" ? 2.6 : (chassisName === "scout" ? 2.0 : 2.2)));
  ram.add(drlR);
  mainHull.add(ram);
  group.userData.ram = ram;

  group.add(mainHull);
  group.userData.hull = mainHull;

  // Wheels (Placed generically enough for all chassis)
  const wheelZFront = chassisName === "hauler" ? 1.8 : 1.4;
  const wheelZRear = chassisName === "hauler" ? -1.8 : -1.4;
  const wheelX = chassisName === "hauler" ? 1.3 : 1.1;
  const wheelRad = chassisName === "hauler" ? 0.45 : (chassisName === "scout" ? 0.4 : 0.35);

  const wheelsSpec = [
    [wheelX, wheelRad, wheelZFront, true],
    [-wheelX, wheelRad, wheelZFront, true],
    [wheelX, wheelRad, wheelZRear, false],
    [-wheelX, wheelRad, wheelZRear, false],
  ];

  const tireMat = new THREE.MeshStandardMaterial({color: "#111", roughness: 0.9});
  const rimMat = new THREE.MeshStandardMaterial({color: "#444", metalness: 0.8, roughness: 0.2});

  group.userData.wheels = wheelsSpec.map(([x, y, z, steerable], i) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, y, z);
    
    const rollGroup = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelRad, wheelRad, 0.3, 16), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    rollGroup.add(tire);
    
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelRad * 0.6, wheelRad * 0.6, 0.32, 8), rimMat);
    rim.rotation.z = Math.PI / 2;
    rollGroup.add(rim);

    wheelGroup.add(rollGroup);
    group.add(wheelGroup);

    wheelGroup.userData = { steerable, roll: rollGroup, defaultX: x, defaultY: y, defaultZ: z };
    return wheelGroup;
  });

  return group;
}`;

code = code.replace(carCreateFunctionOld, carCreateFunctionNew);

// 3. Make rebuildCarAppearance completely rebuild the car geometry when a chassis is changed in the menu
const rebuildCarStr = `function rebuildCarAppearance() {
  const oldCar = world.car;
  const newCar = createCar();
  
  newCar.position.copy(oldCar.position);
  newCar.rotation.copy(oldCar.rotation);
  
  world.scene.remove(oldCar);
  world.scene.add(newCar);
  world.car = newCar;

  const rig = state.equipment.rig;
  world.car.userData.ram.scale.x = rig === "tank" ? 1.25 : rig === "booster" ? 0.9 : 1.0;
  world.car.userData.ram.scale.z = rig === "ram" ? 1.2 : 1.0;
}`;

code = code.replace(/function rebuildCarAppearance\(\) \{[\s\S]*?\n\}/, rebuildCarStr);


fs.writeFileSync('src/main.js', code);
