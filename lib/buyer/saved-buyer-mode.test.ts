import { describe, expect, it } from "vitest";
import {
  isPersonalDeskMode,
  userTypeFromSavedBuyerMode,
} from "./saved-buyer-mode";

describe("saved buyer mode desk", () => {
  it("opens personal and diy as a private buyer, not a dealer desk", () => {
    expect(userTypeFromSavedBuyerMode("personal")).toBe("private");
    expect(userTypeFromSavedBuyerMode("diy")).toBe("private");
    expect(userTypeFromSavedBuyerMode("enthusiast")).toBe("private");
    expect(userTypeFromSavedBuyerMode(undefined)).toBe("private");
    expect(isPersonalDeskMode("personal")).toBe(true);
    expect(isPersonalDeskMode(undefined)).toBe(true);
  });

  it("keeps reseller and dealer on the command desk", () => {
    expect(userTypeFromSavedBuyerMode("reseller")).toBe("dealer");
    expect(userTypeFromSavedBuyerMode("dealer")).toBe("dealer");
    expect(isPersonalDeskMode("dealer")).toBe(false);
  });
});
