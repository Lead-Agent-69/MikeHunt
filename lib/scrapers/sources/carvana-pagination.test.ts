import { afterEach, describe, expect, it, vi } from "vitest";
const { upsertDeals } = vi.hoisted(() => ({
  upsertDeals: vi.fn(async (rows: unknown[]) => rows.length),
}));
vi.mock("../pipeline", () => ({ upsertDeals }));
import { scrapeCarvana } from "./carvana";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("Carvana inventory pagination", () => {
  it("keeps every car when the API echoes a larger page size than it actually returns", async () => {
    const inventory = Array.from({ length: 48 }, (_, index) => ({
      vin: `1HGCM82633A004${String(index).padStart(3, "0")}`,
      vehicleId: index + 1,
      price: { total: 15000 },
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const { page, pageSize } = JSON.parse(String(init.body)).pagination;
        const offset = (page - 1) * pageSize;
        return {
          ok: true,
          json: async () => ({
            inventory: {
              pagination: {
                totalMatchedPages: Math.ceil(inventory.length / pageSize),
              },
              vehicles: inventory.slice(
                offset,
                offset + Math.min(24, pageSize),
              ),
            },
          }),
        };
      }),
    );
    expect(await scrapeCarvana(2, 50)).toBe(48);
    const captured = upsertDeals.mock.calls.at(-1)![0] as Array<{
      vin: string;
    }>;
    expect(new Set(captured.map((row) => row.vin))).toEqual(
      new Set(inventory.map((row) => row.vin)),
    );
  });
  it("includes the final reachable page without requesting a rejected deep offset", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const pages: number[] = [];
    let invalidRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const { page, pageSize } = JSON.parse(String(init.body)).pagination;
        pages.push(page);
        if (page * pageSize > 9480) {
          invalidRequests++;
          return { ok: false, status: 400 };
        }
        return {
          ok: true,
          json: async () => ({
            inventory: {
              pagination: { totalMatchedPages: 3735 },
              vehicles: Array.from({ length: 24 }, (_, index) => ({
                vehicleId: page * 24 + index + 1,
                vin: `VIN-${page}-${index}`,
                price: { total: 15000 },
              })),
            },
          }),
        };
      }),
    );
    expect(await scrapeCarvana(2, 24)).toBe(48);
    expect(invalidRequests).toBe(0);
    expect(pages).toEqual([1, 394, 395]);
  });
});
