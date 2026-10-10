// Serves recorded NHTSA responses (see README.md) for a fetch() URL. Unknown URLs get ok:false so a
// test can never silently pass on invented data.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = __dirname;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function fixtureFor(url: string): string | null {
  const u = new URL(url);
  const m = u.pathname.match(/DecodeVinValuesExtended\/([^/]+)$/i);
  if (m) {
    const vin = decodeURIComponent(m[1]).toUpperCase();
    return vin === "1HGCM82633A00435X"
      ? "decode-extended-invalid-check-digit.json"
      : `decode-extended-${vin}.json`;
  }
  if (/\/products\/vehicle\/models$/.test(u.pathname))
    return `recall-models-${slug(u.searchParams.get("make") || "")}-${u.searchParams.get("modelYear")}.json`;
  if (/\/recalls\/recallsByVehicle$/.test(u.pathname))
    return `recalls-${slug(u.searchParams.get("make") || "")}-${slug(u.searchParams.get("model") || "")}-${u.searchParams.get("modelYear")}.json`;
  return null;
}

export const fixtureFetch = async (url: string | URL) => {
  const name = fixtureFor(String(url));
  const path = name ? join(DIR, name) : null;
  if (!path || !existsSync(path))
    return { ok: false, status: 404, json: async () => ({}) } as any;
  const body = JSON.parse(readFileSync(path, "utf8"));
  return { ok: true, status: 200, json: async () => body } as any;
};

export const loadFixture = (name: string) =>
  JSON.parse(readFileSync(join(DIR, name), "utf8"));
