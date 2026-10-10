import { describe, expect, it, vi } from "vitest";
import {
  GSA_ATTRIBUTION,
  fetchNorfolkSoldRows,
  gsaClosingBidRows,
  isLightVehicleComp,
  isMissingSoldColumn,
  norfolkSoldRows,
  parseCsv,
  seattleSoldRows,
  writeSoldListings,
} from "./sold-comps";

const NOW = new Date("2026-10-10T12:00:00Z");

// Real rows from data.norfolk.gov/resource/4dwc-v3t8.json (2026-10-10), trimmed to the read columns.
const NORFOLK = [
  {
    trip_ticket_number: "156025",
    vin_number: "2T1BR30E55C460523",
    vehicle_type: "Auto",
    vehicle_make: "TOYOTA",
    vehicle_model: "COROLLA",
    vehicle_year: "2005",
    storage_lot: "1188A Lance Road",
    auction_date: "2026-10-08T00:00:00.000",
    sold_for: "550",
    release_status: "Impounded",
  },
  {
    trip_ticket_number: "158933",
    vin_number: "1FTNE2EL2BDB19217",
    vehicle_type: "Van",
    vehicle_make: "FORD",
    vehicle_model: "ECONOLINE",
    vehicle_year: "2011",
    storage_lot: "1188A Lance Road",
    auction_date: "2026-10-08T00:00:00.000",
    sold_for: "1600",
    release_status: "Impounded",
  },
  // crusher row: Demolished at the $75 scrap price
  {
    trip_ticket_number: "126628",
    vin_number: "1P4GP44G6WB550711",
    vehicle_type: "Van",
    vehicle_make: "PLYMOUTH",
    vehicle_model: "VOYAGER",
    vehicle_year: "1998",
    sold_for: "75.0000",
    release_status: "Demolished",
  },
  // motorcycle
  {
    trip_ticket_number: "81160",
    vin_number: "JS1GT76A052107473",
    vehicle_type: "Motorcycle",
    vehicle_make: "SUZUKI",
    vehicle_model: "GSX-R1000",
    vehicle_year: "2005",
    auction_date: "2014-11-13T00:00:00.000",
    sold_for: "500.0000",
    release_status: "Sold At Auction",
  },
];

describe("norfolkSoldRows", () => {
  it("keeps auctioned cars/trucks as basis 'sold' impound comps, drops scrap and motorcycles", () => {
    const rows = norfolkSoldRows(NORFOLK, NOW);
    expect(rows.map((r) => r.source_item_id)).toEqual([
      "norfolk-156025",
      "norfolk-158933",
    ]);
    expect(rows[0]).toMatchObject({
      source: "gov_norfolk_impound",
      basis: "sold",
      sale_channel: "gov_impound_auction",
      sold_price: 550,
      sold_at: "2026-10-08T00:00:00.000Z",
      year: 2005,
      make: "Toyota",
      model: "COROLLA",
      vin: "2T1BR30E55C460523",
      location_state: "VA",
      mileage: null,
      currency_code: "USD",
      country_code: "US",
    });
    expect(rows[0].title).toBe(
      "2005 Toyota COROLLA (Norfolk VA city impound auction)",
    );
    expect(rows[0].attribution).toMatch(/Norfolk.*Public domain/i);
    // never stores the plate or owner fields
    expect(JSON.stringify(rows)).not.toMatch(/plate|towed_from/i);
  });

  it("does not take a future auction date as a sale", () => {
    const future = {
      ...NORFOLK[0],
      trip_ticket_number: "1",
      auction_date: "2026-12-01T00:00:00.000",
    };
    expect(norfolkSoldRows([future], NOW)).toEqual([]);
  });

  it("queries only sold rows since the given date, paged", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(NORFOLK.slice(0, 2)), { status: 200 }),
    );
    const rows = await fetchNorfolkSoldRows(
      "2026-04-13",
      fetchImpl as unknown as typeof fetch,
    );
    expect(rows).toHaveLength(2);
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get("$where")).toBe(
      "sold_for > 0 AND auction_date >= '2026-04-13T00:00:00'",
    );
    expect(url.searchParams.get("$select")).not.toMatch(/license_plate/);
    await expect(
      fetchNorfolkSoldRows("yesterday", fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow();
  });
});

