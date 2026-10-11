import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/saved/FindSimilarModal", () => ({
  FindSimilarModal: () => null,
}));
import { SavedCarCard } from "@/components/saved/SavedCarCard";

function card(dealId = "vehicle-one") {
  const html = renderToStaticMarkup(
    React.createElement(SavedCarCard, {
      save: {
        id: "save-one",
        deal_id: dealId,
        status: "active",
        snapshot: {
          year: 2022,
          make: "Honda",
          model: "Civic",
          vin: "",
          sourceUrl: "https://example.com/listing",
          images: ["https://example.com/photo.jpg"],
        },
        source_name: "independent_dealer",
        source_url: "",
        price_at_save: 12000,
        last_price_seen: 12000,
        market_value_at_save: 0,
        profit_at_save: 0,
        saved_at: "2026-10-08",
      },
      onDelete: vi.fn(),
      onUpdateStatus: vi.fn(),
    }),
  );
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}
describe("saved-card actions", () => {
  it("uses native review links, labeled touch-sized actions and snapshot source fallback", () => {
    const host = card();
    expect(host.querySelector("a button")).toBeNull();
    expect(
      host.querySelector('[aria-label="Saved vehicle price"]')?.textContent,
    ).toContain("$12,000");
    expect(
      host.innerHTML.indexOf('aria-label="Saved vehicle price"'),
    ).toBeLessThan(host.innerHTML.indexOf("Source proof:"));
    expect(
      host.querySelector('a[href="/deal/vehicle-one"]')?.textContent,
    ).not.toBeUndefined();
    expect(
      host.querySelector('button[aria-label="Remove saved vehicle"]')
        ?.className,
    ).toContain("h-11");
    expect(
      host
        .querySelector('a[aria-label="Open original listing"]')
        ?.getAttribute("href"),
    ).toBe("https://example.com/listing");
  });
  it("does not send a source-only save to an empty deal route", () => {
    const host = card("");
    expect(host.querySelector('a[href="/deal/"]')).toBeNull();
    expect(host.textContent).toContain("Find similar");
    expect(host.querySelector('[data-testid="saved-card-open"]')).toBeNull();
  });
  it("extends the title deep link across the card, keeping actions independent", () => {
    const host = card();
    const link = host.querySelector('[data-testid="saved-card-open"]');
    expect(link?.getAttribute("href")).toBe("/deal/vehicle-one");
    expect(link?.className).toContain("after:inset-0");
    expect(link?.className).toContain("after:z-10");
    expect(host.querySelector("a button")).toBeNull();
    expect(
      host.querySelector('button[aria-label="Remove saved vehicle"]')
        ?.parentElement?.className,
    ).toContain("z-20");
    expect(host.textContent).toContain("Mileage not reported");
  });
});
