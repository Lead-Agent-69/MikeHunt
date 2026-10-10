import { describe, expect, it } from "vitest";
import {
  listingFreshnessLabel,
  seenTimestampOrNull,
} from "./listing-freshness";

const NOW = Date.parse("2026-10-09T23:55:00Z");
const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString();

describe("listingFreshnessLabel", () => {
  it("does not call a week-old listing that was just re-checked 'just now'", () => {
    // Shape of the MO prod rows: first seen Oct 2, last_seen bumped by this cycle's scrape.
    const label = listingFreshnessLabel(
      { firstSeenAt: "2026-10-02T03:14:56.267Z", lastSeenAt: h(0.05) },
      NOW,
    );
    expect(label).toBe("First seen 8d ago · checked just now");
    expect(label).not.toMatch(/^Seen just now/);
  });

  it("labels a genuinely new listing by its first sighting", () => {
    expect(
      listingFreshnessLabel({ firstSeenAt: h(0.2), lastSeenAt: h(0.1) }, NOW),
    ).toBe("First seen just now");
    expect(
      listingFreshnessLabel({ firstSeenAt: h(5), lastSeenAt: h(4.6) }, NOW),
    ).toBe("First seen 5h ago");
  });

  it("falls back honestly when timestamps are missing or invalid", () => {
    expect(listingFreshnessLabel({}, NOW)).toBe("Freshness unknown");
    expect(
      listingFreshnessLabel({ firstSeenAt: "nope", lastSeenAt: null }, NOW),
    ).toBe("Freshness unknown");
    expect(listingFreshnessLabel({ lastSeenAt: h(3) }, NOW)).toBe(
      "Checked 3h ago",
    );
  });
});

describe("seenTimestampOrNull", () => {
  it("never invents now() for a missing timestamp", () => {
    expect(seenTimestampOrNull(undefined)).toBeNull();
    expect(seenTimestampOrNull(null)).toBeNull();
    expect(seenTimestampOrNull("")).toBeNull();
    expect(seenTimestampOrNull("garbage")).toBeNull();
    expect(seenTimestampOrNull("2026-10-02T03:14:56.267Z")).toBe(
      "2026-10-02T03:14:56.267Z",
    );
  });
});
