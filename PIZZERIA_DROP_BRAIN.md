# Project Identity

Pizzeria Drop is an original stylized vertical tile-survival prototype and asset studio, built with Three.js/Vite for eventual Staige integration. This Brain records explicit procedures and observed outcomes, not private reasoning. Updated October 7, 2026 (V1: multiplayer rooms, iPhone/WebKit, mobile UX). See HANDOFF for current paths/status.

# Goals

Cute recognizable mascots, intentional worlds, clear shared-tile rules, momentum-driven chaos, equivalent desktop/mobile input and measured browser cost. Preserve editable source and prove behavior independently of presentation.

# Locked Product Decisions

PROJECT-SPECIFIC: Host-selected 5–10 square floors (studio/tests 3) hanging from a fixed top with 7.6 m spacing; up to 15 players (humans + optional host-added bots); server-authoritative online rooms with 5-character codes; Quick Play with local bots; constant tile size; grid side 7/9/11 by population; levels 19.4/11.8/4.2; gravity 22; jump apex 8.25; collapse 3 seconds; instant lock (0 s, 0.25 s grace); two shots per launcher; initial launcher instances equal actor count; launcher auto-equips on touch; hold to aim, a valid target in the reticle locks instantly, release fires only when locked; rockets fly in 3D with homing, are blocked by intact floors and pass through gaps; rocket affects at most a compact 2x2 with zero HP damage; kill-zone elimination followed by 0.75-second body removal; the last living player wins automatically and the match freezes; the winner's entered name is shown with a crown; Play Again fully rebuilds the match. Easy full floors; Medium interior gaps/hammers; Hard adds gaps/bursts. Starting perimeter remains intact. A normal jump passes upward through one-way platforms and reaches one floor, not two.

# Art Direction

Reference PNGs establish chunky stylization, warm/cool contrast, readable silhouettes and vertical world composition. The correction brief overrides reference holes/topology. Character geometry is original and procedural. Large heads, compact bodies, bean eyes, mittens and chunky shoes communicate a toy mascot silhouette. Readability and expressive proportions must survive optimization; minimum polygons alone are not an art goal.

# Character Design System

GENERALIZABLE workflow: compatible modular mascots.
- PURPOSE: distinct characters sharing animation and equipment.
- WHEN TO USE: small customizable game rosters.
- INPUTS: proportion targets, shared joint names/bind pose, palette, equipment markers.
- STEP-BY-STEP PROCEDURE: (1) choose shared proportions; (2) build rounded masses and face silhouettes; (3) assign skin weights consistently; (4) retain body/hair/upper/lower/shoes as five skinned parts; (5) share vertex-color material; (6) attach WeaponSocket to Chest; (7) clone whole scene with SkeletonUtils.clone; (8) update mixer then two-bone arm IK to LeftGrip/RightGrip.
- OUTPUT: compatible girl/boy GLBs with independent runtime skeletons.
- VALIDATION / TEST: 19 joints, eight clips, sub-1 MB per character; both grip errors below 0.1 m for every clip; inspect silhouettes front/side and in gameplay.
- COMMON FAILURE MODES: shared skeleton mutation, incorrect socket rotation, clipping hands, oversized body obscuring reticle, optimizer deleting empty attachment nodes.
- PERFORMANCE CONSIDERATIONS: five draw slots enable customization; one material limits cost; no finger/cloth simulation. Current girl 15,850 triangles, boy 14,698.
- GENERALIZABLE LESSON: validate semantic attachment nodes and poses, not only whether a file loads.

# Environment Design System

GENERALIZABLE workflow: build a modular world around gameplay topology.
- PURPOSE: coherent world composition without invalidating play rules.
- WHEN TO USE: repeatable arenas with strong setting silhouettes.
- INPUTS: reference palette/composition, arena bounds, floor heights, camera envelope.
- STEP-BY-STEP PROCEDURE: (1) lock tile topology separately; (2) create top/middle/deep structural bands; (3) establish connected silhouettes; (4) repeat facade/scaffold modules with variation; (5) add sparse narrative accents; (6) merge by material; (7) inspect from active camera as well as studio orbit.
- OUTPUT: environment shell plus separate functional tile instances.
- VALIDATION / TEST: perimeter continuity, no shell/floor collision conflict, deep cavity visible, readable tile hazards, correct assembled export floor height.
- COMMON FAILURE MODES: disconnected floating props, shallow decorative cylinder below a supposedly deep city, art gaps accidentally becoming rule gaps.
- PERFORMANCE CONSIDERATIONS: windows/markings use planes; geometry buckets share materials; cars and VFX reuse bounded objects.
- GENERALIZABLE LESSON: composition and topology need distinct source contracts.

# Gameplay Architecture

GENERALIZABLE: `Match` owns pure state; `GameControls` supplies intent; `main.js` renders snapshots/events; HUD projects information. The simulation uses a 1/120-second fixed step. Renderer animation and GPU effects do not decide tile deadlines or ammunition. Stable tile IDs and launcher IDs make tests and future replication possible. Event history is bounded. Studio preview, countdown and active states are explicit.

# Multiplayer Architecture

IMPLEMENTED (V1). One Node process (`server/index.js`) serves the built client, `/health`, `/metrics` and WebSocket rooms on `/ws`. The server runs the same pure `Match` as the browser, so rules are shared code and never re-implemented. Clients send intents; the server simulates and broadcasts compact snapshots plus sequenced events. The browser uses `NetMatch`, a Match subclass that predicts the local player, interpolates remotes and applies authoritative state. This keeps the renderer and HUD identical for local and online play. See the workflows below for the reusable procedures and their validation.

# Physics Patterns

GENERALIZABLE workflow: readable custom platform physics.
- PURPOSE: momentum-driven contacts without heavyweight scene-wide rigid bodies.
- WHEN TO USE: constrained arcade arenas.
- INPUTS: gravity, apex, level spacing, collider extents, angular hammer motion.
- STEP-BY-STEP PROCEDURE: (1) derive jump velocity from sqrt(2*g*height); (2) integrate at fixed step; (3) detect downward swept crossings of tile tops; (4) resolve to valid tile; (5) apply limited airborne steering; (6) sweep rotating hammer head motion; (7) compute knockback using contact direction and relative velocity; (8) let resulting movement determine later elimination.
- OUTPUT: jump/dive/hammer interactions and explicit grounded state.
- VALIDATION / TEST: one-floor reach, two-floor exclusion, steering, 360-degree hammer direction, immediate kill-zone state and delayed visual disappearance.
- COMMON FAILURE MODES: tunneling, scripted random elimination, unlimited steering canceling knockback, confusing full rigid-body claims with custom contact logic.
- PERFORMANCE CONSIDERATIONS: simple platform queries and swept head segments; no player-player collision solver currently.
- GENERALIZABLE LESSON: test the intended physical relationship, not just a velocity constant.

# Tile Collapse System

PROJECT-SPECIFIC implementation with GENERALIZABLE timer ownership: tile holds `activatedAt` and `expiresAt`. First valid contact sets them only when null; all players observe the same expiry. Destroyed cells cannot rearm. Color/shake derive from remaining time. Regression must start from actual countdown and first falling contact: directly calling activate alone would miss a landing-path bug. User reference gaps never override Easy's intact initial state.

# Vertical Arena Generation

PROJECT-SPECIFIC: tile side 2.25 m, pitch 2.35 m, floor spacing 7.6 m; 1–4 actors use 7x7, 5–9 use 9x9, 10–15 use 11x11. Generate metadata for every cell and mark initial absence separately. Preserve perimeter, unique IDs and valid spawn/pickup candidates. Medium has two missing interior cells per level; Hard six. Static delivery assembly is 15-player Hard: 363 metadata cells, 345 initially present tiles. Runtime regenerates for selected count/difficulty.

