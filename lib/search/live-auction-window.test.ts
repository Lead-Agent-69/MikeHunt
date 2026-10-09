import { describe, expect, it, vi } from "vitest";
import {
  applyLiveAuctionWindow,
  isWithinAuctionWindow,
} from "./live-auction-window";

const now = Date.parse("2026-10-09T17:00:00Z");
describe("live auction window", () => {
  it("excludes ended lots including the exact closing instant", () => {
    expect(
      isWithinAuctionWindow({ auction_end_at: "2026-10-09T16:59:59Z" }, now),
    ).toBe(false);
    expect(
      isWithinAuctionWindow({ auction_end_at: "2026-10-09T17:00:00Z" }, now),
    ).toBe(false);
    expect(
      isWithinAuctionWindow({ auction_end_at: "2026-10-09T17:00:01Z" }, now),
    ).toBe(true);
  });
  it("does not invent an expiry for missing or malformed dates", () => {
    for (const value of [undefined, null, "", "unknown"])
      expect(isWithinAuctionWindow({ auction_end_at: value }, now)).toBe(true);
  });
  it("filters before database counts and pagination", () => {
    const query = { or: vi.fn() };
    query.or.mockReturnValue(query);
    expect(applyLiveAuctionWindow(query, now)).toBe(query);
    expect(query.or).toHaveBeenCalledWith(
      "auction_end_at.is.null,auction_end_at.gt.2026-10-09T17:00:00.000Z",
    );
  });
});
