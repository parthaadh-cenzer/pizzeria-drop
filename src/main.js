import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { lavaMaterial, layout } from "../assets/runtime/worlds.js";
import { mesh, box, material, rng } from "../assets/runtime/palette.js";
import { makeEffects } from "../assets/runtime/effects.js";
import { Match, RULES } from "./gameplay.js";
import { GameControls } from "./controls.js";
import { FollowCamera, AIM_PITCH } from "./follow-camera.js";
import { createHUD } from "./hud.js";
import { applyGrip } from "./weapon-rig.js";
import { createTraffic } from "./traffic.js";
import { createRocketFX } from "./rocket-fx.js";
import "./game.css";
import { bake } from "../assets/runtime/props.js";

const $ = (s) => document.querySelector(s),
  viewport = $("#viewport"),
  scene = new T.Scene(),
  camera = new T.PerspectiveCamera(42, 1, 0.1, 160);
const renderer = new T.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
viewport.appendChild(renderer.domElement);
renderer.info.autoReset = false;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 4;
controls.maxDistance = 75;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new T.Vector2(800, 600), 0.27, 0.55, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const hemi = new T.HemisphereLight(0xb6c9ff, 0x57404a, 2.15);
scene.add(hemi);
const sun = new T.DirectionalLight(0xffe0ba, 3.2);
sun.position.set(4, 30, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -19,
  right: 19,
  top: 19,
  bottom: -19,
  near: 1,
  far: 70,
});
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.035;
scene.add(sun);
const under = new T.PointLight(0xff6020, 160, 42, 2);
under.position.set(0, 3, 0);
scene.add(under);
const rim = new T.DirectionalLight(0x9b98ff, 2);
rim.position.set(-15, 12, -10);
scene.add(rim);
const loader = new GLTFLoader(),
  files = {};
let world = "volcano",
  difficulty = "easy",
  selected = "girl",
  mode = "world",
  crowd = 2,
  actors = [],
  tiles = [],
  batches = [],
  hammers = [],
  pickups = [],
  cars = [],
  worldRoot = new T.Group(),
  rosterRoot = new T.Group(),
  playing = false,
  high = true,
  elapsed = 0;
scene.add(worldRoot, rosterRoot);
rosterRoot.visible = false;
const lava = new T.Mesh(
  new T.PlaneGeometry(70, 70).rotateX(-Math.PI / 2),
  lavaMaterial(),
);
lava.position.y = -1.2;
let player = null,
  remaining = 0,
  match = null,
  accumulator = 0;
const hud = createHUD(),
  follow = new FollowCamera(camera);
const rocketFX = createRocketFX(scene);
let paused = false;
const clock = new T.Clock(),
  dummy = new T.Object3D();
let effects = null;
let traffic = null,
  environment = null;
