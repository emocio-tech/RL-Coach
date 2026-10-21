import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildArena, buildSky } from "./arena.js";
import { buildBall } from "./ball.js";
import { buildCar, makeCarKit } from "./car.js";
import { BALL_RADIUS, SUPERSONIC_SPEED, TEAM_COLORS } from "./constants.js";
import { matchPads, padStateAt } from "./padState.js";
import { FX_DURATION, GRAVITY_DROP, PARTICLE_COUNT, buildGoalWindows, goalFxAt, makeParticles, particlePosition } from "./goalFx.js";
import { createRatioController } from "./adaptiveRatio.js";
import { DEMO_FX_DURATION, DEMO_PARTICLE_COUNT, DEMO_SCALE, buildDemoWindows, demoFxAt } from "./demoFx.js";

const PAD_DARK_FLOOR = 0.15; // share of its diffuse colour a switched-off pad keeps
const TRAIL_POINTS = 16;
const TRAIL_STEP = 0.035;
const CAMERA_EPS = 1e-4; // camera change (position, quaternion, fov) below which a frame is not redrawn
const JUMP = 1200; // distance between two samples above which the object is considered teleported

// Rocket League (x, y, z up) -> three.js (x, y up, z).
const rl = (x, y, z) => new THREE.Vector3(x, z, y);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function fillHoles(values, fallback = 0) {
  let last = fallback;
  return values.map((v) => (v == null ? last : (last = v)));
}

// Turns the raw tracks into typed, hole-free arrays plus precomputed wheel/ball rotations.
function prepare(tracks) {
  const t = tracks.ball.t;
  const n = t.length;
  const dt = n > 1 ? (t[n - 1] - t[0]) / (n - 1) : 0.2;
  const peak = Math.max(0, ...tracks.players.flatMap((p) => p.track.boost.filter((b) => b != null)));
  const boostScale = peak > 100 ? 255 : 100;

  const ball = {
    x: fillHoles(tracks.ball.x), y: fillHoles(tracks.ball.y), z: fillHoles(tracks.ball.z, BALL_RADIUS),
  };
  ball.q = [new THREE.Quaternion()];
  for (let i = 1; i < n; i++) {
    const dx = ball.x[i] - ball.x[i - 1];
    const dy = ball.y[i] - ball.y[i - 1];
    const dist = Math.hypot(dx, dy);
    const q = ball.q[i - 1].clone();
    if (dist > 1e-3 && dist < JUMP) {
      const airborne = ball.z[i] > BALL_RADIUS + 40 ? 0.55 : 1;
      const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-dy, dx, 0).normalize(), (dist / BALL_RADIUS) * airborne);
      q.premultiply(spin);
    }
    ball.q.push(q);
  }

  const players = tracks.players.map((p) => {
    const tr = p.track;
    const visible = tr.x.map((v) => v != null);
    const x = fillHoles(tr.x), y = fillHoles(tr.y), z = fillHoles(tr.z, 17);
    let last = [0, 0, 0, 1];
    const q = tr.qx.map((_, i) => {
      if (tr.qx[i] != null && tr.qy[i] != null && tr.qz[i] != null && tr.qw[i] != null) last = [tr.qx[i], tr.qy[i], tr.qz[i], tr.qw[i]];
      return new THREE.Quaternion(...last).normalize();
    });
    const forward = q.map((qq) => new THREE.Vector3(1, 0, 0).applyQuaternion(qq));
    const travelled = [0];
    for (let i = 1; i < n; i++) {
      const d = new THREE.Vector3(x[i] - x[i - 1], y[i] - y[i - 1], z[i] - z[i - 1]);
      travelled.push(travelled[i - 1] + (d.length() < JUMP && visible[i] && visible[i - 1] ? d.dot(forward[i]) : 0));
    }
    return {
      name: p.name, team: p.team, car: p.car, visible, x, y, z, q, forward, travelled,
      boost: tr.boost.map((b) => (b == null ? 0 : (b / boostScale) * 100)),
      speed: fillHoles(tr.speed),
    };
  });

  return { n, dt, t0: t[0] ?? 0, end: t[n - 1] ?? 0, ball, players, pads: tracks.pads ?? [] };
}