describe("seattleSoldRows", () => {
  const base = {
    year: "2019",
    make: "TOYO",
    model: "RAV4H",
    sale_price: "13101",
    sale_date: "2025-10-16T00:00:01.000",
    sold_by: "BIDADOO ONLINE AUCTION",
    vin: "2T3RWRFV0KW000000",
    equipment_type: "SUV",
    system_group: "SUV",
  };
  it("maps fleet codes to retail models and labels the channel", () => {
    const [r] = seattleSoldRows([{ ...base, equip_id: "1" }], NOW);
    expect(r).toMatchObject({
      source: "gov_seattle_fleet",
      source_item_id: "seattle-1",
      basis: "sold",
      sale_channel: "gov_fleet_auction",
      make: "Toyota",
      model: "RAV4",
      sold_price: 13101,
      location_state: "WA",
    });
    expect(r.title).toMatch(/Seattle city fleet sale, bidadoo online auction/);
  });
  it("drops heavy trucks, trailers and motorcycles; fixes MERC Sprinter", () => {
    const rows = seattleSoldRows(
      [
        {
          ...base,
          equip_id: "2",
          make: "PETE",
          model: "337",
          system_group: "TRUCK",
        },
        {
          ...base,
          equip_id: "3",
          make: "FREI",
          model: "MT45",
          system_group: "VAN",
        },
        {
          ...base,
          equip_id: "4",
          make: "HARL",
          model: "FLHTP",
          system_group: "SCOOTER-MOTORCYCLE",
        },
        {
          ...base,
          equip_id: "5",
          make: "MERC",
          model: "SPRINTER",
          system_group: "VAN",
        },
      ],
      NOW,
    );
    expect(rows.map((r) => [r.source_item_id, r.make])).toEqual([
      ["seattle-5", "Mercedes-Benz"],
    ]);
  });
});

describe("gsaClosingBidRows", () => {
  const CSV = [
    "id,title,category,condition,seller_type,state,city,zip,currency,starting_bid,current_or_final_bid,bid_count,buyer_premium_pct,sold,ended_at,source_url",
    "gsa-1,2012 Chevrolet Silverado 4X4 Truck,vehicles,As-is,federal,NE,OMAHA,68102,USD,,1145,3,0,true,2026-05-06,https://www.gsaauctions.gov/auctions/preview/1",
    'gsa-2,"2019 Ford F-150 XL FX4, 4WD",vehicles,As-is,federal,NM,ALBUQUERQUE,87101,USD,,20562,9,0,true,2026-05-07,https://www.gsaauctions.gov/auctions/preview/2',
    "gsa-3,2010 Chevrolet Malibu,vehicles,As-is,federal,KS,TOPEKA,66601,USD,,,0,0,false,2026-05-06,https://www.gsaauctions.gov/auctions/preview/3",
    "gsa-4,2026 Ford Explorer and F150 Rear Seats Leather,vehicles,As-is,federal,TX,WACO,76701,USD,,25,1,0,true,2026-05-08,https://www.gsaauctions.gov/auctions/preview/4",
    "gsa-5,2003 BIG TEX FLATBED TRAILER,vehicles,As-is,federal,CO,DENVER,80201,USD,,3000,2,0,true,2026-05-06,https://www.gsaauctions.gov/auctions/preview/5",
    "gsa-6,StatSpin Express 4 Centrifuge,vehicles,As-is,federal,IL,DANVILLE,61832,USD,,57,2,0,true,2026-05-06,https://www.gsaauctions.gov/auctions/preview/6",
    "gsa-7,2015 Ford Fusion,vehicles,As-is,federal,CT,HARTFORD,06101,USD,,4000,4,0,unknown,2026-05-06,https://www.gsaauctions.gov/auctions/preview/7",
    "gsa-8,HP Laptops,electronics,As-is,federal,WI,MILWAUKEE,53295,USD,,2600,6,0,true,2026-05-06,https://www.gsaauctions.gov/auctions/preview/8",
  ].join("\r\n");

  it("reads quoted CSV fields", () => {
    const rows = parseCsv(CSV);
    expect(rows).toHaveLength(8);
    expect(rows[1].title).toBe("2019 Ford F-150 XL FX4, 4WD");
    expect(rows[0].zip).toBe("68102");
  });

  it("keeps sold=true car/truck lots as basis 'last_bid' with the CC BY credit on every row", () => {
    const rows = gsaClosingBidRows(parseCsv(CSV), NOW);
    expect(rows.map((r) => r.source_item_id)).toEqual(["gsa-1", "gsa-2"]);
    for (const r of rows) {
      expect(r.basis).toBe("last_bid");
      expect(r.basis).not.toBe("sold");
      expect(r.attribution).toBe(GSA_ATTRIBUTION);
      expect(r.attribution).toMatch(/CC BY 4\.0/);
      expect(r.sale_channel).toBe("gov_surplus_auction");
      expect(r.title).toMatch(/last observed bid at close/);
      expect(r.vin).toBeNull();
    }
    expect(rows[1]).toMatchObject({
      year: 2019,
      make: "Ford",
      model: "F-150",
      sold_price: 20562,
      location_state: "NM",
    });
  });
});

