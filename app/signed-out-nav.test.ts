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
    // Signed out = personal, so the /fleet tab reads "Purchase plan".
    const pipeline = desktop.find((item) => item.name === "Purchase plan");
    expect(saved).toMatchObject({
      href: "/login?next=%2Fsaved",
      signInRequired: true,
    });
    expect(pipeline).toMatchObject({
      href: "/login?next=%2Ffleet",
      signInRequired: true,
    });
    expect(desktop.find((item) => item.name === "Discover")).not.toHaveProperty(
      "signInRequired",
    );
  });

  it("flags the mobile tabs the same way and keeps five tabs", () => {
    const tabs = mobileNavForMode(undefined).map((item) =>
      navItemForViewer(item, true),
    );
    expect(tabs).toHaveLength(5);
    expect(
      tabs.filter((item) => item.signInRequired).map((item) => item.name),
    ).toEqual(["Saved", "Pipeline"]);
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
