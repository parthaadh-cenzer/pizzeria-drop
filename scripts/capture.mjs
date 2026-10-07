import { chromium } from "playwright";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(process.env.PREVIEW_URL || "http://127.0.0.1:5173");
await page.waitForFunction(() => window.dropStudio?.state.tiles > 0);
await page.waitForTimeout(1800);
await page.screenshot({ path: "assets/reports/volcano-preview.png" });
console.log("volcano", await page.evaluate(() => window.dropStudio.state));
await page.click('[data-world="cityscape"]');
await page.waitForTimeout(800);
await page.screenshot({ path: "assets/reports/cityscape-preview.png" });
await page.click("#roster");
await page.waitForTimeout(500);
await page.screenshot({ path: "assets/reports/characters-preview.png" });
console.log("errors", errors);
fs.writeFileSync(
  "assets/reports/browser-errors.json",
  JSON.stringify(errors, null, 2),
);
await browser.close();
