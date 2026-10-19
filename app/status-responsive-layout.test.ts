import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("status responsive layout", () => {
  it("lets long status content wrap without hiding it on narrow screens", () => {
    const page = readFileSync("app/(dashboard)/status/page.tsx", "utf8");

    expect(page).toContain("px-0 py-8 space-y-6 sm:px-4");
    expect(page).toContain(
      'className="min-w-0 break-words rounded-[var(--r3)]',
    );
    expect(page).not.toContain("min-w-0 overflow-hidden break-words");
    expect(page).toContain("min-w-0 [overflow-wrap:anywhere]");
  });

  it("stacks source metrics before the small-screen layout overflows", () => {
    const page = readFileSync("app/(dashboard)/status/page.tsx", "utf8");

    expect(page).toContain(
      "flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center",
    );
    expect(page).toContain(
      "grid w-full grid-cols-3 items-center gap-2 text-[11px]",
    );
    expect(page).toContain(
      "flex flex-col gap-1 py-2 text-xs sm:flex-row sm:items-center",
    );
  });
});
