# Pizzeria Drop

A stylized vertical tile-survival party game built with Three.js, Vite and a Node WebSocket server. Up to 15 pizzaiolos (humans plus optional bots) drop onto a tower of 5–10 square floors over a Volcano or a collapsing Cityscape. Every tile collapses 3 seconds after first contact. Grab a rocket launcher, aim at a rival on any floor (above, below or level) to lock instantly, and blow the floor out from under them. Rockets do no damage; the fall does the work. The last player standing is crowned the winner.

## Play modes

- **Host Game:** enter your name and create a room with a 5-character code (for example `P7K4Q`). Share it with **Copy Code** or **Share Link** (`…/?room=P7K4Q`). The host chooses map, difficulty, floors (5–10), lives, optional bots and bot skill.
- **Join Game:** enter your name and the room code, or open a shared link. Tap **Ready**; the host starts when every human is ready.
- **Quick Play:** play immediately against bots on this device, no server needed.

Up to 15 players in total (humans + bots). A human joining a full lobby replaces an optional bot. After a match, **Play Again** and **Return to Lobby** keep the same room and settings.

## Controls

### Desktop

| Input | Action |
| --- | --- |
| W A S D (or arrows) | Move (camera-relative) |
| Mouse drag | Camera / aim (yaw and pitch) |
| SPACE | Jump (high enough to climb back one floor) |
| E | Dive |
| Hold left mouse (or F) | Aim: reticle and tighter camera; aiming at a player locks instantly |
| Release left mouse | Fire at the locked player |
| ? / Controls button | Show the controls panel |

### Mobile (landscape)

| Input | Action |
| --- | --- |
| Left joystick | Move |
| Drag on the right side | Camera / aim (yaw and pitch) |
| JUMP / DIVE buttons | Jump / dive |
| Hold FIRE | Aim. Drag the FIRE thumb or the right side to look up, down and around; aiming at a player locks instantly |
| Release FIRE | Fire at the locked player |

FIRE is dimmed until you pick up a launcher, then glows with a `×2` / `×1` ammo badge. Desktop aim assist is light; mobile is slightly stronger. Assist only helps with targets already near the reticle.

### iPhone and full screen

iPhone Safari uses immersive viewport mode because element fullscreen is unavailable; installed Home Screen mode provides the cleanest app-like experience. Tapping **Full screen** on iPhone fixes the game to the full dynamic viewport (`100dvh`, safe areas respected) and shows a one-time tip to add Pizzeria Drop to the Home Screen. On desktop and other browsers that support it, the real Fullscreen API is used. When launched from the Home Screen the button is hidden. The game is designed for landscape; portrait shows a rotate prompt.

### Rocket rules

- Touch a launcher to auto-equip it: 2 shots. After the last shot it leaves your hands and respawns on a valid tile.
- Instant lock: a living player inside the reticle locks immediately (green reticle, outline, name, sound). Release to fire; releasing with no lock keeps your ammo.
- Rockets fly in 3D with smooth homing and dive into the target's supporting tiles: at most a compact 2x2 (4 tiles), no player damage.
- Intact floors block rockets (they break where they hit); gaps let them through.

## Local setup

Requires Node.js 20.19+ (developed on 22).

```sh
npm install          # install dependencies
npm run dev:server   # realtime server on :8787 (separate terminal; needed for Host/Join)
npm run dev          # Vite client on :5173; /ws and /health are proxied to :8787
npm run build        # production client bundle in dist/
npm start            # production: one process serves dist/, /ws, /health and /metrics on $PORT
```

Quick Play works without the realtime server. The normal entrypoint (`/`, or any mount path such as `/play/pizzeria-drop/`) always opens the game shell. The internal World Studio (asset inspection and legacy regression flows) is only reachable through `?studio=1` or the `/studio` route.

### Deploying (Staige or any Node host)

- **Build:** `npm ci && npm run build`
- **Start:** `npm start` (listens on `$PORT`; serves `dist/`, `/ws`, `/health`, `/metrics`, `/version`)
- All client URLs are relative to the page, so the app can be mounted at a sub-path. `GET /version` (and the label under the home menu) shows `{ version, commit, buildTime }`, which confirms which build is live.

