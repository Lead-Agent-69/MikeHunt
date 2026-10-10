import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = () => readFileSync("app/onboarding/page.tsx", "utf8");

describe("onboarding step dots accessibility", () => {
  it("dots are a labelled progressbar with current/max values", () => {
    const src = page();
    expect(src).toContain('role="progressbar"');
    expect(src).toContain("aria-valuemin={1}");
    expect(src).toContain("aria-valuenow={step + 1}");
    expect(src).toContain("aria-valuemax={steps.length}");
    expect(src).toContain(
      "aria-valuetext={`Step ${step + 1} of ${steps.length}`}",
    );
  });

  it("no aria-label on a role-less div (axe aria-prohibited-attr)", () => {
    expect(page()).not.toContain(
      'className="mb-7 flex gap-1.5"\n          aria-label=',
    );
  });

  it("active dot is marked as the current step and the step count is visible text", () => {
    const src = page();
    expect(src).toContain('aria-current={index === step ? "step" : undefined}');
    expect(src).toMatch(/Step \{step \+ 1\} of \{steps\.length\}/);
  });
});
