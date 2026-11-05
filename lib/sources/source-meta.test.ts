import { describe, expect, it, vi } from "vitest";
import {
  dealerSourceIdForHost,
  dealerSourceIdFromUrl,
  displaySource,
  sourceMeta,
  dealerSourceOptions,
  sourceFromUrl,
  DEALER_SOURCE_DOMAINS,
} from "./source-meta";
import { CURATED_SITES } from "@/lib/scrapers/curated-sites";
import { hostMatches, hostOf } from "@/lib/net/host-match";

describe("source display metadata", () => {
  const legacySource = (url: string) => {
    const host = hostOf(url);
    if (!host) return null;
    for (const [domains, source] of [
      [["govdeals.com"], "govdeals"],
      [["publicsurplus.com"], "publicsurplus"],
      [["allsurplus.com", "liquidityservices.com"], "allsurplus"],
      [["municibid.com"], "municibid"],
      [["gsaauctions.gov", "gsa.gov"], "gsa_auctions"],
    ] as const)
      if (domains.some((domain) => hostMatches(host, domain))) return source;
    return (
      Object.entries(DEALER_SOURCE_DOMAINS)
        .find(([, domains]) =>
          domains.some((domain) => hostMatches(host, domain)),
        )?.[0]
        .replace(/-/g, "_") || null
    );
  };

  it("preserves government precedence and every registered dealer across normalized host/cache variants", () => {
    const domains = [
      "govdeals.com",
      "publicsurplus.com",
      "allsurplus.com",
      "liquidityservices.com",
      "municibid.com",
      "gsaauctions.gov",
      "gsa.gov",
      ...Object.values(DEALER_SOURCE_DOMAINS).flat(),
    ];
    for (const domain of domains)
      for (const host of [
        domain,
        `sub.${domain.toUpperCase()}..`,
        `${domain}.attacker.test`,
      ]) {
        const first = `https://${host}/inventory/one?owner=first`;
        const second = `http://${host}/different/listing?owner=second#photo`;
        expect(sourceFromUrl(first), first).toBe(legacySource(first));
        expect(sourceFromUrl(second), second).toBe(legacySource(second));
      }
  });

  it("does not share unrestricted source results with allowed-dealer lookups", () => {
    const url = "https://www.dgautollc.com/inventory/123";
    expect(sourceFromUrl(url)).toBe("dg_auto");
    expect(dealerSourceIdFromUrl(url, ["ae-of-miami"])).toBeNull();
    expect(dealerSourceIdFromUrl(url, ["DG-AUTO"])).toBe("dg-auto");
    expect(dealerSourceIdFromUrl(url, [])).toBe("dg-auto");
  });

  it("caches normalized-host misses across paths, then evicts within the 1024-host bound", () => {
    const OriginalURL = globalThis.URL;
    let parses = 0;
    vi.stubGlobal(
      "URL",
      class extends OriginalURL {
        constructor(input: string | URL, base?: string | URL) {
          super(input, base);
          parses++;
        }
      },
    );
    try {
      expect(
        sourceFromUrl("https://cache-contract-only.test/private-one?q=one"),
      ).toBeNull();
      parses = 0;
      expect(
        sourceFromUrl("http://CACHE-CONTRACT-ONLY.TEST../private-two?q=two"),
      ).toBeNull();
      expect(parses).toBe(1); // host normalization only: no second registry URL parse
      for (let i = 0; i < 1024; i++)
        sourceFromUrl(`https://fill-${i}.cache-contract-only.test/path`);
      parses = 0;
      expect(
        sourceFromUrl("https://cache-contract-only.test/again"),
      ).toBeNull();
      expect(parses).toBe(2); // evicted: normal URL + uncached registry lookup
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("gives every nationwide registered dealer a stable, named filter identity", () => {
    const options = dealerSourceOptions();
    for (const site of CURATED_SITES) {
      if (sourceMeta(sourceFromUrl(site.url)).channel === "gov") continue;
      const id = dealerSourceIdFromUrl(site.url);
      expect(id, site.url).toBeTruthy();
      expect(options.some((option) => option.id === id)).toBe(true);
      expect(sourceMeta(id).channel).not.toBe("marketplace");
      expect(sourceMeta(id).label).not.toMatch(/^Dealer /);
    }
    expect(new Set(options.map((option) => option.id)).size).toBe(
      options.length,
    );
  });

  it("does not mistake lookalike or query-string hosts for a dealer", () => {
    expect(
      dealerSourceIdFromUrl("https://dgautollc.com.example.org/car"),
    ).toBeNull();
    expect(
      dealerSourceIdFromUrl("https://example.org/?url=aeofmiami.com"),
    ).toBeNull();
  });
  it("uses listing URLs to show the real government source", () => {
    const source = displaySource(
      "gov_auction",
      "https://www.govdeals.com/asset/1234/25370",
    );

    expect(source).toBe("govdeals");
    expect(sourceMeta(source).label).toBe("GovDeals");
  });

  it("normalizes named small dealer source ids", () => {
    expect(sourceMeta("ae-of-miami").label).toBe("AE of Miami");
    expect(sourceMeta("stjames-auto").label).toBe("St. James Auto");
  });

  it("resolves small dealer source ids from hosts and listing URLs", () => {
    expect(dealerSourceIdForHost("https://www.aeofmiami.com/inventory")).toBe(
      "ae-of-miami",
    );
    expect(dealerSourceIdForHost("stjamesautoparts.com")).toBe("stjames-auto");
    expect(
      dealerSourceIdFromUrl("https://www.dgautollc.com/inventory/123", [
        "dg-auto",
      ]),
    ).toBe("dg-auto");
    expect(
      dealerSourceIdFromUrl("https://www.dgautollc.com/inventory/123", [
        "ae-of-miami",
      ]),
    ).toBeNull();
  });
});