const dynamicResources = [];
const toast = (text) => {
  $("#toast").textContent = text;
};
async function get(file) {
  if (!files[file]) files[file] = await loader.loadAsync(`/assets/${file}.glb`);
  return files[file];
}
function action(actor, name) {
  if (actor.current === name) return;
  const clip = actor.clips.find((c) => c.name === name);
  if (!clip) return;
  actor.mixer.stopAllAction();
  const a = actor.mixer.clipAction(clip);
  if (["jump", "landing", "hit", "recovery"].includes(name)) {
    a.setLoop(T.LoopOnce);
    a.clampWhenFinished = true;
  }
  a.reset().play();
  actor.current = name;
}
function actor(kind, parent, x, y, z) {
  const f = files[`characters/${kind}`],
    model = clone(f.scene);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  model.position.set(x, y, z);
  parent.add(model);
  const a = {
    model,
    mixer: new T.AnimationMixer(model),
    clips: f.animations,
    kind,
    current: null,
  };
  const weapon = files["props/rocket-held"].scene.clone();
  weapon.visible = false;
  model.getObjectByName("WeaponSocket").add(weapon);
  a.weapon = weapon;
  action(a, "idle");
  return a;
}
function clearWorld() {
  effects?.dispose();
  for (const r of dynamicResources) r.dispose();
  dynamicResources.length = 0;
  for (const b of batches) b.mesh.dispose();
  for (const a of actors) a.mixer.uncacheRoot(a.model);
  rocketFX.reset();
  worldRoot.clear();
  actors = [];
  batches = [];
  tiles = [];
  hammers = [];
  pickups = [];
  cars = [];
  hud.reset();
}
function setupTiles() {
  tiles = match.tiles;
  remaining = tiles.filter((t) => !t.gone).length;
  for (let level = 0; level < 3; level++)
    for (const variant of ["normal", "burst"]) {
      const entries = tiles.filter(
        (t) => t.level === level && t.variant === variant,
      );
      if (!entries.length) continue;
      const proto = files[`props/${world}-${variant}`].scene;
      proto.traverse((o) => {
        if (!o.isMesh) return;
        const mat = o.material.clone();
        mat.transparent = true;
        dynamicResources.push(mat);
        const inst = new T.InstancedMesh(o.geometry, mat, entries.length);
        inst.castShadow = true;
        inst.receiveShadow = true;
        inst.instanceMatrix.setUsage(T.DynamicDrawUsage);
        inst.frustumCulled = false;
        worldRoot.add(inst);
        batches.push({ mesh: inst, entries, level });
        for (let i = 0; i < entries.length; i++) {
          const t = entries[i];
          dummy.position.set(t.x, t.y, t.z);
          dummy.rotation.set(0, t.rotationY, 0);
          dummy.scale.setScalar(t.gone ? 0 : 1);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
          inst.setColorAt(i, new T.Color(0xffffff));
        }
      });
    }
  for (const h of match.hammers) {
    const root = files["props/hammer"].scene.clone();
    root.position.set(h.tile.x, h.tile.y + 0.15, h.tile.z);
    worldRoot.add(root);
    hammers.push({ root, sim: h, sweep: root.getObjectByName("sweep") });
  }
  for (const l of match.launchers) {
    const root = files["props/rocket"].scene.clone();
    worldRoot.add(root);
    pickups.push({ root, sim: l });
  }
}
function setCamera() {
  camera.position.set(32, world === "volcano" ? 55 : 36, 39);
  controls.target.set(0, 11, 0);
  controls.update();
}
function spawnActors() {
  for (const a of actors) {
    worldRoot.remove(a.model);
    a.mixer.uncacheRoot(a.model);
  }
  actors = [];
  for (const p of match.players) {
    const a = actor(
      p.id === 0 ? selected : p.id % 2 ? "boy" : "girl",
      worldRoot,
      p.position.x,
      p.position.y,
      p.position.z,
    );
    a.sim = p;
    if (match.phase === "preview") {
      p.position.y = match.data.levels[0] + 0.15;
      a.model.position.copy(p.position);
    }
    a.model.rotation.y = 0.4;
    a.mixer.update(p.id * 0.7);
    a.model.traverse((o) => {
      if (o.isMesh) o.castShadow = p.id < 4;
    });
    actors.push(a);
  }
  player = actors[0];
}
function setupWorld() {
  playing = false;
  paused = false;
  document.body.classList.remove("playing");
  $("#play").innerHTML = "Take the drop <span>↗</span>";
  clearWorld();
  match = new Match({ world, difficulty, count: crowd });
  accumulator = 0;
  controls.enabled = true;
  camera.fov = 42;
  camera.updateProjectionMatrix();
  gameControls?.reset();
  environment = files[`worlds/${world}`].scene.clone();
  environment.traverse((o) => {
    if (o.userData.occluder && [2, 3].includes(o.userData.side))
      o.traverse((m) => {
        if (m.isMesh) {
          m.material = m.material.clone();
          m.material.transparent = true;
          m.material.opacity = 0.12;
          m.material.depthWrite = false;
          dynamicResources.push(m.material);
          m.userData.previewFade = true;
        }
      });
  });
  worldRoot.add(environment);
  traffic = null;
  setupTiles();
  spawnActors();
  under.visible = true;
  effects = makeEffects(world);
  worldRoot.add(effects.group);
  const city = world === "cityscape";
  scene.background = new T.Color(city ? 0x515777 : 0x765368);
  scene.fog = new T.Fog(city ? 0x515777 : 0x765368, 43, 105);
  hemi.groundColor.set(city ? 0x3f435e : 0x693b36);
  under.color.set(city ? 0xc365ee : 0xff6020);
  sun.color.set(city ? 0xffddcf : 0xffdab9);
  if (!city) worldRoot.add(lava);
  else {
    const floor = mesh(
      new T.BoxGeometry(42, 0.5, 42),
      0x252f49,
      worldRoot,
      [0, -34, 0],
      [1, 1, 1],
    );
    floor.receiveShadow = true;
    dynamicResources.push(floor.geometry);
    const wheel = new T.CylinderGeometry(0.2, 0.2, 0.13, 8).rotateX(
      Math.PI / 2,
    );
    dynamicResources.push(wheel);
    const carPrototypes = [];
    for (let i = 0; i < 2; i++) {
      const car = new T.Group();
      mesh(
        box,
        i % 2 ? 0xdac06a : 0x75b8c9,
        car,
        [0, 0.4, 0],
        [1.6, 0.55, 0.76],
      );
      mesh(box, 0x263952, car, [-0.12, 0.78, 0], [0.8, 0.35, 0.68]);
      for (const x of [-0.45, 0.45])
        for (const z of [-0.4, 0.4]) mesh(wheel, 0x202236, car, [x, 0.19, z]);
      const merged = bake(car);
      merged.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          dynamicResources.push(o.geometry, o.material);
        }
      });
      carPrototypes.push(merged);
    }
    for (let i = 0; i < 10; i++) {
      const car = carPrototypes[i % 2].clone();
      car.position.set(i * 4 - 20, 15.4, -19);
      worldRoot.add(car);
      cars.push(car);
    }
    traffic = createTraffic(cars);
  }
  // A single bounded particle draw for embers / city dust.
  const random = rng(99),
    points = [];
  for (let i = 0; i < 90; i++)
    points.push((random() - 0.5) * 28, random() * 18, (random() - 0.5) * 28);
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(points, 3));
  const sparks = new T.Points(
    geo,
    new T.PointsMaterial({
      color: city ? 0xa7bdff : 0xffa743,
      size: 0.065,
      sizeAttenuation: true,
    }),
  );
  sparks.name = "sparks";
  worldRoot.add(sparks);
  dynamicResources.push(geo, sparks.material);
  worldRoot.visible = mode === "world";
  rosterRoot.visible = mode === "roster";
  if (mode === "world") setCamera();
  resize();
  $("#biome-label").textContent = city
    ? "WORLD 02 / CITYSCAPE"
    : "WORLD 01 / VOLCANO";
  $("#world-title").innerHTML =
    (city ? "Skyline Collapse" : "Molten Crater") + "<span>™</span>";
  $("#world-description").textContent = city
    ? "The city never sleeps. Neither does gravity."
    : "Warm hearts. Unstable ground.";
  toast("Drag to orbit · Scroll to explore");
}
function roster() {
  playing = false;
  document.body.classList.remove("playing");
  mode = "roster";
  controls.enabled = true;
  camera.fov = 42;
  camera.updateProjectionMatrix();
  gameControls.reset();
  resize();
  under.visible = false;
  worldRoot.visible = false;
  rosterRoot.visible = true;
  scene.fog = null;
  scene.background = new T.Color(0x2b2c40);
  camera.position.set(1.2, 2.8, 8.5);
  controls.target.set(0, 1.35, 0);
  controls.update();
  $("#animation-panel").hidden = false;
  $("#biome-label").textContent = "THE ORIGINAL DUO / SHARED RIG";
  $("#world-title").innerHTML = "Ready to drop<span>™</span>";
  $("#world-description").textContent =
    "Red hoodie. Blue jacket. Same fearless energy.";
  toast("Drag to orbit · Choose an animation to inspect");
}
function returnWorld() {
  mode = "world";
  $("#animation-panel").hidden = true;
  setupWorld();
}
function begin() {
  if (mode === "roster") returnWorld();
  setupWorld();
  playing = true;
  environment.traverse((o) => {
    if (o.userData.previewFade) {
      o.material.opacity = 1;
      o.material.depthWrite = true;
    }
  });
  document.body.classList.add("playing");
  resize();
  match.start();
  follow.reset(match.players[0].position);
  controls.enabled = false;
  hud.unlockAudio();
  // First match: the countdown waits on the controls panel.
  if (!hud.controlsSeen) openControls();
  $("#play").textContent = "Restart the drop ↗";
}
function trigger(t) {
  match.activate(t);
}
function updateTiles() {
  if (!match) return;
  remaining = tiles.filter((t) => !t.gone).length;
  const p = match.players[0];
  for (const b of batches) {
    // Local-camera visual fading only: overhead floors always, own floor while aiming down.
    const overhead = playing && b.entries[0].y > p.position.y + 0.5,
      ownFloor =
        playing &&
        follow.aiming &&
        follow.aimPitch > 0.45 &&
        Math.abs(b.entries[0].y + 0.15 - p.position.y) < 1.2,
      opacity = overhead ? 0.13 : ownFloor ? 0.4 : 1;
    b.mesh.material.opacity = opacity;
    b.mesh.material.depthWrite = opacity === 1;
    b.mesh.castShadow = opacity === 1;
    for (let i = 0; i < b.entries.length; i++) {
      const t = b.entries[i];
      if (t.activatedAt === null && !t.gone) continue;
      const progress =
          t.activatedAt === null
            ? 0
            : T.MathUtils.clamp((match.time - t.activatedAt) / 3, 0, 1),
        shake = 0.009 + progress * progress * 0.1;
      dummy.position.set(
        t.x + (t.gone ? 0 : Math.sin(elapsed * (30 + progress * 50)) * shake),
        t.y,
        t.z,
      );
      dummy.rotation.set(0, t.rotationY, 0);
      dummy.scale.setScalar(t.gone ? 0 : 1);
      dummy.updateMatrix();
      b.mesh.setMatrixAt(i, dummy.matrix);
      b.mesh.setColorAt(
        i,
        new T.Color(0xffffff).lerp(new T.Color(0xff4225), progress),
      );
    }
    b.mesh.instanceMatrix.needsUpdate = true;
    if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
  }
}

