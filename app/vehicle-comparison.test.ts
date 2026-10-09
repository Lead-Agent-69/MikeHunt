import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const swr = vi.hoisted(() => ({ result: {} as any, loader: null as any }));
vi.mock("swr", () => ({
  default: (_key: unknown, loader: unknown) => {
    swr.loader = loader;
    return { ...swr.result, mutate: vi.fn() };
  },
}));
import { VehicleComparison } from "@/components/saved/VehicleComparison";

const car = {
  id: "car1",
  make: "Toyota",
  model: "Camry",
  year: 2020,
  askPrice: 15000,
  source: "independent_dealer",
  active: true,
  lastSeenAt: new Date().toISOString(),
};
const render = () =>
  renderToStaticMarkup(
    createElement(VehicleComparison, { ids: ["car1", "car2"] }),
  );

describe("shortlist comparison", () => {
  beforeEach(() => {
    swr.result = { data: { cars: [car], failed: 0 } };
    vi.unstubAllGlobals();
  });
  it("puts price and photo state in the vehicle header, before the detail rows", () => {
    const html = render();
    expect(
      html.slice(html.indexOf("<thead>"), html.indexOf("</thead>")),
    ).toContain("$15,000");
    expect(html).toContain("Photo unavailable");
    expect(html).toContain("Differences only");
    expect(html).toContain("Incomplete: verify fees");
    expect(html).not.toContain("Best buy");
  });
  it("labels ended auctions without removing saved history", () => {
    swr.result.data.cars = [{ ...car, auctionEndAt: "2020-01-01" }];
    expect(render()).toContain("Auction ended");
  });
  it("keeps other cars and a retry when one selection fails", async () => {
    render();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ deal: car }) })
        .mockResolvedValueOnce({ ok: false }),
    );
    const result = await swr.loader();
    expect(result).toEqual({ cars: [car], failed: 1 });
    swr.result.data = result;
    const html = render();
    expect(html).toContain("1 selected vehicle couldn&#x27;t load");
    expect(html).toContain("Retry");
    expect(html).toContain("$15,000");
  });
  it("all failed selections produce an error, not an empty shortlist", async () => {
    render();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(swr.loader()).rejects.toThrow(
      "Selected vehicles couldn't be loaded",
    );
  });
  it("hides identical details but keeps availability and incomplete costs visible", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    swr.result.data.cars = [car, { ...car, id: "car2", askPrice: 16000 }];
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          createElement(VehicleComparison, { ids: ["car1", "car2"] }),
        ),
      );
      expect(host.textContent).toContain("Mileage reported");
      await act(async () =>
        host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
      );
      expect(host.textContent).not.toContain("Mileage reported");
      expect(host.textContent).toContain("Availability");
      expect(host.textContent).toContain("Incomplete: verify fees");
      expect(host.textContent).toContain("$16,000");
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
