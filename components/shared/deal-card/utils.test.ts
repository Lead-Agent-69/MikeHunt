import { describe, expect, it } from "vitest";
import { formatCondition } from "./utils";

describe("buyer-facing condition labels", () => {
  it("labels a title claim without treating it as an inspection", () => {
    expect(formatCondition("clean_title", "used")).toBe(
      "Clean title reported · used",
    );
  });
  it("preserves damage and unknowns without backend codes", () => {
    expect(formatCondition("parts_only", "front_end")).toBe(
      "Parts only · front end",
    );
    expect(formatCondition()).toBe("Unknown");
    expect(formatCondition("used", "used")).toBe("used");
  });
});
