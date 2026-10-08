import { describe, expect, it, vi } from "vitest";
import { markInventoryListed } from "./update-listings";

describe("markInventoryListed", () => {
  it("reports only confirmed saves and retains both HTTP and network failures", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
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
});
