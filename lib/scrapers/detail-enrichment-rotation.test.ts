import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { withDealerDetailRotation } from "./detail-enrichment-rotation";

const source = "https://dealer.test";
const rows = Array.from({ length: 48 }, (_, i) => ({
  source_url: `${source}/cars/${String(i).padStart(3, "0")}`,
}));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "dealer-rotation-test-"));
  vi.stubEnv("LOCAL_CACHE_PATH", directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (
    !path
      .resolve(directory)
      .startsWith(path.resolve(tmpdir(), "dealer-rotation-test-"))
  )
    throw new Error("Unexpected test cache path");
  await rm(directory, { recursive: true, force: true });
});

describe("persistent bounded dealer-detail rotation", () => {
  it.each([12, 24, 48])(
    "reaches all 48 cars with 12 requests per run at a %ih cadence",
    async (hours) => {
      const clock = vi.spyOn(Date, "now");
      const reached = new Set<string>();
      for (let run = 0; run < 4; run++) {
        clock.mockReturnValue(run * hours * 3_600_000);
        await withDealerDetailRotation(
          source,
          rows,
          async (ordered, attempted) => {
            const batch = ordered.slice(0, 12);
            expect(batch).toHaveLength(12);
            for (const row of batch) {
              attempted(row);
              reached.add(row.source_url);
            }
          },
        );
      }
      expect(reached.size).toBe(48);
    },
  );
  it("resumes only after actual attempts when a full pass hits its deadline", async () => {
    await withDealerDetailRotation(source, rows, async (ordered, attempted) => {
      ordered.slice(0, 3).forEach(attempted);
    });
    await withDealerDetailRotation(source, rows, async (ordered) => {
      expect(ordered[0]).toEqual(rows[3]);
      // No attempt: cancellation or deadline before fetching must not advance this slot.
    });
    await withDealerDetailRotation(source, rows, async (ordered) =>
      expect(ordered[0]).toEqual(rows[3]),
    );
  });
  it("persists attempted progress on cancellation and resumes after a worker-module restart", async () => {
    await expect(
      withDealerDetailRotation(source, rows, async (ordered, attempted) => {
        attempted(ordered[0]);
        throw new DOMException("Cancelled", "AbortError");
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    vi.resetModules();
    const restarted = (await import("./detail-enrichment-rotation"))
      .withDealerDetailRotation;
    await restarted(source, rows, async (ordered) =>
      expect(ordered[0]).toEqual(rows[1]),
    );
  });
  it("serializes same-worker overlapping jobs before selecting their next detail", async () => {
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let secondStarted = false;
    const first = withDealerDetailRotation(
      source,
      rows,
      async (ordered, attempted) => {
        started();
        await blocked;
        attempted(ordered[0]);
      },
    );
    await entered;
    const second = withDealerDetailRotation(source, rows, async (ordered) => {
      secondStarted = true;
      expect(ordered[0]).toEqual(rows[1]);
    });
    expect(secondStarted).toBe(false);
    release();
    await Promise.all([first, second]);
    expect(secondStarted).toBe(true);
  });
  it("keeps identity progress when source order changes or the last vehicle disappears", async () => {
    await withDealerDetailRotation(source, rows, async (ordered, attempted) =>
      attempted(ordered[1]),
    );
    await withDealerDetailRotation(
      source,
      [rows[3], rows[0], rows[2]],
      async (ordered) => expect(ordered[0]).toEqual(rows[2]),
    );
  });
});
