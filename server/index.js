// Pizzeria Drop authoritative realtime server.
// One process serves the static client (dist/), health/metrics endpoints and WebSocket rooms at /ws.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { RoomManager } from "./room.js";
import { PROTOCOL_VERSION, normalizeCode } from "../src/net/protocol.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
export function createServer({
  port = Number(env.PORT) || 8787,
  host = env.HOST || "0.0.0.0",
  staticDir = env.STATIC_DIR ? path.resolve(env.STATIC_DIR) : path.resolve(here, "../dist"),
  allowedOrigins = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  latencyMs = Number(env.SIM_LATENCY_MS) || 0,
  jitterMs = Number(env.SIM_JITTER_MS) || 0,
  maxRooms = Number(env.MAX_ROOMS) || 500,
  testHooks = env.ALLOW_TEST_HOOKS === "1",
  quiet = env.QUIET === "1",
} = {}) {
  const log = quiet ? () => {} : (...a) => console.log(new Date().toISOString(), ...a);
  const rooms = new RoomManager({ log });
  const started = Date.now();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".glb": "model/gltf-binary",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, uptime: Math.round((Date.now() - started) / 1000), ...rooms.stats() }));
    }
    if (url.pathname === "/metrics") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify({ ...rooms.stats(), rooms: [...rooms.rooms.values()].map((r) => r.metricsSummary()) }));
    }
    // Static client with SPA fallback (any /play/... path serves index.html).
    if (!fs.existsSync(staticDir)) {
      res.writeHead(404);
      return res.end("Client build not found. Run npm run build.");
    }
    let file = path.normalize(path.join(staticDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(staticDir)) {
      res.writeHead(403);
      return res.end();
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(staticDir, "index.html");
    const ext = path.extname(file);
    const immutable = /[\\/]assets[\\/].*-[A-Za-z0-9_-]{8}\./.test(file);
    res.writeHead(200, {
      "content-type": types[ext] || "application/octet-stream",
      "cache-control": immutable ? "public, max-age=31536000, immutable" : ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    fs.createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/ws") return socket.destroy();
    if (allowedOrigins.length && !allowedOrigins.includes(req.headers.origin)) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  // Optional simulated latency/jitter (testing only); order preserved per direction.
  const delayed = () => {
    let last = 0;
    return (fn) => {
      if (!latencyMs && !jitterMs) return fn();
      const at = Math.max(last, Date.now() + latencyMs + Math.random() * jitterMs);
      last = at;
      setTimeout(fn, at - Date.now());
    };
  };

  wss.on("connection", (ws) => {
    const outbound = delayed(),
      inbound = delayed();
    const socket = {
      sendText: (text) => outbound(() => ws.readyState === 1 && ws.send(text)),
      close: (code, reason) => ws.close(code, reason),
    };
    let room = null,
      member = null;
    const reply = (msg) => socket.sendText(JSON.stringify(msg));
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
    ws.on("message", (data) =>
      inbound(() => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (!msg || typeof msg.t !== "string") return;
        if (msg.t === "ping") return reply({ t: "pong", c: msg.c, s: Date.now() });
        if (!member) {
          if (msg.t === "create") {
            if (rooms.rooms.size >= maxRooms) return reply({ t: "error", code: "server_full" });
            room = rooms.create();
            const r = room.join(socket, msg);
            if (r.error) {
              rooms.remove(room);
              room = null;
              return reply({ t: "error", code: r.error });
            }
            member = r.member;
            return reply({ t: "welcome", code: room.code, id: member.id, token: member.token });
          }
          if (msg.t === "join" || msg.t === "resume") {
            room = rooms.rooms.get(normalizeCode(msg.code));
            if (!room) return reply({ t: "error", code: "not_found" });
            const r = room.join(socket, msg);
            if (r.error) {
              room = null;
              return reply({ t: "error", code: r.error });
            }
            member = r.member;
            reply({ t: "welcome", code: room.code, id: member.id, token: member.token, resumed: !!r.resumed });
            room.broadcastLobby();
            if (room.match) room.sendStart(member);
            return;
          }
          return reply({ t: "error", code: "not_in_room" });
        }
        switch (msg.t) {
          case "settings":
            return room.setSettings(member, msg.settings, msg.rev);
          case "ready":
            return room.setReady(member, msg.ready);
          case "character":
            return room.setCharacter(member, msg.character);
          case "start": {
            const r = room.start(member);
            if (r.error) reply({ t: "error", code: r.error });
            return;
          }
          case "lobby":
            if (room.state === "results") room.toLobby();
            return;
          case "leave":
            room.leave(member);
            member = null;
            room = null;
            return;
          case "debug":
            // Test-only hooks (ALLOW_TEST_HOOKS=1): never enabled in production.
            if (!testHooks || !room.match) return;
            if (msg.op === "eliminate") {
              const p = room.match.players[msg.player];
              if (p) p.position.y = room.match.killY - 1;
            } else if (msg.op === "freezeBots") room.match.bots = false;
            else if (msg.op === "place") {
              const p = room.match.players[msg.player];
              if (p) {
                p.position.set(msg.x, msg.y, msg.z);
                p.velocity.set(0, 0, 0);
              }
            } else if (msg.op === "launcherAt") {
              const l = room.match.launchers[msg.launcher];
              if (l) {
                if (l.owner !== null) room.match.players[l.owner].launcher = null;
                l.state = "resting";
                l.owner = null;
                l.position.set(msg.x, msg.y, msg.z);
                l.tile = room.match.tileAt(room.match.levelAt(msg.y), msg.x, msg.z);
              }
            }
            return;
          default:
            return room.input(member, msg);
        }
      }),
    );
    ws.on("close", () => inbound(() => member && room?.disconnect(member)));
  });
  // Heartbeat: terminate dead sockets so the reconnect grace starts promptly.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) ws.terminate();
      ws.isAlive = false;
      ws.ping();
    }
  }, 10000);
  return {
    rooms,
    server,
    listen: () =>
      new Promise((resolve) =>
        server.listen(port, host, () => {
          log(`Pizzeria Drop server on http://${host}:${server.address().port} (ws path /ws, static ${staticDir})`);
          resolve(server.address().port);
        }),
      ),
    close: () => {
      clearInterval(heartbeat);
      for (const r of rooms.rooms.values()) r.stop();
      for (const ws of wss.clients) ws.terminate();
      return new Promise((r) => server.close(r));
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createServer();
  await app.listen();
  const shutdown = () => app.close().then(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