// Reticle acquisition in screen space; touch gets a wider cone and stronger assist.
const AIM = {
  mouse: { lock: 56, assist: 72, strength: 1.3 },
  touch: { lock: 84, assist: 120, strength: 3.4 },
  range: 55,
};
const aimProfile = () =>
  gameControls.lastPointerType === "touch" ? AIM.touch : AIM.mouse;
const chest = (p) => p.position.clone().add(new T.Vector3(0, 1.1, 0));
function targetInReticle(radius = aimProfile().lock) {
  if (!match) return null;
  const w = viewport.clientWidth,
    h = viewport.clientHeight,
    me = match.players[0];
  let best = null,
    dist = radius;
  for (const p of match.players) {
    if (p.id === 0 || !p.alive) continue;
    if (p.position.distanceTo(me.position) > AIM.range) continue;
    const v = chest(p).project(camera);
    if (v.z < -1 || v.z > 1) continue;
    const d = Math.hypot(v.x * w * 0.5, v.y * h * 0.5);
    if (d < dist) {
      best = p.id;
      dist = d;
    }
  }
  return best;
}
// Gently pulls the view toward a target already near the reticle; never picks off-screen ones.
function aimAssist(dt) {
  const me = match.players[0];
  if (!me.lock.holding) return;
  const profile = aimProfile(),
    id = me.lock.target ?? targetInReticle(profile.assist);
  if (id === null || id === undefined) return;
  const to = chest(match.players[id]).sub(camera.position).normalize(),
    view = camera.getWorldDirection(new T.Vector3()),
    k = 1 - Math.exp(-profile.strength * dt);
  const yawError = Math.atan2(
    Math.sin(Math.atan2(-to.x, -to.z) - Math.atan2(-view.x, -view.z)),
    Math.cos(Math.atan2(-to.x, -to.z) - Math.atan2(-view.x, -view.z)),
  );
  follow.yaw += yawError * k;
  follow.aimPitch = T.MathUtils.clamp(
    follow.aimPitch + (Math.asin(view.y) - Math.asin(to.y)) * k,
    AIM_PITCH.min,
    AIM_PITCH.max,
  );
}
// Muzzle direction toward whatever the reticle ray meets (floor, or a far point).
function aimDirection() {
  const me = match.players[0],
    view = camera.getWorldDirection(new T.Vector3()),
    far = camera.position.clone().addScaledVector(view, 60),
    hit = match.segmentHit(camera.position, far),
    point = hit ? hit.point : far,
    muzzle = match.muzzle(me, view),
    dir = point.sub(muzzle);
  return dir.length() > 2 ? dir.normalize() : view;
}
function aimInfo() {
  const me = match.players[0],
    target = match.players[me.lock.target];
  if (!me.lock.holding || !target?.alive) return { blocked: false };
  const muzzle = match.muzzle(me, camera.getWorldDirection(new T.Vector3())),
    hit = match.segmentHit(
      muzzle,
      target.position.clone().add(new T.Vector3(0, 0.6, 0)),
    ),
    foot = match.footing(target);
  // Striking the target's own floor beside it is a hit, not an obstruction.
  const ownFloor =
    hit &&
    foot?.level === hit.level &&
    Math.hypot(
      hit.point.x - target.position.x,
      hit.point.z - target.position.z,
    ) < 3.5;
  return { blocked: !!hit && !ownFloor };
}
function updateMatch(dt) {
  if (playing) {
    const input = {
      ...gameControls.movement(follow.yaw),
      target: targetInReticle(),
    };
    if (!paused) {
      aimAssist(dt);
      accumulator += dt;
    }
    while (accumulator >= RULES.step) {
      match.step(RULES.step, input);
      accumulator -= RULES.step;
    }
    const p = match.players[0];
    if (p.lock.holding) p.rotation = follow.yaw + Math.PI;
    // Keep the scoped view while the player's own rocket is in flight.
    const watching = match.projectiles.some((r) => r.owner === 0);
    follow.update(p, dt, p.lock.holding || watching);
    hud.update(match, camera, viewport, aimInfo());
  }
  for (const a of actors) {
    const p = a.sim;
    if(p.removed){a.model.visible=false;a.weapon.visible=false;continue;}
    if (playing) {
      a.model.position.copy(p.position);
      a.model.rotation.y = p.rotation;
      action(a, p.animation === "dive" ? "fall" : p.animation);
      if (!p.alive) {
        const t = Math.min(1, (match.time - p.eliminatedAt) / 0.75);
        a.model.position.y -= t * 1.3;
        a.model.scale.setScalar(Math.max(0.001, 1 - t));
        a.model.visible = !p.removed;
      }
      if (p.animation === "dive") a.model.rotation.x = -0.7;
      else a.model.rotation.x = T.MathUtils.damp(a.model.rotation.x, 0, 12, dt);
    }
    a.weapon.visible = p.launcher !== null;
    a.mixer.update(dt);
    applyGrip(a.model, a.weapon);
  }
  for (const h of hammers) {
    h.sweep.rotation.y = playing ? h.sim.angle : elapsed * h.sim.omega;
    h.root.visible = !h.sim.tile.gone;
  }
  for (const p of pickups) {
    p.root.visible = p.sim.state === "resting" || p.sim.state === "falling";
    p.root.position.copy(p.sim.position);
    p.root.rotation.y = elapsed * 0.4;
  }
  rocketFX.update(match, dt);
}
async function init() {
  await Promise.all(
    [
      "characters/girl",
      "characters/boy",
      "worlds/volcano",
      "worlds/cityscape",
      "props/hammer",
      "props/rocket",
      "props/rocket-held",
      ...["volcano", "cityscape"].flatMap((w) =>
        ["normal", "burst"].map((v) => `props/${w}-${v}`),
      ),
    ].map(get),
  );
  const pedMat = material(0x3e4157);
  for (const x of [-1.2, 1.2]) {
    const pedestal = new T.Mesh(
      new T.CylinderGeometry(1.15, 1.22, 0.18, 48),
      pedMat,
    );
    pedestal.position.set(x, -0.16, 0);
    pedestal.receiveShadow = true;
    rosterRoot.add(pedestal);
  }
  const a = actor("girl", rosterRoot, -1.2, 0, 0),
    b = actor("boy", rosterRoot, 1.2, 0, 0);
  window.rosterActors = [a, b];
  setupWorld();
  $("#loading").remove();
}
document.querySelectorAll("[data-world]").forEach(
  (b) =>
    (b.onclick = () => {
      world = b.dataset.world;
      document
        .querySelectorAll("[data-world]")
        .forEach((x) => x.classList.toggle("active", x === b));
      mode = "world";
      $("#animation-panel").hidden = true;
      setupWorld();
    }),
);
document.querySelectorAll("[data-character]").forEach(
  (b) =>
    (b.onclick = () => {
      selected = b.dataset.character;
      document
        .querySelectorAll("[data-character]")
        .forEach((x) => x.classList.toggle("selected", x === b));
      if (mode === "world") {
        const restart = playing;
        setupWorld();
        if (restart) begin();
      }
    }),
);
document.querySelectorAll("[data-difficulty]").forEach(
  (b) =>
    (b.onclick = () => {
      difficulty = b.dataset.difficulty;
      document
        .querySelectorAll("[data-difficulty]")
        .forEach((x) => x.classList.toggle("selected", x === b));
      setupWorld();
    }),
);
$("#roster").onclick = roster;
$('#roster-weapon').onclick=()=>{const show=!window.rosterActors[0].weapon.visible;window.rosterActors.forEach(a=>a.weapon.visible=show);$('#roster-weapon').textContent=show?'Put launcher away':'Hold launcher';};
$("#return").onclick = returnWorld;
$("#play").onclick = begin;
$("#reset").onclick = () => {
  mode === "roster"
    ? window.rosterActors.forEach((a) => action(a, "idle"))
    : setupWorld();
};
$("#animation").onchange = (e) =>
  window.rosterActors.forEach((a) => action(a, e.target.value));
