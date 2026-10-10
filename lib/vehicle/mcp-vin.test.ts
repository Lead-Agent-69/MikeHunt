import { describe, expect, it } from "vitest";
import { sanitizeMcpVin } from "./mcp-vin";

const NOW = new Date("2026-10-10T00:00:00Z");

describe("sanitizeMcpVin (untrusted third-party decode)", () => {
  it("keeps a normal decode, normalized", () => {
    expect(
      sanitizeMcpVin(
        {
          Year: "2016",
          Make: " Ford ",
          Model: "F-250  SD",
          Trim: "XLT",
          extra: "x",
        },
        NOW,
      ),
    ).toEqual({
      year: 2016,
      make: "Ford",
      model: "F-250 SD",
      trim: "XLT",
      engine: null,
      assembly_country: null,
    });
  });

  it("rejects bad years", () => {
    for (const y of [1970, 2030, "20x6", 2016.5, null])
      expect(
        sanitizeMcpVin({ year: y, make: "Ford", model: "F-150" }, NOW),
      ).toBeNull();
  });

  it("rejects injected or oversized make/model", () => {
    expect(
      sanitizeMcpVin({ year: 2016, make: "Ford<script>", model: "F-150" }, NOW),
    ).toBeNull();
    expect(
      sanitizeMcpVin({ year: 2016, make: "Ford", model: "a,b;c" }, NOW),
    ).toBeNull();
    expect(
      sanitizeMcpVin({ year: 2016, make: "F".repeat(41), model: "F-150" }, NOW),
    ).toBeNull();
    expect(
      sanitizeMcpVin({ year: 2016, make: { $ne: 1 }, model: "F-150" }, NOW),
    ).toBeNull();
    expect(sanitizeMcpVin({ year: 2016, make: "Ford" }, NOW)).toBeNull();
  });

  it("drops bad optional fields instead of failing the decode", () => {
    const d = sanitizeMcpVin(
      {
        year: 2016,
        make: "Ford",
        model: "F-150",
        trim: "<b>",
        engine: "5.0L\u0000 V8 <x>",
      },
      NOW,
    );
    expect(d?.trim).toBeNull();
    expect(d?.engine).toBe("5.0L V8 x");
  });

  it("non-objects are null", () => {
    for (const v of [null, "x", 1, [1]])
      expect(sanitizeMcpVin(v, NOW)).toBeNull();
  });
});
