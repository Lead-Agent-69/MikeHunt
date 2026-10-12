import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
const worker = readFileSync("public/sw.js", "utf8");
const code = worker.slice(
  worker.indexOf("self.addEventListener('push',"),
  worker.indexOf("// Notification tap:"),
);

async function deliver(
  viewer: unknown,
  rejects = false,
  recipientUserId: string | null = "buyer-1",
) {
  let handler: (event: unknown) => void = () => {};
  const show = vi.fn().mockResolvedValue(undefined);
  const fetcher = vi.fn(async () => {
    if (rejects) throw new Error("offline");
    return new Response(JSON.stringify(viewer));
  });
  new Function(
    "self",
    "fetch",
    "AbortController",
    "setTimeout",
    "clearTimeout",
    "safeAppPath",
    code,
  )(
    {
      addEventListener: (_event: string, callback: typeof handler) => {
        handler = callback;
      },
      registration: { showNotification: show },
    },
    fetcher,
    AbortController,
    setTimeout,
    clearTimeout,
    () => "/alerts",
  );
  let task: Promise<void> = Promise.resolve();
  handler({
    data: {
      json: () => ({
        title: "Private car",
        body: "Private price",
        recipientUserId,
      }),
    },
    waitUntil: (promise: Promise<void>) => {
      task = promise;
    },
  });
  await task;
  return { show, fetcher };
}

describe("service worker recipient privacy", () => {
  it("displays private details only for the verified recipient", async () => {
    const { show, fetcher } = await deliver({ id: "buyer-1", verified: true });
    expect(show).toHaveBeenCalledWith(
      "Private car",
      expect.objectContaining({ body: "Private price" }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/whoami",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
  });
  it.each([
    { id: "buyer-2", verified: true },
    { id: null, verified: false },
    { id: "buyer-1", verified: false },
  ])(
    "does not expose details for another or unverified account",
    async (viewer) => {
      const { show } = await deliver(viewer);
      expect(show).toHaveBeenCalledWith(
        "MikeHunt",
        expect.objectContaining({
          body: "Open MikeHunt to check your alerts.",
        }),
      );
      expect(JSON.stringify(show.mock.calls)).not.toContain("Private");
    },
  );
  it("does not expose private data when session verification fails", async () => {
    const { show } = await deliver(null, true);
    expect(JSON.stringify(show.mock.calls)).not.toContain("Private");
  });
  it("handles older payloads without exposing their contents", async () => {
    const { show, fetcher } = await deliver(
      { id: "buyer-1", verified: true },
      false,
      null,
    );
    expect(JSON.stringify(show.mock.calls)).not.toContain("Private");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