// Catmull-Rom position of an object at index i + s, snapping across teleports.
function samplePosition(o, i, s, out) {
  const n = o.x.length;
  const at = (k) => clamp(k, 0, n - 1);
  const p = (k) => new THREE.Vector3(o.x[at(k)], o.y[at(k)], o.z[at(k)]);
  const p1 = p(i), p2 = p(i + 1);
  if (p1.distanceTo(p2) > JUMP) return out.copy(s < 0.5 ? p1 : p2);
  let p0 = p(i - 1), p3 = p(i + 2);
  if (p0.distanceTo(p1) > JUMP) p0 = p1.clone();
  if (p3.distanceTo(p2) > JUMP) p3 = p2.clone();
  const s2 = s * s, s3 = s2 * s;
  return out.set(
    ...["x", "y", "z"].map(
      (k) =>
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * s + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * s2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * s3)
    )
  );
}

function trailLine(color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
  const colors = new Float32Array(TRAIL_POINTS * 3);
  const c = new THREE.Color(color);
  for (let k = 0; k < TRAIL_POINTS; k++) {
    const f = Math.pow(1 - k / (TRAIL_POINTS - 1), 1.6);
    colors.set([c.r * f, c.g * f, c.b * f], k * 3);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

const FX_HDR = 3; // colour multiplier so that the explosion goes over the bloom threshold
const FLASH_DURATION = 0.25;
const FX_SEED = 41;

function sparkTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

const fxMaterial = (extra = {}) =>
  new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, ...extra });

// Goal explosion objects, built once and only moved, scaled and faded afterwards.
function buildGoalFx() {
  const particles = makeParticles(PARTICLE_COUNT, FX_SEED);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ map: sparkTexture(), size: 150, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), fxMaterial());
  const wave = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), fxMaterial());
  for (const o of [points, flash, wave]) {
    o.frustumCulled = false;
    o.visible = false;
  }
  return { particles, points, flash, wave };
}

const DEMO_HEX = 0xff2a2a;
const DEMO_FLASH_DURATION = 0.15;
const DEMO_SEED = 77;
const DEMO_FX_OPTIONS = { duration: DEMO_FX_DURATION, scale: DEMO_SCALE, gravity: GRAVITY_DROP * DEMO_SCALE };

// Red demolition explosion of one car, built once (sparks, short flash, small shock wave) and only moved afterwards.
// The sparks texture and the geometries are shared by all cars.
function buildDemoFx(shared) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(DEMO_PARTICLE_COUNT * 3), 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ map: shared.texture, size: 90, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const flash = new THREE.Mesh(shared.flashGeometry, fxMaterial());
  const wave = new THREE.Mesh(shared.waveGeometry, fxMaterial());
  for (const o of [points, flash, wave]) {
    o.frustumCulled = false;
    o.visible = false;
  }
  return { points, flash, wave };
}

export const CAMERA_MODES =["orbit", "broadcast", "ballcam", "chase", "top"];

