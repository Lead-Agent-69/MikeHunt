import { describe, expect, it } from "vitest";
import { runOutcome, redactDiagnostic } from "./run-outcome";
describe("run evidence", () => {
  it("distinguishes useful imports from unverified zero yield and intentional skips", () => {
    expect(runOutcome(true, 0)).toBe("unverified_empty");
    expect(runOutcome(true, 2)).toBe("imported");
    expect(runOutcome(false, 0, "Source permission required")).toBe("skipped");
    expect(runOutcome(false, 0, "HTTP 403 challenge")).toBe("blocked");
    expect(runOutcome(false, 0, "Aborted")).toBe("cancelled");
  });
  it("redacts credentials and signed URL query strings", () => {
    const value = redactDiagnostic(
      "token=secret cookie=private https://user:password@example.com/a?key=secret",
    );
    expect(value).not.toContain("secret");
    expect(value).not.toContain("password");
    expect(value).not.toContain("private");
  });
});
