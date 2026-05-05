import * as THREE from "three";

export function createRaider(models, tireMat) {

    const group = new THREE.Group();
    const variant = Math.floor(Math.random() * 3);
    const vScale = variant === 1 ? 1.25 : variant === 2 ? 0.88 : 1.05;
    const bodyColor = variant === 1 ? "#3d3028" : variant === 2 ? "#6a5538" : "#5a3d2a";
    const armorColor = variant === 1 ? "#1a1510" : variant === 2 ? "#666" : "#1a1a1a";
    const vRustMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.85, metalness: 0.5 });
    const vDarkMetal = new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.7, metalness: 0.7 });
    const vAccentMat = new THREE.MeshStandardMaterial({
      color: variant === 1 ? "#ff2200" : variant === 2 ? "#ffaa00" : "#ff4400",
      emissive: variant === 1 ? "#aa0000" : variant === 2 ? "#885500" : "#cc2200",
      emissiveIntensity: 1.5,
    });
    const vChromeMat = new THREE.MeshStandardMaterial({ color: "#aaa", metalness: 0.95, roughness: 0.15 });

    if (models["raider"]) {
      const clone = models["raider"].clone();

      const hlMat = new THREE.MeshBasicMaterial({ color: "#ff0000" });
      const hlGeo = new THREE.BoxGeometry(0.2, 0.12, 0.08);
      const hlLeft = new THREE.PointLight("#ff1100", 4, 16);
      hlLeft.position.set(0.7, 0.7, 1.9);
      hlLeft.add(new THREE.Mesh(hlGeo, hlMat));
      const hlRight = new THREE.PointLight("#ff1100", 4, 16);
      hlRight.position.set(-0.7, 0.7, 1.9);
      hlRight.add(new THREE.Mesh(hlGeo, hlMat));
      const headlights = new THREE.Group();
      headlights.add(hlLeft, hlRight);
      group.add(headlights);

      const s = 0.95 + Math.random() * 0.25;
      clone.scale.set(s, s * 1.1, s);
      group.add(clone);
    } else {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(2.1 * vScale, 0.7 * vScale, 3.8 * vScale),
        vRustMat,
      );
      body.position.set(0, 0.55 * vScale, 0);

      const undercarriage = new THREE.Mesh(
        new THREE.BoxGeometry(2.3 * vScale, 0.18 * vScale, 3.6 * vScale),
        vDarkMetal,
      );
      undercarriage.position.set(0, 0.18 * vScale, 0);

      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.4 * vScale, 0.85 * vScale, 1.4 * vScale),
        vDarkMetal,
      );
      cabin.position.set(0, 1.3 * vScale, -0.25 * vScale);

      const cabinSlitL = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.2 * vScale, 0.7 * vScale),
        new THREE.MeshStandardMaterial({ color: "#ff3300", emissive: "#ff2200", emissiveIntensity: 2.0, transparent: true, opacity: 0.85 }),
      );
      cabinSlitL.position.set(0.72 * vScale, 1.35 * vScale, -0.2 * vScale);
      const cabinSlitR = cabinSlitL.clone();
      cabinSlitR.position.x = -0.72 * vScale;

      const cabinFrontSlit = new THREE.Mesh(
        new THREE.BoxGeometry(0.6 * vScale, 0.15 * vScale, 0.04),
        new THREE.MeshStandardMaterial({ color: "#ff3300", emissive: "#ff2200", emissiveIntensity: 2.0, transparent: true, opacity: 0.85 }),
      );
      cabinFrontSlit.position.set(0, 1.4 * vScale, 0.45 * vScale);

      const rammer = new THREE.Mesh(
        new THREE.BoxGeometry((variant === 1 ? 2.6 : 2.3) * vScale, 0.45 * vScale, 0.6 * vScale),
        vDarkMetal,
      );
      rammer.position.set(0, 0.48 * vScale, 2.0 * vScale);

      const rammerTop = new THREE.Mesh(
        new THREE.BoxGeometry((variant === 1 ? 2.4 : 2.1) * vScale, 0.12 * vScale, 0.35 * vScale),
        vAccentMat,
      );
      rammerTop.position.set(0, 0.75 * vScale, 1.85 * vScale);

      const gunBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25 * vScale, 0.3 * vScale, 0.45, 8),
        vDarkMetal,
      );
      gunBase.position.set(0, 1.85 * vScale, -0.25 * vScale);

      const gunShield = new THREE.Mesh(
        new THREE.BoxGeometry(0.5 * vScale, 0.35 * vScale, 0.08),
        vDarkMetal,
      );
      gunShield.position.set(0, 2.05 * vScale, 0.25 * vScale);

      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 1.8),
        new THREE.MeshStandardMaterial({
          color: variant === 2 ? "#ff6644" : "#ffaa44",
          emissive: variant === 2 ? "#ff4422" : "#ff6600",
          emissiveIntensity: 1.5,
        }),
      );
      gun.position.set(0, 1.95 * vScale, 0.5 * vScale);

      const gunMuzzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.14, 0.25, 8),
        vChromeMat,
      );
      gunMuzzle.rotation.x = Math.PI / 2;
      gunMuzzle.position.set(0, 1.95 * vScale, 1.35 * vScale);

      const wR = (variant === 1 ? 0.55 : variant === 2 ? 0.42 : 0.48) * vScale;
      const wheelGeo = new THREE.CylinderGeometry(wR, wR, 0.35 * vScale, 16);
      wheelGeo.rotateZ(Math.PI / 2);
      const rimMat = new THREE.MeshStandardMaterial({ color: "#444", metalness: 0.8, roughness: 0.3 });
      const wheelPositions = [
        [1.15 * vScale, wR, 1.4 * vScale],
        [-1.15 * vScale, wR, 1.4 * vScale],
        [1.15 * vScale, wR, -1.35 * vScale],
        [-1.15 * vScale, wR, -1.35 * vScale],
      ];
      const wheels = wheelPositions.map(([wx, wy, wz]) => {
        const wGroup = new THREE.Group();
        wGroup.position.set(wx, wy, wz);
        const tire = new THREE.Mesh(wheelGeo, tireMat);
        const rim = new THREE.Mesh(
          new THREE.CylinderGeometry(wR * 0.55, wR * 0.55, 0.36 * vScale, 6),
          rimMat,
        );
        rim.rotation.z = Math.PI / 2;
        const hubCap = new THREE.Mesh(
          new THREE.CylinderGeometry(wR * 0.18, wR * 0.18, 0.37 * vScale, 8),
          vAccentMat,
        );
        hubCap.rotation.z = Math.PI / 2;
        wGroup.add(tire, rim, hubCap);
        return wGroup;
      });

      for (const sx of [-1.05 * vScale, 1.05 * vScale]) {
        const plate = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.85 * vScale, 3.0 * vScale),
          new THREE.MeshStandardMaterial({ color: variant === 1 ? "#2a2018" : "#3a2c20", roughness: 0.85, metalness: 0.6 }),
        );
        plate.position.set(sx, 0.7 * vScale, 0);
        group.add(plate);

        const plateEdge = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.08 * vScale, 2.8 * vScale),
          vAccentMat,
        );
        plateEdge.position.set(sx * 1.02, 0.3 * vScale, 0);
        group.add(plateEdge);

        const rivetCount = variant === 1 ? 8 : 6;
        for (let rv = 0; rv < rivetCount; rv++) {
          const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.06 * vScale, 5, 4), vChromeMat);
          rivet.position.set(sx * 1.06, (0.35 + rv * 0.12) * vScale, -1.2 + rv * 0.5);
          group.add(rivet);
        }

        const toothGeo = new THREE.ConeGeometry(0.07 * vScale, 0.3 * vScale, 4);
        for (let t = 0; t < 3; t++) {
          const tooth = new THREE.Mesh(toothGeo, vChromeMat);
          tooth.position.set(sx * 1.08, 0.3 * vScale, -0.8 + t * 0.8);
          tooth.rotation.x = Math.PI / 2;
          group.add(tooth);
        }
      }

      const spikeCount = variant === 1 ? 9 : 7;
      for (let sp = 0; sp < spikeCount; sp++) {
        const spikeGeo = new THREE.ConeGeometry(0.06 * vScale, (variant === 1 ? 0.55 : 0.4) * vScale, 5);
        const spike = new THREE.Mesh(spikeGeo, vDarkMetal);
        spike.position.set((-spikeCount * 0.22 + sp * 0.44) * vScale, (0.7 + (sp % 2) * 0.1) * vScale, 2.15 * vScale);
        spike.rotation.x = -0.4;
        group.add(spike);
      }

      if (variant === 0) {
        const skullBase = new THREE.Mesh(new THREE.SphereGeometry(0.28 * vScale, 8, 6), new THREE.MeshStandardMaterial({ color: "#e8d5c0", roughness: 0.7 }));
        skullBase.position.set(0, 1.1 * vScale, 1.7 * vScale);
        skullBase.scale.set(1, 0.8, 0.9);
        const skullJaw = new THREE.Mesh(new THREE.BoxGeometry(0.28 * vScale, 0.14, 0.18), new THREE.MeshStandardMaterial({ color: "#d4c0a8", roughness: 0.8 }));
        skullJaw.position.set(0, 0.92 * vScale, 1.78 * vScale);
        const skullEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08 * vScale, 6, 5), new THREE.MeshStandardMaterial({ color: "#ff0000", emissive: "#ff4400", emissiveIntensity: 3.0, roughness: 0.1 }));
        skullEyeL.position.set(-0.09 * vScale, 1.15 * vScale, 1.82 * vScale);
        const skullEyeR = skullEyeL.clone();
        skullEyeR.position.set(0.09 * vScale, 1.15 * vScale, 1.82 * vScale);
        const skullNosGlow = new THREE.PointLight("#ff3300", 1.2, 4);
        skullNosGlow.position.set(0, 1.05 * vScale, 1.85 * vScale);
        group.add(skullBase, skullJaw, skullEyeL, skullEyeR, skullNosGlow);
      } else if (variant === 1) {
        const hornMat = new THREE.MeshStandardMaterial({ color: "#d4c8b0", roughness: 0.6, metalness: 0.3 });
        for (const side of [-1, 1]) {
          const hornBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * vScale, 0.12 * vScale, 0.3 * vScale, 6), hornMat);
          hornBase.position.set(side * 0.3 * vScale, 1.05 * vScale, 1.65 * vScale);
          hornBase.rotation.z = side * 0.3;
          const hornMid = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * vScale, 0.08 * vScale, 0.4 * vScale, 6), hornMat);
          hornMid.position.set(side * 0.45 * vScale, 1.25 * vScale, 1.7 * vScale);
          hornMid.rotation.z = side * 0.8;
          const hornTip = new THREE.Mesh(new THREE.ConeGeometry(0.04 * vScale, 0.25 * vScale, 5), vChromeMat);
          hornTip.position.set(side * 0.5 * vScale, 1.45 * vScale, 1.72 * vScale);
          hornTip.rotation.z = side * 1.2;
          group.add(hornBase, hornMid, hornTip);
        }
      } else {
        for (const side of [-1, 1]) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.45 * vScale, 0.03, 0.55), new THREE.MeshStandardMaterial({ color: "#ccc", metalness: 0.9, roughness: 0.2 }));
          blade.position.set(side * 0.3 * vScale, 1.0 * vScale, 1.75 * vScale);
          blade.rotation.z = side * 0.3;
          group.add(blade);
        }
      }

      const exhaustGlow = new THREE.MeshStandardMaterial({ color: "#ff6600", emissive: "#ff3300", emissiveIntensity: 3.0 });
      for (const ex of [-0.85 * vScale, 0.85 * vScale]) {
        const pipeOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * vScale, 0.16 * vScale, 0.3 * vScale, 10), vChromeMat);
        pipeOuter.position.set(ex, 0.35 * vScale, -1.8 * vScale);
        pipeOuter.rotation.x = Math.PI / 2;
        const pipeInner = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * vScale, 0.1 * vScale, 0.8 * vScale, 8), vDarkMetal);
        pipeInner.position.set(ex, 0.4 * vScale, -1.35 * vScale);
        pipeInner.rotation.x = Math.PI / 2;
        const glowTip = new THREE.Mesh(new THREE.SphereGeometry(0.07 * vScale, 6, 4), exhaustGlow);
        glowTip.position.set(ex, 0.35 * vScale, -1.95 * vScale);
        group.add(pipeOuter, pipeInner, glowTip);
      }

      group.add(body, undercarriage, cabin, cabinSlitL, cabinSlitR, cabinFrontSlit, rammer, rammerTop, gunBase, gunShield, gun, gunMuzzle, ...wheels);

      group.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }

    const hullTop = 1.8 * vScale;
    group.userData = {
      type: "enemy",
      isEnemy: true,
      damage: variant === 1 ? 28 : variant === 2 ? 16 : 22,
      collisionHalfX: 1.02 * vScale,
      collisionHalfZ: 1.78 * vScale,
      height: 0,
      collisionYMin: 0,
      collisionYMax: hullTop,
      projectileY: 1.7 * vScale,
      shotCooldown: (variant === 1 ? 1.1 : variant === 2 ? 0.7 : 0.9) + Math.random() * 0.8,
      laneTarget: 0,
      rewardCoins: variant === 1 ? 3 : variant === 2 ? 1 : 2,
      rewardAmmo: variant === 1 ? 2 : 1,
    };
    return group;
  
}

