import * as T from "three";
import { material } from "../assets/runtime/palette.js";

// Fixed pools: rockets, smoke-trail puffs and impact flashes. No per-shot allocation.
const ROCKETS = 8,
  PUFFS = 120,
  FLASHES = 4;
export function createRocketFX(scene) {
  const rocketGeometry = new T.CylinderGeometry(0.09, 0.11, 0.62, 10).rotateX(
      Math.PI / 2,
    ),
    noseGeometry = new T.ConeGeometry(0.09, 0.22, 10)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.42),
    finGeometry = new T.BoxGeometry(0.34, 0.025, 0.14).translate(0, 0, -0.24),
    flameGeometry = new T.ConeGeometry(0.11, 0.55, 8)
      .rotateX(-Math.PI / 2)
      .translate(0, 0, -0.55);
  const flameMaterial = new T.MeshBasicMaterial({
    color: 0xffb13a,
    transparent: true,
    opacity: 0.9,
    blending: T.AdditiveBlending,
    depthWrite: false,
  });
  const rockets = [];
  for (let i = 0; i < ROCKETS; i++) {
    const g = new T.Group();
    g.add(new T.Mesh(rocketGeometry, material(0xf4efe4, 0.15, 0.45)));
    g.add(new T.Mesh(noseGeometry, material(0xe8402c, 0.3, 0.45)));
    const fin = new T.Mesh(finGeometry, material(0xe8402c, 0.2));
    g.add(fin, fin.clone().rotateZ(Math.PI / 2));
    g.add(new T.Mesh(flameGeometry, flameMaterial));
    g.visible = false;
    scene.add(g);
    rockets.push(g);
  }
  const puffMaterial = new T.MeshBasicMaterial({
    color: 0xd8d2cc,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const puffs = new T.InstancedMesh(
    new T.IcosahedronGeometry(0.16, 0),
    puffMaterial,
    PUFFS,
  );
  puffs.frustumCulled = false;
  puffs.instanceMatrix.setUsage(T.DynamicDrawUsage);
  scene.add(puffs);
  const puffState = Array.from({ length: PUFFS }, () => ({
      position: new T.Vector3(),
      age: 1,
    })),
    dummy = new T.Object3D();
  let nextPuff = 0;
  const flashGeometry = new T.SphereGeometry(1, 16, 10),
    flashes = Array.from({ length: FLASHES }, () => {
      const m = new T.Mesh(
        flashGeometry,
        new T.MeshBasicMaterial({
          color: 0xffc35a,
          transparent: true,
          blending: T.AdditiveBlending,
          depthWrite: false,
        }),
      );
      m.visible = false;
      m.userData.age = 1;
      scene.add(m);
      return m;
    });
  let nextFlash = 0,
    lastEvent = -1,
    emitClock = 0;
  const ahead = new T.Vector3();
  return {
    reset() {
      rockets.forEach((r) => (r.visible = false));
      flashes.forEach((f) => (f.visible = false));
      puffState.forEach((p) => (p.age = 1));
      lastEvent = -1;
    },
    update(match, dt) {
      emitClock += dt;
      const emit = emitClock > 0.018;
      if (emit) emitClock = 0;
      rockets.forEach((r, i) => {
        const sim = match?.projectiles[i];
        r.visible = !!sim;
        if (!sim) return;
        r.position.copy(sim.position);
        r.lookAt(ahead.copy(sim.position).add(sim.velocity));
        r.children[4].scale.setScalar(0.85 + Math.random() * 0.35);
        if (emit) {
          puffState[nextPuff].position.copy(sim.position);
          puffState[nextPuff].age = 0;
          nextPuff = (nextPuff + 1) % PUFFS;
        }
      });
      for (let i = 0; i < PUFFS; i++) {
        const p = puffState[i];
        p.age = Math.min(1, p.age + dt / 0.7);
        dummy.position.copy(p.position);
        dummy.position.y += p.age * 0.4;
        dummy.scale.setScalar(p.age >= 1 ? 0 : 0.6 + p.age * 1.8);
        dummy.updateMatrix();
        puffs.setMatrixAt(i, dummy.matrix);
      }
      puffs.instanceMatrix.needsUpdate = true;
      for (const e of match?.events ?? [])
        if (e.seq > lastEvent && e.type === "rocket-impact") {
          const f = flashes[nextFlash];
          nextFlash = (nextFlash + 1) % FLASHES;
          f.position.fromArray(e.position);
          f.userData.age = 0;
          f.visible = true;
        }
      if (match) lastEvent = match.events.at(-1)?.seq ?? lastEvent;
      for (const f of flashes) {
        if (!f.visible) continue;
        f.userData.age += dt / 0.45;
        f.scale.setScalar(0.4 + f.userData.age * 3.2);
        f.material.opacity = Math.max(0, 1 - f.userData.age);
        if (f.userData.age >= 1) f.visible = false;
      }
    },
  };
}
