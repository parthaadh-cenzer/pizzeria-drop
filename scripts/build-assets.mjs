import fs from "node:fs";
import path from "node:path";
import * as T from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld, resample, prune } from "@gltf-transform/functions";
import { makeCharacter, joints } from "../assets/runtime/characters.js";
import { makeEnvironment, layout } from "../assets/runtime/worlds.js";
import {
  makeTile,
  makeHammer,
  makeRocket,
  makeWeapon,
} from "../assets/runtime/props.js";
globalThis.window = { URL: globalThis.URL };
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};
T.TextureLoader.prototype.load = function () {
  return new T.Texture();
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS),
  manifest = {
    version: 1,
    units: "meters",
    up: "+Y",
    forward: "+Z",
    characters: [],
    worlds: [],
    props: [],
    animationSource:
      "Local supplied Mixamo FBX; baked world-space rest-pose retarget at 24 fps.",
    generatedAt: new Date().toISOString(),
  };
const map = { Chest: "Spine2" };
const inputs = {
  idle: "Girl 1/Idle.fbx",
  run: "Girl 1/Fast Run (2).fbx",
  jump: "Girl 1/Jumping.fbx",
  fall: "Girl 1/Falling.fbx",
  recovery: "Guy 1/Getting Up (4).fbx",
  dance: "Girl 1/Step Hip Hop Dance.fbx",
};
const clips = [];
for (const [name, file] of Object.entries(inputs)) {
  console.log("Retarget", name);
  const bytes = fs.readFileSync(`assets/${file}`),
    source = new FBXLoader().parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  source.updateMatrixWorld(true);
  const srcBones = {};
  source.traverse((o) => {
    if (o.isBone) srcBones[o.name.replace("mixamorig", "")] = o;
  });
  const rest = {};
  for (const [n, b] of Object.entries(srcBones))
    rest[n] = b.getWorldQuaternion(new T.Quaternion()).invert();
  const restY = srcBones.Hips.getWorldPosition(new T.Vector3()).y;
  const clip = source.animations.find((a) => a.tracks.length),
    mixer = new T.AnimationMixer(source);
  mixer.clipAction(clip).play();
  const duration = clip.duration,
    frames = Math.ceil(duration * 24),
    times = [],
    values = Object.fromEntries(joints.map((j) => [j[0], []])),
    positions = [];
  for (let f = 0; f <= frames; f++) {
    const t = Math.min(f / 24, duration - 0.00001);
    mixer.setTime(t);
    source.updateMatrixWorld(true);
    times.push(f === frames ? duration : t);
    const world = {};
    for (const [n, parent] of joints) {
      const s = map[n] || n;
      const q = srcBones[s]
        ? srcBones[s].getWorldQuaternion(new T.Quaternion()).multiply(rest[s])
        : new T.Quaternion();
      world[n] = q.clone();
      if (parent) q.premultiply(world[parent].clone().invert());
      values[n].push(...q.toArray());
    }
    const dy =
      (srcBones.Hips.getWorldPosition(new T.Vector3()).y - restY) * 0.0047;
    positions.push(0, 0.6 + dy, 0);
  }
  const tracks = joints.map(
    (j) =>
      new T.QuaternionKeyframeTrack(`${j[0]}.quaternion`, times, values[j[0]]),
  );
  tracks.push(new T.VectorKeyframeTrack("Hips.position", times, positions));
  clips.push(new T.AnimationClip(name, duration, tracks));
  mixer.uncacheRoot(source);
}
// Short authored transitions fill genuine gaps in the supplied animation library.
for (const [name, duration, angle] of [
  ["landing", 0.38, 0.22],
  ["hit", 0.48, -0.28],
]) {
  const times = [0, duration * 0.35, duration],
    q = [0, angle, 0].flatMap((v) =>
      new T.Quaternion().setFromEuler(new T.Euler(v, 0, 0)).toArray(),
    );
  clips.push(
    new T.AnimationClip(name, duration, [
      new T.QuaternionKeyframeTrack("Chest.quaternion", times, q),
      new T.VectorKeyframeTrack("Hips.position", times, [
        0,
        0.6,
        0,
        0,
        name === "landing" ? 0.49 : 0.57,
        0,
        0,
        0.6,
        0,
      ]),
    ]),
  );
}
async function save(object, file, animations = []) {
  object.updateMatrixWorld(true);
  let exportRoot = object;
  if (object.name.startsWith("starter_")) {
    exportRoot = new T.Scene();
    exportRoot.name = object.name;
    exportRoot.userData = object.userData;
    exportRoot.add(...object.children);
  }
  const raw = await new GLTFExporter().parseAsync(exportRoot, {
    binary: true,
    animations,
    onlyVisible: true,
  });
  const doc = await io.readBinary(new Uint8Array(raw));
  for (const mat of doc.getRoot().listMaterials())
    if (mat.getEmissiveFactor().every((v) => v === 0))
      mat.setExtension("KHR_materials_emissive_strength", null);
  await doc.transform(weld(), dedup(), resample(), prune({ keepLeaves: true }));
  const data = await io.writeBinary(doc);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  const triangles = doc
    .getRoot()
    .listMeshes()
    .reduce(
      (n, m) =>
        n +
        m
          .listPrimitives()
          .reduce(
            (s, p) =>
              s +
              (p.getIndices()?.getCount() ||
                p.getAttribute("POSITION").getCount()) /
                3,
            0,
          ),
      0,
    );
  console.log(file, data.length, triangles);
  return {
    path: file.replace("assets/", ""),
    bytes: data.length,
    triangles,
    animations: animations.map((a) => ({ name: a.name, duration: a.duration })),
  };
}
for (const kind of ["girl", "boy"]) {
  manifest.characters.push(
    await save(makeCharacter(kind), `assets/characters/${kind}.glb`, clips),
  );
}
for (const biome of ["volcano", "cityscape"]) {
  const info = layout(biome, 15, "hard");
  fs.writeFileSync(
    `assets/worlds/${biome}.layout.json`,
    JSON.stringify(info, null, 2),
  );
  const env = makeEnvironment(biome);
  const report = await save(env, `assets/worlds/${biome}.glb`);
  manifest.worlds.push({
    ...report,
    layout: `worlds/${biome}.layout.json`,
    tiles: info.tiles.length,
  });
  const prototypes = {};
  for (const variant of ["normal", "unstable", "burst"]) {
    prototypes[variant] = makeTile(biome, variant);
    manifest.props.push(
      await save(prototypes[variant], `assets/props/${biome}-${variant}.glb`),
    );
  }
  // A portable assembled art map complements the instanced runtime layout.
  const assembled = new T.Group();
  assembled.name = `${biome}_assembled_arena`;
  assembled.add(env.clone());
  const hammer = makeHammer(),
    rocket = makeRocket();
  for (const t of info.tiles) {
    if (!t.startsPresent) continue;
    const tile = prototypes[t.variant].clone();
    tile.position.set(t.x, t.y, t.z);
    tile.rotation.y = t.rotationY;
    tile.name = t.id;
    tile.userData = { ...t, collapseDelay: 3 };
    assembled.add(tile);
    if (t.hammer) {
      const h = hammer.clone();
      h.position.set(t.x, t.y + 0.15, t.z);
      assembled.add(h);
    }
    if (t.pickup) {
      const r = rocket.clone();
      r.position.set(t.x, t.y + 0.3, t.z);
      assembled.add(r);
    }
  }
  const floor = new T.Mesh(
    biome === "volcano" ? new T.CylinderGeometry(22, 22, 0.3, 48) : new T.BoxGeometry(42, 0.5, 42),
    new T.MeshStandardMaterial({
      color: biome === "volcano" ? 0xff6318 : 0x252f49,
      emissive: biome === "volcano" ? 0xe94806 : 0,
      emissiveIntensity: 0.7,
    }),
  );
  floor.position.y = biome === "volcano" ? -1.3 : -34;
  assembled.add(floor);
  await save(assembled, `assets/worlds/${biome}-assembled.glb`);
  manifest.worlds.at(-1).assembled = `worlds/${biome}-assembled.glb`;
}
manifest.props.push(await save(makeHammer(), "assets/props/hammer.glb"));
manifest.props.push(await save(makeRocket(), "assets/props/rocket.glb"));
manifest.props.push(await save(makeWeapon(), "assets/props/rocket-held.glb"));
fs.writeFileSync("assets/manifest.json", JSON.stringify(manifest, null, 2));
