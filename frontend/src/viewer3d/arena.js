import * as THREE from "three";
import { ARENA, BIG_PADS, SMALL_PADS, TEAM_COLORS } from "./constants.js";

const { halfWidth: W, halfLength: L, height: H, goalHalfWidth: GW, goalHeight: GH, goalDepth: GD, chamfer: C, cove: R } = ARENA;

// ---------------------------------------------------------------- helpers

function canvasTexture(width, height, draw, { repeat = false, anisotropy = 8 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Counter-clockwise outline of the playing field (octagon: rectangle with diagonal corners).
function outline() {
  return [
    [-W + C, -L], [W - C, -L], [W, -L + C], [W, L - C],
    [W - C, L], [-W + C, L], [-W, L - C], [-W, -L + C],
  ];
}

// Offsets a convex CCW polygon by `d` towards the inside (negative = outwards), with mitred corners.
function offsetLoop(points, d) {
  const n = points.length;
  const normals = points.map((p, i) => {
    const q = points[(i + 1) % n];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    return [-dy / len, dx / len];
  });
  return points.map((p, i) => {
    const a = normals[(i + n - 1) % n];
    const b = normals[i];
    const k = 1 + a[0] * b[0] + a[1] * b[1];
    return [p[0] + ((a[0] + b[0]) / k) * d, p[1] + ((a[1] + b[1]) / k) * d];
  });
}

// Sweeps a (distance inwards, height) profile along the outline. Back walls leave the goal mouths open.
function sweep(points, profile, { colorAt, openGoals = false, uvScale = 1000 } = {}) {
  const positions = [];
  const uvs = [];
  const colors = [];
  const n = points.length;
  const loops = profile.map(([d]) => offsetLoop(points, d));

  const perimeter = [0];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    perimeter.push(perimeter[i] + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  const arc = [0];
  for (let k = 1; k < profile.length; k++) {
    arc.push(arc[k - 1] + Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]));
  }

  const vertex = (k, i, s) => {
    const a = loops[k][i];
    const b = loops[k][(i + 1) % n];
    const x = a[0] + (b[0] - a[0]) * s;
    const y = a[1] + (b[1] - a[1]) * s;
    const z = profile[k][1];
    positions.push(x, y, z);
    uvs.push((perimeter[i] + (perimeter[i + 1] - perimeter[i]) * s) / uvScale, arc[k] / uvScale);
    const c = colorAt ? colorAt(x, y, z) : [1, 1, 1];
    colors.push(c[0], c[1], c[2]);
  };

  const quad = (k, i, s0, s1) => {
    // Counter-clockwise seen from inside the arena, so back-face culling hides the walls from outside.
    vertex(k, i, s0); vertex(k + 1, i, s1); vertex(k, i, s1);
    vertex(k, i, s0); vertex(k + 1, i, s0); vertex(k + 1, i, s1);
  };

  for (let k = 0; k < profile.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const q = points[(i + 1) % n];
      const isBackWall = Math.abs(p[1]) === L && Math.abs(q[1]) === L;
      const lowStrip = profile[k][1] <= GH + 0.5 && profile[k + 1][1] <= GH + 0.5;
      if (openGoals && isBackWall && lowStrip) {
        const span = q[0] - p[0];
        const s0 = (-GW - p[0]) / span;
        const s1 = (GW - p[0]) / span;
        const [lo, hi] = s0 < s1 ? [s0, s1] : [s1, s0];
        quad(k, i, 0, lo);
        quad(k, i, hi, 1);
      } else {
        quad(k, i, 0, 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function arc(radius, from, to, steps, f) {
  const out = [];
  for (let s = 0; s <= steps; s++) {
    const a = from + ((to - from) * s) / steps;
    out.push(f(radius, a));
  }
  return out;
}

function wallProfile() {
  const bottom = arc(R, 0, Math.PI / 2, 10, (r, a) => [r * (1 - Math.sin(a)), r * (1 - Math.cos(a))]);
  const top = arc(R, 0, Math.PI / 2, 10, (r, b) => [r * (1 - Math.cos(b)), H - r + r * Math.sin(b)]);
  return [...bottom, [0, GH], [0, 1100], [0, H - R], ...top.slice(0, -1), top[top.length - 1]];
}

const TEAM_NEUTRAL = new THREE.Color(0x9fb4e8);
const BLUE = new THREE.Color(TEAM_COLORS[0].main);
const ORANGE = new THREE.Color(TEAM_COLORS[1].main);

// Walls take the colour of the team defending the nearest goal (team 0 defends y < 0).
function wallColor(x, y) {
  const t = Math.min(1, Math.max(0, (Math.abs(y) - 2200) / 2900));
  const k = t * t * (3 - 2 * t) * 0.85;
  const c = TEAM_NEUTRAL.clone().lerp(y < 0 ? BLUE : ORANGE, k);
  return [c.r, c.g, c.b];
}

// ---------------------------------------------------------------- textures

function floorTexture() {
  return canvasTexture(2048, 2560, (g, w, h) => {
    const px = (x) => ((x + W) / (2 * W)) * w;
    const py = (y) => ((L - y) / (2 * L)) * h;
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, "#1c3f7c");
    base.addColorStop(0.5, "#1f2f52");
    base.addColorStop(1, "#6a3a1b");
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // Mowing-like stripes along the length of the field.
    for (let y = -L; y < L; y += 640) {
      g.fillStyle = Math.round((y + L) / 640) % 2 ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.03)";
      g.fillRect(0, py(y + 640), w, py(y) - py(y + 640));
    }
    // Team tinted ends.
    const blue = g.createLinearGradient(0, py(-L), 0, py(-L + 2600));
    blue.addColorStop(0, "rgba(21,87,224,0.55)");
    blue.addColorStop(1, "rgba(21,87,224,0)");
    g.fillStyle = blue;
    g.fillRect(0, py(-L + 2600), w, py(-L) - py(-L + 2600));
    const orange = g.createLinearGradient(0, py(L), 0, py(L - 2600));
    orange.addColorStop(0, "rgba(255,138,31,0.55)");
    orange.addColorStop(1, "rgba(255,138,31,0)");
    g.fillStyle = orange;
    g.fillRect(0, py(L), w, py(L - 2600) - py(L));
    // Markings.
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(0, py(0));
    g.lineTo(w, py(0));
    g.stroke();
    g.beginPath();
    g.arc(px(0), py(0), (800 / (2 * W)) * w, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath();
    g.arc(px(0), py(0), 7, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.55;
    for (const s of [-1, 1]) {
      g.strokeRect(px(-2000), s < 0 ? py(-L + 1500) : py(L), px(2000) - px(-2000), py(-L) - py(-L + 1500));
      g.strokeRect(px(-GW - 160), s < 0 ? py(-L + 420) : py(L), px(GW + 160) - px(-GW - 160), py(-L) - py(-L + 420));
    }
    g.globalAlpha = 1;
    g.lineWidth = 6;
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.strokeRect(2, 2, w - 4, h - 4);
  });
}

function panelTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#e8eeff";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#7d8dc4";
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.stroke();
  }, { repeat: true });
}

function netTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
  }, { repeat: true });
}

function crowdTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = "#0e1328";
    g.fillRect(0, 0, w, h);
    const palette = ["#2f66e8", "#ff9a3d", "#e9ecff", "#8892b8", "#4a5578", "#1d2547"];
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = palette[Math.floor(rand() * palette.length)];
      g.globalAlpha = 0.35 + rand() * 0.5;
      g.fillRect(rand() * w, rand() * h, 5 + rand() * 4, 6 + rand() * 4);
    }
    g.globalAlpha = 0.25;
    g.fillStyle = "#000";
    for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 3);
  }, { repeat: true });
}

// ---------------------------------------------------------------- arena parts

function buildFloor() {
  const shape = new THREE.Shape(outline().map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ShapeGeometry(shape);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W) / (2 * W), (pos.getY(i) + L) / (2 * L));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.42, metalness: 0.12 })
  );
  mesh.receiveShadow = true;
  return mesh;
}

function buildWalls() {
  const walls = new THREE.Mesh(
    sweep(outline(), wallProfile(), { colorAt: (x, y) => wallColor(x, y), openGoals: true }),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: panelTexture(),
      transparent: true,
      opacity: 0.4,
      side: THREE.FrontSide,
      metalness: 0.1,
      roughness: 0.55,
      depthWrite: false,
      emissive: 0x0a1433,
    })
  );
  walls.renderOrder = 2;

  const ceilingShape = new THREE.Shape(offsetLoop(outline(), R).map(([x, y]) => new THREE.Vector2(x, y)));
  const ceiling = new THREE.Mesh(
    new THREE.ShapeGeometry(ceilingShape),
    new THREE.MeshBasicMaterial({ color: 0x4d6fd0, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })
  );
  ceiling.position.z = H;

  // Glowing trims at the base of the walls and along the ceiling.
  const trimPoints = (d, z) => offsetLoop(outline(), d).map(([x, y]) => new THREE.Vector3(x, y, z));
  const trim = (d, z, opacity) => {
    const pts = trimPoints(d, z);
    const colors = [];
    for (const p of pts) {
      const c = new THREE.Color(wallColor(p.x, p.y)[0], wallColor(p.x, p.y)[1], wallColor(p.x, p.y)[2]).multiplyScalar(1.6);
      colors.push(c.r, c.g, c.b);
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity }));
  };

  const group = new THREE.Group();
  group.add(walls, ceiling, trim(R, 4, 0.9), trim(0, R, 0.6), trim(0, H - R, 0.6), trim(R, H - 4, 0.5));
  return group;
}

