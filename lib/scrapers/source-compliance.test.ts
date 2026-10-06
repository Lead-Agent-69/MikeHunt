import { describe, expect, it } from "vitest";
import { CURATED_SITES, orderCuratedSitesForPlan } from "./curated-sites";
import {
  createRobotsGate,
  policyBlockFor,
  robotsAllows,
} from "./source-compliance";

const ROBOTS = `
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /admin/
Disallow: /auction/*filters=
Disallow: /search$
Allow: /admin/public
`;

describe("robotsAllows", () => {
  it("applies the * group: prefix, wildcard, end anchor, and longest-match Allow", () => {
    expect(robotsAllows(ROBOTS, "https://x.com/inventory")).toBe(true);
    expect(robotsAllows(ROBOTS, "https://x.com/admin/secret")).toBe(false);
    expect(robotsAllows(ROBOTS, "https://x.com/admin/public/list")).toBe(true);
    expect(robotsAllows(ROBOTS, "https://x.com/auction/12?filters=a")).toBe(
      false,
    );
    expect(robotsAllows(ROBOTS, "https://x.com/search")).toBe(false);
    expect(robotsAllows(ROBOTS, "https://x.com/search/cars")).toBe(true);
  });

  it("treats an empty Disallow and an empty file as allow-all, and Disallow: / as block-all", () => {
    expect(robotsAllows("User-agent: *\nDisallow:", "https://x.com/a")).toBe(
      true,
    );
    expect(robotsAllows("", "https://x.com/a")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /", "https://x.com/")).toBe(
      false,
    );
  });

  it("uses our own group over * when one names us", () => {
    const body =
      "User-agent: *\nDisallow:\n\nUser-agent: MikeHuntBot\nDisallow: /";
    expect(robotsAllows(body, "https://x.com/a")).toBe(false);
  });
});

describe("createRobotsGate", () => {
  it("caches per origin, allows on a 404, and blocks on a 5xx or network error", async () => {
    const calls: string[] = [];
    const responses: Record<string, { status: number; body?: string } | Error> =
      {
        "https://a.com/robots.txt": {
          status: 200,
          body: "User-agent: *\nDisallow: /private",
        },
        "https://b.com/robots.txt": { status: 404 },
        "https://c.com/robots.txt": { status: 503 },
        "https://d.com/robots.txt": new Error("ECONNRESET"),
      };
    const gate = createRobotsGate(async (url) => {
      calls.push(url);
      const r = responses[url];
      if (r instanceof Error) throw r;
      return { status: r.status, text: async () => r.body || "" };
    });
    expect(await gate("https://a.com/inventory")).toBe(true);
    expect(await gate("https://a.com/private/x")).toBe(false);
    expect(await gate("https://b.com/anything")).toBe(true);
    expect(await gate("https://c.com/")).toBe(false);
    expect(await gate("https://d.com/")).toBe(false);
    expect(calls.filter((u) => u.startsWith("https://a.com"))).toHaveLength(1);
  });
});

describe("policyBlockFor", () => {
  it("blocks sites whose terms ban bots or copying, on any subdomain", () => {
    expect(policyBlockFor("https://www.prosalvage.com/")?.kind).toBe(
      "tos_bans_bots",
    );
    expect(policyBlockFor("https://m.bidgodrive.com/x")?.kind).toBe(
      "tos_bans_copying",
    );
    expect(policyBlockFor("https://www.damage.com/")).toBeUndefined();
    expect(policyBlockFor("not a url")).toBeUndefined();
  });

  it("every block has a reason, and the curated list still has crawlable sites", () => {
    const allowed = CURATED_SITES.filter((s) => !policyBlockFor(s.url));
    expect(allowed.length).toBeGreaterThan(80);
    const blocked = CURATED_SITES.filter((s) => policyBlockFor(s.url));
    for (const site of blocked)
      expect(policyBlockFor(site.url)?.reason.length).toBeGreaterThan(20);
  });
});

describe("curated demand-ring density", () => {
  const crawlable = CURATED_SITES.filter((s) => !policyBlockFor(s.url));
  const perState = (st: string) =>
    crawlable.filter((s) => s.state === st).length;

  it("gap anchor states each have at least 12 crawlable curated dealers", () => {
    for (const st of ["IA", "IL", "KY", "FL"])
      expect(perState(st), st).toBeGreaterThanOrEqual(12);
    expect(perState("MO")).toBeGreaterThanOrEqual(12);
  });

  it("has no duplicate hosts in the curated list", () => {
    const hosts = CURATED_SITES.map((s) =>
      new URL(s.url).hostname.replace(/^www\./, "").toLowerCase(),
    );
    const dupes = hosts.filter((h, i) => hosts.indexOf(h) !== i);
    expect(dupes).toEqual([]);
  });

  it("orders planned (gap-first) states ahead of the rest, national sites next", () => {
    const sites = [
      { state: "MO", n: 1 },
      { state: undefined, n: 2 },
      { state: "KY", n: 3 },
      { state: "TX", n: 4 },
      { state: "IA", n: 5 },
    ];
    expect(
      orderCuratedSitesForPlan(sites, ["IA", "KY", "MO"]).map((s) => s.n),
    ).toEqual([5, 3, 1, 2, 4]);
    expect(orderCuratedSitesForPlan(sites, []).map((s) => s.n)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });
});
