import { describe, expect, it } from "vitest";
import { distinctDiscoveryRails } from "./distinct-rails";

describe("distinctDiscoveryRails", () => {
  const rail = (key: string, ids: string[]) => ({
    key,
    deals: ids.map((id) => ({ id })),
  });

  it("shows a single matching vehicle once across identical rails", () => {
    const rails = [rail("profile", ["a"]), rail("budget", ["a"])];
    expect(distinctDiscoveryRails(rails)).toEqual([rails[0]]);
  });

  it("compares sets regardless of ranking or repeated IDs", () => {
    const rails = [
      rail("profile", ["a", "b"]),
      rail("recent", ["b", "a", "a"]),
    ];
    expect(distinctDiscoveryRails(rails)).toEqual([rails[0]]);
  });

  it("retains overlapping collections when they add different choices", () => {
    const rails = [rail("profile", ["a", "b"]), rail("budget", ["b", "c"])];
    expect(distinctDiscoveryRails(rails)).toEqual(rails);
  });

  it("drops empty rails without mutating data or losing unique vehicles", () => {
    const rails = [
      rail("empty", []),
      rail("profile", ["b", "a"]),
      rail("budget", ["a", "b"]),
      rail("other", ["c"]),
    ];
    const before = structuredClone(rails);
    const result = distinctDiscoveryRails(rails);
    expect(result.map((item) => item.key)).toEqual(["profile", "other"]);
    expect(
      new Set(result.flatMap((item) => item.deals.map((deal) => deal.id))),
    ).toEqual(new Set(["a", "b", "c"]));
    expect(rails).toEqual(before);
  });
});
