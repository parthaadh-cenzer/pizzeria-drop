import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { C, mesh, box, cylinder, bar, sphere } from "./palette.js";
const slab = new RoundedBoxGeometry(1, 1, 1, 1, 0.08);
export function bake(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const mat = o.material,
      key = `${mat.emissiveIntensity || 0}/${mat.roughness}/${mat.emissiveIntensity ? mat.color.getHex() : 0}`;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    g.deleteAttribute("uv");
    const col = [];
    for (let i = 0; i < g.attributes.position.count; i++)
      col.push(mat.color.r, mat.color.g, mat.color.b);
    g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  });
  const out = new T.Group();
  out.name = group.name;
  for (const [key, geos] of buckets) {
    const [em, rough, color] = key.split("/").map(Number);
    const m = new T.Mesh(
      mergeGeometries(geos),
      new T.MeshStandardMaterial({
        vertexColors: true,
        roughness: rough,
        emissive: color,
        emissiveIntensity: em,
      }),
    );
    m.castShadow = true;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}
export function makeTile(biome = "volcano", variant = "normal") {
  const g = new T.Group();
  g.name = `${biome}_${variant}_tile`;
  const col = biome === "volcano" ? 0x716475 : 0x788699;
  mesh(slab, C.edge, g, [0, -0.24, 0], [2.25, 0.48, 2.25]);
  // One broad readable stone cap, with branching cracks instead of a noisy sub-grid.
  mesh(slab, col, g, [0, -0.045, 0], [2.19, 0.28, 2.19]);
  const fissures = [
    [
      [-1.08, -0.51],
      [-0.67, -0.4],
      [-0.43, -0.07],
      [-0.08, 0.05],
      [0.22, 0.53],
      [0.15, 1.08],
    ],
    [
      [-0.43, -0.07],
      [-0.23, -0.39],
      [0.14, -0.52],
      [0.29, -1.08],
    ],
    [
      [0.22, 0.53],
      [0.62, 0.47],
      [1.08, 0.68],
    ],
  ];
  for (const crack of fissures)
    for (let i = 1; i < crack.length; i++) {
      const a=crack[i-1],b=crack[i],dx=b[0]-a[0],dz=b[1]-a[1];
      const line=mesh(new T.PlaneGeometry(Math.hypot(dx,dz),.028).rotateX(-Math.PI/2),C.edge,g,[(a[0]+b[0])/2,.102,(a[1]+b[1])/2]);
      line.rotation.y=-Math.atan2(dz,dx);
    }
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      mesh(
        slab,
        biome === "volcano" ? 0xb97436 : C.gold,
        g,
        [x * 0.98, -0.08, z * 0.98],
        [0.23, 0.29, 0.23],
      );
      mesh(
        cylinder,
        C.iron,
        g,
        [x * 0.98, 0.075, z * 0.98],
        [0.046, 0.022, 0.046],
      );
    }
  if (variant === "unstable") {
    mesh(box, C.red, g, [0, -0.007, 0], [0.055, 0.15, 2.1], undefined);
    mesh(box, 0xff7b22, g, [0, 0.099, 0], [0.06, 0.012, 2], 1.6);
  }
  if (variant === "burst") {
    mesh(slab, C.gold, g, [0, 0.135, 0], [1.55, 0.085, 1.55], 0.6);
    mesh(slab, 0x8a471b, g, [0, 0.186, 0], [1.38, 0.026, 1.38]);
    for (let i = 0; i < 3; i++) {
      let z = -0.37 + i * 0.36;
      bar(g, [-0.4, 0.211, z + 0.2], [0, 0.211, z - 0.12], 0.048, 0xffef97);
      bar(g, [0, 0.211, z - 0.12], [0.4, 0.211, z + 0.2], 0.048, 0xffef97);
    }
  }
  return bake(g);
}

