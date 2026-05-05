import * as THREE from "three";

export function createTerrainTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext("2d");

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext("2d");

  ctx.fillStyle = "#c2834b";
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = "#e6e6e6";
  rCtx.fillRect(0, 0, size, size);

  for (let layer = 0; layer < 3; layer++) {
    const scale = Math.pow(2, layer);
    const count = 420 * scale;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const w = (2 + Math.random() * 5) / scale;
      const h = (2 + Math.random() * 5) / scale;

      const val = Math.random();
      const a = 0.05 + val * 0.1;

      ctx.fillStyle = `rgba(${120 + val * 100}, ${70 + val * 80}, ${30 + val * 60}, ${a})`;
      ctx.fillRect(x, y, w, h);

      const bv = Math.floor(80 + val * 100);
      bCtx.fillStyle = `rgba(${bv}, ${bv}, ${bv}, ${0.3 + a})`;
      bCtx.fillRect(x, y, w, h);

      if (val > 0.9) {
        rCtx.fillStyle = "rgba(150, 150, 150, 0.8)";
        rCtx.fillRect(x, y, w, h);
      }
    }
  }

  for (let w = 0; w < 8; w += 1) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    const alpha = 0.1 + Math.random() * 0.15;
    ctx.strokeStyle = `rgba(60, 40, 20, ${alpha})`;
    ctx.lineWidth = 2 + Math.random() * 4;
    bCtx.strokeStyle = `rgba(30, 30, 30, ${0.5 + Math.random() * 0.3})`;
    bCtx.lineWidth = 3 + Math.random() * 5;

    ctx.beginPath();
    bCtx.beginPath();
    for (let s = 0; s < 30; s += 1) {
      const ang = s * 0.2 + w;
      const r = 10 + s * 4;
      const px = sx + Math.cos(ang) * r;
      const py = sy + Math.sin(ang * 0.5) * r * 0.5;
      if (s === 0) {
        ctx.moveTo(px, py);
        bCtx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
        bCtx.lineTo(px, py);
      }
    }
    ctx.stroke();
    bCtx.stroke();
  }

  ctx.strokeStyle = "rgba(30, 20, 10, 0.55)";
  ctx.lineWidth = 1.5;
  bCtx.strokeStyle = "rgba(15, 15, 15, 0.7)";
  bCtx.lineWidth = 2;
  rCtx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  rCtx.lineWidth = 1;
  for (let c = 0; c < 8; c++) {
    const cx = 50 + Math.random() * (size - 100);
    const cy = 50 + Math.random() * (size - 100);
    const segments = 5 + Math.floor(Math.random() * 6);
    ctx.beginPath();
    bCtx.beginPath();
    rCtx.beginPath();
    for (let s = 0; s <= segments; s++) {
      const ang = (s / segments) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 15 + Math.random() * 50;
      const px = cx + Math.cos(ang) * dist;
      const py = cy + Math.sin(ang) * dist;
      if (s === 0) {
        ctx.moveTo(px, py);
        bCtx.moveTo(px, py);
        rCtx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
        bCtx.lineTo(px, py);
        rCtx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.stroke();
    bCtx.stroke();
    rCtx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  return { map, bumpMap, roughnessMap };
}

export function createShoulderTexture() {
  const sizeX = 128;
  const sizeY = 512;
  const canvas = document.createElement("canvas");
  canvas.width = sizeX;
  canvas.height = sizeY;
  const ctx = canvas.getContext("2d");

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = sizeX;
  bumpCanvas.height = sizeY;
  const bCtx = bumpCanvas.getContext("2d");

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = sizeX;
  roughCanvas.height = sizeY;
  const rCtx = roughCanvas.getContext("2d");

  const edge = ctx.createLinearGradient(0, 0, sizeX, 0);
  edge.addColorStop(0, "#8a6344");
  edge.addColorStop(0.3, "#bd926f");
  edge.addColorStop(0.7, "#d1a784");
  edge.addColorStop(1, "#9e6f4a");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, sizeX, sizeY);

  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, sizeX, sizeY);

  rCtx.fillStyle = "#e0e0e0";
  rCtx.fillRect(0, 0, sizeX, sizeY);

  for (let i = 0; i < 220; i += 1) {
    const isRock = Math.random() > 0.78;
    ctx.fillStyle = isRock
      ? `rgba(60, 50, 40, ${Math.random() * 0.45})`
      : `rgba(255, 230, 200, ${Math.random() * 0.15})`;
    const x = Math.random() * sizeX;
    const y = Math.random() * sizeY;
    const w = 2 + Math.random() * 8;
    const h = 3 + Math.random() * 14;
    ctx.fillRect(x, y, w, h);

    bCtx.fillStyle = isRock ? "rgba(180, 180, 180, 0.85)" : "rgba(120, 120, 120, 0.5)";
    bCtx.fillRect(x, y, w, h);

    if (isRock) {
      rCtx.fillStyle = "rgba(100, 100, 100, 0.8)";
      rCtx.fillRect(x, y, w, h);
    }
  }

  for (let t = 0; t < 8; t++) {
    const tx = 20 + Math.random() * (sizeX - 40);
    const ty = Math.random() * sizeY;
    const trashColor =
      Math.random() > 0.5 ? "rgba(180, 60, 30, 0.55)" : "rgba(140, 140, 130, 0.5)";
    ctx.fillStyle = trashColor;
    ctx.fillRect(tx, ty, 5 + Math.random() * 10, 4 + Math.random() * 14);
    bCtx.fillStyle = "rgba(140, 140, 140, 0.9)";
    bCtx.fillRect(tx, ty, 6 + Math.random() * 10, 5 + Math.random() * 14);
  }

  for (let g = 0; g < 12; g++) {
    const gx = 30 + Math.random() * (sizeX - 60);
    const gy = Math.random() * sizeY;
    ctx.fillStyle = "rgba(255, 255, 240, 0.3)";
    ctx.fillRect(gx, gy, 1 + Math.random() * 3, 1 + Math.random() * 3);
    rCtx.fillStyle = "rgba(40, 40, 40, 0.9)";
    rCtx.fillRect(gx, gy, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }

  ctx.fillStyle = "rgba(20, 15, 10, 0.15)";
  bCtx.fillStyle = "rgba(40, 40, 40, 0.2)";
  rCtx.fillStyle = "rgba(80, 80, 80, 0.3)";
  for (let i = 0; i < 5; i++) {
    const trackX = 40 + Math.random() * 100;
    ctx.fillRect(trackX, 0, 14, sizeY);
    bCtx.fillRect(trackX, 0, 14, sizeY);
    rCtx.fillRect(trackX, 0, 14, sizeY);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  return { map, bumpMap, roughnessMap };
}

export function createRoadTexture() {
  const sizeX = 256;
  const sizeY = 512;
  const canvas = document.createElement("canvas");
  canvas.width = sizeX;
  canvas.height = sizeY;
  const ctx = canvas.getContext("2d");

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = sizeX;
  bumpCanvas.height = sizeY;
  const bCtx = bumpCanvas.getContext("2d");

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = sizeX;
  roughCanvas.height = sizeY;
  const rCtx = roughCanvas.getContext("2d");

  ctx.fillStyle = "#2c2522";
  ctx.fillRect(0, 0, sizeX, sizeY);
  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, sizeX, sizeY);
  rCtx.fillStyle = "#b0b0b0";
  rCtx.fillRect(0, 0, sizeX, sizeY);

  const edgeGradient = ctx.createLinearGradient(0, 0, sizeX, 0);
  edgeGradient.addColorStop(0, "#4a3e35");
  edgeGradient.addColorStop(0.12, "#2c2522");
  edgeGradient.addColorStop(0.88, "#2c2522");
  edgeGradient.addColorStop(1, "#4a3e35");
  ctx.fillStyle = edgeGradient;
  ctx.fillRect(0, 0, sizeX, sizeY);

  for (let i = 0; i < 450; i += 1) {
    const isDark = Math.random() > 0.5;
    ctx.fillStyle = isDark
      ? `rgba(15, 10, 10, ${Math.random() * 0.2})`
      : `rgba(200, 200, 200, ${Math.random() * 0.08})`;
    const x = Math.random() * sizeX;
    const y = Math.random() * sizeY;
    const w = 2 + Math.random() * 12;
    const h = 4 + Math.random() * 20;
    ctx.fillRect(x, y, w, h);

    bCtx.fillStyle = isDark ? "rgba(60, 60, 60, 0.7)" : "rgba(160, 160, 160, 0.5)";
    bCtx.fillRect(x, y, w, h);

    if (isDark) {
      rCtx.fillStyle = "rgba(140, 140, 140, 0.5)";
      rCtx.fillRect(x, y, w, h);
    }
  }

  ctx.strokeStyle = "rgba(200, 180, 150, 0.85)";
  ctx.lineWidth = 20;
  ctx.setLineDash([100, 120]);
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(sizeX / 2, -50);
  ctx.lineTo(sizeX / 2, sizeY + 50);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.lineWidth = 15;
  ctx.strokeStyle = "rgba(180, 170, 140, 0.6)";
  ctx.beginPath();
  ctx.moveTo(sizeX * 0.1, -50);
  ctx.lineTo(sizeX * 0.1, sizeY + 50);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sizeX * 0.9, -50);
  ctx.lineTo(sizeX * 0.9, sizeY + 50);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
  for (let c = 0; c < 6; c++) {
    let cx = Math.random() * sizeX;
    let cy = Math.random() * sizeY;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let seg = 0; seg < 5; seg++) {
      cx += (Math.random() - 0.5) * 40;
      cy += Math.random() * 60;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  bCtx.strokeStyle = "rgba(180, 180, 180, 0.8)";
  bCtx.lineWidth = 20;
  bCtx.setLineDash([100, 120]);
  bCtx.beginPath();
  bCtx.moveTo(sizeX / 2, -50);
  bCtx.lineTo(sizeX / 2, sizeY + 50);
  bCtx.stroke();
  bCtx.setLineDash([]);

  bCtx.lineWidth = 15;
  bCtx.beginPath();
  bCtx.moveTo(sizeX * 0.1, -50);
  bCtx.lineTo(sizeX * 0.1, sizeY + 50);
  bCtx.moveTo(sizeX * 0.9, -50);
  bCtx.lineTo(sizeX * 0.9, sizeY + 50);
  bCtx.stroke();

  rCtx.strokeStyle = "rgba(100, 100, 100, 0.9)";
  rCtx.lineWidth = 20;
  rCtx.setLineDash([100, 120]);
  rCtx.beginPath();
  rCtx.moveTo(sizeX / 2, -50);
  rCtx.lineTo(sizeX / 2, sizeY + 50);
  rCtx.stroke();
  rCtx.setLineDash([]);

  ctx.strokeStyle = "rgba(255, 223, 181, 0.55)";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(40, 0);
  ctx.lineTo(40, sizeY);
  ctx.moveTo(sizeX - 40, 0);
  ctx.lineTo(sizeX - 40, sizeY);
  ctx.stroke();

  ctx.fillStyle = "rgba(10, 8, 8, 0.6)";
  rCtx.fillStyle = "rgba(60, 60, 60, 0.8)";
  for (let k = 0; k < 3; k++) {
    const startX = 150 + Math.random() * (sizeX - 300);
    const width = 16 + Math.random() * 8;
    ctx.fillRect(startX, Math.random() * sizeY, width, 100 + Math.random() * 400);
    rCtx.fillRect(startX, Math.random() * sizeY, width, 100 + Math.random() * 400);
  }

  for (let p = 0; p < 4; p++) {
    const px = 80 + Math.random() * (sizeX - 160);
    const py = Math.random() * sizeY;
    const pw = 30 + Math.random() * 70;
    const ph = 20 + Math.random() * 100;
    const patchColor = Math.random() > 0.5 ? "#3a302d" : "#38302c";
    ctx.fillStyle = patchColor;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    bCtx.fillStyle = Math.random() > 0.5 ? "#a0a0a0" : "#909090";
    bCtx.fillRect(px, py, pw, ph);
    rCtx.fillStyle = Math.random() > 0.5 ? "#c0c0c0" : "#a8a8a8";
    rCtx.fillRect(px, py, pw, ph);
  }

  for (let ph = 0; ph < 6; ph++) {
    const px = Math.random() * sizeX;
    const py = Math.random() * sizeY;
    const pr = 6 + Math.random() * 18;
    const potGrad = ctx.createRadialGradient(px, py, pr * 0.1, px, py, pr);
    potGrad.addColorStop(0, "rgba(2, 2, 2, 0.95)");
    potGrad.addColorStop(0.5, "rgba(5, 3, 3, 0.7)");
    potGrad.addColorStop(1, "rgba(20, 15, 15, 0.25)");
    ctx.fillStyle = potGrad;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    bCtx.fillStyle = "rgba(25, 25, 25, 1)";
    bCtx.beginPath();
    bCtx.arc(px, py, pr * 0.8, 0, Math.PI * 2);
    bCtx.fill();
    rCtx.fillStyle = "rgba(255, 255, 255, 0.7)";
    rCtx.beginPath();
    rCtx.arc(px, py, pr, 0, Math.PI * 2);
    rCtx.fill();
  }

  for (let o = 0; o < 5; o++) {
    const ox = Math.random() * sizeX;
    const oy = Math.random() * sizeY;
    const or = 20 + Math.random() * 40;

    const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, or);
    grad.addColorStop(0, "rgba(5, 5, 5, 0.85)");
    grad.addColorStop(1, "rgba(5, 5, 5, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ox, oy, or, 0, Math.PI * 2);
    ctx.fill();

    const rGrad = rCtx.createRadialGradient(ox, oy, 0, ox, oy, or);
    rGrad.addColorStop(0, "rgba(20, 20, 20, 0.9)");
    rGrad.addColorStop(1, "rgba(176, 176, 176, 0)");
    rCtx.fillStyle = rGrad;
    rCtx.beginPath();
    rCtx.arc(ox, oy, or, 0, Math.PI * 2);
    rCtx.fill();
  }

  ctx.globalAlpha = 0.65;
  ctx.strokeStyle = "#0a0807";
  bCtx.globalAlpha = 0.9;
  bCtx.strokeStyle = "#202020";
  rCtx.globalAlpha = 0.9;
  rCtx.strokeStyle = "#ffffff";

  for (let c = 0; c < 12; c += 1) {
    let x = 60 + Math.random() * (sizeX - 120);
    let y = -50 + Math.random() * sizeY;
    const lw = 1 + Math.random() * 3.5;
    ctx.lineWidth = lw;
    bCtx.lineWidth = lw;
    rCtx.lineWidth = lw;

    const isWideCrack = c < 10;
    if (isWideCrack) {
      ctx.lineWidth = lw + 1.5;
      bCtx.lineWidth = lw + 1.5;
    }

    ctx.beginPath();
    bCtx.beginPath();
    rCtx.beginPath();
    ctx.moveTo(x, y);
    bCtx.moveTo(x, y);
    rCtx.moveTo(x, y);

    const segments = 12 + Math.floor(Math.random() * 14);
    for (let s = 0; s < segments; s += 1) {
      x += (Math.random() - 0.5) * 32 + 4;
      y += (Math.random() - 0.5) * 22;
      ctx.lineTo(x, y);
      bCtx.lineTo(x, y);
      rCtx.lineTo(x, y);

      const branchChance = isWideCrack ? 0.6 : 0.45;
      if (Math.random() > (1 - branchChance)) {
        let bx = x;
        let by = y;
        ctx.moveTo(bx, by);
        bCtx.moveTo(bx, by);
        rCtx.moveTo(bx, by);
        const bSegments = 4 + Math.floor(Math.random() * 8);
        for (let bs = 0; bs < bSegments; bs++) {
          bx += (Math.random() - 0.5) * 18;
          by += (Math.random() - 0.5) * 18;
          ctx.lineTo(bx, by);
          bCtx.lineTo(bx, by);
          rCtx.lineTo(bx, by);
        }
        ctx.moveTo(x, y);
        bCtx.moveTo(x, y);
        rCtx.moveTo(x, y);
      }
    }
    ctx.stroke();
    bCtx.stroke();
    rCtx.stroke();
  }
  ctx.globalAlpha = 1;
  bCtx.globalAlpha = 1;
  rCtx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  return { map, bumpMap, roughnessMap };
}
