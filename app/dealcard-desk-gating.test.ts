import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

import { DealCard } from "@/components/shared/DealCard";

const deal = {
  id: "deal-1",
  source: "craigslist",
  year: 2019,
  make: "Toyota",
  model: "Camry",
  askPrice: 15000,
  mmrValue: 18000,
  sellEstimate: 18000,
  profitEstimate: 2100,
  recommendedMaxBid: 15900,
};

beforeAll(() => {
  // framer-motion warns about useLayoutEffect under renderToStaticMarkup.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function render(flipDesk?: boolean) {
  return renderToStaticMarkup(
    createElement(DealCard, {
      ...deal,
      ...(flipDesk === undefined ? {} : { flipDesk }),
    }),
  );
}

describe("DealCard flip economics by buyer desk", () => {
  it("shows Net Profit Est., max bid, net chip and spread to flip desks", () => {
    const html = render(true);
    expect(html).toContain("Net Profit Est.");
    expect(html).toContain("Max bid");
    expect(html).toContain("+$2,100 net");
    expect(html).toContain("$15,900 max bid");
    expect(html).toContain("estimated spread");
  });

  it("keeps legacy flip-only callers unchanged when flipDesk is omitted", () => {
    expect(render()).toContain("Net Profit Est.");
  });

  it("hides profit, max bid, and spread from non-flip buyers", () => {
    const html = render(false);
    expect(html).not.toContain("Net Profit Est.");
    expect(html).not.toMatch(/max bid/i);
    expect(html).not.toContain("+$2,100");
    expect(html).not.toMatch(/spread/i);
    expect(html).not.toContain("$15,900");
    expect(html).toContain("$3,000 under market est.");
    expect(html).toContain("$15,000");
  });
});

describe("DealCard callers pass the buyer desk", () => {
  it("Scan passes its isFlipBuyerMode-derived flipDesk", () => {
    const scan = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
    expect(scan).toMatch(/<DealCard\s+flipDesk=\{flipDesk\}/);
  });

  it("Alerts passes the server deskAccess", () => {
    const alerts = readFileSync("app/(dashboard)/alerts/page.tsx", "utf8");
    expect(alerts).toContain('const flipDesk = deskAccess === "flip";');
    expect(alerts).toMatch(/<DealCard\s+flipDesk=\{flipDesk\}/);
  });
});
