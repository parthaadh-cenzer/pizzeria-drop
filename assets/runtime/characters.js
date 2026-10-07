import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { C } from "./palette.js";

// Same rest pose, naming and bind transforms for both starter characters.
export const joints = [
  ["Hips", null, 0, 0.6, 0],
  ["Spine", "Hips", 0, 0.16, 0],
  ["Chest", "Spine", 0, 0.19, 0],
  ["Neck", "Chest", 0, 0.1, 0],
  ["Head", "Neck", 0, 0.18, 0],
  ["LeftShoulder", "Chest", 0.23, 0.03, 0],
  ["LeftArm", "LeftShoulder", 0.12, 0, 0],
  ["LeftForeArm", "LeftArm", 0.18, 0, 0],
  ["LeftHand", "LeftForeArm", 0.16, 0, 0],
  ["RightShoulder", "Chest", -0.23, 0.03, 0],
  ["RightArm", "RightShoulder", -0.12, 0, 0],
  ["RightForeArm", "RightArm", -0.18, 0, 0],
  ["RightHand", "RightForeArm", -0.16, 0, 0],
  ["LeftUpLeg", "Hips", 0.18, -0.04, 0],
  ["LeftLeg", "LeftUpLeg", 0, -0.22, 0],
  ["LeftFoot", "LeftLeg", 0, -0.22, 0.025],
  ["RightUpLeg", "Hips", -0.18, -0.04, 0],
  ["RightLeg", "RightUpLeg", 0, -0.22, 0],
  ["RightFoot", "RightLeg", 0, -0.22, 0.025],
];
export function makeCharacter(kind = "girl") {
  const group = new T.Group();
  group.name = `starter_${kind}`;
  const bones = {},
    pieces = [];
  const accent = kind === "girl" ? C.red : C.blue;
  for (const [name, parent, x, y, z] of joints) {
    const b = new T.Bone();
    b.name = name;
    b.position.set(x, y, z);
    bones[name] = b;
    (parent ? bones[parent] : group).add(b);
  }
  group.updateMatrixWorld(true);
  function part(
    bone,
    geo,
    color,
    pos = [0, 0, 0],
    scale = [1, 1, 1],
    rotation = [0, 0, 0],
    slot = "body",
  ) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const transform = new T.Matrix4().compose(
      new T.Vector3(...pos),
      new T.Quaternion().setFromEuler(new T.Euler(...rotation)),
      new T.Vector3(...scale),
    );
    g.applyMatrix4(bones[bone].matrixWorld.clone().multiply(transform));
    const n = g.attributes.position.count,
      col = new T.Color(color),
      colors = [],
      indices = [],
      weights = [];
    for (let i = 0; i < n; i++) {
      colors.push(col.r, col.g, col.b);
      indices.push(
        joints.findIndex((j) => j[0] === bone),
        0,
        0,
        0,
      );
      weights.push(1, 0, 0, 0);
    }
    g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    g.setAttribute("skinIndex", new T.Uint16BufferAttribute(indices, 4));
    g.setAttribute("skinWeight", new T.Float32BufferAttribute(weights, 4));
    g.deleteAttribute("uv");
    pieces.push({ g, slot });
  }

  const ball = new T.SphereGeometry(1, 16, 10),
    shoe = new RoundedBoxGeometry(1, 1, 1, 2, 0.22);
  const oval = (bone, color, p, scale, rot, slot) =>
    part(bone, ball, color, p, scale, rot, slot);
  // Compact dumpling-shaped body, tiny articulated limbs and soft oversized sneakers.
  oval("Spine", accent, [0, 0.01, 0], [0.32, 0.3, 0.245], undefined, "upper");
  oval(
    "Chest",
    C.cream,
    [0, -0.07, 0.223],
    [0.185, 0.15, 0.023],
    undefined,
    "upper",
  );
  part(
    "Chest",
    new T.ConeGeometry(0.087, 0.15, 3),
    C.gold,
    [0, -0.05, 0.255],
    [1, 1, 0.23],
    [0, 0, Math.PI],
    "upper",
  );
  oval(
    "Chest",
    C.red,
    [-0.017, -0.045, 0.278],
    [0.024, 0.024, 0.008],
    undefined,
    "upper",
  );
  oval(
    "Hips",
    0x303248,
    [0, -0.025, 0],
    [0.285, 0.16, 0.225],
    undefined,
    "lower",
  );
  for (const side of ["Left", "Right"]) {
    const sign = side === "Left" ? 1 : -1;
    oval(
      side + "Arm",
      accent,
      [sign * 0.07, 0, 0],
      [0.17, 0.135, 0.14],
      undefined,
      "upper",
    );
    oval(
      side + "ForeArm",
      accent,
      [sign * 0.055, 0, 0],
      [0.14, 0.11, 0.115],
      undefined,
      "upper",
    );
    oval(side + "Hand", C.skin, [sign * 0.035, 0, 0.015], [0.115, 0.1, 0.105]);
    oval(
      side + "Hand",
      C.skin,
      [sign * 0.02, -0.065, 0.073],
      [0.048, 0.058, 0.055],
    );
    oval(
      side + "UpLeg",
      0x303248,
      [0, -0.075, 0],
      [0.14, 0.16, 0.15],
      undefined,
      "lower",
    );
    oval(side + "Leg", C.skin, [0, -0.075, 0.005], [0.105, 0.14, 0.11]);
    part(
      side + "Foot",
      shoe,
      C.cream,
      [0, -0.078, 0.105],
      [0.43, 0.1, 0.57],
      undefined,
      "shoes",
    );
    part(
      side + "Foot",
      shoe,
      accent,
      [0, 0.005, 0.08],
      [0.40, 0.24, 0.51],
      undefined,
      "shoes",
    );
    part(
      side + "Foot",
      shoe,
      C.cream,
      [0, -.01, .288],
      [.35,.13,.12],
      undefined,
      "shoes",
    );
    for (let j = 0; j < 2; j++)
      part(
        side + "Foot",
        shoe,
        C.cream,
        [0, 0.133, 0.09 + j * 0.065],
        [0.21, 0.022, 0.03],
        undefined,
        "shoes",
      );
  }
  oval("Neck", C.skin, [0, 0.04, 0], [0.1, 0.15, 0.11]);
  // One uninterrupted round face, simple bean eyes and a cheerful open smile.
  oval("Head", C.skin, [0, 0.29, 0], [0.64, 0.62, 0.52]);
  for (const sign of [-1, 1]) {
    oval("Head", C.skin, [sign * 0.615, 0.21, 0], [0.095, 0.115, 0.085]);
    oval("Head", 0xf09483, [sign * 0.362, 0.105, 0.442], [0.086, 0.035, 0.018]);
    oval("Head", 0x30202b, [sign * 0.205, 0.28, 0.505], [0.091, 0.132, 0.038]);
    oval("Head", 0xffffff, [sign * 0.195, 0.325, 0.541], [0.027, 0.035, 0.009]);
    oval("Head", 0xb98160, [sign * 0.215, 0.204, 0.537], [0.033, 0.018, 0.009]);
    oval(
      "Head",
      C.hair,
      [sign * 0.206, 0.472, 0.462],
      [0.073, 0.017, 0.019],
      [0, 0, sign * -0.12],
    );
  }
  oval("Head", 0xf4af91, [0, 0.155, 0.527], [0.03, 0.029, 0.025]);
  oval("Head", 0x622939, [0, 0.036, 0.488], [0.103, 0.07, 0.023]);
  oval("Head", 0xfff5e4, [0, 0.065, 0.511], [0.077, 0.023, 0.009]);
  oval("Head", 0xf48491, [0, -0.002, 0.51], [0.047, 0.026, 0.01]);
  const hair = kind === "girl" ? 0x593332 : 0x473035;
  part(
    "Head",
    new T.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.51),
    hair,
    [0, 0.32, -0.025],
    [0.665, 0.66, 0.55],
    undefined,
    "hair",
  );
  for (let j = 0; j < 3; j++)
    oval(
      "Head",
      hair,
      [-0.34 + j * 0.3, 0.6 + (j === 1 ? 0.04 : 0), 0.4],
      [0.265, 0.17, 0.175],
      [0, 0, -0.32 + j * 0.18],
      "hair",
    );
  if (kind === "girl")
    for (const sign of [-1, 1]) {
      oval(
        "Head",
        hair,
        [sign * 0.63, 0.57, -0.075],
        [0.235, 0.235, 0.225],
        undefined,
        "hair",
      );
      oval(
        "Head",
        accent,
        [sign * 0.59, 0.43, 0.11],
        [0.11, 0.065, 0.07],
        undefined,
        "hair",
      );
      oval(
        "Head",
        C.cream,
        [sign * 0.58, 0.43, 0.173],
        [0.028, 0.028, 0.01],
        undefined,
        "hair",
      );
    }
  else {
    oval(
      "Head",
      hair,
      [-0.17, 0.94, -0.03],
      [0.2, 0.13, 0.15],
      [0, 0, -0.4],
      "hair",
    );
    oval(
      "Head",
      hair,
      [0.035, 0.94, -0.035],
      [0.14, 0.115, 0.13],
      [0, 0, 0.25],
      "hair",
    );
  }
  const socket = new T.Object3D();
  socket.name = "WeaponSocket";
  socket.position.set(0, -0.1, 0.23);
  socket.userData = {
    forward: "+Z",
    rightGrip: [-0.15, -0.08, -0.08],
    leftGrip: [0.15, -0.08, 0.02],
  };
  bones.Chest.add(socket);
  // Four practical customization slots, plus skin; a single shared vertex-color material.
  const skinMat = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.74,
  });
  skinMat.name = "starter_palette";
  const skeleton = new T.Skeleton(joints.map((j) => bones[j[0]]));
  for (const slot of ["body", "hair", "upper", "lower", "shoes"]) {
    const geo = mergeGeometries(
      pieces.filter((p) => p.slot === slot).map((p) => p.g),
    );
    const m = new T.SkinnedMesh(geo, skinMat);
    m.name = slot;
    m.castShadow = true;
    m.frustumCulled = false;
    group.add(m);
    m.bind(skeleton);
  }
  group.userData = {
    kind,
    height: 2.3,
    forward: "+Z",
    rig: "drop_shared_19",
    slots: ["hair", "upper", "lower", "shoes"],
  };
  return group;
}
