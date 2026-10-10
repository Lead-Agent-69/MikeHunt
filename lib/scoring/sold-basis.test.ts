import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  SOLD_BASIS,
  isMissingBasisColumn,
  isSoldBasisRow,
  withSoldBasis,
} from "./sold-basis";

describe("sold_listings basis filter", () => {
  it("recognises only the missing-basis-column error", () => {
    expect(
      isMissingBasisColumn({
        code: "42703",
        message: "column sold_listings.basis does not exist",
      }),
    ).toBe(true);
    expect(
      isMissingBasisColumn({
        code: "PGRST204",
        message: "Could not find the 'basis' column of 'sold_listings'",
      }),
    ).toBe(true);
    expect(
      isMissingBasisColumn({
        code: "42703",
        message: "column foo does not exist",
      }),
    ).toBe(false);
    expect(isMissingBasisColumn({ code: "57014", message: "timeout" })).toBe(
      false,
    );
    expect(isMissingBasisColumn(null)).toBe(false);
  });

  it("filters basis = 'sold' and retries once without it before the migration", async () => {
    const run = vi.fn(async (filterBasis: boolean) =>
      filterBasis
        ? {
            data: null,
            error: {
              code: "42703",
              message: "column sold_listings.basis does not exist",
            },
          }
        : { data: [{ id: 1 }], error: null },
    );
    const r = await withSoldBasis(run);
    expect(run.mock.calls.map((c) => c[0])).toEqual([true, false]);
    expect(r.data).toEqual([{ id: 1 }]);
  });

  it("does not retry other errors or a successful filtered read", async () => {
    const ok = vi.fn(async () => ({ data: [], error: null }));
    await withSoldBasis(ok);
    expect(ok).toHaveBeenCalledTimes(1);
    const bad = vi.fn(async () => ({
      data: null,
      error: { code: "57014", message: "timeout" },
    }));
    const r = await withSoldBasis(bad);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(r.error?.code).toBe("57014");
  });

  it("treats a missing basis as sold and 'removed' as not a sale", () => {
    expect(isSoldBasisRow({})).toBe(true);
    expect(isSoldBasisRow({ basis: SOLD_BASIS })).toBe(true);
    expect(isSoldBasisRow({ basis: "removed" })).toBe(false);
  });

  it("every sold_listings reader filters basis = 'sold'", () => {
    const files = execSync(
      "git grep -l 'from(\"sold_listings\")' -- 'app/**/*.ts' 'lib/**/*.ts' ':!*.test.ts'",
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
    // Writers, not readers.
    const writers = new Set([
      "app/api/ingest/route.ts",
      "lib/scrapers/sources/ebay-sold.ts",
      "lib/sources/open-gov/sold-comps.ts",
    ]);
    const readers = files.filter((f) => !writers.has(f));
    expect(readers.length).toBeGreaterThan(0);
    for (const file of readers) {
      const src = readFileSync(file, "utf8");
      // Retail readers go through lib/scoring/sold-scope (basis + sale_channel); see sold-scope.test.ts.
      expect(src, file).toMatch(
        /\.eq\("basis", SOLD_BASIS\)|applyRetailSoldScope\(|\.in\("basis", \["sold", "last_bid"\]\)/,
      );
    }
    // The writers only insert/upsert there.
    for (const file of Array.from(writers)) {
      const src = readFileSync(file, "utf8");
      const chunks = src.split('.from("sold_listings")').slice(1);
      for (const chunk of chunks)
        expect(chunk.trimStart().slice(0, 12), file).toMatch(
          /^\.(insert|upsert)\(/,
        );
    }
  });
});
