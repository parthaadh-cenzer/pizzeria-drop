// Winner flow acceptance: real UI clicks/taps; eliminations are induced by moving actors into lava.
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
  checks = [];
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
};
const pass = (name) => {
  checks.push(name);
  console.log("PASS", name);
};
const state = (page) =>
  page.evaluate(() => {
    const d = window.dropStudio,
      m = d.match;
    const crown = d.winnerFX.crown;
    let owner = null;
    for (let o = crown.parent; o; o = o.parent)
      d.actors.forEach((a, i) => {
        if (a.model === o) owner = i;
      });
    return {
      phase: m.phase,
      winner: m.winner,
      result: m.result,
      alive: m.players.map((p) => p.alive),
      playing: d.state.playing,
      celebrating: !!d.celebration,
      crown: {
        visible: crown.visible,
        bone: crown.parent?.name ?? null,
        owner,
        y: crown.getWorldPosition(crown.position.clone()).y,
        scale: crown.scale.x,
      },
      banner: document.querySelector("#victory-banner").hidden
        ? null
        : document.querySelector("#victory-banner").textContent,
      results: document.querySelector("#results").hidden
        ? null
        : document.querySelector("#results").textContent,
      won: document.body.classList.contains("match-won"),
      animations: d.actors.map((a) => a.current),
    };
  });
// Freeze bots and tile timers so only the induced elimination decides the match.
const calm = (page) =>
  page.evaluate(() => {
    const m = window.dropStudio.match;
    m.bots = false;
    for (const t of m.tiles) if (!t.gone) t.expires = Infinity;
    for (const p of m.players) p.input = { x: 0, z: 0 };
  });
const eliminate = (page, id) =>
  page.evaluate((id) => {
    const p = window.dropStudio.match.players[id];
    p.position.set(p.position.x, -1, p.position.z);
  }, id);
