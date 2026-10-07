# Pizzeria Drop — handoff

Updated October 7, 2026 (instant lock + winner flow pass). Project root: `G:/pizseria drop`. Local Three.js/Vite game and asset studio. Public repo: https://github.com/parthaadh-cenzer/pizzeria-drop (branch `main`). **Not deployed to Staige. No multiplayer transport or backend.**

## Final control map

| Action | Desktop | Mobile (landscape) |
| --- | --- | --- |
| Move | WASD / arrows (camera-relative) | Left joystick |
| Camera / aim | Mouse drag (any button), yaw + pitch | Drag right side of the screen; the thumb holding FIRE can also drag |
| Jump | SPACE | JUMP button |
| Dive | E | DIVE button |
| Aim (instant lock) | Hold left mouse (F also works) | Hold FIRE |
| Fire | Release left mouse while locked | Release FIRE while locked |
| Controls help | `?` key or "? Controls" button | "? Controls" button |

Releasing with no lock does not fire and keeps ammo. The HUD flashes "NOT LOCKED — AIM AT A PLAYER, THEN RELEASE".

## Instant rocket lock (decision)

The 2-second lock was too slow for the pace of the game. `RULES.lockSeconds = 0`, so `Match.updateLock` locks on the first fixed step that a valid candidate is supplied. A valid candidate is a living other player whose chest projects inside the reticle cone (mouse 56 px, touch 76 px), is in front of the camera and is within 55 m. `RULES.lockGrace = 0.25` s keeps an existing lock through brief jitter, then drops it.

Feedback on lock:
- the reticle ring fills and turns green with a pop animation
- the target's nameplate is outlined
- the lock beep plays
- the reticle text reads `LOCKED · <name> · RELEASE TO FIRE` (or `FLOOR IN THE WAY`)

Aim assist: desktop is light (72 px radius, strength 1.0/s); touch is slightly stronger (104 px, 2.2/s). It never picks off-screen or distant players.

Targeting visibility: on screen, in range and in front. Floors are faded locally, so a target seen through a translucent floor can be locked, and the HUD warns when an intact floor will block the rocket. This preserves the intentional floor-obstruction mechanic.

Unchanged: auto-equip, 2 shots, 3D homing with terminal dive, floor line of sight, max 4-tile 2x2 destruction, zero player damage, launcher respawn and fall rules. Rocket details are in the Brain workflows.

## Winner flow

- **Detection (`Match.resolve`, end of every active step):** when at most one player is alive and the match has at least 2 players, phase becomes `won`.
  - `winner` is the id, or `null` for a draw when the final players are eliminated in the same step.
  - It also records `wonAt` and builds `result = { winner, winnerName, draw, placements, names, duration }`. Placements are the winner first, then reverse elimination order.
  - Emits `winner`.
- **Winner state:** projectiles cleared and holds cancelled. `secureWinner` puts the winner on its footing tile, or the nearest intact tile if airborne, sets them grounded and switches them to `dance`. While `won`, `step()` only updates eliminated-body removal. Tiles, timers, hammers, launchers, movement and lava checks are frozen, so the winner cannot die. `jump/dive/holdFire` are rejected and input is disabled in `main.js`.
- **Names:** the lobby has a required "YOUR NAME" field (max 14 characters, saved in `localStorage` key `pizzeria-drop-name`). `Match({ names })` uses it for player 0; bots are `Pizzaiolo N`. An empty name blocks the drop and highlights the field.
- **Presentation (local only, `main.js` `startCelebration`/`updateCelebration`):**
  - slow motion: visual time ramps from 0.3× to 1× over 0.9 s; the simulation is frozen
  - `FollowCamera.celebrate` eases into a slow orbit framing the winner's head from the side the camera was already on
  - the winner turns toward the camera, plays the existing `dance` clip with decaying hops, and the held launcher is hidden
  - crown pop; 60 + 36 pieces of confetti from a 96-instance pool; 24 orbiting sparkles
  - gold screen vignette, fanfare (4 WebAudio notes) and a `WINNER / <name>` banner
  - at 3.2 s, a results card shows 🏆, WINNER, the name, "LAST ONE STANDING", top-5 placements, PLAY AGAIN and RETURN TO LOBBY
  - a draw shows "DRAW / NO ONE STANDING" with no crown
- **Crown (`src/winner-fx.js`):** procedural, baked into 3 vertex-colored meshes: gold band, five tipped points, red/blue jewels. One instance is created at startup and re-parented to the winner's `Head` bone, so it follows animation. It is never part of the character GLB. `reset()` detaches and hides it.
- **Rematch/reset:** PLAY AGAIN calls `requestRematch()`, which in local mode runs `begin()`. That rebuilds the world through `setupWorld()`: new `Match`, new actors, tiles, launchers and hammers, rocket FX reset, `endCelebration()` (crown detached, VFX cleared, overlays hidden, `match-won` class removed), HUD reset and `follow.reset()`. RETURN TO LOBBY calls `returnToLobby()` → `setupWorld()` without playing. `onMatchResult()` stores `window.dropStudio.lastResult` and dispatches `pizzeria:match-result`. These are the seams for a networked rematch/lobby.

## Validation evidence (this pass, dev 5173 and production preview 5174)

- `npm test`: **27 gameplay tests** + 15-GLB validation.
  - New this pass: instant lock/grace/self/dead rejection; release without lock keeps ammo; named last-player-standing with placements; bot winner; winner immune and hazards frozen; airborne winner secured on a tile; draw; clean new Match.
