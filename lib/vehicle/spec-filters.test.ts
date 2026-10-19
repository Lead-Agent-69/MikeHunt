import { describe, expect, it } from "vitest";
import {
  normalizeVehicleSpec,
  vehicleSpecPredicate,
  type VehicleSpecKey,
} from "./spec-filters";

describe("reported powertrain classification", () => {
  it.each<[VehicleSpecKey, string, string | undefined]>([
    ["fuelType", "Gasoline", "Gas"],
    ["fuelType", "Unleaded petrol", "Gas"],
    ["fuelType", "Gasoline / Electric", "Hybrid"],
    ["fuelType", "Diesel electric hybrid", "Hybrid"],
    ["fuelType", "Plug-in Hybrid Electric (PHEV)", "PHEV"],
    ["fuelType", "HEV", "Hybrid"],
    ["fuelType", "Battery Electric / BEV", "Electric"],
    ["fuelType", "Flex Fuel / Gasoline E85", "Flex fuel"],
    ["fuelType", "Diesel", "Diesel"],
    ["fuelType", "Gasoline or Diesel", undefined],
    ["fuelType", "Hydrogen", undefined],
    ["transmission", "6-Spd Manual", "Manual"],
    ["transmission", "Stick shift", "Manual"],
    ["transmission", "M/T", "Manual"],
    ["transmission", "6MT", "Manual"],
    ["transmission", "6-speed", undefined],
    ["transmission", "8-speed automatic", "Automatic"],
    ["transmission", "Automated Manual / AMT", "Automatic"],
    ["transmission", "Automatic CVT", "CVT"],
    ["transmission", "e-CVT", "CVT"],
    ["transmission", "Automatic Dual Clutch DCT", "DCT"],
    ["transmission", "PDK", "DCT"],
    ["drivetrain", "All-Wheel Drive", "AWD"],
    ["drivetrain", "4 x 4", "4WD"],
    ["drivetrain", "Front wheel drive", "FWD"],
    ["drivetrain", "RWD", "RWD"],
    ["drivetrain", "AWD / FWD", undefined],
  ])("%s: %s → %s", (key, text, expected) => {
    expect(normalizeVehicleSpec(key, text)).toBe(expected);
  });
  it("uses fallback only for missing or explicitly unknown reports", () => {
    for (const primary of [
      null,
      undefined,
      "",
      "Unknown",
      "Not reported",
      "N/A",
    ])
      expect(normalizeVehicleSpec("fuelType", primary, "PHEV")).toBe("PHEV");
    expect(normalizeVehicleSpec("fuelType", "Diesel", "Gasoline")).toBe(
      "Diesel",
    );
    expect(
      normalizeVehicleSpec("fuelType", "Hydrogen", "Gasoline"),
    ).toBeUndefined();
    expect(
      normalizeVehicleSpec("transmission", "6-speed", "Manual"),
    ).toBeUndefined();
  });
  it("rejects arbitrary database filter expressions", () => {
    expect(
      vehicleSpecPredicate("fuelType", "Gas),active.eq.false"),
    ).toBeUndefined();
    expect(vehicleSpecPredicate("transmission", "6-speed")).toBeUndefined();
  });
});
