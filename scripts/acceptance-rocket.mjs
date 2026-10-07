// Rocket aiming acceptance with real input: Playwright mouse/keyboard and CDP touch events.
// Fixtures only place actors/tiles; aiming, locking and firing go through the real controls.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:5173";
const shots = "assets/reports";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const errors = [],
  checks = [],
  results = {};
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
};
const pass = (name, data) => {
  checks.push(name);
  if (data) results[name] = data;
  console.log("PASS", name);
};

// Place shooter/target, keep tile timers frozen, optionally cut gap cells, put a launcher at the shooter.
async function fixture(page, { me, them, gaps = [] }) {
  await page.evaluate(
    ({ me, them, gaps }) => {
      const { match: m, follow } = window.dropStudio;
      const L = m.data.levels;
      m.bots = false;
      m.phase = "active";
      m.winner = null;
      m.result = null;
      m.countdown = -1;
      m.projectiles.length = 0;
      for (const t of m.tiles) {
        t.gone = !t.startsPresent;
        t.state = t.gone ? "gone" : "stable";
        t.activatedAt = null;
        t.expires = Infinity;
      }
      for (const [level, gx, gz] of gaps)
        m.destroy(m.tileIndex.get(`${level}/${gx}/${gz}`));
      m.events.length = 0;
      window.__freeze ??= setInterval(() => {
        for (const t of window.dropStudio.match.tiles)
          if (!t.gone) {
            t.expires = Infinity;
            t.activatedAt = null;
          }
      }, 50);
      m.players.forEach((a, i) => {
        const [x, level, z] = i === 0 ? me : them;
        a.alive = true;
        a.removed = false;
        a.position.set(x, L[level] + 0.15, z);
        a.velocity.set(0, 0, 0);
        a.grounded = true;
        a.support = m.tileAt(level, x, z);
        a.input = { x: 0, z: 0 };
        if (i > 0) a.position.x += 0;
      });
      const p = m.players[0];
      if (p.launcher === null) {
        const l = m.launchers.find((l) => l.state !== "equipped");
        l.state = "resting";
        l.owner = null;
        l.tile = p.support;
        l.position.copy(p.position);
      }
      follow.yaw = 0;
      follow.pitch = 0.2;
    },
    { me, them, gaps },
  );
  await page.waitForFunction(
    () => window.dropStudio.match.players[0].launcher !== null,
  );
  await page.waitForTimeout(350);
}
// Screen offset (px) of target chest from the reticle center, plus lock state.
const aimState = (page) =>
  page.evaluate(() => {
    const { match: m, camera, follow } = window.dropStudio;
    const t = m.players[1],
      v = t.position.clone();
    v.y += 1.1;
    v.project(camera);
    const w = innerWidth,
      h = innerHeight,
      p = m.players[0];
    return {
      dx: (v.x * w) / 2,
      dy: (-v.y * h) / 2,
      aimPitch: follow.aimPitch,
      lock: { ...p.lock },
      ammo: p.ammo,
      blocked: document
        .querySelector("#aim-reticle")
        .classList.contains("blocked"),
      reticle: document
        .querySelector("#aim-reticle")
        .classList.contains("active"),
    };
  });
// Move the view like a player would: nudge toward the target until it sits in the reticle.
async function steer(page, move) {
  let s;
  for (let i = 0; i < 80; i++) {
    s = await aimState(page);
    if (process.env.DEBUG_AIM) console.log(i, Math.round(s.dx), Math.round(s.dy), s.aimPitch.toFixed(2));
    if (s.lock.target === 1) break;
    await move(
      Math.max(-40, Math.min(40, s.dx * 0.45)),
      Math.max(-40, Math.min(40, s.dy * 0.45)),
    );
    await page.waitForTimeout(40);
  }
  assert.equal(s.lock.target, 1, `target acquired in reticle ${JSON.stringify(s)}`);
  // Instant lock: the same sample that sees the target in the reticle is already locked.
  assert(s.lock.locked, "locked immediately on acquisition");
  assert(s.lock.seconds < 0.25, `lock time ${s.lock.seconds}`);
  return aimState(page);
}
// After release, sample the rocket path and wait for its impact.
async function flight(page, shotName) {
  const path = [];
  for (let i = 0; i < 60; i++) {
    const r = await page.evaluate(() => {
      const m = window.dropStudio.match;
      return {
        pos: m.projectiles[0]?.position.toArray() ?? null,
        hit: m.events.find((e) => e.type === "rocket-impact") ?? null,
      };
    });
    if (r.pos) path.push(r.pos.map((n) => +n.toFixed(2)));
    if (i === 3 && shotName)
      await page.screenshot({ path: `${shots}/${shotName}` });
    if (r.hit) return { path, hit: r.hit };
    await page.waitForTimeout(30);
  }
  throw new Error("rocket never impacted");
}
const supportId = (page, level, x, z) =>
  page.evaluate(
    ({ level, x, z }) => window.dropStudio.match.tileAt(level, x, z).id,
    { level, x, z },
  );

