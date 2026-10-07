import * as T from "three";
import { material, sphere, cylinder } from "../assets/runtime/palette.js";
import { bake } from "../assets/runtime/props.js";

// Procedural chibi crown: open gold band, five tipped points, front jewels. Baked once.
function buildCrown() {
  const g = new T.Group(),
    gold = material(0xffc63a, 0.45, 0.32),
    add = (geo, mat, p, s, r = [0, 0, 0]) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(...p);
      m.scale.set(...s);
      m.rotation.set(...r);
      g.add(m);
    };
  const band = new T.CylinderGeometry(1, 0.86, 1, 20, 1, true);
  add(band, gold, [0, 0.08, 0], [0.31, 0.17, 0.31]);
  add(cylinder, material(0xe9a62a, 0.3, 0.32), [0, 0.0, 0], [0.275, 0.035, 0.275]);
  const point = new T.ConeGeometry(1, 1, 6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.sin(a) * 0.29,
      z = Math.cos(a) * 0.29;
    add(point, gold, [x, 0.25, z], [0.075, 0.2, 0.075]);
    add(sphere, material(0xfff1a8, 0.7, 0.3), [x, 0.36, z], [0.04, 0.04, 0.04]);
    add(
      sphere,
      material(i % 2 ? 0x3d8bff : 0xe8402c, 0.55, 0.25),
      [Math.sin(a) * 0.315, 0.08, Math.cos(a) * 0.315],
      [0.045, 0.045, 0.025],
      [0, a, 0],
    );
  }
  const crown = bake(g);
  crown.name = "WinnerCrown";
  band.dispose();
  point.dispose();
  crown.traverse((o) => {
    if (o.isMesh) o.material.side = T.DoubleSide;
  });
  return crown;
}

const CONFETTI = 96,
  SPARKLES = 24,
  COLORS = [0xffc63a, 0xff5a3c, 0x3d8bff, 0x5fe08a, 0xff8ad8, 0xffffff];
export function createWinnerFX(scene) {
  const crown = buildCrown();
  crown.visible = false;
  const confetti = new T.InstancedMesh(
    new T.PlaneGeometry(0.11, 0.06),
    new T.MeshBasicMaterial({ side: T.DoubleSide }),
    CONFETTI,
  );
  const sparkles = new T.InstancedMesh(
    new T.OctahedronGeometry(0.07, 0),
    new T.MeshBasicMaterial({
      color: 0xffe28a,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
    }),
    SPARKLES,
  );
  for (const m of [confetti, sparkles]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    m.visible = false;
    scene.add(m);
  }
  const color = new T.Color();
  for (let i = 0; i < CONFETTI; i++)
    confetti.setColorAt(i, color.set(COLORS[i % COLORS.length]));
  const pieces = Array.from({ length: CONFETTI }, () => ({
      p: new T.Vector3(),
      v: new T.Vector3(),
      spin: new T.Vector3(),
      rot: new T.Euler(),
      life: 0,
    })),
    dummy = new T.Object3D(),
    head = new T.Vector3();
  let time = -1,
    host = null,
    origin = new T.Vector3();
  const burst = (at, count, power) => {
    let n = 0;
    for (const c of pieces) {
      if (c.life > 0) continue;
      c.p.copy(at);
      const a = Math.random() * Math.PI * 2,
        r = 0.4 + Math.random() * 0.6;
      c.v.set(Math.cos(a) * r * power, 3.2 + Math.random() * 2.6, Math.sin(a) * r * power);
      c.spin.set(Math.random() * 9, Math.random() * 9, Math.random() * 9);
      c.life = 2.4 + Math.random() * 0.8;
      if (++n >= count) break;
    }
  };
  return {
    crown,
    get active() {
      return time >= 0;
    },
    // Attach the crown to the winner's head bone so it follows every animation.
    start(model) {
      this.reset();
      const bone = model.getObjectByName("Head");
      host = bone ?? model;
      crown.position.set(0, bone ? 0.82 : 2.55, -0.03);
      crown.rotation.set(-0.08, 0, 0.12);
      crown.scale.setScalar(0.001);
      crown.visible = true;
      host.add(crown);
      model.updateMatrixWorld(true);
      origin.copy(crown.getWorldPosition(head));
      time = 0;
      confetti.visible = sparkles.visible = true;
      burst(origin, 60, 2.2);
    },
    update(dt) {
      if (time < 0) return;
      const before = time;
      time += dt;
      // Crown pop: overshoot then settle, with a gentle idle bob.
      const k = T.MathUtils.clamp((time - 0.35) / 0.45, 0, 1),
        pop = k <= 0 ? 0.001 : 1 + Math.sin(k * Math.PI) * 0.35 * (1 - k * 0.4);
      crown.scale.setScalar(pop);
      crown.position.y = 0.82 + Math.sin(time * 3.2) * 0.025;
      if (before < 0.4 && time >= 0.4) {
        crown.getWorldPosition(origin);
        burst(origin, 36, 1.4);
      }
      if (crown.visible) crown.getWorldPosition(head);
      for (let i = 0; i < CONFETTI; i++) {
        const c = pieces[i];
        if (c.life > 0) {
          c.life -= dt;
          c.v.y -= 7 * dt;
          c.v.multiplyScalar(1 - 1.4 * dt);
          c.p.addScaledVector(c.v, dt);
          c.rot.x += c.spin.x * dt;
          c.rot.y += c.spin.y * dt;
          c.rot.z += c.spin.z * dt;
        }
        dummy.position.copy(c.p);
        dummy.rotation.copy(c.rot);
        dummy.scale.setScalar(c.life > 0 ? Math.min(1, c.life * 2) : 0);
        dummy.updateMatrix();
        confetti.setMatrixAt(i, dummy.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
      const fade = T.MathUtils.clamp(3.6 - time, 0, 1);
      for (let i = 0; i < SPARKLES; i++) {
        const a = (i / SPARKLES) * Math.PI * 2 + time * 1.6,
          r = 0.55 + Math.sin(time * 2 + i) * 0.15;
        dummy.position.set(
          head.x + Math.cos(a) * r,
          head.y + 0.15 + Math.sin(time * 4 + i * 1.7) * 0.35,
          head.z + Math.sin(a) * r,
        );
        dummy.rotation.set(0, time * 3 + i, 0);
        const tw = 0.5 + 0.5 * Math.sin(time * 9 + i * 2.3);
        dummy.scale.setScalar(time > 0.4 ? tw * fade : 0);
        dummy.updateMatrix();
        sparkles.setMatrixAt(i, dummy.matrix);
      }
      sparkles.instanceMatrix.needsUpdate = true;
      sparkles.material.opacity = fade;
    },
    reset() {
      time = -1;
      crown.removeFromParent();
      crown.visible = false;
      host = null;
      for (const c of pieces) c.life = 0;
      confetti.visible = sparkles.visible = false;
    },
  };
}
