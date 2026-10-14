import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const worker = readFileSync("public/sw.js", "utf8");
function harness(
  match: (key: unknown) => Promise<Response | undefined> = vi.fn(
    async () => undefined,
  ),
) {
  const handlers: Record<string, (event: any) => void> = {};
  const put = vi.fn(async () => {});
  const fetch = vi.fn(async () => {
    throw new Error("Offline");
  });
  runInNewContext(worker, {
    self: {
      location: { origin: "https://app.test" },
      addEventListener: (name: string, fn: any) => {
        handlers[name] = fn;
      },
    },
    caches: { match, open: vi.fn(async () => ({ put })) },
    URL,
    Response,
    fetch,
    setTimeout: (fn: () => void) => {
      fn();
      return 1;
    },
  });
  async function request(path: string, options: Record<string, string> = {}) {
    let result: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    handlers.fetch({
      request: {
        url: new URL(path, "https://app.test").href,
        method: "GET",
        mode: "cors",
        ...options,
      },
      respondWith: (response: Promise<Response>) => {
        result = response;
      },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    const response = await result;
    await Promise.all(pending);
    return response;
  }
  return { request, fetch, match, put };
}

describe("service worker valid offline responses", () => {
  it("returns 503 rather than undefined for a missing static script", async () => {
    const response = await harness().request("/_next/static/missing.js");
    expect(response?.status).toBe(503);
    expect(response?.headers.get("content-type")).toBe("text/plain");
  });
  it("recovers a precached brand icon by path", async () => {
    const icon = new Response("icon");
    const match = vi.fn(async (key: any) =>
      key === "/brand/MIKEHUNT-M.svg" ? icon : undefined,
    );
    expect(
      await harness(match).request("/brand/MIKEHUNT-M.svg", {
        destination: "image",
      }),
    ).toBe(icon);
  });
  it("uses a cached image placeholder without substituting HTML", async () => {
    const image = new Response("image", {
      headers: { "Content-Type": "image/png" },
    });
    const match = vi.fn(async (key: any) =>
      key === "/images/car-placeholder.png" ? image : undefined,
    );
    expect(
      await harness(match).request("/images/unavailable.png", {
        destination: "image",
      }),
    ).toBe(image);
  });
  it("still tries the network when cache storage fails", async () => {
    const h = harness(
      vi.fn(async () => {
        throw Error("Cache unavailable");
      }),
    );
    h.fetch.mockResolvedValueOnce(new Response("ok") as never);
    expect(await (await h.request("/_next/static/app.js"))?.text()).toBe("ok");
    expect(h.fetch).toHaveBeenCalledOnce();
  });
  it("does not let a failed background cache write reject a successful response", async () => {
    const h = harness();
    h.put.mockRejectedValueOnce(Error("Quota exceeded"));
    const response = new Response("ok");
    Object.defineProperty(response, "type", { value: "basic" });
    h.fetch.mockResolvedValueOnce(response as never);
    expect(await h.request("/_next/static/app.js")).toBe(response);
  });
  it("returns a valid offline navigation response even without the offline page", async () => {
    expect(
      (await harness().request("/saved", { mode: "navigate" }))?.status,
    ).toBe(503);
  });
  it("never serves cached private API data", async () => {
    const h = harness(vi.fn(async () => new Response("private")));
    expect((await h.request("/api/saved-cars"))?.status).toBe(503);
    expect(h.match).not.toHaveBeenCalled();
  });
  it("does not intercept an origin-prefix lookalike", async () => {
    const h = harness();
    expect(
      await h.request("https://app.test.evil/images/a.png"),
    ).toBeUndefined();
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
