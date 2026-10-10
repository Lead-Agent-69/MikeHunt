import { describe, expect, it, vi } from "vitest";
import { eligibleInventoryClient } from "./eligible-client";
describe("service-role inventory reads", () => {
  it("filters holds on reads, not mutation receipts or unrelated tables", () => {
    const filter = { eq: vi.fn(() => filter), gt: vi.fn(() => filter) };
    const query = { select: vi.fn(() => filter), upsert: vi.fn(() => filter) };
    const client = eligibleInventoryClient({ from: vi.fn(() => query) } as any);
    client.from("deals").select("id");
    client.from("sold_listings").select("id");
    expect(filter.eq).toHaveBeenCalledTimes(2);
    expect(filter.eq).toHaveBeenCalledWith("access_hold", false);
    client.from("deals").upsert({ id: "x" });
    client.from("profiles").select("id");
    expect(filter.eq).toHaveBeenCalledTimes(2);
  });
});