$("#crowd").onclick = () => {
  crowd = { 2: 5, 5: 10, 10: 15, 15: 2 }[crowd];
  $("#crowd").textContent = `${crowd} / 15 players`;
  if (mode === "world") {
    setupWorld();
    toast(
      crowd === 15
        ? "15 animated characters · Local rendering stress preview"
        : "Drag to orbit · Scroll to explore",
    );
  }
};
$("#quality").onclick = () => {
  high = !high;
  bloom.enabled = high;
  renderer.setPixelRatio(high ? Math.min(devicePixelRatio, 1.5) : 1);
  $("#quality").textContent = `Quality: ${high ? "High" : "Lite"}`;
  resize();
};

const gameControls = new GameControls(renderer.domElement, {
  enabled: () => playing && !paused,
  canAim: () => !!match && match.players[0].launcher !== null,
  jump: () => match?.jump(0),
  dive: () => match?.dive(0),
  hold: () => {
    hud.unlockAudio();
    match?.holdFire(0);
  },
  release: () => match?.releaseFire(0, { direction: aimDirection() }),
  cancel: () => match?.cancelFire(0),
  look: (x, y) => follow.look(x, y),
});
function openControls() {
  if (hud.controlsOpen) return;
  if (playing) {
    paused = true;
    gameControls.reset();
  }
  hud.showControls(() => {
    paused = false;
  });
}
addEventListener("keydown", (e) => {
  if (e.key === "?" && playing) openControls();
});
$("#controls-open").onclick = openControls;
$("#controls-open-studio").onclick = openControls;
$("#exit-match").onclick = () => {
  mode = "world";
  setupWorld();
};
function resize() {
  const w = viewport.clientWidth,
    h = viewport.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
}
addEventListener("resize", resize);
resize();
let fpsFrames = 0,
  fpsTime = 0;
