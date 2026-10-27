import { expect, it } from "vitest";
import { onboardingMarketHref } from "./onboarding-market";
it("carries the preview's multi-select vehicles, state, budget, title and repair scope into results", () => {
  const query = new URL(
    onboardingMarketHref({
      vehicles: ["SUVs", "Trucks"],
      state: "MO",
      maxPrice: 25000,
      titleType: "clean",
      includeRepairable: false,
    }),
    "http://local.test",
  ).searchParams;
  expect(Object.fromEntries(query)).toEqual({
    categories: "suvs,trucks",
    states: "MO",
    priceMax: "25000",
    titleType: "clean",
    includeRepairable: "0",
    hasPhotos: "yes",
  });
});
it("keeps distinct body styles and supports nationwide repairable browsing", () => {
  expect(
    onboardingMarketHref({
      vehicles: ["Vans", "Convertibles", "Coupes"],
      state: "Nationwide",
      titleType: "salvage",
      includeRepairable: true,
    }),
  ).toContain("categories=vans%2Cconvertibles%2Ccoupes");
  expect(
    onboardingMarketHref({ vehicle: "All vehicle types", state: "Nationwide" }),
  ).not.toMatch(/categories=|states=/);
});
