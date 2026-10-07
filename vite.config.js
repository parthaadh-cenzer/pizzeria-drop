import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
// Ship only generated runtime files. Source FBXs never enter the hosting bundle.
export default defineConfig({
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
      },
    },
  ],
});
