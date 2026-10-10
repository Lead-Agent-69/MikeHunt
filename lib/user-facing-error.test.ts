import { describe, expect, it } from "vitest";
import { userFacingErrorMessage } from "./user-facing-error";

describe("userFacingErrorMessage", () => {
  it("does not expose infrastructure details", () => {
    expect(
      userFacingErrorMessage("PostgREST: relation deals does not exist"),
    ).toBe("We couldn't complete that request. Please try again.");
  });

  it("provides useful recovery for sessions and connectivity", () => {
    expect(userFacingErrorMessage("JWT expired")).toContain("Sign in again");
    expect(userFacingErrorMessage("fetch failed")).toContain("connection");
  });

  it("keeps short, customer-safe validation messages", () => {
    expect(userFacingErrorMessage("Choose at least one vehicle type.")).toBe(
      "Choose at least one vehicle type.",
    );
  });
  it("hides malformed and empty response parser failures", () => {
    for (const error of [
      new SyntaxError("Unexpected end of JSON input"),
      "Failed to execute 'json' on 'Response': Unexpected end of JSON input",
      "Unexpected token '<', HTML is not valid JSON",
    ])
      expect(userFacingErrorMessage(error, "Please retry this analysis.")).toBe(
        "Please retry this analysis.",
      );
  });
});
