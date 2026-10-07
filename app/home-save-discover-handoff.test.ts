import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("home save → Discover handoff", () => {
  it("LocationPrefs navigates to Discover for the saved home state", () => {
    const src = read("components/settings/LocationPrefs.tsx");
    expect(src).toContain('from "next/navigation"');
    expect(src).toContain("useRouter");
    expect(src).toMatch(
      /router\.push\(`\/discover\?state=\$\{encodeURIComponent\(st\)\}`\)/,
    );
    expect(src).toContain("Home saved — checking saved listings for ${st}…");
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