function buildGoal(side) {
  const team = side < 0 ? 0 : 1;
  const color = TEAM_COLORS[team].main;
  const group = new THREE.Group();
  const y0 = side * L;
  const y1 = side * (L + GD);
  const net = netTexture();
  net.repeat.set(10, 4);
  const netMaterial = (rx, ry) => {
    const texture = net.clone();
    texture.needsUpdate = true;
    texture.repeat.set(rx, ry);
    return new THREE.MeshBasicMaterial({ map: texture, color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  };

  const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * GW, GH), netMaterial(12, 5));
  back.rotation.x = Math.PI / 2;
  back.position.set(0, y1, GH / 2);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(2 * GW, GD), netMaterial(12, 8));
  roof.position.set(0, (y0 + y1) / 2, GH);
  const sides = [-1, 1].map((sx) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(GD, GH), netMaterial(8, 5));
    m.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    m.position.set(sx * GW, (y0 + y1) / 2, GH / 2);
    return m;
  });

  const frame = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, roughness: 0.4 });
  const post = (x) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(44, 44, GH + 22), frame);
    m.position.set(x, y0, (GH + 22) / 2);
    return m;
  };
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2 * GW + 44, 44, 44), frame);
  bar.position.set(0, y0, GH + 22);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2 * GW, 30, 30), frame);
  rail.position.set(0, y1, GH);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * GW, GD),
    new THREE.MeshStandardMaterial({ color: 0x0c1226, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 })
  );
  floor.position.set(0, (y0 + y1) / 2, 1);
  floor.receiveShadow = true;

  const light = new THREE.PointLight(color, 2.2e5, 2600, 1.6);
  light.position.set(0, side * (L + GD * 0.45), GH * 0.6);
  group.add(back, roof, ...sides, post(-GW), post(GW), bar, rail, floor, light);
  return group;
}

