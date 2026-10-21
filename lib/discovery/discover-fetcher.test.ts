import { describe, expect, it, vi } from "vitest";
import { HttpRequestError } from "@/lib/swr-config";
import { fetchDiscoverFeed } from "./discover-fetcher";

describe("Discover transient-load recovery", () => {
  it("retries one recoverable cold failure without leaving the loading request", async () => {
    const request = vi
      .fn<(url: string) => Promise<{ rails: unknown[] }>>()
      .mockRejectedValueOnce(new HttpRequestError(503))
      .mockResolvedValueOnce({ rails: [] });
    const wait = vi.fn(async () => undefined);

    await expect(
      fetchDiscoverFeed("/api/discover", { request, wait, delayMs: 25 }),
    ).resolves.toEqual({ rails: [] });
    expect(request).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(25);
  });

  it.each([400, 401, 403, 404, 422, 429])(
    "does not duplicate a hard or rate-limited %s request",
    async (status) => {
      const error = new HttpRequestError(status);
      const request = vi.fn(async () => {
        throw error;
      });
      await expect(
        fetchDiscoverFeed("/api/discover", {
          request,
          wait: async () => undefined,
        }),
      ).rejects.toBe(error);
      expect(request).toHaveBeenCalledOnce();
    },
  );
});
