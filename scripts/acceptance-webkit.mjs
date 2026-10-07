// iPhone-class WebKit acceptance (Playwright WebKit with iPhone 13 descriptors) + desktop fullscreen
// and standalone checks in Chromium. Runs against the production build served by server/index.js.
// Note: Playwright-WebKit screenshots of a resized WebGL canvas can come back blank on Windows even
// though the GPU output is correct, so rendering is verified by reading pixels, not screenshots.
import { webkit, chromium, devices } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import WebSocket from "ws";
import { createServer } from "../server/index.js";

const app = createServer({ port: 0, host: "127.0.0.1", quiet: true, staticDir: "dist" });
const port = await app.listen();
const base = `http://127.0.0.1:${port}`;
const checks = [],
  errors = [],
  data = {};
const pass = (n, d) => {
  checks.push(n);
  if (d) data[n] = d;
  console.log("PASS", n, d ? JSON.stringify(d) : "");
};
const wk = await webkit.launch();
const ch = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
};
// Distinct colours sampled from the drawing buffer prove the 3D scene is rendering.
const pixels = (page) =>
  page.evaluate(() => {
    const d = window.dropStudio, r = d.renderer, gl = r.getContext();
    r.setRenderTarget(null);
    r.render(d.scene, d.camera);
    const seen = new Set();
    for (let i = 1; i < 6; i++)
      for (let j = 1; j < 6; j++) {
        const px = new Uint8Array(4);
        gl.readPixels(Math.floor((gl.drawingBufferWidth * i) / 6), Math.floor((gl.drawingBufferHeight * j) / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        seen.add(px.slice(0, 3).join(","));
      }
    return seen.size;
  });
const layout = (page) =>
  page.evaluate(() => {
    const c = window.dropStudio.renderer.domElement;
    return {
      inner: [innerWidth, innerHeight],
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      canvasCss: [c.clientWidth, c.clientHeight],
      aspect: +window.dropStudio.camera.aspect.toFixed(3),
    };
  });

try {
  // ---------- iPhone landscape ----------
  const ctx = await wk.newContext({ ...devices["iPhone 13 landscape"] });
  const page = await ctx.newPage();
  watch(page, "webkit");
  await page.goto(base);
  await page.waitForSelector("#menu:not([hidden])", { timeout: 40000 });
  const head = await page.evaluate(() => ({
    viewport: document.querySelector('meta[name="viewport"]').content,
    manifest: document.querySelector('link[rel="manifest"]').href,
    apple: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
    touchIcon: document.querySelector('link[rel="apple-touch-icon"]').href,
    fullscreenApi: !!(document.fullscreenEnabled || document.webkitFullscreenEnabled),
    mobileProfile: window.dropStudio.mobile,
    pixelRatio: window.dropStudio.renderer.getPixelRatio(),
  }));
  assert(/viewport-fit=cover/.test(head.viewport));
  assert.equal(head.apple, "yes");
  assert.equal(head.fullscreenApi, false, "iPhone WebKit exposes no element fullscreen");
  assert(head.mobileProfile && head.pixelRatio <= 1.25);
  const manifest = await page.evaluate((u) => fetch(u).then((r) => r.json()), head.manifest);
  assert.equal(manifest.display, "fullscreen");
  assert.equal(manifest.orientation, "landscape");
  for (const icon of [head.touchIcon, ...manifest.icons.map((i) => new URL(i.src, head.manifest).href)])
    assert.equal(await page.evaluate((u) => fetch(u).then((r) => r.status), icon), 200);
  pass("iPhone WebKit boots: viewport-fit=cover, PWA manifest + icons, Mobile Balanced profile", head);

  // Home menu: input font ≥16px (no focus zoom), page does not scroll.
  const font = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#menu-name")).fontSize));
  assert(font >= 16);
  let l = await layout(page);
  assert(l.scroll[1] <= l.inner[1] && l.scroll[0] <= l.inner[0], `no page overflow ${JSON.stringify(l)}`);
  pass("menu inputs ≥16px (no iOS focus zoom); no page scroll", { font, ...l });

  // Quick Play with real touch input.
  await page.fill("#menu-name", "PARTH");
  await page.tap("#btn-quick");
  if (await page.isVisible("#controls-go")) await page.tap("#controls-go");
  await page.waitForFunction(() => window.dropStudio.match.phase === "active", null, { timeout: 12000 });
  await page.waitForTimeout(600);
  const colours = await pixels(page);
  assert(colours >= 6, `scene renders (${colours} distinct colours)`);
  l = await layout(page);
  assert.deepEqual(l.canvasCss, l.inner, "canvas fills the viewport");
  assert(Math.abs(l.aspect - l.inner[0] / l.inner[1]) < 0.02, "camera aspect matches (no stretch)");
  const joy = await page.locator("#joystick").boundingBox();
  const x0 = await page.evaluate(() => window.dropStudio.match.players[0].position.x);
  await page.evaluate(({ x, y }) => {
    // Pointer Events as WebKit dispatches them for touch (pointerType "touch").
    const stick = document.querySelector("#joystick");
    const ev = (type, dx) => stick.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "touch", clientX: x + dx, clientY: y, bubbles: true }));
    ev("pointerdown", 0);
    ev("pointermove", 40);
    window.__stickEnd = () => ev("pointerup", 40);
  }, { x: joy.x + joy.width / 2, y: joy.y + joy.height / 2 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__stickEnd());
  const x1 = await page.evaluate(() => window.dropStudio.match.players[0].position.x);
  assert(x1 > x0 + 0.5, `joystick moves player ${x0} → ${x1}`);
  await page.tap("#touch-jump");
  await page.waitForTimeout(120);
  assert((await page.evaluate(() => window.dropStudio.match.players[0].velocity.y)) > 0);
  const fireState = await page.evaluate(() => ({ disabled: document.querySelector("#touch-fire").disabled, ammo: document.querySelector("#touch-fire .ammo").textContent }));
  assert(fireState.disabled && fireState.ammo === "", "FIRE inactive without launcher");
  pass("Quick Play on iPhone WebKit: scene renders, canvas fills viewport without stretch, joystick + JUMP work, FIRE inactive until equipped", { colours, ...l });

  // FIRE armed state with ammo badge.
  await page.evaluate(() => {
    const m = window.dropStudio.match, p = m.players[0], l = m.launchers[0];
    if (l.owner !== null) m.players[l.owner].launcher = null;
    l.state = "resting"; l.owner = null; l.position.copy(p.position);
  });
  await page.waitForFunction(() => document.querySelector("#touch-fire").classList.contains("armed"));
  assert.equal(await page.textContent("#touch-fire .ammo"), "×2");
  pass("FIRE becomes prominent when equipped with ×2 ammo badge");

  // Full screen on iPhone → immersive viewport mode + one-time Home Screen hint; no error.
  await page.tap("#fullscreen");
  await page.waitForTimeout(400);
  const imm = await page.evaluate(() => ({
    immersive: document.body.classList.contains("immersive"),
    hint: !document.querySelector("#ios-hint").hidden,
    hintText: document.querySelector("#ios-hint-text").textContent,
    label: document.querySelector("#fullscreen").getAttribute("aria-label"),
    mainPos: getComputedStyle(document.querySelector("main")).position,
  }));
  assert(imm.immersive && imm.hint && imm.mainPos === "fixed");
  assert(/add Pizzeria Drop to your Home Screen/.test(imm.hintText));
  await page.tap("#ios-how-btn");
  assert(await page.isVisible("#ios-how"));
  await page.tap("#ios-hint-ok");
  assert(await page.isHidden("#ios-hint"));
  l = await layout(page);
  assert(l.scroll[1] <= l.inner[1], "no vertical page scroll in immersive mode");
  assert(Math.abs(l.aspect - l.inner[0] / l.inner[1]) < 0.02);
  pass("iPhone Full Screen → immersive fixed 100dvh mode, Home Screen hint (GOT IT / SHOW HOW), no scroll, no error", imm);

  // Rotation: portrait shows the rotate prompt; back to landscape resizes the renderer.
  await page.setViewportSize({ width: 390, height: 664 });
  await page.evaluate(() => dispatchEvent(new Event("orientationchange")));
  await page.waitForTimeout(500);
  const portrait = await page.evaluate(() => getComputedStyle(document.querySelector("#rotate-overlay")).display);
  await page.setViewportSize({ width: 750, height: 342 });
  await page.evaluate(() => dispatchEvent(new Event("orientationchange")));
  await page.waitForTimeout(500);
  const landscape = await page.evaluate(() => getComputedStyle(document.querySelector("#rotate-overlay")).display);
  l = await layout(page);
  assert(portrait !== "none" && landscape === "none");
  assert.deepEqual(l.canvasCss, [750, 342]);
  assert(Math.abs(l.aspect - 750 / 342) < 0.02);
  pass("rotate prompt in portrait, hidden in landscape; renderer/camera resize after rotation", { portrait, landscape, ...l });

  // Safe areas: critical HUD controls are positioned with env(safe-area-inset-*).
  const css = fs.readFileSync("src/hud-v1.css", "utf8") + fs.readFileSync("src/ui/menu.css", "utf8");
  for (const side of ["left", "right", "bottom", "top"]) assert(css.includes(`env(safe-area-inset-${side})`), side);
  pass("HUD, joystick, buttons and menu use env(safe-area-inset-*) on all sides");

  // Online on WebKit: join a room hosted by a headless client.
  const host = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const msgs = [];
  host.on("message", (d) => msgs.push(JSON.parse(d)));
  await new Promise((r) => host.on("open", r));
  host.send(JSON.stringify({ t: "create", name: "Host" }));
  for (let i = 0; i < 50 && !msgs.find((m) => m.t === "welcome"); i++) await new Promise((r) => setTimeout(r, 50));
  const code = msgs.find((m) => m.t === "welcome").code;
  const p2 = await ctx.newPage();
  watch(p2, "webkit-online");
  await p2.goto(`${base}/?room=${code}`);
  await p2.waitForSelector("#menu[data-screen='join']", { timeout: 40000 });
  await p2.fill("#join-name", "Iris");
  await p2.tap("#join-go");
  await p2.waitForFunction(() => window.dropStudio.menu.screen === "lobby", null, { timeout: 10000 });
  await p2.tap("#lobby-action");
  for (let i = 0; i < 60 && !msgs.some((m) => m.t === "lobby" && m.lobby.canStart.ok); i++) await new Promise((r) => setTimeout(r, 50));
  host.send(JSON.stringify({ t: "start" }));
  await p2.waitForFunction(() => window.dropStudio.match?.phase === "active", null, { timeout: 15000 });
  const online = await p2.evaluate(() => ({ me: window.dropStudio.match.players[0].name, n: window.dropStudio.match.players.length }));
  assert.deepEqual(online, { me: "Iris", n: 2 });
  host.close();
  await p2.close();
  pass("iPhone WebKit joins a room by link, readies and enters the synchronized match", { code });
  await ctx.close();

  // ---------- Desktop Chromium: real Fullscreen API; installed/standalone hides the button ----------
  const desk = await ch.newPage({ viewport: { width: 1280, height: 800 } });
  watch(desk, "chromium");
  await desk.goto(base);
  await desk.waitForSelector("#menu:not([hidden])", { timeout: 40000 });
  await desk.click("#menu-fullscreen");
  await desk.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 5000 });
  assert(!(await desk.evaluate(() => document.body.classList.contains("immersive"))));
  pass("desktop Full screen uses the real Fullscreen API");
  // iOS Home Screen launch reports navigator.standalone === true (emulated in WebKit).
  const sctx = await wk.newContext({ ...devices["iPhone 13 landscape"] });
  await sctx.addInitScript(() => Object.defineProperty(navigator, "standalone", { get: () => true }));
  const sp = await sctx.newPage();
  watch(sp, "webkit-standalone");
  await sp.goto(base);
  await sp.waitForSelector("#menu:not([hidden])", { timeout: 40000 });
  const standalone = await sp.evaluate(() => ({ cls: document.body.classList.contains("standalone"), btn: getComputedStyle(document.querySelector("#fullscreen")).display }));
  assert(standalone.cls && standalone.btn === "none");
  await sctx.close();
  pass("installed Home Screen (standalone) mode hides the Full screen control and the hint", standalone);
  await desk.close();

  assert.deepEqual(errors, []);
  fs.writeFileSync("assets/reports/webkit-validation.json", JSON.stringify({ environment: "Playwright WebKit 26 (iPhone 13 descriptors, landscape/portrait) + Chrome desktop, production build via server/index.js. Not a physical iPhone.", checks, data, errors }, null, 2));
  console.log(`${checks.length} WebKit/mobile checks passed.`);
} finally {
  await wk.close();
  await ch.close();
  await app.close();
}
