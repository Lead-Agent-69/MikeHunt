import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("May's MO pass: data/perf honesty wiring", () => {
  it("/scan status strip and empty state wait for the first response", () => {
    const src = read("app/(dashboard)/scan/page.tsx");
    expect(src).toContain("scanStatusCopy(");
    expect(src).toContain("hasData={swrData !== undefined}");
    expect(src).toContain(
      "const loading = swrLoading || (swrData === undefined && !swrError);",
    );
    expect(src).not.toContain(': "never";');
  });

  it("/saved gates its error copy on auth + first fetch settling", () => {
    const src = read("app/(dashboard)/saved/page.tsx");
    expect(src).toContain("savedSyncStatus({");
    expect(src).toContain(
      "savedWatchlistHeadline(supabaseStatus, canShowLocalSaves)",
    );
  });

  it("/fleet preloads the Purchase plan checklist in parallel with preferences", () => {
    const gate = read("components/shared/FlipDeskGate.tsx");
    const pipeline = read("components/saved/PurchasePipeline.tsx");
    expect(gate).toContain(
      "preload(PURCHASE_CHECKLIST_KEY, fetchPurchaseChecklist)",
    );
    expect(pipeline).toContain("PURCHASE_CHECKLIST_KEY");
  });

  it("Today and Discover label listings vs VIN-merged vehicles", () => {
    expect(read("app/(dashboard)/today/page.tsx")).toContain(
      "todaySourceProofLabel(",
    );
    expect(read("app/(dashboard)/discover/page.tsx")).toContain(
      "discoverMatchLabel(data)",
    );
  });
});
