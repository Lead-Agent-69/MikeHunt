// @vitest-environment node
// Opt-in diagnostic of the actual route pipeline, with synthetic candidates and no DB access.
import { mkdirSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const profile = vi.hoisted(() => ({
  enabled: false,
  rows: [] as Record<string, any>[],
  counters: {} as Record<string, { calls: number; ms: number }>,
  wrap:
    (name: string, fn: (...args: any[]) => any) =>
    (...args: any[]) => {
      if (!profile.enabled) return fn(...args);
      const started = performance.now();
      try {
        return fn(...args);
      } finally {
        const counter = (profile.counters[name] ||= { calls: 0, ms: 0 });
        counter.calls++;
        counter.ms += performance.now() - started;
      }
    },
}));
vi.mock("@/lib/sources/vendor-identity", async (original) => {
  const actual =
    await original<typeof import("@/lib/sources/vendor-identity")>();
  return {
    ...actual,
    vendorIdentity: profile.wrap("vendorIdentity", actual.vendorIdentity),
  };
});
vi.mock("@/lib/sources/source-meta", async (original) => {
  const actual = await original<typeof import("@/lib/sources/source-meta")>();
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === "function" ? profile.wrap(name, value) : value,
    ]),
  );
});
vi.mock("@/lib/market/explorer", async (original) => {
  const actual = await original<typeof import("@/lib/market/explorer")>();
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === "function" ? profile.wrap(name, value) : value,
    ]),
  );
});
vi.mock("@/lib/vehicle/vehicle-scope", async (original) => {
  const actual = await original<typeof import("@/lib/vehicle/vehicle-scope")>();
  return {
    ...actual,
    isInVehicleScope: profile.wrap("isInVehicleScope", actual.isInVehicleScope),
  };
});
vi.mock("@/lib/deals/source-price-context", async (original) => {
  const actual =
    await original<typeof import("@/lib/deals/source-price-context")>();
  return {
    ...actual,
    sourcePriceContext: profile.wrap(
      "sourcePriceContext",
      actual.sourcePriceContext,
    ),
  };
});
vi.mock("@/lib/vehicle/listing-identity", async (original) => {
  const actual =
    await original<typeof import("@/lib/vehicle/listing-identity")>();
  return {
    ...actual,
    listingIdentityWarning: profile.wrap(
      "listingIdentityWarning",
      actual.listingIdentityWarning,
    ),
  };
});
vi.mock("@/lib/market/valuation", async (original) => {
  const actual = await original<typeof import("@/lib/market/valuation")>();
  return {
    ...actual,
    marketValuation: profile.wrap("marketValuation", actual.marketValuation),
  };
});
vi.mock("@/lib/discovery/categorize", async (original) => {
  const actual = await original<typeof import("@/lib/discovery/categorize")>();
  return { ...actual, dealLane: profile.wrap("dealLane", actual.dealLane) };
});
vi.mock("@/lib/vehicle/spec-filters", async (original) => {
  const actual = await original<typeof import("@/lib/vehicle/spec-filters")>();
  return {
    ...actual,
    normalizeVehicleSpec: profile.wrap(
      "normalizeVehicleSpec",
      actual.normalizeVehicleSpec,
    ),
  };
});
vi.mock("@/lib/images/photo-evidence", async (original) => {
  const actual = await original<typeof import("@/lib/images/photo-evidence")>();
  return {
    ...actual,
    photoEvidence: profile.wrap("photoEvidence", actual.photoEvidence),
  };
});
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: () => {
      let limit = 500;
      let after = 0;
      const query: any = {};
      for (const method of [
        "select",
        "eq",
        "in",
        "or",
        "gte",
        "lte",
        "lt",
        "not",
        "neq",
        "is",
        "ilike",
        "order",
      ])
        query[method] = () => query;
      query.limit = (value: number) => {
        limit = value;
        return query;
      };
      query.gt = (field: string, value: string) => {
        if (field === "id") after = Number(value.slice(-12));
        return query;
      };
      query.then = (resolve: (value: unknown) => unknown) =>
        resolve({
          error: null,
          data: profile.rows.slice(after, after + limit),
        });
      return query;
    },
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/deals/deal-desk-access", async (original) => ({
  ...(await original<object>()),
  resolveCallerFlipDesk: async () => true,
}));
import { GET } from "./route";
import { invalidate } from "@/lib/cache";