async function desktopShot(page, name, setup) {
  await fixture(page, setup);
  await page.mouse.move(640, 400);
  let mx = 640,
    my = 400;
  await page.mouse.down();
  const s = await steer(page, async (dx, dy) => {
    mx += dx;
    my += dy;
    await page.mouse.move(mx, my, { steps: 2 });
  });
  await page.screenshot({ path: `${shots}/rocket-${name}-locked.png` });
  const ammoBefore = s.ammo;
  await page.mouse.up();
  const f = await flight(page, `rocket-${name}-flight.png`);
  const ammoAfter = await page.evaluate(
    () => window.dropStudio.match.players[0].ammo,
  );
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${shots}/rocket-${name}-impact.png` });
  return { ...f, aimPitch: s.aimPitch, blocked: s.blocked, ammoBefore, ammoAfter };
}

try {
  // H: discoverability on a fresh profile.
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watch(page);
  await page.goto(base);
  await page.waitForFunction(() => window.dropStudio?.match);
  await page.fill("#player-name", "PARTH");
  await page.click("#play");
  await page.waitForSelector("#controls-panel:not([hidden])");
  const panel = await page.textContent("#controls-panel");
  for (const s of ["W A S D", "Mouse drag", "SPACE", "Hold LMB", "Release LMB", "Dive"])
    assert(panel.includes(s), `panel lists ${s}`);
  assert(!/2 seconds|2s\b/i.test(panel), "no 2-second lock wording");
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(() => window.dropStudio.match.phase),
    "countdown",
    "countdown waits on controls panel",
  );
  await page.screenshot({ path: `${shots}/controls-panel-desktop.png` });
  await page.click("#controls-go");
  await page.waitForFunction(() => window.dropStudio.match.phase === "active");
  await page.click("#controls-open");
  await page.waitForSelector("#controls-panel:not([hidden])");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#controls-panel", { state: "hidden" });
  pass("H: controls panel before first match, persistent ? Controls button, Escape closes");

  const L = await page.evaluate(() => window.dropStudio.match.data.levels);
  // C: same floor.
  const cSupport = await supportId(page, 0, 0, -4.7);
  await fixture(page, { me: [0, 0, 4.7], them: [0, 0, -4.7] });
  const hint = await page.evaluate(() => ({
    hidden: document.querySelector("#rocket-hint").hidden,
    text: document.querySelector("#rocket-hint").textContent,
    status: document.querySelector("#weapon-status").textContent,
    held: window.dropStudio.actors[0].weapon.visible,
  }));
  assert(!hint.hidden && /ROCKET EQUIPPED/.test(hint.text) && /Aim at a player to lock/i.test(hint.text) && !/second/i.test(hint.text));
  assert(/ROCKETS: 2/.test(hint.status));
  assert(hint.held);
  await page.screenshot({ path: `${shots}/rocket-equipped-hint.png` });
  pass("auto-equip on touch, held launcher visible, ROCKET EQUIPPED hint, HUD ROCKETS: 2");
  const C = await desktopShot(page, "same-floor", { me: [0, 0, 4.7], them: [0, 0, -4.7] });
  assert.equal(C.hit.level, 0);
  assert(!C.hit.obstruction && C.hit.tiles.includes(cSupport));
  assert.equal(C.hit.tiles.length, 4);
  assert.equal(C.ammoBefore, 2);
  assert.equal(C.ammoAfter, 1);
  assert(/ROCKETS: 1/.test(await page.textContent("#weapon-status")));
  pass("C: same-floor real mouse hold → instant lock → release; target 2x2 destroyed; ROCKETS 2 → 1", C);

  // D: intact floor blocks (shooter on top floor, target below, no gap). Final shot.
  const D = await desktopShot(page, "blocked", { me: [0, 0, 1.3], them: [0, 1, -2.35] });
  assert(D.aimPitch > 0.5, `looked down (aimPitch ${D.aimPitch})`);
  assert(D.blocked, "reticle warns floor in the way");
  assert.equal(D.hit.level, 0);
  assert(D.hit.obstruction);
  assert(D.hit.tiles.length >= 1 && D.hit.tiles.length <= 4);
  assert(
    await page.evaluate(() =>
      window.dropStudio.match.tiles.filter((t) => t.level === 1).every((t) => !t.gone),
    ),
  );
  const after = await page.evaluate(() => ({
    ammo: window.dropStudio.match.players[0].ammo,
    launcher: window.dropStudio.match.players[0].launcher,
    held: window.dropStudio.actors[0].weapon.visible,
    status: document.querySelector("#weapon-status").textContent,
    respawned: window.dropStudio.match.launchers.every(
      (l) => l.state !== "resting" || (l.tile && !l.tile.gone),
    ),
  }));
  assert.equal(after.ammo, 0);
  assert.equal(after.launcher, null);
  assert.equal(after.held, false);
  assert(/FIND A LAUNCHER/.test(after.status));
  assert(after.respawned);
  pass("D: intact floor blocks downward rocket at the obstruction; lower floor untouched", D);
  pass("F/G: ammo 2 → 1 → 0; launcher leaves the hands after the final shot and respawns on a tile");

  // A: shooter below looks up.
  const aSupport = await supportId(page, 0, 0, -2.35);
  const A = await desktopShot(page, "upward", { me: [0, 1, 4.7], them: [0, 0, -2.35] });
  assert(A.aimPitch < -0.35, `looked up (aimPitch ${A.aimPitch})`);
  assert(A.path.at(-1)[1] > A.path[0][1] + 4, "rocket rose");
  assert.equal(A.hit.level, 0);
  assert(!A.hit.obstruction && A.hit.tiles.includes(aSupport));
  pass("A: below → look up → lock → fire; rocket climbs and breaks target floor under target", A);

  // B/E: shooter above looks down through a gap.
  const bSupport = await supportId(page, 1, 0, -2.35);
  const B = await desktopShot(page, "downward-gap", {
    me: [0, 0, 1.3],
    them: [0, 1, -2.35],
    gaps: [
      [0, 0, 0],
      [0, 0, -1],
    ],
  });
  assert(B.aimPitch > 0.5, `looked down (aimPitch ${B.aimPitch})`);
  assert(B.path.at(-1)[1] < B.path[0][1] - 4, "rocket descended");
  assert.equal(B.hit.level, 1);
  assert(!B.hit.obstruction && B.hit.tiles.includes(bSupport));
  pass("B/E: above → look down through a gap → lock → fire; rocket descends to the lower target floor", B);

  // I: mobile landscape with real CDP touches.
  const mobile = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  watch(mobile);
  await mobile.goto(base);
  await mobile.waitForFunction(() => window.dropStudio?.match);
  await mobile.fill("#player-name", "PARTH");
  await mobile.click("#play");
  await mobile.waitForSelector("#controls-panel:not([hidden])");
  assert(await mobile.isVisible(".cp-touch"));
  assert(!(await mobile.isVisible(".cp-desktop")));
  await mobile.screenshot({ path: `${shots}/controls-panel-mobile.png` });
  await mobile.tap("#controls-go");
  await mobile.waitForFunction(() => window.dropStudio.match.phase === "active");
  const cdp = await mobile.context().newCDPSession(mobile);
  const box = await mobile.locator("#touch-fire").boundingBox();
  const fire = { id: 3, x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 3, radiusY: 3, force: 1 };
  const touchShot = async (name, setup) => {
    await fixture(mobile, setup);
    // Thumb starts at the opposite screen edge from the drag direction (up-shot: bottom).
    let look = { id: 2, x: 500, y: setup.them[1] < setup.me[1] ? 380 : 12, radiusX: 3, radiusY: 3, force: 1 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [fire] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [fire, look] });
    const s = await steer(mobile, async (dx, dy) => {
      look = { ...look, x: look.x + dx * 0.8, y: Math.max(2, Math.min(388, look.y + dy * 0.8)) };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [fire, look] });
    });
    await mobile.screenshot({ path: `${shots}/rocket-mobile-${name}-locked.png` });
    // Lift the look thumb, then release FIRE to launch.
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [fire] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const f = await flight(mobile, `rocket-mobile-${name}-flight.png`);
    return { ...f, aimPitch: s.aimPitch };
  };
  const mUp = await touchShot("upward", { me: [0, 1, 4.7], them: [0, 0, -2.35] });
  assert(mUp.aimPitch < -0.35 && mUp.hit.level === 0 && !mUp.hit.obstruction);
  const mDown = await touchShot("downward-gap", {
    me: [0, 0, 1.3],
    them: [0, 1, -2.35],
    gaps: [
      [0, 0, 0],
      [0, 0, -1],
    ],
  });
  assert(mDown.aimPitch > 0.5 && mDown.hit.level === 1 && !mDown.hit.obstruction);
  assert.equal(
    await mobile.evaluate(() => window.dropStudio.gameControls.lastPointerType),
    "touch",
  );
  pass("I: mobile hold FIRE + right-side drag aims up and down; instant lock + release fires both ways", {
    up: { aimPitch: mUp.aimPitch, hit: mUp.hit },
    down: { aimPitch: mDown.aimPitch, hit: mDown.hit },
  });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${shots}/rocket-browser-validation.json`,
    JSON.stringify(
      {
        environment:
          "Local headless Chrome; desktop 1280x800 real mouse input; 844x390 real CDP touch events. Fixtures place actors/gaps and freeze tile timers; aiming/locking/firing use real input.",
        checks,
        results,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(`${checks.length} rocket browser checks passed.`);
} finally {
  await browser.close();
}
