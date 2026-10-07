# Pizzeria Drop — handoff

Updated October 7, 2026 (V1: multiplayer rooms, iPhone/WebKit compatibility, mobile UX). Project root: `G:/pizseria drop`. Public repo: https://github.com/parthaadh-cenzer/pizzeria-drop (branch `main`). **Not deployed to Staige yet.**

## Production entrypoint fix (Staige showed the old World Studio)

**Root cause:** `index.html` contained the World Studio markup as static HTML, and JavaScript only hid it after the bundle ran. The Vite build emitted root-absolute URLs (`/assets/index-*.js`, `/assets/*.css`), and GLBs were loaded from `/assets/...`. When the game is mounted under a path (for example `/play/pizzeria-drop`), those requests go to the platform's domain root and 404. The bundle never runs, so the static World Studio markup is what appears. This was reproduced exactly with a prefix proxy: 404s for `/assets/index-*.js/.css`, then the World Studio text. At `/` on `npm start` the menu worked, which is why it passed locally.

**File responsible:** `index.html`, combined with Vite's default `base: "/"` and the absolute GLB path in `src/main.js`.

**Service worker / PWA:** not a factor. No service worker was ever shipped (only a manifest). As a guard, the page now unregisters any service worker registered by an earlier deployment. `index.html` and `/version` are served `no-cache`/`no-store`; hashed assets are immutable.

**Fixes:**
- An early inline script sets a mount-aware `<base>` (and normalises `/play/pizzeria-drop` to `/play/pizzeria-drop/`).
- An inline style hides all studio UI unless `?studio=1` or `/studio` is used, even if JS fails.
- Vite `base: "./"`; GLBs and the WebSocket URL are resolved from `document.baseURI`.
- The server serves static files with any forwarded prefix and accepts `…/ws`.
- `/version` plus a small build label (version · commit) under the home menu.
- After 20 s without the bundle, the page shows a "could not load" message instead of a stale UI.

**Evidence:** `npm run test:production` starts the real `npm start` server and opens `/` and `/play/pizzeria-drop` behind a prefix proxy. Both show HOST GAME / JOIN GAME / QUICK PLAY with no studio, before or after JS; host lobby settings, an 8-floor bot match, the join screen and Quick Play work; `?studio=1` opens the studio. Screenshots: `assets/reports/production-root.png`, `production-mounted.png`.

**Staige:** BUILD `npm ci && npm run build` · START `npm start` · env `PORT` (provided by host). Optional: `VITE_GAME_SERVER_URL` (only if the realtime server is on a different origin; build time), `ALLOWED_ORIGINS`, `SOURCE_COMMIT` (build-time commit label if `.git` is absent), `MAX_ROOMS`. Do not set `ALLOW_TEST_HOOKS` or `SIM_*`.

## iPhone root cause (investigated, not guessed)

Reproduced with Playwright WebKit 26 using iPhone 13 descriptors (portrait and landscape) against the dev and production builds.

WebGL2 is available, shaders compile, and the renderer produces exactly the same pixels as Chromium (`readPixels` comparison). The engine was not the failure. The iPhone problems were platform and UX defects:

1. **Full screen did nothing.** iPhone Safari has no element Fullscreen API (`requestFullscreen` and `fullscreenEnabled` are undefined), so `requestFullscreen?.()` silently no-op'd.
2. **Desktop layout on a phone.** The studio sidebar took 260 px of a 750×342 landscape viewport, the game area was about 490 px wide, and the controls were small. Portrait overflowed and scrolled (696 px of content in 664 px).
3. **Focus zoom.** The name input was 14 px, so iOS zoomed the page on focus and left it zoomed.
4. **No `viewport-fit=cover` or safe-area handling, and `svh`-only sizing.** There was no `dvh`, and the canvas was not re-measured on `visualViewport` resize or orientation change.
5. **Fragile pointer capture.** `setPointerCapture` throws when a pointer has already ended, which aborts the input handler. This was found by the WebKit tests and is now best-effort.
6. **Newer-syntax risk.** The build target was Vite's default (Safari 16.4+); it is now `safari15`/`es2020`.

Also noted: Playwright-WebKit screenshots of a resized WebGL canvas can come back blank on Windows even though rendering is correct, so WebKit tests verify rendering by reading pixels.

**Fixes:**
- **Viewport and PWA:** `viewport-fit=cover`, `dvh` with fallbacks, safe-area insets on every edge, and a fixed, non-scrolling page.
- **Inputs:** 16–18 px fields to stop focus zoom.
- **Fullscreen:** platform-aware. The real Fullscreen API is used where it exists, from the direct gesture. On iPhone the button switches on immersive mode plus a one-time "add to Home Screen" hint (GOT IT / SHOW HOW). In Home Screen (standalone) launches the button is hidden.
- **PWA files:** `manifest.webmanifest` (fullscreen, landscape) with Apple meta tags and icons.
- **Orientation:** a rotate prompt in portrait.
- **Performance:** a Mobile Balanced quality profile.
- **Input:** best-effort pointer capture.

