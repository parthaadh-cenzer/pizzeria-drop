import { randomBytes, randomInt } from "node:crypto";
import { Match, RULES, BOT_NAMES } from "../src/gameplay.js";
import {
  MAX_PLAYERS,
  LIVES_ON,
  RECONNECT_GRACE_MS,
  SNAPSHOT_HZ,
  CODE_ALPHABET,
  CODE_LENGTH,
  CHARACTERS,
  DEFAULT_SETTINGS,
  sanitizeSettings,
  sanitizeName,
  activeBots,
  encodePlayer,
  encodeLauncher,
  encodeRocket,
  encodeTiles,
} from "../src/net/protocol.js";

const TICK_MS = 1000 / 60;
const RESULTS_AUTO_LOBBY_MS = 45000;
const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);
const unit = (x, z) => {
  x = finite(x);
  z = finite(z);
  const len = Math.hypot(x, z);
  return len > 1 ? { x: x / len, z: z / len } : { x, z };
};

export class RoomManager {
  constructor({ clock = () => performance.now(), log = () => {} } = {}) {
    this.rooms = new Map();
    this.clock = clock;
    this.log = log;
  }
  code() {
    for (;;) {
      let c = "";
      for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
  }
  create() {
    const room = new Room(this.code(), this);
    this.rooms.set(room.code, room);
    this.log(`room ${room.code} created`);
    return room;
  }
  remove(room) {
    room.stop();
    this.rooms.delete(room.code);
    this.log(`room ${room.code} closed`);
  }
  stats() {
    let humans = 0,
      matches = 0;
    for (const r of this.rooms.values()) {
      humans += r.humans().length;
      if (r.match) matches++;
    }
    return { rooms: this.rooms.size, humans, matches };
  }
}

// A member is a human seat; bots are derived from settings and only exist inside matches.
export class Room {
  constructor(code, manager) {
    this.code = code;
    this.manager = manager;
    this.members = [];
    this.hostId = null;
    this.state = "lobby"; // lobby | match | results
    this.settings = { ...DEFAULT_SETTINGS };
    this.match = null;
    this.seats = []; // match player index -> member id | null (bot)
    this.timer = null;
    this.lastSnap = 0;
    this.lastSeq = 0;
    this.metrics = { ticks: 0, tickMs: [], bytes: 0, sent: 0, startedAt: 0 };
    this.nextMember = 1;
  }
  humans() {
    return this.members;
  }
  connected() {
    return this.members.filter((m) => m.socket);
  }
  // ---------- membership ----------
  join(socket, { name, character, token }) {
    const resumed = token && this.members.find((m) => m.token === token);
    if (resumed) return this.resume(resumed, socket);
    if (this.state !== "lobby") return { error: "started" };
    const clean = sanitizeName(name);
    if (!clean) return { error: "bad_name" };
    const total = this.members.length + activeBots(this.settings);
    if (total >= MAX_PLAYERS) {
      // Humans take priority over optional bots before the match starts.
      if (activeBots(this.settings) > 0) this.settings.botCount--;
      else return { error: "full" };
    }
    const member = {
      id: `m${this.nextMember++}`,
      token: randomBytes(16).toString("hex"),
      name: clean,
      character: CHARACTERS.includes(character) ? character : "girl",
      ready: false,
      socket,
      lastSeen: Date.now(),
      graceTimer: null,
      seq: 0,
      jumpUntil: -1,
      inputs: 0,
      inputWindow: 0,
    };
    this.members.push(member);
    if (!this.hostId) this.hostId = member.id;
    this.settings = sanitizeSettings(this.settings, this.members.length, this.settings);
    this.broadcastLobby();
    return { member };
  }
  resume(member, socket) {
    clearTimeout(member.graceTimer);
    member.graceTimer = null;
    member.socket?.close?.(4000, "replaced");
    member.socket = socket;
    member.lastSeen = Date.now();
    this.broadcastLobby();
    if (this.match) this.sendStart(member);
    return { member, resumed: true };
  }
  disconnect(member) {
    if (!member || member.socket === null) return;
    member.socket = null;
    if (this.match) {
      const idx = this.seats.indexOf(member.id);
      if (idx >= 0) this.match.input(idx, { x: 0, z: 0, target: null });
    }
    this.broadcastLobby();
    // Grace period: refresh/network hiccups keep the seat and character.
    member.graceTimer = setTimeout(() => this.drop(member), RECONNECT_GRACE_MS);
  }
  leave(member) {
    clearTimeout(member.graceTimer);
    member.socket = null;
    this.drop(member);
  }
  drop(member) {
    if (!this.members.includes(member) || member.socket) return;
    if (this.match && this.match.phase !== "won") {
      // In a match the character stays; after grace an absent player is eliminated.
      const idx = this.seats.indexOf(member.id);
      const p = this.match.players[idx];
      if (p?.alive) {
        p.livesLeft = 1;
        this.match.eliminate(p);
      }
    }
    this.members = this.members.filter((m) => m !== member);
    if (this.hostId === member.id) this.hostId = this.members.find((m) => m.socket)?.id ?? this.members[0]?.id ?? null;
    if (!this.members.length) return this.manager.remove(this);
    this.broadcastLobby();
  }
  // ---------- lobby ----------
  isHost(member) {
    return member.id === this.hostId;
  }
  setSettings(member, settings, rev) {
    if (!this.isHost(member) || this.state !== "lobby") return;
    this.settings = sanitizeSettings(settings, this.members.length, this.settings);
    if (Number.isInteger(rev)) this.settingsRev = Math.max(this.settingsRev ?? 0, rev);
    this.broadcastLobby();
  }
  setReady(member, ready) {
    if (this.state !== "lobby") return;
    member.ready = !!ready;
    this.broadcastLobby();
  }
  setCharacter(member, character) {
    if (this.state !== "lobby" || !CHARACTERS.includes(character)) return;
    member.character = character;
    this.broadcastLobby();
  }
  canStart() {
    const others = this.members.filter((m) => m.id !== this.hostId);
    const total = this.members.length + activeBots(this.settings);
    if (total < 2) return { ok: false, reason: "need_players" };
    if (others.some((m) => !m.socket || !m.ready)) return { ok: false, reason: "not_ready" };
    return { ok: true };
  }
  lobbyState() {
    const bots = Array.from({ length: activeBots(this.settings) }, (_, i) => ({
      id: `bot${i}`,
      name: `Bot ${BOT_NAMES[i % BOT_NAMES.length]}`,
      bot: true,
      host: false,
      connected: true,
      ready: true,
      character: i % 2 ? "boy" : "girl",
    }));
    return {
      code: this.code,
      state: this.state,
      hostId: this.hostId,
      settings: this.settings,
      settingsRev: this.settingsRev ?? 0,
      capacity: MAX_PLAYERS,
      canStart: this.canStart(),
      members: [
        ...this.members.map((m) => ({
          id: m.id,
          name: m.name,
          character: m.character,
          ready: m.id === this.hostId || m.ready,
          host: m.id === this.hostId,
          connected: !!m.socket,
          bot: false,
        })),
        ...bots,
      ],
    };
  }
  broadcastLobby() {
    const lobby = this.lobbyState();
    for (const m of this.members) this.send(m, { t: "lobby", you: m.id, lobby });
  }
  // ---------- match ----------
  start(member) {
    if (!this.isHost(member) || this.state !== "lobby") return { error: "not_host" };
    const check = this.canStart();
    if (!check.ok) return { error: check.reason };
    const humans = this.members.filter((m) => m.socket || m.graceTimer);
    const bots = activeBots(this.settings);
    const count = humans.length + bots;
    const seed = randomInt(1, 2 ** 31);
    this.seats = [...humans.map((m) => m.id), ...Array(bots).fill(null)];
    const names = [
      ...humans.map((m) => m.name),
      ...Array.from({ length: bots }, (_, i) => `Bot ${BOT_NAMES[i % BOT_NAMES.length]}`),
    ];
    const characters = [
      ...humans.map((m) => m.character),
      ...Array.from({ length: bots }, (_, i) => (i % 2 ? "boy" : "girl")),
    ];
    this.config = {
      world: this.settings.world,
      difficulty: this.settings.difficulty,
      floors: this.settings.floors,
      lives: this.settings.lives ? LIVES_ON : 1,
      botSkill: this.settings.botDifficulty,
      seed,
      count,
      players: names.map((name, i) => ({
        id: i,
        name,
        character: characters[i],
        bot: this.seats[i] === null,
        member: this.seats[i],
      })),
    };
    this.match = new Match({
      world: this.config.world,
      difficulty: this.config.difficulty,
      count,
      floors: this.config.floors,
      names,
      botIds: this.config.players.filter((p) => p.bot).map((p) => p.id),
      botSkill: this.config.botSkill,
      lives: this.config.lives,
      seed,
      validateAim: true,
    });
    this.match.start();
    this.state = "match";
    this.lastSeq = 0;
    for (const m of this.members) {
      m.ready = false;
      m.seq = 0;
      m.jumpUntil = -1;
    }
    this.metrics = { ticks: 0, tickMs: [], bytes: 0, sent: 0, startedAt: Date.now() };
    for (const m of this.members) this.sendStart(m);
    this.broadcastLobby();
    this.run();
    this.manager.log(`room ${this.code} started: ${humans.length} humans + ${bots} bots, ${this.config.floors} floors`);
    return { ok: true };
  }
  sendStart(member) {
    this.send(member, {
      t: "start",
      config: this.config,
      you: this.seats.indexOf(member.id),
      time: this.match.time,
      phase: this.match.phase,
      tiles: encodeTiles(this.match.tiles),
      result: this.match.result,
    });
  }
  run() {
    this.stop();
    let last = this.manager.clock(),
      acc = 0;
    this.timer = setInterval(() => {
      const t0 = this.manager.clock();
      acc += Math.min(0.1, (t0 - last) / 1000);
      last = t0;
      while (acc >= RULES.step) {
        this.applyBufferedActions();
        this.match.step(RULES.step, null);
        acc -= RULES.step;
      }
      if (t0 - this.lastSnap >= 1000 / SNAPSHOT_HZ) {
        this.lastSnap = t0;
        this.broadcastSnapshot();
      }
      if (this.match.phase === "won" && this.state === "match") this.finish();
      const ms = this.manager.clock() - t0;
      this.metrics.ticks++;
      this.metrics.tickMs.push(ms);
      if (this.metrics.tickMs.length > 600) this.metrics.tickMs.shift();
    }, TICK_MS);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    clearTimeout(this.resultsTimer);
  }
  finish() {
    this.state = "results";
    this.broadcastSnapshot();
    this.broadcastLobby();
    this.resultsTimer = setTimeout(() => this.toLobby(), RESULTS_AUTO_LOBBY_MS);
  }
  // Play Again / Return to Lobby: the room persists; everyone returns to settings + ready state.
  toLobby() {
    if (this.state === "lobby") return;
    this.stop();
    this.match = null;
    this.state = "lobby";
    for (const m of this.members) m.ready = false;
    this.broadcastLobby();
  }
  applyBufferedActions() {
    for (const m of this.members) {
      if (m.jumpUntil < 0) continue;
      const idx = this.seats.indexOf(m.id);
      if (this.match.jump(idx) || this.match.time > m.jumpUntil) m.jumpUntil = -1;
    }
  }
  // Clients send intent only; the server owns movement, tiles, pickups, rockets and outcomes.
  input(member, msg) {
    if (!this.match || this.state !== "match") return;
    const idx = this.seats.indexOf(member.id);
    const p = this.match.players[idx];
    if (!p) return;
    // Simple flood guard: at most 90 messages per second per player.
    const now = Date.now();
    if (now - member.inputWindow > 1000) {
      member.inputWindow = now;
      member.inputs = 0;
    }
    if (++member.inputs > 90) return;
    if (Number.isInteger(msg.seq) && msg.seq > member.seq && msg.t === "input") {
      member.seq = msg.seq;
      member.seqAt = this.match.time;
    }
    switch (msg.t) {
      case "input": {
        const move = unit(msg.x, msg.z);
        const aim = msg.aim && { x: finite(msg.aim.x), y: finite(msg.aim.y), z: finite(msg.aim.z) };
        const target = Number.isInteger(msg.target) ? msg.target : null;
        this.match.input(idx, { x: move.x, z: move.z, target, aim });
        if (p.lock.holding && Number.isFinite(msg.facing)) p.rotation = msg.facing;
        break;
      }
      case "jump":
        member.jumpUntil = this.match.time + 0.15;
        break;
      case "dive":
        this.match.dive(idx);
        break;
      case "hold":
        this.match.holdFire(idx);
        break;
      case "fire": {
        const aim = msg.aim && { x: finite(msg.aim.x), y: finite(msg.aim.y), z: finite(msg.aim.z) };
        if (aim) p.input.aim = aim;
        if (Number.isInteger(msg.target)) this.match.updateLock(p, msg.target, 0);
        this.match.releaseFire(idx, aim ? { direction: aim } : null);
        break;
      }
      case "cancel":
        this.match.cancelFire(idx);
        break;
    }
  }
  broadcastSnapshot() {
    const m = this.match;
    const events = m.events.filter((e) => e.seq > this.lastSeq);
    if (events.length) this.lastSeq = events.at(-1).seq;
    const body = JSON.stringify({
      time: Math.round(m.time * 1000) / 1000,
      phase: m.phase,
      countdown: Math.round(m.countdown * 100) / 100,
      players: m.players.map(encodePlayer),
      launchers: m.launchers.map(encodeLauncher),
      rockets: m.projectiles.map(encodeRocket),
      hammers: m.hammers.map((h) => Math.round(h.angle * 1000) / 1000),
      events,
      result: m.result,
    });
    for (const member of this.members) {
      if (!member.socket) continue;
      // Per-client ack (last applied input seq) spliced into the shared body.
      const age = Math.max(0, m.time - (member.seqAt ?? m.time)).toFixed(3);
      const text = `{"t":"snap","ack":${member.seq},"ackAge":${age},${body.slice(1)}`;
      this.sendRaw(member, text);
    }
  }
  send(member, message) {
    if (member.socket) this.sendRaw(member, JSON.stringify(message));
  }
  sendRaw(member, text) {
    this.metrics.bytes += text.length;
    this.metrics.sent++;
    member.socket.sendText(text);
  }
  metricsSummary() {
    const ms = [...this.metrics.tickMs].sort((a, b) => a - b);
    const secs = Math.max(0.001, (Date.now() - this.metrics.startedAt) / 1000);
    return {
      code: this.code,
      state: this.state,
      humans: this.members.length,
      players: this.match?.players.length ?? 0,
      tickMedianMs: ms[Math.floor(ms.length / 2)] ?? 0,
      tickP95Ms: ms[Math.floor(ms.length * 0.95)] ?? 0,
      tickMaxMs: ms.at(-1) ?? 0,
      bytesPerSecond: Math.round(this.metrics.bytes / secs),
      bytesPerClientPerSecond: Math.round(this.metrics.bytes / secs / Math.max(1, this.connected().length)),
    };
  }
}
