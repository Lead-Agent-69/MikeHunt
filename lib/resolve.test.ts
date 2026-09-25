import { describe, it, expect } from "vitest";
import { resolveChain, resolveChainAsync } from "./resolve";

describe("resolveChain (single-value fallback with provenance)", () => {
  it("returns the first non-empty tier + its provenance", () => {
    const r = resolveChain<string>([
      { name: "cache", get: () => null },
      { name: "api", get: () => "" }, // empty string is treated as empty
      { name: "fallback", get: () => "value" },
    ]);
    expect(r).toEqual({ value: "value", source: "fallback", tier: 2 });
  });

  it("prefers the earliest (most-authoritative) tier", () => {
    const r = resolveChain<number>([
      { name: "authoritative", get: () => 1 },
      { name: "backup", get: () => 2 },
    ]);
    expect(r?.source).toBe("authoritative");
    expect(r?.tier).toBe(0);
  });

  it("skips a throwing provider and continues", () => {
    const r = resolveChain<string>([
      {
        name: "flaky",
        get: () => {
          throw new Error("down");
        },
      },
      { name: "steady", get: () => "ok" },
    ]);
    expect(r?.value).toBe("ok");
  });

  it("returns null when every tier is empty", () => {
    expect(
      resolveChain<string>([
        { name: "a", get: () => null },
        { name: "b", get: () => undefined },
      ]),
    ).toBeNull();
  });

  it("async variant awaits providers in order", async () => {
    const r = await resolveChainAsync<string>([
      { name: "remote", get: async () => null },
      { name: "local", get: () => "hit" },
    ]);
    expect(r).toMatchObject({ value: "hit", source: "local" });
  });
});