> iPhone Safari uses immersive viewport mode because element fullscreen is unavailable; installed Home Screen mode provides the cleanest app-like experience. Safari's own toolbar cannot be removed programmatically in a normal tab, so immersive mode is not claimed to be native fullscreen.

**Still needed:** a physical iPhone (and Android) pass. All iPhone evidence comes from WebKit emulation.

## Final flow

Open game → **Home** (name; Host Game / Join Game / Quick Play) → **Lobby** → host Start → countdown 3-2-1-DROP → match → winner celebration → results → **Play Again** / **Return to Lobby** (same room, same settings, ready flags reset; Play Again also marks you ready).

- **Join:** name plus room code; a `?room=CODE` link prefills the code. Clear errors for not found, already started, room full, server unreachable (8 s timeout) and connection lost. There is never an infinite "connecting" state.
- **Lobby (host controls):**
  - map: Volcano / Cityscape
  - difficulty: Easy / Medium / Hard
  - floors: 5–10 stepper, default 7, labelled "FLOORS: 7"
  - lives: Off / On (3 lives)
  - bots: Off / On
  - bot count: 0 to remaining capacity
  - bot skill: Easy / Medium / Hard

  Everyone sees the player list with HOST, BOT, READY / NOT READY and RECONNECTING badges, and can pick a character. Bots are always ready. Start is enabled only when every non-host human is ready and the total is at least 2.
- **Quick Play:** local Match against bots with sensible defaults (Easy, 5 floors, 5 medium bots) and no server. Its Return to Lobby opens a local lobby with the same settings UI.
- **Studio:** `?studio=1` keeps the original sidebar studio and the legacy regression flows.

## Multiplayer architecture

- **One deployable Node process** (`server/index.js`) serves `dist/`, `GET /health`, `GET /metrics` and WebSocket rooms on `/ws`. Rooms live in memory, with 5-character codes from an unambiguous alphabet.
- **Authority:** the server runs the same pure `Match` (`src/gameplay.js`) at 120 Hz fixed steps on a 60 Hz loop and broadcasts 20 Hz snapshots. It owns membership, host, settings, ready state, start, tile activation and destruction, player state, pickups and ammo, rocket validation and impact, bots, lives and the winner.
- **Client intents:** clients send `input` at 30 Hz (move vector, lock candidate, aim direction, facing), plus `jump` (buffered 150 ms on the server), `dive`, `hold`, `fire` and `cancel`.
- **Lock and fire validation:** `Match.plausibleTarget` requires the target to be alive, within 60 m and within 0.75 rad of the claimed aim. Ammo, ownership and impacts are decided on the server.
- **Canonical config:** at start the server sends the config (map, difficulty, floors, lives, bot skill, seed, ordered players). Clients build the same layout; the seed reproduces launcher placement.
- **Tiles:** `tile-activated` events carry the server timestamp; clients animate shake from it locally and apply `tile-destroyed` events. Nothing per-frame is sent for tiles.
- **Snapshots:** compact array rows rounded to 2 decimals, about 2 KB for 15 players, plus incremental events with sequence numbers. Each client's snapshot includes `ack`/`ackAge` for reconciliation.
- **Client mirror (`NetMatch`, a Match subclass):**
  - The local seat is swapped to index 0, so the renderer and HUD are unchanged.
  - **Prediction and reconciliation:** the local player is predicted with the same physics once the server confirms a landing. The client compares against its own position at the acked input's send time plus `ackAge`, smooths small errors (deadzone 0.12 m) and adopts the server state for errors over 2.5 m.
  - **Remotes:** interpolated 100 ms behind, with up to 150 ms extrapolation.
  - **Lock:** instant locally for feedback.
- **Reconnect:** a 15 s grace window. A token is stored in localStorage, so a refresh auto-resumes the same seat and identity and a mid-match refresh rebuilds the world from the start message plus a tile diff. In a match, the character stays and stands still during grace; after grace it is eliminated. A heartbeat closes dead sockets.
- **Host leaves:** permanently leaving the lobby migrates host to the next human. During a match the simulation never depends on any browser. A room with no humans left closes.
- **Humans before bots:** a human joining at capacity removes one host-added bot. A human is never replaced by a bot.
- **Settings races:** host edits carry a revision number and the client ignores stale echoes (this fixed a real race found at 100–150 ms latency).
- **Safety:** an 8 KB message cap, a 90 msg/s input flood guard, name sanitising, an optional origin allow-list, and test hooks only with `ALLOW_TEST_HOOKS=1`.