export function makeHammer() {
  const base = new T.Group();
  base.name = "hammer";
  mesh(slab, C.red, base, [0, 0.14, 0], [1, 0.28, 1]);
  mesh(cylinder, C.iron, base, [0, 0.49, 0], [0.3, 0.65, 0.3]);
  mesh(cylinder, C.gold, base, [0, 0.84, 0], [0.34, 0.12, 0.34]);
  const arm = new T.Group();
  arm.name = "sweep";
  bar(arm, [0, 0.95, 0], [2.45, 0.95, 0], 0.105, 0x86624c);
  mesh(slab, C.stone, arm, [2.45, 0.95, 0], [0.96, 1.02, 1.4]);
  mesh(slab, C.red, arm, [2.45, 0.95, 0], [1.0, 1.055, 0.28]);
  for (const z of [-0.69, 0.69])
    mesh(slab, C.iron, arm, [2.45, 0.95, z], [0.8, 0.83, 0.09]);
  const out = bake(base),
    sweep = bake(arm);
  sweep.name = "sweep";
  out.add(sweep);
  return out;
}
export function makeWeapon() {
  const g = new T.Group();
  g.name = "launcher_held";
  const barrel = mesh(
    new T.CylinderGeometry(0.145, 0.145, 0.62, 12),
    C.gold,
    g,
    [0, 0.07, 0.04],
  );
  barrel.rotation.x = Math.PI / 2;
  for (const z of [-0.23, 0.29]) {
    const ring = mesh(
      new T.CylinderGeometry(0.164, 0.164, 0.075, 12),
      C.red,
      g,
      [0, 0.07, z],
    );
    ring.rotation.x = Math.PI / 2;
  }
  const tip = mesh(
    new T.ConeGeometry(0.137, 0.19, 12),
    C.red,
    g,
    [0, 0.07, 0.405],
  );
  tip.rotation.x = Math.PI / 2;
  mesh(slab, C.iron, g, [0, -0.09, -0.06], [0.11, 0.18, 0.1]);
  mesh(slab, C.iron, g, [0, -0.055, 0.15], [0.15, 0.11, 0.12]);
  mesh(slab, C.cream, g, [0, 0.22, -0.045], [0.16, 0.1, 0.12]);
  mesh(slab, C.iron, g, [0, 0.235, 0.018], [0.095, 0.056, 0.025]);
  const out = bake(g);
  for (const [name, p] of [
    ["RightGrip", [-0.15, -0.08, -0.08]],
    ["LeftGrip", [0.15, -0.08, 0.02]],
    ["Muzzle", [0, 0.07, 0.5]],
  ]) {
    const n = new T.Object3D();
    n.name = name;
    n.position.set(...p);
    out.add(n);
  }
  out.userData = { forward: "+Z", shots: 2 };
  return out;
}
export function makeRocket() {
  const g = new T.Group();
  g.name = "rocket_pickup";
  mesh(slab, C.gold, g, [0, 0.11, 0], [1.12, 0.22, 0.85]);
  mesh(slab, C.iron, g, [0, 0.24, 0], [0.58, 0.16, 0.42]);
  bar(g, [0, 0.3, 0], [0, 0.78, 0], 0.12, C.gold);
  const b = mesh(
    new T.CylinderGeometry(0.22, 0.22, 1.16, 12),
    C.gold,
    g,
    [0, 0.83, 0],
  );
  b.rotation.z = Math.PI / 2;
  for (const x of [-0.48, 0.4]) {
    const r = mesh(new T.CylinderGeometry(0.255, 0.255, 0.19, 12), C.red, g, [
      x,
      0.83,
      0,
    ]);
    r.rotation.z = Math.PI / 2;
  }
  const tip = mesh(
    new T.ConeGeometry(0.23, 0.38, 12),
    C.red,
    g,
    [0.77, 0.83, 0],
  );
  tip.rotation.z = -Math.PI / 2;
  const muzzle = mesh(
    new T.CylinderGeometry(0.18, 0.18, 0.08, 12),
    C.iron,
    g,
    [-0.63, 0.83, 0],
  );
  muzzle.rotation.z = Math.PI / 2;
  mesh(slab, C.cream, g, [0, 0.89, 0.23], [0.34, 0.3, 0.055]);
  mesh(slab, C.iron, g, [0, 0.89, 0.27], [0.22, 0.19, 0.025]);
  return bake(g);
}
