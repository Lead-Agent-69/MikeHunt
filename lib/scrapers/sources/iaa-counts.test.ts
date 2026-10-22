import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), store: vi.fn() }));
vi.mock("../smart-fetch", () => ({ smartFetch: mocks.fetch }));
vi.mock("./shared", () => ({ enrichAndStore: mocks.store }));
import { scrapeIAA } from "./iaa";
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("reports only rows actually accepted by persistence", async () => {
  vi.useFakeTimers();
  mocks.fetch.mockResolvedValueOnce({
    html: "<loc>https://www.iaai.com/sitemap1.xml</loc>",
    blocked: false,
  });
  mocks.fetch.mockResolvedValueOnce({
    html: "<loc>https://www.iaai.com/vehicledetail/1</loc><loc>https://www.iaai.com/vehicledetail/2</loc>",
    blocked: false,
  });
  for (const StockNumber of ["1", "2"])
    mocks.fetch.mockResolvedValueOnce({
      html: `<script type="application/json">${JSON.stringify({ inventoryView: { attributes: { StockNumber, Year: "2020", Make: "Ford", Model: "Explorer" } } })}</script>`,
      blocked: false,
    });
  mocks.store.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
  const pending = scrapeIAA("", 2);
  await vi.runAllTimersAsync();
  expect(await pending).toBe(1);
  expect(mocks.store).toHaveBeenCalledTimes(2);
});
