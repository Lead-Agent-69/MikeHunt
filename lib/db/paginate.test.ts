import { describe, it, expect } from "vitest";
import { fetchAllRows } from "./paginate";

// Simulate a PostgREST-capped table of `n` rows; each call returns the requested [from,to] slice (≤cap).
function fakeTable(n: number, cap = 1000) {
  return (from: number, to: number) => {
    const end = Math.min(to, from + cap - 1);
    const data = [];
    for (let i = from; i <= end && i < n; i++) data.push({ i });
    return Promise.resolve({ data, error: null });
  };
}

describe("fetchAllRows", () => {
  it("bounds parallel reads and keeps database order despite out-of-order completion", async () => {
    let active = 0,
      peak = 0;
    const table = fakeTable(2350);
    const rows = await fetchAllRows(
      async (from, to) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) =>
          setTimeout(resolve, from === 0 ? 10 : 1),
        );
        const result = await table(from, to);
        active--;
        return result;
      },
      { pageSize: 500, concurrency: 3, max: 2200 },
    );
    expect(peak).toBe(3);
    expect(rows.map((row) => row.i)).toEqual(
      Array.from({ length: 2200 }, (_, i) => i),
    );
  });
  it("fails a parallel scan if any page fails", async () => {
    await expect(
      fetchAllRows(
        (from) =>
          Promise.resolve(
            from === 1000
              ? { data: null, error: new Error("page unavailable") }
              : { data: [{ i: from }], error: null },
          ),
        { concurrency: 3 },
      ),
    ).rejects.toThrow("page unavailable");
  });
  it("pages past the 1000-row cap to get everything", async () => {
    const rows = await fetchAllRows<{ i: number }>(fakeTable(2350), {
      pageSize: 1000,
    });
    expect(rows.length).toBe(2350);
    expect(rows[0].i).toBe(0);
    expect(rows[2349].i).toBe(2349);
  });

  it("respects the max bound", async () => {
    const rows = await fetchAllRows(fakeTable(10000), {
      pageSize: 1000,
      max: 2000,
    });
    expect(rows.length).toBe(2000);
  });

  it("stops on a short page", async () => {
    const rows = await fetchAllRows(fakeTable(500), { pageSize: 1000 });
    expect(rows.length).toBe(500);
  });

  it("throws on error", async () => {
    await expect(
      fetchAllRows(() =>
        Promise.resolve({ data: null, error: new Error("boom") }),
      ),
    ).rejects.toThrow("boom");
  });
});
