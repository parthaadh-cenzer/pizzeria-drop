// Authoritative server integration tests over real WebSockets (Node client).
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createServer } from "../server/index.js";

const checks = [];
const pass = (name) => {
  checks.push(name);
  console.log("PASS", name);
};
const app = createServer({ port: 0, host: "127.0.0.1", quiet: true, testHooks: true, staticDir: "./__no_static__" });
const port = await app.listen();
const url = `ws://127.0.0.1:${port}/ws`;

class Client {
  static async open() {
    const c = new Client();
    c.ws = new WebSocket(url);
    c.messages = [];
    c.waiters = [];
    c.ws.on("message", (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === "lobby") c.lobby = m.lobby;
      if (m.t === "snap") c.snap = m;
      if (m.t === "welcome") c.welcome = m;
      if (m.t === "start") c.start = m;
      c.messages.push(m);
      for (const w of [...c.waiters]) if (w.pred(m, c)) {
        c.waiters.splice(c.waiters.indexOf(w), 1);
        w.resolve(m);
      }
    });
    await new Promise((r) => c.ws.on("open", r));
    return c;
  }
  send(m) {
    this.ws.send(JSON.stringify(m));
  }
  wait(pred, ms = 4000, label = "message") {
    const hit = this.messages.find((m) => pred(m, this));
    if (hit && !pred.fresh) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      this.waiters.push(w);
      setTimeout(() => reject(new Error("timeout waiting for " + label)), ms);
    });
  }
  next(pred, ms, label) {
    this.messages = [];
    return this.wait(pred, ms, label);
  }
  close() {
    this.ws.close();
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const a = await Client.open();
  a.send({ t: "create", name: "Parth", character: "girl" });
  const wa = await a.wait((m) => m.t === "welcome", 3000, "welcome");
  assert.match(wa.code, /^[A-HJ-NP-Z2-9]{5}$/);
  await a.wait((m) => m.t === "lobby" && m.lobby.members.length === 1);
  assert.equal(a.lobby.hostId, wa.id);
  pass("host creates a room with a 5-character code");

  const x = await Client.open();
  x.send({ t: "join", code: "ZZZZZ", name: "Nobody" });
  assert.equal((await x.wait((m) => m.t === "error")).code, "not_found");
  pass("join with unknown code → not_found (no infinite connecting)");

  const b = await Client.open();
  b.send({ t: "join", code: wa.code.toLowerCase(), name: "Alex", character: "boy" });
  const wb = await b.wait((m) => m.t === "welcome");
  await a.wait((m) => m.t === "lobby" && m.lobby.members.length === 2);
  b.send({ t: "settings", settings: { floors: 9 } });
  await sleep(150);
  assert.equal(a.lobby.settings.floors, 7, "non-host settings ignored");
  a.send({ t: "settings", settings: { world: "cityscape", difficulty: "hard", floors: 12, bots: true, botCount: 3, botDifficulty: "hard", lives: true } });
  await b.wait((m) => m.t === "lobby" && m.lobby.settings.world === "cityscape");
  assert.deepEqual(b.lobby.settings, { world: "cityscape", difficulty: "hard", floors: 10, lives: true, bots: true, botCount: 3, botDifficulty: "hard" });
  a.send({ t: "settings", settings: { ...b.lobby.settings, floors: 2 } });
  await b.wait((m) => m.t === "lobby" && m.lobby.settings.floors === 5);
  a.send({ t: "settings", settings: { ...b.lobby.settings, floors: 5, lives: false } });
  await b.wait((m) => m.t === "lobby" && m.lobby.settings.floors === 5 && !m.lobby.settings.lives);
  assert.equal(b.lobby.members.filter((m) => m.bot).length, 3);
  assert(b.lobby.members.filter((m) => m.bot).every((m) => /^Bot /.test(m.name) && m.ready));
  pass("both clients see identical host settings; floors clamp to 5–10; non-host cannot change settings; bots listed and ready");

  // Capacity: humans + bots ≤ 15, a joining human replaces an optional bot.
  a.send({ t: "settings", settings: { ...b.lobby.settings, botCount: 99 } });
  await b.wait((m) => m.t === "lobby" && m.lobby.settings.botCount === 13);
  const c = await Client.open();
  c.send({ t: "join", code: wa.code, name: "Maya" });
  await c.wait((m) => m.t === "welcome");
  await a.wait((m) => m.t === "lobby" && m.lobby.members.filter((x) => !x.bot).length === 3);
  assert.equal(a.lobby.settings.botCount, 12);
  assert.equal(a.lobby.members.length, 15);
  pass("capacity 15 total; a joining human replaces a bot instead of being rejected");
  c.send({ t: "leave" });
  await a.wait((m) => m.t === "lobby" && m.lobby.members.filter((x) => !x.bot).length === 2);
  a.send({ t: "settings", settings: { ...a.lobby.settings, botCount: 2 } });
  await b.wait((m) => m.t === "lobby" && m.lobby.settings.botCount === 2);

  // Ready gate.
  a.send({ t: "start" });
  assert.equal((await a.wait((m) => m.t === "error")).code, "not_ready");
  b.send({ t: "ready", ready: true });
  await a.wait((m) => m.t === "lobby" && m.lobby.canStart.ok);
  a.send({ t: "start" });
  const [sa, sb] = await Promise.all([a.wait((m) => m.t === "start"), b.wait((m) => m.t === "start")]);
  assert.deepEqual(sa.config, sb.config);
  assert.equal(sa.config.floors, 5);
  assert.equal(sa.config.count, 4);
  assert.notEqual(sa.you, sb.you);
  assert.deepEqual(sa.config.players.map((p) => p.bot), [false, false, true, true]);
  pass("start requires ready humans; both clients receive identical canonical config (floors 5, seed, 2 humans + 2 bots)");

  const late = await Client.open();
  late.send({ t: "join", code: wa.code, name: "Late" });
  assert.equal((await late.wait((m) => m.t === "error")).code, "started");
  pass("join after start → started");

  await a.wait((m) => m.t === "snap" && m.phase === "active", 6000, "active");
  assert.equal(a.snap.players.length, 4);
  // Freeze bots so the test controls outcomes.
  a.send({ t: "debug", op: "freezeBots" });
  // Tile activation: both clients receive the same event with the same server time.
  const evA = await a.wait((m) => m.t === "snap" && m.events.some((e) => e.type === "tile-activated"), 4000, "tile event");
  const ev = evA.events.find((e) => e.type === "tile-activated");
  const evB = await b.wait((m) => m.t === "snap" && m.events.some((e) => e.seq === ev.seq), 4000, "tile event B");
  assert.deepEqual(evB.events.find((e) => e.seq === ev.seq), ev);
  pass("tile activation event identical on both clients (same tile id and server timestamp)");

  // Input moves the player on the server; other client sees it in snapshots.
  const ia = sa.you;
  const x0 = a.snap.players[ia][1];
  for (let i = 0; i < 12; i++) {
    a.send({ t: "input", seq: i + 1, x: 1, z: 0 });
    await sleep(33);
  }
  await sleep(150);
  assert(b.snap.players[ia][1] > x0 + 0.5, "remote movement visible");
  assert(a.snap.ack >= 12);
  pass("movement input is simulated by the server and visible to the other client; acks returned");

  // Pickup exclusivity: both players on the same launcher; exactly one owner.
  const ib = sb.you;
  const y0 = a.snap.players[ia][2];
  a.send({ t: "input", seq: 20, x: 0, z: 0 });
  a.send({ t: "debug", op: "place", player: ia, x: 0, y: y0, z: 0 });
  a.send({ t: "debug", op: "place", player: ib, x: 0, y: y0, z: 0 });
  a.send({ t: "debug", op: "launcherAt", launcher: 0, x: 0, y: y0, z: 0 });
  await sleep(300);
  const owners = [a.snap.players[ia][11], a.snap.players[ib][11]].filter((v) => v === 0);
  assert.equal(owners.length, 1, "exactly one player owns launcher 0");
  assert.deepEqual(b.snap.launchers[0], a.snap.launchers[0]);
  pass("rocket pickup is exclusive: one owner, identical launcher state for both clients");

  // Rocket fire is validated on the server: implausible aim is rejected, valid aim fires.
  const ownerIdx = a.snap.players[ia][11] === 0 ? ia : ib;
  const otherIdx = ownerIdx === ia ? ib : ia;
  const shooter = ownerIdx === ia ? a : b;
  a.send({ t: "debug", op: "place", player: ownerIdx, x: 0, y: y0, z: 4.7 });
  a.send({ t: "debug", op: "place", player: otherIdx, x: 0, y: y0, z: -4.7 });
  await sleep(200);
  shooter.send({ t: "hold" });
  shooter.send({ t: "input", seq: 100, x: 0, z: 0, target: otherIdx, aim: { x: 0, y: 0, z: 1 } });
  await sleep(100);
  shooter.send({ t: "fire", seq: 101, target: otherIdx, aim: { x: 0, y: 0, z: 1 } });
  await sleep(300);
  assert.equal(a.snap.players[ownerIdx][10], 2, "aiming away: no shot, ammo kept");
  shooter.send({ t: "hold" });
  shooter.send({ t: "input", seq: 102, x: 0, z: 0, target: otherIdx, aim: { x: 0, y: -0.05, z: -1 } });
  await sleep(100);
  shooter.send({ t: "fire", seq: 103, target: otherIdx, aim: { x: 0, y: -0.05, z: -1 } });
  const impact = await a.wait((m) => m.t === "snap" && m.events.some((e) => e.type === "rocket-impact"), 4000, "impact");
  const hit = impact.events.find((e) => e.type === "rocket-impact");
  assert(hit.tiles.length >= 1 && hit.tiles.length <= 4);
  await sleep(150);
  assert.equal(a.snap.players[ownerIdx][10], 1, "ammo 2 → 1");
  assert.equal(a.snap.players[otherIdx][9] & 1, 1, "no direct damage");
  pass("server validates rocket fire: implausible aim rejected (ammo kept); valid aim fires, ≤4 tiles, no damage");

  // Reconnect grace: B drops and resumes with its token; same seat, no duplicate.
  b.close();
  await a.wait((m) => m.t === "lobby" && m.lobby.members.some((x) => x.id === wb.id && !x.connected));
  const b2 = await Client.open();
  b2.send({ t: "resume", code: wa.code, token: wb.token });
  const rw = await b2.wait((m) => m.t === "welcome");
  assert(rw.resumed && rw.id === wb.id);
  const rs = await b2.wait((m) => m.t === "start");
  assert.equal(rs.you, ib);
  await b2.wait((m) => m.t === "snap");
  assert.equal(b2.snap.players.length, 4);
  pass("reconnect within grace restores the same player identity and match seat");

  // Elimination + winner sync.
  for (const p of [ib, 2, 3]) a.send({ t: "debug", op: "eliminate", player: p });
  const winA = await a.wait((m) => m.t === "snap" && m.result, 4000, "winner A");
  const winB = await b2.wait((m) => m.t === "snap" && m.result, 4000, "winner B");
  assert.equal(winA.result.winner, ia);
  assert.equal(winA.result.winnerName, "Parth");
  assert.deepEqual(winA.result, winB.result);
  assert.equal(winB.players[ib][9] & 1, 0, "B eliminated for both");
  pass("eliminations and winner (Parth) synchronized to both clients");

  // Return to lobby keeps the room and settings; ready resets.
  await a.wait((m) => m.t === "lobby" && m.lobby.state === "results");
  b2.send({ t: "lobby" });
  await a.wait((m) => m.t === "lobby" && m.lobby.state === "lobby");
  await b2.wait((m) => m.t === "lobby" && m.lobby.state === "lobby");
  assert.equal(a.lobby.settings.floors, 5);
  assert(!a.lobby.members.find((m) => m.id === wb.id).ready);
  pass("return to lobby syncs: same room code and settings, ready states reset");

  // Host migration in lobby.
  a.send({ t: "leave" });
  await b2.wait((m) => m.t === "lobby" && m.lobby.hostId === wb.id);
  pass("host leaving the lobby migrates host to the remaining human");

  const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
  assert(health.ok && health.rooms >= 1);
  pass("/health reports readiness");
  for (const cl of [x, late, b2, c]) cl.close();
  console.log(`${checks.length} server tests passed.`);
} finally {
  await app.close();
}