## Floors, lives, bots

- **Floors:** `layout(..., floors)` generates exactly 1–10 levels from a fixed top (19.4 m) with 7.6 m spacing, so the one-floor jump rule is unchanged. The kill plane is the bottom level minus 4.7 m. Lobby floors are 5–10; studio and old tests keep 3. Deeper towers move Volcano lava and City's `deep_city` section down and add a merged shaft extension (`src/arena-depth.js`) whose camera-facing half fades in the overview.
- **Lives:** genuinely implemented (no longer "not implemented"). With lives ON (3), a kill-zone contact costs a life; the player is hidden for 1.6 s, then drops onto a safe tile on the highest intact floor. The launcher is dropped and respawns. The final life eliminates. A ♥ pill shows the remaining lives.
- **Bots:** the same physics and rules as humans. Skill changes only reaction time (0.85 / 0.55 / 0.32 s), hazard look-ahead, path noise, search radius, jump reliability and a preference for untouched tiles. Bots do not use rockets: they pick up launchers by walking over them but never fire.

## Mobile UX (design pass)

- **Menus:** dedicated phone landscape layouts. Home has the brand on the left and the card on the right. The lobby has a left rail (room code, COPY/SHARE, tabs MATCH / PLAYERS / CHARACTER, large READY/START) and a scrollable panel on the right. Targets are at least 44 px and inputs 18 px.
- **Match HUD (phones):**
  - top-left pills (players left, FLOOR n/N, lives) and icon buttons (Controls, Full screen, Exit)
  - a semi-transparent 132 px joystick that fades when idle
  - a right-thumb cluster: JUMP 74 px, DIVE 60 px, FIRE 92 px, with icons and pressed states
  - FIRE is grey when unarmed and glows orange with a `×2`/`×1` badge when armed; aiming and locked states have their own styles
  - the weapon panel and floor list are hidden; desktop keeps them
- **Mobile Balanced profile** (automatic on coarse-pointer devices of 1024 px or less): pixel ratio capped at 1.25, 1024 px shadow map, bloom off with exposure 1.22. Characters, tiles and lava shaders are unchanged; the volcano lava stays bright.

## Validation evidence (all local; production build unless noted)

- `npm test`: **34 gameplay** tests, **15 server WebSocket** tests and 15-GLB validation. The gameplay tests add floors 5–10, deep-floor jump and lava, lives, human/bot slots, bot skill, seeded launchers and aim validation. The server tests cover:
  - room code; not_found / started errors
  - identical settings and floor clamping
  - capacity with bot replacement
  - ready gate; canonical config; tile event sync
  - server movement; exclusive pickup; fire validation
  - reconnect; winner sync; return to lobby; host migration; health
- `npm run test:browser` (dev server): legacy desktop/touch regression, 8 rocket checks and 12 winner checks, all with zero errors. Desktop gameplay is not regressed.
- `npm run test:multiplayer`: **30 checks**, a full scenario at 0 ms plus repeats at 50±15, 100±30 and 150±40 ms. Host desktop and guest touch phone use real browsers and real UI.
  - Lobby: identical settings and player list.
  - Match setup: ready → start → same 5-floor Cityscape match.
  - Movement: visible remotely with no teleports (max 0.08–0.15 m per 25 ms sample) and 0 local hard corrections at every latency.
  - Tiles: identical activation timestamps, collapsing for both clients.
  - Pickups and winner: exclusive pickup; winner synced; return to lobby keeps the room and settings.
  - Recovery: refresh resumes the same identity; an unknown room shows an error.
- `npm run test:webkit`: **10 checks** on iPhone 13 WebKit:
  - boot, viewport-fit, manifest and icons, Mobile profile
  - no page scroll; inputs of 16 px or more
  - Quick Play rendering verified by pixels; canvas fills the viewport without stretch; joystick and JUMP work
  - FIRE ×2 armed state
  - Full screen → immersive mode and hint
  - portrait rotate prompt and resize on rotation
  - safe areas
  - WebKit joining an online room
  - desktop real Fullscreen API
  - standalone hides the button
- `npm run test:load` (15 players: 1 Chrome + 5 headless humans + 9 hard bots, Cityscape Hard, 10 floors, 20 s):
  - server tick 0.21 ms median / 0.69 ms p95 / 2.4 ms max against a 16.7 ms budget
  - about 26 KB/s down per client; about 2 KB snapshots at 20 Hz
  - server RSS about 104 MB
  - browser 5.6 ms median / 6.9 ms p95 frame, 70 draw calls, 1.07 M triangles, 32 MB JS heap
  - 0 reconciliation corrections
