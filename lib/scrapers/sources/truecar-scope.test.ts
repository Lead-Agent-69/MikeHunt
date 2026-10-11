import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../smart-fetch", () => ({ smartFetch: vi.fn() }));
vi.mock("../pipeline", () => ({ upsertDeals: vi.fn() }));
import { smartFetch } from "../smart-fetch";
import { upsertDeals } from "../pipeline";
import { withScrapeRunScope } from "../run-scope-context";
import { scrapeTrueCar } from "./truecar";

afterEach(() => vi.restoreAllMocks());

describe("TrueCar scoped requests", () => {
  it("searches Missouri centers with the buyer query, never Dallas, and does not count blocked requests", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(smartFetch).mockResolvedValue({
      html: "",
      blocked: true,
    } as Awaited<ReturnType<typeof smartFetch>>);
    const count = await withScrapeRunScope(
      { state: "MO", q: "SUVs Ford", model: "Explorer" },
      () => scrapeTrueCar(),
    );
    const urls = vi.mocked(smartFetch).mock.calls.map(([url]) => new URL(url));
    expect(urls.map((url) => url.searchParams.get("zip"))).toEqual([
      "63101",
      "64106",
      "65806",
    ]);
    expect(
      urls.every(
        (url) => url.searchParams.get("searchText") === "Ford Explorer",
      ),
    ).toBe(true);
    expect(count).toBe(0);
    expect(upsertDeals).not.toHaveBeenCalled();
  });
});
