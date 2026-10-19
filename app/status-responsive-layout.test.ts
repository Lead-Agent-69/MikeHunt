import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("status responsive layout", () => {
  it("allows provider cards with long setup values to shrink on mobile", () => {
    const page = readFileSync("app/(dashboard)/status/page.tsx", "utf8");

    expect(page).toContain(
      'className="min-w-0 overflow-hidden break-words rounded-[var(--r3)]',
    );
  });
});
