import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

import { DealTable, type TableRow } from "@/components/scan/DealTable";

const rows: TableRow[] = [
  {
    id: "a",
    source: "craigslist",
    year: 2018,
    make: "Honda",
    model: "Civic",
    askPrice: 12000,
    sellEstimate: 14000,
    profitEstimate: 900,
    profitScore: 80,
    recommendedMaxBid: 12345,
  },
  {
    id: "b",
    source: "craigslist",
    year: 2020,
    make: "Toyota",
    model: "Camry",
    askPrice: 18000,
    sellEstimate: 21000,
    profitEstimate: 2600,
    profitScore: 60,
    recommendedMaxBid: 18765,
  },
];

const render = (flipDesk?: boolean) =>
  renderToStaticMarkup(
    createElement(DealTable, {
      rows,
      ...(flipDesk === undefined ? {} : { flipDesk }),
    }),
  );

describe("Scan table flip columns by buyer desk", () => {
  it("shows Max buy and Net profit to flip desks, sorted by net profit", () => {
    const html = render(true);
    expect(html).toContain("Net profit");
    expect(html).toContain("Max buy");
    expect(html).toContain("Sell est.");
    expect(html).toContain("$12,345");
    expect(html.indexOf("Camry")).toBeLessThan(html.indexOf("Civic"));
  });

  it("hides Max buy and Net profit from non-flip buyers and keeps Scan order", () => {
    for (const html of [render(false), render()]) {
      expect(html).not.toContain("Net profit");
      expect(html).not.toContain("Max buy");
      expect(html).not.toContain("$12,345");
      expect(html).not.toContain("$18,765");
      expect(html).toContain("Market est.");
      expect(html.indexOf("Civic")).toBeLessThan(html.indexOf("Camry"));
    }
  });

  it("Scan passes its flipDesk to the table", () => {
    const scan = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
    expect(scan).toMatch(/<DealTable[\s\S]{0,200}flipDesk=\{flipDesk\}/);
  });
});