# Camera System

GENERALIZABLE workflow: vertical-arena follow camera.
- PURPOSE: stable view while dropping/jumping and usable aimed view.
- WHEN TO USE: third-person stacked platforms.
- INPUTS: actor X/Y/Z, look input, arena bounds, level heights, aiming state.
- STEP-BY-STEP PROCEDURE: (1) damp focus toward player; (2) compute yaw/pitch desired offset; (3) in aim mode switch to the over-the-shoulder rig (see Third-Person Camera-Relative Weapon Aiming); (4) constrain cavity and overhead ceiling; (5) damp camera toward desired; (6) tighten FOV while aiming; (7) fade overhead tile batches always and the own floor only while aiming steeply down; (8) inspect landscape reticle framing.
- OUTPUT: camera following vertical movement without incremental offset drift.
- VALIDATION / TEST: camera descends with actor, stays below ceiling, player silhouette clears aim center, controls remain independent of movement.
- COMMON FAILURE MODES: adding shoulder offset after damping each frame causes drift; large heads hide targets; floor clipping during ascent; testing only studio orbit; aim view looking at a horizontal point so vertical aim is impossible.
- PERFORMANCE CONSIDERATIONS: analytic bounds and per-floor material fading avoid triangle raycasts. Fading is visual only; collision is untouched.
- GENERALIZABLE LESSON: camera is part of gameplay acceptance, especially for unusual character proportions.

# Rocket Targeting System

PROJECT-SPECIFIC summary: hold → aim camera + reticle → a living player inside the reticle cone locks instantly (`RULES.lockSeconds = 0`), with a 0.25 s grace before a lost lock drops → release fires a homing rocket → the rocket breaks at most a 2x2 of the floor where it lands. Releasing with no lock keeps ammo. The 2-second lock was removed because it felt too slow; the per-step lock structure (target, seconds, locked, grace) was kept, so a non-zero lock time is still one constant away. Lock is screen-space; flight obeys floor line of sight. Rocket constants are in `RULES` (`src/gameplay.js`): speed 24 m/s, turn 3.4 rad/s, terminal turn 9 rad/s, terminal range 2.2 m, ttl 5 s, slab top +0.15, underside −0.5. The workflows below give the full procedures.

# Third-Person Camera-Relative Weapon Aiming

GENERALIZABLE workflow.
- PURPOSE: the reticle at screen center is where the weapon goes, from an over-the-shoulder camera.
- WHEN TO USE: third-person shooters/launchers where the camera is offset from the character.
- INPUTS: yaw, aim pitch, focus point (player chest), shoulder offset, convergence distance, world segment test.
- STEP-BY-STEP PROCEDURE: (1) keep aim pitch separate from follow pitch and reset it to level when aim starts; (2) forward = (−sin yaw·cos p, −sin p, −cos yaw·cos p); (3) camera = focus − forward·d + right·shoulder + small up; (4) look at focus + forward·convergence (here 14 m) so the center ray crosses the player's aim line; (5) on fire, cast the camera center ray and take its first hit (or a far point); (6) launch from the muzzle toward that point, not along the camera direction; (7) reduce look sensitivity and FOV while aiming.
- OUTPUT: muzzle direction consistent with what the reticle covers.
- VALIDATION / TEST: screenshot locked states looking level, up and down; assert the projectile path starts toward the reticle target; check the character does not cover the reticle.
- COMMON FAILURE MODES: firing along camera forward from an offset muzzle (parallax miss); shoulder offset making targets drift 100+ px from center; camera lookAt at a fixed horizontal point (no vertical aim).
- PERFORMANCE CONSIDERATIONS: one analytic segment test per shot.
- GENERALIZABLE LESSON: the camera ray defines aim; the launch direction comes from where that ray lands.

# Vertical Targeting

GENERALIZABLE workflow.
- PURPOSE: lock and shoot targets on floors above and below.
- WHEN TO USE: stacked-level arenas.
- INPUTS: aim pitch limits, floor spacing, camera clamps, fading rules.
- STEP-BY-STEP PROCEDURE: (1) size pitch limits from worst-case geometry (target one floor away, nearly underneath): here −1.15..+1.3 rad; (2) clamp the camera above its own floor and below the overhead underside so steep pitches don't clip; (3) widen the shoulder offset with |sin pitch|; (4) fade overhead floors and, when looking steeply down, the own floor (visual only); (5) warn when the path is obstructed; (6) record the required pitch in acceptance and keep margin below the clamp.
- OUTPUT: targets visible and lockable above, level and below.
- VALIDATION / TEST: real-input runs that steer the view until the target enters the reticle, recording aim pitch (here ≈ −0.74 up, ≈ +1.13 down).
- COMMON FAILURE MODES: pitch clamp just short of the needed angle; own floor hiding targets below; camera pushed through a ceiling.
- PERFORMANCE CONSIDERATIONS: material opacity per floor batch, no per-tile work.
- GENERALIZABLE LESSON: derive angle limits from level geometry and verify with recorded values, not guesses.

# Homing Projectile Steering

GENERALIZABLE workflow.
- PURPOSE: visibly curving missiles that reach a moving target without snapping.
- WHEN TO USE: lock-on weapons in fixed-step simulations.
- INPUTS: speed, max turn rate, terminal range/turn rate, aim-point function, fixed dt.
- STEP-BY-STEP PROCEDURE: (1) store velocity, not just position; (2) each step compute the desired direction to an aim point; (3) rotate the heading toward it by at most turnRate·dt (lerp-normalize with k = min(1, maxTurn/angle)); (4) choose aim points by phase: approach the feet; when below the target's floor, rise into the underside below the target; within a horizontal range, terminal-dive into the support with a higher turn rate; (5) if the target dies, keep flying straight; (6) expire on bounds, kill zone or ttl.
- OUTPUT: smooth 3D trajectories (up, down, diagonal) ending at the intended surface.
- VALIDATION / TEST: path samples show monotonic rise/fall for up/down shots; impact level and tile IDs asserted; a same-floor shot terminates under the target, not under the shooter.
- COMMON FAILURE MODES: aiming at the chest from the same floor (the rocket flies flat and never reaches the floor); turn rate too low to dive in time (overshoot); instant snap (looks like a teleport).
- PERFORMANCE CONSIDERATIONS: a few vector ops per rocket per step; pooled visuals.
- GENERALIZABLE LESSON: the gameplay effect target (floor) can differ from the lock target (player); model that with aim-point phases.

# Cross-Floor Line of Sight

GENERALIZABLE workflow.
- PURPOSE: projectiles cannot pass through intact floors but can use gaps.
- WHEN TO USE: grid-based floors with holes.
- INPUTS: per-level slab top and underside heights, grid lookup, step segment.
- STEP-BY-STEP PROCEDURE: (1) each step, take the segment old→new; (2) for each level pick the plane the segment can cross (top when descending, underside when rising); (3) compute the crossing parameter u, then x/z at the crossing; (4) look up the grid cell; an intact cell is a candidate hit; keep the smallest u; (5) on hit, place the impact at the crossing; (6) if the hit is on the target's own floor near the target, treat it as a target hit; otherwise mark an obstruction; (7) reuse the same test for HUD "path blocked" warnings.
- OUTPUT: deterministic first-obstruction detection independent of step size.
- VALIDATION / TEST: a blocked shot breaks the intermediate floor and leaves the lower one intact; a gap lets the same shot through; the helper returns false/true before/after removing the cell.
- COMMON FAILURE MODES: point-in-slab tests tunneling at high speed; treating tile seams as holes; warning on the target's own floor for upward shots.
- PERFORMANCE CONSIDERATIONS: O(levels) per segment, no meshes or raycasters.
- GENERALIZABLE LESSON: analytic plane crossings against a known grid beat mesh raycasts for both cost and determinism.

