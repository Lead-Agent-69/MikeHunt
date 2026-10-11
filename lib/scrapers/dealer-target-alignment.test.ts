import { describe, expect, it } from "vitest";
import {
  normalizeBuyerScope,
  planScrapeForBuyerScope,
  resolveBuyerSourceRequest,
  CURATED_DEALER_SOURCE_IDS,
} from "./buyer-scope";
import {
  DEALER_SOURCE_DOMAINS,
  matchesRequestedDealer,
  sourceMeta,
  sourceFromUrl,
  dealerSourceOptions,
} from "@/lib/sources/source-meta";

describe("buyer and worker dealer targeting", () => {
  it("offers every supported target in the Sources picker with readable dealer names", () => {
    const options = dealerSourceOptions();
    expect(options.map((option) => option.id).sort()).toEqual(
      [...CURATED_DEALER_SOURCE_IDS].sort(),
    );
    for (const option of options) {
      expect(option.label).not.toContain("_");
      expect(
        normalizeBuyerScope({ dealerSourceIds: [option.id] }).dealerSourceIds,
      ).toEqual([option.id]);
      expect(
        matchesRequestedDealer({ url: `https://${option.host}` }, [option.id]),
      ).toBe(true);
    }
  });
  it.each([
    "autovada",
    "polecats",
    "elite-sikeston",
    "riverbend-rebuildables",
    "premier-salvage",
    "garys-auto-ia",
  ])("accepts the already-supported dealer %s end to end", (id) => {
    const plan = planScrapeForBuyerScope({
      state: "MO",
      dealerSourceIds: [id],
    });
    expect(plan.sourceIds).toEqual(["curated_dealers"]);
    expect(plan.scope.dealerSourceIds).toEqual([id]);
    const requested = resolveBuyerSourceRequest([id], ["curated_dealers"]);
    expect(requested.mismatchedSourceIds).toEqual([]);
    expect(requested.dealerSourceIds).toEqual([id]);
    expect(
      matchesRequestedDealer(
        { url: `https://${DEALER_SOURCE_DOMAINS[id][0]}` },
        [id],
      ),
    ).toBe(true);
  });
  it("keeps buyer targets in parity with every known worker domain and alias", () => {
    expect(CURATED_DEALER_SOURCE_IDS.sort()).toEqual(
      Object.keys(DEALER_SOURCE_DOMAINS).sort(),
    );
    for (const [id, domains] of Object.entries(DEALER_SOURCE_DOMAINS)) {
      for (const domain of domains) {
        expect(
          normalizeBuyerScope({ dealerHosts: [domain] }).dealerSourceIds,
        ).toEqual([id]);
        expect(
          matchesRequestedDealer({ url: `https://inventory.${domain}` }, [id]),
        ).toBe(true);
        expect(sourceMeta(sourceFromUrl(`https://${domain}`)).channel).toBe(
          "dealer",
        );
      }
    }
  });
  it("does not target another site just because the requested domain appears in its URL", () => {
    expect(
      matchesRequestedDealer({ url: "https://autovada.com.example.org/cars" }, [
        "autovada",
      ]),
    ).toBe(false);
    expect(
      matchesRequestedDealer(
        { url: "https://example.org/?dealer=autovada.com" },
        ["autovada"],
      ),
    ).toBe(false);
    expect(
      matchesRequestedDealer({ url: "https://polecatsautosales.com" }, [
        "autovada",
      ]),
    ).toBe(false);
    expect(
      matchesRequestedDealer({ url: "https://autovada.com" }, ["unsupported"]),
    ).toBe(false);
  });
});
