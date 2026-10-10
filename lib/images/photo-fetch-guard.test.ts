import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchPublicImage = vi.hoisted(() => vi.fn());
vi.mock("../net/fetch-public-image", () => ({ fetchPublicImage }));

import { cacheVehiclePhotos } from "./cache";
import { syncDealPhotos } from "../data/photo-storage";
import { PHOTO_CACHE_MAX_BYTES } from "./fetch-listing-photo";

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });

describe("photo caches never use global fetch()", () => {
  it("lib/images/** and lib/data/photo-storage.ts have no bare fetch(", () => {
    const files = [...walk("lib/images"), "lib/data/photo-storage.ts"];
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8")
        // Strings first (so "https://" isn't read as a comment), then comments.
        .replace(
          /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g,
          '""',
        )
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      // Any reference to the global fetch: fetch(, (fetch)(, const f = fetch, globalThis.fetch,
      // window.fetch. Member calls on other objects (x.fetch) and fetchPublicImage are fine.
      return (
        /(?<![\w.$])fetch(?![\w$])/.test(src) ||
        /\b(?:globalThis|window|self)\.fetch(?![\w$])/.test(src)
      );
    });
    expect(offenders).toEqual([]);
  });

  it("both caches download through fetchListingPhoto", () => {
    expect(readFileSync("lib/images/cache.ts", "utf8")).toContain(
      "fetchListingPhoto(",
    );
    expect(readFileSync("lib/data/photo-storage.ts", "utf8")).toContain(
      "fetchListingPhoto(",
    );
  });
});

function storage() {
  const uploads: string[] = [];
  const sb: any = {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://sb.example/storage/v1/object/public/x/${path}`,
          },
        }),
      }),
    },
  };
  return { sb, uploads };
}

const okImage = {
  ok: true,
  body: Buffer.from([1, 2, 3]),
  contentType: "image/jpeg",
  finalUrl: "",
};
const CL = "https://images.craigslist.org/abc_600x450.jpg";

describe("photo caches stay dormant at CACHE_PHOTOS_MAX=0", () => {
  const prev = process.env.CACHE_PHOTOS_MAX;
  beforeEach(() => fetchPublicImage.mockReset());
  afterEach(() => {
    if (prev === undefined) delete process.env.CACHE_PHOTOS_MAX;
    else process.env.CACHE_PHOTOS_MAX = prev;
  });

  it.each([undefined, "", "0"])(
    "CACHE_PHOTOS_MAX=%s fetches nothing",
    async (v) => {
      if (v === undefined) delete process.env.CACHE_PHOTOS_MAX;
      else process.env.CACHE_PHOTOS_MAX = v;
      const { sb, uploads } = storage();
      expect(await cacheVehiclePhotos(sb, "d1", [CL])).toEqual([]);
      expect(
        await syncDealPhotos(sb, { id: "d1", images: [CL] } as any),
      ).toBeNull();
      expect(fetchPublicImage).not.toHaveBeenCalled();
      expect(uploads).toEqual([]);
    },
  );
});

describe("photo caches when enabled (opt-in only)", () => {
  beforeEach(() => {
    fetchPublicImage.mockReset();
    process.env.CACHE_PHOTOS_MAX = "6";
  });
  afterEach(() => {
    delete process.env.CACHE_PHOTOS_MAX;
  });

  it("cacheVehiclePhotos: allowlisted host via fetchPublicImage with a byte cap; others skipped", async () => {
    fetchPublicImage.mockResolvedValue(okImage);
    const { sb, uploads } = storage();
    const out = await cacheVehiclePhotos(sb, "d1", [
      "http://169.254.169.254/latest/meta-data/",
      "https://evil.example/a.jpg",
      CL,
    ]);
    expect(fetchPublicImage).toHaveBeenCalledTimes(1);
    const [url, allow, , opts] = fetchPublicImage.mock.calls[0];
    expect(url).toBe(CL);
    expect(allow("https://evil.example/a.jpg")).toBe(false);
    expect(allow(CL)).toBe(true);
    expect(opts).toEqual({ maxBytes: PHOTO_CACHE_MAX_BYTES });
    expect(uploads).toEqual(["d1/2.jpg"]);
    expect(out).toHaveLength(1);
  });

  it("syncDealPhotos: refused or failed fetch uploads nothing", async () => {
    const { sb, uploads } = storage();
    expect(
      await syncDealPhotos(sb, {
        id: "d1",
        images: ["https://evil.example/a.jpg"],
      } as any),
    ).toBeNull();
    expect(fetchPublicImage).not.toHaveBeenCalled();
    fetchPublicImage.mockRejectedValueOnce(new Error("UrlNotAllowed"));
    expect(
      await syncDealPhotos(sb, { id: "d1", images: [CL] } as any),
    ).toBeNull();
    fetchPublicImage.mockResolvedValueOnce({
      ok: false,
      status: 415,
      reason: "not an image",
    });
    expect(
      await syncDealPhotos(sb, { id: "d1", images: [CL] } as any),
    ).toBeNull();
    expect(uploads).toEqual([]);
  });

  it("syncDealPhotos: allowlisted image uploads via the pinned path", async () => {
    fetchPublicImage.mockResolvedValueOnce(okImage);
    const { sb, uploads } = storage();
    const url = await syncDealPhotos(sb, { id: "d1", images: [CL] } as any);
    expect(url).toContain("d1/primary.jpeg");
    expect(uploads).toEqual(["d1/primary.jpeg"]);
  });
});
