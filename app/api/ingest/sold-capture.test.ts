import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const calls: { op: string; row: any; opts: any }[] = [];
let nextError: any = null;

vi.mock("@/lib/scrapers/pipeline", () => ({ upsertDeals: async () => 1 }));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: () => ({
      insert: async (row: any) => {
        calls.push({ op: "insert", row, opts: null });
        return { error: { code: "23505", message: "duplicate key" } };
      },
      upsert: async (row: any, opts: any) => {
        calls.push({ op: "upsert", row, opts });
        return { error: nextError };
      },
    }),
  }),
}));

import { POST } from "./route";

const soldReq = () =>
  new Request("http://x/api/ingest", {
    method: "POST",
    body: JSON.stringify({
      url: "https://dealer.example/vdp/9?utm_source=x",
      price: "$9,500",
      title: "SOLD 2016 Honda Civic",
      source: "craigslist",
    }),
  });

beforeEach(() => {
  calls.length = 0;
  nextError = null;
  delete process.env.INGEST_SECRET;
});

describe("/api/ingest sold capture (Ren #312 P3)", () => {
  it("repeat capture is an upsert with ignoreDuplicates on (source, source_item_id), never a swallowed 23505", async () => {
    const a = await (await POST(soldReq())).json();
    const b = await (await POST(soldReq())).json();
    expect(calls.map((c) => c.op)).toEqual(["upsert", "upsert"]);
    expect(calls[0].opts).toEqual({ onConflict: "source,source_item_id", ignoreDuplicates: true });
    expect(calls[0].row.source_item_id).toBe(calls[1].row.source_item_id);
    expect(a).toMatchObject({ sold: true, recorded: true });
    expect(b).toMatchObject({ sold: true, recorded: true });
  });

  it("a real database error is reported as recorded: false (and logged)", async () => {
    nextError = { code: "42501", message: "permission denied" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await (await POST(soldReq())).json();
    expect(res).toMatchObject({ sold: true, recorded: false });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("no .insert( into sold_listings is left in the route", () => {
    const src = readFileSync("app/api/ingest/route.ts", "utf8");
    expect(src).not.toMatch(/from\("sold_listings"\)\s*\.insert\(/);
  });
});
