import { describe, expect, it } from "vitest";
import { OPEN_GOV_FEED_SPECS, TOP_OPEN_GOV_FEEDS } from "./feeds";
import {
  expandYear,
  mapMemphisSurplusRow,
  mapNorfolkTowing,
  mapSeattleFleetSold,
  mapSeattleFleetSurplus,
  normalizeMake,
  parseBostonLots,
  parseVinListText,
  parseWvDirectSales,
} from "./parse";

const NOW = new Date("2026-10-10T12:00:00Z");

describe("open-gov feed registry", () => {
  it("has unique ids and covers the 10 ranked feeds", () => {
    const ids = OPEN_GOV_FEED_SPECS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(TOP_OPEN_GOV_FEEDS.map((f) => f.rank))).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    );
  });

  it("keeps gated storefronts link-only and never names a gated venue as the link", () => {
    for (const f of OPEN_GOV_FEED_SPECS) {
      if (f.format === "storefront") expect(f.ingest).toBe("link-only");
      expect(f.officialPage).not.toMatch(
        /govdeals|copart|publicsurplus|hibid|bidadoo/i,
      );
    }
    const sc = OPEN_GOV_FEED_SPECS.find((f) => f.state === "SC")!;
    const vt = OPEN_GOV_FEED_SPECS.find((f) => f.state === "VT")!;
    expect(sc.role).toBe("deep_link");
    expect(vt.role).toBe("deep_link");
  });

  it("Baltimore links to the city page only", () => {
    const b = OPEN_GOV_FEED_SPECS.find(
      (f) => f.id === "gov-baltimore-impound",
    )!;
    expect(b.officialPage).toContain("baltimorecity.gov");
    expect(b.url).toContain("baltimorecity.gov");
  });
});

describe("helpers", () => {
  it("expands two-digit years around the current year", () => {
    expect(expandYear("02", NOW)).toBe(2002);
    expect(expandYear("88", NOW)).toBe(1988);
    expect(expandYear("27", NOW)).toBe(2027);
    expect(expandYear("2016", NOW)).toBe(2016);
    expect(expandYear("UNK", NOW)).toBeNull();
  });
  it("maps fleet make abbreviations", () => {
    expect(normalizeMake("TOYT")).toBe("TOYOTA");
    expect(normalizeMake("merz")).toBe("MERCEDES-BENZ");
    expect(normalizeMake("Tesla")).toBe("TESLA");
  });
});

describe("Seattle SODA", () => {
  const current = [
    {
      equip_id: "1",
      year: "2017",
      make: "DYNP",
      model: "F1000T",
      system_group: "CONSTRUCTION",
      vin: "10002134PGC005646",
      retirement_date: "2026-04-08T00:00:01.000",
    },
    {
      equip_id: "2",
      year: "2015",
      make: "FORD",
      model: "F150",
      system_group: "PICKUP",
      equipment_type: "TRUCK - LIGHT",
      vin: "1FTEX1EP5FKD00001",
      retirement_date: "2026-05-01T00:00:01.000",
    },
    {
      equip_id: "3",
      year: "2014",
      make: "HARL",
      model: "FLHTP",
      system_group: "SCOOTER-MOTORCYCLE",
      vin: "1HD1FHM10EB600001",
    },
  ];
  it("keeps cars and trucks only, no price", () => {
    const rows = mapSeattleFleetSurplus(current);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      make: "FORD",
      year: 2015,
      amount: null,
      amountKind: null,
      date: "2026-05-01",
    });
  });
  it("sold rows become sale_price comps", () => {
    const rows = mapSeattleFleetSold([
      {
        equip_id: "32086",
        year: "2013",
        make: "FREI",
        model: "MT45",
        system_group: "VAN",
        sale_price: "6450",
        sale_date: "2025-10-16T00:00:01.000",
        vin: "4UZAAPDU2DCFJ8847",
      },
      {
        equip_id: "9",
        year: "2010",
        make: "FORD",
        model: "X",
        system_group: "VAN",
        sale_price: "0",
        vin: "1FTEX1EP5FKD00002",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      make: "FREIGHTLINER",
      amount: 6450,
      amountKind: "sale_price",
      date: "2025-10-16",
    });
  });
});