# Weapon Auto-Equip and Ammo

GENERALIZABLE workflow.
- PURPOSE: limited circulating weapons with clear state.
- WHEN TO USE: pickup weapons with charges.
- INPUTS: launcher instances (count = players), states waiting/resting/falling/equipped, owner, ammo.
- STEP-BY-STEP PROCEDURE: (1) contact while unarmed → equipped, ammo 2, emit event; (2) show the held model (IK) and HUD "ROCKETS: N"; (3) decrement only on an actual fire; (4) at 0, clear the owner, hide the held model and respawn the same instance on a valid non-hazard tile; (5) resting pickups whose tile disappears fall, land lower or respawn below the kill zone; (6) an unlocked release keeps ammo.
- OUTPUT: conserved launcher count with visible ownership.
- VALIDATION / TEST: counts 2→1→0 with real flights; held model hidden; HUD text; respawn tile valid and present.
- COMMON FAILURE MODES: decrementing on press instead of fire; leaving the held mesh visible; spawning in the air.
- PERFORMANCE CONSIDERATIONS: fixed instances, no create/destroy.
- GENERALIZABLE LESSON: ammo and ownership are simulation state; visuals just mirror them.

# Mobile Aim Assistance

GENERALIZABLE workflow.
- PURPOSE: make thumb aiming viable without auto-targeting.
- WHEN TO USE: touch lock-on/aim games.
- INPUTS: last pointer type, per-device profile {lock cone px, assist radius px, strength}, range limit.
- STEP-BY-STEP PROCEDURE: (1) select the profile by last pointer type (current values: mouse lock 56 px / assist 72 px / strength 1.0; touch 76 / 104 / 2.2; with instant lock, assist must stay light because acquisition is already immediate); (2) consider only living, on-screen, in-range targets; (3) prefer the current lock target, else the nearest within the assist radius; (4) compute the yaw/pitch error from camera forward to the target; (5) apply k = 1 − exp(−strength·dt) of the error; (6) do nothing when no target is near the reticle.
- OUTPUT: a gentle pull that helps put and keep a nearby target inside the instant-lock cone.
- VALIDATION / TEST: a touch run locks up and down with real drags; the profile is "touch" on mobile; a target leaving the cone still resets the lock.
- COMMON FAILURE MODES: assist selecting off-screen enemies; snapping (k too high); assist holding onto a target that left the cone.
- PERFORMANCE CONSIDERATIONS: one projection per candidate per frame.
- GENERALIZABLE LESSON: assist should reduce jitter near the reticle, not choose targets.

# Contextual Controls Onboarding

GENERALIZABLE workflow.
- PURPOSE: new players discover controls without permanent clutter.
- WHEN TO USE: any game with non-obvious inputs.
- INPUTS: device class (pointer: coarse), persistent "seen" flag, game pause hook, event stream.
- STEP-BY-STEP PROCEDURE: (1) before the first match, show a compact panel listing every input, device-appropriate list first; (2) pause the countdown until dismissed and store the seen flag in localStorage inside try/catch; (3) add a persistent "? Controls" button and a hotkey; reopening pauses the match; Escape closes; (4) show contextual hints on first relevant events (e.g. "ROCKET EQUIPPED · Hold to aim · Aim at a player to lock · Release to fire"): long the first time, short later, hidden once the player succeeds; (5) give immediate feedback for wrong actions ("NOT LOCKED"); (6) check short landscape layouts so the confirm button is visible.
- OUTPUT: discoverable controls with zero permanent coverage.
- VALIDATION / TEST: a fresh profile sees the panel; the countdown waits; the button reopens it; touch hides the desktop list; the button is in the viewport at 844x390.
- COMMON FAILURE MODES: the panel blocking automation (tests must dismiss it or preseed the flag); confirm button below the fold; hints never dismissed.
- PERFORMANCE CONSIDERATIONS: static DOM, toggled visibility only.
- GENERALIZABLE LESSON: teach at the moment of need, and confirm with a fresh-profile test.

# Browser-Game Optimization

GENERALIZABLE workflow.
- PURPOSE: stable frame time on desktop and phones.
- WHEN TO USE: Three.js games with many actors/effects.
- INPUTS: renderer.info, frame interval samples, pools.
- STEP-BY-STEP PROCEDURE: (1) instance repeated geometry (tiles, smoke puffs); (2) pool transient objects (rockets 8, puffs 120, flashes 4) and never allocate per shot; (3) fade by batch material, not per mesh; (4) use analytic collision/LOS instead of raycasts; (5) cap pixel ratio; (6) measure median/p95 and draw calls at max population before and after changes; (7) remember that hidden tabs/panes throttle requestAnimationFrame; use headless Chrome for timing-sensitive checks.
- OUTPUT: 15-actor scenes at ≈5.5 ms median locally with ~141–159 draw calls.
- VALIDATION / TEST: acceptance JSON with metrics; compare to the previous run.
- COMMON FAILURE MODES: per-shot mesh creation; transparent overdraw from large smoke; measuring a throttled/hidden page.
- PERFORMANCE CONSIDERATIONS: one instanced trail draw call regardless of rocket count.
- GENERALIZABLE LESSON: pool and instance first, then measure in a visible, unthrottled context.

# Last-Player-Standing Resolution

GENERALIZABLE workflow (multiplayer elimination games).
- PURPOSE: decide the match exactly once, deterministically, from simulation state.
- WHEN TO USE: battle-royale / party games with elimination.
- INPUTS: per-player alive flag, elimination order, phase, minimum player count.
- STEP-BY-STEP PROCEDURE: (1) record each elimination in order; (2) at the END of every active step (after movement, hazards and projectiles) count living players; (3) if ≤ 1 and the match had ≥ 2 players, resolve; (4) winner = the single survivor, or a draw when the final players fall in the same step; (5) build a serializable result (winner id/name, draw, placements = winner + reverse elimination order, duration) and emit one event; (6) make resolve idempotent by gating on phase.
- OUTPUT: a single authoritative result object usable by UI, analytics or a server.
- VALIDATION / TEST: 2-player and 3-player eliminations; bot winner; simultaneous final eliminations → draw; placements order; single winner event.
- COMMON FAILURE MODES: checking inside the per-player loop (resolves before a simultaneous elimination is applied); resolving in rendering code; solo/preview matches resolving instantly.
- PERFORMANCE CONSIDERATIONS: O(players) per step.
- GENERALIZABLE LESSON: resolution is a rule outcome; it belongs in the authoritative simulation and must be server-owned when networked.

# Winner-State Transition

GENERALIZABLE workflow.
- PURPOSE: end the match cleanly and protect the winner.
- WHEN TO USE: after resolution in any physics/hazard game.
- INPUTS: phase machine (preview → countdown → active → won), hazard systems, input gate.
- STEP-BY-STEP PROCEDURE: (1) switch phase to `won` and timestamp it; (2) clear in-flight projectiles and cancel held actions; (3) secure the winner: snap to its footing, or the nearest intact surface if airborne, zero velocity, set grounded and a celebration animation; (4) in `won` step, run only cosmetic bookkeeping (e.g. eliminated-body removal); freeze tile timers, hammers, pickups, movement and kill checks; (5) reject action methods unless the phase is active; (6) disable the input layer and reset held keys/pointers; (7) presentation layers react to the phase/event, never the reverse; (8) end the presentation if the phase changes away (debug/fixture safety).
- OUTPUT: a stable final scene in which the winner cannot die.
- VALIDATION / TEST: move the winner into the kill zone after resolution and confirm alive; set tile expiries in the past and confirm none break; hammers don't move; jump/dive/fire rejected.
- COMMON FAILURE MODES: hazards still ticking (winner falls during the celebration); airborne winner frozen mid-air; input still driving the camera.
- PERFORMANCE CONSIDERATIONS: the frozen step is cheaper than an active one.
- GENERALIZABLE LESSON: freezing by phase is simpler and safer than special-casing each hazard for the winner.

