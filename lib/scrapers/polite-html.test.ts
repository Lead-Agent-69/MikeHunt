import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  robots: vi.fn(),
  policy: vi.fn(),
}));
vi.mock("@/lib/net/fetch-public-html", () => ({
  fetchPublicHtml: mocks.fetch,
}));
vi.mock("./source-compliance", () => ({
  createRobotsGate: () => mocks.robots,
  policyBlockFor: mocks.policy,
}));
import { createPoliteHtmlFetcher } from "./polite-html";

describe("polite curated HTML fetch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.robots.mockResolvedValue(true);
    mocks.fetch.mockResolvedValue({
      html: "<h1>Available cars</h1>",
      finalUrl: "https://dealer.example/inventory",
    });
  });
  it("returns public HTML with a policy validator for every redirect", async () => {
    expect(
      await createPoliteHtmlFetcher()("https://dealer.example/inventory"),
    ).toContain("Available cars");
    const validator = mocks.fetch.mock.calls[0][1];
    mocks.policy.mockReturnValue({ kind: "tos_bans_bots" });
    expect(await validator("https://blocked.example")).toBe(false);
  });
  it("does not request policy-blocked or robots-disallowed pages", async () => {
    mocks.policy.mockReturnValue({ kind: "needs_permission" });
    await expect(
      createPoliteHtmlFetcher()("https://dealer.example"),
    ).rejects.toThrow("disallows");
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.policy.mockReturnValue(undefined);
    mocks.robots.mockResolvedValue(false);
    await expect(
      createPoliteHtmlFetcher()("https://dealer.example"),
    ).rejects.toThrow("disallows");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not escalate an unavailable or challenged page", async () => {
    mocks.fetch.mockResolvedValueOnce(null);
    await expect(
      createPoliteHtmlFetcher()("https://dealer.example"),
    ).rejects.toThrow("no challenge bypass");
    mocks.fetch.mockResolvedValueOnce({
      html: "Just a moment cf-challenge",
      finalUrl: "https://dealer.example",
    });
    await expect(
      createPoliteHtmlFetcher()("https://dealer.example"),
    ).rejects.toThrow("no bypass");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
