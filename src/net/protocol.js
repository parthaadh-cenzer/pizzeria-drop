// Shared by the browser client and the Node authoritative server.
export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 15;
export const FLOORS = { min: 5, max: 10, default: 7 };
export const LIVES_ON = 3;
export const RECONNECT_GRACE_MS = 15000;
export const SNAPSHOT_HZ = 20;
export const INPUT_HZ = 30;
export const WORLDS = ["volcano", "cityscape"];
export const DIFFICULTIES = ["easy", "medium", "hard"];
export const CHARACTERS = ["girl", "boy"];
export const ANIMS = ["idle", "run", "jump", "fall", "landing", "recovery", "hit", "dance", "dive"];
export const LAUNCHER_STATES = ["waiting", "resting", "falling", "equipped"];
// Unambiguous characters for spoken/typed room codes (no 0/O, 1/I/L).
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 5;

export const DEFAULT_SETTINGS = Object.freeze({
  world: "volcano",
  difficulty: "medium",
  floors: FLOORS.default,
  lives: false,
  bots: false,
  botCount: 3,
  botDifficulty: "medium",
});

const pick = (value, list, fallback) => (list.includes(value) ? value : fallback);
const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

// Canonical settings: everything a client sends is clamped here; bots never push humans out.
export function sanitizeSettings(input = {}, humans = 1, base = DEFAULT_SETTINGS) {
  const s = { ...base, ...input };
  const room = Math.max(0, MAX_PLAYERS - humans);
  return {
    world: pick(s.world, WORLDS, base.world),
    difficulty: pick(s.difficulty, DIFFICULTIES, base.difficulty),
    floors: clampInt(s.floors, FLOORS.min, FLOORS.max, base.floors),
    lives: !!s.lives,
    bots: !!s.bots,
    botCount: clampInt(s.botCount, 0, room, Math.min(base.botCount, room)),
    botDifficulty: pick(s.botDifficulty, DIFFICULTIES, base.botDifficulty),
  };
}
export const activeBots = (settings) => (settings.bots ? settings.botCount : 0);

export function sanitizeName(name) {
  return String(name ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 14);
}
export const normalizeCode = (code) =>
  String(code ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);

const q = (v) => Math.round(v * 100) / 100;
// Compact snapshot rows (arrays, 2-decimal precision) keep 15-player traffic small.
export function encodePlayer(p) {
  const flags =
    (p.alive ? 1 : 0) |
    (p.removed ? 2 : 0) |
    (p.grounded ? 4 : 0) |
    (p.respawning ? 8 : 0) |
    (p.lock.holding ? 16 : 0) |
    (p.lock.locked ? 32 : 0);
  return [
    p.id,
    q(p.position.x), q(p.position.y), q(p.position.z),
    q(p.velocity.x), q(p.velocity.y), q(p.velocity.z),
    q(p.rotation),
    Math.max(0, ANIMS.indexOf(p.animation)),
    flags,
    p.ammo,
    p.launcher ?? -1,
    p.livesLeft,
    p.lock.target ?? -1,
    p.eliminatedAt === null ? -1 : q(p.eliminatedAt),
  ];
}
export function decodePlayer(row) {
  const [id, x, y, z, vx, vy, vz, rot, anim, flags, ammo, launcher, livesLeft, target, eliminatedAt] = row;
  return {
    id, x, y, z, vx, vy, vz, rot,
    animation: ANIMS[anim] ?? "idle",
    alive: !!(flags & 1),
    removed: !!(flags & 2),
    grounded: !!(flags & 4),
    respawning: !!(flags & 8),
    holding: !!(flags & 16),
    locked: !!(flags & 32),
    ammo,
    launcher: launcher < 0 ? null : launcher,
    livesLeft,
    target: target < 0 ? null : target,
    eliminatedAt: eliminatedAt < 0 ? null : eliminatedAt,
  };
}
export const encodeLauncher = (l) => [
  l.id,
  LAUNCHER_STATES.indexOf(l.state),
  q(l.position.x), q(l.position.y), q(l.position.z),
  l.owner ?? -1,
];
export const encodeRocket = (r) => [
  r.id, r.owner,
  q(r.position.x), q(r.position.y), q(r.position.z),
  q(r.velocity.x), q(r.velocity.y), q(r.velocity.z),
];
// Only tiles that differ from their initial state; used for start/resume.
export const encodeTiles = (tiles) =>
  tiles
    .filter((t) => t.gone !== !t.startsPresent || t.activatedAt !== null)
    .map((t) => [t.id, t.activatedAt === null ? -1 : q(t.activatedAt), t.gone ? 1 : 0]);

// Join URL suitable for sharing; a host platform (e.g. Staige) can supply its own base URL.
export function joinUrl(code, base = globalThis.location?.href ?? "") {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", code);
  return url.toString();
}
