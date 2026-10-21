import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  owner: "owner",
  rows: new Map<string, Record<string, any>>(),
  outcomes: new Map<string, Record<string, any>>(),
  listing: null as Record<string, any> | null,
  writes: [] as { table: string; payload: Record<string, any> }[],
  filters: [] as unknown[][],
  seedError: false,
  race: false,
  missingConfirmation: false,
  database: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({
    data: { user: { id: state.owner } },
    error: null,
  }),
}));
vi.mock("@/lib/outcomes/snapshot", () => ({
  outcomePredictionSnapshot: state.snapshot,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: state.database,
}));
import { POST } from "./api/inventory/route";
const id = "a0000000-0000-4000-8000-000000000001";
const dealId = "b0000000-0000-4000-8000-000000000002";
const base = {
  id,
  year: 2020,
  make: "Honda",
  model: "Civic",
  purchasePrice: 1000.25,
  purchaseDate: new Date().toISOString().slice(0, 10),
};

beforeEach(() => {
  vi.clearAllMocks();
  state.owner = "owner";
  state.rows.clear();
  state.outcomes.clear();
  state.listing = null;
  state.writes = [];
  state.filters = [];
  state.seedError = false;
  state.race = false;
  state.missingConfirmation = false;
  state.snapshot.mockResolvedValue({
    prediction_basis: "market_supported",
    predicted_sell: 1800,
  });
  state.database.mockImplementation(() => ({
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      let payload: Record<string, any> | undefined;
      const execute = async () => {
        if (payload) {
          state.writes.push({ table, payload });
          if (table === "deal_outcomes" && state.seedError)
            return { data: null, error: { code: "unavailable" } };
          const store = table === "inventory" ? state.rows : state.outcomes;
          if (store.has(payload.id))
            return { data: null, error: { code: "23505" } };
          store.set(payload.id, { ...payload });
          if (table === "inventory" && state.race)
            return { data: null, error: { code: "23505" } };
          return {
            data:
              state.missingConfirmation && table === "inventory"
                ? null
                : { ...payload },
            error: null,
          };
        }
        const rows =
          table === "deals"
            ? state.listing
              ? [state.listing]
              : []
            : Array.from(
                (table === "inventory" ? state.rows : state.outcomes).values(),
              );
        return {
          data:
            rows.find((row) =>
              filters.every(([key, value]) => row[key] === value),
            ) ?? null,
          error: null,
        };
      };
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          state.filters.push([table, key, value]);
          return query;
        },
        insert: (value: Record<string, any>) => {
          payload = value;
          return query;
        },
        single: execute,
        maybeSingle: execute,
      };
      return query;
    },
  }));
});
const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/inventory", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

