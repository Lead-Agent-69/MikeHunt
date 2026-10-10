import { describe, it, expect } from "vitest";
import { isCarOrTruck } from "./vehicle-class";

describe("isCarOrTruck (cars and trucks only)", () => {
  it.each([
    "2020 RAM 2500",
    "2013 Ford F-150",
    "2012 Dodge Grand Caravan",
    "2019 Jeep Grand Cherokee",
    "2014 FORD E350",
    "2016 Ford Super Duty F-250 SRW 4WD SuperCab",
    "2024 Subaru Ascent Premium SUV",
    "2018 Chevrolet Express 3500 Cargo Van",
    "2015 Ford F-550 Box Truck",
    "2017 Isuzu NPR HD",
    "2012 Hyundai Sonata",
  ])("keeps %s", (t) => expect(isCarOrTruck(t)).toBe(true));

  it.each([
    "1983 Cessna U206G, SN: U20606754",
    "Sikorsky UH-60A Blackhawk, SN: 79-23344",
    "2006 Boston Whaler Guardian 19' monohull Vessel",
    "1996 Southwest SGRPSM Military Maintenance Trailer",
    "2000 John Deere 6410 Tractor w/640 Loader and Fork",
    "1974 JI CASE Crane",
    "2016 Polaris Ranger",
    "2015 Toyota 8FGU25 Forklift",
    "2010 Freightliner Cascadia Sleeper",
    "2009 Blue Bird School Bus",
    "2014 Harley-Davidson Motorcycle",
    "1980 UNIVERSAL COUNTER",
    "2008 Bobcat S185 Skid Steer",
    "2011 International Dump Truck",
    "",
  ])("drops %s", (t) => expect(isCarOrTruck(t)).toBe(false));
});