function buildPads() {
  const group = new THREE.Group();
  const pads = []; // handles used to animate the pads: { x, y, big, materials: [{ material, emissive, opacity }] }
  const handle = (x, y, big, materials) => ({
    x, y, big, materials: materials.map((material) => ({ material, emissive: material.emissiveIntensity, opacity: material.opacity, color: material.color.clone() })),
  });
  const hex = (radius, height) => new THREE.CylinderGeometry(radius, radius, height, 6).rotateX(Math.PI / 2);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2f4a, roughness: 0.6, metalness: 0.4 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xffa02e, emissive: 0xffa02e, emissiveIntensity: 1.3 });
  for (const [x, y] of SMALL_PADS) {
    const base = new THREE.Mesh(hex(78, 3), baseMaterial);
    base.position.set(x, y, 1.5);
    const core = new THREE.Mesh(hex(58, 4), glow.clone()); // one material per pad: each one is animated on its own
    core.position.set(x, y, 3);
    group.add(base, core);
    pads.push(handle(x, y, false, [core.material]));
  }
  for (const [x, y] of BIG_PADS) {
    const base = new THREE.Mesh(hex(170, 6), baseMaterial);
    base.position.set(x, y, 3);
    const core = new THREE.Mesh(hex(130, 8), glow.clone());
    core.position.set(x, y, 6);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(62, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xffc766, emissive: 0xffb23d, emissiveIntensity: 1.5, transparent: true, opacity: 0.9 })
    );
    orb.position.set(x, y, 95);
    group.add(base, core, orb);
    pads.push(handle(x, y, true, [core.material, orb.material]));
  }
  glow.dispose();
  return { group, pads };
}

function buildStands() {
  const texture = crowdTexture();
  texture.repeat.set(1, 1);
  const profile = [[-700, 0], [-1000, 260], [-1900, 900], [-2800, 1500], [-3700, 2150], [-4700, 2750], [-4700, 3150]];
  const stands = new THREE.Mesh(
    sweep(outline(), profile, { colorAt: () => [1, 1, 1], uvScale: 700 }),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, side: THREE.DoubleSide, emissive: 0x0c1020, emissiveIntensity: 1 })
  );

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90000, 90000),
    new THREE.MeshStandardMaterial({ color: 0x070b18, roughness: 1 })
  );
  ground.position.z = -6;
  ground.receiveShadow = true;

  const towers = new THREE.Group();
  const towerMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2038, roughness: 0.8 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfe8ff, emissiveIntensity: 2.2 });
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = sx * (W + 5200);
      const y = sy * (L + 4300);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(180, 180, 4600), towerMaterial);
      pole.position.set(x, y, 2300);
      const head = new THREE.Mesh(new THREE.BoxGeometry(900, 160, 520), lamp);
      head.position.set(x, y, 4700);
      head.lookAt(0, 0, 1000);
      towers.add(pole, head);
    }
  }
  const group = new THREE.Group();
  group.add(stands, ground, towers);
  return group;
}

// ---------------------------------------------------------------- public

// Arena in Rocket League coordinates (z up). Add `group` to a group that converts to three.js axes.
// `pads` are the handles of the boost pads: { x, y, big, materials: [{ material, emissive, opacity }] }.
export function buildArena() {
  const group = new THREE.Group();
  const pads = buildPads();
  group.add(buildFloor(), buildWalls(), buildGoal(-1), buildGoal(1), pads.group, buildStands());
  return { group, pads: pads.pads };
}

// Night sky dome, in three.js coordinates.
export function buildSky() {
  const texture = canvasTexture(1024, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#04071a");
    sky.addColorStop(0.55, "#0c1740");
    sky.addColorStop(0.85, "#2a2150");
    sky.addColorStop(1, "#4a2a44");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 380; i++) {
      g.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.6})`;
      const s = rand() < 0.1 ? 2 : 1;
      g.fillRect(rand() * w, rand() * h * 0.55, s, s);
    }
  });
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(45000, 32, 16),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  dome.renderOrder = -1;
  return dome;
}