- `npm run test:browser` runs three scripts. All pass with zero console errors on dev and production:
  - **`acceptance-browser.mjs`** (prior regression): countdown/first-contact timer, WASD/Space/E, camera descent, auto-equip, lock grace reset, F hold/release 4 tiles, 8-clip grip IK, 15-actor City/Volcano, real CDP multi-touch, Jump/Dive, body removal.
  - **`acceptance-rocket.mjs`** (8 checks, real mouse and CDP touch): asserts the lock is already set in the same sample that acquires the target (lock time under 0.25 s) for same floor, above, below, and touch up/down. Also covers blocked floor, gap shot, ammo 2→1→0, onboarding text with no 2-second wording, and the hint "Aim at a player to lock".
  - **`acceptance-winner.mjs`** (12 checks, real clicks/taps):
    - an empty name blocks the drop
    - TEST 1 auto-winner; TEST 2 "PARTH" shown; TEST 3 crown on the winner's `Head` bone above the head; TEST 4 dance + celebration
    - TEST 5 winner survives being moved into lava and tile timers stay frozen
    - results card content and the published result event
    - TEST 6 PLAY AGAIN gives a clean state: phase, winner, all alive, tiles, launchers, ammo, name, crown, VFX, overlays, camera, floor tracker
    - bot winner gets the crown on the correct character
    - TEST 7 RETURN TO LOBBY; TEST 8 no 2-second wording
    - mobile 844×390 results buttons on screen and PLAY AGAIN by tap
  - Screenshots: `winner-celebration.png`, `winner-results.png`, `winner-results-mobile.png`, `rocket-*`. Reports: `*-browser-validation.json`.
- Performance (local Chrome, 15 actors): City about 5.5 ms median, 162 draw calls; Volcano about 5.6 ms, 146 calls. Winner VFX add 2 instanced draws and 3 crown meshes only during a celebration.
- `npm run build` succeeds (≈734 kB JS, 190 kB gzip).

## Files changed this pass

`src/gameplay.js` (instant lock + grace, names, `resolve`/`secureWinner`, won phase, eliminations, result) · `src/main.js` (name field, celebration, slow motion, results/rematch/lobby seams, aim-assist tuning) · `src/winner-fx.js` (new) · `src/follow-camera.js` (`celebrate`, shared `constrain`) · `src/hud.js`, `src/game.css` (lock text/feedback, victory banner, results card, fanfare, name field) · `index.html` (YOUR NAME field) · `scripts/test-gameplay.mjs` (+6 net tests) · `scripts/acceptance-winner.mjs` (new) · `scripts/acceptance-rocket.mjs`, `scripts/acceptance-browser.mjs` (instant lock, name seeding) · `package.json` (`test:browser` includes winner, `test:winner`) · README, this handoff, Brain.

## Known bugs / limitations

- Lock acquisition is screen-space and does not require line of sight (intentional; HUD warns). A target jumping over a gap during the terminal dive can make the rocket continue to the floor below.
- The celebration uses the existing `dance` clip plus procedural hops. There is no dedicated victory clip.
- The draw case has no special camera beyond the normal follow.
- Bots never use rockets; there is no player–player collision; camera collision is analytic.
- Mobile was validated with Chrome touch emulation only. Physical iOS/Android, thermals and long sessions are unverified.

## Deployment / repository status

- GitHub: public repo `parthaadh-cenzer/pizzeria-drop`, branch `main`.
- Excluded from git: `node_modules`, `dist`, zips, Mixamo source FBX folders (`assets/Girl 1`, `assets/Guy 1`) and textures extracted from them. Committed GLBs are enough to run and build.
- **Staige:** no SDK, adapter or deployment. **Networking:** none.

## Remaining integration work (in order)

1. Obtain the Staige integration contract; wrap `Match` in an adapter (keep pure tests).
2. Authoritative server: tile deadlines, launcher ownership/ammo, lock validation, rocket flight/impact, elimination and `resolve()` on the server. Clients receive the `winner` event/result and drive the local celebration. Replace `requestRematch()`/`returnToLobby()` with networked rematch voting and lobby return.
3. Matchmaking, remote interpolation, reconnect handling.
4. Physical phone QA and aim-assist tuning on real thumbs; sustained 15-player profiling.
5. Optional: bot rocket usage, local-player fade while aiming, City art polish (warm haze, red trusses), a dedicated victory clip.

## Continuation map

| Path | Responsibility |
| --- | --- |
| `src/gameplay.js` | Fixed-step Match: contacts/timers, movement, hammers, launchers, instant lock, 3D rockets, LOS, elimination, winner resolution/result |
| `src/main.js` | Renderer, studio/lobby UI, sim→visual, aim acquisition/assist, fading, celebration, rematch/lobby seams, `window.dropStudio` |
| `src/controls.js` | Keyboard/mouse and independent touch pointers |
| `src/follow-camera.js` | Follow, aim and celebration cameras |
| `src/hud.js`, `src/game.css` | HUD, controls panel, hints, names, floor counts, reticle/audio, victory banner, results |
| `src/rocket-fx.js`, `src/winner-fx.js` | Pooled rocket visuals; crown, confetti, sparkles |
| `src/weapon-rig.js`, `src/traffic.js` | Hand IK; rim traffic |
| `assets/runtime/*` | Layout, characters, props, worlds, shaders |
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

Chrome path for acceptance: `C:/Program Files/Google/Chrome/Application/chrome.exe`.

## Assets and provenance

Source FBXs (Mixamo) stay local and are not in the public repo. Six motions are retargeted at 24 Hz; landing/hit are authored. Character, crown and prop geometry are procedural and original. Source-asset rights were not independently audited. The reference images in `Reference images/` guide style, not gameplay topology.
