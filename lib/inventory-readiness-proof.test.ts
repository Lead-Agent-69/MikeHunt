import { describe, expect, it } from "vitest";
import { summarizeInventoryProofRollups } from "./inventory-readiness-proof";

describe("inventory readiness proof", () => {
  it("combines exact customer-visible rollups without counting retained rows", () => {
    const proof = summarizeInventoryProofRollups([
      {
        source: "independent_dealer",
        source_host: "dealer.example",
        active_rows: "8",
        stored_active_rows: "80",
        rows_with_photos: "8",
        vin: "6",
        title: "8",
        mileage: "7",
        damage: "8",
        price: "8",
        location: "5",
        seller: "8",
        explicit_seller_contact: "3",
        auction_date: "2",
        source_link: "8",
        newest_seen: "2026-10-20T12:00:00.000Z",
      },
      {
        source: "gov_auction",
        active_rows: 5,
        stored_active_rows: 25,
        rows_with_photos: 5,
        vin: 4,
        title: 5,
        mileage: 4,
        damage: 4,
        price: 5,
        location: 5,
        seller: 5,
        explicit_seller_contact: 1,
        auction_date: 0,
        source_link: 5,
        newest_seen: "2026-10-20T14:00:00.000Z",
      },
    ]);

    expect(proof).toEqual({
      total: 13,
      storedTotal: 105,
      counts: {
        photo: 13,
        vin: 10,
        title: 13,
        damage: 12,
        mileage: 11,
        location: 10,
        price: 13,
        seller: 13,
        sellerContact: 9,
        auction: 2,
        source: 13,
      },
      newestSeen: "2026-10-20T14:00:00.000Z",
    });
  });

  it("ignores invalid and negative aggregate values", () => {
    expect(
      summarizeInventoryProofRollups([
        {
          active_rows: -2,
          rows_with_photos: "not-a-number",
          price: null,
          newest_seen: "not-a-date",
        },
      ]),
    ).toMatchObject({
      total: 0,
      storedTotal: 0,
      newestSeen: null,
      counts: { photo: 0, price: 0 },
    });
  });
});
