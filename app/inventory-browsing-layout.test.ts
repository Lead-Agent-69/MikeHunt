import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(path, "utf8");

describe("inventory browsing safety", () => {
  it("keeps Feed navigation in flow and renders each vehicle once", () => {
    const page = read("app/(dashboard)/feed/page.tsx");
    expect(page).not.toContain("sticky top-3");
    expect(page).not.toContain("EditorialCard");
    expect(page).not.toContain("w-screen");
    expect(page).toContain("<FeedVehicleCard");
  });
  it("cancels stale Feed requests and carries the search into empty-state results", () => {
    const page = read("app/(dashboard)/feed/page.tsx");
    expect(page).toContain("request.current?.abort()");
    expect(page).toContain("token !== generation.current");
    expect(page).toContain("signal: controller.signal");
    expect(page).toContain("primaryHref={`/scan?${query}`}");
  });
  it("makes the view switcher reachable directly from Discover", () => {
    expect(read("app/(dashboard)/layout.tsx")).toContain(
      "<DiscoveryViewAccess />",
    );
    expect(read("components/search/DiscoveryViewAccess.tsx")).toContain(
      'path !== "/discover"',
    );
    expect(read("components/search/DiscoveryViewAccess.tsx")).not.toContain(
      "<details",
    );
  });
  it("provides keyboard decisions, vertical touch scrolling and reduced motion", () => {
    const stack = read("components/ui/framer-components.tsx");
    expect(stack).toContain("touch-pan-y");
    expect(stack).toContain('event.key === "ArrowLeft"');
    expect(stack).toContain("reducedMotion ? 0 : rotate");
    expect(stack).toContain('role="status"');
  });
});
