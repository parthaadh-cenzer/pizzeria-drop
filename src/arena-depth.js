import * as T from "three";
import { mesh, box, rng } from "../assets/runtime/palette.js";
import { bake } from "../assets/runtime/props.js";

// Cheap shaft below the authored world shell for 5–10 floor towers.
// Geometry is merged by material (bake), so a 10-floor shaft adds only a few draw calls.
// Returns { group, front }: "front" holds the camera-facing (+x/+z) parts so the studio
// overview can fade them like the authored shell's occluder sides.
export function makeShaft(world, top, bottom) {
  const back = new T.Group(),
    fore = new T.Group(),
    side = (x, z) => (x + z > 6 ? fore : back),
    random = rng(31),
    height = top - bottom,
    mid = (top + bottom) / 2;
  if (world === "volcano") {
    const column = new T.CylinderGeometry(1, 1.25, 1, 5);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2,
        x = Math.cos(a) * 23,
        z = Math.sin(a) * 23;
      const g = side(x, z);
      const c = mesh(column, i % 3 ? 0x403746 : 0x4a3d4d, g, [x, mid, z], [2.5, height, 2.4]);
      c.rotation.y = -a;
      // Glowing magma seams at varying heights read as depth without lights.
      for (let y = bottom + 2 + random() * 4; y < top - 1; y += 5 + random() * 5)
        mesh(box, 0xff6a2a, g, [x * 0.93, y, z * 0.93], [0.18, 0.9 + random() * 1.4, 0.18], 1.6);
    }
    column.dispose();
  } else {
    for (const [x, z, ry] of [
      [0, -20, 0],
      [0, 20, 0],
      [-20, 0, Math.PI / 2],
      [20, 0, Math.PI / 2],
    ]) {
      const g = side(x, z);
      const wall = mesh(box, 0x2b3552, g, [x, mid, z], [41, height, 0.8]);
      wall.rotation.y = ry;
      // Lit window grid continuing the city facades downward.
      for (let y = top - 2; y > bottom + 1; y -= 3)
        for (let k = -18; k <= 18; k += 3.2) {
          if (random() < 0.35) continue;
          const wx = ry ? x - Math.sign(x) * 0.45 : k,
            wz = ry ? k : z - Math.sign(z) * 0.45;
          mesh(box, random() < 0.8 ? 0xd59e4e : 0x8fb2ff, g, [wx, y, wz], ry ? [0.1, 1, 1.1] : [1.1, 1, 0.1], 0.55);
        }
    }
    for (let y = top - 6; y > bottom; y -= 11)
      for (const z of [-18, 18]) {
        mesh(box, 0x50637b, side(0, z), [0, y, z], [38, 0.35, 0.35]);
        mesh(box, 0x50637b, side(z, 0), [z, y, 0], [0.35, 0.35, 38]);
      }
  }
  const group = bake(back),
    front = bake(fore),
    resources = [];
  group.name = "depth_shaft";
  front.name = "depth_shaft_front";
  for (const part of [group, front])
    part.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        resources.push(o.geometry, o.material);
      }
    });
  group.add(front);
  return { group, front, resources };
}
