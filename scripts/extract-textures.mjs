import fs from "node:fs";
import * as THREE from "three";
import sharp from "sharp";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
globalThis.window = { URL: globalThis.URL };
THREE.TextureLoader.prototype.load = function (url) {
  const t = new THREE.Texture();
  t.userData.url = url;
  return t;
};
for (const [id, file] of [
  ["girl", "assets/Girl 1/Idle.fbx"],
  ["boy", "assets/Guy 1/Idle (1).fbx"],
]) {
  const b = fs.readFileSync(file);
  const m = new FBXLoader().parse(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    "",
  );
  let i = 0;
  for (const o of (function () {
    let a = [];
    m.traverse((o) => {
      if (o.isMesh) a.push(o);
    });
    return a;
  })())
    for (const mat of [].concat(o.material))
      if (mat.map) {
        const data = await (await fetch(mat.map.userData.url)).arrayBuffer();
        await sharp(Buffer.from(data))
          .resize(768, 768, { fit: "inside" })
          .png()
          .toFile(`assets/reports/${id}-source-texture-${i++}.png`);
      }
}
