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
    caches: {
      match,
      open: vi.fn(async () => ({ put, match: vi.fn(async () => undefined) })),
    },
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
      key === "/brand/DEALERHUNT-D.svg" ? icon : undefined,
    );
    expect(
      await harness(match).request("/brand/DEALERHUNT-D.svg", {
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

// Model CacheStorage across two worker script versions, not just one fetch event.
function upgradeHarness() {
  const origin = "https://app.test";
  const stores = new Map<string, Map<string, Response>>();
  const history = new Map([
    ["saved-vehicle", { id: "vehicle-1", note: "Keep me" }],
  ]);
  const indexedDB = { open: vi.fn(), deleteDatabase: vi.fn() };
  const key = (request: string | { url: string }) =>
    new URL(typeof request === "string" ? request : request.url, origin).href;
  let revision = "old";
  let unavailablePath: string | undefined;
  const network = vi.fn(async (request: string | { url: string }) => {
    const url = new URL(key(request));
    if (url.pathname === unavailablePath)
      throw new Error("Precache unavailable");
    return new Response(`${revision}:${url.pathname}`);
  });
  const caches = {
    keys: vi.fn(async () => Array.from(stores.keys())),
    delete: vi.fn(async (name: string) => stores.delete(name)),
    match: vi.fn(async (request: string | { url: string }) => {
      for (const store of Array.from(stores.values())) {
        const response = store.get(key(request));
        if (response) return response.clone();
      }
      return undefined;
    }),
    open: vi.fn(async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        match: vi.fn(async (request: string | { url: string }) =>
          store.get(key(request))?.clone(),
        ),
        // Cache.addAll is atomic: failed precaching must not install the new worker.
        addAll: vi.fn(async (urls: string[]) => {
          const responses = await Promise.all(urls.map((url) => network(url)));
          urls.forEach((url, i) => store.set(key(url), responses[i]));
        }),
        put: vi.fn(
          async (request: string | { url: string }, response: Response) => {
            store.set(key(request), response);
          },
        ),
      };
    }),
  };
  function script(source: string) {
    const handlers: Record<string, (event: any) => void> = {};
    const skipWaiting = vi.fn(async () => {});
    const claim = vi.fn(async () => {});
    runInNewContext(source, {
      self: {
        location: { origin },
        addEventListener: (name: string, fn: (event: any) => void) => {
          handlers[name] = fn;
        },
        skipWaiting,
        clients: { claim },
      },
      caches,
      indexedDB,
      fetch: network,
      URL,
      Response,
      setTimeout,
    });
    async function lifecycle(name: "install" | "activate") {
      const pending: Promise<unknown>[] = [];
      handlers[name]({
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      });
      await Promise.all(pending);
    }
    async function image(path: string) {
      let result: Promise<Response> | undefined;
      const pending: Promise<unknown>[] = [];
      handlers.fetch({
        request: {
          url: new URL(path, origin).href,
          method: "GET",
          mode: "cors",
          destination: "image",
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
    return { lifecycle, image, skipWaiting, claim };
  }
  return {
    stores,
    caches,
    history,
    indexedDB,
    network,
    script,
    nextRevision: () => {
      revision = "approved";
    },
    failPrecache: (path: string) => {
      unavailablePath = path;
    },
  };
}

const oldStatic = "DealerHunt-static-v3";
const newStatic = "DealerHunt-static-v4-dh";
const dynamic = "DealerHunt-dynamic-v1";
const oldWorker = worker.replace(
  /const STATIC_CACHE = '[^']+'/,
  `const STATIC_CACHE = '${oldStatic}'`,
);

it("installs and activates updated branding, removes old static assets, and retains dynamic/private history", async () => {
  // An unchanged script cannot trigger the browser's update/install lifecycle.
  expect(worker).not.toBe(oldWorker);
  const h = upgradeHarness();
  const legacy = h.script(oldWorker);
  await legacy.lifecycle("install");
  const retainedOldBrand = (await legacy.image("/brand/DEALERHUNT-D.svg"))!;
  const retained = new Response("retained dynamic image");
  h.stores.set(
    dynamic,
    new Map([["https://app.test/images/retained.jpg", retained]]),
  );
  h.stores
    .get(dynamic)!
    .set("https://app.test/brand/DEALERHUNT-D.svg", retainedOldBrand);
  const privateRecord = h.history.get("saved-vehicle");
  h.nextRevision();
  const updated = h.script(worker);
  await updated.lifecycle("install");
  expect(updated.skipWaiting).toHaveBeenCalledOnce();
  expect(updated.claim).not.toHaveBeenCalled();
  expect(h.stores.has(oldStatic)).toBe(true);
  expect(h.stores.has(newStatic)).toBe(true);
  await updated.lifecycle("activate");
  expect(h.caches.delete).toHaveBeenCalledExactlyOnceWith(oldStatic);
  expect(updated.claim).toHaveBeenCalledOnce();
  expect(h.stores.has(oldStatic)).toBe(false);
  expect(
    h.stores.get(dynamic)?.get("https://app.test/images/retained.jpg"),
  ).toBe(retained);
  h.network.mockClear();
  for (const path of [
    "/brand/DEALERHUNT-D.svg",
    "/dealerhunt-icon.svg",
    "/icon-192x192.png",
    "/icon-512x512.png",
    "/apple-touch-icon.png",
  ]) {
    expect(await (await updated.image(path))?.text()).toBe(`approved:${path}`);
  }
  expect(h.network).not.toHaveBeenCalled();
  expect(
    h.stores.get(dynamic)?.get("https://app.test/brand/DEALERHUNT-D.svg"),
  ).toBe(retainedOldBrand);
  expect(await retainedOldBrand.clone().text()).toBe(
    "old:/brand/DEALERHUNT-D.svg",
  );
  expect(h.history.get("saved-vehicle")).toBe(privateRecord);
  expect(h.indexedDB.open).not.toHaveBeenCalled();
  expect(h.indexedDB.deleteDatabase).not.toHaveBeenCalled();
});

it("does not activate or evict usable old assets when the new precache fails", async () => {
  const h = upgradeHarness();
  const legacy = h.script(oldWorker);
  await legacy.lifecycle("install");
  const retained = new Response("retained dynamic image");
  h.stores.set(
    dynamic,
    new Map([["https://app.test/images/retained.jpg", retained]]),
  );
  const privateRecord = h.history.get("saved-vehicle");
  h.nextRevision();
  h.failPrecache("/brand/DEALERHUNT-D.svg");
  const updated = h.script(worker);
  await expect(updated.lifecycle("install")).rejects.toThrow(
    "Precache unavailable",
  );
  expect(updated.skipWaiting).not.toHaveBeenCalled();
  expect(updated.claim).not.toHaveBeenCalled();
  expect(h.caches.delete).not.toHaveBeenCalled();
  expect(await (await legacy.image("/brand/DEALERHUNT-D.svg"))?.text()).toBe(
    "old:/brand/DEALERHUNT-D.svg",
  );
  expect(
    h.stores.get(dynamic)?.get("https://app.test/images/retained.jpg"),
  ).toBe(retained);
  expect(h.history.get("saved-vehicle")).toBe(privateRecord);
  expect(h.indexedDB.open).not.toHaveBeenCalled();
  expect(h.indexedDB.deleteDatabase).not.toHaveBeenCalled();
});
