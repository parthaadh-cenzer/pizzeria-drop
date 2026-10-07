// Multiplayer acceptance: two real browser clients (desktop host + touch phone guest) against the
// production build served by the authoritative server, then repeated under simulated latency.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "../server/index.js";

const shots = "assets/reports";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const checks = [],
  results = {},
  errors = [];
const pass = (name, data) => {
  checks.push(name);
  if (data) results[name] = data;
  console.log("PASS", name, data ? JSON.stringify(data) : "");
};
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
};
const studio = (page) => page.evaluate(() => {
  const d = window.dropStudio, m = d.match;
  return {
    phase: m.phase,
    floors: m.levels.length,
    world: m.world,
    names: m.players.map((p) => p.name),
    me: m.players[0].name,
    winner: m.result?.winnerName ?? null,
  };
});
// Debug hooks are only accepted by a server started with test hooks enabled.
const hook = (page, msg) => page.evaluate((m) => window.dropStudio.menu.connection.send({ t: "debug", ...m }), msg);
const serverIndex = (page, name) => page.evaluate((n) => {
  const m = window.dropStudio.match;
  return m.swap(m.players.findIndex((p) => p.name === n));
}, name);

async function session({ latencyMs = 0, jitterMs = 0, full = true }) {
  const app = createServer({ port: 0, host: "127.0.0.1", quiet: true, testHooks: true, latencyMs, jitterMs, staticDir: "dist" });
  const port = await app.listen();
  const base = `http://127.0.0.1:${port}`;
  const tag = latencyMs ? `${latencyMs}ms` : "0ms";
  const A = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const B = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  watch(A, `A${tag}`);
  watch(B, `B${tag}`);
  try {
    for (const p of [A, B]) await p.addInitScript(() => localStorage.setItem("pizzeria-drop-controls-seen", "1"));
    await A.goto(base);
    await A.waitForSelector("#menu:not([hidden])");
    await A.fill("#menu-name", "Parth");
    await A.click("#btn-host");
    await A.waitForFunction(() => window.dropStudio.menu.screen === "lobby" && window.dropStudio.menu.lobby?.code, null, { timeout: 10000 }).catch(async (e) => {
      console.log("host stuck:", JSON.stringify(await A.evaluate(() => ({ screen: window.dropStudio.menu.screen, err: document.querySelector("#menu-error").textContent, busy: document.querySelector("#busy-text").textContent }))));
      throw e;
    });
    const code = await A.evaluate(() => window.dropStudio.menu.lobby.code);
    // Host settings through the real lobby controls.
    await A.click('[data-set="world:cityscape"]');
    await A.click("#floor-down");
    await A.click("#floor-down");
    await A.click('[data-set="bots:true"]');
    await A.click("#bot-down");
    await A.click('[data-set="botDifficulty:hard"]');
    await A.waitForFunction(() => {
      const s = window.dropStudio.menu.lobby.settings;
      return s.floors === 5 && s.world === "cityscape" && s.bots && s.botCount === 2 && s.botDifficulty === "hard";
    });
    if (full) await A.screenshot({ path: `${shots}/v1-lobby-desktop.png` });
    // Guest joins through the shared link (?room=CODE prefills the join screen).
    await B.goto(`${base}/?room=${code}`);
    await B.waitForSelector("#menu[data-screen='join']");
    assert.equal(await B.inputValue("#join-code"), code);
    await B.fill("#join-name", "Alex");
    await B.tap("#join-go").catch(async () => B.click("#join-go"));
    await B.waitForFunction(() => window.dropStudio.menu.screen === "lobby" && window.dropStudio.menu.lobby?.members.length === 4);
    const [la, lb] = await Promise.all([A, B].map((p) => p.evaluate(() => window.dropStudio.menu.lobby)));
    assert.deepEqual(la.settings, lb.settings);
    assert.deepEqual(lb.members.map((m) => [m.name, m.host, m.bot]), [["Parth", true, false], ["Alex", false, false], ["Bot Nova", false, true], ["Bot Pepper", false, true]]);
    if (full) {
      await B.click('[data-tab="players"]');
      await B.screenshot({ path: `${shots}/v1-lobby-phone-players.png` });
      await B.click('[data-tab="match"]');
      await B.screenshot({ path: `${shots}/v1-lobby-phone-match.png` });
    }
    pass(`[${tag}] host creates room, guest joins by link/code; identical settings and player list (HOST, BOT badges)`, { code });
    assert(await A.isDisabled("#lobby-action"), "start disabled until guest ready");
    await B.click("#lobby-action");
    await A.waitForFunction(() => !document.querySelector("#lobby-action").disabled);
    await A.click("#lobby-action");
    await Promise.all([A, B].map((p) => p.waitForFunction(() => window.dropStudio.match?.phase === "active", null, { timeout: 15000 })));
    const [sa, sb] = await Promise.all([A, B].map(studio));
    assert.equal(sa.floors, 5);
    assert.equal(sb.floors, 5);
    assert.equal(sa.world, "cityscape");
    assert.deepEqual([...sa.names].sort(), [...sb.names].sort());
    assert.equal(sa.me, "Parth");
    assert.equal(sb.me, "Alex");
    pass(`[${tag}] ready → host start → both clients in the same 5-floor Cityscape match with 2 humans + 2 bots`);
    // Freeze bots for deterministic checks (server-side, test hook).
    await hook(A, { op: "freezeBots" });

    // Remote movement: A walks; B sees A's character move smoothly.
    const before = await B.evaluate(() => window.dropStudio.match.players.find((p) => p.name === "Parth").position.x);
    await A.keyboard.down("KeyD");
    const samples = [];
    for (let i = 0; i < 24; i++) {
      samples.push(await B.evaluate(() => window.dropStudio.match.players.find((p) => p.name === "Parth").position.x));
      await B.waitForTimeout(25);
    }
    await A.keyboard.up("KeyD");
    await B.waitForTimeout(400);
    const after = await B.evaluate(() => window.dropStudio.match.players.find((p) => p.name === "Parth").position.x);
    const steps = samples.slice(1).map((v, i) => Math.abs(v - samples[i]));
    const maxStep = Math.max(...steps);
    assert(after > before + 1, `remote moved ${before} → ${after}`);
    assert(maxStep < 0.9, `no teleport jumps (max step ${maxStep.toFixed(2)} m per 25ms sample)`);
    const net = await A.evaluate(() => window.dropStudio.match.netStats);
    if (process.env.LATENCY) console.log("snap log", JSON.stringify(net.log));
    pass(`[${tag}] movement visible remotely, interpolated without teleports`, { moved: +(after - before).toFixed(2), maxStepPerSample: +maxStep.toFixed(3), localSnaps: net.snaps });

    // Tile sync: identical activation timestamps on both clients.
    await A.waitForTimeout(500);
    const tiles = async (p) => p.evaluate(() => Object.fromEntries(window.dropStudio.match.tiles.filter((t) => t.activatedAt !== null).map((t) => [t.id, +t.activatedAt.toFixed(3)])));
    const [ta, tb] = await Promise.all([tiles(A), tiles(B)]);
    const common = Object.keys(ta).filter((k) => k in tb);
    assert(common.length >= 2, "both clients saw activations");
    assert(common.every((k) => ta[k] === tb[k]), "same server activation time");
    // Destruction: the first activated tile disappears for both.
    await A.waitForTimeout(3200);
    const goneA = await A.evaluate((id) => window.dropStudio.match.tiles.find((t) => t.id === id).gone, common[0]);
    const goneB = await B.evaluate((id) => window.dropStudio.match.tiles.find((t) => t.id === id).gone, common[0]);
    assert(goneA && goneB);
    pass(`[${tag}] tile activations share server timestamps and collapse for both clients`, { sharedActivations: common.length });

    // Pickup exclusivity: both players on the same tile as launcher 0.
    const [ia, ib] = [await serverIndex(A, "Parth"), await serverIndex(A, "Alex")];
    const spot = await A.evaluate(() => {
      const m = window.dropStudio.match, t = m.tiles.find((t) => t.level === 0 && !t.gone && t.activatedAt === null && !t.hammer && Math.abs(t.gx) <= 1 && Math.abs(t.gz) <= 1);
      return { x: t.x, y: t.y + 0.15, z: t.z };
    });
    await hook(A, { op: "place", player: ia, ...spot });
    await hook(A, { op: "place", player: ib, ...spot });
    await hook(A, { op: "launcherAt", launcher: 0, ...spot });
    await A.waitForTimeout(600);
    const own = async (p) => p.evaluate(() => window.dropStudio.match.players.filter((x) => x.launcher !== null).map((x) => x.name));
    // Clients may be up to one latency apart; require that they converge on one owner.
    let oa, ob;
    for (let i = 0; i < 20; i++) {
      [oa, ob] = await Promise.all([own(A), own(B)]);
      if (JSON.stringify(oa) === JSON.stringify(ob)) break;
      await A.waitForTimeout(100);
    }
    assert.deepEqual(oa, ob);
    assert.equal(oa.filter((n) => n === "Parth" || n === "Alex").length, 1, `exactly one human owns it: ${oa}`);
    pass(`[${tag}] rocket pickup exclusive and identical on both clients`, { owner: oa });

    // Elimination + winner sync: eliminate both bots and Alex.
    for (const n of ["Alex", "Bot Nova", "Bot Pepper"]) await hook(A, { op: "eliminate", player: await serverIndex(A, n) });
    await Promise.all([A, B].map((p) => p.waitForFunction(() => window.dropStudio.match.result, null, { timeout: 8000 })));
    const [wa, wb] = await Promise.all([A, B].map(studio));
    assert.equal(wa.winner, "Parth");
    assert.equal(wb.winner, "Parth");
    await Promise.all([A, B].map((p) => p.waitForFunction(() => !document.querySelector("#results").hidden, null, { timeout: 8000 })));
    if (full) await B.screenshot({ path: `${shots}/v1-results-phone.png` });
    pass(`[${tag}] eliminations and winner (Parth) synchronized; both show results`);

    // Return to lobby: guest returns, host plays again; room/settings persist.
    await B.click("#results-lobby");
    await A.click("#results-play-again");
    await Promise.all([A, B].map((p) => p.waitForFunction(() => window.dropStudio.menu.screen === "lobby" && window.dropStudio.menu.lobby.state === "lobby", null, { timeout: 8000 })));
    const [ra, rb] = await Promise.all([A, B].map((p) => p.evaluate(() => window.dropStudio.menu.lobby)));
    assert.equal(ra.code, code);
    assert.equal(rb.settings.floors, 5);
    pass(`[${tag}] return to lobby / play again keep the room (${code}) and settings for everyone`);

    if (full) {
      // Reconnect grace: guest reloads mid-lobby and resumes the same identity.
      const idBefore = await B.evaluate(() => window.dropStudio.menu.connection.session.id);
      await B.reload();
      await B.waitForFunction(() => window.dropStudio?.menu?.screen === "lobby", null, { timeout: 15000 });
      const idAfter = await B.evaluate(() => window.dropStudio.menu.connection.session.id);
      assert.equal(idAfter, idBefore);
      const members = await A.evaluate(() => window.dropStudio.menu.lobby.members.filter((m) => !m.bot).length);
      assert.equal(members, 2, "no duplicate player after reconnect");
      pass(`[${tag}] page refresh resumes the same player via reconnect token (no duplicate)`);
      // Error handling: wrong code does not hang.
      const C = await browser.newPage({ viewport: { width: 1000, height: 700 } });
      watch(C, "C");
      await C.goto(`${base}/?room=ZZZZZ`);
      await C.fill("#join-name", "Maya");
      await C.click("#join-go");
      await C.waitForFunction(() => /Room not found/.test(document.querySelector("#menu-error").textContent), null, { timeout: 8000 });
      await C.close();
      pass(`[${tag}] unknown room shows "Room not found" instead of an endless connecting state`);
    }
  } finally {
    await A.close();
    await B.close();
    await app.close();
  }
}

try {
  const only = process.env.LATENCY ? [[+process.env.LATENCY, +process.env.LATENCY * 0.3]] : null;
  if (!only) await session({ full: true });
  for (const [latencyMs, jitterMs] of only ?? [[50, 15], [100, 30], [150, 40]]) await session({ latencyMs, jitterMs, full: false });
  const benign = errors.filter((e) => !/WebSocket connection to .* failed/.test(e));
  assert.deepEqual(benign, []);
  fs.writeFileSync(`${shots}/multiplayer-validation.json`, JSON.stringify({ environment: "Local Chromium ×2 (desktop 1280x800 host, 844x390 touch guest) against the production build served by server/index.js; latency runs use SIM_LATENCY/SIM_JITTER per direction.", checks, results, errors }, null, 2));
  console.log(`${checks.length} multiplayer checks passed.`);
} finally {
  await browser.close();
}
