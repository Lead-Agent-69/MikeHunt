import { beforeEach, describe, expect, it, vi } from "vitest";
const resolve = vi.hoisted(() => vi.fn());
vi.mock("./zip-radius", () => ({ resolveZipRadius: resolve }));
import { inventoryLocation, inventoryLocationQuery } from "./radius-inventory";

beforeEach(() => resolve.mockReset());
describe("shared radius inventory", () => {
  it("does not apply an exact postal-code filter after resolving a radius", async () => {
    resolve.mockResolvedValue({
      zip: "63101",
      radius: 50,
      lat: 38.63,
      lng: -90.2,
    });
    const params = new URLSearchParams(
      "zip=63101&radius=50&source=copart&state=all",
    );
    const location = await inventoryLocation({}, params);
    expect(location.details.has("zip")).toBe(false);
    expect(location.details.get("source")).toBe("copart");
    expect(params.get("zip")).toBe("63101");
    const select = vi.fn().mockReturnValue("query");
    const rpc = vi.fn().mockReturnValue({ select });
    expect(
      inventoryLocationQuery({ rpc }, location, "id,ask_price", true),
    ).toBe("query");
    expect(rpc).toHaveBeenCalledWith(
      "inventory_within_radius",
      { p_lat: 38.63, p_lng: -90.2, p_radius: 50 },
      { count: "exact" },
    );
    expect(select).toHaveBeenCalledWith("id,ask_price");
  });
  it("fails closed when a requested ZIP cannot be resolved", async () => {
    resolve.mockResolvedValue(null);
    const location = await inventoryLocation(
      {},
      new URLSearchParams("zip=00000&radius=50"),
    );
    const from = vi.fn();
    expect(() => inventoryLocationQuery({ from }, location, "id")).toThrow(
      "Search location unavailable",
    );
    expect(from).not.toHaveBeenCalled();
  });
  it("retains the ordinary inventory path when no radius center was requested", async () => {
    const location = await inventoryLocation(
      {},
      new URLSearchParams("state=MO"),
    );
    const select = vi.fn().mockReturnValue("state query");
    expect(
      inventoryLocationQuery({ from: () => ({ select }) }, location, "id"),
    ).toBe("state query");
    expect(resolve).not.toHaveBeenCalled();
  });
});
