// Production entrypoint smoke test: `npm start` server, opened at the root URL and behind a
// path-prefix reverse proxy (how a platform like Staige may mount the game).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { spawn } from "node:child_process";

const PORT = 8811,
  PROXY = 8812,
  PREFIX = "/play/pizzeria-drop";
const server = spawn(process.execPath, ["server/index.js"], { env: { ...process.env, PORT: String(PORT), QUIET: "1" }, stdio: "inherit" });
await new Promise((r) => setTimeout(r, 1500));
// Prefix proxy: only PREFIX/* reaches the app (prefix stripped), everything else is 404.
const proxy = http.createServer((req, res) => {
  if (!req.url.startsWith(PREFIX)) {
    res.writeHead(404);
    return res.end("not this app");
  }
  const up = http.request({ port: PORT, path: req.url.slice(PREFIX.length) || "/", method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  req.pipe(up);
});
proxy.on("upgrade", (req, socket, head) => {
  if (!req.url.startsWith(PREFIX)) return socket.destroy();
  const up = http.request({ port: PORT, path: req.url.slice(PREFIX.length), headers: req.headers });
  up.on("upgrade", (r, s2, h2) => {
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
    s2.write(head);
    socket.write(h2);
    s2.pipe(socket).pipe(s2);
  });
  up.end();
});
await new Promise((r) => proxy.listen(PROXY, r));
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--enable-webgl", "--ignore-gpu-blocklist"] });
const results = {};
try {
  for (const [label, url] of [
    ["root", `http://127.0.0.1:${PORT}/`],
    ["mounted", `http://127.0.0.1:${PROXY}${PREFIX}`],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const ok = new Set();
    page.on("response", (r) => {
      const name = r.url().split("/").pop();
      if (r.status() < 400) ok.add(name);
      else errors.push({ name, text: `${r.status()} ${r.url()}` });
    });
    await page.goto(url);
    // Before JS finishes, the studio must not be visible either.
    const early = await page.evaluate(() => getComputedStyle(document.querySelector("aside")).display);
    await page.waitForSelector("#menu:not([hidden])", { timeout: process.env.PROBE ? 8000 : 40000 }).catch(() => {});
    const text = await page.evaluate(() => document.body.innerText);
    if (process.env.PROBE) { console.log(label, "early", early, JSON.stringify(text.slice(0, 90)), JSON.stringify(errors.slice(0, 4))); continue; }
    assert(/HOST GAME/.test(text) && /JOIN GAME/.test(text) && /QUICK PLAY/.test(text), "game shell");
    assert(!(await page.isVisible("aside")), "World Studio sidebar hidden");
    assert(!/WORLD STUDIO|Take the drop/i.test(text), "no studio text visible");
    const version = await page.textContent("#build-version").catch(() => null);
    await page.screenshot({ path: `assets/reports/production-${label}.png` });
    // Host → lobby with every setting; Quick Play → bot match.
    await page.fill("#menu-name", "Parth");
    await page.click("#btn-host");
    await page.waitForFunction(() => window.dropStudio.menu.screen === "lobby" && window.dropStudio.menu.lobby?.code, null, { timeout: 10000 });
    const lobbyText = await page.evaluate(() => document.querySelector("#menu").innerText);
    for (const s of ["ROOM CODE", "MAP", "DIFFICULTY", "FLOORS", "LIVES", "BOTS", "BOT SKILL", "START GAME"]) assert(lobbyText.includes(s), s);
    await page.click("#floor-up");
    await page.waitForFunction(() => window.dropStudio.menu.lobby.settings.floors === 8);
    await page.click('[data-set="bots:true"]');
    await page.waitForFunction(() => window.dropStudio.menu.lobby.canStart.ok);
    await page.click("#lobby-action");
    await page.waitForFunction(() => window.dropStudio.match?.phase === "active" && window.dropStudio.match.levels.length === 8, null, { timeout: 15000 });
    // Leave the room (a plain reload within 15 s would correctly auto-resume it).
    await page.evaluate(() => localStorage.removeItem("pizzeria-drop-session"));
    await page.goto(url);
    await page.waitForFunction(() => window.dropStudio?.menu?.screen === "home", null, { timeout: 40000 });
    await page.click("#btn-join");
    assert(await page.isVisible("#join-name"));
    assert(await page.isVisible("#join-code"));
    await page.click("#join-back");
    await page.fill("#menu-name", "Parth");
    await page.click("#btn-quick");
    if (await page.isVisible("#controls-go")) await page.click("#controls-go");
    await page.waitForFunction(() => window.dropStudio.match?.phase === "active" && window.dropStudio.match.players.some((p) => p.bot), null, { timeout: 15000 });
    const ver = await page.evaluate((u) => fetch(new URL("version", u.endsWith("/") ? u : u + "/")).then((r) => r.json()), url);
    // Studio only on request.
    await page.goto(url + (url.endsWith("/") ? "" : "/") + "?studio=1");
    await page.waitForFunction(() => window.dropStudio?.match);
    assert(await page.isVisible("aside"), "studio available with ?studio=1");
    assert(/WORLD STUDIO/.test(await page.evaluate(() => document.body.innerText)));
    // A failed request only counts if that file never loaded (speculative preloads may 404 once).
    assert.deepEqual(errors.filter((e) => typeof e === "string" || !ok.has(e.name)).map((e) => e.text ?? e), []);
    results[label] = { earlyAsideDisplay: early, version, versionEndpoint: ver };
    console.log("PASS", label, JSON.stringify(results[label]));
    await page.close();
  }
  fs.writeFileSync("assets/reports/production-validation.json", JSON.stringify(results, null, 2));
  console.log("production entrypoint checks passed");
} finally {
  await browser.close();
  proxy.close();
  server.kill();
}
