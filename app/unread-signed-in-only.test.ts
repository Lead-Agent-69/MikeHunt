import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("unread alerts are only requested with a session", () => {
  it("TopNav skips the /api/alerts/unread poll until signed in", () => {
    const top = readFileSync("components/layout/TopNav.tsx", "utf8");
    const effect = top.slice(
      top.indexOf("if (!dealerId) {"),
      top.indexOf("}, [dealerId]);"),
    );
    expect(effect).toContain('fetch("/api/alerts/unread"');
    expect(effect.indexOf("return;")).toBeLessThan(
      effect.indexOf('fetch("/api/alerts/unread"'),
    );
  });

  it("/alerts marks alerts read only for a signed-in user", () => {
    const page = readFileSync("app/(dashboard)/alerts/page.tsx", "utf8");
    expect(page).toMatch(
      /if \(data\.user\) \{\s+setUserId\(data\.user\.id\);\s+markAllRead\(\);/,
    );
  });
});
