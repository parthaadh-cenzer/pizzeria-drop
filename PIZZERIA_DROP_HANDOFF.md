# Pizzeria Drop — handoff

Updated October 7, 2026 (rocket aiming / controls completion pass). Project root: `G:/pizseria drop`. Local Three.js/Vite game and asset studio. **Not deployed to Staige. No multiplayer transport or backend.** Public repository: see "Deployment / repository status" below.

## Final control map

| Action | Desktop | Mobile (landscape) |
| --- | --- | --- |
| Move | WASD / arrows (camera-relative) | Left joystick |
| Camera / aim | Mouse drag (any button), yaw + pitch | Drag right side of screen, yaw + pitch; the thumb holding FIRE can also drag |
| Jump | SPACE | JUMP button |
| Dive | E | DIVE button |
| Aim / lock | Hold left mouse (F also works) | Hold FIRE |
| Fire | Release left mouse (only when LOCKED) | Release FIRE (only when LOCKED) |
| Controls help | `?` key or "? Controls" button (match banner and studio sidebar) | "? Controls" button |

Releasing before the lock completes does not fire and keeps ammo. The HUD flashes "NOT LOCKED — HOLD 2s ON A TARGET". This prevents the drag-to-look gesture from wasting shots. To allow unguided shots instead, change `releaseFire` in `src/gameplay.js`.

## Rocket implementation (this pass)

- **Pickup/ammo:** touching a launcher auto-equips it (2 shots). The held model is visible via hand IK. HUD shows `ROCKETS: 2` → `ROCKETS: 1`. After the final shot the launcher leaves the hands and the same instance respawns on a valid, non-hammer tile. Unsupported world launchers fall to lower floors; below the kill zone they respawn. Unchanged from the prior pass and covered by tests.
- **Aim mode:** while holding, `FollowCamera` switches to an over-the-shoulder camera: a converging view 14 m along the aim ray, shoulder offset 1.25–1.95 m growing with steepness, FOV 55→43. Aim pitch is separate from follow pitch and ranges from −1.15 (look up ≈66°) to +1.3 (look down ≈74°). Aim sensitivity is 0.7× normal. Aim pitch resets to level on each new aim.
- **Acquisition:** screen-space nearest living player within 55 m whose chest is inside the reticle cone: 56 px for mouse, 84 px for touch. The lock accumulates only while the same target stays in the cone. Leaving resets it to 0. Two seconds locks, with ring color, beep and nameplate outline.
- **Aim assist:** `aimAssist()` in `main.js` rotates yaw/aim-pitch toward the current or nearby target with exponential smoothing. Mouse: 72 px radius, strength 1.3/s. Touch: 120 px, 3.4/s. It never considers off-screen or out-of-range targets.
- **Launch:** muzzle = player chest + 0.45 m forward. The initial velocity points from the muzzle toward the point the reticle ray meets (first intact floor or 60 m out). It falls back to the direct target line if that points backwards. Speed 24 m/s.
- **Homing (`Match.rocketStep`):** each fixed step the heading rotates toward an aim point by at most 3.4 rad/s (9 rad/s in the terminal phase); there is no snapping. Aim point: target feet + 0.35 m. When the rocket is below the target's floor, it aims at the underside directly beneath the target. Within 2.2 m horizontally it enters a terminal dive into the target's supporting tiles.
- **Line of sight:** the segment for each step is tested against every floor slab (`Match.segmentHit`). It uses the tile top plane (y+0.15) when descending and the underside (y−0.5) when rising. Intact cells block; missing cells pass. On the target's own floor within 1.5 tile pitches of the target, the impact snaps to the target's footing (a hit). Elsewhere the struck floor breaks at the impact point (`obstruction: true`).
- **Destruction:** `Match.destroyAt(level, x, z)` removes the cell containing the point plus the neighbours toward the impact quadrant: a compact 2x2, at most 4 tiles. Missing or out-of-grid cells are skipped, never substituted. No HP exists.
- **HUD/visuals:** "FLOOR IN THE WAY" (orange reticle) when the muzzle→target path crosses an intact floor that is not the target's own floor. Impact flash shows "DIRECT HIT / FLOOR BLOCKED · N TILES". Pooled rocket meshes, 120-puff instanced smoke trail and impact flashes (`src/rocket-fx.js`). The scoped camera stays on while your own rocket flies. Own floor fades to 0.4 opacity when aiming steeply down; overhead floors stay at 0.13. This is visual only; collision is unchanged.
- **Onboarding:** a controls panel appears before the first match (countdown paused; `localStorage` key `pizzeria-drop-controls-seen`). The "? Controls" button and `?` key pause and reopen it; Escape closes. Touch devices show the touch list first and hide the desktop list. A contextual "ROCKET EQUIPPED" hint shows on pickup for 6 s the first time, then 2.6 s, and hides once the first lock completes.

