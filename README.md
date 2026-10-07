# Pizzeria Drop

A stylized vertical tile-survival party game prototype built with Three.js and Vite. Two mascot pizzaiolos drop onto three stacked square floors over a Volcano or a collapsing Cityscape. Every tile collapses 3 seconds after first contact. Grab a rocket launcher, aim at a rival on any floor (above, below or level) to lock instantly, and blow the floor out from under them. Rockets do no damage; the fall does the work. The last player standing is crowned the winner.

Matches currently run locally with simulated bot opponents. **Networking and Staige deployment are still pending.**

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
| ? / "? Controls" button | Show the controls panel |

### Mobile (landscape)

| Input | Action |
| --- | --- |
| Left joystick | Move |
| Drag on the right side | Camera / aim (yaw and pitch) |
| JUMP / DIVE buttons | Jump / dive |
| Hold FIRE | Aim. Drag the FIRE thumb or the right side to look up, down and around; aiming at a player locks instantly |
| Release FIRE | Fire at the locked player |

Desktop aim assist is light; mobile is slightly stronger. Assist only helps targets already near the reticle and never picks distant or off-screen players.

### Rocket rules

- Touch a launcher to auto-equip it: **2 shots** (`ROCKETS: 2` then `ROCKETS: 1`). After the last shot the launcher leaves your hands and respawns on a valid tile.
- **Instant lock:** hold fire and put a living player in the reticle; the lock happens immediately (reticle turns green, target outlined, name shown, lock sound). It survives a 0.25 s wobble, then drops if the player leaves. Release to fire. Releasing with no lock keeps your ammo.
- Rockets fly in full 3D with smooth homing. Near the target they dive into its supporting tiles and break a compact **2x2** (at most 4 tiles; missing tiles are never replaced by others).
- Intact floors block rockets. The rocket breaks up to 4 tiles where it hits. Gaps let rockets pass through to other floors.

### Winning

Enter your name in the lobby ("YOUR NAME"; it's required and remembered). When only one player is left alive the match resolves instantly: hazards, tile timers and rockets freeze so the winner can't be eliminated afterwards. A short celebration follows: slow motion, the camera swings to the winner, a gold crown pops onto their head, a dance with hops, confetti and sparkles, and a WINNER banner with the winner's name. Then a results card shows **PLAY AGAIN** (fresh match, same settings) and **RETURN TO LOBBY**. If the last players fall in the same instant the match is a draw.

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
npm test             # 27 deterministic gameplay tests + validation of the 15 generated GLBs
npm run test:browser # Chrome acceptance: regression, rocket and winner flow (dev server must be running)
npm run test:rocket  # rocket aiming/instant lock/LOS acceptance only
npm run test:winner  # winner, crown, celebration, play again, lobby
```

Browser acceptance uses the installed Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Set `PREVIEW_URL` to test another server (for example, the production preview).

### Asset regeneration

The generated runtime GLBs in `assets/characters`, `assets/props` and `assets/worlds` are committed, so the game runs without a rebuild. `npm run assets` regenerates them. It needs the original Mixamo source FBX motion folders (`assets/Girl 1`, `assets/Guy 1`). Those are **not** in this repository for licensing and size reasons. Restore them locally before regenerating.

## Architecture

| Path | Responsibility |
| --- | --- |
| `src/gameplay.js` | Pure fixed-step (1/120 s) `Match` state: tiles and timers, movement/jump/dive, hammers, launcher lifecycle, instant lock-on, 3D homing rockets, floor line of sight, elimination, last-player-standing resolution and match result |
| `src/main.js` | Renderer, world/studio UI, asset loading, simulation-to-visual sync, reticle acquisition, aim assist, local floor fading |
| `src/controls.js` | Keyboard/mouse and independent multi-pointer touch input |
| `src/follow-camera.js` | Damped follow camera and over-the-shoulder aim camera with a wide pitch range |
| `src/hud.js`, `src/game.css` | HUD, controls panel, contextual hints, names, floor tracker, reticle |
| `src/rocket-fx.js` | Pooled rocket meshes, smoke trail and impact flashes |
| `src/winner-fx.js` | Procedural crown (attached to the winner's head bone), confetti and sparkles |
| `src/weapon-rig.js` | Two-bone hand IK for the held launcher |
| `src/traffic.js` | Rim traffic and the falling-car gag |
| `assets/runtime/*` | Procedural generators for layout, characters, props, City/Volcano worlds and shaders |
| `scripts/*` | Asset build, GLB validation, gameplay tests, browser acceptance |

The simulation owns every rule outcome (tile deadlines, ammo, rocket impacts, elimination). Rendering and input only read snapshots or submit intents. That keeps rules testable in Node and gives future server authority a single source.

## Status

- Playable locally on desktop and in mobile browsers (emulated touch verified; physical phones not yet certified).
- Two worlds (Volcano, Cityscape), Easy/Medium/Hard, 2–15 local actors.
- Local winner flow: automatic last-player-standing resolution, crown and celebration, results with Play Again / Return to Lobby. Results are published as a `pizzeria:match-result` event for a future network layer.
- **Pending:** network multiplayer (authoritative server, matchmaking, remote interpolation, networked rematch voting), Staige SDK integration and deployment, bot weapon use, physical-device performance QA.

See [PIZZERIA_DROP_HANDOFF.md](PIZZERIA_DROP_HANDOFF.md) for detailed status and [PIZZERIA_DROP_BRAIN.md](PIZZERIA_DROP_BRAIN.md) for reusable engineering workflows.

## Licensing notes

Fonts are SIL OFL (see `public/licenses`). Character geometry is procedural and original. Six motion clips were retargeted from Mixamo source animations. The source FBXs are not redistributed here.
