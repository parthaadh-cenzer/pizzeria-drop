// Generates PWA / Apple touch icons from a single SVG source (run: node scripts/make-icons.mjs).
import sharp from "sharp";
import fs from "node:fs";

const icon = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#1b1d29"/>
<g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">
<rect x="32" y="32" width="448" height="448" rx="104" fill="#ffb54d"/>
<circle cx="256" cy="256" r="138" fill="#1b1d29"/>
<rect x="104" y="238" width="304" height="36" rx="18" fill="#ffb54d"/>
<circle cx="256" cy="256" r="138" fill="none" stroke="#1b1d29" stroke-width="28"/>
</g></svg>`;
fs.mkdirSync("public/icons", { recursive: true });
const outputs = [
  ["public/icons/icon-192.png", 192, 0],
  ["public/icons/icon-512.png", 512, 0],
  ["public/icons/maskable-512.png", 512, 60],
  ["public/icons/apple-touch-icon.png", 180, 0],
];
for (const [file, size, pad] of outputs) {
  await sharp(Buffer.from(icon(pad))).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  console.log(file, fs.statSync(file).size, "bytes");
}
