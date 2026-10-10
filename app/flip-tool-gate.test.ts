import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FLIP_TOOL_ROUTES, flipToolAccess } from "@/lib/buyer/flip-tool-access";

const base = { mounted: true, prefsLoading: false, savedMode: undefined };

describe("flipToolAccess", () => {
  it("lets reseller and dealer in", () => {
    for (const mode of ["reseller", "dealer"]) {
      expect(flipToolAccess({ ...base, localMode: mode })).toBe("allow");
      expect(
        flipToolAccess({ ...base, localMode: undefined, savedMode: mode }),
      ).toBe("allow");
    }
  });

  it("blocks personal, diy, parts and an unknown mode", () => {
    for (const mode of ["personal", "diy", "parts"]) {
      expect(flipToolAccess({ ...base, localMode: mode })).toBe("deny");
    }
    expect(flipToolAccess({ ...base, localMode: undefined })).toBe("deny");
  });

  it("prefers the mode on this device over the saved one", () => {
    expect(
      flipToolAccess({ ...base, localMode: "personal", savedMode: "dealer" }),
    ).toBe("deny");
  });

  it("waits for mount and for saved prefs before deciding", () => {
    expect(
      flipToolAccess({ ...base, mounted: false, localMode: "dealer" }),
    ).toBe("pending");
    expect(
      flipToolAccess({ ...base, localMode: undefined, prefsLoading: true }),
    ).toBe("pending");
  });
});

describe("flip tool routes", () => {
  it("every flip tool route is wrapped by the shared gate", () => {
    expect(Object.keys(FLIP_TOOL_ROUTES).sort()).toEqual(
      [
        "/arbitrage",
        "/auctions",
        "/best-buy",
        "/find",
        "/fleet",
        "/lane",
        "/market",
      ].sort(),
    );
    for (const route of Object.keys(FLIP_TOOL_ROUTES)) {
      const layout = `app/(dashboard)${route}/layout.tsx`;
      expect(existsSync(layout), layout).toBe(true);
      expect(readFileSync(layout, "utf8")).toContain(
        `<FlipDeskGate route="${route}">`,
      );
    }
  });

  it("all of them stay behind the signed-in proxy", () => {
    const proxy = readFileSync("proxy.ts", "utf8");
    for (const route of Object.keys(FLIP_TOOL_ROUTES)) {
      expect(proxy).toContain(`"${route}",`);
    }
  });

  it("the blocked state links to Settings and Discover", () => {
    const gate = readFileSync("components/shared/FlipDeskGate.tsx", "utf8");
    expect(gate).toContain("This tool is for reseller and dealer desks");
    expect(gate).toContain('href="/settings"');
    expect(gate).toContain('href="/discover"');
  });
});
