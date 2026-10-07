// 15-player load test: 1 real browser + 5 headless WebSocket humans + 9 bots, Hard, 10 floors.
// Measures server tick cost, traffic per client, server memory and browser frame performance.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import WebSocket from "ws";
import { createServer } from "../server/index.js";

const SECONDS = Number(process.env.LOAD_SECONDS) || 20;
const app = createServer({ port: 0, host: "127.0.0.1", quiet: true, staticDir: "dist" });
const port = await app.listen();
const url = `ws://127.0.0.1:${port}/ws`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket(url);
  const c = { ws, name, bytes: 0, snaps: 0, last: null, welcome: null, start: null, seq: 0 };
  ws.on("message", (d) => {
    c.bytes += d.length;
    const m = JSON.parse(d);
    if (m.t === "welcome") c.welcome = m;
    if (m.t === "lobby") c.lobby = m.lobby;
    if (m.t === "start") c.start = m;
    if (m.t === "snap") {
      c.snaps++;
      c.last = m;
    }
  });
  c.ready = new Promise((r) => ws.on("open", r));
  c.send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  return c;
}
const until = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timeout");
    await sleep(25);
  }
};
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--enable-webgl", "--ignore-gpu-blocklist", "--enable-precise-memory-info"] });
try {
  const host = client("Host");
  await host.ready;
  host.send({ t: "create", name: "Host" });
  await until(() => host.welcome);
  const code = host.welcome.code;
  const humans = [host];
  for (let i = 1; i < 5; i++) {
    const c = client(`Load${i}`);
    await c.ready;
    c.send({ t: "join", code, name: c.name });
    await until(() => c.welcome);
    c.send({ t: "ready", ready: true });
    humans.push(c);
  }
  // The real browser joins as the 6th human.
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("pizzeria-drop-controls-seen", "1"));
  await page.goto(`http://127.0.0.1:${port}/?room=${code}`);
  await page.waitForSelector("#menu[data-screen='join']", { timeout: 40000 });
  await page.fill("#join-name", "Browser");
  await page.click("#join-go");
  await page.waitForFunction(() => window.dropStudio.menu.screen === "lobby");
  await page.click("#lobby-action");
  host.send({ t: "settings", settings: { world: "cityscape", difficulty: "hard", floors: 10, bots: true, botCount: 9, botDifficulty: "hard", lives: false }, rev: 1 });
  await until(() => host.lobby?.members.length === 15 && host.lobby.canStart.ok);
  host.send({ t: "start" });
  await until(() => humans.every((c) => c.start));
  assert.equal(host.start.config.count, 15);
  assert.equal(host.start.config.floors, 10);
  await page.waitForFunction(() => window.dropStudio.match?.phase === "active", null, { timeout: 15000 });
  // Headless humans: wander with live 30 Hz input and occasional jumps.
  const timers = humans.map((c, i) =>
    setInterval(() => {
      const a = Date.now() / 900 + i;
      c.send({ t: "input", seq: ++c.seq, x: Math.cos(a), z: Math.sin(a), target: null, aim: { x: 0, y: 0, z: -1 } });
      if (c.seq % 45 === 0) c.send({ t: "jump", seq: c.seq });
    }, 1000 / 30),
  );
  for (const c of humans) c.bytes = 0;
  const t0 = Date.now();
  const mem0 = process.memoryUsage().rss;
  await page.keyboard.down("KeyW");
  const frames = await page.evaluate(async (seconds) => {
    const samples = [];
    let t = performance.now();
    const end = t + seconds * 1000;
    while (performance.now() < end) {
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      samples.push(now - t);
      t = now;
    }
    samples.sort((a, b) => a - b);
    const d = window.dropStudio;
    return {
      frames: samples.length,
      medianFrameMs: +samples[Math.floor(samples.length / 2)].toFixed(2),
      p95FrameMs: +samples[Math.floor(samples.length * 0.95)].toFixed(2),
      drawCalls: d.state.drawCalls,
      triangles: d.state.triangles,
      jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      players: d.match.players.length,
      alive: d.match.players.filter((p) => p.alive).length,
      floors: d.match.levels.length,
      net: { ...d.match.netStats, log: undefined },
    };
  }, SECONDS);
  await page.keyboard.up("KeyW");
  timers.forEach(clearInterval);
  const secs = (Date.now() - t0) / 1000;
  const metrics = await fetch(`http://127.0.0.1:${port}/metrics`).then((r) => r.json());
  const room = metrics.rooms.find((r) => r.code === code);
  const report = {
    environment: "Local Windows machine; server in-process (Node); 1 Chrome client + 5 headless WS clients + 9 hard bots; Cityscape Hard 10 floors. Not a physical phone.",
    durationSeconds: +secs.toFixed(1),
    server: {
      tickMedianMs: +room.tickMedianMs.toFixed(3),
      tickP95Ms: +room.tickP95Ms.toFixed(3),
      tickMaxMs: +room.tickMaxMs.toFixed(3),
      tickBudgetMs: 16.7,
      rssMB: +(process.memoryUsage().rss / 1048576).toFixed(1),
      rssGrowthMB: +((process.memoryUsage().rss - mem0) / 1048576).toFixed(1),
    },
    network: {
      downKBPerClientPerSecond: +(humans.reduce((s, c) => s + c.bytes, 0) / humans.length / secs / 1024).toFixed(1),
      snapshotHz: 20,
      snapshotBytes: host.last ? JSON.stringify(host.last).length : 0,
    },
    browser: frames,
    errors,
  };
  console.log(JSON.stringify(report, null, 2));
  assert(report.server.tickP95Ms < 8, "server tick p95 well inside the 16.7 ms budget");
  assert(report.network.downKBPerClientPerSecond < 80);
  assert.equal(frames.players, 15);
  assert.deepEqual(errors, []);
  fs.writeFileSync("assets/reports/load-test.json", JSON.stringify(report, null, 2));
  humans.forEach((c) => c.ws.close());
} finally {
  await browser.close();
  await app.close();
}
