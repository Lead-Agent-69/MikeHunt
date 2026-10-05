import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

// Collect every page route under app/, dropping route groups like "(marketing)".
function collectRoutes(dir: string, segments: string[] = []): Set<string> {
  const routes = new Set<string>();
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "api" || entry.startsWith("_")) continue;
      const next = /^\(.*\)$/.test(entry) ? segments : [...segments, entry];
      collectRoutes(full, next).forEach((route) => routes.add(route));
    } else if (/^page\.(tsx|ts|jsx|js)$/.test(entry)) {
      routes.add("/" + segments.join("/"));
    }
  }
  return routes;
}

const routes = collectRoutes(path.join(root, "app"));
const landing = read("components/landing/PremiumLandingPage.tsx");

function hrefs(source: string) {
  const pattern = /href=(?:"([^"]*)"|\{"([^"]*)"\})/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) found.push(match[1] ?? match[2]);
  return found;
}

describe("public site links", () => {
  it.each([
    "components/layout/PublicLayout.tsx",
    "components/landing/PremiumLandingPage.tsx",
  ])("%s only links to routes and landing sections that exist", (file) => {
    const links = hrefs(read(file));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href, `${file} has a placeholder link`).not.toBe("#");
      if (!href.startsWith("/")) continue;
      const [pathname, hash] = href.split("#");
      expect(routes.has(pathname || "/"), `${file} links to missing ${href}`).toBe(true);
      if (hash) {
        expect(landing, `${file} links to missing anchor #${hash}`).toContain(
          `id="${hash}"`,
        );
      }
    }
  });

  it("sanity: route collection sees the legal pages", () => {
    expect(routes.has("/privacy")).toBe(true);
    expect(routes.has("/tos")).toBe(true);
    expect(existsSync(path.join(root, "app/(marketing)/tos/page.tsx"))).toBe(true);
  });
});
