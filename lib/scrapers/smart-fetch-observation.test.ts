import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ politeFetch: vi.fn() }));
vi.mock("./polite", () => ({
  politeModeEnabled: () => true,
  politeFetch: mocks.politeFetch,
}));
import { smartFetch } from "./smart-fetch";
afterEach(() => {
  vi.clearAllMocks();
});

it.each(["2026-01-01T12:00:00Z", "2026-10-21T12:00:00Z", undefined])(
  "retains the actual body observation date (%s)",
  async (observedAt) => {
    mocks.politeFetch.mockResolvedValueOnce({
      ok: true,
      body: "<p>Sale price: $18,000</p>",
      observedAt,
    });
    expect(await smartFetch("https://source.example/inventory")).toMatchObject({
      blocked: false,
      observedAt,
    });
  },
);
it("does not turn blocked or failed validation responses into price observations", async () => {
  mocks.politeFetch.mockResolvedValueOnce({ ok: false, body: "Blocked" });
  expect(await smartFetch("https://source.example/inventory")).toEqual({
    html: "",
    tier: "static",
    blocked: true,
  });
  mocks.politeFetch.mockResolvedValueOnce({
    ok: true,
    body: "No listings",
    observedAt: "2026-01-01T12:00:00Z",
  });
  expect(
    await smartFetch("https://source.example/inventory", {
      validate: () => false,
    }),
  ).toMatchObject({ unverified: true, observedAt: "2026-01-01T12:00:00Z" });
});
