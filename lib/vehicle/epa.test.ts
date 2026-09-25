import { describe, it, expect, vi } from "vitest";
import { parseFuelEconomy, getFuelEconomy } from "./epa";

describe("parseFuelEconomy", () => {
  it("maps city/highway/combined", () => {
    expect(
      parseFuelEconomy({ city08: "21", highway08: "32", comb08: "25" }),
    ).toEqual({
      city: 21,
      highway: 32,
      combined: 25,
    });
  });
  it("nulls invalid/zero values", () => {
    expect(parseFuelEconomy({ city08: "0", comb08: "x" })).toEqual({
      city: null,
      highway: null,
      combined: null,
    });
  });
});

describe("getFuelEconomy", () => {
  it("two-steps options → MPG", async () => {
    const f = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("menu/options")
          ? { menuItem: [{ text: "Auto", value: "40324" }] }
          : { city08: "21", highway08: "32", comb08: "25" },
    }));
    const fe = await getFuelEconomy("Ford", "Mustang", 2019, f as any);
    expect(fe?.combined).toBe(25);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("null when no options", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    expect(await getFuelEconomy("X", "Y", 2019, f as any)).toBeNull();
  });
});