describe("Norfolk towing", () => {
  it("splits lot leads from sold comps and drops released rows", () => {
    const { leads, soldComps } = mapNorfolkTowing([
      {
        trip_ticket_number: "161134",
        vin_number: "3FAHP06Z57R266313",
        vehicle_type: "Unknown-Conversion",
        vehicle_make: "FORD",
        vehicle_model: "FUSION",
        vehicle_year: "2007",
        storage_lot: "1188A Lance Road",
        release_status: "Impounded",
        sold_for: "0",
        gate_arrived_date: "2026-10-08T17:59:57.000",
      },
      {
        trip_ticket_number: "2",
        vin_number: "1HGCM82633A004352",
        vehicle_type: "Auto",
        vehicle_make: "HONDA",
        vehicle_model: "ACCORD",
        vehicle_year: "2003",
        release_status: "Sold",
        sold_for: "1250.0",
        auction_date: "2026-10-08T00:00:00.000",
      },
      {
        trip_ticket_number: "3",
        vin_number: "JH2SC590XGK800472",
        vehicle_type: "Motorcycle",
        vehicle_make: "HONDA",
        vehicle_model: "CBR",
        vehicle_year: "2016",
        release_status: "Impounded",
        sold_for: "0",
      },
      {
        trip_ticket_number: "4",
        vin_number: "5XXGT4L32LG414922",
        vehicle_type: "Auto",
        vehicle_make: "KIA",
        vehicle_model: "OPTIMA",
        vehicle_year: "2020",
        release_status: "Released",
        sold_for: "0",
      },
    ]);
    expect(leads.map((l) => l.ref)).toEqual(["161134"]);
    expect(leads[0].location).toContain("1188A Lance Road");
    expect(soldComps).toHaveLength(1);
    expect(soldComps[0]).toMatchObject({
      amount: 1250,
      amountKind: "sale_price",
      date: "2026-10-08",
    });
  });
});

describe("West Virginia direct sales HTML", () => {
  const html = `<div class="d-block d-lg-none d-xl-none"><div class="row"><div class="col-12"><b>Tag #: </b>2026153</div><div class="col-12"><b>Year: </b>2016</div><div class="col-12"><b>Make and Model: </b>CHEVROLET TRAVERSE  WHITE</div><div class="col-12"><b>VIN: </b>1GNKVFED5GJ187783</div><div class="col-12"><b>Mileage: </b>104,396</div><div class="col-12"><b>Price: </b>4,200.00</div></div></div>
  <div class="d-block"><div class="col-12"><b>Tag #: </b>2026176</div><div class="col-12"><b>Year: </b>2018</div><div class="col-12"><b>Make and Model: </b>TOYOTA RAV-4  WHITE</div><div class="col-12"><b>VIN: </b>JTMRJREV3JD183031</div><div class="col-12"><b>Mileage: </b>74,578</div><div class="col-12"><b>Price: </b>16,500.00</div></div>
  <div><b>Tag #: </b>2026176</div><div><b>VIN: </b>JTMRJREV3JD183031</div>`;
  it("reads fixed-price rows once each", () => {
    const rows = parseWvDirectSales(html);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      vin: "1GNKVFED5GJ187783",
      year: 2016,
      make: "CHEVROLET",
      mileage: 104396,
      amount: 4200,
      amountKind: "fixed_price",
      ref: "2026153",
    });
    expect(rows[1].amount).toBe(16500);
  });
});

