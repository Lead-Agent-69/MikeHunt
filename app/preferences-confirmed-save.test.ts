import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  data: { prefs: { carsState: "MO" }, authed: true },
  mutate: vi.fn(),
}));
vi.mock("swr", () => ({ default: () => ({ ...state, isLoading: false }) }));
import { usePreferences } from "@/hooks/usePreferences";

describe("confirmed preference persistence", () => {
  beforeEach(() => {
    state.mutate.mockReset();
  });
  it("uses server-normalized preferences rather than an optimistic draft", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        prefs: {
          carsState: "TX",
          homeLocation: { state: "TX", zip: "78701" },
        },
        authed: true,
      }),
    });
    vi.stubGlobal("fetch", fetch);
    const saved = await usePreferences().save({ carsState: "tx" });
    expect(saved.carsState).toBe("TX");
    expect(state.mutate).toHaveBeenCalledOnce();
    expect(state.mutate).toHaveBeenCalledWith(
      { prefs: saved, authed: true },
      false,
    );
    expect(fetch.mock.calls[0][1].headers["x-require-account"]).toBe("true");
    vi.unstubAllGlobals();
  });
  it("keeps confirmed values when the write fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(usePreferences().save({ carsState: "TX" })).rejects.toThrow(
      "Preferences could not be saved",
    );
    expect(state.mutate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("rejects false success after the account session expires", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          prefs: { carsState: "TX" },
          authed: false,
          local: true,
        }),
      }),
    );
    await expect(usePreferences().save({ carsState: "TX" })).rejects.toThrow(
      "Sign in again",
    );
    expect(state.mutate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
