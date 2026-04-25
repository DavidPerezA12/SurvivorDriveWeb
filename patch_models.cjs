const fs = require('fs');

let code = fs.readFileSync('src/main.js', 'utf8');

// 1. Replace createPropMesh
const newPropMesh = `function createPropMesh(kind) {
  const group = new THREE.Group();
  
  if (kind === "building") {
    const baseColor = new THREE.Color().setHSL(Math.random(), 0.05, 0.15 + Math.random() * 0.15);
    const wallMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.95 });
    
    const width = 3 + Math.random() * 3;
    const depth = 3 + Math.random() * 3;
    const height = 4 + Math.random() * 8;
    
    // Main block
    const main = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
    main.position.y = height / 2;
    main.castShadow = true;
    main.receiveShadow = true;
    group.add(main);

    // Ruined/secondary section
    if (Math.random() > 0.4) {
      const secHeight = height * (0.4 + Math.random() * 0.5);
      const secondary = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, secHeight, depth + 1.2), wallMat);
      secondary.position.y = secHeight / 2;
      secondary.position.x = (Math.random() - 0.5);
      secondary.castShadow = true;
      secondary.receiveShadow = true;
      group.add(secondary);
    }
    
    // Roof detail (antenna or vent)
    if (Math.random() > 0.5) {
      const roofMat = new THREE.MeshStandardMaterial({color: "#333", roughness: 0.8});
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2), roofMat);
      antenna.position.set(0, height + 1, 0);
      group.add(antenna);
    } else {
      const ventMat = new THREE.MeshStandardMaterial({color: "#444", roughness: 0.8});
      const vent = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ventMat);
      vent.position.set(0, height + 0.5, 0);
      group.add(vent);
    }

  } else if (kind === "tree") {
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#2a201a", roughness: 1.0 });
    const leafMat = new THREE.MeshStandardMaterial({ color: "#3d4230", roughness: 0.9 });
    
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2.5, 5), trunkMat);
    trunk.position.y = 1.25;
    trunk.rotation.x = (Math.random() - 0.5) * 0.3;
    trunk.rotation.z = (Math.random() - 0.5) * 0.3;
    trunk.castShadow = true;
    group.add(trunk);
    
    const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4 + Math.random() * 0.6), leafMat);
    canopy.position.set(trunk.position.x, 2.8, trunk.position.z);
    canopy.rotation.set(Math.random(), Math.random(), Math.random());
    canopy.scale.y = 0.6 + Math.random() * 0.4;
    canopy.castShadow = true;
    group.add(canopy);

    for(let i=0; i<2; i++) {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.15, 1.5, 4), trunkMat);
        branch.position.set((Math.random()-0.5)*1.5, 1.5 + Math.random(), (Math.random()-0.5)*1.5);
        branch.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        branch.castShadow = true;
        group.add(branch);
    }
  } else if (kind === "rock") {
    const mat = new THREE.MeshStandardMaterial({ color: "#555", roughness: 0.9, flatShading: true });
    for(let i=0; i<3; i++) {
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random()), mat);
      mesh.position.set((Math.random()-0.5)*1.5, 0.5 + Math.random()*0.5, (Math.random()-0.5)*1.5);
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  
  return group;
}`;

// Replace createPropMesh completely
code = code.replace(/function createPropMesh\(kind\) \{[\s\S]*?return group;\n\}/, newPropMesh);

// 2. Replace mutant and ramp
const newObstacles = `if (kind === "mutant") {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({color: "#4a7c59", roughness: 0.8});
    
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.6, 4, 8), skinMat);
    body.position.y = 0.7;
    body.castShadow = true;
    group.add(body);
    
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), skinMat);
    head.position.y = 1.45;
    head.castShadow = true;
    group.add(head);
    
    const eyeMat = new THREE.MeshBasicMaterial({color: "#ff0000"});
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.1), eyeMat);
    eyeL.position.set(0.12, 1.5, 0.25);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.1), eyeMat);
    eyeR.position.set(-0.12, 1.5, 0.25);
    group.add(eyeR);

    const armGeo = new THREE.CapsuleGeometry(0.12, 0.5, 4, 8);
    const lArm = new THREE.Mesh(armGeo, skinMat);
    lArm.position.set(0.45, 0.9, 0);
    lArm.rotation.z = -Math.PI/6;
    lArm.rotation.x = -Math.PI/8;
    lArm.castShadow = true;
    group.add(lArm);
    
    const rArm = new THREE.Mesh(armGeo, skinMat);
    rArm.position.set(-0.45, 0.9, 0);
    rArm.rotation.z = Math.PI/6;
    rArm.rotation.x = -Math.PI/8;
    rArm.castShadow = true;
    group.add(rArm);

    group.userData = {
      type: "obstacle",
      isEnemy: false,
      isMutant: true,
      damage: 15,
      radius: 0.45,
      collisionYMin: 0,
      collisionYMax: 1.7,
      rewardCoins: 5,
      height: 0,
      obstacleSpin: "none",
      moveSpeed: (Math.random() - 0.5) * 3.5
    };
    return group;
  }
  
  if (kind === "ramp") {
    const group = new THREE.Group();
    
    const rampMat = new THREE.MeshStandardMaterial({color: "#4a4a4a", roughness: 0.7, metalness: 0.4});
    const surf = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 4.5), rampMat);
    surf.rotation.x = Math.PI / 9; // Approx 20 degrees
    surf.position.y = 0.7;
    surf.castShadow = true;
    surf.receiveShadow = true;
    group.add(surf);

    const strutMat = new THREE.MeshStandardMaterial({color: "#222", roughness: 0.9});
    const strutGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.4, 4);
    const strut1 = new THREE.Mesh(strutGeo, strutMat);
    strut1.position.set(1.4, 0.7, -1.8);
    group.add(strut1);
    const strut2 = new THREE.Mesh(strutGeo, strutMat);
    strut2.position.set(-1.4, 0.7, -1.8);
    group.add(strut2);

    const stripeMat = new THREE.MeshBasicMaterial({color: "#ffaa00"});
    for(let i=0; i<4; i++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.16, 0.2), stripeMat);
        stripe.position.set(0, surf.position.y + (i-1.5)*0.35, (i-1.5)*1.1);
        stripe.rotation.x = Math.PI / 9;
        group.add(stripe);
    }

    group.userData = {
      type: "obstacle",
      isRamp: true,
      radius: 1.6,
      collisionYMin: 0,
      collisionYMax: 1.4,
      height: 0,
      obstacleSpin: "none"
    };
    return group;
  }`;

code = code.replace(/if \(kind === "mutant"\) \{[\s\S]*?obstacleSpin: "none"\n    \};\n    return group;\n  \}/, newObstacles);

fs.writeFileSync('src/main.js', code);
