import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("buyer hierarchy upgrade", () => {
  it("keeps operational diagnostics available but closed by default", () => {
    const scan = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
    const start = scan.indexOf("{isAdmin ? (");
    const panel = scan.indexOf("<SmartDataPlanCard", start);
    expect(scan.slice(start, panel)).toContain("<details");
    expect(scan.slice(start, panel)).not.toContain("open=");
    expect(scan.slice(start, panel)).toContain("Source operations");
  });
  it("keeps the primary price and repair guidance without repeating a photo price", () => {
    const card = readFileSync("components/discovery/DiscoveryCard.tsx", "utf8");
    expect(card).toContain('data-testid="discovery-card-price"');
    expect(card).not.toContain('data-testid="discovery-card-photo-price"');
    expect(card.indexOf("{evidence.nextCheck}")).toBeLessThan(
      card.indexOf("Cost estimates and source details"),
    );
    expect(card).toContain("Why shown");
    expect(card).toContain("not inspection findings or guaranteed");
  });
  it("distinguishes behavioral recommendations from saved search matches", () => {
    expect(readFileSync("components/reco/ForYouRail.tsx", "utf8")).toContain(
      "From your activity",
    );
  });
});