export function createTower(models, rustMat, darkMetal) {

    const group = new THREE.Group();
    if (models["tower"]) {
      const clone = models["tower"].clone();

      const beaconLight = new THREE.PointLight("#ff1100", 5.0, 24);
      beaconLight.position.set(0, 5.0, 0);
      const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), new THREE.MeshBasicMaterial({ color: "#ff3300" }));
      beaconLight.add(beaconMesh);
      group.add(beaconLight);

      const pulseLight = new THREE.PointLight("#ff4400", 2.0, 10);
      pulseLight.position.set(0, 3.5, 0);
      group.add(pulseLight);

      clone.rotation.y = Math.random() * Math.PI * 2;
      const s = 1.1 + Math.random() * 0.15;
      clone.scale.set(s, s * 1.2, s);
      group.add(clone);
    } else {
      const baseGeo = new THREE.CylinderGeometry(1.5, 1.8, 4.5, 10);
      const base = new THREE.Mesh(baseGeo, rustMat);
      base.position.set(0, 2.25, 0);

      const midRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.65, 0.15, 8, 16),
        darkMetal,
      );
      midRing.position.set(0, 3.0, 0);
      midRing.rotation.x = Math.PI / 2;
      group.add(midRing);

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.75, 1.5, 1.0, 10),
        darkMetal,
      );
      collar.position.set(0, 4.8, 0);
      group.add(collar);

      const topGeo = new THREE.CylinderGeometry(1.7, 1.5, 0.9, 10);
      const top = new THREE.Mesh(topGeo, darkMetal);
      top.position.set(0, 5.5, 0);

      const spikeGeo = new THREE.ConeGeometry(0.14, 1.1, 5);
      const spikeMat = new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.6, metalness: 0.8 });
      for (let i = 0; i < 14; i++) {
        const spike = new THREE.Mesh(spikeGeo, spikeMat);
        const ang = (i / 14) * Math.PI * 2;
        const r = 1.65;
        spike.position.set(
          Math.cos(ang) * r,
          5.95 + Math.random() * 0.3,
          Math.sin(ang) * r,
        );
        spike.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.15);
        group.add(spike);
      }

      const skullMat = new THREE.MeshStandardMaterial({ color: "#e8d5c0", roughness: 0.7 });
      const skullGlowMat = new THREE.MeshStandardMaterial({ color: "#ff2200", emissive: "#ff1100", emissiveIntensity: 4.0, roughness: 0.1 });
      for (let sk = 0; sk < 5; sk++) {
        const skullHeight = 4.2 + Math.random() * 2.2;
        const skullAng = Math.random() * Math.PI * 2;
        const skullR = 1.55 + Math.random() * 0.3;
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22 + Math.random() * 0.06, 7, 5), skullMat);
        skull.position.set(
          Math.cos(skullAng) * skullR,
          skullHeight,
          Math.sin(skullAng) * skullR,
        );
        skull.scale.set(1, 0.65, 0.85);
        skull.rotation.y = Math.random() * Math.PI;

        const eyeGeo = new THREE.SphereGeometry(0.045, 5, 4);
        const eyeL = new THREE.Mesh(eyeGeo, skullGlowMat);
        eyeL.position.set(-0.07, 0.03, 0.16);
        skull.add(eyeL);
        const eyeR = new THREE.Mesh(eyeGeo, skullGlowMat);
        eyeR.position.set(0.07, 0.03, 0.16);
        skull.add(eyeR);

        group.add(skull);
      }

      const beaconMat = new THREE.MeshStandardMaterial({
        color: "#ff3300",
        emissive: "#ff1100",
        emissiveIntensity: 4.0,
      });
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), beaconMat);
      beacon.position.set(0, 6.6, 0);
      group.add(beacon);

      const beaconRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.06, 8, 16),
        new THREE.MeshStandardMaterial({ color: "#ff5500", emissive: "#ff2200", emissiveIntensity: 2.0 }),
      );
      beaconRing.position.set(0, 6.5, 0);
      beaconRing.rotation.x = Math.PI / 2;
      group.add(beaconRing);

      const beaconLight = new THREE.PointLight("#ff2200", 5.0, 20);
      beaconLight.position.set(0, 6.6, 0);
      group.add(beaconLight);

      const baseRingGeo = new THREE.TorusGeometry(1.8, 0.12, 8, 16);
      const baseRing = new THREE.Mesh(baseRingGeo, darkMetal);
      baseRing.position.y = 0.3;
      baseRing.rotation.x = Math.PI / 2;
      group.add(baseRing);

      for (let dmg = 0; dmg < 6; dmg++) {
        const rebar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8 + Math.random() * 0.8, 0.08), darkMetal);
        rebar.position.set(
          (Math.random() - 0.5) * 2.2,
          0.5 + Math.random() * 1.8,
          (Math.random() - 0.5) * 2.2,
        );
        rebar.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.6);
        group.add(rebar);
      }

      const scrapMat = new THREE.MeshStandardMaterial({ color: "#3a2a1e", roughness: 0.9, metalness: 0.5 });
      for (let sc = 0; sc < 4; sc++) {
        const scrapPiece = new THREE.Mesh(
          new THREE.BoxGeometry(0.3 + Math.random() * 0.5, 0.05 + Math.random() * 0.1, 0.2 + Math.random() * 0.3),
          scrapMat,
        );
        scrapPiece.position.set(
          (Math.random() - 0.5) * 2.0,
          Math.random() * 2.5,
          (Math.random() - 0.5) * 2.0,
        );
        scrapPiece.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
        group.add(scrapPiece);
      }

      group.add(base, top);
      group.traverse((c) => {
        if (c.isMesh) c.castShadow = c.receiveShadow = true;
      });
    }

    group.userData = {
      type: "obstacle",
      obstacleSpin: "none",
      damage: 35,
      collisionHalfX: 1.8,
      collisionHalfZ: 1.8,
      collisionFootprint: "circle",
      collisionRadius: 1.85,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 3.8,
      isWall: true,
    };
    return group;
  
}

