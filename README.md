# Pizzeria Drop

A stylized vertical tile-survival party game prototype built with Three.js and Vite. Two mascot pizzaiolos drop onto three stacked square floors over a Volcano or a collapsing Cityscape. Every tile collapses 3 seconds after first contact. Grab a rocket launcher, lock onto a rival on any floor (above, below or level) and blow the floor out from under them. Rockets do no damage; the fall does the work. The last player standing wins.

Matches currently run locally with simulated bot opponents. **Networking and Staige deployment are still pending.**

## Controls

### Desktop

| Input | Action |
| --- | --- |
| W A S D (or arrows) | Move (camera-relative) |
| Mouse drag | Camera / aim (yaw and pitch) |
| SPACE | Jump (high enough to climb back one floor) |
| E | Dive |
| Hold left mouse (or F) | Aim: reticle, tighter camera, lock-on |
| Release left mouse | Fire, once the 2-second lock completes |
| ? / "? Controls" button | Show the controls panel |

### Mobile (landscape)

| Input | Action |
| --- | --- |
| Left joystick | Move |
| Drag on the right side | Camera / aim (yaw and pitch) |
| JUMP / DIVE buttons | Jump / dive |
| Hold FIRE | Aim and lock. Drag the FIRE thumb or the right side to look up, down and around |
| Release FIRE | Fire, once locked |

Mobile has slightly stronger aim assist than desktop. Assist only helps targets already near the reticle and never picks distant or off-screen players.

### Rocket rules

- Touch a launcher to auto-equip it: **2 shots** (`ROCKETS: 2` then `ROCKETS: 1`). After the last shot the launcher leaves your hands and respawns on a valid tile.
- Keep a living player inside the reticle for **2 seconds** to lock. If they leave, the lock resets. Release to fire. Releasing before the lock completes keeps your ammo.
- Rockets fly in full 3D with smooth homing. Near the target they dive into its supporting tiles and break a compact **2x2** (at most 4 tiles; missing tiles are never replaced by others).
- Intact floors block rockets. The rocket breaks up to 4 tiles where it hits. Gaps let rockets pass through to other floors.

## Local setup

Requires Node.js 20+ (developed on 22).

```sh
npm install          # install dependencies
npm run dev          # development server at http://127.0.0.1:5173
npm run build        # production bundle in dist/
npm run preview      # serve the production bundle
```

### Tests

```sh
npm test             # 21 deterministic gameplay tests + validation of the 15 generated GLBs
npm run test:browser # Chrome acceptance: desktop + real CDP multi-touch, rocket scenarios (dev server must be running)
npm run test:rocket  # rocket aiming/lock/LOS acceptance only
```

Browser acceptance uses the installed Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Set `PREVIEW_URL` to test another server (for example, the production preview).

### Asset regeneration

The generated runtime GLBs in `assets/characters`, `assets/props` and `assets/worlds` are committed, so the game runs without a rebuild. `npm run assets` regenerates them. It needs the original Mixamo source FBX motion folders (`assets/Girl 1`, `assets/Guy 1`). Those are **not** in this repository for licensing and size reasons. Restore them locally before regenerating.

## Architecture

| Path | Responsibility |
| --- | --- |
| `src/gameplay.js` | Pure fixed-step (1/120 s) `Match` state: tiles and timers, movement/jump/dive, hammers, launcher lifecycle, lock-on, 3D homing rockets, floor line of sight, elimination |
| `src/main.js` | Renderer, world/studio UI, asset loading, simulation-to-visual sync, reticle acquisition, aim assist, local floor fading |
| `src/controls.js` | Keyboard/mouse and independent multi-pointer touch input |
| `src/follow-camera.js` | Damped follow camera and over-the-shoulder aim camera with a wide pitch range |
| `src/hud.js`, `src/game.css` | HUD, controls panel, contextual hints, names, floor tracker, reticle |
| `src/rocket-fx.js` | Pooled rocket meshes, smoke trail and impact flashes |
| `src/weapon-rig.js` | Two-bone hand IK for the held launcher |
| `src/traffic.js` | Rim traffic and the falling-car gag |
| `assets/runtime/*` | Procedural generators for layout, characters, props, City/Volcano worlds and shaders |
| `scripts/*` | Asset build, GLB validation, gameplay tests, browser acceptance |

The simulation owns every rule outcome (tile deadlines, ammo, rocket impacts, elimination). Rendering and input only read snapshots or submit intents. That keeps rules testable in Node and gives future server authority a single source.

## Status

- Playable locally on desktop and in mobile browsers (emulated touch verified; physical phones not yet certified).
- Two worlds (Volcano, Cityscape), Easy/Medium/Hard, 2–15 local actors.
- **Pending:** network multiplayer (authoritative server, matchmaking, remote interpolation, winner/rematch flow), Staige SDK integration and deployment, bot weapon use, physical-device performance QA.

See [PIZZERIA_DROP_HANDOFF.md](PIZZERIA_DROP_HANDOFF.md) for detailed status and [PIZZERIA_DROP_BRAIN.md](PIZZERIA_DROP_BRAIN.md) for reusable engineering workflows.

## Licensing notes

Fonts are SIL OFL (see `public/licenses`). Character geometry is procedural and original. Six motion clips were retargeted from Mixamo source animations. The source FBXs are not redistributed here.
