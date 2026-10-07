import { Vector3 } from "three";
import {
  layout,
  LEVELS,
  TILE_PITCH,
  TILE_SIZE,
} from "../assets/runtime/layout.js";

// One deterministic state owner. Rendering/input never reset a tile's contact time.
export const RULES = {
  gravity: 22,
  floorSpacing: 7.6,
  jumpApex: 8.25,
  jumpSpeed: Math.sqrt(2 * 22 * 8.25),
  speed: 5.6,
  collapse: 3,
  lockSeconds: 2,
  killY: -0.5,
  step: 1 / 120,
  rocketSpeed: 24,
  rocketTurn: 3.4,
  rocketTerminalTurn: 9,
  rocketTerminalRange: 2.2,
  rocketTtl: 5,
  tileTop: 0.15,
  tileBottom: -0.5,
};
const slabTop = (level) => LEVELS[level] + RULES.tileTop,
  slabBottom = (level) => LEVELS[level] + RULES.tileBottom;
export class Match {
  constructor({
    world = "volcano",
    difficulty = "easy",
    count = 2,
    random = Math.random,
    bots = true,
  } = {}) {
    this.random = random;
    this.bots = bots;
    this.world = world;
    this.difficulty = difficulty;
    this.data = layout(world, count, difficulty);
    this.time = 0;
    this.phase = "preview";
    this.countdown = 3;
    this.events = [];
    this.projectiles = [];
    this.nextProjectile = 0;
    this.tiles = this.data.tiles.map((t) => ({
      ...t,
      state: t.startsPresent ? "stable" : "gone",
      gone: !t.startsPresent,
      activatedAt: null,
      expires: Infinity,
    }));
    this.tileIndex = new Map(
      this.tiles.map((t) => [`${t.level}/${t.gx}/${t.gz}`, t]),
    );
    this.players = Array.from({ length: count }, (_, i) => {
      const s = this.data.spawnPoints[i];
      return {
        id: i,
        name: i === 0 ? "YOU" : `Pizzaiolo ${i + 1}`,
        position: new Vector3(s.x, s.y, s.z),
        velocity: new Vector3(),
        grounded: false,
        support: null,
        alive: true,
        removed: false,
        eliminatedAt: null,
        launcher: null,
        ammo: 0,
        level: 0,
        rotation: Math.PI,
        animation: "idle",
        hitUntil: 0,
        diveUntil: -1,
        botAt: 0,
        input: { x: 0, z: 0 },
        lock: { holding: false, target: null, seconds: 0, locked: false },
      };
    });
    this.hammers = this.tiles
      .filter((t) => t.hammer && !t.gone)
      .map((tile, i) => ({
        tile,
        angle: i * 1.73,
        omega:
          (i % 2 ? -1 : 1) *
          (difficulty === "hard" ? 1.55 : 1.1) *
          (1 + (i % 3) * 0.09),
        radius: 2.45,
      }));
    this.launchers = Array.from({ length: count }, (_, i) => ({
      id: i,
      state: "waiting",
      owner: null,
      tile: null,
      position: new Vector3(),
      vy: 0,
    }));
    this.launchers.forEach((l) => this.respawnLauncher(l));
  }
  emit(type, data = {}) {
    this.events.push({ type, time: this.time, ...data });
    if (this.events.length > 100) this.events.shift();
  }
  start() {
    this.phase = "countdown";
    this.countdown = 3;
    for (const p of this.players) {
      const s = this.data.spawnPoints[p.id];
      p.position.set(s.x, s.y, s.z);
      p.grounded = false;
      p.velocity.set(0, 0, 0);
      p.animation = "fall";
    }
  }
  activate(tile) {
    if (!tile || tile.gone || tile.activatedAt !== null) return;
    tile.state = "activated";
    tile.activatedAt = this.time;
    tile.expires = this.time + RULES.collapse;
    this.emit("tile-activated", { tile: tile.id });
  }
  destroy(tile) {
    if (!tile || tile.gone) return;
    tile.gone = true;
    tile.state = "gone";
    tile.expires = this.time;
    this.emit("tile-destroyed", { tile: tile.id });
  }
  tileAt(level, x, z) {
    return this.tileIndex.get(
      `${level}/${Math.round(x / TILE_PITCH)}/${Math.round(z / TILE_PITCH)}`,
    );
  }
  footing(p) {
    if (p.support && !p.support.gone) return p.support;
    for (let i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i] + 0.16 > p.position.y + 0.25) continue;
      const t = this.tileAt(i, p.position.x, p.position.z);
      if (t && !t.gone) return t;
    }
    return null;
  }
  levelAt(y) {
    for (let i = 0; i < LEVELS.length; i++) if (y >= LEVELS[i] - 0.45) return i;
    return LEVELS.length - 1;
  }
  input(id, input) {
    const p = this.players[id];
    if (p) p.input = { ...p.input, ...input };
  }
  jump(id) {
    const p = this.players[id];
    if (this.phase !== "active" || !p?.alive || !p.grounded) return false;
    p.velocity.y = RULES.jumpSpeed;
    p.grounded = false;
    p.support = null;
    p.animation = "jump";
    return true;
  }
  dive(id) {
    const p = this.players[id];
    if (this.phase !== "active" || !p?.alive || this.time < p.diveUntil + 0.65)
      return false;
    p.grounded = false;
    p.support = null;
    p.diveUntil = this.time + 0.35;
    const d = new Vector3(
      p.input.x || Math.sin(p.rotation),
      0,
      p.input.z || Math.cos(p.rotation),
    ).normalize();
    p.velocity.addScaledVector(d, 7);
    p.velocity.y = Math.min(p.velocity.y, -7);
    p.animation = "dive";
    return true;
  }
  holdFire(id) {
    const p = this.players[id];
    if (this.phase !== "active" || !p?.alive || p.launcher === null)
      return false;
    p.lock = { holding: true, target: null, seconds: 0, locked: false };
    return true;
  }
  updateLock(p, candidate, dt) {
    const lock = p.lock;
    if (!lock.holding) return;
    const target = this.players[candidate];
    if (!target?.alive || candidate === p.id) {
      lock.target = null;
      lock.seconds = 0;
      lock.locked = false;
      return;
    }
    if (lock.target !== candidate) {
      lock.target = candidate;
      lock.seconds = 0;
      lock.locked = false;
    }
    lock.seconds = Math.min(RULES.lockSeconds, lock.seconds + dt);
    if (lock.seconds >= RULES.lockSeconds && !lock.locked) {
      lock.locked = true;
      this.emit("locked", { player: p.id, target: candidate });
    }
  }
  muzzle(p, direction) {
    const flat = new Vector3(direction?.x ?? 0, 0, direction?.z ?? 0);
    if (flat.lengthSq() < 1e-4)
      flat.set(Math.sin(p.rotation), 0, Math.cos(p.rotation));
    return p.position
      .clone()
      .add(new Vector3(0, 1.05, 0))
      .addScaledVector(flat.normalize(), 0.45);
  }
  // Homing aim point: the target's feet, then a terminal dive into its supporting tiles.
  rocketAim(r, target) {
    const foot = this.footing(target);
    // Rising shot: steer into the underside directly beneath the target's feet.
    if (foot && r.position.y < slabBottom(foot.level))
      return new Vector3(
        target.position.x,
        slabBottom(foot.level) + 0.3,
        target.position.z,
      );
    const feet = target.position.clone().add(new Vector3(0, 0.35, 0));
    const flat = Math.hypot(feet.x - r.position.x, feet.z - r.position.z);
    if (r.terminal || flat < RULES.rocketTerminalRange) {
      r.terminal = true;
      return new Vector3(
        target.position.x,
        (foot ? foot.y : target.position.y) - 1.5,
        target.position.z,
      );
    }
    return feet;
  }
  releaseFire(id, aim = null) {
    const p = this.players[id];
    if (!p) return false;
    const lock = p.lock,
      target = this.players[lock.target];
    const fire =
      lock.holding &&
      lock.locked &&
      target?.alive &&
      p.alive &&
      p.launcher !== null &&
      p.ammo > 0;
    p.lock = { holding: false, target: null, seconds: 0, locked: false };
    if (!fire) {
      if (lock.holding) this.emit("fire-cancelled", { player: id });
      return false;
    }
    // Launch along the camera aim when supplied, otherwise straight at the target.
    const toTarget = target.position
      .clone()
      .add(new Vector3(0, 0.6, 0))
      .sub(p.position.clone().add(new Vector3(0, 1.05, 0)))
      .normalize();
    const direction = aim?.direction
      ? new Vector3().copy(aim.direction).normalize()
      : toTarget;
    if (direction.dot(toTarget) < 0) direction.copy(toTarget);
    this.projectiles.push({
      id: this.nextProjectile++,
      owner: p.id,
      target: target.id,
      position: this.muzzle(p, direction),
      velocity: direction.multiplyScalar(RULES.rocketSpeed),
      terminal: false,
      ttl: RULES.rocketTtl,
    });
    p.ammo--;
    this.emit("fired", { player: id, target: target.id });
    if (p.ammo === 0) {
      const l = this.launchers[p.launcher];
      p.launcher = null;
      this.respawnLauncher(l);
    }
    return true;
  }
  cancelFire(id) {
    const p = this.players[id];
    if (p) p.lock = { holding: false, target: null, seconds: 0, locked: false };
  }
  equip(p, l) {
    if (
      !p.alive ||
      p.launcher !== null ||
      !["resting", "falling"].includes(l.state)
    )
      return false;
    l.state = "equipped";
    l.owner = p.id;
    l.tile = null;
    p.launcher = l.id;
    p.ammo = 2;
    this.emit("equipped", { player: p.id, launcher: l.id });
    return true;
  }
  respawnLauncher(l) {
    const occupied = new Set(
      this.launchers
        ?.filter((x) => x !== l && x.state === "resting")
        .map((x) => x.tile?.id),
    );
    const all = this.tiles.filter((t) => !t.gone),
      candidates = all.filter((t) => !t.hammer && !occupied.has(t.id));
    const valid = candidates.length ? candidates : all;
    l.owner = null;
    l.vy = 0;
    if (!valid.length) {
      l.state = "waiting";
      l.tile = null;
      return;
    }
    const t = valid[Math.floor(this.random() * valid.length)];
    l.tile = t;
    l.position.set(t.x, t.y + 0.15, t.z);
    l.state = "resting";
    this.emit("launcher-respawned", { launcher: l.id, tile: t.id });
  }
  destroyFootprint(target) {
    const foot = this.footing(target);
    const level = foot?.level ?? this.levelAt(target.position.y);
    return this.destroyAt(level, target.position.x, target.position.z, {
      target: target.id,
    });
  }
  // Compact 2x2 containing the impact cell, extended toward the impact quadrant.
  // Missing/out-of-grid cells are skipped, never replaced by tiles further away.
  destroyAt(level, x, z, meta = {}) {
    const half = this.data.half;
    const axis = (v) => {
      const c = Math.max(-half, Math.min(half, Math.round(v / TILE_PITCH)));
      let n = c + (v - c * TILE_PITCH >= 0 ? 1 : -1);
      if (Math.abs(n) > half) n = 2 * c - n;
      return [c, n];
    };
    const destroyed = [];
    for (const gx of axis(x))
      for (const gz of axis(z)) {
        const t = this.tileIndex.get(`${level}/${gx}/${gz}`);
        if (t && !t.gone) {
          this.destroy(t);
          destroyed.push(t.id);
        }
      }
    this.emit("rocket-impact", {
      ...meta,
      level,
      tiles: destroyed,
      position: [x, slabTop(level), z],
    });
    return destroyed;
  }
  // First intact floor slab crossed by segment a→b (tops when descending, undersides when rising).
  segmentHit(a, b) {
    let best = null;
    for (let level = 0; level < LEVELS.length; level++) {
      const plane =
        b.y < a.y ? slabTop(level) : b.y > a.y ? slabBottom(level) : null;
      if (plane === null) continue;
      if ((a.y - plane) * (b.y - plane) > 0 || a.y === plane) continue;
      const u = (plane - a.y) / (b.y - a.y);
      if (best && u >= best.u) continue;
      const x = a.x + (b.x - a.x) * u,
        z = a.z + (b.z - a.z) * u,
        t = this.tileAt(level, x, z);
      if (!t || t.gone) continue;
      if (
        Math.abs(x - t.x) > TILE_PITCH / 2 ||
        Math.abs(z - t.z) > TILE_PITCH / 2
      )
        continue;
      best = { u, level, tile: t, point: new Vector3(x, plane, z) };
    }
    return best;
  }
  lineOfSight(a, b) {
    return !this.segmentHit(a, b);
  }
  rocketStep(r, dt) {
    const target = this.players[r.target];
    const speed = r.velocity.length() || RULES.rocketSpeed;
    if (target?.alive) {
      const desired = this.rocketAim(r, target).sub(r.position).normalize();
      const current = r.velocity.clone().normalize();
      const angle = current.angleTo(desired);
      const maxTurn =
        (r.terminal ? RULES.rocketTerminalTurn : RULES.rocketTurn) * dt;
      if (angle > 1e-5) {
        // Smooth steering: rotate the heading by at most maxTurn toward the aim point.
        const k = Math.min(1, maxTurn / angle);
        current.lerp(desired, k).normalize();
      }
      r.velocity.copy(current).multiplyScalar(speed);
    }
    const from = r.position.clone();
    r.position.addScaledVector(r.velocity, dt);
    const hit = this.segmentHit(from, r.position);
    if (hit) {
      r.position.copy(hit.point);
      r.ttl = 0;
      // Reaching the target's own floor beside it terminates on its supporting tiles;
      // any other intact floor is an obstruction and breaks where it was struck.
      const foot = target?.alive ? this.footing(target) : null;
      const atTarget =
        foot?.level === hit.level &&
        Math.hypot(
          hit.point.x - target.position.x,
          hit.point.z - target.position.z,
        ) <
          TILE_PITCH * 1.5;
      const at = atTarget ? target.position : hit.point;
      this.destroyAt(hit.level, at.x, at.z, {
        target: r.target,
        owner: r.owner,
        rocket: r.id,
        obstruction: !atTarget,
      });
      return;
    }
    const bound = (this.data.half + 0.5) * TILE_PITCH + 9;
    if (
      r.position.y < RULES.killY ||
      Math.abs(r.position.x) > bound ||
      Math.abs(r.position.z) > bound
    ) {
      r.ttl = 0;
      this.emit("rocket-expired", {
        rocket: r.id,
        position: r.position.toArray(),
      });
    }
  }
  eliminate(p) {
    if (!p.alive) return;
    p.alive = false;
    p.eliminatedAt = this.time;
    p.grounded = false;
    p.support = null;
    p.velocity.set(0, 0, 0);
    this.cancelFire(p.id);
    if (p.launcher !== null) {
      this.respawnLauncher(this.launchers[p.launcher]);
      p.launcher = null;
      p.ammo = 0;
    }
    this.emit("eliminated", { player: p.id });
  }
  movePlayer(p, dt) {
    if (!p.alive) {
      p.removed = this.time - p.eliminatedAt >= 0.75;
      return;
    }
    const wasGrounded = p.grounded,
      oldY = p.position.y;
    const desired = new Vector3(p.input.x, 0, p.input.z);
    if (desired.length() > 1) desired.normalize();
    const accel = p.grounded ? 38 : this.time < p.hitUntil ? 6 : 15;
    const factor = 1 - Math.exp((-accel / RULES.speed) * dt);
    p.velocity.x += (desired.x * RULES.speed - p.velocity.x) * factor;
    p.velocity.z += (desired.z * RULES.speed - p.velocity.z) * factor;
    if (desired.lengthSq() > 0.01 && !p.lock.holding)
      p.rotation = Math.atan2(desired.x, desired.z);
    p.velocity.y -= RULES.gravity * dt;
    p.position.addScaledVector(p.velocity, dt);
    p.grounded = false;
    p.support = null;
    // One-way square platform contacts permit jumping back through a floor from below.
    if (p.velocity.y <= 0)
      for (let level = 0; level < LEVELS.length; level++) {
        const top = LEVELS[level] + 0.15;
        if (oldY < top - 0.025 || p.position.y > top) continue;
        const t = this.tileAt(level, p.position.x, p.position.z);
        if (
          !t ||
          t.gone ||
          Math.abs(p.position.x - t.x) > TILE_SIZE / 2 + 0.12 ||
          Math.abs(p.position.z - t.z) > TILE_SIZE / 2 + 0.12
        )
          continue;
        p.position.y = top;
        p.velocity.y = 0;
        p.grounded = true;
        p.support = t;
        this.activate(t);
        if (t.variant === "burst" && this.difficulty === "hard") {
          p.velocity.y = RULES.jumpSpeed * 1.26;
          p.grounded = false;
          p.support = null;
          this.emit("burst", { player: p.id });
        } else if (!wasGrounded) {
          p.landUntil = this.time + 0.17;
          this.emit("landed", { player: p.id, tile: t.id });
        }
        break;
      }
    p.level = this.levelAt(p.position.y);
    if (this.time < p.hitUntil) p.animation = "hit";
    else if (this.time < p.diveUntil) p.animation = "dive";
    else if (p.grounded)
      p.animation =
        this.time < (p.landUntil || 0)
          ? "landing"
          : desired.lengthSq() > 0.02
            ? "run"
            : "idle";
    else p.animation = p.velocity.y > 0 ? "jump" : "fall";
    if (p.position.y <= RULES.killY) this.eliminate(p);
  }
  hammerStep(h, dt) {
    const old = h.angle;
    h.angle += h.omega * dt;
    if (h.tile.gone) return;
    const a = new Vector3(
        h.tile.x + Math.cos(old) * h.radius,
        h.tile.y + 0.95,
        h.tile.z - Math.sin(old) * h.radius,
      ),
      b = new Vector3(
        h.tile.x + Math.cos(h.angle) * h.radius,
        h.tile.y + 0.95,
        h.tile.z - Math.sin(h.angle) * h.radius,
      ),
      segment = b.clone().sub(a);
    for (const p of this.players) {
      if (
        !p.alive ||
        this.time < (p.hammerCooldown || 0) ||
        Math.abs(p.position.y + 0.75 - b.y) > 0.95
      )
        continue;
      const q = p.position.clone().add(new Vector3(0, 0.75, 0));
      const u = Math.max(
        0,
        Math.min(1, q.clone().sub(a).dot(segment) / (segment.lengthSq() || 1)),
      );
      const hit = a.clone().addScaledVector(segment, u);
      const normal = q.clone().sub(hit);
      normal.y = 0;
      if (normal.length() > 0.95) continue;
      const contactVelocity = new Vector3(
        -Math.sin(h.angle) * h.radius * h.omega,
        0,
        -Math.cos(h.angle) * h.radius * h.omega,
      );
      if (normal.lengthSq() < 0.01) normal.copy(contactVelocity);
      normal.normalize();
      const approach = contactVelocity.clone().sub(p.velocity).dot(normal);
      const impulse = Math.max(0, approach) * 1.65 + Math.abs(h.omega) * 2.2;
      p.velocity.addScaledVector(normal, impulse);
      p.velocity.addScaledVector(contactVelocity, 0.8);
      p.velocity.y = Math.max(p.velocity.y, 2.2);
      p.grounded = false;
      p.support = null;
      p.hitUntil = this.time + 0.45;
      p.hammerCooldown = this.time + 0.5;
      this.emit("hammer-hit", { player: p.id, impulse: p.velocity.toArray() });
    }
  }
  botStep(p) {
    if (!this.bots || !p.alive) return;
    if (this.time >= p.botAt) {
      const nearby = this.tiles.filter(
        (t) =>
          !t.gone &&
          t.level === p.level &&
          Math.abs(t.x - p.position.x) < 5 &&
          Math.abs(t.z - p.position.z) < 5 &&
          t.expires > this.time + 1,
      );
      const t = nearby[Math.floor(this.random() * nearby.length)];
      p.botTarget = t;
      p.botAt = this.time + 0.55;
    }
    if (p.botTarget) {
      const d = new Vector3(
        p.botTarget.x - p.position.x,
        0,
        p.botTarget.z - p.position.z,
      );
      if (d.length() > 0.3) d.normalize();
      else d.set(0, 0, 0);
      p.input = { x: d.x, z: d.z };
    }
    if (p.grounded && p.support?.expires < this.time + 1.3) this.jump(p.id);
  }
  step(dt, input = {}) {
    this.time += dt;
    if (this.phase === "countdown") {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = "active";
        this.emit("drop");
      } else return;
    }
    if (this.phase !== "active") return;
    this.countdown -= dt;
    for (const t of this.tiles)
      if (!t.gone && this.time >= t.expires) this.destroy(t);
    for (const p of this.players) {
      if (p.id === 0) this.input(0, input);
      else this.botStep(p);
      this.movePlayer(p, dt);
      this.updateLock(p, p.input.target, dt);
    }
    for (const h of this.hammers) this.hammerStep(h, dt);
    for (const l of this.launchers) {
      if (l.state === "equipped") continue;
      if (l.state === "waiting") {
        this.respawnLauncher(l);
        continue;
      }
      if (l.state === "resting" && l.tile?.gone) {
        l.state = "falling";
        l.tile = null;
        l.vy = 0;
      }
      if (l.state === "falling") {
        const y = l.position.y;
        l.vy -= RULES.gravity * dt;
        l.position.y += l.vy * dt;
        for (let level = 0; level < LEVELS.length; level++) {
          const t = this.tileAt(level, l.position.x, l.position.z);
          if (t && !t.gone && y >= t.y + 0.15 && l.position.y <= t.y + 0.15) {
            l.position.y = t.y + 0.15;
            l.state = "resting";
            l.tile = t;
            l.vy = 0;
            break;
          }
        }
        if (l.position.y < RULES.killY) {
          this.respawnLauncher(l);
          continue;
        }
      }
      for (const p of this.players) {
        if (
          p.alive &&
          p.launcher === null &&
          p.position.distanceTo(l.position) < 0.9
        ) {
          this.equip(p, l);
          break;
        }
      }
    }
    for (const r of this.projectiles) {
      r.ttl -= dt;
      if (r.ttl > 0) this.rocketStep(r, dt);
    }
    this.projectiles = this.projectiles.filter((r) => r.ttl > 0);
  }
}