renderer.setAnimationLoop(() => {
  const wallDt = clock.getDelta(),
    dt = Math.min(wallDt, 0.05);
  elapsed += dt;
  effects?.update(elapsed);
  lava.material.uniforms.time.value = elapsed;

  if (match) updateMatch(dt);
  for (const a of window.rosterActors || []) {
    a.mixer.update(dt);
    applyGrip(a.model, a.weapon);
  }
  traffic?.update(dt);
  const sparks = worldRoot.getObjectByName("sparks");
  if (sparks) sparks.position.y = (elapsed * 0.3) % 3;
  updateTiles();
  if (!playing) controls.update();
  renderer.info.reset();
  composer.render();
  fpsFrames++;
  fpsTime += wallDt;
  if (fpsTime > 0.6) {
    $("#performance").textContent =
      `${Math.round(fpsFrames / fpsTime)} FPS · ${remaining} tiles · ${mode === "roster" ? 2 : crowd} characters`;
    fpsTime = 0;
    fpsFrames = 0;
  }
});
window.dropStudio = {
  get state() {
    return {
      world,
      mode,
      playing,
      crowd,
      difficulty,
      tiles: tiles.length,
      remaining,
      playerPosition: player?.model.position.toArray(),
      phase: match?.phase,
      ammo: match?.players[0].ammo,
      lock: match?.players[0].lock,
      gridSide: match?.data.side,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  },
  triggerTile(id) {
    const t = tiles.find((t) => t.id === id);
    if (t) trigger(t);
  },
  get tiles() {
    return tiles;
  },
  get actors() {
    return actors;
  },
  get match() {
    return match;
  },
  follow,
  gameControls,
  scene,
  camera,
  renderer,
};
init().catch((error) => {
  console.error(error);
  $("#loading").innerHTML =
    "<p>Could not load the asset package. Check the console and run npm run assets.</p>";
});
