import { describe, it, expect, vi } from "vitest";
import { withLatestObservations } from "./latest-observation";
const id = "00300f46-59a8-477f-961f-8ffbd7d4ce29";
const other = "00300f46-59a8-477f-961f-8ffbd7d4ce28";
const old = "2026-01-01T00:00:00Z";
function client(data: unknown, error: unknown = null) {
  const calls = {
    select: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    abortSignal: vi.fn(),
  };
  const q: any = {};
  calls.select.mockImplementation(() => q);
  calls.in.mockImplementation(() => q);
  calls.limit.mockImplementation(() => q);
  calls.abortSignal.mockResolvedValue({ data, error });
  Object.assign(q, calls);
  return { from: vi.fn(() => q), calls };
}
describe("saved snapshot observation provenance", () => {
  it("batches only requested UUIDs, copies observations and preserves prices and saved evidence", async () => {
    const rows = [
      {
        deal_id: id,
        snapshot: { lastSeenAt: old, askingPrice: 2600 },
        status: "unavailable",
      },
      { deal_id: id, snapshot: { lastSeenAt: old } },
    ];
    const c = client([
      { id, last_seen_at: "2026-10-01T00:00:00Z" },
      { id: other, last_seen_at: "2026-10-02T00:00:00Z" },
    ]);
    const result = await withLatestObservations(c, rows);
    expect(c.from).toHaveBeenCalledExactlyOnceWith("deals");
    expect(c.calls.select).toHaveBeenCalledWith("id,last_seen_at");
    expect(c.calls.in).toHaveBeenCalledWith("id", [id]);
    expect(c.calls.limit).toHaveBeenCalledWith(1);
    expect(result[0]).toMatchObject({
      latestObservation: { lastSeenAt: "2026-10-01T00:00:00.000Z" },
      snapshot: { lastSeenAt: old, askingPrice: 2600 },
      status: "unavailable",
    });
    expect(rows[0]).not.toHaveProperty("latestObservation");
  });
  it("keeps saved unavailable or missing vehicles when accessible inventory has no row", async () => {
    const rows = [
      { deal_id: id, status: "unavailable", snapshot: { lastSeenAt: old } },
    ];
    expect(await withLatestObservations(client([]), rows)).toEqual(rows);
  });
  it("degrades safely on lookup failures and does not promote invalid or future dates", async () => {
    const rows = [{ deal_id: id, snapshot: { lastSeenAt: old } }];
    for (const c of [
      client(null, { message: "restricted" }),
      client([{ id, last_seen_at: "bad" }]),
      client([{ id, last_seen_at: "2099-01-01" }]),
    ])
      expect(await withLatestObservations(c, rows)).toEqual(rows);
    const c = client([]);
    c.calls.abortSignal.mockRejectedValue(new Error("timeout"));
    expect(await withLatestObservations(c, rows)).toEqual(rows);
  });
  it("does not query unrelated ids or legacy rows without an inventory id", async () => {
    const c = client([]);
    const rows = [{ deal_id: "not-a-uuid" }, { snapshot: {} }];
    expect(await withLatestObservations(c, rows)).toBe(rows);
    expect(c.from).not.toHaveBeenCalled();
  });
  it("bounds larger collections to fifty ids per read", async () => {
    const rows = Array.from({ length: 120 }, (_, n) => ({
      deal_id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    }));
    const c = client([]);
    await withLatestObservations(c, rows);
    expect(c.calls.in.mock.calls.map((call) => call[1].length)).toEqual([
      50, 50, 20,
    ]);
    expect(c.calls.limit.mock.calls.map((call) => call[0])).toEqual([
      50, 50, 20,
    ]);
  });
});
