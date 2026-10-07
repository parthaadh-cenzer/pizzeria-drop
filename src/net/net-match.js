import { Vector3 } from "three";
import { Match, RULES } from "../gameplay.js";
import { INPUT_HZ, LAUNCHER_STATES, decodePlayer } from "./protocol.js";

const INTERP_DELAY = 0.1; // render remote players ~2 snapshots behind
const MAX_EXTRAPOLATE = 0.15;
const ID_KEYS = ["player", "target", "owner", "winner"];

// Client mirror of the server Match. Same API as the local Match so the renderer/HUD are shared.
// Authority stays on the server: tiles, pickups, rockets, eliminations and the winner arrive
// as snapshots/events. The local player is predicted and smoothly reconciled.
export class NetMatch extends Match {
  constructor(start, connection) {
    const c = start.config;
    // Local seat is swapped to index 0 so renderer/HUD code can keep treating players[0] as "me".
    const you = start.you;
    const swap = (i) => (i === you ? 0 : i === 0 ? you : i);
    const order = c.players.map((_, i) => c.players[swap(i)]);
    super({
      world: c.world,
      difficulty: c.difficulty,
      count: c.count,
      floors: c.floors,
      names: order.map((p) => p.name),
      botIds: order.map((p, i) => (p.bot ? i : -1)).filter((i) => i >= 0),
      lives: c.lives,
      seed: c.seed,
      bots: false,
    });
    this.net = connection;
    this.config = c;
    this.you = you;
    this.swap = swap;
    this.characters = order.map((p) => p.character);
    this.players.forEach((p, i) => (p.bot = order[i].bot));
    this.phase = start.phase;
    this.snapshots = [];
    this.offset = null; // local seconds - server match seconds (min-latency estimate)
    this.seq = 0;
    this.sendClock = 0;
    this.sent = new Map(); // input seq -> local send time
    this.trail = []; // predicted local positions per fixed step: { t, pos }
    this.serverSeqs = new Set();
    this.lastAck = 0;
    this.correction = new Vector3();
    // Prediction starts only after an authoritative landing (initial drop, respawn).
    this.predicting = false;
    this.netStats = { snapshots: 0, corrections: 0, snaps: 0 };
    for (const l of this.launchers) l.state = "waiting";
    this.applyTiles(start.tiles);
    if (start.result) this.applyResult(start.result);
    this.time = start.time;
    this.onSnap = (e) => this.receive(e.detail);
    connection.addEventListener("snap", this.onSnap);
  }
  dispose() {
    this.net.removeEventListener("snap", this.onSnap);
  }
  // ---------- authority hooks disabled on the client ----------
  activate() {}
  eliminate() {}
  loseLife() {}
  equip() {
    return false;
  }
  respawnLauncher(l) {
    if (l) l.state = "waiting";
  }
  resolve() {
    return false;
  }
  // ---------- helpers ----------
  mapIds(obj) {
    const out = { ...obj };
    for (const k of ID_KEYS) if (Number.isInteger(out[k])) out[k] = this.swap(out[k]);
    if (Array.isArray(out.placements)) out.placements = out.placements.map(this.swap);
    return out;
  }
  applyTiles(rows = []) {
    for (const [id, activatedAt, gone] of rows) {
      const t = this.tiles.find((x) => x.id === id);
      if (!t) continue;
      if (activatedAt >= 0) {
        t.activatedAt = activatedAt;
        t.expires = activatedAt + RULES.collapse;
        t.state = "activated";
      }
      if (gone) this.destroy(t, true);
    }
  }
  destroy(tile, silent = false) {
    if (!tile || tile.gone) return;
    tile.gone = true;
    tile.state = "gone";
    if (!silent) this.emit("tile-destroyed", { tile: tile.id });
  }
  applyResult(result) {
    const r = this.mapIds(result);
    r.names = r.placements.map((id) => this.players[id].name);
    this.result = r;
    this.winner = r.winner;
    this.phase = "won";
  }
  serverNow() {
    return this.offset === null ? this.time : performance.now() / 1000 - this.offset;
  }
  // ---------- inbound ----------
  receive(s) {
    const now = performance.now() / 1000;
    const offset = now - s.time;
    // Minimum observed offset ≈ fastest delivery; relax slowly to follow clock drift.
    this.offset = this.offset === null ? offset : Math.min(offset, this.offset + 0.002);
    this.netStats.snapshots++;
    const rows = new Map();
    for (const raw of s.players) {
      const d = decodePlayer(raw);
      d.id = this.swap(d.id);
      d.target = d.target === null ? null : this.swap(d.target);
      rows.set(d.id, d);
    }
    this.snapshots.push({ time: s.time, rows });
    while (this.snapshots.length > 30) this.snapshots.shift();
    // Events: apply authoritative tile/state changes once, then expose them to HUD/FX.
    for (const raw of s.events) {
      if (this.serverSeqs.has(raw.seq)) continue;
      this.serverSeqs.add(raw.seq);
      const e = this.mapIds(raw);
      if (e.type === "tile-activated") {
        const t = this.tiles.find((x) => x.id === e.tile);
        if (t && t.activatedAt === null) {
          t.activatedAt = e.time;
          t.expires = e.time + RULES.collapse;
          t.state = "activated";
        }
      } else if (e.type === "tile-destroyed") {
        this.destroy(this.tiles.find((x) => x.id === e.tile), true);
      }
      const { seq, ...rest } = e;
      this.eventSeq = (this.eventSeq ?? 0) + 1;
      this.events.push({ ...rest, seq: this.eventSeq, serverSeq: seq });
      if (this.events.length > 100) this.events.shift();
    }
    if (this.serverSeqs.size > 4000) this.serverSeqs = new Set([...this.serverSeqs].slice(-1000));
    this.phase = s.phase === "won" && !s.result ? this.phase : s.phase;
    this.countdown = s.countdown;
    if (s.result && !this.result) this.applyResult(s.result);
    s.hammers.forEach((a, i) => this.hammers[i] && (this.hammers[i].angle = a));
    for (const [id, state, x, y, z, owner] of s.launchers) {
      const l = this.launchers[id];
      if (!l) continue;
      l.state = LAUNCHER_STATES[state] ?? "waiting";
      l.position.set(x, y, z);
      l.owner = owner < 0 ? null : this.swap(owner);
    }
    const seen = new Set();
    for (const [id, owner, x, y, z, vx, vy, vz] of s.rockets) {
      seen.add(id);
      let r = this.projectiles.find((p) => p.id === id);
      if (!r) {
        r = { id, owner: this.swap(owner), target: null, position: new Vector3(), velocity: new Vector3(), ttl: 5 };
        this.projectiles.push(r);
      }
      r.position.set(x, y, z);
      r.velocity.set(vx, vy, vz);
    }
    this.projectiles = this.projectiles.filter((r) => seen.has(r.id));
    // Server-owned state for every player (positions for remotes come from interpolation).
    for (const [id, d] of rows) {
      const p = this.players[id];
      if (!p) continue;
      p.alive = d.alive;
      p.removed = d.removed;
      p.respawning = d.respawning;
      p.ammo = d.ammo;
      p.launcher = d.launcher;
      p.livesLeft = d.livesLeft;
      p.eliminatedAt = d.eliminatedAt;
      if (id !== 0) {
        p.animation = d.animation;
        p.lock.holding = d.holding;
        p.lock.locked = d.locked;
      }
    }
    this.reconcile(rows.get(0), s.ack, s.ackAge ?? 0);
  }
  // Local prediction vs. server: compare against our own predicted position at the acked input.
  reconcile(server, ack, ackAge) {
    const p = this.players[0];
    if (!server || !p) return;
    const serverPos = new Vector3(server.x, server.y, server.z);
    if (!this.predicting) {
      // Drop-in, respawn and non-active phases: render the local player from server state
      // (interpolated like remotes) until the server confirms a landing.
      p.grounded = server.grounded;
      p.animation = server.animation;
      p.velocity.set(server.vx, server.vy, server.vz);
      if (this.phase === "active" && p.alive && !server.respawning && server.grounded) {
        p.position.copy(serverPos);
        p.rotation = server.rot;
        this.predicting = true;
        this.trail.length = 0;
        this.sent.clear();
        this.correction.set(0, 0, 0);
      }
      return;
    }
    if (this.phase !== "active" || !p.alive || server.respawning) {
      this.predicting = false;
      return;
    }
    const sentAt = this.sent.get(ack);
    if (sentAt === undefined) return;
    for (const k of this.sent.keys()) if (k < ack) this.sent.delete(k);
    this.lastAck = ack;
    // The server has simulated ackAge seconds since applying our acked input; compare with our
    // own prediction at the same point (send time + ackAge), not with "now".
    const at = sentAt + ackAge;
    let past = null;
    for (const h of this.trail) {
      if (h.t > at) break;
      past = h.pos;
    }
    if (!past) return;
    const error = serverPos.clone().sub(past);
    error.y = Math.abs(error.y) < 0.6 && server.grounded === p.grounded ? 0 : error.y;
    if (error.length() > 2.5) {
      // Large divergence (hammer hit, rocket hole): adopt the server state and restart history.
      p.position.copy(serverPos);
      p.velocity.set(server.vx, server.vy, server.vz);
      this.trail.length = 0;
      this.sent.clear();
      this.correction.set(0, 0, 0);
      this.netStats.snaps++;
      (this.netStats.log ??= []).push({ t: +this.time.toFixed(2), err: error.toArray().map((v) => +v.toFixed(2)), phase: this.phase });
      if (this.netStats.log.length > 50) this.netStats.log.shift();
    } else if (error.length() > 0.12) {
      this.correction.add(error);
      this.netStats.corrections++;
    }
  }
  // ---------- per fixed step ----------
  step(dt, input = {}) {
    this.time = this.serverNow();
    const me = this.players[0];
    if (input && me) {
      this.input(0, { x: input.x ?? 0, z: input.z ?? 0, target: input.target ?? null, aim: input.aim });
    }
    if (this.phase === "active" && me?.alive && !me.respawning && this.predicting) {
      // Correction smoothing: bleed accumulated error into the predicted position.
      const k = 1 - Math.exp(-dt * 10);
      const bleed = this.correction.clone().multiplyScalar(k);
      me.position.add(bleed);
      this.correction.sub(bleed);
      this.movePlayer(me, dt);
      this.trail.push({ t: performance.now() / 1000, pos: me.position.clone() });
      while (this.trail.length > 360) this.trail.shift();
      this.updateLock(me, me.input.target, dt);
      for (const h of this.hammers) {
        h.angle += h.omega * dt;
        this.hammerStep(h, dt);
      }
    }
    for (const r of this.projectiles) r.position.addScaledVector(r.velocity, dt);
    this.interpolateRemotes();
    this.sendClock += dt;
    if (this.sendClock >= 1 / INPUT_HZ && me) {
      this.sendClock = 0;
      this.seq++;
      this.sent.set(this.seq, performance.now() / 1000);
      const target = me.lock.holding && me.lock.target !== null ? this.swap(me.lock.target) : me.input.target === null || me.input.target === undefined ? null : this.swap(me.input.target);
      const aim = me.input.aim;
      this.net.send({
        t: "input",
        seq: this.seq,
        x: +me.input.x.toFixed(3),
        z: +me.input.z.toFixed(3),
        target,
        aim: aim ? { x: +aim.x.toFixed(3), y: +aim.y.toFixed(3), z: +aim.z.toFixed(3) } : undefined,
        facing: +me.rotation.toFixed(3),
      });
    }
  }
  interpolateRemotes() {
    if (this.snapshots.length === 0) return;
    const renderTime = this.serverNow() - INTERP_DELAY;
    let a = this.snapshots[0],
      b = null;
    for (const s of this.snapshots) {
      if (s.time <= renderTime) a = s;
      else {
        b = s;
        break;
      }
    }
    for (const p of this.players) {
      if (p.id === 0 && this.predicting) continue;
      const ra = a.rows.get(p.id);
      if (!ra) continue;
      const rb = b?.rows.get(p.id);
      if (rb && b.time > a.time) {
        const t = Math.max(0, Math.min(1, (renderTime - a.time) / (b.time - a.time)));
        p.position.set(ra.x + (rb.x - ra.x) * t, ra.y + (rb.y - ra.y) * t, ra.z + (rb.z - ra.z) * t);
        const d = Math.atan2(Math.sin(rb.rot - ra.rot), Math.cos(rb.rot - ra.rot));
        p.rotation = ra.rot + d * t;
      } else {
        // Past the newest snapshot: brief velocity extrapolation, then hold.
        const ahead = Math.min(MAX_EXTRAPOLATE, Math.max(0, renderTime - a.time));
        p.position.set(ra.x + ra.vx * ahead, ra.y + ra.vy * ahead, ra.z + ra.vz * ahead);
        p.rotation = ra.rot;
      }
      p.level = this.levelAt(p.position.y);
    }
  }
  // ---------- outbound intents with local prediction ----------
  jump(id) {
    if (id !== 0) return false;
    const ok = super.jump(0);
    this.net.send({ t: "jump", seq: this.seq });
    return ok;
  }
  dive(id) {
    if (id !== 0) return false;
    const ok = super.dive(0);
    this.net.send({ t: "dive", seq: this.seq });
    return ok;
  }
  holdFire(id) {
    if (id !== 0) return false;
    const ok = super.holdFire(0);
    if (ok) this.net.send({ t: "hold" });
    return ok;
  }
  releaseFire(id, aim = null) {
    const p = this.players[id];
    if (!p || id !== 0) return false;
    const lock = p.lock;
    const fire = lock.holding && lock.locked && this.players[lock.target]?.alive && p.alive && p.launcher !== null && p.ammo > 0;
    p.lock = { holding: false, target: null, seconds: 0, locked: false };
    if (!fire) {
      if (lock.holding) this.emit("fire-cancelled", { player: 0 });
      this.net.send({ t: "cancel" });
      return false;
    }
    const d = aim?.direction;
    this.net.send({
      t: "fire",
      seq: this.seq,
      target: this.swap(lock.target),
      aim: d ? { x: +d.x.toFixed(4), y: +d.y.toFixed(4), z: +d.z.toFixed(4) } : undefined,
    });
    return true;
  }
  cancelFire(id) {
    super.cancelFire(id);
    if (id === 0) this.net.send({ t: "cancel" });
  }
}
