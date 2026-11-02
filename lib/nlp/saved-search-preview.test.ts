import { expect, it } from "vitest";
import { savedSearchPreview } from "./saved-search-preview";

it("preserves the recorded Expedition request in Market instead of silently saving broader alerts", () => {
  const p = savedSearchPreview(
    "Ford Expedition, 2018 to 2022, under $20,000, under 100000 miles, within 100 miles of ZIP 63101, clean title.",
  );
  expect(p.parsed.model).toBe("Expedition");
  expect(p.parsed.title_type).toBe("clean");
  expect(p.parsed.max_price).toBe(20000);
  expect(p.blocked).toBe(true);
  expect(p.unsupported).toContain("Mileage limit");
  expect(p.unsupported).toContain("Location / radius");
  expect(p.marketHref).not.toBeNull();
  const params = new URL(p.marketHref!, "https://example.test").searchParams;
  expect(params.get("near")).toBe("63101");
  expect(params.get("radius")).toBe("100");
  expect(params.get("mileageMax")).toBe("100000");
  expect(params.get("yearMin")).toBe("2018");
  expect(params.get("yearMax")).toBe("2022");
  expect(params.get("conditions")).toBe("clean_title");
});

it("never treats a mileage limit as a dollar budget", () => {
  const p = savedSearchPreview("Honda Accord under 80000 miles in Missouri");
  expect(p.parsed.max_price).toBeUndefined();
  expect(p.parsed.state).toBe("MO");
  expect(p.blocked).toBe(true);
});

it("allows representable clean-title criteria and retains exact model and year", () => {
  const p = savedSearchPreview(
    "Honda Accord 2020 clean title in Missouri under $20000",
  );
  expect(p.blocked).toBe(false);
  expect(p.parsed).toMatchObject({
    make: "Honda",
    model: "Accord",
    min_year: 2020,
    max_year: 2020,
    max_price: 20000,
    state: "MO",
    title_type: "clean",
  });
});

it("does not offer a broadened Market URL for ambiguous or excluded criteria", () => {
  const p = savedSearchPreview("Ford Expedition no flood under $20000");
  expect(p.blocked).toBe(true);
  expect(p.marketHref).toBeNull();
});
