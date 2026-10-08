import { describe, expect, it, vi } from "vitest";
import { markInventoryListed } from "./update-listings";

describe("markInventoryListed", () => {
  it("reports only confirmed saves and retains both HTTP and network failures", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          item: { id: "one", stage: "listed", listedPlatforms: ["facebook"] },
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockRejectedValueOnce(new Error("offline"));
    expect(
      await markInventoryListed(
        ["one", "two", "three", "one"],
        ["facebook"],
        request,
      ),
    ).toEqual({ updatedIds: ["one"], failedIds: ["two", "three"] });
    expect(request).toHaveBeenCalledTimes(3);
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      id: "one",
      stage: "listed",
      listed_platforms: ["facebook"],
    });
  });
  it("rejects empty marketplaces without making a request", async () => {
    const request = vi.fn();
    await expect(markInventoryListed(["one"], [], request)).rejects.toThrow(
      "marketplace",
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("does not count HTTP success without a matching row and marketplace confirmation", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          item: { id: "wrong", stage: "listed", listedPlatforms: ["facebook"] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          item: { id: "three", stage: "listed", listedPlatforms: [] },
        }),
      });
    expect(
      await markInventoryListed(["one", "two", "three"], ["facebook"], request),
    ).toEqual({ updatedIds: [], failedIds: ["one", "two", "three"] });
  });
  it("preserves recorded marketplaces when adding a posting", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          id: "one",
          stage: "listed",
          listedPlatforms: ["craigslist", "facebook"],
        },
      }),
    });
    expect(
      await markInventoryListed(["one"], ["facebook"], request, {
        one: ["craigslist"],
      }),
    ).toEqual({ updatedIds: ["one"], failedIds: [] });
    expect(JSON.parse(request.mock.calls[0][1].body).listed_platforms).toEqual([
      "craigslist",
      "facebook",
    ]);
  });
});