### Environment

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | server | `8787` | HTTP + WebSocket port |
| `HOST` | server | `0.0.0.0` | Bind address |
| `STATIC_DIR` | server | `dist` | Built client to serve (SPA fallback) |
| `SOURCE_COMMIT` / `GIT_COMMIT` | build | `git rev-parse HEAD` | Commit shown in `/version` when the build has no `.git` |
| `ALLOWED_ORIGINS` | server | (any) | Comma-separated origins allowed to open `/ws` |
| `MAX_ROOMS` | server | `500` | Room cap per process |
| `VITE_GAME_SERVER_URL` | client build | same-origin `/ws` | Full `wss://…/ws` URL when the realtime server is on another origin |
| `SIM_LATENCY_MS`, `SIM_JITTER_MS` | server, tests only | `0` | Simulated network delay per direction |
| `ALLOW_TEST_HOOKS` | server, tests only | off | Debug commands for acceptance tests. Never enable in production. |

Production must be served over HTTPS so the client uses `wss://` (the URL is derived from the page protocol, never hard-coded).

### Tests

```sh
npm test                 # 34 gameplay tests + 15 server WebSocket tests + 15-GLB validation
npm run test:browser     # legacy desktop/touch, rocket and winner acceptance (dev server on :5173)
npm run build            # then, against the production build:
npm run test:multiplayer # 2 real browsers: host/join/ready/start/sync/winner/lobby, at 0/50/100/150 ms latency
npm run test:webkit      # iPhone-class WebKit: boot, render, touch, immersive mode, rotate, PWA, online join
npm run test:load        # 15 players (1 browser + 5 headless humans + 9 bots), 10 floors
npm run test:production  # `npm start` server: root and /play/pizzeria-drop mount show the game shell
```

Browser tests use the installed Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`) and Playwright WebKit (`npx playwright install webkit`).

### Assets

The generated runtime GLBs in `assets/characters`, `assets/props` and `assets/worlds` are committed, so the game runs without a rebuild. `npm run assets` regenerates them and needs the original Mixamo source FBX folders (`assets/Girl 1`, `assets/Guy 1`). Those are not in this repository for licensing and size reasons. `npm run icons` regenerates the PWA icons.

## Architecture

| Path | Responsibility |
| --- | --- |
| `src/gameplay.js` | Pure fixed-step (1/120 s) `Match`: tiles/timers, movement, hammers, launchers, instant lock, 3D rockets, floor line of sight, bots (skill profiles), lives, winner resolution. Used by both browser and server. |
| `server/index.js`, `server/room.js` | Authoritative realtime server: HTTP static + `/health` + `/metrics`, WebSocket rooms, lobby/ready/start, 120 Hz simulation, 20 Hz snapshots, input validation, reconnect grace, host migration |
| `src/net/protocol.js` | Shared constants, settings sanitising, compact snapshot encoding, join URLs |
| `src/net/connection.js` | Client WebSocket session: create/join/resume, timeouts, ping, reconnect |
| `src/net/net-match.js` | Client mirror of a server match: local prediction + reconciliation, remote interpolation, authoritative events |
| `src/ui/menu.js`, `src/ui/menu.css` | Main menu, join, lobby (desktop + phone layouts) |
| `src/main.js` | Renderer, quality profiles, world setup (including deep-tower shafts), sim→visual sync, aiming, celebration, game API for the menu |
| `src/hud.js`, `src/game.css`, `src/hud-v1.css` | HUD, mobile controls, fullscreen/immersive, rotate prompt, controls panel, results |
| `src/arena-depth.js`, `src/rocket-fx.js`, `src/winner-fx.js` | Deep shaft extension, pooled rocket and winner effects |
| `assets/runtime/*` | Procedural layout, characters, props and worlds |

Clients send intents only (movement, aim, jump, dive, hold/fire). The server owns room membership, settings, tile activation and destruction, pickups and ammo, rocket validation and impacts, eliminations, bots and the winner. Clients animate tile shake locally from server timestamps.

## Status

- Online rooms with humans plus optional bots, Quick Play, and winner/rematch flows work locally and are covered by automated multiplayer, latency, WebKit and load tests.
- Not yet validated on physical iPhone/Android hardware.
- Not yet deployed to Staige. No Staige SDK contract is integrated; the server is a single deployable Node process (see the handoff for deployment notes).

See [PIZZERIA_DROP_HANDOFF.md](PIZZERIA_DROP_HANDOFF.md) for status details and [PIZZERIA_DROP_BRAIN.md](PIZZERIA_DROP_BRAIN.md) for reusable engineering workflows.

## Licensing notes

Fonts are SIL OFL (see `public/licenses`). Character, crown and prop geometry is procedural and original. Six motion clips were retargeted from Mixamo source animations; the source FBXs are not redistributed here.
