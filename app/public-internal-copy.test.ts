import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("public pages do not expose internal ops copy", () => {
  it("upgrade does not mention Stripe keys or configuration", () => {
    const page = read("app/(dashboard)/upgrade/page.tsx");
    expect(page).not.toMatch(/Stripe keys/i);
    expect(page).not.toMatch(/once .* configured/i);
    expect(page).toContain("Free workspace upgrade");
    expect(page).toContain("No card, checkout, recurring charge");
  });

  it("changelog drops admin/internal entries and filters DB rows", () => {
    const page = read("app/(dashboard)/changelog/page.tsx");
    expect(page).not.toContain("Admin Operations Command Center");
    expect(page).not.toContain("one-click bulk rescore runner");
    expect(page).not.toContain("Stripe Webhook Cancellation Handling");
    expect(page).not.toContain("the operations center");
    expect(page).toContain("data.map(publicEntry)");
    expect(page).toContain("Photo Recon Estimate");
  });
});
