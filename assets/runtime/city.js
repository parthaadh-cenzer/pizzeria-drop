import * as T from "three";
import { C, mesh, box, bar, rng } from "./palette.js";
import { bake } from "./props.js";
const pane = new T.PlaneGeometry(1, 1),
  RIM = 24.6;
export function makeCityEnvironment() {
  const root = new T.Group();
  root.name = "cityscape_environment";
  const random = rng(174);
  for (let side = 0; side < 4; side++) {
    const wall = new T.Group();
    wall.name = `city_side_${side}`;
    // Seven connected facade bays on each side descend 50 m into the cavity.
    for (let bay = -3; bay <= 3; bay++) {
      const x = bay * 6,
        structure = bay === -2 || bay === 2,
        color = [0x4b526b, 0x667084, 0x786a76, 0x4b6076][(bay + side + 4) % 4];
      mesh(box, color, wall, [x, -1, -21], [5.94, 50, 1.4]);
      for (const dx of [-2.9, 2.9])
        mesh(box, 0x303c53, wall, [x + dx, -1, -20.15], [0.22, 50, 0.22]);
      for (let row = 0; row < 16; row++) {
        const y = -23 + row * 3;
        mesh(box, 0x394158, wall, [x, y - 1.18, -20.16], [5.9, 0.17, 0.3]);
        if (!structure)
          for (let col = 0; col < 4; col++)
            if (random() > 0.18) {
              mesh(
                pane,
                random() > 0.2 ? 0xffc67c : 0x97bce3,
                wall,
                [x + (col - 1.5) * 1.22, y, -20.27],
                [0.6, 1.12, 1],
                0.65,
              );
            } else if (row % 2 === 0) {
              bar(
                wall,
                [x - 2.5, y - 1, -19.82],
                [x + 2.5, y + 4, -19.82],
                0.08,
                0x976452,
              );
              bar(
                wall,
                [x + 2.5, y - 1, -19.82],
                [x - 2.5, y + 4, -19.82],
                0.08,
                0x976452,
              );
              mesh(box, 0x536477, wall, [x, y - 1, -19.65], [5.3, 0.12, 1]);
              mesh(
                box,
                0xffc77a,
                wall,
                [x, y + 0.5, -19.63],
                [1.2, 0.14, 0.04],
                1,
              );
            }
      }
      // Broken concrete lip, exposed beams, ducts and service platforms.
      const lip = mesh(
        new T.CylinderGeometry(1, 1, 1, 5),
        0x7e8292,
        wall,
        [x, 23.75, -19.95],
        [3.1, 0.45, 1.2],
      );
      lip.rotation.y = 0.3 * (bay % 2);
      for (let j = 0; j < 3; j++)
        bar(
          wall,
          [x - 1.7 + j * 1.3, 23.6, -20],
          [x - 1.5 + j * 1.3, 22.4, -18.8],
          0.055,
          0x4e363e,
        );
      if (bay % 2 === 0) {
        bar(wall, [x, 22, -19.7], [x, -18, -19.7], 0.15, 0x7c929e);
        mesh(box, 0x9b855f, wall, [x + 0.6, 10, -19.55], [0.7, 1, 0.4]);
      }
    }
    const facade = bake(wall);
    facade.rotation.y = (side * Math.PI) / 2;
    facade.name = `facade_${side}`;
    facade.userData = { side, occluder: "facade" };
    root.add(facade);
    const street = new T.Group();
    street.name = `street_${side}`;
    mesh(box, 0x30364b, street, [0, RIM - 0.25, -24], [46, 0.5, 6]);
    mesh(box, 0x858794, street, [0, RIM + 0.04, -20.85], [43, 0.18, 0.55]);
    mesh(box, 0x758397, street, [0, RIM + 0.04, -27], [46, 0.18, 0.6]);
    for (let x = -21; x <= 21; x += 3)
      mesh(box, 0xf3d798, street, [x, RIM + 0.014, -24], [1.5, 0.025, 0.1]);
    for (let x = -20; x <= 20; x += 4) {
      if (side === 0 && x === 12) continue;
      mesh(box, 0xe6b359, street, [x, RIM + 0.55, -20.75], [2.1, 0.75, 0.38]);
      for (let j = -1; j <= 1; j++) {
        const stripe = mesh(
          box,
          0x30354b,
          street,
          [x + j * 0.6, RIM + 0.55, -20.53],
          [0.22, 0.68, 0.026],
        );
        stripe.rotation.z = -0.38;
      }
    }
    for (let x = -18; x <= 18; x += 9) {
      bar(street, [x, RIM, -26], [x, RIM + 3.6, -26], 0.06, 0x3c455c);
      bar(street, [x, RIM + 3.6, -26], [x, RIM + 3.6, -24.7], 0.06, 0x3c455c);
      mesh(
        box,
        0xffd69b,
        street,
        [x, RIM + 3.52, -24.7],
        [0.4, 0.15, 0.8],
        1.5,
      );
    }
    for (let b = -3; b <= 3; b++) {
      const x = b * 7,
        h = 8 + ((b + side + 8) % 4) * 4,
        color = [0x4c5677, 0x677183, 0x735f79, 0x5b6386][(b + side + 8) % 4];
      mesh(box, color, street, [x, RIM + h / 2, -31], [6.5, h, 5]);
      mesh(box, 0x96a0b1, street, [x, RIM + h, -31], [6.75, 0.28, 5.2]);
      // Repeated, shallow facade modules, not isolated boxes placed on a circle.
      for (let row = 0; row < Math.floor(h / 2.2); row++)
        for (let col = 0; col < 4; col++)
          if (random() > 0.22)
            mesh(
              pane,
              0xffcf91,
              street,
              [x + (col - 1.5) * 1.3, RIM + 1.2 + row * 2.2, -28.47],
              [0.55, 0.88, 1],
              0.55,
            );
      for (const dx of [-3.1, 3.1])
        mesh(
          box,
          0x9a9aac,
          street,
          [x + dx, RIM + h / 2, -28.4],
          [0.12, h, 0.1],
        );
      if (b % 2 === 0) {
        mesh(box, 0x3b4661, street, [x, RIM + h + 0.6, -31], [2.4, 1.1, 2]);
        bar(
          street,
          [x, RIM + h + 1, -31],
          [x, RIM + h + 3.5, -31],
          0.04,
          C.red,
        );
      }
    }
    if (side === 0) {
      for (const x of [-8, 8]) {
        mesh(box, 0xe79b3b, street, [x, RIM + 1, -21.2], [0.3, 2, 0.3]);
        mesh(box, 0xf06b56, street, [x, RIM + 2, -21.2], [0.8, 0.16, 0.4], 1);
      }
      bar(street, [-12, RIM + 11, -26], [5, RIM + 11, -26], 0.12, 0xc38547);
      bar(street, [-12, RIM, -26], [-12, RIM + 11, -26], 0.18, 0xc38547);
      bar(street, [3, RIM + 11, -26], [3, RIM + 4, -26], 0.03, 0x444552);
    }
    const streets = bake(street);
    streets.rotation.y = (side * Math.PI) / 2;
    streets.name = `rim_${side}`;
    streets.userData = { side, occluder: "rim" };
    root.add(streets);
  }
  const depths = new T.Group();
  depths.name = "deep_city";
  mesh(box, 0x161c34, depths, [0, -33, 0], [43, 1, 43]);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2,
      x = Math.cos(a) * 16,
      z = Math.sin(a) * 16;
    mesh(box, 0x29334e, depths, [x, -24, z], [2.8, 15, 2.8]);
    mesh(box, 0xfbad72, depths, [x, -16.3, z], [0.8, 0.15, 0.8], 0.7);
  }
  for (const y of [-8, -19, -28]) {
    for (const x of [-16, 16])
      bar(depths, [x, y, -18], [x, y, 18], 0.22, 0x50637b);
    for (const z of [-16, 16])
      bar(depths, [-18, y, z], [18, y, z], 0.22, 0x50637b);
  }
  root.add(bake(depths));
  return root;
}
