import { describe, expect, it, vi } from "vitest";
import { fetchAttributeSimilar, fetchSemanticSimilar } from "./similar-deals";

const EXPLORER = {
  make: "Ford",
  model: "Explorer",
  year: 2018,
  ask_price: 18000,
};
// Prod repro (deploy e0f9787): Model S / Civic ranked at 81–84% for an Explorer.
const NEIGHBOURS = [
  {
    id: "models",
    make: "Tesla",
    model: "Model S",
    year: 2017,
    ask_price: 21000,
    similarity: 0.84,
  },
  {
    id: "civic",
    make: "Honda",
    model: "Civic",
    year: 2019,
    ask_price: 16000,
    similarity: 0.81,
  },
  {
    id: "pilot",
    make: "Honda",
    model: "Pilot",
    year: 2018,
    ask_price: 19000,
    similarity: 0.8,
  },
  {
    id: "highlander",
    make: "Toyota",
    model: "Highlander",
    year: 2017,
    ask_price: 17500,
    similarity: 0.78,
  },
  {
    id: "durango",
    make: "Dodge",
    model: "Durango",
    year: 2019,
    ask_price: 20500,
    similarity: 0.77,
  },
  {
    id: "pathfinder",
    make: "Nissan",
    model: "Pathfinder",
    year: 2016,
    ask_price: 15000,
    similarity: 0.75,
  },
];

function client(rpcImpl: (name: string, args: any) => any) {
  return { rpc: vi.fn(async (n: string, a: any) => rpcImpl(n, a)) } as any;
}

describe("fetchSemanticSimilar", () => {
  it("passes price/year bounds to the filtered RPC and drops cross-segment neighbours", async () => {
    const sb = client((name) =>
      name === "similar_deals_by_id_filtered"
        ? { data: NEIGHBOURS, error: null }
        : { data: null, error: { message: "x" } },
    );
    const res = await fetchSemanticSimilar(sb, "src", EXPLORER);
    expect(sb.rpc).toHaveBeenCalledWith("similar_deals_by_id_filtered", {
      p_deal_id: "src",
      p_count: 60,
      p_min_price: 10800,
      p_max_price: 25200,
      p_min_year: 2015,
      p_max_year: 2021,
    });
    expect(res!.step).toBe("strict");
    expect(res!.rows.map((r) => r.id)).toEqual([
      "pilot",
      "highlander",
      "durango",
      "pathfinder",
    ]);
    // Similarity values pass through untouched.
    expect(res!.rows[0].similarity).toBe(0.8);
  });

  it("falls back to the legacy RPC + in-memory gate when the filtered RPC isn't deployed", async () => {
    const sb = client((name) =>
      name === "similar_deals_by_id"
        ? { data: NEIGHBOURS, error: null }
        : { data: null, error: { code: "PGRST202", message: "not found" } },
    );
    const res = await fetchSemanticSimilar(sb, "src", EXPLORER);
    expect(sb.rpc).toHaveBeenCalledWith("similar_deals_by_id", {
      p_deal_id: "src",
      p_count: 200,
    });
    expect(res!.rows.map((r) => r.id)).not.toContain("models");
    expect(res!.rows.map((r) => r.id)).not.toContain("civic");
    expect(res!.rows).toHaveLength(4);
  });

  it("returns null (→ attribute fallback) when only cross-segment neighbours exist", async () => {
    const sb = client(() => ({ data: NEIGHBOURS.slice(0, 2), error: null }));
    expect(await fetchSemanticSimilar(sb, "src", EXPLORER)).toBeNull();
  });

  it("unknown ask sends no price bounds", async () => {
    const sb = client(() => ({ data: [], error: null }));
    await fetchSemanticSimilar(sb, "src", { ...EXPLORER, ask_price: null });
    expect(sb.rpc.mock.calls[0][1]).toMatchObject({
      p_min_price: null,
      p_max_price: null,
    });
  });
});

describe("fetchAttributeSimilar", () => {
  it("applies the same tiers and segment gate to same-make rows", async () => {
    const calls: Array<[string, unknown]> = [];
    const rows = [
      { id: "edge", make: "Ford", model: "Edge", year: 2018, ask_price: 17000 },
      {
        id: "fusion",
        make: "Ford",
        model: "Fusion",
        year: 2018,
        ask_price: 17000,
      },
      {
        id: "f150",
        make: "Ford",
        model: "F-150",
        year: 2018,
        ask_price: 17000,
      },
    ];
    const q: any = {};
    for (const m of ["select", "eq", "neq", "gt", "gte", "lte", "order"])
      q[m] = (...a: unknown[]) => (calls.push([m, a]), q);
    q.limit = async () => ({ data: rows, error: null });
    const sb = { from: () => q } as any;
    const res = await fetchAttributeSimilar(sb, "src", EXPLORER);
    expect(res.rows.map((r) => r.id)).toEqual(["edge"]);
    expect(calls).toContainEqual(["gte", ["ask_price", 10800]]);
    expect(calls).toContainEqual(["lte", ["year", 2021]]);
    expect(res.rows[0]).not.toHaveProperty("similarity");
  });
});
