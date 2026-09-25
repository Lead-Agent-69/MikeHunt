import { describe, it, expect, vi } from "vitest";
import { parseDecode, decodeVin, getRecallCount, parseSafety } from "./nhtsa";

describe("parseDecode", () => {
  it("maps NHTSA fields and infers made-in-USA", () => {
    const d = parseDecode({
      ModelYear: "2003",
      Make: "HONDA",
      Model: "Accord",
      Trim: "EX",
      BodyClass: "Coupe",
      DriveType: "FWD",
      FuelTypePrimary: "Gasoline",
      EngineCylinders: "6",
      DisplacementL: "2.998832712",
      PlantCountry: "UNITED STATES (USA)",
    });
    expect(d.year).toBe(2003);
    expect(d.make).toBe("HONDA");
    expect(d.model).toBe("Accord");
    expect(d.cylinders).toBe(6);
    expect(d.displacementL).toBeCloseTo(3.0, 1);
    expect(d.madeInUsa).toBe(true);
  });

  it("handles empty fields and foreign plant", () => {
    const d = parseDecode({
      Make: "BMW",
      Model: "X5",
      PlantCountry: "GERMANY",
      DisplacementL: "",
    });
    expect(d.year).toBeNull();
    expect(d.displacementL).toBeNull();
    expect(d.madeInUsa).toBe(false);
  });
});

describe("decodeVin", () => {
  it("rejects invalid VINs without fetching", async () => {
    const f = vi.fn();
    expect(await decodeVin("NOTAVIN", f as any)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("decodes a valid VIN", async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        Results: [{ Make: "Honda", Model: "Accord", ModelYear: "2003" }],
      }),
    }));
    const d = await decodeVin("1HGCM82633A004352", f as any);
    expect(d?.make).toBe("Honda");
  });

  it("returns null when make/model don't resolve", async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ Results: [{ Make: "", Model: "" }] }),
    }));
    expect(await decodeVin("1HGCM82633A004352", f as any)).toBeNull();
  });
});

describe("parseSafety", () => {
  it("maps star ratings", () => {
    expect(
      parseSafety({
        OverallRating: "5",
        OverallFrontCrashRating: "4",
        OverallSideCrashRating: "5",
        RolloverRating: "4",
      }),
    ).toEqual({ overall: 5, frontal: 4, side: 5, rollover: 4 });
  });
  it("nulls unrated/out-of-range", () => {
    expect(
      parseSafety({ OverallRating: "Not Rated", RolloverRating: "9" }),
    ).toEqual({
      overall: null,
      frontal: null,
      side: null,
      rollover: null,
    });
  });
});

describe("getRecallCount", () => {
  it("returns the Count", async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ Count: 6 }),
    }));
    expect(await getRecallCount("ford", "mustang", 2019, f as any)).toBe(6);
  });
  it("null on failure", async () => {
    const f = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    expect(await getRecallCount("ford", "mustang", 2019, f as any)).toBeNull();
  });
});
