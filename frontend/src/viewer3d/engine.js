import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildArena, buildSky } from "./arena.js";
import { buildBall } from "./ball.js";
import { buildCar } from "./car.js";
import { BALL_RADIUS, SUPERSONIC_SPEED, TEAM_COLORS } from "./constants.js";

const TRAIL_POINTS = 16;
const TRAIL_STEP = 0.035;
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

  return { n, dt, t0: t[0] ?? 0, end: t[n - 1] ?? 0, ball, players };
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

export const CAMERA_MODES = ["orbit", "broadcast", "ballcam", "chase", "top"];

export function createEngine({ container, tracks, onTick }) {
  const data = prepare(tracks);
  const width = () => container.clientWidth || 800;
  const height = () => container.clientHeight || 500;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width(), height());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a1030, 26000, 62000);
  scene.add(buildSky());

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
  sun.shadow.mapSize.set(4096, 4096);
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
  world.add(buildArena());

  const ball = buildBall();
  world.add(ball);
  const ballTrail = trailLine(0xbcd2ff);
  world.add(ballTrail);

  const cars = data.players.map((p) => {
    const group = buildCar({ name: p.name, team: p.team, carName: p.car });
    world.add(group);
    const trail = trailLine(TEAM_COLORS[p.team]?.light ?? 0xffffff);
    world.add(trail);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(78, 96, 48),
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[p.team]?.light ?? 0xffffff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.visible = false;
    world.add(ring);
    return { data: p, group, trail, ring, spin: 0 };
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
    lastTick: 0,
    labels: true,
    raf: 0,
    disposed: false,
  };
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
    ballTrail.visible = bspeed > 1700;
    if (ballTrail.visible) updateTrail(ballTrail, ballAt);

    // Cars.
    for (const car of cars) {
      const d = car.data;
      const visible = d.visible[i] && d.visible[next];
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
  }

  function updateCamera(dt) {
    if (state.mode === "orbit") {
      controls.enabled = true;
      controls.update();
      camera.fov += (55 - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
      camPos.copy(camera.position);
      camLook.copy(controls.target);
      return;
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
  }

  function tick(now) {
    if (state.disposed) return;
    state.raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - (tick.prev ?? now)) / 1000);
    tick.prev = now;
    if (state.playing) {
      state.time += dt * state.rate;
      if (state.time >= data.end) {
        state.time = data.end;
        state.playing = false;
      }
    }
    update(state.time);
    updateCamera(dt);
    composer.render();
    if (now - state.lastTick > 90) {
      state.lastTick = now;
      const { i, s } = indexAt(state.time);
      const next = Math.min(data.n - 1, i + 1);
      onTick?.({
        time: state.time,
        playing: state.playing,
        players: data.players.map((p) => ({
          name: p.name,
          team: p.team,
          visible: p.visible[i],
          boost: p.boost[i] + (p.boost[next] - p.boost[i]) * s,
          speed: p.speed[i] + (p.speed[next] - p.speed[i]) * s,
        })),
      });
    }
  }
  state.raf = requestAnimationFrame(tick);

  function resize() {
    const w = width();
    const h = height();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  return {
    duration: data.end,
    start: data.t0,
    getTime: () => state.time,
    setTime(t) {
      state.time = clamp(t, data.t0, data.end);
    },
    setPlaying(p) {
      if (p && state.time >= data.end) state.time = data.t0;
      state.playing = p;
    },
    setRate(r) {
      state.rate = r;
    },
    setCamera(mode, playerName) {
      if (mode === "orbit" && state.mode !== "orbit") {
        controls.target.copy(camLook);
      }
      state.mode = mode;
      state.target = playerName ?? state.target;
      state.snap = true;
    },
    setTarget(playerName) {
      state.target = playerName;
    },
    setLabels(on) {
      state.labels = on;
    },
    setBloom(strength) {
      bloom.strength = strength;
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