export function createMutant(models) {

    const group = new THREE.Group();
    const variant = Math.floor(Math.random() * 3);
    const mScale = variant === 0 ? 1.3 : variant === 2 ? 0.85 : 1.05;
    const fleshColor = variant === 0 ? "#5a3d3a" : variant === 1 ? "#4a3528" : "#7a4a42";
    const fleshMat = new THREE.MeshStandardMaterial({ color: fleshColor, roughness: 0.8 });
    const boneMat = new THREE.MeshStandardMaterial({ color: "#d4c8b8", roughness: 0.6, metalness: 0.1 });
    const eyeColor = variant === 1 ? "#44ff00" : "#ff4400";
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    const veinMat = new THREE.MeshStandardMaterial({ color: "#3a1a1a", roughness: 0.9, transparent: true, opacity: 0.7 });

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(1.3 * mScale, 2.0 * mScale, 1.2 * mScale),
      fleshMat,
    );
    torso.position.y = 1.2 * mScale;
    torso.scale.set(1, variant === 0 ? 1.4 : 1.2, 0.85);
    group.add(torso);

    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.6 * mScale, 8, 6),
      new THREE.MeshStandardMaterial({ color: variant === 0 ? "#6a4a3a" : fleshColor, roughness: 0.85 }),
    );
    belly.position.set(0, 0.85 * mScale, 0.35 * mScale);
    belly.scale.set(1, 0.75, 0.7);
    group.add(belly);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.7 * mScale, 8, 6),
      fleshMat,
    );
    head.position.y = 2.55 * mScale;
    head.scale.set(variant === 2 ? 0.85 : 1.15, 0.85, 0.95);
    group.add(head);

    const jawMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.65 * mScale, 0.22 * mScale, 0.35 * mScale),
      new THREE.MeshStandardMaterial({ color: "#3a2a1a", roughness: 0.9 }),
    );
    jawMesh.position.set(0, 2.15 * mScale, 0.35 * mScale);
    group.add(jawMesh);

    for (let t = 0; t < 4; t++) {
      const fangGeo = new THREE.ConeGeometry(0.04 * mScale, 0.18 * mScale, 4);
      const fang = new THREE.Mesh(fangGeo, boneMat);
      fang.position.set((-0.15 + t * 0.1) * mScale, 2.08 * mScale, 0.45 * mScale);
      fang.rotation.x = Math.PI;
      group.add(fang);
    }

    const eyeCount = variant === 1 ? 4 : 2;
    for (let e = 0; e < eyeCount; e++) {
      const ex = (e - (eyeCount - 1) / 2) * 0.18 * mScale;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1 * mScale, 6, 5), eyeMat);
      eye.position.set(ex, 2.65 * mScale, 0.55 * mScale);
      group.add(eye);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 * mScale, 5, 4),
        new THREE.MeshBasicMaterial({ color: "#000" }),
      );
      pupil.position.set(ex, 2.65 * mScale, 0.62 * mScale);
      group.add(pupil);
    }

    const eyeGlow = new THREE.PointLight(eyeColor, 1.5, 5);
    eyeGlow.position.set(0, 2.65 * mScale, 0.65 * mScale);
    group.add(eyeGlow);

    const shoulderW = variant === 0 ? 0.55 : variant === 2 ? 0.4 : 0.48;
    for (const ax of [-1, 1]) {
      const shoulder = new THREE.Mesh(
        new THREE.SphereGeometry(shoulderW * mScale, 7, 5),
        fleshMat,
      );
      shoulder.position.set(ax * (0.75 * mScale), 1.85 * mScale, 0);
      shoulder.scale.set(1, 0.7, 0.8);
      group.add(shoulder);
    }

    const armGeo = new THREE.CylinderGeometry(0.2 * mScale, 0.28 * mScale, 1.6 * mScale, 7);
    for (const ax of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, fleshMat);
      arm.position.set(ax * 0.85 * mScale, 1.3 * mScale, 0);
      arm.rotation.z = ax > 0 ? -0.7 : 0.7;
      arm.rotation.x = -0.3;
      group.add(arm);

      const elbow = new THREE.Mesh(
        new THREE.SphereGeometry(0.18 * mScale, 6, 4),
        new THREE.MeshStandardMaterial({ color: "#4a3a2a", roughness: 0.9 }),
      );
      elbow.position.set(ax * (1.2 * mScale), 0.9 * mScale, 0.25 * mScale);
      group.add(elbow);

      if (variant === 1) {
        for (let b = 0; b < 2; b++) {
          const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06 * mScale, 0.9 * mScale, 4), boneMat);
          blade.position.set(ax * (1.5 + b * 0.3) * mScale, 0.25 * mScale, 0.3 * mScale);
          blade.rotation.set(0.6 + b * 0.3, 0, ax > 0 ? -0.8 : 0.8);
          group.add(blade);
        }
      } else {
        const clawCount = variant === 0 ? 5 : 4;
        for (let c = 0; c < clawCount; c++) {
          const claw = new THREE.Mesh(
            new THREE.ConeGeometry(0.07 * mScale, 0.45 * mScale, 4),
            boneMat,
          );
          claw.position.set(ax * (1.3 * mScale), (0.25 + c * 0.15) * mScale, 0.15 * mScale);
          claw.rotation.set((c - 1.5) * 0.35, 0, ax > 0 ? -0.6 : 0.6);
          group.add(claw);
        }
      }
    }

    const legH = variant === 0 ? 1.0 : 0.75;
    const legGeo = new THREE.CylinderGeometry(0.25 * mScale, 0.35 * mScale, legH * mScale, 7);
    for (const lx of [-0.35 * mScale, 0.35 * mScale]) {
      const leg = new THREE.Mesh(legGeo, fleshMat);
      leg.position.set(lx, legH * 0.45 * mScale, 0);
      group.add(leg);
      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.4 * mScale, 0.12 * mScale, 0.5 * mScale),
        new THREE.MeshStandardMaterial({ color: "#3a2a1a", roughness: 0.9 }),
      );
      foot.position.set(lx, 0.06 * mScale, 0.08 * mScale);
      group.add(foot);
      for (let tc = 0; tc < 3; tc++) {
        const toeClaw = new THREE.Mesh(
          new THREE.ConeGeometry(0.035 * mScale, 0.12 * mScale, 4),
          boneMat,
        );
        toeClaw.position.set(lx + (tc - 1) * 0.1 * mScale, 0.04 * mScale, 0.32 * mScale);
        toeClaw.rotation.x = Math.PI / 2;
        group.add(toeClaw);
      }
    }

    if (variant === 0) {
      for (let sp = 0; sp < 6; sp++) {
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.05 * mScale, 0.55 * mScale, 4), boneMat);
        spine.position.set((Math.random() - 0.5) * 0.4 * mScale, (1.4 + sp * 0.28) * mScale, -0.55 * mScale);
        spine.rotation.x = -0.7 - Math.random() * 0.3;
        group.add(spine);
      }
      for (let v = 0; v < 3; v++) {
        const vein = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02 * mScale, 0.015 * mScale, 0.6 * mScale, 4),
          veinMat,
        );
        vein.position.set((0.3 + v * 0.25) * mScale, (1.0 + v * 0.3) * mScale, 0.5 * mScale);
        vein.rotation.set(0.3, 0, 0.2 * (v % 2 === 0 ? 1 : -1));
        group.add(vein);
      }
    }

    if (variant === 1) {
      for (let p = 0; p < 5; p++) {
        const sackSize = 0.08 + Math.random() * 0.12;
        const sack = new THREE.Mesh(
          new THREE.SphereGeometry(sackSize * mScale, 7, 5),
          new THREE.MeshStandardMaterial({
            color: p % 2 === 0 ? "#88aa44" : "#aacc55",
            roughness: 0.6,
            transparent: true,
            opacity: 0.85,
            emissive: "#446600",
            emissiveIntensity: 0.4,
          }),
        );
        sack.position.set(
          (Math.random() - 0.5) * 0.7 * mScale,
          (0.7 + p * 0.35) * mScale,
          0.5 * mScale,
        );
        group.add(sack);
      }
      const droolMat = new THREE.MeshStandardMaterial({ color: "#668822", roughness: 0.95, transparent: true, opacity: 0.6 });
      for (let d = 0; d < 3; d++) {
        const drool = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02 * mScale, 0.015 * mScale, 0.25 + Math.random() * 0.3, 4),
          droolMat,
        );
        drool.position.set((-0.1 + d * 0.1) * mScale, 2.05 * mScale, 0.45 * mScale);
        drool.rotation.x = 0.2;
        group.add(drool);
      }
    }

    if (variant === 2) {
      const crestMat = new THREE.MeshStandardMaterial({ color: "#8a3030", roughness: 0.7, emissive: "#440000", emissiveIntensity: 0.5 });
      for (let cr = 0; cr < 4; cr++) {
        const crest = new THREE.Mesh(
          new THREE.ConeGeometry(0.06 * mScale, 0.3 * mScale, 4),
          crestMat,
        );
        crest.position.set(0, (2.8 + cr * 0.12) * mScale, -0.35 * mScale);
        crest.rotation.x = -0.5;
        group.add(crest);
      }
      for (let st = 0; st < 3; st++) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.4 * mScale, 0.04),
          new THREE.MeshStandardMaterial({ color: "#aa3030", emissive: "#660000", emissiveIntensity: 0.5 }),
        );
        stripe.position.set(0.5 * mScale, (1.0 + st * 0.5) * mScale, 0.55 * mScale);
        stripe.rotation.set(0, 0, 0.3);
        group.add(stripe);
      }
    }

    group.traverse((c) => {
      if (c.isMesh) c.castShadow = c.receiveShadow = true;
    });

    group.userData = {
      type: "enemy",
      isEnemy: true,
      damage: variant === 0 ? 35 : variant === 1 ? 25 : 22,
      collisionHalfX: 0.85 * mScale,
      collisionHalfZ: 0.8 * mScale,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 2.6 * mScale,
      projectileY: 1.5 * mScale,
      shotCooldown: (variant === 0 ? 1.8 : variant === 1 ? 1.2 : 0.9) + Math.random() * 1.2,
      laneTarget: 0,
      rewardCoins: variant === 0 ? 4 : variant === 1 ? 3 : 2,
      rewardAmmo: variant === 0 ? 3 : 2,
    };
    return group;
  
}
