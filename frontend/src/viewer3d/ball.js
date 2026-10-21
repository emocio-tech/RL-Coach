import * as THREE from "three";
import { BALL_RADIUS } from "./constants.js";

function ballTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext("2d");
  g.fillStyle = "#dfe6f7";
  g.fillRect(0, 0, 1024, 512);
  // Hexagonal panels with glowing seams.
  const size = 46;
  const h = size * Math.sqrt(3);
  for (let row = -1; row < 512 / h + 2; row++) {
    for (let col = -1; col < 1024 / (size * 1.5) + 2; col++) {
      const cx = col * size * 1.5;
      const cy = row * h + (col % 2 ? h / 2 : 0);
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        g.lineTo(cx + size * Math.cos(a), cy + size * Math.sin(a));
      }
      g.closePath();
      const dark = (row * 7 + col * 13) % 5 === 0;
      g.fillStyle = dark ? "#262c44" : "#c7d1ea";
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = "#8fb4ff";
      g.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function haloTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.35, "rgba(160,190,255,0.35)");
  grad.addColorStop(1, "rgba(160,190,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

// The ball in Rocket League coordinates, with a soft halo that grows with its speed.
export function buildBall() {
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 64, 32),
    new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.32, metalness: 0.2, emissive: 0x2a3550, emissiveIntensity: 0.6 })
  );
  sphere.castShadow = true;
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: haloTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
  );
  halo.scale.set(BALL_RADIUS * 5, BALL_RADIUS * 5, 1);
  group.add(sphere, halo);
  group.userData = { sphere, halo };
  return group;
}