# Deterministic Match Reset

GENERALIZABLE workflow.
- PURPOSE: Play Again with zero stale state.
- WHEN TO USE: any rematch/restart.
- INPUTS: a pure match constructor, a world builder, presentation pools.
- STEP-BY-STEP PROCEDURE: (1) never "undo" a finished match; construct a fresh Match (players, tiles, launchers, hammers, events, winner, result, eliminations); (2) rebuild scene-bound visuals (actors, tile instances, pickups) from it; (3) reset pooled presentation (rocket FX, winner FX: detach the crown, clear confetti) and remove state CSS classes/overlays; (4) reset HUD caches (nameplates, event cursor) and the camera; (5) keep only deliberate persistent settings (name, world, difficulty, count, onboarding-seen flag); (6) route Play Again through one function (`requestRematch`) so a network layer can replace it.
- OUTPUT: a match indistinguishable from a first launch, except for persisted settings.
- VALIDATION / TEST: after a win, Play Again → assert phase countdown, winner/result null, all alive, tiles intact/unactivated, launchers resting, ammo 0, crown detached, VFX inactive, overlays hidden, camera near the player, floor tracker correct, zero winner events; repeat with a bot winner.
- COMMON FAILURE MODES: a crown left parented to an old skeleton; an event cursor skipping new events because time restarted; overlays remaining; pooled particles still alive.
- PERFORMANCE CONSIDERATIONS: pools are reused across matches; only per-match geometry is rebuilt.
- GENERALIZABLE LESSON: rebuild from a pure constructor and enumerate every presentation pool in a single reset path.

# Lightweight Browser Victory Presentation

GENERALIZABLE workflow.
- PURPOSE: a satisfying 3–4 s win moment at negligible cost.
- WHEN TO USE: browser/mobile multiplayer games.
- INPUTS: result event, winner actor, existing animation clips, pooled VFX, CSS overlay.
- STEP-BY-STEP PROCEDURE: (1) brief slow motion on visuals only (mixer dt × 0.3 → 1 over ~0.9 s) while the simulation stays frozen; (2) camera eases into a slow orbit framing the winner's head from the side it was already on (no cut), using the same cavity/ceiling clamps as gameplay; (3) the winner turns toward the camera (damped angle) and plays an existing upbeat clip plus procedural decaying hops; (4) pop an attachment (crown) with overshoot scale; (5) confetti burst from an instanced pool (~96) plus a second smaller burst on the pop; orbiting additive sparkles (~24) fading out; (6) CSS vignette glow and a big name banner; short WebAudio fanfare; (7) hide gameplay HUD (reticle, weapon, touch controls); (8) after ~3.2 s show a results card with primary/secondary actions focused for keyboard use; (9) verify the card fits short landscape screens.
- OUTPUT: celebration with ~5 extra draw calls for a few seconds.
- VALIDATION / TEST: screenshots mid-celebration and on the results card (after its fade-in) on desktop and 844x390; check name, crown and buttons on screen.
- COMMON FAILURE MODES: camera too close (head hides crown); leftover countdown text ("DROP!"); screenshots captured mid-fade; test mutations (moving the winner) leaking into visuals.
- PERFORMANCE CONSIDERATIONS: instanced confetti/sparkles, no per-frame allocation, effects idle when inactive.
- GENERALIZABLE LESSON: reuse rig clips plus procedural motion and pooled particles instead of sourcing new animation assets.

# Contextual Character Attachments (Crowns, Hats, Badges)