export function createEngine({ container, tracks, onTick }) {
  const data = prepare(tracks);
  const width = () => container.clientWidth || 800;
  const height = () => container.clientHeight || 500;

  // No MSAA: the scene is drawn through the EffectComposer (offscreen targets), so the canvas antialiasing would be unused.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  const maxRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(maxRatio);
  renderer.setSize(width(), height());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // refreshed on demand: see `update` (needsUpdate) in tick
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a1030, 26000, 62000);
  const sky = buildSky(); // the dome stays at the origin: it does not follow the camera
  scene.add(sky);

  // Soft studio reflections for the paint, the floor and the ball.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.28;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(55, width() / height(), 20, 120000);
  camera.position.copy(rl(0, -9200, 4300));
  camera.lookAt(rl(0, 0, 300));

  // Lights (three.js coordinates).
  scene.add(new THREE.HemisphereLight(0xa9c0ff, 0x241a3c, 0.75));
  const sun = new THREE.DirectionalLight(0xfff1e0, 2.6);
  sun.position.set(-3500, 9000, 2500);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7000, right: 7000, top: 7000, bottom: -7000, near: 100, far: 22000 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 2;
  scene.add(sun, sun.target);

  // Everything inside this group uses Rocket League coordinates.
  const world = new THREE.Group();
  world.matrixAutoUpdate = false;
  world.matrix.set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1); // swaps y and z
  world.matrixWorldNeedsUpdate = true;
  scene.add(world);
  const arena = buildArena();
  world.add(arena.group);
  // A pad of the scenery without data stays lit.
  const animatedPads = matchPads(arena.pads, data.pads);

  // The scenery never moves after its construction (the pads only animate their materials): freeze its matrices.
  scene.updateMatrixWorld(true);
  for (const root of [arena.group, sky]) {
    root.traverse((o) => {
      o.matrixAutoUpdate = false;
    });
  }

  const ball = buildBall();
  world.add(ball);
  const ballTrail = trailLine(0xbcd2ff);
  world.add(ballTrail);

  const goalFx = buildGoalFx();
  world.add(goalFx.points, goalFx.flash, goalFx.wave);
  let goalWindows = [];
  const rawBall = tracks.ball; // before fillHoles: the nulls tell when the ball is back in play

  // Raw player tracks (before fillHoles): the null speed tells when a car is demolished, the nulls when it respawns.
  const rawPlayers = tracks.players.map((p) => ({ name: p.name, t: p.track.t ?? tracks.ball.t, x: p.track.x, y: p.track.y, z: p.track.z, speed: p.track.speed }));
  let demoWindows = {};
  const demoShared = {
    texture: sparkTexture(),
    flashGeometry: new THREE.SphereGeometry(1, 16, 12),
    waveGeometry: new THREE.SphereGeometry(1, 24, 16),
  };
  const demoParticles = makeParticles(DEMO_PARTICLE_COUNT, DEMO_SEED);

  const carKit = makeCarKit(); // materials and geometries shared by all the cars, disposed with the scene
  const cars = data.players.map((p) => {
    const group = buildCar({ name: p.name, team: p.team, carName: p.car, kit: carKit });
    world.add(group);
    const demoFx = buildDemoFx(demoShared);
    world.add(demoFx.points, demoFx.flash, demoFx.wave);
    const trail = trailLine(TEAM_COLORS[p.team]?.light ?? 0xffffff);
    world.add(trail);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(78, 96, 48),
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[p.team]?.light ?? 0xffffff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.visible = false;
    world.add(ring);
    return { data: p, group, trail, ring, demoFx, spin: 0 };
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(rl(0, 0, 300));
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxDistance = 30000;
  controls.minDistance = 150;

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(width(), height());
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width(), height()), 0.3, 0.4, 0.95);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const state = {
    time: data.t0,
    playing: false,
    rate: 1,
    mode: "orbit",
    target: null,
    snap: true,
    dirty: true, // something displayed changed: the next frame must recompute and redraw
    renderedTime: NaN, // match time of the last `update`
    lastFrameRendered: false, // the previous frame was drawn (adaptive resolution only measures consecutive drawn frames)
    inCameraUpdate: false,
    emitted: null, // { time, playing } of the last onTick
    emitPending: true,
    lastTick: 0,
    labels: true,
    raf: 0,
    disposed: false,
  };
  // Camera of the last drawn frame (pre-allocated): a frame is redrawn when the camera differs from it.
  const drawnCamera = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: NaN };
  function cameraMoved() {
    return (
      drawnCamera.position.distanceToSquared(camera.position) > CAMERA_EPS * CAMERA_EPS ||
      8 * (1 - Math.abs(drawnCamera.quaternion.dot(camera.quaternion))) > CAMERA_EPS * CAMERA_EPS ||
      !(Math.abs(drawnCamera.fov - camera.fov) <= CAMERA_EPS)
    );
  }
  function invalidate() {
    state.dirty = true;
    state.emitPending = true;
  }
  // The orbit controls fire `change` on user input and damping; the ones fired by our own update in tick are handled there.
  controls.addEventListener("change", () => {
    if (!state.inCameraUpdate) invalidate();
  });
  const ratio = createRatioController({ maxRatio });
  const camPos = camera.position.clone();
  const camLook = controls.target.clone();
  const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };

  function indexAt(time) {
    const f = (time - data.t0) / data.dt;
    const i = clamp(Math.floor(f), 0, Math.max(0, data.n - 2));
    return { i, s: clamp(f - i, 0, 1) };
  }

  function ballAt(time, out) {
    const { i, s } = indexAt(time);
    return samplePosition(data.ball, i, s, out);
  }

  function updateTrail(line, getPoint, color) {
    const attr = line.geometry.attributes.position;
    for (let k = 0; k < TRAIL_POINTS; k++) {
      const p = getPoint(Math.max(data.t0, state.time - k * TRAIL_STEP), tmp.d);
      attr.setXYZ(k, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
  }

  function update(time) {
    const { i, s } = indexAt(time);
    const next = Math.min(data.n - 1, i + 1);

    // Ball.
    const bp = samplePosition(data.ball, i, s, tmp.a);
    ball.position.copy(bp);
    ball.userData.sphere.quaternion.copy(data.ball.q[i]).slerp(data.ball.q[next], s);
    const bspeed = Math.hypot(data.ball.x[next] - data.ball.x[i], data.ball.y[next] - data.ball.y[i], data.ball.z[next] - data.ball.z[i]) / data.dt;
    ball.userData.halo.material.opacity = clamp(0.35 + bspeed / 4500, 0.35, 1);
    const fx = goalFxAt(goalWindows, time);
    const ballHidden = fx?.ballHidden === true;
    ball.visible = !ballHidden;
    ballTrail.visible = !ballHidden && bspeed > 1700;
    if (ballTrail.visible) updateTrail(ballTrail, ballAt);
    updateGoalFx(fx);

    // Cars.
    for (const car of cars) {
      const d = car.data;
      const demo = demoFxAt(demoWindows, d.name, time);
      updateDemoFx(car, demo);
      const visible = d.visible[i] && d.visible[next] && demo?.carHidden !== true;
      car.group.visible = visible;
      car.trail.visible = false;
      car.ring.visible = visible && state.target === d.name;
      if (!visible) continue;
      const p = samplePosition(d, i, s, tmp.b);
      car.group.position.copy(p);
      car.group.quaternion.copy(d.q[i]).slerp(d.q[next], s);
      car.ring.position.set(p.x, p.y, 3);

      const spin = (d.travelled[i] + (d.travelled[next] - d.travelled[i]) * s) * -1;
      for (const w of car.group.userData.wheels) w.object.rotation.y = spin / w.radius;
      const boosting = d.boost[i] > d.boost[next] + 0.01;
      const flame = car.group.userData.flame;
      flame.visible = boosting;
      if (boosting) flame.scale.set(0.8 + Math.random() * 0.5, 0.85 + Math.random() * 0.3, 0.85 + Math.random() * 0.3);
      car.group.userData.label.visible = state.labels;

      const speed = d.speed[i] + (d.speed[next] - d.speed[i]) * s;
      car.trail.visible = speed >= SUPERSONIC_SPEED - 50;
      if (car.trail.visible) {
        updateTrail(car.trail, (tt, out) => {
          const k = indexAt(tt);
          return samplePosition(d, k.i, k.s, out);
        });
      }
    }
    updatePads(time);
  }

  // Explosion at the goal: sparks, a short flash and a shock wave, all driven by the age since the goal.
  function updateGoalFx(fx) {
    const active = fx != null && fx.age >= 0 && fx.age <= FX_DURATION;
    goalFx.points.visible = active;
    goalFx.flash.visible = active && fx.age < FLASH_DURATION;
    goalFx.wave.visible = active;
    if (!active) return;
    const { goal, age, progress } = fx;
    const hex = TEAM_COLORS[goal.team]?.light ?? 0xffffff;

    const attr = goalFx.points.geometry.attributes.position;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particlePosition(goalFx.particles, i, age, goal.origin, tmp.c);
      attr.setXYZ(i, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
    const sparks = goalFx.points.material;
    sparks.color.setHex(hex).multiplyScalar(FX_HDR);
    sparks.opacity = Math.pow(1 - progress, 1.3);

    if (goalFx.flash.visible) {
      const u = age / FLASH_DURATION;
      goalFx.flash.position.set(goal.origin.x, goal.origin.y, goal.origin.z);
      goalFx.flash.scale.setScalar(180 + 520 * u);
      goalFx.flash.material.color.setHex(hex).multiplyScalar(FX_HDR * 1.5);
      goalFx.flash.material.opacity = (1 - u) * (1 - u);
    }

    const wave = goalFx.wave;
    const spread = 1 - (1 - progress) * (1 - progress);
    wave.position.set(goal.origin.x, goal.origin.y, goal.origin.z);
    wave.scale.setScalar(120 + 2300 * spread);
    wave.material.color.setHex(hex).multiplyScalar(FX_HDR * 0.6);
    wave.material.opacity = 0.35 * (1 - progress) * (1 - progress);
  }

  // Red explosion at the place where the car was demolished, driven by the age since the demolition.
  function updateDemoFx(car, fx) {
    const fxo = car.demoFx;
    const active = fx != null && fx.age >= 0 && fx.age <= DEMO_FX_DURATION;
    fxo.points.visible = active;
    fxo.flash.visible = active && fx.age < DEMO_FLASH_DURATION;
    fxo.wave.visible = active;
    if (!active) return;
    const { demo, age, progress } = fx;
    const o = demo.origin;

    const attr = fxo.points.geometry.attributes.position;
    for (let i = 0; i < DEMO_PARTICLE_COUNT; i++) {
      const p = particlePosition(demoParticles, i, age, o, tmp.c, DEMO_FX_OPTIONS);
      attr.setXYZ(i, p.x, p.y, p.z);
    }
    attr.needsUpdate = true;
    fxo.points.material.color.setHex(DEMO_HEX).multiplyScalar(FX_HDR);
    fxo.points.material.opacity = Math.pow(1 - progress, 1.3);

    if (fxo.flash.visible) {
      const u = age / DEMO_FLASH_DURATION;
      fxo.flash.position.set(o.x, o.y, o.z);
      fxo.flash.scale.setScalar(60 + 160 * u);
      fxo.flash.material.color.setHex(DEMO_HEX).multiplyScalar(FX_HDR * 1.5);
      fxo.flash.material.opacity = (1 - u) * (1 - u);
    }

    const spread = 1 - (1 - progress) * (1 - progress);
    fxo.wave.position.set(o.x, o.y, o.z);
    fxo.wave.scale.setScalar(40 + 600 * spread);
    fxo.wave.material.color.setHex(DEMO_HEX).multiplyScalar(FX_HDR * 0.6);
    fxo.wave.material.opacity = 0.35 * (1 - progress) * (1 - progress);
  }

  function updatePads(time) {
    for (const { scenery, pickups } of animatedPads) {
      const { intensity } = padStateAt(pickups, time);
      const shade = PAD_DARK_FLOOR + (1 - PAD_DARK_FLOOR) * Math.min(intensity, 1);
      for (const { material, emissive, opacity, color } of scenery.materials) {
        material.emissiveIntensity = emissive * intensity;
        material.color.copy(color).multiplyScalar(shade);
        if (material.transparent) material.opacity = clamp(opacity * intensity, 0, 1);
      }
    }
  }

  // Returns true when the orbit controls moved the camera.
  function updateCamera(dt) {
    if (state.mode === "orbit") {
      controls.enabled = true;
      const moved = controls.update();
      camera.fov += (55 - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
      camPos.copy(camera.position);
      camLook.copy(controls.target);
      return moved;
    }
    controls.enabled = false;
    const b = ballAt(state.time, tmp.a).clone();
    const car = cars.find((c) => c.data.name === state.target) ?? cars[0];
    const { i, s } = indexAt(state.time);
    const cp = samplePosition(car.data, i, s, tmp.b).clone();
    let wantPos;
    let wantLook;
    let fov = 55;

    if (state.mode === "broadcast") {
      wantPos = new THREE.Vector3(-5900, 2300, b.y * 0.55);
      wantLook = new THREE.Vector3(b.x * 0.9, clamp(b.z * 0.6, 60, 1200), b.y);
      fov = 46;
    } else if (state.mode === "top") {
      wantPos = new THREE.Vector3(0, 12800, -1500);
      wantLook = new THREE.Vector3(0, 0, 0);
      fov = 40;
    } else if (state.mode === "ballcam") {
      const dir = new THREE.Vector3(b.x - cp.x, b.y - cp.y, b.z - cp.z);
      const dist = dir.length();
      dir.normalize();
      wantPos = new THREE.Vector3(cp.x - dir.x * 430, Math.max(120, cp.z + 170 - dir.z * 430 * 0.5), cp.y - dir.y * 430);
      wantLook = new THREE.Vector3(b.x, b.z, b.y);
      if (dist < 500) wantLook.lerp(new THREE.Vector3(cp.x + dir.x * 800, cp.z + 60, cp.y + dir.y * 800), 0.4);
      fov = 80;
    } else {
      const f = car.data.forward[i].clone().lerp(car.data.forward[Math.min(data.n - 1, i + 1)], s);
      const flat = new THREE.Vector3(f.x, f.y, 0);
      if (flat.lengthSq() < 1e-4) flat.set(0, 1, 0);
      flat.normalize();
      wantPos = new THREE.Vector3(cp.x - flat.x * 340, cp.z + 150, cp.y - flat.y * 340);
      wantLook = new THREE.Vector3(cp.x + flat.x * 600, cp.z + 50, cp.y + flat.y * 600);
      fov = 78;
    }

    const k = state.snap ? 1 : 1 - Math.exp(-7 * dt);
    camPos.lerp(wantPos, state.mode === "top" ? k : Math.min(1, k * 1.2));
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.fov += (fov - camera.fov) * (state.snap ? 1 : Math.min(1, dt * 4));
    camera.updateProjectionMatrix();
    controls.target.copy(camLook);
    state.snap = false;
    return false;
  }

  function tick(now) {
    if (state.disposed) return;
    state.raf = requestAnimationFrame(tick);
    const rawMs = now - (tick.prev ?? now);
    const dt = Math.min(0.1, rawMs / 1000);
    tick.prev = now;
    if (state.playing) {
      state.time += dt * state.rate;
      if (state.time >= data.end) {
        state.time = data.end;
        state.playing = false;
      }
    }

    // Scene state: recomputed only when something may have changed (and the shadow map with it).
    // `dirty` is cleared before the work so that an invalidate() raised meanwhile is kept for the next frame.
    const sceneChanged = state.playing || state.dirty || state.time !== state.renderedTime;
    state.dirty = false;
    if (sceneChanged) {
      update(state.time);
      renderer.shadowMap.needsUpdate = true;
      state.renderedTime = state.time;
    }

    // The camera keeps running until it has converged.
    const snapped = state.snap;
    state.inCameraUpdate = true;
    const controlsChanged = updateCamera(dt);
    state.inCameraUpdate = false;

    const draw = sceneChanged || snapped || controlsChanged || cameraMoved();
    if (draw) {
      adaptResolution(rawMs); // before the draw: a pixel ratio change clears the canvas
      composer.render();
      drawnCamera.position.copy(camera.position);
      drawnCamera.quaternion.copy(camera.quaternion);
      drawnCamera.fov = camera.fov;
    }
    state.lastFrameRendered = draw;

    // onTick: only when the time or the play state moved since the last emission (or after an invalidate), at most every 90 ms.
    const last = state.emitted;
    const changed = state.emitPending || !last || last.time !== state.time || last.playing !== state.playing;
    if (changed && now - state.lastTick > 90) {
      state.lastTick = now;
      state.emitPending = false;
      state.emitted = { time: state.time, playing: state.playing };
      const { i, s } = indexAt(state.time);
      const next = Math.min(data.n - 1, i + 1);
      onTick?.({
        time: state.time,
        playing: state.playing,
        players: data.players.map((p) => ({
          name: p.name,
          team: p.team,
          visible: p.visible[i] && demoFxAt(demoWindows, p.name, state.time)?.carHidden !== true,
          boost: p.boost[i] + (p.boost[next] - p.boost[i]) * s,
          speed: p.speed[i] + (p.speed[next] - p.speed[i]) * s,
        })),
      });
    }
  }

  // Adaptive resolution: measures only the raw time of drawn frames that follow another drawn frame while playing.
  function adaptResolution(rawMs) {
    if (!state.playing || !state.lastFrameRendered) {
      ratio.reset(); // do not measure the gaps of a pause or of skipped frames
      return;
    }
    const r = ratio.push(rawMs);
    if (r === null) return;
    renderer.setPixelRatio(r);
    composer.setPixelRatio(r);
    resize();
  }
  state.raf = requestAnimationFrame(tick);

  function resize() {
    const w = width();
    const h = height();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate(); // setSize clears the canvas
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  return {
    duration: data.end,
    start: data.t0,
    getTime: () => state.time,
    setTime(t) {
      state.time = clamp(t, data.t0, data.end);
      invalidate();
    },
    setPlaying(p) {
      if (p && state.time >= data.end) state.time = data.t0;
      state.playing = p;
      invalidate();
    },
    setRate(r) {
      state.rate = r;
      invalidate();
    },
    setCamera(mode, playerName) {
      if (mode === "orbit" && state.mode !== "orbit") {
        controls.target.copy(camLook);
      }
      state.mode = mode;
      state.target = playerName ?? state.target;
      state.snap = true;
      invalidate();
    },
    setTarget(playerName) {
      state.target = playerName;
      invalidate();
    },
    setLabels(on) {
      state.labels = on;
      invalidate();
    },
    // goals: [{ t }] in seconds, same base as the tracks. Rebuilds the goal windows and redraws the frame.
    setGoals(goals) {
      goalWindows = buildGoalWindows(goals, rawBall);
      update(state.time);
      renderer.shadowMap.needsUpdate = true;
      invalidate();
    },
    // demos: [{ t, victim }] in seconds, same base as the tracks. Rebuilds the demolition windows and redraws the frame.
    setDemolitions(demos) {
      demoWindows = buildDemoWindows(demos, rawPlayers);
      update(state.time);
      renderer.shadowMap.needsUpdate = true;
      invalidate();
    },
    setBloom(strength) {
      bloom.strength = strength;
      invalidate();
    },
    dispose() {
      state.disposed = true;
      cancelAnimationFrame(state.raf);
      observer.disconnect();
      controls.dispose();
      composer.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          m.map?.dispose?.();
          m.dispose();
        }
      });
      renderer.domElement.remove();
    },
  };
}