- Reports: `assets/reports/multiplayer-validation.json`, `webkit-validation.json`, `load-test.json`, plus `v1-*.png` screenshots (menu, lobby desktop/phone, play phone, results, deep towers).

## Files changed this pass

- **New:** `server/index.js`, `server/room.js`, `src/net/protocol.js`, `src/net/connection.js`, `src/net/net-match.js`, `src/ui/menu.js`, `src/ui/menu.css`, `src/ui/icons.js`, `src/hud-v1.css`, `src/arena-depth.js`, `public/manifest.webmanifest`, `public/icons/*`, `scripts/test-server.mjs`, `scripts/acceptance-multiplayer.mjs`, `scripts/acceptance-webkit.mjs`, `scripts/load-test.mjs`, `scripts/make-icons.mjs`.
- **Modified:**
  - `src/gameplay.js`: floors, bot slots/skill, lives, seed, aim validation, event sequence numbers.
  - `assets/runtime/layout.js`: `levelsFor`, `killYFor`.
  - `src/main.js`: studio mode, quality profile, local/net/preview matches, depth adaptation, game API, routed result buttons, iOS resize.
  - `src/hud.js`: new HUD markup, fullscreen/immersive, pills, FIRE states, change-only DOM writes, seq-based events.
  - `src/controls.js`: best-effort capture, joystick active state.
  - `src/follow-camera.js`: per-match levels.
  - `src/rocket-fx.js`: seq-based events.
  - `index.html`: viewport-fit, PWA/Apple meta.
  - `vite.config.js`: dev proxy, Safari 15 target.
  - `package.json`: `ws`, scripts, engines.
  - Legacy acceptance scripts: `?studio=1`.
  - README, this handoff, Brain.

## Known bugs / limitations

- **Hardware:** no physical iPhone or Android validation yet (WebKit emulation only); real-device thermals and battery are unknown.
- **Single process:** rooms are in memory in one process. Horizontal scaling needs sticky routing by room code, or a shared room registry.
- **Reconnect:** a resume after the 15 s grace window cannot rejoin a running match; it shows an error and returns to Home.
- **Bots:** they never fire rockets.
- **Camera:** collision remains analytic.
- **Draw rule:** the last players falling in the same server tick is a draw.
- **Remote lock indicators:** remote players' lock rings are not shown; only the local player's lock is visible.

## Staige deployment requirements

- **Build and run:** `npm ci && npm run build && npm start`. Node 20.19+. One process; listen on `$PORT`. TLS must be terminated by the host so the client connects with `wss://` (derived from the page protocol). If Staige hosts the client and realtime server on different origins, build the client with `VITE_GAME_SERVER_URL=wss://<realtime-host>/ws` and set `ALLOWED_ORIGINS` on the server.
- **Health and metrics:** `GET /health` returns `{ ok, protocol, uptime, rooms, humans, matches }`; `GET /metrics` returns per-room tick and traffic stats.
- **WebSocket path:** `/ws`, with an 8 KB max message size and ping every 10 s.
- **Join links:** `?room=CODE`. Staige can supply its own base URL (`joinUrl(code, base)`) or route `/play/pizzeria-drop?room=CODE` to this app (unknown paths serve `index.html`).
- **No machine-specific paths:** none at runtime. `G:/` appears only in documentation.
- **Not done:** the Staige SDK/account contract (identity, matchmaking, analytics) is not integrated. Integrate it at `src/ui/menu.js` (name/identity), `server/room.js` (room lifecycle) and `onMatchResult` in `src/main.js` (results).

## Remaining work (in order)

1. Physical iPhone (Safari tab and Home Screen) and Android Chrome pass; tune joystick size and aim assist on real thumbs; check thermals over 10+ minute sessions.
2. Staige integration: deploy the single process behind TLS, wire identity and the join URL, add results reporting.
3. Scale-out plan if needed: sticky routing by room code or a shared registry; add graceful-drain on deploys.
4. Optional: bots that use rockets, remote lock indicators, local-player fade while aiming, City art polish toward the reference.

## Commands

```sh
npm install
npm run dev:server            # realtime server :8787
npm run dev                   # client :5173 (proxies /ws)
npm test                      # gameplay + server + GLB validation
npm run test:browser          # legacy suites (needs dev server)
npm run build
npm run test:multiplayer      # production build, 2 browsers, latency matrix
npm run test:webkit           # needs: npx playwright install webkit
npm run test:load
npm start                     # production single process
```

## Assets and provenance

Source FBXs (Mixamo) stay local and are not in the public repo. Character, crown, prop, shaft and icon geometry are procedural and original. Source-asset rights were not independently audited. The reference images guide style only.
