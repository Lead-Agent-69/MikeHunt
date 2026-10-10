import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/components/saved/FindSimilarModal", () => ({
  FindSimilarModal: () => null,
}));
import { SavedCarCard } from "@/components/saved/SavedCarCard";

const save = {
  id: "save-1",
  deal_id: "deal-1",
  status: "active" as const,
  snapshot: {
    vin: "",
    year: 2020,
    make: "Acura",
    model: "MDX",
    titleType: "salvage",
    damageType: "front_end",
    dataQuality: {
      score: 90,
      label: "Strong",
      missing: ["vin", "auction_end"],
    },
    trustExplanation: {
      score: 95,
      summary: "Inspection required",
      nextChecks: ["Repair quote"],
    },
  },
  source_name: "craigslist",
  source_url: "https://example.com/vehicle",
  price_at_save: 3000,
  last_price_seen: 3000,
  market_value_at_save: 0,
  profit_at_save: 0,
  saved_at: "2026-10-08T00:00:00Z",
};
it("shows sourced claims and specific gaps without presenting quality as accuracy", () => {
  const html = renderToStaticMarkup(
    React.createElement(SavedCarCard, {
      save,
      flipDesk: true,
      onDelete: () => {},
      onUpdateStatus: () => {},
    }),
  );
  // Legacy snapshot titleType "salvage" reads through the shared TitleBadge.
  expect(html).toContain("Salvage title");
  expect(html).toContain("front end");
  expect(html).toContain("Still needed:");
  expect(html).toContain("VIN");
  expect(html).not.toContain("auction_end");
  expect(html).not.toContain("90%");
  expect(html).not.toContain("95/100");
  expect(html).toContain("<details");
  expect(html).toContain("Inspection required");
});
it("retains unavailable vehicles and does not describe them as ready to buy", () => {
  const html = renderToStaticMarkup(
    React.createElement(SavedCarCard, {
      save: { ...save, status: "unavailable" },
      onDelete: () => {},
      onUpdateStatus: () => {},
    }),
  );
  expect(html).toContain("Listing is no longer available");
  expect(html).toContain("Acura");
  expect(html).not.toContain("Ready to review");
});