## Validation evidence (this pass)

- `npm test`: **21 gameplay tests** (14 prior + 7 rocket: up-shot, down-through-gap, same floor, blocked by intact floor, LOS helper, ammo 2→1→0 with real flights, unlocked release keeps ammo) plus 15-GLB validation. All pass.
- `npm run test:browser` = `acceptance-browser.mjs` (prior regression: countdown/first-contact timer, WASD/Space/E, camera descent, auto-equip, lock reset, F hold/release 4 tiles, 8-clip grip IK, 15-actor City/Volcano, real CDP multi-touch, Jump/Dive, body removal) + `acceptance-rocket.mjs`. All pass on dev (5173) and production preview (5174) with zero console errors.
- `acceptance-rocket.mjs` uses **real input**: Playwright mouse down/move/up and CDP touch, with fixtures only for placement. Report: `assets/reports/rocket-browser-validation.json`. Screenshots: `rocket-*-locked/flight/impact.png`, `rocket-mobile-*`, `controls-panel-*.png`, `rocket-equipped-hint.png`.
  - A: below → look up (aim pitch ≈ −0.74) → lock → release. The rocket climbs and breaks the target's floor under the target.
  - B/E: above → look down (≈ +1.13) through a 2-cell gap. The rocket descends and breaks the lower target floor.
  - C: same floor, exactly 4 tiles, `ROCKETS: 2 → 1`.
  - D: an intact floor blocks the shot; the obstruction breaks and the lower floor is untouched; reticle warning shown.
  - F/G: 2 → 1 → 0; held launcher hidden; HUD returns to "FIND A LAUNCHER"; launcher respawned on a tile.
  - H: panel before the first match, countdown waits, "? Controls" reopens, Escape closes. Mobile panel fits 844×390 with a sticky button.
  - I: mobile hold FIRE + right-side drag aims up and down; lock + release fires both ways.
- Performance (local Chrome, 15 actors, short sample): City ≈5.6 ms median / 6.1 ms p95, 159 draw calls; Volcano ≈5.5 / 6.5 ms, 141 calls. Not a phone, Staige or network certification.
- Regression rules confirmed by tests: first-landing tile timer, square grids, Easy full / Medium–Hard intentional gaps, horizontal 360° hammer with impulse knockback, air steering, one-floor jump, lava elimination and 0.75 s body removal. Floor tracker and names still work. Both worlds load and run.
- Cityscape was checked against `Reference images/ChatGPT Image Oct 6, 2026, 09_41_50 PM.png`. It still reads as an urban sinkhole (rim roads, lit facades, scaffolds, barriers, traffic, deep cavity), not random boxes. Compared with the reference it is cooler in tone, with less warm glow and haze, and has no red steel trusses under the floors. That is optional art polish; nothing was rebuilt.

## Files changed this pass

`src/gameplay.js` (3D homing rockets, `segmentHit`/`lineOfSight`, `destroyAt`, `muzzle`, cancel event) · `src/follow-camera.js` (aim camera, `AIM_PITCH`) · `src/main.js` (acquisition profiles, aim assist, aim direction, blocked check, own-floor fade, pause, rocket FX, rocket-watch camera, controls panel wiring) · `src/controls.js` (pointer type, FIRE-thumb look) · `src/hud.js`, `src/game.css` (controls panel, ? button, hints, `ROCKETS: N`, warnings, target outline) · `src/rocket-fx.js` (new) · `index.html` (sidebar "? Controls") · `scripts/test-gameplay.mjs` (+7 tests) · `scripts/acceptance-rocket.mjs` (new) · `scripts/acceptance-browser.mjs` (skips the first-run panel) · `package.json` (`test:browser`, `test:rocket`) · `README.md`, `.gitignore`, this handoff, Brain.

