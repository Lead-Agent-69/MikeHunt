import { describe, expect, it, vi } from "vitest";

const fetchPublicImage = vi.hoisted(() => vi.fn());
vi.mock("../net/fetch-public-image", () => ({ fetchPublicImage }));

import { fetchListingPhoto, sniffImageType } from "./fetch-listing-photo";

const CL = "https://images.craigslist.org/abc_600x450.jpg";
const bytes = (...xs: (number | string)[]) =>
  Buffer.concat(
    xs.map((x) =>
      typeof x === "string" ? Buffer.from(x, "latin1") : Buffer.from([x]),
    ),
  );
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, "JFIF");
const PNG = bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, "IHDR");
const GIF = bytes("GIF89a", 1, 0, 1, 0);
const WEBP = bytes("RIFF", 0x24, 0, 0, 0, "WEBPVP8 ");
const AVIF = Buffer.concat([
  u32(0x1c),
  bytes("ftypavif"),
  u32(0),
  bytes("avifmif1miaf"),
]);
const AVIF_COMPAT = Buffer.concat([
  u32(0x18),
  bytes("ftypmif1"),
  u32(0),
  bytes("miafavif"),
]);

describe("sniffImageType", () => {
  it.each([
    ["jpeg", JPEG, "image/jpeg"],
    ["png", PNG, "image/png"],
    ["gif", GIF, "image/gif"],
    ["webp", WEBP, "image/webp"],
    ["avif (major brand)", AVIF, "image/avif"],
    ["avif (compatible brand)", AVIF_COMPAT, "image/avif"],
  ])("detects %s", (_n, buf, type) => expect(sniffImageType(buf)).toBe(type));

  it.each([
    ["svg", bytes('<svg xmlns="http://www.w3.org/2000/svg">')],
    ["html", bytes("<!doctype html><html>")],
    ["empty", Buffer.alloc(0)],
    ["truncated jpeg", bytes(0xff, 0xd8)],
    ["riff not webp", bytes("RIFF", 0, 0, 0, 0, "WAVEfmt ")],
    [
      "mp4 ftyp",
      Buffer.concat([u32(0x18), bytes("ftypisom"), u32(0), bytes("isomiso2")]),
    ],
    [
      "heic ftyp",
      Buffer.concat([u32(0x18), bytes("ftypheic"), u32(0), bytes("mif1heic")]),
    ],
    ["zip", bytes("PK", 3, 4)],
  ])("refuses %s", (_n, buf) => expect(sniffImageType(buf)).toBeNull());
});

describe("fetchListingPhoto stores only sniffed raster types", () => {
  const res = (body: Buffer, contentType = "image/jpeg") => ({
    ok: true,
    body,
    contentType,
    finalUrl: CL,
  });

  it("missing / octet-stream type with non-image bytes is refused (no jpeg default)", async () => {
    // fetchPublicImage maps missing / octet-stream to image/jpeg for the proxy; storage must not.
    fetchPublicImage.mockResolvedValueOnce(
      res(bytes("<html>not an image</html>")),
    );
    expect(await fetchListingPhoto(CL)).toBeNull();
  });

  it("labeled image/jpeg but actually PNG is stored as image/png", async () => {
    fetchPublicImage.mockResolvedValueOnce(res(PNG, "image/jpeg"));
    expect(await fetchListingPhoto(CL)).toEqual({
      body: PNG,
      contentType: "image/png",
    });
  });

  it("octet-stream with real WebP bytes is stored as image/webp", async () => {
    fetchPublicImage.mockResolvedValueOnce(res(WEBP));
    expect((await fetchListingPhoto(CL))?.contentType).toBe("image/webp");
  });

  it("non-allowlisted URL is refused before any fetch", async () => {
    fetchPublicImage.mockClear();
    expect(await fetchListingPhoto("https://evil.example/a.jpg")).toBeNull();
    expect(fetchPublicImage).not.toHaveBeenCalled();
  });
});
