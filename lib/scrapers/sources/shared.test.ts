import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../pipeline", () => ({ upsertDeals: vi.fn() }));
import { upsertDeals } from "../pipeline";
import { enrichAndStore } from "./shared";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("source persistence counts", () => {
  const row = {
    title: "2020 Ford Explorer",
    asking_price: 18000,
    location_state: "MO",
  };

  it("reports accepted rows, not rows rejected by buyer scope", async () => {
    vi.stubEnv("MARKETCHECK_API_KEY", "");
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    vi.mocked(upsertDeals).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    expect(await enrichAndStore(row)).toBe(0);
    expect(await enrichAndStore(row)).toBe(1);
    expect(network).not.toHaveBeenCalled();
  });

  it("does not count a failed write as collected inventory", async () => {
    vi.stubEnv("MARKETCHECK_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(upsertDeals).mockRejectedValueOnce(new Error("write failed"));
    expect(await enrichAndStore(row)).toBe(0);
  });
});