describe("text-PDF VIN lists", () => {
  it("Baltimore: drops motorcycles, no price, links to the city page", () => {
    const text = [
      "  1   P360453 02      DODGE        SUV        1B4HS48N52F193053           N1",
      "  2   P379046 88      MERCEDES     TRK        1MBZB82A0JN767594",
      "  3   P386747 12      KAWASAKI     MC         JKBZXNE14CA000492           BIKE",
    ].join("\n");
    const rows = parseVinListText(text, {
      feedId: "gov-baltimore-impound",
      link: "https://www.baltimorecity.gov/transportation/our-work/towing/auction-listings",
      location: "Baltimore, MD",
      date: "2026-10-14",
      now: NOW,
    });
    expect(rows.map((r) => r.vin)).toEqual([
      "1B4HS48N52F193053",
      "1MBZB82A0JN767594",
    ]);
    expect(rows[0]).toMatchObject({
      year: 2002,
      make: "DODGE",
      amount: null,
      amountKind: null,
      date: "2026-10-14",
    });
    expect(rows[1]).toMatchObject({ year: 1988, make: "MERCEDES-BENZ" });
  });
  it("Montgomery County MD: abbreviations + two-digit years", () => {
    const rows = parseVinListText(
      "24-2780       20      KIA    4DR    5XXGT4L32LG414922\n26-0709       10      TOYT   SUV    JTMRK4DV7A5088130",
      {
        feedId: "gov-montgomery-md-police-auction",
        link: "x",
        location: "Gaithersburg, MD",
        now: NOW,
      },
    );
    expect(rows.map((r) => [r.year, r.make])).toEqual([
      [2020, "KIA"],
      [2010, "TOYOTA"],
    ]);
  });
  it("Honolulu: keeps the total owed labeled, never as a price", () => {
    const rows = parseVinListText(
      "  AV      ACUR     DR875    5J8TB18278A012043   GRAY     08   MPVH          132.50       $175.00     860.00     $1,167.50    96-1268 WAIHONA ST",
      {
        feedId: "gov-honolulu-abandoned-auction",
        link: "x",
        location: "Honolulu, HI",
        amountKind: "total_owed",
        now: NOW,
      },
    );
    expect(rows[0]).toMatchObject({
      make: "ACURA",
      year: 2008,
      amount: 1167.5,
      amountKind: "total_owed",
    });
  });
  it("Delaware: no make column, mileage read, make left for VIN decode", () => {
    const rows = parseVinListText(
      "   2015    CITY EXPRESS                   7250            46,328       3N63M0ZN8FK727403",
      {
        feedId: "gov-delaware-fleet-bulletin",
        link: "x",
        location: "Delaware",
        hasMake: false,
        now: NOW,
      },
    );
    expect(rows[0]).toMatchObject({
      year: 2015,
      make: null,
      model: "CITY EXPRESS",
      mileage: 46328,
      amount: null,
    });
  });
});

describe("Boston lots", () => {
  it("reads both columns, skips dump trucks, keeps unknown years null", () => {
    const text =
      "  auctioned on Saturday,      E1     ISUZ      WH          98      E31      HOND    WH       10\n  October 24th,      E2     DUMP      BK          UNK     E32      SUBA    BL       08\n E1     ISUZ      WH          98";
    const rows = parseBostonLots(text, { date: "2026-10-24", now: NOW });
    expect(rows.map((r) => r.ref)).toEqual(["E1", "E31", "E32"]);
    expect(rows[0]).toMatchObject({ make: "ISUZU", year: 1998, vin: null });
  });
});

describe("Memphis surplus XLSX row", () => {
  it("maps a vehicle row and rejects non-vehicles", () => {
    expect(
      mapMemphisSurplusRow({
        "Unit #": "12345",
        Year: "2014",
        Make: "FORD",
        Model: "F-150",
        Body: "PICKUP",
        VIN: "1FTFW1EF5EKE00001",
      }),
    ).toMatchObject({ make: "FORD", year: 2014, ref: "12345" });
    expect(
      mapMemphisSurplusRow({
        Year: "2010",
        Make: "TRLR",
        Model: "UTILITY",
        VIN: "1UYVS25300U000001",
      }),
    ).toBeNull();
    expect(
      mapMemphisSurplusRow({ Year: "2010", Make: "FORD", VIN: "short" }),
    ).toBeNull();
  });
});
