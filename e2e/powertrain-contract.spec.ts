import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { assertLocalTarget, localOnly } from "./support/target";
import {
  normalizeVehicleSpec,
  vehicleSpecPredicate,
  VEHICLE_SPEC_OPTIONS,
  type VehicleSpecKey,
} from "../lib/vehicle/spec-filters";

test.describe("reported powertrain database contract", () => {
  localOnly();
  test("database predicates match classification, including fallback and conflicting source reports", async ({}, info) => {
    test.skip(
      info.project.name !== "desktop",
      "One isolated local database verification is sufficient.",
    );
    assertLocalTarget("verify powertrain fixture rows");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname))
      throw new Error("Database fixtures require a local Supabase URL.");
    const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const reports = [
      ["Gasoline", "Automatic 8-speed", "AWD", {}],
      ["Gasoline Electric Hybrid", "e-CVT", "All-Wheel Drive", {}],
      ["Plug-in Hybrid Electric", "Automatic CVT", "FWD", {}],
      ["Battery Electric", "Automatic", "Rear-wheel drive", {}],
      ["Gasoline / E85 Flex Fuel", "6-Spd Manual", "4 x 4", {}],
      ["Diesel", "Automatic Dual-Clutch", "4WD", {}],
      [
        "Gasoline",
        "Automated manual",
        "AWD / FWD",
        { fuelType: "PHEV", transmission: "Manual", drivetrain: "AWD" },
      ],
      [
        "Hydrogen",
        "6-speed",
        "Unknown",
        { fuelType: "Gas", transmission: "Manual", drivetrain: "AWD" },
      ],
      [
        null,
        null,
        null,
        { fuelType: "PHEV", transmission: "DSG", drivetrain: "FWD" },
      ],
      [
        "Unknown",
        "N/A",
        "Not reported",
        { fuelType: "Hybrid", transmission: "CVT", drivetrain: "AWD" },
      ],
      ["Gasoline or Diesel", "PDK", "4WD", {}],
    ] as const;
    const rows = reports.map(
      ([fuel_type, transmission, drivetrain, options], index) => {
        const id = randomUUID();
        return {
          id,
          source: "copart",
          source_deal_id: `local-powertrain-${id}`,
          source_url: `https://example.test/local-qa/${id}`,
          title: `LOCAL QA powertrain fixture ${index}`,
          year: 2020,
          make: "Ford",
          model: "Local QA",
          condition: "clean_title",
          ask_price: 10000,
          active: false,
          fuel_type,
          transmission,
          drivetrain,
          options,
        };
      },
    );
    const ids = rows.map((row) => row.id);
    try {
      const inserted = await db.from("deals").insert(rows);
      expect(inserted.error, "Local fixture insert").toBeNull();
      for (const key of Object.keys(VEHICLE_SPEC_OPTIONS) as VehicleSpecKey[]) {
        const column = {
          fuelType: "fuel_type",
          transmission: "transmission",
          drivetrain: "drivetrain",
        }[key] as "fuel_type" | "transmission" | "drivetrain";
        for (const value of VEHICLE_SPEC_OPTIONS[key]) {
          const actual = await db
            .from("deals")
            .select("id")
            .in("id", ids)
            .or(vehicleSpecPredicate(key, value)!);
          expect(
            actual.error,
            `${key}=${value}: query parses in PostgREST`,
          ).toBeNull();
          const expected = rows
            .filter(
              (row) =>
                normalizeVehicleSpec(
                  key,
                  row[column],
                  (row.options as Record<string, string>)[key],
                ) === value,
            )
            .map((row) => row.id)
            .sort();
          expect(
            actual.data?.map((row) => row.id).sort(),
            `${key}=${value}`,
          ).toEqual(expected);
        }
      }
    } finally {
      const removed = await db.from("deals").delete().in("id", ids);
      expect(
        removed.error,
        "Remove only this test's owned local fixtures",
      ).toBeNull();
      const remaining = await db.from("deals").select("id").in("id", ids);
      expect(remaining.data).toEqual([]);
    }
  });
});
