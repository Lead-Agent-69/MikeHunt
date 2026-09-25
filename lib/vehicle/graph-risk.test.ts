import { describe, it, expect } from "vitest";
import { graphRisk } from "./vin-history";

describe("graphRisk — misrepresentation demotes, disclosure doesn't", () => {
  it("flags a 'clean' listing with prior-salvage records as misrepresented (the trap)", () => {
    const r = graphRisk("clean_title", ["Prior salvage (our records)"]);
    expect(r.misrepresented).toBe(true);
    expect(r.severity).toBe("high");
    expect(r.warning).toMatch(/contradict|washing/i);
  });

  it("flags title washing on a clean listing", () => {
    const r = graphRisk("clean", ["⚠️ Possible title washing — branded earlier, now listed clean"]);
    expect(r.misrepresented).toBe(true);
  });

  it("rollback is misrepresentation regardless of claimed condition", () => {
    const r = graphRisk("salvage_title", ["Odometer rollback suspected (120,000 → 80,000 mi)"]);
    expect(r.misrepresented).toBe(true);
  });

  it("does NOT demote a salvage car that already discloses its brand (no surprise)", () => {
    const r = graphRisk("salvage_title", ["Prior salvage (our records)", "Previously at Copart salvage auction"]);
    expect(r.misrepresented).toBe(false);
    expect(r.severity).toBe("info");
  });

  it("no flags → no misrepresentation", () => {
    expect(graphRisk("clean", []).misrepresented).toBe(false);
  });
});
