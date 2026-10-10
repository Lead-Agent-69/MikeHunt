import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("home save and Discover refresh", () => {
  it("LocationPrefs confirms the save without navigating away from Settings", () => {
    const src = read("components/settings/LocationPrefs.tsx");
    expect(src).not.toContain("router.push");
    expect(src).toContain("await save(patch)");
    expect(src).toContain("Home saved to your account for ${st}.");
    expect(src).toContain("Home saved on this device for ${st}.");
  });

  it("Discover checks saved listings and does not keep prior market data", () => {
    const page = read("app/(dashboard)/discover/page.tsx");
    expect(page).toContain("keepPreviousData: false");
    expect(page).toContain("Checking saved listings for ${marketLabel}…");
    expect(page).not.toContain(
      'subtitle="Distance not available until a listing has real miles."',
    );
  });
});
