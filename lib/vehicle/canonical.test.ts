import { describe, it, expect } from "vitest";
import { titleCaseMake, canonicalModel } from "./canonical";

describe("titleCaseMake", () => {
  it("title-cases common makes", () => {
    expect(titleCaseMake("FORD")).toBe("Ford");
    expect(titleCaseMake("hyundai")).toBe("Hyundai");
    expect(titleCaseMake("JEEP")).toBe("Jeep");
  });
  it("keeps acronyms and special forms", () => {
    expect(titleCaseMake("BMW")).toBe("BMW");
    expect(titleCaseMake("GMC")).toBe("GMC");
    expect(titleCaseMake("MERCEDES-BENZ")).toBe("Mercedes-Benz");
    expect(titleCaseMake("LAND ROVER")).toBe("Land Rover");
    expect(titleCaseMake("chevy")).toBe("Chevrolet");
    expect(titleCaseMake("VW")).toBe("Volkswagen");
  });
  it("handles empty", () => {
    expect(titleCaseMake("")).toBe("");
    expect(titleCaseMake(null)).toBe("");
  });
});

describe("canonicalModel", () => {
  it("collapses whitespace", () => {
    expect(canonicalModel("  F-150   XLT ")).toBe("F-150 XLT");
    expect(canonicalModel(null)).toBe("");
  });
});
