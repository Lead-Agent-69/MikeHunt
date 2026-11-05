import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Rasterize the approved extraction without redrawing its geometry or gradient.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const pngMark = await fs.readFile(
  path.join(publicDir, "brand/DEALERHUNT-D.png"),
);
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="DealerHunt">
<rect width="128" height="128" rx="28" fill="#050b18"/>
<image x="27" y="34.765432" width="74" height="58.469136" href="data:image/png;base64,${pngMark.toString("base64")}"/></svg>`;
await fs.writeFile(path.join(publicDir, "dealerhunt-icon.svg"), icon);
await fs.writeFile(path.join(publicDir, "icon.svg"), icon);
for (const size of [96, 128, 192, 256, 384, 512]) {
  await sharp(Buffer.from(icon))
    .resize(size, size)
    .png()
    .toFile(path.join(publicDir, `icon-${size}x${size}.png`));
}
for (const size of [192, 512]) {
  // All artwork stays inside the central maskable safe zone.
  const maskable = icon.replace('rx="28"', 'rx="0"');
  await sharp(Buffer.from(maskable))
    .resize(size, size)
    .png()
    .toFile(path.join(publicDir, `icon-maskable-${size}x${size}.png`));
}
for (const size of [120, 152, 180]) {
  await sharp(Buffer.from(icon))
    .resize(size, size)
    .png()
    .toFile(path.join(publicDir, `apple-touch-icon-${size}x${size}.png`));
}
await fs.copyFile(
  path.join(publicDir, "apple-touch-icon-180x180.png"),
  path.join(publicDir, "apple-touch-icon.png"),
);
for (const size of [16, 32]) {
  await sharp(Buffer.from(icon))
    .resize(size, size)
    .png()
    .toFile(path.join(publicDir, `favicon-${size}x${size}.png`));
}
await fs.copyFile(
  path.join(publicDir, "favicon-32x32.png"),
  path.join(publicDir, "favicon-32.png"),
);
const png = await fs.readFile(path.join(publicDir, "favicon-32x32.png"));
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = header[7] = 32;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await fs.writeFile(
  path.join(publicDir, "favicon.ico"),
  Buffer.concat([header, png]),
);
// Safari's pinned-tab mask needs true vector artwork; do not fabricate a trace.
console.log(
  "DealerHunt web and PWA icons generated from the approved extraction; Safari pinned-tab mask unchanged pending vector artwork.",
);
