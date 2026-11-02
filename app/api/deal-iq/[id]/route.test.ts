import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { briefCandidate } from "@/lib/deals/__fixtures__/brief-candidate";
const state = vi.hoisted(() => ({
  row: null as any,
  error: null as any,
  tables: [] as string[],
}));
const user = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: (table: string) => {
      state.tables.push(table);
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: state.row, error: state.error }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/server-supabase", () => ({ getServerUser: user }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
import { GET } from "./route";
const request = () =>
  GET(new NextRequest("http://localhost/api/deal-iq/example"), {
    params: Promise.resolve({ id: "example" }),
  });
beforeEach(() => {
  state.row = briefCandidate();
  state.error = null;
  state.tables = [];
  user.mockReset();
  user.mockResolvedValue({ data: { user: null } });
});
describe("Deal IQ purchase evidence", () => {
  it.each([
    "current_bid",
    "down_payment",
    "monthly_payment",
    "finance_teaser",
    "reference",
    "unknown",
  ])(
    "withholds a score and profit for %s amounts despite legacy GO and profit",
    async (kind) => {
      state.row.price_evidence = {
        kind,
        currentBid: 10000,
        listedAmount: 10000,
      };
      const response = await request();
      const body = await response.json();
      expect(body.iq).toBeNull();
      expect(body.evidence.ready).toBe(false);
      expect(body.evidence.nextCheck).toBeTruthy();
      expect(body.evidence.sourceUrl).toBeTruthy();
      expect(JSON.stringify(body)).not.toContain("true_net_profit");
      expect(state.tables).toEqual(["deals"]);
      expect(user).not.toHaveBeenCalled();
    },
  );
  it.each([
    "priceMeaningConfirmed",
    "titleReviewed",
    "conditionInspected",
    "costsConfirmed",
  ])("withholds economics when %s is incomplete", async (key) => {
    state.row.deal_analysis.evidenceGates[key] = false;
    expect((await (await request()).json()).iq).toBeNull();
  });
  it("does not use stale source or sold observations", async () => {
    for (const field of ["source", "sold"]) {
      state.row = briefCandidate();
      if (field === "source") state.row.last_seen_at = "2020-01-01";
      else state.row.deal_analysis.valuation.soldAt = "2020-01-01";
      expect((await (await request()).json()).iq).toBeNull();
    }
  });
  it("keeps evidence-backed economics without unverified peer, demand or timing claims", async () => {
    const body = await (await request()).json();
    expect(body.evidence.ready).toBe(true);
    expect(body.iq.signals.map((s: any) => s.key)).toEqual([
      "market",
      "profit",
    ]);
    expect(state.tables).toEqual(["deals"]);
  });
  it("reports database failure as unavailable without leaking details", async () => {
    state.error = { message: "private database details" };
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database");
  });
  it("distinguishes a missing vehicle", async () => {
    state.row = null;
    expect((await request()).status).toBe(404);
  });
});
