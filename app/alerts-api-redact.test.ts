import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("alerts page never joins deals(*) from the browser", () => {
  it("loads inbox via /api/alerts and dismisses via DELETE", () => {
    const page = readFileSync("app/(dashboard)/alerts/page.tsx", "utf8");
    expect(page).toContain('fetch("/api/alerts")');
    expect(page).toContain("/api/alerts/");
    expect(page).toContain('method: "DELETE"');
    expect(page).not.toContain("user_feed_inbox");
    expect(page).not.toContain("deals (*)");
    expect(page).not.toContain("deals(*)");
  });
});
