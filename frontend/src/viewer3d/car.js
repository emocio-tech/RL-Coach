import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hitboxFor, TEAM_COLORS } from "./constants.js";

// Side silhouette of a car as fractions of its hitbox: [x (-0.5 tail .. 0.5 nose), z (0 bottom .. 1 roof)].
const BODY = [
  [0.5, 0.06], [0.5, 0.36], [0.4, 0.46], [0.12, 0.54], [-0.34, 0.54], [-0.43, 0.56], [-0.5, 0.52], [-0.5, 0.06],
];
const CABIN = [[0.1, 0.52], [-0.05, 0.97], [-0.3, 0.99], [-0.42, 0.58]];
const ROOF = [[-0.03, 0.965], [-0.31, 0.985], [-0.31, 1.0], [-0.03, 1.0]];
const REST_HEIGHT = 17; // height of the origin of a car resting on the floor

function extrudeProfile(points, hb, width, bevel) {
  const [length, , height] = hb.size;
  const [ox, , oz] = hb.offset;
  const shape = new THREE.Shape(
    points.map(([fx, fz]) => new THREE.Vector2(ox + fx * length, oz - height / 2 + fz * height))
  );
  const depth = Math.max(1, width - 2 * bevel);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 4,
  });
  geometry.rotateX(Math.PI / 2); // shape y -> local z, extrusion -> local y
  geometry.translate(0, depth / 2, 0);
  geometry.computeVertexNormals();
  return geometry;
}

// Materials and geometries shared by all the cars of an engine (created once, disposed with the scene).
// The paint is NOT in the kit: it is per car (team colour). Wheel geometries depend on the radius and are cached by it.
export function makeCarKit() {
  const wheelGeometries = new Map();
  return {
    tire: new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xc9d2e8, metalness: 0.95, roughness: 0.22 }),
    spokes: new THREE.MeshStandardMaterial({ color: 0x20263a, metalness: 0.8, roughness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x080d1e, metalness: 0.9, roughness: 0.06 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x12162a, roughness: 0.55, metalness: 0.5 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdde8ff, emissiveIntensity: 3 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 3 }),
    // { tire, rim, spokes } geometries of a wheel of this radius and width; the 5 spokes are merged into one geometry.
    wheelGeometry(radius, width) {
      const key = `${radius}/${width}`;
      let entry = wheelGeometries.get(key);
      if (!entry) {
        const spokes = [];
        for (let i = 0; i < 5; i++) {
          spokes.push(new THREE.BoxGeometry(radius * 1.2, width + 1.8, radius * 0.16).rotateY((i * Math.PI * 2) / 5));
        }
        entry = {
          tire: new THREE.CylinderGeometry(radius, radius, width, 24),
          rim: new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, width + 1.2, 20),
          spokes: mergeGeometries(spokes),
        };
        for (const g of spokes) g.dispose();
        wheelGeometries.set(key, entry);
      }
      return entry;
    },
  };
}

// A wheel is a group of 3 meshes (tire, rim, merged spokes) that rotates around its y axis.
function buildWheel(kit, radius, width) {
  const geometry = kit.wheelGeometry(radius, width);
  const wheel = new THREE.Group();
  wheel.add(
    new THREE.Mesh(geometry.tire, kit.tire),
    new THREE.Mesh(geometry.rim, kit.rim),
    new THREE.Mesh(geometry.spokes, kit.spokes)
  );
  return wheel;
}

// Merges static boxes [{ size: [x, y, z], position: [x, y, z] }] into a single mesh (positions baked in the geometry).
function mergedBoxes(boxes, material) {
  const geometries = boxes.map(({ size, position }) => new THREE.BoxGeometry(...size).translate(...position));
  const geometry = mergeGeometries(geometries);
  for (const g of geometries) g.dispose();
  return new THREE.Mesh(geometry, material);
}

function nameSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.font = "700 64px Rubik, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const w = Math.min(500, g.measureText(text).width + 56);
  g.fillStyle = "rgba(8,12,34,0.78)";
  g.beginPath();
  g.roundRect((512 - w) / 2, 22, w, 84, 42);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = color;
  g.stroke();
  g.fillStyle = "#fff";
  g.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, sizeAttenuation: false })
  );
  sprite.scale.set(0.13, 0.0325, 1);
  sprite.renderOrder = 20;
  return sprite;
}