## Known bugs / limitations

- Lock acquisition is screen-space and does not require line of sight. A target seen through a faded floor can be locked; the rocket will then hit that floor, and the HUD warns "FLOOR IN THE WAY". This is intentional.
- A target that jumps over a gap during the terminal dive can make the rocket continue to the floor below.
- The big mascot head fills the lower-left of the screen when aiming steeply. The reticle stays clear, but there is no local-player fade.
- Camera collision is analytic (cavity bounds + floor clamps), not mesh raycasts.
- Bots never pick up or use rockets. There is no player–player collision.
- Mobile was validated with Chrome touch emulation only. Physical iOS/Android, thermals and long sessions are unverified.
- No winner/rematch flow; a match continues until you exit or restart.

## Deployment / repository status

- Public GitHub repository: see the final report of this pass. Excluded from git: `node_modules`, `dist`, zips, the Mixamo source FBX folders (`assets/Girl 1`, `assets/Guy 1`) and the textures extracted from them. Committed GLBs are enough to run and build. Regenerating assets needs the FBX folders restored locally.
- **Staige:** no SDK, adapter, account configuration or deployment exists.
- **Networking:** none.

## Remaining integration work (in order)

1. Obtain the Staige integration contract; add an adapter around `Match` (keep pure tests).
2. Authoritative server: tile deadlines, launcher ownership/ammo, lock validation, rocket flight and impact (`rocketStep`/`destroyAt` are deterministic and portable), elimination; client input with timestamps; remote interpolation; winner/rematch lifecycle.
3. Physical phone QA (landscape iOS Safari / Android Chrome), aim-assist tuning on real thumbs, sustained 15-player profiling, optional quality tiers.
4. Optional: bot rocket usage, local-player fade while aiming, City art polish toward the reference (warm haze, red trusses).

## Continuation map

| Path | Responsibility |
| --- | --- |
| `src/gameplay.js` | Fixed-step Match state, contacts/timers, jump/dive, hammer impulse, launcher lifecycle, lock, 3D rockets, LOS, elimination |
| `src/main.js` | Renderer, studio UI, loading, sim→visual, aim acquisition/assist, fading, `window.dropStudio` debug surface |
| `src/controls.js` | Keyboard/mouse and independent touch pointers |
| `src/follow-camera.js` | Follow camera and aim camera |
| `src/hud.js`, `src/game.css` | HUD, controls panel, hints, names, floor counts, reticle/audio |
| `src/rocket-fx.js` | Pooled rocket/trail/flash visuals |
| `src/weapon-rig.js`, `src/traffic.js` | Hand IK; rim traffic and falling-car gag |
| `assets/runtime/*` | Layout, characters, props, City/Volcano generators, shaders |
| `scripts/*` | Asset build, validation, gameplay tests, browser acceptance |

## Commands

```sh
npm install
npm run dev -- --port 5173
npm test
npm run test:browser          # needs dev server on 5173 (or PREVIEW_URL)
npm run build
npm run preview -- --port 5174
npm run assets                # only with assets/Girl 1 and assets/Guy 1 restored
```

Chrome path for acceptance: `C:/Program Files/Google/Chrome/Application/chrome.exe`. Dev/preview servers may already be running; check before launching duplicates.

## Assets and provenance

Source FBXs (Mixamo) stay local in `assets/Girl 1` and `assets/Guy 1` and are not in the public repo. Six motions are retargeted at 24 Hz; landing/hit are authored. Character geometry is procedural and original. Rights to the source assets were not independently audited. References: `Reference images/ChatGPT Image Oct 6, 2026, 09_41_50 PM.png` (City) and `... 09_38_23 PM.png` (Volcano) guide style, not gameplay topology. Generated assets live in `assets/characters`, `assets/props`, `assets/worlds`; sizes/counts are in `assets/manifest.json`.
