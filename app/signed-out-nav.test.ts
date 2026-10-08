import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  mobileNavForMode,
  navItemForViewer,
  primaryNavForMode,
} from "@/components/layout/nav-items";

describe("signed-out nav", () => {
  it("sends Saved and Pipeline straight to sign-in with a return path", () => {
    const desktop = primaryNavForMode("personal").map((item) =>
      navItemForViewer(item, true),
    );
    const saved = desktop.find((item) => item.name === "Saved");
    const pipeline = desktop.find((item) => item.name === "Plan");
    expect(saved).toMatchObject({
      href: "/login?next=%2Fsaved",
      signInRequired: true,
    });
    expect(pipeline).toMatchObject({
      href: "/login?next=%2Ffleet",
      signInRequired: true,
    });
    expect(desktop.find((item) => item.name === "Discover")).toMatchObject({
      href: "/login?next=%2Fdiscover",
      signInRequired: true,
    });
  });

  it("flags the mobile tabs the same way and keeps four task-focused tabs", () => {
    const tabs = mobileNavForMode(undefined).map((item) =>
      navItemForViewer(item, true),
    );
    expect(tabs).toHaveLength(4);
    expect(
      tabs.filter((item) => item.signInRequired).map((item) => item.name),
    ).toEqual(["Discover", "Saved", "Plan"]);
  });

  it("leaves signed-in (or still checking) visitors untouched", () => {
    for (const item of primaryNavForMode("dealer")) {
      expect(navItemForViewer(item, false)).toBe(item);
    }
  });

  it("marks the locked tabs in both navs only after the session check", () => {
    const top = readFileSync("components/layout/TopNav.tsx", "utf8");
    const dock = readFileSync("components/BottomNav.tsx", "utf8");
    for (const source of [top, dock]) {
      expect(source).toContain("const signedOut = !authLoading && !dealerId;");
      expect(source).toContain("(sign in required)");
      expect(source).toContain("Sign in to use ${item.name}");
    }
    expect(top).toContain("Sign in to see activity and alerts");
  });
});
