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
