import { describe, expect, it, vi } from "vitest";
import { applyGoVerdictFilter } from "./go-verdict-filter";

describe("stored verdict query compatibility", () => {
  function query() {
    const q: any = {
      eq: vi.fn(() => q),
      gte: vi.fn(() => q),
      or: vi.fn(() => q),
    };
    return q;
  }
  it("requires both an existing GO and the current profit floor", () => {
    const q = query();
    expect(applyGoVerdictFilter(q, "go", 5000)).toBe(q);
    expect(q.eq).toHaveBeenCalledWith("deal_verdict", "go");
    expect(q.gte).toHaveBeenCalledWith("true_net_profit", 5000);
  });
  it("keeps demoted legacy GO records reachable under HOLD", () => {
    const q = query();
    applyGoVerdictFilter(q, "hold");
    expect(q.or).toHaveBeenCalledWith(
      "deal_verdict.eq.hold,and(deal_verdict.eq.go,true_net_profit.lt.3000),and(deal_verdict.eq.go,true_net_profit.is.null)",
    );
    expect(q.eq).not.toHaveBeenCalled();
  });
  it("does not promote PASS or change other established verdict filters", () => {
    const q = query();
    applyGoVerdictFilter(q, "pass");
    expect(q.eq).toHaveBeenCalledWith("deal_verdict", "pass");
    expect(q.or).not.toHaveBeenCalled();
  });
});
