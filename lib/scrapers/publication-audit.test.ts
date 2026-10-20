import { describe, expect, it } from "vitest";
import { sourcePublicationAudit } from "./publication-audit";

const now = Date.parse("2026-10-20T10:00:00Z");
const row = {
  source_url: "https://www.dealer.example/car/1",
  title: "2020 Ford Escape",
  make: "Ford",
  model: "Escape",
  active: true,
  last_seen_at: new Date(now - 60_000).toISOString(),
  images: ["https://dealer.example/photo.jpg"],
};

describe("source publication proof", () => {
  it("does not turn a deferred cache observation into a published vehicle", () => {
    expect(
      sourcePublicationAudit(
        "dealer.example",
        [{ synced: false, data: row }],
        [],
        now,
      ),
    ).toMatchObject({
      deferredObservations: 1,
      recentDeferredCandidates: 1,
      storedRowsInSample: 0,
      defaultInventoryCandidates: 0,
    });
  });

  it("keeps stale, inactive, future, unavailable-photo and non-vehicle rows out of current candidates", () => {
    const excluded = [
      { ...row, active: false },
      { ...row, last_seen_at: "2026-09-01T00:00:00Z" },
      { ...row, last_seen_at: new Date(now + 1).toISOString() },
      { ...row, last_seen_at: "invalid" },
      { ...row, images: [] },
      { ...row, options: { photoAudit: { state: "unavailable" } } },
      {
        ...row,
        title: "2025 cargo trailer",
        make: "Big Tex",
        model: "Trailer",
      },
    ];
    const proof = sourcePublicationAudit(
      "dealer.example",
      excluded.map((data) => ({ synced: false, data })),
      [row, ...excluded],
      now,
    );
    expect(proof.storedRowsInSample).toBe(8);
    expect(proof.defaultInventoryCandidates).toBe(1);
    expect(proof.deferredObservations).toBe(7);
    expect(proof.recentDeferredCandidates).toBe(0);
  });

  it("matches domain boundaries and does not expose cached payloads or contacts", () => {
    const foreign = {
      ...row,
      source_url: "https://dealer.example.evil.test/car",
    };
    const data = {
      ...row,
      options: { contact: { email: "private@example.test" } },
    };
    const proof = sourcePublicationAudit(
      "dealer.example",
      [
        { synced: false, data },
        { synced: true, data },
        { synced: false, data: foreign },
        { synced: false },
      ],
      [foreign, row],
      now,
    );
    expect(proof.deferredObservations).toBe(1);
    expect(proof.storedRowsInSample).toBe(1);
    expect(JSON.stringify(proof)).not.toContain("private@example.test");
    expect(JSON.stringify(proof)).not.toContain("/car/");
  });
});
