import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";

// Run from the repository root with the approved original PNG as the argument.
// Pixel extraction only: no redraw or generated interpretation.
const source = await fs.readFile(process.argv[2]);
const crop = { left: 300, top: 306, width: 648, height: 512 };
const { data, info } = await sharp(source)
  .extract(crop)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  // Remove the near-black matte; retain the artwork's original RGB samples.
  data[i + 3] = data[i + 2] > 30 && data[i + 2] - data[i] > 20 ? 255 : 0;
  if (!data[i + 3]) data.fill(0, i, i + 3);
}
const png = await sharp(data, { raw: info }).png().toBuffer();
await fs.writeFile("public/brand/DEALERHUNT-D.png", png);
await fs.writeFile(
  "public/brand/DEALERHUNT-D.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 648 512" role="img" aria-label="DealerHunt"><image id="dealerhunt-mark" width="648" height="512" href="data:image/png;base64,${png.toString("base64")}"/></svg>\n`,
);
console.log(
  JSON.stringify(
    {
      sourceSha256: crypto.createHash("sha256").update(source).digest("hex"),
      crop,
      extraction: "blue > 30 and blue - red > 20; original RGB retained",
      bytes: png.length,
    },
    null,
    2,
  ),
);
