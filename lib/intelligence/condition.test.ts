import { describe, it, expect } from "vitest";
import { readCondition } from "./condition";

describe("readCondition", () => {
  it("flags a runner as good and driving", () => {
    const r = readCondition("run_drive", "FRONT END")!;
    expect(r.label).toBe("Runs & drives");
    expect(r.tier).toBe("good");
    expect(r.runs).toBe("yes");
    expect(r.detail).toBe("Front end"); // damage area title-cased
  });

  it("reads repairable as needs-work caution with damage area", () => {
    const r = readCondition("repairable", "REAR END")!;
    expect(r.label).toBe("Needs work");
    expect(r.tier).toBe("caution");
    expect(r.detail).toBe("Rear end");
  });

  it("treats parts-only and non-runners as risk / not running", () => {
    expect(readCondition("parts_only")).toMatchObject({
      label: "Parts only",
      tier: "risk",
      runs: "no",
    });
  });

  it("treats flood/water as risk", () => {
    expect(readCondition("flood")!.tier).toBe("risk");
    expect(readCondition("clean", "WATER/FLOOD")).toBeTruthy();
  });

  it("reads title states", () => {
    expect(readCondition("salvage_title")!.tier).toBe("risk");
    expect(readCondition("rebuilt_title")!.tier).toBe("caution");
    expect(readCondition("clean_title")!).toMatchObject({
      label: "Clean title",
      tier: "good",
    });
    expect(readCondition("certified")!.label).toBe("Certified");
  });

  it("ignores the placeholder damage value 'repairable'", () => {
    expect(readCondition("repairable", "repairable")!.detail).toBeUndefined();
  });

  it("returns null when there's nothing to say", () => {
    expect(readCondition("", "")).toBeNull();
    expect(readCondition(null, null)).toBeNull();
  });

  it("falls back to needs-work when only damage is known", () => {
    expect(readCondition("", "SIDE")).toMatchObject({
      label: "Needs work",
      detail: "Side",
    });
  });
});
