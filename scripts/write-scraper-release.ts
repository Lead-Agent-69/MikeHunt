import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseScraperRelease,
  SCRAPER_RELEASE_PATH,
} from "../lib/scrapers/release-provenance";

export function writeScraperRelease(
  metadata: { revision?: string; builtAt?: string; context?: string },
  file = SCRAPER_RELEASE_PATH,
) {
  const candidate = { version: 1, ...metadata };
  const release = parseScraperRelease(candidate);
  // A plain/legacy build remains unknown; partially supplied metadata is an error.
  if (
    release.status === "unknown" &&
    Object.values(metadata).some((value) => value && value !== "unknown")
  )
    throw new Error("Incomplete or invalid scraper image provenance.");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(release), { mode: 0o444 });
  return release;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  writeScraperRelease({
    revision: process.env.SCRAPER_SOURCE_REVISION,
    builtAt: process.env.SCRAPER_BUILT_AT,
    context: process.env.SCRAPER_BUILD_CONTEXT,
  });
}
