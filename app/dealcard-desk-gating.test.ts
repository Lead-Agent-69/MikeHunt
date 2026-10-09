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
    expect(html).toContain("Needs check");
    expect(html).not.toContain("Possible buy");
  });

  it("never renders $NaN when the server redacted profit for this desk", () => {
    const html = renderToStaticMarkup(
      createElement(DealCard, {
        ...deal,
        flipDesk: true,
        profitEstimate: undefined as unknown as number,
        recommendedMaxBid: undefined,
      }),
    );
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Net Profit Est.");
    expect(html).not.toContain("Pass for now");
  });

  it("never applies a reseller PASS verdict to a personal buyer", () => {
    const html = renderToStaticMarkup(
      createElement(DealCard, {
        ...deal,
        flipDesk: false,
        dealVerdict: "pass",
      }),
    );
    expect(html).not.toContain("Pass for now");
    expect(html).not.toContain("Engine verdict");
    expect(html).toContain("Needs check");
    expect(html).not.toContain("Possible buy");
  });

  it("does not show placeholder flip economics on unanalyzed live-preview rows", () => {
    const html = renderToStaticMarkup(
      createElement(DealCard, {
        ...deal,
        id: "live-copart-123",
        flipDesk: true,
        profitEstimate: 0,
        recommendedMaxBid: undefined,
      }),
    );
    expect(html).not.toContain("Net Profit Est.");
    expect(html).not.toContain("+$0");
    expect(html).not.toMatch(/spread/i);
  });

  it("does not label stale sold anchors as comp-backed value or high confidence", () => {
    const html = renderToStaticMarkup(
      createElement(DealCard, {
        ...deal,
        flipDesk: false,
        soldAnchored: true,
        valuation: {
          source: "comparables",
          confidence: "high",
          compCount: 5,
          soldCount: 3,
          soldLane: "clean",
          soldAt: new Date(Date.now() - 181 * 86400000).toISOString(),
        },
      }),
    );
    expect(html).not.toContain("Comp-backed value");
    expect(html).not.toContain("High confidence");
    expect(html).toContain("Sold comparisons not verified");
  });
  it("does not describe modeled repair and transport amounts as known costs", () => {
    const html = renderToStaticMarkup(
      createElement(DealCard, {
        ...deal,
        repairEstimate: 400,
        transportEstimate: 600,
      }),
    );
    expect(html).not.toContain("Known costs");
    expect(html).toContain("Cost scenario (est.)");
    expect(html).toContain("Repair (est.): $400");
    expect(html).toContain("Transport (est.): $600");
  });
});

describe("DealCard callers pass the buyer desk", () => {
  it("Scan passes flipDesk only when the server sent flip economics", () => {
    const scan = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
    expect(scan).toContain(
      'const flipEconomics = flipDesk && swrData?.deskAccess !== "personal";',
    );
    expect(scan).toMatch(/<DealCard\s+flipDesk=\{flipEconomics\}/);
  });

  it("Alerts passes the server deskAccess", () => {
    const alerts = readFileSync("app/(dashboard)/alerts/page.tsx", "utf8");
    expect(alerts).toContain('const flipDesk = deskAccess === "flip";');
    expect(alerts).toMatch(/<DealCard\s+flipDesk=\{flipDesk\}/);
  });
});
