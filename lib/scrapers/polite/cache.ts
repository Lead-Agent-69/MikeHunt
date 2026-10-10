/**
 * Conditional-request cache. We remember each page's ETag / Last-Modified (and body) and send
 * If-None-Match / If-Modified-Since next time, so an unchanged page costs the site a 304 instead of a
 * full render. A short fresh window (`freshForMs`) skips the request entirely.
 *
 * Memory-backed by default; set POLITE_CACHE_DIR (Zeus) to persist across restarts.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface CachedPage {
  url: string;
  status: number;
  body: string;
  etag?: string;
  lastModified?: string;
  fetchedAt: number;
}

export interface PageCache {
  get(url: string): CachedPage | undefined;
  set(page: CachedPage): void;
}

export class MemoryPageCache implements PageCache {
  private pages = new Map<string, CachedPage>();
  constructor(private readonly maxEntries = 2_000) {}
  get(url: string) {
    return this.pages.get(url);
  }
  set(page: CachedPage) {
    if (this.pages.size >= this.maxEntries && !this.pages.has(page.url)) {
      const oldest = this.pages.keys().next().value;
      if (oldest !== undefined) this.pages.delete(oldest);
    }
    this.pages.set(page.url, page);
  }
}

export class DiskPageCache implements PageCache {
  private memory = new MemoryPageCache(500);
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  private file(url: string) {
    return path.join(
      this.dir,
      `${createHash("sha256").update(url).digest("hex").slice(0, 32)}.json`,
    );
  }
  get(url: string) {
    const hit = this.memory.get(url);
    if (hit) return hit;
    try {
      const page = JSON.parse(
        readFileSync(this.file(url), "utf8"),
      ) as CachedPage;
      if (page.url !== url) return undefined;
      this.memory.set(page);
      return page;
    } catch {
      return undefined;
    }
  }
  set(page: CachedPage) {
    this.memory.set(page);
    try {
      writeFileSync(this.file(page.url), JSON.stringify(page));
    } catch {
      // Cache is an optimization; a full disk must never fail the crawl.
    }
  }
}

export function defaultPageCache(): PageCache {
  const dir = process.env.POLITE_CACHE_DIR;
  if (dir) {
    try {
      return new DiskPageCache(dir);
    } catch {
      // fall through to memory
    }
  }
  return new MemoryPageCache();
}

/** Validator headers for a conditional GET, or {} when we have nothing cached. */
export function conditionalHeaders(
  page: CachedPage | undefined,
): Record<string, string> {
  if (!page) return {};
  const h: Record<string, string> = {};
  if (page.etag) h["If-None-Match"] = page.etag;
  if (page.lastModified) h["If-Modified-Since"] = page.lastModified;
  return h;
}
