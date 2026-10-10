import { describe, expect, it } from "vitest";
import { parseDealDocument } from "./deal-document";

const document = {
  vehicle: {
    year: 2020,
    make: "Acura",
    model: "MDX",
    vin: null,
    mileage: null,
  },
  selling_price: null,
  fees: [],
  addons: [],
  taxes: null,
  total_out_the_door: null,
  red_flags: ["Auction bid is not a selling price"],
};
describe("extracted document validation", () => {
  it("retains unknown amounts instead of calculating them", () => {
    expect(parseDealDocument(JSON.stringify(document))).toEqual(document);
  });
  it.each([-1, "3000", null])(
    "rejects invalid line-item amount %s",
    (amount) => {
      expect(() =>
        parseDealDocument(
          JSON.stringify({ ...document, fees: [{ name: "fee", amount }] }),
        ),
      ).toThrow();
    },
  );
  it("rejects incomplete or non-JSON provider output", () => {
    expect(() => parseDealDocument("Not readable")).toThrow();
    expect(() => parseDealDocument('{"vehicle":null}')).toThrow();
  });
});
