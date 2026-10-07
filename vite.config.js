import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
// Build identity, exposed in the menu and at /version. Platforms can pass the commit via env.
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
let commit = process.env.SOURCE_COMMIT || process.env.GIT_COMMIT || process.env.COMMIT_SHA || "";
if (!commit)
  try {
    commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {}
const build = { version: pkg.version, commit: (commit || "unknown").slice(0, 7), commitFull: commit || null, buildTime: new Date().toISOString() };
// Ship only generated runtime files. Source FBXs never enter the hosting bundle.
export default defineConfig({
  // Relative asset URLs: works at "/" or any mount path (index.html sets a matching <base>).
  base: "./",
  define: { __BUILD__: JSON.stringify(build) },
  // Safari 15+ (iOS 15+ has WebGL2, required by three.js); avoids newer syntax on older iPhones.
  build: { chunkSizeWarningLimit: 900, target: ["es2020", "safari15", "chrome100", "firefox100"] },
  // Dev: same-origin /ws is proxied to the realtime server (npm run dev:server).
  server: {
    proxy: {
      "/ws": { target: process.env.GAME_SERVER_DEV || "ws://127.0.0.1:8787", ws: true },
      "/health": process.env.GAME_SERVER_HTTP || "http://127.0.0.1:8787",
    },
  },
  plugins: [
    {
      name: "runtime-assets",
      closeBundle() {
        for (const folder of ["characters", "worlds", "props"])
          fs.cpSync(
            path.join("assets", folder),
            path.join("dist/assets", folder),
            { recursive: true },
          );
        fs.copyFileSync("assets/manifest.json", "dist/assets/manifest.json");
        fs.writeFileSync("dist/version.json", JSON.stringify(build, null, 2));
      },
    },
  ],
});
