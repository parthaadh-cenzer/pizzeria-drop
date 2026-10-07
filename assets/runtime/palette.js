import * as T from "three";
export const C = {
  stone: 0x58566a,
  edge: 0x343343,
  iron: 0x292d40,
  red: 0xf34b38,
  gold: 0xffb62e,
  cream: 0xffefd1,
  blue: 0x3477ef,
  skin: 0xffc39b,
  hair: 0x422527,
  hairLight: 0x76402e,
};
const mats = new Map();
export function material(color, emissive = 0, roughness = 0.72) {
  const key = `${color}/${emissive}/${roughness}`;
  if (!mats.has(key))
    mats.set(
      key,
      new T.MeshStandardMaterial({
        color,
        roughness,
        metalness: roughness < 0.5 ? 0.35 : 0,
        emissive: color,
        emissiveIntensity: emissive,
      }),
    );
  return mats.get(key);
}
export function mesh(
  geometry,
  color,
  parent,
  position = [0, 0, 0],
  scale = [1, 1, 1],
  emissive = 0,
) {
  const m = new T.Mesh(geometry, material(color, emissive));
  m.position.set(...position);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
export const box = new T.BoxGeometry(1, 1, 1);
export const sphere = new T.SphereGeometry(1, 16, 12);
export const cylinder = new T.CylinderGeometry(1, 1, 1, 10);
export function bar(parent, a, b, r, color) {
  const d = new T.Vector3(...b).sub(new T.Vector3(...a));
  const m = mesh(
    cylinder,
    color,
    parent,
    new T.Vector3(...a).addScaledVector(d, 0.5).toArray(),
    [r, d.length(), r],
  );
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  return m;
}
export function rng(seed = 16) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
