import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Rasterize our code-native mark once; no remote artwork or runtime image work.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const mark = await fs.readFile(path.join(publicDir, "brand/DEALERHUNT-D.svg"), "utf8");
const paths = [...mark.matchAll(/<path[^>]+\/>/g)]
  .map(([element]) => element.replace(/fill="[^"]+"/, 'fill="#fff"'))
  .join("");
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="DealerHunt">
<defs><linearGradient id="tile" x2="0.5" y2="1"><stop stop-color="#2677ff"/><stop offset="1" stop-color="#1737ed"/></linearGradient></defs>
<rect width="128" height="128" rx="28" fill="url(#tile)"/>
<g transform="translate(22.4 27.6) scale(.65)">${paths}</g></svg>`;
await fs.writeFile(path.join(publicDir, "dealerhunt-icon.svg"), icon);
await fs.writeFile(path.join(publicDir, "icon.svg"), icon);
for (const size of [96, 128, 192, 256, 384, 512]) {
  await sharp(Buffer.from(icon)).resize(size, size).png().toFile(path.join(publicDir, `icon-${size}x${size}.png`));
}
for (const size of [192, 512]) {
  // All artwork stays inside the central maskable safe zone.
  const maskable = icon.replace('rx="28"', 'rx="0"');
  await sharp(Buffer.from(maskable)).resize(size, size).png().toFile(path.join(publicDir, `icon-maskable-${size}x${size}.png`));
}
for (const size of [120, 152, 180]) {
  await sharp(Buffer.from(icon)).resize(size, size).png().toFile(path.join(publicDir, `apple-touch-icon-${size}x${size}.png`));
}
await fs.copyFile(path.join(publicDir, "apple-touch-icon-180x180.png"), path.join(publicDir, "apple-touch-icon.png"));
for (const size of [16, 32]) {
  await sharp(Buffer.from(icon)).resize(size, size).png().toFile(path.join(publicDir, `favicon-${size}x${size}.png`));
}
await fs.copyFile(path.join(publicDir, "favicon-32x32.png"), path.join(publicDir, "favicon-32.png"));
const png = await fs.readFile(path.join(publicDir, "favicon-32x32.png"));
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = header[7] = 32;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await fs.writeFile(path.join(publicDir, "favicon.ico"), Buffer.concat([header, png]));
await fs.writeFile(path.join(publicDir, "safari-pinned-tab.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 112" aria-label="DealerHunt">${paths.replaceAll('fill="#fff"', 'fill="#000"')}</svg>`);
console.log("DealerHunt icons generated from the shared arrow-D mark.");