GENERALIZABLE workflow.
- PURPOSE: show state-dependent accessories without modifying character assets.
- WHEN TO USE: winners, team markers, power-ups.
- INPUTS: a named bone (here `Head`), a small procedural or GLB accessory, bone-space offset.
- STEP-BY-STEP PROCEDURE: (1) build the accessory once and bake it into a few vertex-colored meshes; (2) read the bone-space head extents from the character generator to pick an offset (crown at y 0.82, slight tilt); (3) on activation, re-parent the single instance to the target actor's bone so it follows every animation; (4) animate only local transforms (pop, bob); (5) on reset, `removeFromParent()` and hide; (6) assert in tests that the parent bone belongs to the expected actor and that the world position is above the head.
- OUTPUT: an accessory that tracks animation, applies to any character on the shared rig, and never ships in the base model.
- VALIDATION / TEST: crown on the local winner and on a bot winner (correct actor); detached after rematch; visual check of fit across both mascots.
- COMMON FAILURE MODES: adding to the model root (doesn't follow head motion); cloning per match (leaks); leaving it parented to a discarded skeleton; scale mismatch from unexpected bone scale.
- PERFORMANCE CONSIDERATIONS: one shared instance, ~3 draw calls, only while visible.
- GENERALIZABLE LESSON: semantic bone names make accessories portable; keep them out of exported character files.

# Authoritative Multiplayer Rooms

GENERALIZABLE workflow.
- PURPOSE: fair, cheat-resistant matches whose outcome never depends on a player's browser.
- WHEN TO USE: any competitive realtime browser game with shared hazards or pickups.
- INPUTS: a pure deterministic simulation (fixed step), a message protocol, a server runtime (Node + ws).
- PROCESS: (1) make the simulation pure and importable by both client and server; (2) the server owns membership, config, start, every irreversible outcome (tiles, pickups, ammo, projectiles, eliminations, winner) and bots; (3) clients send intents only (move vector, aim direction, lock candidate, discrete actions with sequence numbers); (4) validate every intent: clamp vectors, check finite numbers, rate-limit, re-check claims geometrically (lock target alive, in range, inside a generous cone of the claimed aim); (5) run fixed substeps on a server loop and broadcast snapshots at a lower rate; (6) gate test-only commands behind an environment flag.
- OUTPUT: one authoritative match per room, with clients that cannot assert results.
- VALIDATION: WebSocket integration tests (two clients see identical state; exclusive pickup; implausible fire rejected without spending ammo; winner identical on both); browser tests with real UI on two clients.
- COMMON FAILURE MODES: trusting client "I hit/picked up/won" messages; duplicating rules in server code that drift from the client; host-browser authority; unbounded message rates; debug hooks left enabled.
- PERFORMANCE NOTES: 15 players at 120 Hz simulation cost ≈0.2 ms median per 60 Hz tick here; physics and bot work are O(players × nearby tiles).

# Room-Code Lobby Architecture

GENERALIZABLE workflow.
- PURPOSE: frictionless private matches without accounts.
- WHEN TO USE: party games shared by voice/chat/links.
- INPUTS: room registry, unambiguous code alphabet, lobby state schema, join URL format.
- PROCESS: (1) generate short codes from an alphabet without 0/O/1/I/L, checking for collisions; (2) create = room + host seat; join = code + name, normalised (uppercase, strip); (3) share both the code and a link (`?room=CODE`) and prefill the join screen from the URL; join screens must contain every required field (name + code); (4) broadcast one canonical lobby state (members, host, ready flags, settings, capacity, canStart with reason); (5) explicit errors: not_found, started, full, bad_name, timeout; never an endless spinner (request timeout + cancel); (6) host settings are optimistic on the host but tagged with a revision; ignore server echoes older than the last sent revision; (7) Play Again/Return to Lobby keep the room and settings and reset ready flags.
- OUTPUT: create/join/ready/start flow that survives latency and misuse.
- VALIDATION: unknown code shows an error; non-host settings ignored; settings identical on all clients; start blocked until all humans ready; stale echoes do not revert rapid host edits at 100–150 ms latency.
- COMMON FAILURE MODES: link-joiners landing on a screen without a name field; optimistic UI overwritten by stale echoes (found at 100 ms); global CSS element selectors (header/footer) restyling lobby markup.
- PERFORMANCE NOTES: lobby broadcasts are event-driven, not per-tick.

# Humans + Optional Bot Slots

GENERALIZABLE workflow.
- PURPOSE: let a host fill a lobby with bots without ever displacing real players.
- WHEN TO USE: small-population multiplayer, solo testing, uneven groups.
- INPUTS: capacity, human list, bot settings (on/off, count, skill).
- PROCESS: (1) bots are settings, not members: count clamped to capacity − humans; (2) show bots in the player list with a BOT badge, always ready; (3) when a human joins a full lobby, decrement the bot count instead of rejecting; never remove a human for a bot; (4) at start, assign seats humans-first, then bots, and pass bot indices to the simulation; (5) bots use the same physics and rules; skill changes only reaction time, look-ahead, path noise, search radius and reliability.
- OUTPUT: mixed matches up to capacity with predictable ordering.
- VALIDATION: 2 humans + 13 bots → third human joins → 3 + 12; skill profiles monotonic; only bot seats are AI-driven.
- COMMON FAILURE MODES: bots counted as members needing ready; bots given immunity or perfect knowledge; capacity errors shown to humans while bots occupy seats.
- PERFORMANCE NOTES: bot decisions run at reaction intervals (0.3–0.9 s), not every tick.

# Deterministic Match Configuration

GENERALIZABLE workflow.
- PURPOSE: every client renders the same arena without sending geometry.
- WHEN TO USE: procedurally generated arenas in networked games.
- INPUTS: sanitised settings, seed, ordered player list.
- PROCESS: (1) one shared sanitiser clamps all settings (floors 5–10, enums, bot count); (2) the server picks the seed and sends a canonical config at start (map, difficulty, floors, lives, bot skill, seed, ordered players with characters); (3) layout generation is a pure function of the config (no Math.random); (4) seeded randomness for anything placed at start; dynamic placements come from the server; (5) resumes send the config again plus a diff of changed tiles.
- OUTPUT: identical towers on all clients from about 1 KB of config.
- VALIDATION: two clients report the same floor count, map and player names; seeded matches place launchers identically; resume reproduces the tile state.
- COMMON FAILURE MODES: clients randomising independently; UI showing a setting the simulation ignores ("fake" floors); constants (LEVELS) captured at module scope instead of per match.
- PERFORMANCE NOTES: generating 1,210 tiles for 10 floors is negligible; the renderer instances them per floor and variant.

# WebSocket Synchronization

GENERALIZABLE workflow.
- PURPOSE: low-bandwidth, latency-tolerant state sync.
- WHEN TO USE: action games with up to ~16 players per room.
- INPUTS: snapshot rate, input rate, encoding, event log with sequence numbers.
- PROCESS: (1) 30 Hz inputs with an increasing seq; 20 Hz snapshots; (2) encode players, launchers and rockets as arrays rounded to 2 decimals; (3) append only new events (by sequence number) to each snapshot; clients dedupe by server seq and expose events to the HUD/FX by a local seq (never by timestamp, which arrives late); (4) splice per-client fields (ack, ackAge) into a shared serialized body instead of re-serialising per client; (5) the client derives its URL from the page (wss on https) or an env override; ping every 2 s and treat 6 s of silence as a dead socket.
- OUTPUT: ≈26 KB/s down per client at 15 players here.
- VALIDATION: load test (traffic, tick time); latency matrix (0/50/100/150 ms + jitter) with all gameplay checks repeated.
- COMMON FAILURE MODES: consuming events by "time > last time" (network events carry older server times); hard-coded ws://localhost; per-frame transform spam.
- PERFORMANCE NOTES: ≈2 KB snapshot for 15 players; JSON is adequate at this scale. Binary encoding is a later optimisation.

# Timestamp-Based Tile Events

GENERALIZABLE workflow.
- PURPOSE: synchronized collapse visuals without streaming animation.
- WHEN TO USE: timers on shared world objects.
- INPUTS: server activation time, fixed collapse duration, client estimate of server time.
- PROCESS: (1) the server emits tile-activated {tile, time}; (2) clients set activatedAt/expires from the event and animate shake and colour from (serverNow − activatedAt); (3) the server emits tile-destroyed; clients remove the tile; client prediction never activates or destroys tiles; (4) estimate serverNow as local time minus the minimum observed (arrival − snapshot time) offset, relaxed slowly for drift.
- OUTPUT: identical activation timestamps on all clients; collapse within one latency.
- VALIDATION: compare activatedAt per tile across two browsers (equal to the millisecond); the first activated tile is gone for both after 3 s.
- COMMON FAILURE MODES: clients deciding activation from their own landing (desync); sending shake transforms every frame.
- PERFORMANCE NOTES: two small events per tile lifetime regardless of player count.

# Snapshot Interpolation and Local Prediction

GENERALIZABLE workflow.
- PURPOSE: smooth remote players and a responsive local player.
- WHEN TO USE: server-authoritative movement.
- INPUTS: snapshot buffer, interpolation delay, input history (seq → send time), local position trail.
- PROCESS: (1) render remotes at serverNow − 100 ms by interpolating between bracketing snapshots, angle-aware for rotation; extrapolate at most 150 ms; (2) predict the local player with the same physics but disable authority hooks (activate, eliminate, equip, resolve); (3) on each snapshot compare the server position with the local trail at (send time of the acked input + ackAge), not with "now"; (4) ignore small errors (deadzone), bleed medium errors over about 100 ms, and on large errors (over 2.5 m: hammer hit, rocket hole) adopt the server state and clear history; (5) start prediction only after an authoritative landing (initial drop, respawn) and render the local player interpolated until then.
- OUTPUT: no teleports (max 0.08–0.15 m per 25 ms sample at 0–150 ms) and 0 hard corrections in normal play.
- VALIDATION: sample remote positions every 25 ms in a second browser while the first walks; count local snaps per latency.
- COMMON FAILURE MODES: comparing against current position (constant drag-back); predicting during the drop-in (vertical error cascades through a floor: observed +13 m); replaying the old delta after a snap.
- PERFORMANCE NOTES: trail of 360 steps (3 s); history pruned on every ack.

# Reconnect Grace

GENERALIZABLE workflow.
- PURPOSE: survive refreshes and mobile network hiccups without losing a seat.
- WHEN TO USE: phones, flaky networks, long lobbies.
- INPUTS: per-member random token, grace duration (15 s), local storage.
- PROCESS: (1) issue a token on welcome and store {code, token, time} locally; (2) on socket close keep the seat and start a grace timer; in a match the character stays with neutral input; (3) the client retries resume every 1.5 s within the grace window and auto-resumes on page load if the stored session is recent; (4) on resume, re-attach the socket, broadcast the lobby and resend start + tile diff if a match is running; (5) after grace: remove in the lobby, eliminate in a match; migrate host if needed; (6) a server heartbeat terminates dead sockets so grace starts promptly.
- OUTPUT: same identity and seat, no duplicate characters.
- VALIDATION: WebSocket test (close then resume → same id and seat); browser refresh in the lobby → same member id and a human count unchanged.
- COMMON FAILURE MODES: new member per reconnect (duplicates); room destroyed on host blip; infinite reconnect loop after the room is gone (stop on not_found/started).
- PERFORMANCE NOTES: one timer per disconnected member.

# iOS Safari Game Compatibility

GENERALIZABLE workflow.
- PURPOSE: iPhone Safari as a first-class target.
- WHEN TO USE: any WebGL game shared by link.
- INPUTS: Playwright WebKit with iPhone descriptors, the production build, a pixel-readback helper.
- PROCESS: (1) reproduce first: record WebGL2 support, shader errors, fullscreen capability, viewport and scroll sizes, canvas sizes and console errors in portrait and landscape; (2) verify rendering by reading pixels (WebKit screenshots of resized WebGL canvases can be blank); (3) viewport meta with viewport-fit=cover; dvh with vh fallback; fixed, non-scrolling body with overscroll-behavior none; (4) inputs ≥16 px (no focus zoom); buttons with touch-action manipulation; (5) feature-detect Fullscreen; use immersive fixed-viewport mode plus a Home Screen hint on iPhone; hide the control in standalone; (6) PWA manifest plus Apple meta and touch icon; (7) re-measure on visualViewport resize and after orientationchange; (8) make pointer capture best-effort; (9) build target safari15 (WebGL2 baseline).
- OUTPUT: a boots, renders and plays result on iPhone-class WebKit, with honest limits documented.
- VALIDATION: WebKit acceptance (boot, pixels, canvas = viewport, aspect, joystick/jump, immersive mode, rotate, no scroll, online join); a physical device pass is still required.
- COMMON FAILURE MODES: calling requestFullscreen and assuming it worked; claiming immersive mode is native fullscreen; 100vh only; desktop sidebars on phones; uncaught setPointerCapture errors.
- PERFORMANCE NOTES: automatic Mobile Balanced profile (pixel ratio 1.25, 1024 shadows, no bloom).

# Responsive Mobile Game HUD Design

GENERALIZABLE workflow.
- PURPOSE: a thumb-first landscape HUD that looks like part of the game.
- WHEN TO USE: action games on phones.
- INPUTS: thumb zones, the action set, a state model (armed/aiming/locked/ammo), an icon set.
- PROCESS: (1) left = movement joystick (about 120–132 px, semi-transparent, fades when idle); (2) right = open camera-drag area plus an arc of round buttons sized by importance (primary 92 px, secondary 74/60 px) with icons and small labels; (3) encode weapon state on the button (grey when unarmed; glow + ×N badge when armed; distinct aiming/locked colours) instead of separate panels; (4) collapse desktop panels into compact top pills (players left, floor, lives) and icon buttons; (5) update DOM only on change; (6) separate phone layouts for menus and lobbies (side rail plus tabbed panel) rather than shrinking desktop.
- OUTPUT: a HUD with large targets and clear state at 844×390 and 750×342.
- VALIDATION: screenshots in both landscape sizes; touch tests for joystick, jump and fire; buttons within safe areas.
- COMMON FAILURE MODES: random rectangles; text-only buttons; FIRE active without a weapon; per-frame innerHTML rebuilds.
- PERFORMANCE NOTES: CSS-only effects (gradients, shadows); no canvas UI.

# Mobile Safe-Area Handling

GENERALIZABLE workflow.
- PURPOSE: keep controls clear of the notch, Dynamic Island, rounded corners and home indicator in both landscape orientations.
- WHEN TO USE: any full-bleed mobile UI.
- INPUTS: viewport-fit=cover; env(safe-area-inset-*).
- PROCESS: (1) enable viewport-fit=cover; (2) position every edge-anchored control with max(base, env(safe-area-inset-side) + gap) on its own side (left joystick uses the left inset; right buttons use the right inset; both use the bottom inset); (3) pad full-screen menus with the insets; (4) paint a game-coloured background behind the insets in immersive mode.
- OUTPUT: controls that adapt automatically when the device rotates left or right.
- VALIDATION: static check that all four insets are used; device check on notch/Dynamic Island hardware.
- COMMON FAILURE MODES: only padding the top; fixed pixel offsets; forgetting that landscape insets swap sides.
- PERFORMANCE NOTES: none (CSS).

# Touch Camera Controls

GENERALIZABLE workflow.
- PURPOSE: PUBG-style look and aim while moving.
- WHEN TO USE: third-person touch games with aiming.
- INPUTS: Pointer Events, independent pointer ids, look sensitivity, aim-assist profile.
- PROCESS: (1) any touch on the open right region becomes a look pointer (yaw + pitch); (2) the finger holding FIRE can also drag to look, so a single thumb aims and fires; (3) track each pointer id separately (joystick, look, fire); (4) best-effort pointer capture; (5) apply stronger (still local) aim assist for touch than mouse; (6) clear all pointers on blur, visibility change and pointercancel.
- OUTPUT: simultaneous move + look + aim with vertical aim on floors above and below.
- VALIDATION: real CDP multi-touch; touch aim up and down to an instant lock and fire; WebKit pointer events move the joystick.
- COMMON FAILURE MODES: one global drag flag; capture exceptions aborting handlers; test harness touch semantics (CDP touchEnd lists remaining points).
- PERFORMANCE NOTES: input only updates intent; no DOM work on move.

# Staige-Compatible Deployment Architecture

GENERALIZABLE workflow.
- PURPOSE: reproducible, host-agnostic deployment of a realtime web game.
- WHEN TO USE: deploying to a game platform or PaaS.
- INPUTS: build command, start command, environment variables, health endpoint.
- PROCESS: (1) a single process serves static files, health and metrics, and WebSockets on one port ($PORT); (2) the client resolves the realtime URL from the page origin (wss on https) or a build-time env var; no hard-coded hosts or machine paths; (3) /health for readiness and /metrics for tick and traffic; (4) SPA fallback so platform paths (/play/…?room=) load the app; (5) optional origin allow-list; message size caps; heartbeat; (6) document env vars, TLS expectations and scaling limits (in-memory rooms require sticky routing by room code); (7) keep test hooks and simulated latency behind env flags that are off by default.
- OUTPUT: `npm ci && npm run build && npm start` produces a deployable service.
- VALIDATION: acceptance suites run against the production build served by the same server code; a fresh clone builds from committed files.
- COMMON FAILURE MODES: dev proxies assumed in production; ws:// on https pages (blocked as mixed content); localhost URLs; G:/ paths in runtime code; multiple instances without sticky routing.
- PERFORMANCE NOTES: about 104 MB RSS with one 15-player room here; rooms are independent intervals.

# Desktop Controls

WASD/arrows move relative to camera yaw; mouse drag looks (yaw + pitch); Space jump; E dive; hold left mouse (or F) aims; release fires only when locked; `?` opens controls. Clear held states on blur/cancel/visibility change. Prevent browser defaults for Space/arrows/E/F. The input layer reports intents only; the lock timer lives in the simulation.

Lesson: when the same button is both drag-to-look and hold-to-aim, release must not fire unless the lock completed. Otherwise every camera drag wastes ammo.

# Mobile Controls

GENERALIZABLE workflow: true simultaneous touch.
- PURPOSE: move, look and aim concurrently.
- WHEN TO USE: action games on landscape phones.
- INPUTS: Pointer Events, distinct interaction regions, shared gameplay intent API.
- STEP-BY-STEP PROCEDURE: (1) track pointer IDs by action; (2) capture each pointer independently; (3) map joystick displacement; (4) apply look deltas from the look pointer AND from the pointer holding FIRE (PUBG-style); (5) fire hold/release through shared Match methods; (6) handle pointercancel/blur; (7) record the last pointer type to select the touch aim-assist profile; (8) resume AudioContext from a gesture; (9) test actual CDP multi-touch dispatch.
- OUTPUT: equivalent mobile mechanics with visible JUMP/DIVE/FIRE controls.
- VALIDATION / TEST: joystick+camera+fire simultaneously; vertical aim up and down to lock and fire; Jump and Dive; readable 844x390 layout and an onboarding panel whose confirm button is on-screen.
- COMMON FAILURE MODES: one global dragging flag; synthetic PointerEvents without real capture; audio blocked before gesture; touch region covering buttons; onboarding button below the fold on short landscape screens.
- PERFORMANCE CONSIDERATIONS: update intent rather than rebuilding DOM; bounded projected nameplates.
- GENERALIZABLE LESSON: emulated multitouch is stronger than screenshots but does not replace real-device QA.

# Animation Retargeting Workflow

GENERALIZABLE workflow: reuse motions on a redesigned rig.
- PURPOSE: compatible animation without importing source character meshes.
- WHEN TO USE: different proportions and consistent bone naming.
- INPUTS: supplied Mixamo FBXs, source rest pose, destination 19-joint rig.
- STEP-BY-STEP PROCEDURE: (1) map joints; (2) compare world-space rest orientations; (3) bake corrected rotations at 24 Hz; (4) suppress X/Z root travel; (5) scale vertical hips for short body; (6) author absent landing/hit transitions; (7) export all eight named clips; (8) apply equipment IK after mixer each frame.
- OUTPUT: idle/run/jump/fall/landing/recovery/hit/dance on both mascots.
- VALIDATION / TEST: finite accessors, exact clip names, independent skeleton instances, grip-distance checks in every clip plus visual motion review.
- COMMON FAILURE MODES: applying local rotations without rest correction, oversized hip movement, IK overwritten by mixer, treating valid animation data as proof of attractive motion.
- PERFORMANCE CONSIDERATIONS: share clips but not pose state; prune/resample redundant keys; no full-body dynamic solver.
- GENERALIZABLE LESSON: retargeting correctness includes bind conventions and final evaluated pose.

# Browser/Staige Optimization

Browser build is verified locally; Staige is an intended host, not a tested integration. Instanced tile batches, shared resources, local fonts, bounded effects and compact GLBs are portable browser techniques. Shader/VFX source must accompany static art assets; GLB alone does not reproduce gameplay. Source FBXs are excluded from dist.

# Asset Optimization Workflow

GENERALIZABLE workflow: preserve appearance and semantic nodes while reducing cost.
- PURPOSE: lightweight repeatable exports.
- WHEN TO USE: procedural/skinned GLB libraries.
- INPUTS: editable Three.js generators, glTF-transform, size/triangle budgets.
- STEP-BY-STEP PROCEDURE: (1) identify repeated tiny geometry; (2) replace decorative line cylinders with flat crack strips; (3) merge suitable geometry/material buckets; (4) export GLB; (5) dedup/weld/resample; (6) prune with keepLeaves true for sockets/grips; (7) regenerate manifest; (8) run Khronos and semantic assertions.
- OUTPUT: 15 GLBs with attachment markers and source generators retained.
- VALIDATION / TEST: zero validator errors, finite data, required marker names, character size under 1 MB, expected layouts; visually compare before/after.
- COMMON FAILURE MODES: removing empty functional nodes, destroying customization slots, reducing shape until characters lose appeal, confusing unique triangles with rendered instance triangles.
- PERFORMANCE CONSIDERATIONS: normal tile reduced from about 1,208 to 828 triangles; multiply savings by visible instances. Measure draw calls as well as bytes.
- GENERALIZABLE LESSON: optimization must preserve contracts and visual identity.

# VFX Workflow

GENERALIZABLE: PURPOSE: readable atmosphere at bounded cost. WHEN: browser worlds with smoke/lava. INPUTS: effect budget, camera depth, shared textures/materials. PROCEDURE: retain fixed pools (smoke 30, particles 90, bubbles 16), recycle transforms/lifetimes, vary scale/speed deterministically enough to inspect, distribute City smoke vertically, keep hazards visually distinct. OUTPUT: moving atmosphere without unbounded objects. VALIDATION: repeated play does not grow counts, effects do not obscure reticle/tiles. FAILURE MODES: per-frame allocations, uniform-size particles, dense smoke flattening depth. PERFORMANCE: limit transparent overdraw and shader complexity. LESSON: bounded animation can feel rich through variation rather than count.

# Lighting Workflow

GENERALIZABLE: PURPOSE: readable geometry and depth. WHEN: stylized worlds with bright effects. INPUTS: palette, fog, key/fill light and renderer tone mapping. PROCEDURE: establish neutral tile readability, add biome color through environment/emissive accents, separate cavity bands by haze/light, inspect on active camera and full overview, check UI contrast. OUTPUT: layered readable scene. VALIDATION: silhouette, floor boundaries and danger remain distinct. FAILURE MODES: excessive bloom, flat ambient light, emissive lava washing out tiles. PERFORMANCE: sparse shared lights; avoid many dynamic shadow casters. LESSON: lighting should communicate play space before decoration.

# Cityscape Optimization Techniques

PROJECT-SPECIFIC composition: connected square walls, seven bays per side; rim roads around y24.6; facade/scaffold/utility middle; beams at -8/-19/-28 and floor near -34. Plane windows and stripes, merged material buckets, repeated scaffolds, bounded ten-car traffic and one reusable falling gag. Front studio facade/rim materials fade for overview; match restores their opacity. Inspect gameplay separately so overview transparency does not disguise floating roads/traffic or hide camera problems.

# Lava Rendering Techniques

PROJECT-SPECIFIC implementation: existing cellular/noise GLSL surface retained and resized; bright cracks/hot areas animated in shader, separate tall falls around crater, differently sized bubbles. GENERALIZABLE lesson: shader movement plus a few silhouette-changing particles creates rich liquid without fluid simulation. Lava kill state belongs to simulation, not pixel color or bubble contact.

# QA / Acceptance Testing

GENERALIZABLE workflow: prove rules, exports and interaction separately.
- PURPOSE: prevent attractive screenshots from masking broken mechanics.
- WHEN TO USE: any playable visual prototype.
- INPUTS: locked requirements, pure state API, asset manifest, local server, Chrome/Playwright.
- STEP-BY-STEP PROCEDURE: (1) translate each rule into assertion; (2) test pure simulation edge cases; (3) validate exported formats and semantic nodes; (4) run browser from real initial countdown; (5) drive desktop keys and CDP multi-touch; (6) use explicit reproducible fixtures for aiming; (7) capture frames and inspect them; (8) repeat against production bundle.
- OUTPUT: 34 simulation tests, 15 WebSocket server tests, 15-GLB report, browser suites (regression, rocket, winner), a multiplayer latency matrix, WebKit/iPhone acceptance and a 15-player load test.
- VALIDATION / TEST: no console/page errors; numeric grip/camera/tile assertions; inspect aim framing and world depth. Label fixtures and hardware limits.
- COMMON FAILURE MODES: old tests hard-code obsolete 125-cell layouts, testing activate directly but missing spawn contact, fake pointer events, claiming physical-phone performance from desktop emulation.
- PERFORMANCE CONSIDERATIONS: run broad suite after meaningful changes, not endlessly without new risk.
- GENERALIZABLE LESSON: acceptance needs behavioral, visual and exported-artifact evidence.

# Debugging Techniques

Expose a small `window.dropStudio` inspection surface for snapshots, actor state and camera. Reproduce one failure using fixtures; inspect the actual serialized GLB when markers vanish; separate simulation positions from visual offsets. Compare camera desired and current positions to find drift. Prefer small standalone scripts over deeply quoted inline shell code. Record production versus dev server URL to avoid testing stale bundles.

# Performance Testing

GENERALIZABLE: PURPOSE: identify real runtime cost. WHEN: maximum population/hazard settings. INPUTS: 15 actors, both biomes, frame timestamps and renderer.info. PROCEDURE: warm scene, sample active frames, record median/p95 intervals and draw calls/triangles, report alive count and configuration, repeat on target devices after changes. OUTPUT: `correction-browser-validation.json`. VALIDATION: inspect collection method and workload; a short local sample is not sustained multiplayer certification. FAILURE MODES: measuring empty/loading scene, confusing FPS with network latency, hiding dead actors or device details. PERFORMANCE: optimize bottleneck observed, not guessed. LESSON: numbers need context and reproducible scene state.

# Failure Lessons

1. First-pass valid GLBs/static screenshots did not prove attractive art or correct gameplay.
2. Reference image holes are not authority for initial topology; the brief is.
3. glTF pruning removed empty sockets/grips until keepLeaves and assertions protected them.
4. Reticle framing changed materially after shortening the body and enlarging the head; mobile screenshot review required increasing aim shoulder offset.
5. Camera shoulder addition belongs in desired-position computation, not as a perpetual post-damping increment.
6. A static City assembly retained an old shallow floor despite corrected runtime cavity; exports and runtime must both be checked.
7. Source FBX loader texture/extra-weight warnings do not automatically indicate an exported GLB error; validate the generated output and preserve source provenance.
8. The first rocket flew straight at the target's chest and destroyed the footprint by proximity, which looked like a flat projectile and ignored floors. Velocity-based homing plus swept floor crossings fixed both.
9. The aim camera looked at a horizontal point and pitch was clamped near level, so vertical targeting was impossible. A separate aim pitch with a wide range fixed it.
10. Releasing a hold that doubles as drag-to-look must not fire unlocked shots.
11. CDP Input.dispatchTouchEvent touchEnd removes the points that are absent from its list; misusing it released FIRE mid-aim in tests.
12. A hidden in-app browser pane throttles requestAnimationFrame to zero. Use headless Chrome for simulation-timed acceptance.
13. A first-run modal broke existing automation until tests preseeded the seen flag.
14. Instant lock changed the meaning of older assertions: "holding fire never spends ammo within 0.4 s" and "lock resets 100 ms after leaving" both had to become "fired or cancelled exactly once" and "resets after grace". Re-derive assertions from the new rule instead of loosening them blindly.
15. Winner resolution froze a falling-launcher unit test whose fixture parked every player off-arena; single-player fixtures avoid accidental resolution in unrelated tests.
16. The first celebration camera was too close (the head hid the crown) and the countdown "DROP!" text persisted into the win screen; both were found only by inspecting screenshots.
17. The iPhone problem was not WebGL: WebKit rendered identical pixels to Chromium. The real defects were a dead Fullscreen call, a desktop layout on phones, iOS focus zoom from a 14 px input, and missing safe-area/dvh handling. Reproduce before patching.
18. Playwright-WebKit screenshots of a resized WebGL canvas came back blank on Windows while readPixels showed correct output; verify rendering numerically.
19. Starting local prediction during the server-driven drop-in caused vertical error cascades (+13 m through a floor). Predict only after an authoritative landing.
20. Rapid host setting clicks under 100 ms latency were reverted by stale echoes; settings revisions fixed it.
21. A global CSS rule hiding the studio's header/footer elements also hid the new lobby's header/footer; avoid element selectors in shared stylesheets.
22. HUD/FX consumed events by timestamp; network events arrive with older timestamps, so consume by sequence number.
23. Chrome ignores display-mode emulation over CDP; iOS standalone is testable via navigator.standalone in WebKit.

# Anti-Patterns

Do not rebuild a working pipeline unnecessarily. Do not equate 15 local actors with networking. Do not silently claim Staige/mobile certification. Do not implement rocket HP damage when terrain disruption is the rule. Do not reset shared tile deadlines per actor. Do not leave pickups unsupported in midair. Do not expand a 2x2 footprint to find four surviving tiles. Do not let projectiles pass through intact floors. Do not let aim assist choose off-screen targets. Do not fire on release without a completed lock when release also ends a camera drag. Do not decide winners in presentation code. Do not let clients assert pickups, hits or wins. Do not hard-code ws://localhost or machine paths. Do not claim iPhone immersive mode is native fullscreen. Do not keep hazards running after resolution. Do not reset a match by mutating the old one. Do not implement hammer elimination as a random scripted event. Do not optimize away customization or expressive silhouette without measuring benefit.

# Reusable Skills

Workflow catalog above: modular mascot/attachment authoring; third-person camera-relative aiming; vertical targeting; homing steering; analytic cross-floor LOS; auto-equip/ammo; mobile aim assist; contextual onboarding; browser-game optimization; last-player-standing resolution; winner-state transition; deterministic match reset; lightweight victory presentation; contextual character attachments; authoritative rooms; room-code lobbies; human + bot slots; deterministic match config; WebSocket sync; timestamp tile events; interpolation/prediction; reconnect grace; iOS Safari compatibility; mobile HUD design; safe areas; touch camera; Staige-ready deployment; environment composition around locked topology; custom fixed-step platform physics; vertical camera design; conserved equipment lifecycle; multi-pointer mobile input; world-rest-pose retargeting; semantic-preserving GLB optimization; bounded atmospheric VFX; gameplay-oriented lighting; layered acceptance; contextual performance measurement. Each workflow states inputs, procedure, output, verification and limitations. Network authority is explicitly proposed future work, not demonstrated skill execution in this build.

# Tools / Libraries / Techniques Used

Three.js 0.186.x (BufferGeometry, SkinnedMesh, AnimationMixer, SkeletonUtils, InstancedMesh, GLSL ShaderMaterial, GLTFExporter/Loader, FBXLoader); Vite 8.x; glTF-transform 4.x (dedup/weld/resample/prune); Khronos gltf-validator; Node.js test/assert tooling; Playwright 1.63 (Chromium + WebKit 26 with iPhone descriptors) and Chrome CDP touch dispatch; ws 8.x WebSocket server/client; sharp (PWA icon generation); PowerShell; local Barlow Condensed/DM Sans fonts. package-lock.json pins actual versions. Meshoptimizer/sharp are available dependencies; do not infer every available package performed a transformation. No Blender, remote asset generator or physical fluid solver was used for this correction.

# Source / Provenance Notes

- Product rules: user's pasted correction brief, October 7, 2026; path in HANDOFF.
- Art references: two supplied PNGs in `Reference images`; names in HANDOFF. Style references, not copied geometry.
- Existing project: renderer/postprocessing, studio UI, instancing, procedural export approach, base lava/effects and supplied source FBXs retained/adapted.
- Assets: six motion sources from local Girl 1/Guy 1 Mixamo FBXs; landing/hit authored. No additional asset license claim is made.
- Known libraries: loader/exporter/animation/instancing and optimizer behavior from installed APIs and existing source usage.
- Build experimentation: short-mascot proportions, hand IK, flat crack optimization, square city composition, floor spacing/jump tuning, shoulder adjustment, marker pruning fix, tests and frame samples.
- Newly generated geometry: procedural source under assets/runtime. No external model download was used.

# Recommended Cenzer Course Topics

1. Convert a product correction brief into invariants and acceptance evidence.
2. Separate art reference interpretation from gameplay topology.
3. Shared-rig mascot authoring and equipment IK.
4. Retarget motion across different body proportions.
5. Design fixed-step tile timers, one-way platforms and angular-contact impulses.
6. Model conserved pickup ownership and continuous lock targeting.
7. Build vertical follow cameras and simultaneous mobile controls.
8. Compose deep modular environments with bounded effects.
9. Optimize GLB assets without deleting semantic markers or artistic identity.
10. Distinguish local simulation, authoritative networking and deployment certification.
11. Combine unit, browser, visual, artifact and device performance QA.
12. Write an accurate continuation handoff with explicit unverified work.
