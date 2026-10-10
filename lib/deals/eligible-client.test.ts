import { describe, expect, it, vi } from "vitest";
import { eligibleInventoryClient } from "./eligible-client";
describe("service-role inventory reads", () => {
  it("filters holds on reads, not mutation receipts or unrelated tables", () => {
    const filter = { eq: vi.fn(() => filter), gt: vi.fn(() => filter) };
    const query = { select: vi.fn(() => filter), upsert: vi.fn(() => filter) };
    const from = vi.fn(() => query);
    const client = eligibleInventoryClient({ from } as any);
    client.from("deals").select("id");
    client.from("sold_listings").select("id");
    expect(from).toHaveBeenCalledWith("eligible_deals");
    expect(from).toHaveBeenCalledWith("eligible_sold_listings");
    client.from("deals").upsert({ id: "x" });
    client.from("profiles").select("id");
    expect(from).not.toHaveBeenCalledWith("eligible_profiles");
  });
});
