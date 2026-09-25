import { describe, it, expect } from "vitest";
import { computeMaxBid, feeModel } from "./max-bid";
import { applyCalibration, type DealerCalibration } from "./calibration";
import { damageEffect, damageSummary } from "../parts/damage-map";
import { rateLimit } from "../rate-limit";
import { dealEmbeddingText } from "../ai/deal-embeddings";

describe("computeMaxBid", () => {
  it("inverts the cost build-up for a Copart deal", () => {
    const r = computeMaxBid({
      sellEstimate: 20000,
      targetProfit: 4000,
      costs: { repair: 1500, transport: 500 },
      source: "copart",
    });
    // (20000 - 4000 - 2000 - 130 - 100) / 1.1
    expect(r.maxBid).toBe(12518);
    expect(r.viable).toBe(true);
    expect(r.marginPct).toBe(25);
  });

  it("returns 0 (not negative) when the deal is unviable", () => {
    const r = computeMaxBid({
      sellEstimate: 5000,
      targetProfit: 9000,
      source: "copart",
    });
    expect(r.maxBid).toBe(0);
    expect(r.viable).toBe(false);
  });

  it("applies no buyer fee for private-party sources", () => {
    expect(feeModel("craigslist")).toEqual({
      feeRate: 0,
      flatFee: 0,
      titleFee: 0,
    });
  });
});

describe("applyCalibration", () => {
  const cal: DealerCalibration = {
    sampleSize: 8,
    transportMultiplier: 1.3,
    reconMultiplier: 1.1,
    sellMultiplier: 0.95,
    profitAccuracyPct: 82,
    profitBiasPct: -4,
    message: "",
  };

  it("bends estimates by the learned multipliers", () => {
    const out = applyCalibration(
      { sellEstimate: 20000, transport: 600, recon: 1000 },
      cal,
    );
    expect(out).toEqual({
      sellEstimate: 19000,
      transport: 780,
      recon: 1100,
      calibrated: true,
    });
  });

  it("is a no-op when calibration is null", () => {
    const out = applyCalibration(
      { sellEstimate: 20000, transport: 600, recon: 1000 },
      null,
    );
    expect(out.calibrated).toBe(false);
    expect(out.sellEstimate).toBe(20000);
  });
});

describe("damage-map", () => {
  it("scraps flood electronics and boosts intact body", () => {
    expect(damageEffect("electronics", "flood salvage").status).toBe("scrap");
    expect(damageEffect("body", "flood").status).toBe("in-demand");
  });

  it("spares the drivetrain on a front-end hit", () => {
    expect(damageEffect("transmission", "Front End").status).toBe("in-demand");
  });

  it("treats unknown/no damage as intact", () => {
    expect(damageEffect("engine", null).status).toBe("intact");
    expect(damageEffect("engine", "none").status).toBe("intact");
    expect(damageSummary("none")).toBeNull();
  });

  it("summarizes survivors and scrap for fire", () => {
    const s = damageSummary("Fire");
    expect(s).toContain("scrap");
    expect(s).toMatch(/interior|electronics/);
  });
});

describe("rateLimit", () => {
  it("allows up to the limit then blocks, per IP", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "5.5.5.5" },
    });
    let allowed = 0;
    let blocked = 0;
    for (let i = 0; i < 25; i++) {
      if (rateLimit(req, { key: "unit", limit: 20, windowMs: 60_000 }).allowed)
        allowed++;
      else blocked++;
    }
    expect(allowed).toBe(20);
    expect(blocked).toBe(5);

    const other = new Request("http://x", {
      headers: { "x-forwarded-for": "6.6.6.6" },
    });
    expect(
      rateLimit(other, { key: "unit", limit: 20, windowMs: 60_000 }).allowed,
    ).toBe(true);
  });
});

describe("dealEmbeddingText", () => {
  it("builds a compact description from real fields only", () => {
    const t = dealEmbeddingText({
      year: 2019,
      make: "Ford",
      model: "F-150",
      mileage: 84000,
      condition: "clean",
      location_state: "TX",
    });
    expect(t).toContain("2019 Ford F-150");
    expect(t).toContain("84k miles");
    expect(t).toContain("clean title");
    expect(t).not.toContain("undefined");
  });
});
