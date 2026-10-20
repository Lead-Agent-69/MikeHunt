import { describe, expect, it, vi } from "vitest";
import {
  fetchNorfolkSoldRows,
  norfolkSoldRows,
  OPEN_DATA_PAGE_MAX_BYTES,
  resolveNorfolkSince,
  writeNorfolkSoldRows,
} from "./norfolk-sold";

const NOW = new Date("2026-10-20T00:00:00.000Z");
const SOURCE_ROWS = [
  {
    trip_ticket_number: "158933",
    vin_number: "1FTNE2EL2BDB19217",
    vehicle_type: "Van",
    vehicle_make: "FORD",
    vehicle_model: "ECONOLINE",
    vehicle_year: "2011",
    auction_date: "2026-10-08T00:00:00.000",
    sold_for: "1600",
    release_status: "Impounded",
  },
  {
    trip_ticket_number: "126628",
    vin_number: "1P4GP44G6WB550711",
    vehicle_type: "Van",
    vehicle_make: "PLYMOUTH",
    vehicle_model: "VOYAGER",
    vehicle_year: "1998",
    auction_date: "2026-10-08T00:00:00.000",
    sold_for: "75",
    release_status: "Demolished",
  },
  {
    trip_ticket_number: "81160",
    vin_number: "JS1GT76A052107473",
    vehicle_type: "Motorcycle",
    vehicle_make: "SUZUKI",
    vehicle_model: "GSX-R1000",
    vehicle_year: "2005",
    auction_date: "2026-10-08T00:00:00.000",
    sold_for: "500",
    release_status: "Sold At Auction",
  },
];

describe("Norfolk official sold evidence", () => {
  it("maps cars and light trucks while rejecting scrap and motorcycles", () => {
    const rows = norfolkSoldRows(SOURCE_ROWS, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "gov_norfolk_impound",
      source_item_id: "norfolk-158933",
      sold_price: 1600,
      sold_at: "2026-10-08T00:00:00.000Z",
      basis: "sold",
      sale_channel: "gov_impound_auction",
      make: "Ford",
      model: "ECONOLINE",
      location_state: "VA",
    });
    expect(rows[0].attribution).toMatch(/City of Norfolk/);
    expect(JSON.stringify(rows)).not.toMatch(/license_plate|towed_from/);
  });

  it("removes contact details and VIN-shaped text from display fields", () => {
    const rows = norfolkSoldRows(
      [
        {
          ...SOURCE_ROWS[0],
          trip_ticket_number: "privacy-test",
          vehicle_make: "FORD seller@example.com",
          vehicle_model:
            "ECONOLINE https://seller.example +1 (757) 555-1212 1FTNE2EL2BDB19217",
        },
      ],
      NOW,
    );
    expect(rows).toHaveLength(1);
    const display = `${rows[0].make} ${rows[0].model} ${rows[0].title}`;
    expect(display).not.toMatch(/seller@example\.com|seller\.example|555-1212/);
    expect(display).not.toContain("1FTNE2EL2BDB19217");
  });

  it("requests only required fields with a bounded date and response", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify(SOURCE_ROWS), {
          headers: { "content-length": "1000" },
        }),
      ),
    );
    const rows = await fetchNorfolkSoldRows("2026-04-23", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(rows).toHaveLength(3);
    const [calledUrl, calledInit] = fetchImpl.mock.calls[0];
    const url = new URL(String(calledUrl));
    expect(url.searchParams.get("$where")).toBe(
      "sold_for > 0 AND auction_date >= '2026-04-23T00:00:00'",
    );
    expect(url.searchParams.get("$select")).not.toMatch(
      /license_plate|towed_from|storage_lot/,
    );
    expect(calledInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects oversized source payloads before parsing", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response("[]", {
          headers: {
            "content-length": String(OPEN_DATA_PAGE_MAX_BYTES + 1),
          },
        }),
      ),
    );
    await expect(
      fetchNorfolkSoldRows("2026-04-23", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/safety cap/);
  });

  it("uses a 14-day overlap without exceeding the 180-day floor", async () => {
    const maybeSingle = vi.fn(async () => ({
      data: { sold_at: "2026-10-08T00:00:00.000Z" },
      error: null,
    }));
    const chain: any = { maybeSingle };
    for (const method of ["select", "eq", "not", "order", "limit"])
      chain[method] = vi.fn(() => chain);
    const supabase = { from: vi.fn(() => chain) } as any;
    await expect(resolveNorfolkSince(supabase, NOW)).resolves.toBe(
      "2026-09-24",
    );
  });

  it("writes in bounded idempotent chunks", async () => {
    const rows = norfolkSoldRows(SOURCE_ROWS, NOW);
    const select = vi.fn(async () => ({
      data: [{ source_item_id: rows[0].source_item_id }],
      error: null,
    }));
    const upsert = vi.fn(() => ({ select }));
    const supabase = { from: vi.fn(() => ({ upsert })) } as any;
    await expect(writeNorfolkSoldRows(supabase, rows)).resolves.toBe(1);
    expect(upsert).toHaveBeenCalledWith(rows, {
      onConflict: "source,source_item_id",
      ignoreDuplicates: true,
    });
  });
});
