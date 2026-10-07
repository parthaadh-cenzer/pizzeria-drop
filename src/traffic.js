// Reuses ten rendered cars. Only one enters the cheap ballistic gag at a time.
export function createTraffic(cars, random = Math.random) {
  let next = 25 + random() * 20,
    clock = 0;
  cars.forEach(
    (c, i) =>
      (c.userData.traffic = { u: i / cars.length, falling: false, vy: 0 }),
  );
  return {
    update(dt) {
      clock += dt;
      if (clock > next && !cars.some((c) => c.userData.traffic.falling)) {
        const c = cars.reduce((a, b) =>
          Math.abs(a.position.x - 12) + Math.abs(a.position.z + 23) <
          Math.abs(b.position.x - 12) + Math.abs(b.position.z + 23)
            ? a
            : b,
        );
        c.userData.traffic.falling = true;
        c.userData.traffic.vy = 1;
        c.position.set(12, 24.65, -19.2);
        next = clock + 30 + random() * 25;
      }
      for (const c of cars) {
        const s = c.userData.traffic;
        if (s.falling) {
          s.vy -= 12 * dt;
          c.position.y += s.vy * dt;
          c.position.z += dt * 1.2;
          c.rotation.x += dt * 0.75;
          c.rotation.z += dt * 0.3;
          if (c.position.y < -31) {
            s.falling = false;
            c.rotation.set(0, 0, 0);
          }
          continue;
        }
        s.u = (s.u + dt * 0.01) % 1;
        const f = s.u * 4,
          i = Math.floor(f),
          u = f - i;
        c.position.y = 24.65;
        if (i === 0) {
          c.position.x = -23 + 46 * u;
          c.position.z = -24;
          c.rotation.y = 0;
        }
        if (i === 1) {
          c.position.x = 24;
          c.position.z = -23 + 46 * u;
          c.rotation.y = -Math.PI / 2;
        }
        if (i === 2) {
          c.position.x = 23 - 46 * u;
          c.position.z = 24;
          c.rotation.y = Math.PI;
        }
        if (i === 3) {
          c.position.x = -24;
          c.position.z = 23 - 46 * u;
          c.rotation.y = Math.PI / 2;
        }
      }
    },
    get nextGag() {
      return next;
    },
  };
}
