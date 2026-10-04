import { describe, expect, it } from "vitest";
import {
  applyBuyingForIntent,
  buildBuyerIntentQuery,
  buyerIntentLabel,
  discoverQueryForBuyingFor,
  normalizeBuyerIntent,
  scanHrefForBuyerIntent,
} from "@/hooks/useBuyerIntent";
import { dealerSourceIdForHost } from "@/lib/sources/source-meta";

describe("buyer intent profile", () => {
  it("treats an empty preference payload as no saved buying scope", () => {
    expect(normalizeBuyerIntent({})).toBeNull();
    expect(normalizeBuyerIntent(null)).toBeNull();
  });

  it("normalizes saved scope and preserves exact buyer filters", () => {
    const intent = normalizeBuyerIntent({
      buyerMode: "personal",
      vehicle: "SUVs",
      lane: "Salvage & repairable",
      state: "FL",
      titleType: "salvage",
      sellerType: "dealer",
      minPrice: 5000,
      maxPrice: 10000,
      makes: ["Ford", "Toyota"],
      watchedDealers: ["aeofmiami.com"],
      watchedDealerSourceIds: ["ae-of-miami"],
    });

    const params = buildBuyerIntentQuery(intent);

    expect(intent?.laneValue).toBe("damaged");
    expect(intent?.buyerMode).toBe("personal");
    expect(params.get("mode")).toBe("personal");
    expect(params.get("state")).toBe("FL");
    expect(params.get("lane")).toBe("damaged");
    expect(params.get("titleType")).toBe("salvage");
    expect(params.get("sellerType")).toBe("dealer");
    expect(params.get("minPrice")).toBe("5000");
    expect(params.get("maxPrice")).toBe("10000");
    expect(params.get("makes")).toBe("Ford,Toyota");
    expect(params.get("dealers")).toBe("aeofmiami.com");
    expect(params.get("dealerSourceIds")).toBe("ae-of-miami");
    expect(scanHrefForBuyerIntent(intent)).toContain("sort=profit");
    expect(buyerIntentLabel(intent)).toContain("Ford/Toyota");
    expect(buyerIntentLabel(intent)).toContain("Personal buyer");
    expect(buyerIntentLabel(intent)).toContain("over $5,000");
    expect(buyerIntentLabel(intent)).toContain("1 watched dealer");
  });

  it("falls back to vehicle/lane keywords when no exact make focus exists", () => {
    const intent = normalizeBuyerIntent({
      vehicle: "Sedans",
      laneValue: "government",
      state: "Nationwide",
    });

    const params = buildBuyerIntentQuery(intent);

    expect(params.get("lane")).toBe("government");
    expect(params.get("q")).toBe("sedan repo government surplus");
    expect(params.has("state")).toBe(false);
  });

  it("does not turn an all-vehicle profile into a hidden text filter", () => {
    const intent = normalizeBuyerIntent({
      buyerMode: "personal",
      vehicle: "All vehicle types",
      state: "MO",
    });
    const params = buildBuyerIntentQuery(intent);
    expect(intent?.vehicle).toBeUndefined();
    expect(params.get("state")).toBe("MO");
    expect(params.has("q")).toBe(false);
  });

  it("normalizes buyer modes without treating every user as a reseller", () => {
    const personal = normalizeBuyerIntent({
      mode: "personal-buyer",
    });
    const diy = normalizeBuyerIntent({
      buyerMode: "enthusiast",
      vehicle: "Trucks",
    });

    expect(personal?.buyerMode).toBe("personal");
    expect(buildBuyerIntentQuery(personal).get("mode")).toBe("personal");
    expect(buyerIntentLabel(personal)).toContain("Personal buyer");
    expect(diy?.buyerMode).toBe("diy");
    expect(buyerIntentLabel(diy)).toContain("DIY enthusiast");
  });

  it("preserves onboarding watched-shop goals in exact scan links", () => {
    const watchedDealers = ["aeofmiami.com", "stjamesautoparts.com"];
    const watchedDealerSourceIds = watchedDealers
      .map((host) => dealerSourceIdForHost(host))
      .filter((id): id is string => Boolean(id));
    const intent = normalizeBuyerIntent({
      vehicle: "SUVs",
      laneValue: "private",
      state: "FL",
      titleType: "salvage",
      sellerType: "dealer",
      watchedDealers,
      watchedDealerSourceIds,
    });

    const href = scanHrefForBuyerIntent(intent);

    expect(watchedDealerSourceIds).toEqual(["ae-of-miami", "stjames-auto"]);
    expect(href).toContain("dealers=aeofmiami.com%2Cstjamesautoparts.com");
    expect(href).toContain("dealerSourceIds=ae-of-miami%2Cstjames-auto");
    expect(href).toContain("sellerType=dealer");
    expect(href).toContain("titleType=salvage");
  });

  it("rewrites a Discover query for make, budget, lane, and state", () => {
    const next = applyBuyingForIntent(
      { vehicle: "SUVs", buyerMode: "personal", makes: ["Honda"] },
      { make: "Ford", maxPrice: 18000, laneValue: "clean-retail", state: "tx" },
    );
    const params = discoverQueryForBuyingFor(next, "TX");
    expect(params.get("makes")).toBe("Ford");
    expect(params.get("maxPrice")).toBe("18000");
    expect(params.get("lane")).toBe("clean-retail");
    expect(params.get("state")).toBe("TX");
    expect(params.get("mode")).toBe("personal");
    expect(params.has("states")).toBe(false);

    const nationwide = discoverQueryForBuyingFor(
      applyBuyingForIntent(null, { state: "NATIONWIDE", laneValue: "all" }),
      "NATIONWIDE",
    );
    expect(nationwide.get("state")).toBe("NATIONWIDE");
    expect(nationwide.has("makes")).toBe(false);
  });
});
