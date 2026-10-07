import fs from "node:fs";
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
globalThis.window = { URL: globalThis.URL };
THREE.TextureLoader.prototype.load = function (url) {
  const t = new THREE.Texture();
  t.userData.url = url;
  return t;
};
const report = [];
for (const file of ["assets/Girl 1/Idle.fbx", "assets/Guy 1/Idle (1).fbx"]) {
  const bytes = fs.readFileSync(file);
  const model = new FBXLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  const meshes = [];
  model.traverse((o) => {
    if (o.isMesh)
      meshes.push({
        name: o.name,
        vertices: o.geometry.attributes.position.count,
        triangles:
          (o.geometry.index?.count || o.geometry.attributes.position.count) / 3,
        bones: o.skeleton?.bones.map((b) => b.name),
        materials: (Array.isArray(o.material) ? o.material : [o.material]).map(
          (m) => ({
            name: m.name,
            color: m.color?.getHexString(),
            map: m.map?.userData.url?.slice(0, 80),
          }),
        ),
      });
  });
  report.push({
    file,
    bounds: new THREE.Box3().setFromObject(model),
    meshes,
    clips: model.animations.map((a) => ({
      name: a.name,
      duration: a.duration,
      tracks: a.tracks.length,
      first: a.tracks[0]?.name,
    })),
  });
}
fs.writeFileSync(
  "assets/reports/source-audit.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
