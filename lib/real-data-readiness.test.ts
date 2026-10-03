import { describe, expect, it } from "vitest";
import { buildRealDataReadiness } from "./real-data-readiness";

const base = {
  activeDeals: 100,
  newestAgeHours: 2,
  newLast24h: 20,
  photoPct: 80,
  sourceLinkPct: 90,
  pricePct: 95,
  titlePct: 80,
  damagePct: 80,
  mileagePct: 70,
  vinPct: 40,
  sellerPct: 90,
  sellerContactPct: 40,
  auctionDatePct: 40,
  decisionReady: true,
};

describe("buildRealDataReadiness", () => {
  it("marks fresh complete inventory as buyer-ready", () => {
    const readiness = buildRealDataReadiness(base);

    expect(readiness.status).toBe("ready");
    expect(readiness.buyerReady).toBe(true);
    expect(readiness.decisionReady).toBe(true);
    expect(readiness.gaps).toHaveLength(0);
  });

  it("does not call browseable inventory decision-ready without decision evidence", () => {
    const readiness = buildRealDataReadiness({
      ...base,
      decisionReady: false,
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.label).toBe("Browse-ready real data");
    expect(readiness.decisionReady).toBe(false);
    expect(readiness.message).toContain(
      "Purchase recommendations remain on hold",
    );
  });

  it("separates empty inventory from provider setup", () => {
    const readiness = buildRealDataReadiness({
      ...base,
      activeDeals: 0,
      newestAgeHours: null,
      newLast24h: 0,
    });

    expect(readiness.status).toBe("empty");
    expect(readiness.minimumReady).toBe(false);
    expect(readiness.nextAction).toContain("Run a scoped scan");
  });

  it("flags stale inventory even when detail coverage is strong", () => {
    const readiness = buildRealDataReadiness({
      ...base,
      newestAgeHours: 96,
    });

    expect(readiness.status).toBe("stale");
    expect(readiness.buyerReady).toBe(false);
    expect(readiness.message).toContain("96h");
  });

  it("prioritizes the weakest buyer-trust fields", () => {
    const readiness = buildRealDataReadiness({
      ...base,
      photoPct: 12,
      sourceLinkPct: 45,
      pricePct: 82,
    });

    expect(readiness.status).toBe("thin");
    expect(readiness.gaps[0]).toMatchObject({
      field: "Photos",
      pct: 12,
      target: 70,
    });
    expect(readiness.nextAction).toContain("photos");
  });
});