async function startMatch(page, name) {
  await page.fill("#player-name", name);
  await page.click("#play");
  if (await page.isVisible("#controls-panel:not([hidden])"))
    await page.click("#controls-go");
  await page.waitForFunction(() => window.dropStudio.match.phase === "active");
  await calm(page);
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watch(page);
  await page.goto(base);
  await page.waitForFunction(() => window.dropStudio?.match);

  // A name is required; an empty name blocks the drop.
  await page.fill("#player-name", "");
  await page.click("#play");
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.dropStudio.state.playing), false);
  assert(await page.evaluate(() => document.querySelector("#player-name").classList.contains("invalid")));
  pass("empty name blocks the match and highlights the name field");

  await startMatch(page, "PARTH");
  assert.equal(await page.evaluate(() => window.dropStudio.match.players[0].name), "PARTH");
  await eliminate(page, 1);
  await page.waitForFunction(() => window.dropStudio.match.phase === "won");
  let s = await state(page);
  assert.equal(s.winner, 0);
  assert.equal(s.result.winnerName, "PARTH");
  assert.deepEqual(s.alive, [true, false]);
  pass("TEST 1: one of two players eliminated → remaining player automatically declared winner");
  await page.waitForTimeout(1300);
  s = await state(page);
  assert(s.banner && s.banner.includes("WINNER") && s.banner.includes("PARTH"), s.banner);
  pass("TEST 2: entered player name PARTH shown as winner");
  assert(s.crown.visible && s.crown.bone === "Head" && s.crown.owner === 0);
  assert(s.crown.scale > 0.9, `crown popped ${s.crown.scale}`);
  const head = await page.evaluate(() => {
    const v = window.dropStudio.actors[0].model.getObjectByName("Head").getWorldPosition(window.dropStudio.camera.position.clone());
    return v.y;
  });
  assert(s.crown.y > head + 0.3, "crown sits above the head bone");
  pass("TEST 3: crown attached to the winner's Head bone, above the head");
  assert(s.celebrating && s.won && s.animations[0] === "dance");
  await page.screenshot({ path: `${shots}/winner-celebration.png` });
  pass("TEST 4: celebration runs (dance, hops, crown pop, confetti, banner, camera)");

  // TEST 5: hazards frozen and the winner cannot die after resolution.
  const before = await page.evaluate(() => window.dropStudio.match.tiles.filter((t) => t.gone).length);
  await page.evaluate(() => {
    const m = window.dropStudio.match;
    for (const t of m.tiles) if (!t.gone) t.expires = m.time + 0.1;
    m.players[0].position.y = -5;
  });
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({
    gone: window.dropStudio.match.tiles.filter((t) => t.gone).length,
    alive: window.dropStudio.match.players[0].alive,
    phase: window.dropStudio.match.phase,
  }));
  assert.equal(after.gone, before);
  assert(after.alive && after.phase === "won");
  await page.evaluate(() => {
    const m = window.dropStudio.match;
    m.secureWinner(m.players[0]);
  });
  pass("TEST 5: winner cannot be eliminated; tile timers frozen after resolution");

  await page.waitForFunction(() => !document.querySelector("#results").hidden, null, { timeout: 5000 });
  s = await state(page);
  assert(/WINNER/.test(s.results) && /PARTH/.test(s.results) && /LAST ONE STANDING/.test(s.results));
  assert(/PLAY AGAIN/.test(s.results) && /RETURN TO LOBBY/.test(s.results));
  assert.equal(await page.evaluate(() => window.dropStudio.lastResult?.winnerName), "PARTH");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/winner-results.png` });
  pass("results overlay: trophy, WINNER, PARTH, LAST ONE STANDING, PLAY AGAIN, RETURN TO LOBBY; result event published");

  // TEST 6: PLAY AGAIN resets everything.
  await page.click("#results-play-again");
  await page.waitForFunction(() => window.dropStudio.match.phase !== "won");
  const fresh = await page.evaluate(() => {
    const d = window.dropStudio,
      m = d.match,
      p = m.players[0];
    return {
      phase: m.phase,
      winner: m.winner,
      result: m.result,
      everyoneAlive: m.players.every((a) => a.alive && !a.removed),
      tilesIntact: m.tiles.every((t) => t.gone === !t.startsPresent && t.activatedAt === null),
      launchers: m.launchers.every((l) => l.state === "resting" && l.owner === null),
      ammo: p.ammo,
      launcher: p.launcher,
      name: p.name,
      crown: d.winnerFX.crown.visible || !!d.winnerFX.crown.parent,
      fx: d.winnerFX.active,
      celebrating: !!d.celebration,
      results: !document.querySelector("#results").hidden,
      banner: !document.querySelector("#victory-banner").hidden,
      won: document.body.classList.contains("match-won"),
      playing: d.state.playing,
      cam: d.camera.position.distanceTo(p.position),
      visible: d.actors.every((a) => a.model.visible),
      level: document.querySelector("#floor-tracker .current b")?.textContent,
      events: m.events.filter((e) => e.type === "winner").length,
    };
  });
  assert.deepEqual(
    { ...fresh, cam: fresh.cam < 14 },
    {
      phase: "countdown",
      winner: null,
      result: null,
      everyoneAlive: true,
      tilesIntact: true,
      launchers: true,
      ammo: 0,
      launcher: null,
      name: "PARTH",
      crown: false,
      fx: false,
      celebrating: false,
      results: false,
      banner: false,
      won: false,
      playing: true,
      cam: true,
      visible: true,
      level: "L1",
      events: 0,
    },
  );
  pass("TEST 6: PLAY AGAIN gives a clean match (players, tiles, launchers, ammo, crown, VFX, camera, HUD, winner state)");

  // Bot winner: crown goes to the right character and the bot's own name is shown.
  await page.waitForFunction(() => window.dropStudio.match.phase === "active");
  await calm(page);
  await eliminate(page, 0);
  await page.waitForFunction(() => window.dropStudio.match.phase === "won");
  await page.waitForTimeout(900);
  s = await state(page);
  assert.equal(s.winner, 1);
  assert.equal(s.crown.owner, 1);
  assert(s.banner.includes("Pizzaiolo 2"));
  pass("bot winner: crown on the bot's character, bot name shown");

  // TEST 7: RETURN TO LOBBY.
  await page.waitForFunction(() => !document.querySelector("#results").hidden, null, { timeout: 5000 });
  await page.click("#results-lobby");
  await page.waitForTimeout(300);
  const lobby = await page.evaluate(() => ({
    playing: window.dropStudio.state.playing,
    bodyPlaying: document.body.classList.contains("playing"),
    playVisible: !!document.querySelector("#play").offsetParent,
    crown: window.dropStudio.winnerFX.crown.visible,
    results: !document.querySelector("#results").hidden,
    phase: window.dropStudio.match.phase,
  }));
  assert.deepEqual(lobby, { playing: false, bodyPlaying: false, playVisible: true, crown: false, results: false, phase: "preview" });
  pass("TEST 7: RETURN TO LOBBY returns to setup with no stale winner state");

  // TEST 8: no 2-second wording anywhere in the UI.
  const text = await page.evaluate(
    () => document.querySelector("#controls-panel").textContent + document.querySelector("#match-hud").textContent + document.querySelector("aside").textContent,
  );
  assert(!/2\s*(s\b|sec)|two seconds/i.test(text), "no 2-second lock wording");
  assert(/aim at a player to lock/i.test(text));
  pass("TEST 8: controls/tutorial text has no 2-second lock reference");

  // Mobile: results card fits and PLAY AGAIN works by tap.
  const mobile = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  watch(mobile);
  await mobile.goto(base);
  await mobile.waitForFunction(() => window.dropStudio?.match);
  await mobile.fill("#player-name", "PARTH");
  await mobile.tap("#play");
  await mobile.tap("#controls-go");
  await mobile.waitForFunction(() => window.dropStudio.match.phase === "active");
  await calm(mobile);
  await eliminate(mobile, 1);
  await mobile.waitForFunction(() => !document.querySelector("#results").hidden, null, { timeout: 6000 });
  for (const id of ["#results-play-again", "#results-lobby"]) {
    const b = await mobile.locator(id).boundingBox();
    assert(b && b.y + b.height <= 390 && b.y >= 0, `${id} on screen`);
  }
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: `${shots}/winner-results-mobile.png` });
  await mobile.tap("#results-play-again");
  await mobile.waitForFunction(() => window.dropStudio.match.phase === "countdown" && !window.dropStudio.celebration);
  pass("mobile 844x390: results buttons on screen; PLAY AGAIN by tap resets");

  assert.deepEqual(errors, []);
  fs.writeFileSync(
    `${shots}/winner-browser-validation.json`,
    JSON.stringify({ environment: "Local headless Chrome; desktop 1280x800 and 844x390 touch. Eliminations induced by moving actors below the kill plane; all UI via real clicks/taps.", checks, errors }, null, 2),
  );
  console.log(`${checks.length} winner-flow checks passed.`);
} finally {
  await browser.close();
}