describe("purchase integrity", () => {
  it.each([
    null,
    [],
    "purchase",
    {},
    { ...base, id: undefined },
    { ...base, purchasePrice: undefined },
    ...[-1, null, "100", 1.234, 100000001].map((purchasePrice) => ({
      ...base,
      purchasePrice,
    })),
    { ...base, stage: "sold" },
    { ...base, dealId: "bad" },
    { ...base, year: 2039 },
    { ...base, vin: "bad" },
    { ...base, auctionFee: -1 },
    { ...base, condition: {} },
    { ...base, photos: ["javascript:alert(1)"] },
  ])(
    "rejects invalid actual input before opening the database: %j",
    async (body) => {
      expect((await post(body)).status).toBe(400);
      expect(state.database).not.toHaveBeenCalled();
      expect(state.writes).toEqual([]);
    },
  );
  it("rejects malformed JSON with a useful 400", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/inventory", {
        method: "POST",
        body: "{",
      }),
    );
    expect(response.status).toBe(400);
    expect(state.database).not.toHaveBeenCalled();
  });
  it("requires vehicle identity for a manual purchase", async () => {
    expect(
      (await post({ id, purchasePrice: 100, purchaseDate: base.purchaseDate }))
        .status,
    ).toBe(400);
  });
  it("preserves explicit zero amounts and unknown facts without certifying costs", async () => {
    const response = await post({ ...base, year: 0, purchasePrice: 0 });
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved).toMatchObject({
      ownerId: "owner",
      replayed: false,
      item: { id, dealerId: "owner", purchasePrice: 0, condition: "unknown" },
      outcomeReview: { synced: true },
    });
    expect(state.rows.get(id)).toMatchObject({
      year: 0,
      condition: "unknown",
      deal_id: null,
      market_value: null,
    });
    expect(state.outcomes.get(id)).toMatchObject({
      inventory_id: id,
      costs_complete: false,
      purchase_price: 0,
    });
    expect(state.rows.get(id)).not.toHaveProperty("total_cost");
  });
  it("replays the same purchase after a lost response and a stage move without another row or write", async () => {
    await post(base);
    state.rows.get(id)!.stage = "recon";
    state.writes = [];
    const replay = await (await post(base)).json();
    expect(replay).toMatchObject({
      replayed: true,
      item: { id, stage: "recon" },
    });
    expect(state.rows.size).toBe(1);
    expect(state.outcomes.size).toBe(1);
    expect(state.writes).toEqual([]);
  });
  it("recovers an overlapping insert through the database primary key", async () => {
    state.race = true;
    const response = await post(base);
    expect(response.status).toBe(200);
    expect((await response.json()).replayed).toBe(true);
    expect(state.rows.size).toBe(1);
    expect(state.outcomes.size).toBe(1);
    expect(state.outcomes.get(id)).not.toHaveProperty("predicted_sell");
  });
  it.each([
    { purchasePrice: 2000 },
    { model: "Accord" },
    { auctionFee: 50 },
    { condition: "clean" },
  ])(
    "rejects changed replay facts without overwriting saved actuals: %j",
    async (change) => {
      await post(base);
      state.writes = [];
      expect((await post({ ...base, ...change })).status).toBe(409);
      expect(state.writes).toEqual([]);
      expect(state.rows.get(id)!.purchase_price).toBe(1000.25);
    },
  );
  it("cannot replay another account's record even with its id", async () => {
    await post(base);
    state.owner = "other";
    state.writes = [];
    expect((await post(base)).status).toBe(409);
    expect(state.filters).toContainEqual(["inventory", "dealer_id", "other"]);
    expect(state.rows.get(id)!.dealer_id).toBe("owner");
  });
  it("preserves authoritative source identity, photos, zero mileage and the listing link", async () => {
    state.listing = {
      id: dealId,
      year: 2020,
      make: "Honda",
      model: "Civic",
      vin: "1HGCM82633A004352",
      images: [
        "https://images.example/car.jpg",
        "https://images.example/no-image.jpg",
      ],
      mileage: 0,
      source: "cargurus",
    };
    const response = await post({
      ...base,
      dealId,
      photos: ["https://wrong.example/other.jpg"],
    });
    expect(response.status).toBe(200);
    expect((await response.json()).item).toMatchObject({
      vehicleId: dealId,
      vin: "1HGCM82633A004352",
      odometer: 0,
      photos: ["https://images.example/car.jpg"],
    });
    expect(state.outcomes.get(id)).toMatchObject({
      deal_id: dealId,
      predicted_sell: 1800,
    });
    expect(state.snapshot).toHaveBeenCalledOnce();
  });
  it("rejects missing sources and mismatched vehicle identities before inserting", async () => {
    expect((await post({ ...base, dealId })).status).toBe(404);
    state.listing = { id: dealId, make: "Ford", model: "Focus" };
    expect((await post({ ...base, dealId })).status).toBe(409);
    expect(state.writes).toEqual([]);
  });
  it("reports a saved purchase separately from a failed outcome seed; retry repairs it without a later prediction", async () => {
    state.seedError = true;
    const saved = await (await post(base)).json();
    expect(saved.item.id).toBe(id);
    expect(saved.outcomeReview.synced).toBe(false);
    state.seedError = false;
    const replay = await (await post(base)).json();
    expect(replay.outcomeReview.synced).toBe(true);
    expect(state.rows.size).toBe(1);
    expect(state.outcomes.size).toBe(1);
    expect(state.outcomes.get(id)).not.toHaveProperty("predicted_sell");
  });
  it.each([undefined, "2026-02-30", "not-a-date", "2999-01-01"])(
    "rejects missing, impossible and future purchase dates %s",
    async (purchaseDate) => {
      expect((await post({ ...base, purchaseDate })).status).toBe(400);
      expect(state.writes).toEqual([]);
    },
  );
  it("records the actual historical purchase day without backdating a model prediction", async () => {
    state.listing = { id: dealId, year: 2020, make: "Honda", model: "Civic" };
    const response = await post({
      ...base,
      dealId,
      purchaseDate: "2025-01-15",
    });
    expect(response.status).toBe(200);
    expect(state.rows.get(id)!.floor_date).toBe("2025-01-15T00:00:00.000Z");
    expect(state.outcomes.get(id)!.purchased_at).toBe(
      "2025-01-15T00:00:00.000Z",
    );
    expect(state.outcomes.get(id)).not.toHaveProperty("predicted_sell");
    expect(state.snapshot).not.toHaveBeenCalled();
  });
  it("does not claim confirmation when the inserted row is missing", async () => {
    state.missingConfirmation = true;
    expect((await post(base)).status).toBe(502);
    state.missingConfirmation = false;
    expect((await post(base)).status).toBe(200);
    expect(state.rows.size).toBe(1);
  });
});
