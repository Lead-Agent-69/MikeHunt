import { describe, expect, it } from "vitest";
import { parseIntakeCounts } from "./intake-counts";
import {
  recordScrapePersistence,
  withScrapeRunReceipt,
} from "./source-run-context";
import { publicScopedScrapeSummary } from "./job-result";
import { ScraperExecutor } from "./tools/executor";
import { ScraperRegistry } from "./tools/registry";

const measured = {
  received: 100,
  normalized: 98,
  scopeMatched: 70,
  qualityEligible: 65,
  vehicleEligible: 60,
  fieldEligible: 55,
  photoEligible: 50,
  persisted: 7,
  renewed: 20,
  notUpserted: 43,
};

function adapter(fn: () => Promise<number>) {
  return new ScraperRegistry().register({
    id: "receipt-test",
    name: "Receipt test",
    type: "dealer",
    priority: "medium",
    frequencyMinutes: 60,
    requiresAuth: false,
    stealthRequired: false,
    enabled: true,
    estimatedDealsPerRun: 100,
    fn,
  });
}

describe("measured intake receipts", () => {
  it("keeps renewals distinct without treating all skipped writes as rejected cars", async () => {
    const result = await new ScraperExecutor().execute(
      adapter(async () => {
        recordScrapePersistence(100, 7, measured);
        return 7;
      }),
    );
    expect(result).toMatchObject({
      dealsFound: 100,
      dealsSaved: 7,
      intake: measured,
    });
    expect(result.intake?.notUpserted).toBe(43); // includes the 20 confirmed renewals
  });

  it("aggregates pages and isolates concurrent adapters", async () => {
    const [a, b] = await Promise.all([
      withScrapeRunReceipt("a", async () => {
        recordScrapePersistence(100, 7, measured);
        await Promise.resolve();
        recordScrapePersistence(100, 7, measured);
      }),
      withScrapeRunReceipt("b", async () =>
        recordScrapePersistence(100, 7, measured),
      ),
    ]);
    expect(a.receipt.intake).toMatchObject({
      received: 200,
      persisted: 14,
      renewed: 40,
    });
    expect(a.receipt.intakeCalls).toBe(2);
    expect(b.receipt.intake).toEqual(measured);
  });

  it("does not present partial stage coverage as a complete source receipt", async () => {
    const result = await new ScraperExecutor().execute(
      adapter(async () => {
        recordScrapePersistence(100, 7, measured);
        recordScrapePersistence(5, 1);
        return 8;
      }),
    );
    expect(result).toMatchObject({ dealsFound: 105, dealsSaved: 8 });
    expect(result.intake).toBeUndefined();
  });

  it("retains confirmed measurements if an adapter fails after intake", async () => {
    const result = await new ScraperExecutor().execute(
      adapter(async () => {
        recordScrapePersistence(100, 7, measured);
        throw new Error("source failed after commit");
      }),
    );
    expect(result).toMatchObject({
      success: false,
      dealsSaved: 7,
      intake: measured,
    });
  });

  it.each([
    { ...measured, received: -1 },
    { ...measured, persisted: NaN },
    { ...measured, renewed: 44 },
    { ...measured, notUpserted: 50 },
    { ...measured, scopeMatched: 99 },
    {},
    "broken-json",
  ])("rejects malformed or unreconciled measurements %j", (value) => {
    expect(parseIntakeCounts(value)).toBeUndefined();
  });

  it("round trips durable receipts while allowlisting customer fields", () => {
    const value = { ...measured, rawError: "private credentials" };
    expect(parseIntakeCounts(JSON.stringify(value))).toEqual(measured);
    const result = publicScopedScrapeSummary({
      results: [
        { source: "dealer", success: true, intake: value },
        { source: "old", success: true },
        { source: "dry", simulated: true, intake: value },
      ],
    });
    expect(result?.results[0].intake).toEqual(measured);
    expect(result?.results[1].intake).toBeUndefined();
    expect(result?.results[2].intake).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("private credentials");
  });
});
