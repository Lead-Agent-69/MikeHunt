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
  it.each([
    ["saved", "/saved", "Back to Saved"],
    [
      "00000000-0000-4000-8000-000000000001",
      "/deal/00000000-0000-4000-8000-000000000001",
      "Back to vehicle",
    ],
    [undefined, "/discover", "Back to Discover"],
    ["javascript:alert(1)", "/discover", "Back to Discover"],
    ["//example.com", "/discover", "Back to Discover"],
    ["../admin", "/discover", "Back to Discover"],
  ])(
    "returns to the validated comparison origin: %s",
    (origin, href, label) => {
      const html = renderToStaticMarkup(
        createElement(VehicleComparison, { ids: ["car1", "car2"], origin }),
      );
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(label);
    },
  );
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
  it("preserves reference values without calculating a purchase subtotal", () => {
    swr.result.data.cars = [
      {
        ...car,
        askPrice: 0,
        priceEvidence: { kind: "reference", referenceValue: 24000 },
      },
    ];
    const html = render();
    expect(html).toContain("Reference value");
    expect(html).toContain("$24,000");
    expect(
      html.slice(
        html.indexOf("Known-cost subtotal"),
        html.indexOf("All-in cost"),
      ),
    ).toContain("Not confirmed");
  });
  it.each([
    { active: false },
    { auctionEndAt: "2020-01-01" },
    { lastSeenAt: "2020-01-01" },
  ])(
    "does not promote inactive, ended or stale offers into a current subtotal: %j",
    (fields) => {
      swr.result.data.cars = [
        {
          ...car,
          sourceUrl: "https://seller.example/car/1",
          priceEvidence: { kind: "asking", askingPrice: 15000 },
          ...fields,
        },
      ];
      expect(
        render().split("Known-cost subtotal")[1].split("All-in cost")[0],
      ).toContain("Not confirmed");
    },
  );
  it("does not subtract impossible repair or transport allowances", () => {
    swr.result.data.cars = [
      {
        ...car,
        sourceUrl: "https://seller.example/car/1",
        priceEvidence: { kind: "asking", askingPrice: 15000 },
        dealAnalysis: { costs: { repair: -500, transport: Infinity } },
      },
    ];
    const html = render();
    expect(
      html.split("Known-cost subtotal")[1].split("All-in cost")[0],
    ).toContain("$15,000");
    expect(html).not.toMatch(/-\$500|Infinity|\u221e/);
  });
  it.each(["monthly_payment", "down_payment", "unknown", "current_bid"])(
    "never turns %s into a cash-cost subtotal",
    (kind) => {
      swr.result.data.cars = [
        {
          ...car,
          askPrice: 300,
          sourceUrl: "https://seller.example/car/1",
          priceEvidence: { kind, listedAmount: 300, currentBid: 300 },
          dealAnalysis: { costs: { repair: 500, transport: 100 } },
        },
      ];
      const html = render();
      const subtotal = html.slice(
        html.indexOf("Known-cost subtotal"),
        html.indexOf("All-in cost"),
      );
      expect(subtotal).toContain("Not confirmed");
      expect(subtotal).not.toContain("$900");
    },
  );
  it("uses the reported full asking price instead of a teaser amount", () => {
    swr.result.data.cars = [
      {
        ...car,
        askPrice: 300,
        sourceUrl: "https://seller.example/car/1",
        priceEvidence: { kind: "asking", askingPrice: 15000 },
        dealAnalysis: { costs: { repair: 500, transport: 100 } },
      },
    ];
    const html = render();
    expect(
      html.slice(
        html.indexOf("Known-cost subtotal"),
        html.indexOf("All-in cost"),
      ),
    ).toContain("$15,600");
    expect(html).toContain("Advertised amount $300");
  });
  it("retains typed auction buy-now prices but not bid-based purchase math", () => {
    swr.result.data.cars = [
      {
        ...car,
        source: "copart",
        askPrice: 400,
        buyNowPrice: 12000,
        priceEvidence: { kind: "current_bid", currentBid: 400, buyNow: 12000 },
        sourceUrl: "https://www.copart.com/lot/123",
      },
    ];
    const html = render();
    expect(html).toContain("Current bid");
    expect(html).toContain("Buy-now price");
    expect(
      html.slice(
        html.indexOf("Known-cost subtotal"),
        html.indexOf("All-in cost"),
      ),
    ).toContain("$12,000");
  });
  it.each(["javascript:alert(1)", "https://user:secret@seller.example/car"])(
    "rejects unsafe original links: %s",
    (sourceUrl) => {
      swr.result.data.cars = [{ ...car, sourceUrl }];
      expect(render()).not.toContain("Original listing");
      expect(render()).not.toContain(sourceUrl);
    },
  );
  it("omits empty auction fields when comparing ordinary dealer inventory", () => {
    const html = render();
    expect(html).not.toContain("Run and drive");
    expect(html).not.toContain(">Keys<");
    expect(html).not.toContain("Damage reported");
  });
  it("retains explicit reports and relevant auction fields in mixed comparisons", () => {
    swr.result.data.cars = [car, { ...car, id: "car2", source: "copart" }];
    expect(render()).toContain("Run and drive");
    swr.result.data.cars = [{ ...car, runAndDrive: false }];
    const html = render();
    expect(html).toContain("Run and drive");
    expect(html).toContain("Reported no");
    expect(html).not.toContain(">Keys<");
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
