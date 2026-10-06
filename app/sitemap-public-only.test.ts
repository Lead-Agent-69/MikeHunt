import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sitemap = readFileSync("public/sitemap.xml", "utf8");
const paths = (sitemap.match(/<loc>[^<]*<\/loc>/g) || []).map(
  (loc) =>
    loc.replace(/<\/?loc>/g, "").replace("https://mikehunt.com", "") || "/",
);

describe("public sitemap", () => {
  it("lists no flip-only tool pages", () => {
    for (const route of [
      "/lane",
      "/fleet",
      "/auctions",
      "/arbitrage",
      "/finance",
      "/list",
      "/find",
      "/best-buy",
      "/market",
    ]) {
      expect(paths).not.toContain(route);
    }
  });

  it("keeps the pages every buyer can use", () => {
    expect(paths).toEqual(
      expect.arrayContaining(["/", "/discover", "/scan", "/deal-check"]),
    );
  });
});
