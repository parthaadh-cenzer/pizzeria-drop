import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
// Ship only generated runtime files. Source FBXs never enter the hosting bundle.
export default defineConfig({
  build: { chunkSizeWarningLimit: 850 },
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
