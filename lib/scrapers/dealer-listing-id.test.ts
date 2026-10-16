import { expect, it, vi } from "vitest";
import {
  dealerListingId,
  preserveExistingDealerListingIds,
} from "./dealer-listing-id";

const url = "https://dealer.example/cars/123";
function client(data: any[] = [], error: unknown = null) {
  const q: any = {};
  for (const name of ["select", "eq", "in", "limit", "abortSignal"])
    q[name] = vi.fn().mockReturnValue(q);
  q.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return { sb: { from: vi.fn(() => q) } as any, q };
}
const row = (sourceUrl = url) => ({
  source: "independent_dealer",
  source_url: sourceUrl,
  source_deal_id: dealerListingId(sourceUrl),
});

it("namespaces every URL component that identifies a listing, not just the tail or stock number", () => {
  const ids = [
    url,
    "https://other.example/cars/123",
    "https://dealer.example/trucks/123",
    "https://dealer.example/vehicles.php?id=123",
    "https://dealer.example/vehicles.php?id=456",
  ].map(dealerListingId);
  expect(new Set(ids).size).toBe(5);
  expect(ids.every((id) => /^dealer-url:[a-f0-9]{64}$/.test(id))).toBe(true);
});
it("ignores marketing-only URL variation but retains stock identifiers", () => {
  expect(dealerListingId(`${url}?utm_source=search&gclid=x#photos`)).toBe(
    dealerListingId(url),
  );
  expect(dealerListingId("http://www.dealer.example/cars/123/")).toBe(
    dealerListingId(url),
  );
  expect(dealerListingId(`${url}?id=1&trim=XL`)).toBe(
    dealerListingId(`${url}?trim=XL&id=1`),
  );
  for (const bad of [
    "not-a-url",
    "file:///cars/123",
    "https://u:p@dealer.example/cars/123",
  ])
    expect(() => dealerListingId(bad)).toThrow();
});
it("reuses a unique exact-URL legacy identity without database updates or changing unrelated listings", async () => {
  const c = client([{ source_url: url, source_deal_id: "123" }]);
  const rows = [row(), row("https://other.example/cars/123")];
  await preserveExistingDealerListingIds(c.sb, rows);
  expect(rows[0].source_deal_id).toBe("123");
  expect(rows[1].source_deal_id).toBe(dealerListingId(rows[1].source_url));
  expect(c.q.eq).toHaveBeenCalledWith("source", "independent_dealer");
  expect(c.q.in).toHaveBeenCalledWith("source_url", [url, rows[1].source_url]);
});
it("retains verified correction provenance on a later import without retaining stale price evidence", async () => {
  const sourceUrl = "https://www.drivenation.com/vehiclesDetail.php?1539";
  const correction = {
    version: "drivenation-price-odometer-v1",
    sourceUrl,
    checkedAt: "2026-10-15T22:00:00Z",
  };
  const c = client([
    {
      source_url: sourceUrl,
      source_deal_id: "old-1539",
      options: {
        sourceCorrection: correction,
        priceEvidence: { kind: "asking", askingPrice: 19520 },
      },
    },
  ]);
  const rows = [
    {
      ...row(sourceUrl),
      options: { sellerType: "dealer" } as Record<string, any>,
    },
  ];
  await preserveExistingDealerListingIds(c.sb, rows);
  expect(rows[0].source_deal_id).toBe("old-1539");
  expect(rows[0].options).toEqual({
    sellerType: "dealer",
    sourceCorrection: correction,
  });
  expect(rows[0].options).not.toHaveProperty("priceEvidence");
});
it("prefers its canonical identity and never guesses between duplicate legacy records", async () => {
  const original = row();
  const c = client([
    { source_url: url, source_deal_id: "123" },
    { source_url: url, source_deal_id: "456" },
  ]);
  const rows = [row()];
  await preserveExistingDealerListingIds(c.sb, rows);
  expect(rows[0]).toEqual(original);
  const canonical = client([
    { source_url: url, source_deal_id: "123" },
    { source_url: url, source_deal_id: original.source_deal_id },
  ]);
  await preserveExistingDealerListingIds(canonical.sb, rows);
  expect(rows[0]).toEqual(original);
});
it("preserves correction provenance for the actual DriveNation CMS identity without remapping it", async () => {
  const sourceUrl = "https://www.drivenation.com/vehiclesDetail.php?1539";
  const correction = {
    version: "drivenation-price-odometer-v1",
    sourceUrl,
    checkedAt: "2026-10-15T22:00:00Z",
  };
  const current = {
    ...row(sourceUrl),
    source_deal_id: "4cdg-drivenation-com-1539",
    options: {} as Record<string, any>,
  };
  const c = client([
    {
      source_url: sourceUrl,
      source_deal_id: current.source_deal_id,
      options: { sourceCorrection: correction },
    },
  ]);
  await preserveExistingDealerListingIds(c.sb, [current]);
  expect(current.source_deal_id).toBe("4cdg-drivenation-com-1539");
  expect(current.options.sourceCorrection).toEqual(correction);
  const different = {
    ...current,
    source_deal_id: "4cdg-drivenation-com-9999",
    options: {} as Record<string, any>,
  };
  await preserveExistingDealerListingIds(c.sb, [different]);
  expect(different.source_deal_id).toBe("4cdg-drivenation-com-9999");
  expect(different.options.sourceCorrection).toBeUndefined();
});
it("fails closed on lookup errors or truncated evidence and does not query unrelated adapters", async () => {
  const failed = client([], { message: "offline" });
  await expect(
    preserveExistingDealerListingIds(failed.sb, [row()]),
  ).rejects.toThrow("could not be verified");
  const truncated = client(
    Array.from({ length: 1000 }, () => ({
      source_url: url,
      source_deal_id: "123",
    })),
  );
  await expect(
    preserveExistingDealerListingIds(truncated.sb, [row()]),
  ).rejects.toThrow("completely");
  await preserveExistingDealerListingIds(failed.sb, [
    { ...row(), source: "cars_com" },
    { ...row(), source_deal_id: "cms-site-123" },
  ]);
  expect(failed.sb.from).toHaveBeenCalledTimes(1);
});
