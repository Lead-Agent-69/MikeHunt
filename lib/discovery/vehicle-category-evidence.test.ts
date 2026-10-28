import { describe, expect, it } from "vitest";
import { segmentOf } from "./categorize";
import { rowMatchesBuyerQuery } from "./for-you-rank";

describe("vehicle category evidence", () => {
  it.each([
    ["CFMOTO", "UFORCE"],
    ["Polaris", "Ranger XP"],
    ["Chaparral", "Boat"],
    ["Unknown", "Unknown"],
    [null, null],
  ])("does not assume %s %s is a sedan", (make, model) => {
    // A known non-car brand/model needs more than a common model word.
    const body_class = make === "Polaris" ? "ATV" : undefined;
    expect(rowMatchesBuyerQuery({ make, model, body_class }, "sedan")).toBe(
      false,
    );
  });
  it("retains known sedans without admitting unknown listings", () => {
    expect(segmentOf("Toyota", "Camry")).toBe("sedan");
    expect(segmentOf("Honda", "Accord")).toBe("sedan");
    expect(segmentOf("CFMOTO", "UFORCE")).toBe("other");
  });
  it("uses reported body style ahead of model inference and stale segment tags", () => {
    expect(
      rowMatchesBuyerQuery(
        {
          make: "Honda",
          model: "Civic",
          body_class: "Hatchback/Liftback/Notchback",
          segment: "sedan",
        },
        "sedan",
      ),
    ).toBe(false);
    expect(
      rowMatchesBuyerQuery(
        { make: "Example", model: "Unknown", body_class: "Sedan/Saloon" },
        "sedan",
      ),
    ).toBe(true);
    expect(segmentOf("Ford", "Mustang", "Convertible/Cabriolet")).toBe(
      "convertible",
    );
    expect(segmentOf("Ram", "ProMaster")).toBe("van");
  });
  it("keeps body and electric eligibility independent when evidence supports both", () => {
    const row = {
      make: "Tesla",
      model: "Model Y",
      body_class: "Sport Utility Vehicle (SUV)",
      fuel_type: "Electric",
    };
    expect(rowMatchesBuyerQuery(row, "suv")).toBe(true);
    expect(rowMatchesBuyerQuery(row, "ev")).toBe(true);
    expect(rowMatchesBuyerQuery({ ...row, make: "Ford" }, "Toyota suv")).toBe(
      false,
    );
  });
});
