import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/(dashboard)/alerts/page.tsx", "utf8");

describe("/alerts load error", () => {
  it("reads the SWR error once", () => {
    expect(source).not.toContain("_alertsError");
    expect(source.match(/^\s+error,$/gm)).toHaveLength(1);
  });

  it("tells the buyer when server alerts fail instead of showing an empty inbox", () => {
    expect(source).toContain("{error && (");
    expect(source).toContain("Server alerts couldn&apos;t load right now.");
    expect(source).toContain("onRetry={() => mutate()}");
  });
});
