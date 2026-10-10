import { describe, expect, it } from "vitest";
import { classifyVehicleScope, partitionVehicleScope } from "./vehicle-scope";

const gov = (title: string, make: string, model: string) => ({
  title,
  make,
  model,
  source: "gov_auction",
  source_url: "https://www.govdeals.com/asset/1",
});

describe("vehicle scope: cars and light/medium trucks only", () => {
  it.each([
    ["2016 Ford Taurus(119739)", "Ford", "Taurus"],
    ["2018 Ford F-250 SD XLT 4x4 Crew Cab Pickup-Inoperable", "Ford", "F-250"],
    ["2016 Ford F-550 4WD Crane/Service Truck", "Ford", "F-550"],
    ["2011 Ford F-750 Bucket Truck Terex Aerial TL38", "Ford", "F-750"],
    ["2015 Kenworth T270 S/A Flatbed Dump Truck", "Kenworth", "T270"],
    [
      "2008 Freightliner Sprinter 3500 Dully Van",
      "Freightliner",
      "Sprinter 3500",
    ],
    ["2018 Dodge Charger Police Pursuit - Push Bumper", "Dodge", "Charger"],
    [
      "2013 Dodge Charger - CAN Bus issue - Must be towed/trailered",
      "Dodge",
      "Charger",
    ],
    ["2019 Ford Transit Bus", "Ford", "Transit"],
    [
      "2002 INTERNATIONAL 4300 CHAMPION ROLLBACK TOW TRUCK",
      "International",
      "4300",
    ],
    ["2024 Mullen One", "Mullen", "One"],
  ])("keeps %s", (title, make, model) => {
    expect(classifyVehicleScope(gov(title, make, model))).toEqual({
      inScope: true,
    });
  });

  it.each([
    ["2020 ODB LTC6000 Leaf Collection Vacuum", "ODB", "LTC6000", "equipment"],
    [
      "2021 FREIGHTLINER BEARCAT ASPHALT DISTRIBUTOR",
      "FREIGHTLINER",
      "BEARCAT ASPHALT",
      "equipment",
    ],
    ["2023 SUPER VAC", "SUPER VAC", "VACUUM TANK TRAILER", "equipment"],
    ["2000 Mack RD6 Rolloff Truck", "Mack", "RD688S", "heavy_truck"],
    [
      "2018 Freightliner Cascadia 125",
      "Freightliner",
      "Cascadia 125",
      "heavy_truck",
    ],
    ["2015 Kenworth W900 Day Cab Tractor", "Kenworth", "W900", "heavy_truck"],
    ["2013 International 7600", "International", "7600", "heavy_truck"],
    ["2011 Blue Bird Vision BBCV School Bus", "Blue Bird", "Vision", "bus"],
    [
      "2013 Ford E-450 Super Duty ADA Champion Bus -24 passengers",
      "Ford",
      "E-450",
      "bus",
    ],
    ["2024 AVALON LSZ 2385 VRL PONTOON", "AVALON", "LSZ 2385 VRL", "boat"],
    [
      "2020 YAMAHA WAVE RUNNER VX CRUISER HO",
      "YAMAHA",
      "WAVERUNNER VX",
      "boat",
    ],
    ["2020 Polaris RZR", "Polaris", "RZR", "powersports"],
    [
      "Harley-Davidson Iron XL Sportster",
      "Harley-Davidson",
      "Iron XL",
      "powersports",
    ],
    [
      "2007 Freightliner X-Line Motorhome",
      "Freightliner",
      "X-Line Motorhome",
      "rv",
    ],
    [
      "2021 Cargo Mate Restroom-Shower Trailer",
      "Cargo Mate",
      "CN3C616SA4",
      "trailer",
    ],
    [
      "2010 DOUGLAS TBL400 TOWBARLESS TOW TRACTOR",
      "DOUGLAS",
      "TBL400",
      "equipment",
    ],
    ["2008 Sutphen Shield Pumper", "Sutphen", "Shield Pumper", "heavy_truck"],
    ["2013 F450 Cab Only", "Ford", "F450 Cab Only", "non_vehicle_item"],
  ])("drops %s", (title, make, model, reason) => {
    const r = classifyVehicleScope(gov(title, make, model));
    expect(r.inScope).toBe(false);
    expect(r.reason).toBe(reason);
  });

  it("uses the source vehicle type when given (Copart memberVehicleType)", () => {
    expect(
      classifyVehicleScope({
        title: "2019 YAMAHA",
        make: "Yamaha",
        model: "YZF",
        vehicle_type: "MOTORCYCLE",
      }).inScope,
    ).toBe(false);
  });

  it("does not drop an unrecognised make outside gov surplus", () => {
    expect(
      classifyVehicleScope({
        title: "2020 Greenfire GF1",
        make: "Greenfire",
        model: "GF1",
        source: "independent_dealer",
        source_url: "https://economynj.com/x",
      }).inScope,
    ).toBe(true);
  });

  it("partitions with per-reason counts", () => {
    const { kept, dropped, byReason } = partitionVehicleScope([
      gov("2016 Ford Taurus", "Ford", "Taurus"),
      gov("2017 Mack CHU613", "Mack", "CHU613"),
      gov("2020 Polaris RZR", "Polaris", "RZR"),
    ]);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(2);
    expect(byReason).toEqual({ heavy_truck: 1, powersports: 1 });
  });
});