describe("isLightVehicleComp", () => {
  it("rejects medium/heavy chassis and parts lots", () => {
    expect(isLightVehicleComp("Ford", "F550")).toBe(false);
    expect(isLightVehicleComp("Freightliner", "M2")).toBe(false);
    expect(isLightVehicleComp("Ford", "Explorer", "Explorer rear seats")).toBe(
      false,
    );
    expect(isLightVehicleComp("Ford", "F-250")).toBe(true);
    expect(
      isLightVehicleComp(
        "Chevrolet",
        "Silverado",
        "2016 Chevrolet Silverado K1500",
      ),
    ).toBe(true);
  });
});

describe("writeSoldListings", () => {
  const row = norfolkSoldRows(NORFOLK, NOW)[0];
  function client(result: { data: unknown; error: unknown }) {
    const select = vi.fn(async () => result);
    const upsert = vi.fn(() => ({ select }));
    return { sb: { from: vi.fn(() => ({ upsert })) } as never, upsert };
  }

  it("upserts on (source, source_item_id) and keeps existing rows", async () => {
    const { sb, upsert } = client({
      data: [{ source_item_id: row.source_item_id }],
      error: null,
    });
    const res = await writeSoldListings(sb, [row]);
    expect(res).toEqual({ attempted: 1, written: 1, skipped: null });
    expect(upsert).toHaveBeenCalledWith([row], {
      onConflict: "source,source_item_id",
      ignoreDuplicates: true,
    });
  });

  it("refuses (does not strip columns) before migration 20261010410000", async () => {
    const { sb } = client({
      data: null,
      error: {
        code: "PGRST204",
        message: "Could not find the 'attribution' column of 'sold_listings'",
      },
    });
    const res = await writeSoldListings(sb, [row]);
    expect(res.written).toBe(0);
    expect(res.skipped).toMatch(/20261010410000/);
  });

  it("throws on any other error", async () => {
    const { sb } = client({
      data: null,
      error: { code: "23514", message: "check violation" },
    });
    await expect(writeSoldListings(sb, [row])).rejects.toThrow(
      /check violation/,
    );
  });

  it("recognises the missing-column errors only for this migration's columns", () => {
    expect(
      isMissingSoldColumn({
        code: "42703",
        message: 'column "basis" does not exist',
      }),
    ).toBe(true);
    expect(
      isMissingSoldColumn({
        code: "42703",
        message: 'column "foo" does not exist',
      }),
    ).toBe(false);
    expect(isMissingSoldColumn(null)).toBe(false);
  });
});