// A car in its local frame (x forward, y right, z up), origin = the car origin of the replay.
// `kit` comes from makeCarKit(), shared by all the cars.
export function buildCar({ name, team, carName, kit = makeCarKit() }) {
  const hb = hitboxFor(carName);
  const [length, width, height] = hb.size;
  const [ox, , oz] = hb.offset;
  const colors = TEAM_COLORS[team] ?? TEAM_COLORS[0];
  const group = new THREE.Group();

  const paint = new THREE.MeshPhysicalMaterial({
    color: colors.main,
    metalness: 0.55,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const { glass, dark, head, tail } = kit;

  const body = new THREE.Mesh(extrudeProfile(BODY, hb, width, 2.4), paint);
  const cabin = new THREE.Mesh(extrudeProfile(CABIN, hb, width + 1.2, 0.4), glass);
  const roof = new THREE.Mesh(extrudeProfile(ROOF, hb, width - 3, 0.3), paint);
  for (const m of [body, cabin, roof]) m.castShadow = true;

  // Light bars: one merged mesh per material.
  const bottom = oz - height / 2;
  const headBoxes = [];
  const tailBoxes = [];
  for (const sy of [-1, 1]) {
    headBoxes.push({ size: [2.4, width * 0.2, height * 0.1], position: [ox + length / 2 + 0.4, sy * width * 0.3, bottom + height * 0.33] });
    tailBoxes.push({ size: [2.4, width * 0.26, height * 0.08], position: [ox - length / 2 - 0.4, sy * width * 0.28, bottom + height * 0.38] });
  }
  const lights = new THREE.Group();
  lights.add(mergedBoxes(headBoxes, head), mergedBoxes(tailBoxes, tail));

  // Bumpers, side skirts and rear wing: one merged mesh per material (dark, paint).
  const darkBoxes = [];
  const paintBoxes = [];
  const part = (sx, sy, sz, x, y, z, boxes = darkBoxes) => boxes.push({ size: [sx, sy, sz], position: [x, y, z] });
  part(4, width * 0.94, height * 0.15, ox + length / 2 + 0.2, 0, bottom + height * 0.14);
  part(4, width * 0.94, height * 0.15, ox - length / 2 - 0.2, 0, bottom + height * 0.16);
  for (const sy of [-1, 1]) {
    part(length * 0.48, 2.2, height * 0.12, ox, sy * (width / 2 + 0.3), bottom + height * 0.12);
    part(2, 2, height * 0.16, ox - length / 2 + 6, sy * width * 0.3, bottom + height * 0.56, paintBoxes);
  }
  part(11, width * 0.96, 1.8, ox - length / 2 + 5, 0, bottom + height * 0.66, paintBoxes);
  const details = new THREE.Group();
  details.add(mergedBoxes(darkBoxes, dark), mergedBoxes(paintBoxes, paint));

  // Wheels.
  const wheels = [];
  const wheelWidth = 12.5;
  const axles = [
    { x: ox + length * 0.32, r: hb.front },
    { x: ox - length * 0.33, r: hb.rear },
  ];
  for (const axle of axles) {
    for (const sy of [-1, 1]) {
      const wheel = buildWheel(kit, axle.r, wheelWidth);
      wheel.position.set(axle.x, sy * (width / 2 - 3.5), axle.r - REST_HEIGHT);
      group.add(wheel);
      wheels.push({ object: wheel, radius: axle.r });
    }
  }

  // Boost flame (tip pointing backwards).
  const flame = new THREE.Group();
  const cone = (radius, len, color, opacity) => {
    const g = new THREE.ConeGeometry(radius, len, 12, 1, true).rotateZ(Math.PI / 2).translate(-len / 2, 0, 0);
    return new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
  };
  flame.add(cone(7.5, 78, colors.light, 0.7), cone(4, 52, 0xffffff, 0.85));
  flame.position.set(ox - length / 2 - 2, 0, bottom + height * 0.22);
  flame.visible = false;

  const label = nameSprite(name, colors.css);
  label.position.set(ox, 0, oz + height / 2 + 62);

  group.add(body, cabin, roof, lights, details, flame, label);
  group.userData = { wheels, flame, label, hitbox: hb, bodyPaint: paint };
  return group;
}
