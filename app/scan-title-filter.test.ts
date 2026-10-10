import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Scan title filter: five buckets, sent as titleType", () => {
  it("the Scan page uses the shared options and still sends titleType", () => {
    const src = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
    expect(src).toContain("titleFilterOptions(");
    expect(src).not.toContain('{ value: "clean", label: "Clean Title" }');
    expect(src).toMatch(
      /titleType: titleType !== "all" \? titleType : undefined/,
    );
  });
});
