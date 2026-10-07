// Floors hang from a fixed top level; more floors extend deeper into the cavity.
// Spacing stays 7.6 m so a normal jump (apex 8.25 m) still reaches exactly one floor up.
export const TOP_LEVEL = 19.4,
  FLOOR_SPACING = 7.6,
  MIN_FLOORS = 1,
  MAX_FLOORS = 10;
export const levelsFor = (floors = 3) =>
  Array.from(
    { length: Math.max(MIN_FLOORS, Math.min(MAX_FLOORS, Math.round(floors))) },
    (_, i) => +(TOP_LEVEL - i * FLOOR_SPACING).toFixed(3),
  );
export const killYFor = (levels) => +(levels.at(-1) - 4.7).toFixed(3);
export const LEVELS = levelsFor(3);
export const TILE_SIZE = 2.25,
  TILE_PITCH = 2.35;
export function layout(biome, playerCount = 2, difficulty = "easy", floors = 3) {
  const levels = levelsFor(floors);
  const count = Math.max(1, Math.min(15, playerCount)),
    side = count <= 4 ? 7 : count <= 9 ? 9 : 11,
    half = (side - 1) / 2,
    tiles = [];
  for (let level = 0; level < levels.length; level++)
    for (let gx = -half; gx <= half; gx++)
      for (let gz = -half; gz <= half; gz++) {
        // Designed, interior-only diagonal pairs; never turn the outer square into islands.
        const sign = level % 2 ? -1 : 1;
        const mediumGap =
          (gx === -1 && gz === sign) || (gx === 1 && gz === -sign);
        const hardGap =
          (gx === 0 && Math.abs(gz) === 2) || (gz === 0 && Math.abs(gx) === 2);
        const gap =
          difficulty !== "easy" &&
          (mediumGap || (difficulty === "hard" && hardGap));
        const hammer =
          difficulty !== "easy" &&
          ((gx === half - 1 && gz === 0) || (gx === -half + 1 && gz === -1));
        const burst =
          difficulty === "hard" &&
          ((gx === -half + 1 && gz === half - 1) ||
            (gx === half - 1 && gz === -half + 1));
        tiles.push({
          id: `${biome}-${level}-${gx}-${gz}`,
          level,
          gx,
          gz,
          x: gx * TILE_PITCH,
          y: levels[level],
          z: gz * TILE_PITCH,
          rotationY: burst ? 0 : (((gx + gz + side * 2) % 4) * Math.PI) / 2,
          variant: burst ? "burst" : "normal",
          startsPresent: !gap,
          hammer: hammer && !gap,
          pickup: gx === 0 && gz === -half + 1,
        });
      }
  const safe = tiles.filter(
    (t) =>
      t.level === 0 && t.startsPresent && !t.hammer && t.variant === "normal",
  );
  // Put the local player at a centered near-edge tile; remaining starts spread evenly.
  safe.sort(
    (a, b) =>
      Math.abs(a.gx) +
      Math.abs(a.gz - (half - 1)) * 0.5 -
      (Math.abs(b.gx) + Math.abs(b.gz - (half - 1)) * 0.5),
  );
  const starts = [safe[0]],
    remaining = safe.slice(1);
  for (let i = 1; i < count; i++)
    starts.push(
      remaining.splice(Math.floor((i * 11) % remaining.length), 1)[0],
    );
  return {
    biome,
    playerCount: count,
    difficulty,
    side,
    half,
    seed: 4729,
    units: "meters",
    tileSize: TILE_SIZE,
    tilePitch: TILE_PITCH,
    tileDelay: 3,
    killY: killYFor(levels),
    floors: levels.length,
    levels,
    tiles,
    spawnPoints: starts.map((t) => ({ x: t.x, y: levels[0] + 4, z: t.z })),
    pickupCandidates: tiles
      .filter((t) => t.startsPresent && !t.hammer && t.variant === "normal")
      .map((t) => t.id),
    rules: {
      easy: { gaps: 0, hammers: false, burst: false },
      medium: { gaps: 2, hammers: true, burst: false },
      hard: { gaps: 6, hammers: true, burst: true },
    },
  };
}
