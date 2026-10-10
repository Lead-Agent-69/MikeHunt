import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("dealer network honesty", () => {
  const page = read("app/(dashboard)/dealer-network/page.tsx");
  const host = read("app/(dashboard)/dealer-network/[host]/page.tsx");

  it("defaults the state filter to the saved home state after prefs load", () => {
    expect(page).toContain("usePreferences");
    expect(page).toContain("discoverHomeState(prefs.homeLocation");
    expect(page).toMatch(/prefsLoading \|\| !homeState\) return/);
    expect(page).toContain("!data || prefsLoading ?");
  });

  it("calls inventory saved/imported, not live", () => {
    expect(page).not.toMatch(/live\{" "\}/);
    expect(page).not.toContain("{data.message}");
    expect(page).not.toMatch(/Connect Supabase/);
    expect(host).not.toContain("live vehicles");
    expect(host).not.toContain("No live inventory");
    expect(host).toContain("saved / imported vehicles");
  });
});
