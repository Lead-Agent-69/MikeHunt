import { describe, expect, it, vi } from "vitest";
import {
  assessProductionStatus,
  checkProduction,
} from "../scripts/production-watch.mjs";

const healthy = () => ({
  configured: true,
  buyerReady: true,
  decisionReady: false,
  activeDeals: 38_914,
  freshPhotoListings: 4_391,
  freshness: {
    newLast24h: 1_000,
    newestAgeHours: 2,
    stale: false,
  },
});

describe("production watch", () => {
  it("keeps missing decision evidence visible without taking buyer discovery down", () => {
    expect(assessProductionStatus(healthy())).toEqual({
      status: "warn",
      failures: [],
      warnings: ["decision evidence is not yet certified"],
    });
  });

  it("fails on missing inventory or a stale collector", () => {
    expect(
      assessProductionStatus({
        ...healthy(),
        activeDeals: 0,
        freshness: { newestAgeHours: 25, stale: true },
      }),
    ).toMatchObject({
      status: "fail",
      failures: [
        "active inventory is unavailable",
        "inventory freshness is stale",
        "newest inventory exceeds the freshness window",
      ],
    });
  });

  it("fails closed on redirects such as Vercel Authentication", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://vercel.com/sso-api" },
      }),
    );
    expect(await checkProduction({ fetchImpl })).toMatchObject({
      status: "fail",
      failures: ["production status returned HTTP 302"],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("records public production evidence without credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(healthy()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await checkProduction({ fetchImpl })).toMatchObject({
      status: "warn",
      evidence: {
        activeDeals: 38_914,
        newLast24h: 1_000,
        buyerReady: true,
        decisionReady: false,
      },
    });
  });
});
