import { beforeEach, expect, it, vi } from "vitest";
const inspect = vi.hoisted(() => vi.fn());
vi.mock("../images/photo-health", () => ({ inspectListingPhotos: inspect }));
import { maintainListingPhotos } from "./photo-maintenance";

const row = {
  id: "car",
  source: "dealer",
  source_deal_id: "lot",
  images: ["https://images.craigslist.org/a.jpg"],
  options: {
    priceEvidence: { kind: "unknown" },
    photoAudit: { state: "unavailable", originalImages: ["old"] },
  },
  updated_at: "2026-10-14T00:00:00Z",
};
function client(
  options: { conflict?: boolean; error?: boolean; readError?: boolean } = {},
) {
  const calls: unknown[][] = [],
    patches: any[] = [];
  return {
    calls,
    patches,
    sb: {
      from: () => {
        const q: any = {};
        let writing = false;
        for (const method of [
          "select",
          "eq",
          "gte",
          "lte",
          "or",
          "not",
          "neq",
          "is",
          "order",
          "limit",
          "abortSignal",
        ])
          q[method] = (...args: unknown[]) => {
            calls.push([method, ...args]);
            return q;
          };
        q.update = (patch: unknown) => {
          writing = true;
          patches.push(patch);
          return q;
        };
        q.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            writing
              ? {
                  data: options.conflict ? [] : [{ id: row.id }],
                  error: options.error ? {} : null,
                }
              : { data: [row], error: options.readError ? {} : null },
          ).then(resolve);
        return q;
      },
    } as any,
  };
}
function options() {
  return {
    state: "MO",
    limit: 5,
    signal: new AbortController().signal,
    beforeWrite: vi.fn().mockResolvedValue(true),
    onWrite: vi.fn().mockResolvedValue(undefined),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  inspect.mockResolvedValue({
    state: "available",
    checkedAt: "now",
    verifiedUrl: "photo",
    checks: [],
    placeholderUrls: [],
    images: ["photo"],
  });
});

it("scopes and bounds checks, preserves unrelated evidence, and charges only confirmed writes", async () => {
  const c = client(),
    opts = options();
  expect(await maintainListingPhotos(c.sb, opts)).toMatchObject({
    checked: 1,
    available: 1,
    written: 1,
  });
  expect(c.calls).toContainEqual(["eq", "location_state", "MO"]);
  expect(c.calls).toContainEqual(["limit", 5]);
  expect(c.calls).toContainEqual(["lte", "last_seen_at", expect.any(String)]);
  expect(c.calls).toContainEqual([
    "or",
    expect.stringContaining("photoCheckAttempt->>checkedAt.lt."),
  ]);
  expect(c.calls).toContainEqual([
    "order",
    "options->photoCheckAttempt->>checkedAt",
    { ascending: true, nullsFirst: true },
  ]);
  expect(c.calls).toContainEqual(["eq", "updated_at", row.updated_at]);
  expect(c.patches[0]).toEqual({
    updated_at: expect.any(String),
    images: ["photo"],
    options: {
      ...row.options,
      photoCheckAttempt: { state: "available", checkedAt: "now" },
      photoAudit: {
        state: "available",
        checkedAt: "now",
        verifiedUrl: "photo",
        checks: [],
        placeholderUrls: [],
        originalImages: ["old"],
      },
    },
  });
  expect(opts.onWrite).toHaveBeenCalledWith(row);
});
it("records unknown attempts without removing existing quarantine or changing photo URLs", async () => {
  inspect.mockResolvedValue({ state: "unknown", checkedAt: "now" });
  const c = client();
  expect(await maintainListingPhotos(c.sb, options())).toMatchObject({
    unknown: 1,
    written: 1,
    unavailable: 0,
  });
  expect(c.patches[0]).toEqual({
    updated_at: expect.any(String),
    options: {
      ...row.options,
      photoCheckAttempt: { state: "unknown", checkedAt: "now" },
    },
  });
});
it("keeps a placeholder artifact and charges the existing budget only after its metadata write succeeds", async () => {
  inspect.mockResolvedValue({
    state: "placeholder",
    checkedAt: "now",
    verifiedUrl: null,
    checks: [{ state: "placeholder", url: row.images[0] }],
    placeholderUrls: row.images,
    images: row.images,
  });
  const c = client(),
    opts = options();
  expect(await maintainListingPhotos(c.sb, opts)).toMatchObject({
    placeholder: 1,
    written: 1,
    unavailable: 0,
  });
  expect(c.patches[0].images).toEqual(row.images);
  expect(c.patches[0].options.photoAudit.placeholderUrls).toEqual(row.images);
  expect(c.patches[0].options.photoAudit.originalImages).toEqual(["old"]);
  expect(opts.beforeWrite).toHaveBeenCalledOnce();
  expect(opts.onWrite).toHaveBeenCalledWith(row);
});
it("does not count conflicts or errors as successful updates", async () => {
  for (const mode of [{ conflict: true }, { error: true }]) {
    const c = client(mode),
      opts = options();
    expect(await maintainListingPhotos(c.sb, opts)).toMatchObject({
      written: 0,
    });
    expect(opts.onWrite).not.toHaveBeenCalled();
  }
});
it("honors pause and cancellation before any write", async () => {
  const c = client(),
    opts = options();
  opts.beforeWrite.mockResolvedValue(false);
  await maintainListingPhotos(c.sb, opts);
  expect(c.patches).toHaveLength(0);
  const controller = new AbortController();
  inspect.mockImplementationOnce(async () => {
    controller.abort();
    return { state: "unknown", checkedAt: "now" };
  });
  const cancelled = options();
  cancelled.signal = controller.signal;
  expect(await maintainListingPhotos(c.sb, cancelled)).toMatchObject({
    failed: 1,
    written: 0,
  });
  expect(c.patches).toHaveLength(0);
});
it("fails closed on invalid scopes and failed candidate reads", async () => {
  const c = client({ readError: true });
  await expect(maintainListingPhotos(c.sb, options())).rejects.toThrow(
    "could not be read",
  );
  for (const scope of [{ state: "all" }, { limit: NaN }, { limit: 11 }])
    await expect(
      maintainListingPhotos(c.sb, { ...options(), ...scope }),
    ).rejects.toThrow("Invalid");
  expect(inspect).not.toHaveBeenCalled();
});
