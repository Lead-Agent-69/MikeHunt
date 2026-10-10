import { readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPERATOR_RESTORED_HOSTS,
  SITE_POLICY_BLOCKS,
} from "@/lib/scrapers/source-compliance";
import { imageProxyAccess, imageProxyAllowed } from "./proxy-access";

afterEach(() => vi.unstubAllEnvs());

describe("imageProxyAccess", () => {
  it.each([
    ["https://data.rebuildautos.com/photos/123.jpg", "operator_override"],
    ["https://www.rebuildautos.com/x.jpg", "operator_override"],
    ["https://img.prosalvage.com/a.jpg", "operator_override"],
    ["https://casmiami.com/a.jpg", "operator_override"],
    ["https://cdn.repairablevehicles.com/a.jpg", "restricted"],
    ["https://images.govdeals.com/a.jpg", "restricted"],
    ["https://municibid.com/a.jpg", "restricted"],
  ] as const)("%s -> %s (no proxied bytes)", (url, cls) => {
    expect(imageProxyAccess(url)).toBe(cls);
    expect(imageProxyAllowed(url)).toBe(false);
  });

  it("needs_permission blocks that are not operator-restored stay needs_permission", () => {
    const np = Object.entries(SITE_POLICY_BLOCKS).filter(
      ([d, b]) =>
        b.kind === "needs_permission" &&
        !OPERATOR_RESTORED_HOSTS.some((r) => d === r || d.endsWith(`.${r}`)),
    );
    for (const [domain] of np) {
      expect(imageProxyAccess(`https://img.${domain}/a.jpg`)).toBe(
        "needs_permission",
      );
    }
  });

  it("every policy-blocked or operator-restored host is denied, including subdomains", () => {
    for (const d of [
      ...OPERATOR_RESTORED_HOSTS,
      ...Object.keys(SITE_POLICY_BLOCKS),
    ]) {
      expect(imageProxyAllowed(`https://${d}/a.jpg`)).toBe(false);
      expect(imageProxyAllowed(`https://cdn.${d}/a.jpg`)).toBe(false);
    }
  });

  it("denies even when SCRAPE_TERMS_SAFE_ONLY flips the crawl restore", () => {
    for (const v of ["", "1"]) {
      vi.stubEnv("SCRAPE_TERMS_SAFE_ONLY", v);
      expect(imageProxyAllowed("https://data.rebuildautos.com/a.jpg")).toBe(
        false,
      );
    }
  });

  it.each([
    "https://images.craigslist.org/00a_x.jpg",
    "https://scontent.fbcdn.net/x.jpg",
    "https://www.salvagezone.com/images/vehicles/1.jpg",
    "https://cs.copart.com/v1/AUTH_svc.pdoc00001/PIX123.jpg",
  ])("open host stays proxyable: %s", (url) => {
    expect(imageProxyAccess(url)).toBe("open");
  });

  it("does not match lookalikes as open-or-blocked by substring", () => {
    expect(imageProxyAccess("https://notrebuildautos.com/a.jpg")).toBe("open");
    expect(
      imageProxyAccess("https://rebuildautos.com.attacker.example/a.jpg"),
    ).toBe("open");
  });

  it.each(["not-a-url", "file:///etc/passwd", "", null, undefined])(
    "unparseable / non-http is restricted: %s",
    (url) => {
      expect(imageProxyAccess(url)).toBe("restricted");
    },
  );
});

describe("CACHE_PHOTOS_MAX stays 0 (no photo copies)", () => {
  const root = process.cwd();
  const read = (p: string) => readFileSync(path.join(root, p), "utf8");

  it("deploy configs pin it to 0", () => {
    expect(read("Dockerfile.scraper")).toMatch(/^ENV CACHE_PHOTOS_MAX=0$/m);
    expect(read("fly.toml")).toMatch(/^\s*CACHE_PHOTOS_MAX = "0"$/m);
    expect(read("docs/zeus-deploy-checklist.md")).toMatch(
      /`CACHE_PHOTOS_MAX`[^\n]*`0`/,
    );
  });

  it("every reader defaults to 0 / off when unset", () => {
    for (const f of [
      "app/api/admin/cache-photos/route.ts",
      "lib/alerts/photo-sync-job.ts",
      "lib/data/photo-storage.ts",
    ]) {
      expect(read(f)).toMatch(
        /if \(raw === undefined \|\| raw === ""\) return 0;/,
      );
    }
    expect(read("lib/images/cache.ts")).toMatch(
      /if \(raw === undefined \|\| raw === ""\) return true;/,
    );
    expect(read("scripts/scrape-ci.ts")).toContain(
      'process.env.CACHE_PHOTOS_MAX || "0"',
    );
  });
});
