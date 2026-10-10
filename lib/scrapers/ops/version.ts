/**
 * Which scraper code is live: the git SHA and image build time stamped onto every scraper_runs row
 * and shown on /status.
 *
 * Resolution order (first hit wins):
 *  1. env SCRAPER_GIT_SHA / SCRAPER_BUILT_AT
 *  2. .scraper-version.json in the app root, written right before the image build by
 *     scripts/write-scraper-version.sh (the Docker build context excludes .git, so the image can't
 *     ask git; the file is copied in with the code, so it always matches the code it ships with)
 *  3. .git/HEAD in the working tree (local `npm run scrape:ci`, GitHub Actions)
 * Anything unknown is null. Never throws.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export interface ScraperVersion {
  gitSha: string | null;
  builtAt: string | null;
  source: "env" | "file" | "git" | "unknown";
}

const SHA_RE = /^[0-9a-f]{7,40}$/i;

function cleanSha(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return SHA_RE.test(s) ? s.toLowerCase() : null;
}

function cleanTime(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function readGitSha(root: string): string | null {
  try {
    const gitDir = path.join(root, ".git");
    const head = readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref:")) return cleanSha(head);
    const ref = head.slice(4).trim();
    try {
      return cleanSha(readFileSync(path.join(gitDir, ref), "utf8"));
    } catch {
      const packed = readFileSync(path.join(gitDir, "packed-refs"), "utf8");
      const line = packed.split("\n").find((l) => l.trim().endsWith(` ${ref}`));
      return line ? cleanSha(line.split(" ")[0]) : null;
    }
  } catch {
    return null;
  }
}

export function resolveScraperVersion(
  env: Record<string, string | undefined> = process.env,
  root: string = process.cwd(),
): ScraperVersion {
  const envSha = cleanSha(env.SCRAPER_GIT_SHA);
  if (envSha)
    return {
      gitSha: envSha,
      builtAt: cleanTime(env.SCRAPER_BUILT_AT),
      source: "env",
    };
  try {
    const file = JSON.parse(
      readFileSync(path.join(root, ".scraper-version.json"), "utf8"),
    );
    const sha = cleanSha(file?.gitSha);
    if (sha)
      return { gitSha: sha, builtAt: cleanTime(file?.builtAt), source: "file" };
  } catch {
    // no stamp file
  }
  const gitSha = readGitSha(root);
  if (gitSha)
    return { gitSha, builtAt: cleanTime(env.SCRAPER_BUILT_AT), source: "git" };
  return {
    gitSha: null,
    builtAt: cleanTime(env.SCRAPER_BUILT_AT),
    source: "unknown",
  };
}

let cached: ScraperVersion | null = null;

export function scraperVersion(): ScraperVersion {
  if (!cached) cached = resolveScraperVersion();
  return cached;
}

/** Tests only. */
export function resetScraperVersion() {
  cached = null;
}
