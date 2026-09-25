import { describe, it, expect } from "vitest";
import { gsaLotToDeal, parseGsaAuctions } from "./gsa-auctions";

const LOT = {
  lotId: 395710,
  auctionId: 368209,
  lotNumber: 2,
  salesNumber: "31QSCI26441",
  status: "Active",
  endDate: "2026-06-29T15:01:00",
  minBid: 1016.0,
  currentBid: 1000.0,
  numberOfBidders: 1,
  categoryCode: "320",
  location: { zipCode: "57007", city: "Brookings", state: "SD" },
  uri: "sales/31QSCI26441/2/2492725.jpg",
  lotName: "2008 Ford F150",
};

describe("gsaLotToDeal", () => {
  it("maps a federal vehicle lot to a gov_auction deal", () => {
    const d = gsaLotToDeal(LOT)!;
    expect(d.source).toBe("gov_auction");
    expect(d.source_deal_id).toBe("gsa-395710");
    expect(d.year).toBe(2008);
    expect(d.make).toBe("Ford");
    expect(d.model).toBe("F150");
    expect(d.ask_price).toBe(1000);
    expect(d.location_state).toBe("SD");
    expect(d.bid_count).toBe(1);
    expect(d.images?.[0]).toContain("gsa-prod-ppms-attachments");
    expect(d.auction_end).toBe("2026-06-29T15:01:00");
  });

  it("falls back to minBid when there's no current bid", () => {
    const d = gsaLotToDeal({ ...LOT, currentBid: undefined })!;
    expect(d.ask_price).toBe(1016);
  });

  it("rejects non-vehicles (no usable model year)", () => {
    expect(
      gsaLotToDeal({ ...LOT, lotName: "1754 International Harvester" }),
    ).toBeNull();
    expect(
      gsaLotToDeal({ ...LOT, lotName: "Pallet of office chairs" }),
    ).toBeNull();
  });

  it("parses an auctionDTOList response", () => {
    const out = parseGsaAuctions({
      auctionDTOList: [LOT, { lotId: 9, lotName: "junk" }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].make).toBe("Ford");
  });
});