describe.skipIf(process.env.MARKET_CPU_PROFILE !== "1")(
  "actual Market eligibility CPU profile",
  () => {
    it(
      "records per-helper inclusive counters and CPU samples without changing output",
      { timeout: 120_000 },
      async () => {
        const clock = vi
          .spyOn(Date, "now")
          .mockReturnValue(Date.parse("2026-11-05T12:00:00Z"));
        const now = new Date(Date.now()).toISOString();
        const hosts = [
          "www.copart.com",
          "www.carvana.com",
          "www.cargurus.com",
          "www.traversautomotive.com",
          "dealer-unknown.test",
        ];
        profile.rows = Array.from({ length: 15129 }, (_, offset) => {
          const i = offset + 1;
          const make = ["Ford", "Chevrolet", "Toyota", "BMW", "GMC"][i % 5];
          const model = ["F-150", "Silverado", "Camry", "X5", "Sierra"][i % 5];
          const source = i % 5 === 0 ? "copart" : "independent_dealer";
          return {
            id: "00000000-0000-4000-8000-" + String(i).padStart(12, "0"),
            source,
            source_url: `https://${hosts[i % hosts.length]}/inventory/2020-${make}-${model}/${i}`,
            title: `2020 ${make} ${model}`,
            make,
            model,
            year: 2020,
            body_class: "Pickup",
            condition: "clean_title",
            mileage: 30000 + i,
            fuel_type: "Gasoline",
            transmission: "Automatic",
            drivetrain: "AWD",
            seller_type: "dealer",
            location_state: i % 2 ? "MO" : "FL",
            first_seen_at: now,
            last_seen_at: now,
            images: Array.from(
              { length: 4 },
              (_, j) =>
                `https://images.dealer.test/inventory/${i}/vehicle-front-exterior-${j}.jpg`,
            ),
            ask_price: 10000 + i,
            buy_now_price: source === "copart" ? 15000 + i : null,
            price_evidence: {
              kind: source === "copart" ? "current_bid" : "asking",
              askingPrice: 10000 + i,
              currentBid: 10000 + i,
            },
            listing_description:
              i % 17 === 0
                ? "Cash price $15,000. Call for details."
                : "Clean title. Inspected. Available for purchase. Local trade with service records.",
            sell_estimate: 35000,
            true_net_profit: 3000,
            profit_score: 80,
            deal_verdict: "go",
            analysis_roi: 20,
            valuation: {
              source: "comparables",
              resaleEvidence: true,
              compCount: 8,
              confidence: "medium",
              compKind: "ask",
              notes: "Attached asking-price comparisons. ".repeat(7),
            },
          };
        });
        // Keep a small rejected vehicle-scope sample: the gates must still execute.
        for (const row of profile.rows.slice(-4)) {
          row.make = "CFMOTO";
          row.model = "UFORCE";
          row.title = "2020 CFMOTO UFORCE UTV";
        }
        const log = vi.spyOn(console, "info").mockImplementation(() => {});
        vi.stubEnv("MARKET_EXPLORE_PROFILE", "1");
        const request = async () => {
          invalidate();
          const response = await GET(
            new NextRequest(
              "http://local.test/api/market/explore?mode=all&states=MO,FL&hasPhotos=yes&priceBasis=cash&sort=askPrice&sortDir=asc&pageSize=50",
            ),
          );
          expect(response.status).toBe(200);
          const result = await response.json();
          if (result.summary) result.summary.asOf = "request-time";
          return { result, timing: log.mock.calls.at(-1)?.[1] };
        };
        try {
          const baseline = await request();
          expect(baseline.result.total).toBe(15125);
          profile.enabled = true;
          const session = new Session();
          session.connect();
          const post = (method: string) =>
            new Promise<any>((resolve, reject) =>
              session.post(method as any, (error, result) =>
                error ? reject(error) : resolve(result),
              ),
            );
          await post("Profiler.enable");
          await post("Profiler.start");
          const measured = await request();
          const cpu = await post("Profiler.stop");
          session.disconnect();
          expect(measured.result).toEqual(baseline.result);
          mkdirSync("artifacts/market-cpu-profile", { recursive: true });
          const label = process.env.MARKET_CPU_PROFILE_LABEL || "profile";
          if (!/^(profile|baseline|optimized)(-[0-2])?$/.test(label))
            throw Error("Invalid local profile label");
          writeFileSync(
            `artifacts/market-cpu-profile/${label}-result.json`,
            JSON.stringify(measured.result),
          );
          writeFileSync(
            "artifacts/market-cpu-profile/eligibility.cpuprofile",
            JSON.stringify(cpu.profile),
          );
          writeFileSync(
            `artifacts/market-cpu-profile/${label}-receipt.json`,
            JSON.stringify(
              {
                source:
                  "synthetic mixed hosts and 15129 candidates; actual GET/eligibleRows; not production",
                fixtureBytes: Buffer.byteLength(JSON.stringify(profile.rows)),
                baseline: baseline.timing,
                measured: measured.timing,
                counters: profile.counters,
              },
              null,
              2,
            ),
          );
        } finally {
          profile.enabled = false;
          clock.mockRestore();
          vi.unstubAllEnvs();
          log.mockRestore();
        }
      },
    );
  },
);
