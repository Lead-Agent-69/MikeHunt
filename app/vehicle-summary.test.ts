import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VehicleSummary } from "@/components/deal/VehicleSummary";
import { readFileSync } from "node:fs";

describe("first-screen listing facts", () => {
  it("shows the actual vehicle and asking price as a page heading, with location and mileage", () => {
    const html = renderToStaticMarkup(
      React.createElement(VehicleSummary, {
        deal: {
          year: 2022,
          make: "Volkswagen",
          model: "Atlas Cross Sport",
          source: "independent_dealer",
          askPrice: 12980,
          locationCity: "Miami",
          locationState: "FL",
          mileage: 52065,
        },
      }),
    );
    expect(html).toContain("<h1");
    expect(html).toContain("2022 Volkswagen Atlas Cross Sport");
    expect(html).toContain("Asking price");
    expect(html).toContain("$12,980");
    expect(html).toContain("Miami, FL");
    expect(html).toContain("52,065 mi");
  });
  it("does not turn missing/invalid prices and dates into zeros or false facts", () => {
    for (const askPrice of [undefined, 0, NaN, -10]) {
      const html = renderToStaticMarkup(
        React.createElement(VehicleSummary, {
          deal: { askPrice, lastSeenAt: "invalid", condition: "run_drive" },
        }),
      );
      expect(html).toContain("Not reported");
      expect(html).not.toContain("$0");
      expect(html).not.toContain("Invalid Date");
      expect(html).not.toContain("Reported yes");
    }
  });
  it("distinguishes auction bids and explicit negative reports", () => {
    const html = renderToStaticMarkup(
      React.createElement(VehicleSummary, {
        deal: {
          source: "copart",
          askPrice: 4500,
          runAndDrive: false,
          hasKeys: true,
          mileage: 0,
        },
      }),
    );
    expect(html).toContain("Current bid");
    expect(html).toContain("Reported no");
    expect(html).toContain("Reported yes");
    expect(html).toContain("0 mi");
    expect(html).not.toContain("Asking price");
  });
  it("keeps incomplete purchase evidence visible before the photo", () => {
    const html = renderToStaticMarkup(
      React.createElement(VehicleSummary, {
        deal: {
          askPrice: 5000,
          decisionEvidence: {
            acquisitionReady: false,
            label: "Repairable vehicle",
          },
        },
      }),
    );
    expect(html).toContain("Repairable vehicle");
    expect(html).toContain("research before purchase");
  });
  it("keeps photos before secondary checklists and explicit planning actions reachable", () => {
    const source = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");
    expect(source.indexOf('aria-label="Listing photos"')).toBeLessThan(
      source.indexOf("<PersonalListingLead"),
    );
    expect(source).toContain('"Save vehicle"');
    expect(source).toContain('href="/fleet"');
    expect(source).toContain('"Record purchase"');
    expect(source).toContain('aria-label="Vehicle actions"');
    expect(source).not.toContain("max-w-5xl mx-auto animate-fadeUp");
  });
});
